use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::Local;
use serde::Deserialize;
use sqlx::SqliteConnection;

use super::validate_in;
use crate::{
    auth::{ensure_tenant, ensure_unit, OrgCtx},
    error::{AppError, AppResult},
    models::{Booking, BookingInput, BookingPatch},
    AppState,
};

const SELECT: &str =
    "SELECT b.*, u.name AS unit_name, p.name AS property_name, t.full_name AS tenant_name
    FROM bookings b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
    JOIN tenants t ON t.id = b.tenant_id";

#[derive(Deserialize)]
pub struct Filter {
    unit_id: Option<i64>,
    property_id: Option<i64>,
    status: Option<String>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(f): Query<Filter>,
) -> AppResult<Json<Vec<Booking>>> {
    let sql = format!(
        "{SELECT} WHERE p.org_id = ?4 AND (?1 IS NULL OR b.unit_id = ?1) AND (?2 IS NULL OR u.property_id = ?2)
           AND (?3 IS NULL OR b.status = ?3)
         ORDER BY b.start_date DESC"
    );
    let rows = sqlx::query_as(&sql)
        .bind(f.unit_id)
        .bind(f.property_id)
        .bind(f.status)
        .bind(ctx.org_id)
        .fetch_all(&s.db)
        .await?;
    Ok(Json(rows))
}

async fn fetch(conn: &mut SqliteConnection, id: i64) -> AppResult<Booking> {
    Ok(sqlx::query_as(&format!("{SELECT} WHERE b.id = ?"))
        .bind(id)
        .fetch_one(conn)
        .await?)
}

/// ปรับสถานะห้องให้สอดคล้องกับการจองที่ยังมีผลอยู่
pub(crate) async fn sync_unit_status(conn: &mut SqliteConnection, unit_id: i64) -> AppResult<()> {
    sqlx::query(
        "UPDATE units SET status = CASE
            WHEN EXISTS (SELECT 1 FROM bookings WHERE unit_id = ?1 AND status = 'active') THEN 'occupied'
            WHEN EXISTS (SELECT 1 FROM bookings WHERE unit_id = ?1 AND status = 'reserved') THEN 'reserved'
            WHEN status = 'maintenance' THEN 'maintenance'
            ELSE 'vacant' END
         WHERE id = ?1",
    )
    .bind(unit_id)
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(b): Json<BookingInput>,
) -> AppResult<Json<Booking>> {
    validate_in("kind", &b.kind, &["lease", "short_stay"])?;
    if b.kind == "short_stay" {
        ctx.require_feature(ctx.features.short_stay, "การจองรายวัน")?;
    }
    ensure_unit(&s.db, ctx.org_id, b.unit_id).await?;
    ensure_tenant(&s.db, ctx.org_id, b.tenant_id).await?;
    if b.kind == "short_stay" && b.end_date.is_none() {
        return Err(AppError::BadRequest("การจองรายวันต้องระบุวันเช็คเอาท์".into()));
    }
    if matches!(b.end_date, Some(end) if end <= b.start_date) {
        return Err(AppError::BadRequest("วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น".into()));
    }

    let mut tx = s.db.begin().await?;
    let (rent, daily, deposit, unit_status): (f64, f64, f64, String) =
        sqlx::query_as("SELECT rent_monthly, rate_daily, deposit, status FROM units WHERE id = ?")
            .bind(b.unit_id)
            .fetch_one(&mut *tx)
            .await?;
    if unit_status == "maintenance" {
        return Err(AppError::Conflict("ห้องนี้อยู่ระหว่างปิดปรับปรุง".into()));
    }

    let overlap: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM bookings WHERE unit_id = ? AND status IN ('reserved','active')
           AND start_date < ? AND COALESCE(end_date, '9999-12-31') > ? LIMIT 1",
    )
    .bind(b.unit_id)
    .bind(
        b.end_date
            .map(|d| d.to_string())
            .unwrap_or_else(|| "9999-12-31".into()),
    )
    .bind(b.start_date)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(other) = overlap {
        return Err(AppError::Conflict(format!("ช่วงวันที่ทับซ้อนกับการจอง #{other}")));
    }

    let is_lease = b.kind == "lease";
    let status = if b.start_date <= Local::now().date_naive() {
        "active"
    } else {
        "reserved"
    };
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO bookings (unit_id, tenant_id, kind, start_date, end_date, price, deposit_amount, status, source)
         VALUES (?,?,?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(b.unit_id)
    .bind(b.tenant_id)
    .bind(&b.kind)
    .bind(b.start_date)
    .bind(b.end_date)
    .bind(b.price.unwrap_or(if is_lease { rent } else { daily }))
    .bind(b.deposit_amount.unwrap_or(if is_lease { deposit } else { 0.0 }))
    .bind(status)
    .bind(b.source.as_deref().unwrap_or("direct"))
    .fetch_one(&mut *tx)
    .await?;

    sync_unit_status(&mut tx, b.unit_id).await?;
    let booking = fetch(&mut tx, id).await?;
    tx.commit().await?;
    Ok(Json(booking))
}

pub async fn patch(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(p): Json<BookingPatch>,
) -> AppResult<Json<Booking>> {
    let unit_id: i64 = sqlx::query_scalar("SELECT unit_id FROM bookings WHERE id = ?")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    ensure_unit(&s.db, ctx.org_id, unit_id).await?;
    if let Some(st) = &p.status {
        validate_in(
            "status",
            st,
            &["reserved", "active", "completed", "cancelled"],
        )?;
    }
    if let Some(ds) = &p.deposit_status {
        validate_in(
            "deposit_status",
            ds,
            &["pending", "paid", "refunded", "forfeited"],
        )?;
    }
    let mut tx = s.db.begin().await?;
    let unit_id: i64 = sqlx::query_scalar(
        "UPDATE bookings SET status = COALESCE(?, status), deposit_status = COALESCE(?, deposit_status)
         WHERE id = ? RETURNING unit_id",
    )
    .bind(&p.status)
    .bind(&p.deposit_status)
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    sync_unit_status(&mut tx, unit_id).await?;
    let booking = fetch(&mut tx, id).await?;
    tx.commit().await?;
    Ok(Json(booking))
}
