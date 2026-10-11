use axum::{
    extract::{Path, State},
    Json,
};

use super::validate_in;
use crate::{
    auth::OrgCtx,
    error::{AppError, AppResult},
    models::{Property, PropertyInput, LATE_FEE_TYPES, PROPERTY_KINDS},
    AppState,
};

pub async fn list(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Vec<Property>>> {
    let rows = sqlx::query_as("SELECT * FROM properties WHERE org_id = ? ORDER BY id")
        .bind(ctx.org_id)
        .fetch_all(&s.db)
        .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Property>> {
    let row = sqlx::query_as("SELECT * FROM properties WHERE id = ? AND org_id = ?")
        .bind(id)
        .bind(ctx.org_id)
        .fetch_one(&s.db)
        .await?;
    Ok(Json(row))
}

fn check_input(ctx: &OrgCtx, p: &PropertyInput) -> AppResult<()> {
    ctx.require_admin()?;
    validate_in("kind", &p.kind, PROPERTY_KINDS)?;
    if p.kind == "short_stay" {
        ctx.require_feature(ctx.features.short_stay, "ห้องพักรายวัน")?;
    }
    if p.name.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อโครงการ".into()));
    }
    if let Some(t) = &p.late_fee_type {
        validate_in("late_fee_type", t, LATE_FEE_TYPES)?;
    }
    if p.late_fee_amount.unwrap_or(0.0) < 0.0 || p.late_fee_grace_days.unwrap_or(0) < 0 {
        return Err(AppError::BadRequest("ค่าปรับและจำนวนวันผ่อนผันต้องไม่ติดลบ".into()));
    }
    if p.booking_enabled == Some(true) {
        ctx.require_feature(ctx.features.short_stay, "หน้าจองออนไลน์")?;
        let slug = p.booking_slug.as_deref().unwrap_or_default();
        if !super::stay::valid_slug(slug) {
            return Err(AppError::BadRequest(
                "ชื่อลิงก์หน้าจองต้องเป็น a-z, 0-9 หรือ - ยาว 3–40 ตัว".into(),
            ));
        }
    }
    if matches!(p.min_nights, Some(n) if !(1..=90).contains(&n))
        || matches!(p.deposit_percent, Some(d) if !(0.0..=100.0).contains(&d))
    {
        return Err(AppError::BadRequest(
            "จำนวนคืนขั้นต่ำหรือเปอร์เซ็นต์มัดจำไม่ถูกต้อง".into(),
        ));
    }
    for t in [&p.check_in_time, &p.check_out_time].into_iter().flatten() {
        if chrono::NaiveTime::parse_from_str(t, "%H:%M").is_err() {
            return Err(AppError::BadRequest(
                "เวลาเช็คอิน/เช็คเอาท์ต้องอยู่ในรูปแบบ HH:MM".into(),
            ));
        }
    }
    Ok(())
}

/// ตั้งค่าหน้าจองออนไลน์ (ไม่ส่งมา = ไม่เปลี่ยน, slug ว่าง = ยกเลิก)
async fn apply_booking_settings(s: &AppState, id: i64, p: &PropertyInput) -> AppResult<Property> {
    let slug = p.booking_slug.as_deref().map(|v| v.trim().to_lowercase());
    sqlx::query_as(
        "UPDATE properties SET booking_enabled = COALESCE(?, booking_enabled),
            booking_slug = CASE WHEN ? THEN NULLIF(?, '') ELSE booking_slug END,
            booking_intro = COALESCE(?, booking_intro), check_in_time = COALESCE(?, check_in_time),
            check_out_time = COALESCE(?, check_out_time), min_nights = COALESCE(?, min_nights),
            deposit_percent = COALESCE(?, deposit_percent)
         WHERE id = ? RETURNING *",
    )
    .bind(p.booking_enabled)
    .bind(slug.is_some())
    .bind(slug)
    .bind(&p.booking_intro)
    .bind(&p.check_in_time)
    .bind(&p.check_out_time)
    .bind(p.min_nights)
    .bind(p.deposit_percent)
    .bind(id)
    .fetch_one(&s.db)
    .await
    .map_err(|e| match AppError::from(e) {
        AppError::Conflict(_) => AppError::Conflict("ชื่อลิงก์หน้าจองนี้ถูกใช้แล้ว".into()),
        other => other,
    })
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(p): Json<PropertyInput>,
) -> AppResult<Json<Property>> {
    check_input(&ctx, &p)?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM properties WHERE org_id = ?")
        .bind(ctx.org_id)
        .fetch_one(&s.db)
        .await?;
    if count >= ctx.max_properties {
        return Err(OrgCtx::limit_reached("จำนวนโครงการ", ctx.max_properties));
    }
    let row = sqlx::query_as(
        "INSERT INTO properties (org_id, name, kind, address, lat, lng, electric_rate, water_rate, promptpay_id,
            late_fee_type, late_fee_amount, late_fee_grace_days)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *",
    )
    .bind(ctx.org_id)
    .bind(p.name.trim())
    .bind(&p.kind)
    .bind(&p.address)
    .bind(p.lat)
    .bind(p.lng)
    .bind(p.electric_rate.unwrap_or(8.0))
    .bind(p.water_rate.unwrap_or(18.0))
    .bind(&p.promptpay_id)
    .bind(p.late_fee_type.as_deref().unwrap_or("none"))
    .bind(p.late_fee_amount.unwrap_or(0.0))
    .bind(p.late_fee_grace_days.unwrap_or(0))
    .fetch_one(&s.db)
    .await?;
    let row: Property = row;
    Ok(Json(apply_booking_settings(&s, row.id, &p).await?))
}

pub async fn update(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(p): Json<PropertyInput>,
) -> AppResult<Json<Property>> {
    check_input(&ctx, &p)?;
    let row = sqlx::query_as(
        "UPDATE properties SET name=?, kind=?, address=?, lat=?, lng=?,
            electric_rate=COALESCE(?, electric_rate), water_rate=COALESCE(?, water_rate), promptpay_id=?,
            late_fee_type=COALESCE(?, late_fee_type), late_fee_amount=COALESCE(?, late_fee_amount),
            late_fee_grace_days=COALESCE(?, late_fee_grace_days)
         WHERE id=? AND org_id=? RETURNING *",
    )
    .bind(p.name.trim())
    .bind(&p.kind)
    .bind(&p.address)
    .bind(p.lat)
    .bind(p.lng)
    .bind(p.electric_rate)
    .bind(p.water_rate)
    .bind(&p.promptpay_id)
    .bind(&p.late_fee_type)
    .bind(p.late_fee_amount)
    .bind(p.late_fee_grace_days)
    .bind(id)
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    let row: Property = row;
    Ok(Json(apply_booking_settings(&s, row.id, &p).await?))
}

pub async fn delete(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<()>> {
    ctx.require_admin()?;
    let r = sqlx::query("DELETE FROM properties WHERE id = ? AND org_id = ?")
        .bind(id)
        .bind(ctx.org_id)
        .execute(&s.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(()))
}
