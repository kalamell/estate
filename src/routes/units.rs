use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;

use super::validate_in;
use crate::{
    auth::{ensure_property, ensure_unit, OrgCtx},
    error::AppResult,
    models::{Unit, UnitInput, UNIT_STATUSES},
    AppState,
};

#[derive(Deserialize)]
pub struct Filter {
    property_id: Option<i64>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(f): Query<Filter>,
) -> AppResult<Json<Vec<Unit>>> {
    let rows = sqlx::query_as(
        "SELECT u.* FROM units u JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR u.property_id = ?2)
         ORDER BY u.property_id, u.floor, u.name",
    )
    .bind(ctx.org_id)
    .bind(f.property_id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Unit>> {
    ensure_unit(&s.db, ctx.org_id, id).await?;
    let row = sqlx::query_as("SELECT * FROM units WHERE id = ?")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    Ok(Json(row))
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(u): Json<UnitInput>,
) -> AppResult<Json<Unit>> {
    ctx.require_admin()?;
    ensure_property(&s.db, ctx.org_id, u.property_id).await?;
    let status = u.status.as_deref().unwrap_or("vacant");
    validate_in("status", status, UNIT_STATUSES)?;
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM units u JOIN properties p ON p.id = u.property_id WHERE p.org_id = ?",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    if count >= ctx.max_units {
        return Err(crate::auth::OrgCtx::limit_reached(
            "จำนวนห้อง",
            ctx.max_units,
        ));
    }
    let row = sqlx::query_as(
        "INSERT INTO units (property_id, name, floor, rent_monthly, rate_daily, deposit, status,
                            width, length, height, layout, extra_charges, note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *",
    )
    .bind(u.property_id)
    .bind(&u.name)
    .bind(u.floor.unwrap_or(1))
    .bind(u.rent_monthly.unwrap_or(0.0))
    .bind(u.rate_daily.unwrap_or(0.0))
    .bind(u.deposit.unwrap_or(0.0))
    .bind(status)
    .bind(u.width.unwrap_or(4.0))
    .bind(u.length.unwrap_or(6.0))
    .bind(u.height.unwrap_or(2.7))
    .bind(sqlx::types::Json(u.layout.unwrap_or_default()))
    .bind(sqlx::types::Json(u.extra_charges.unwrap_or_default()))
    .bind(u.note.unwrap_or_default())
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
}

pub async fn update(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(u): Json<UnitInput>,
) -> AppResult<Json<Unit>> {
    ensure_unit(&s.db, ctx.org_id, id).await?;
    if let Some(st) = &u.status {
        validate_in("status", st, UNIT_STATUSES)?;
    }
    let row = sqlx::query_as(
        "UPDATE units SET name=?, floor=COALESCE(?, floor), rent_monthly=COALESCE(?, rent_monthly),
            rate_daily=COALESCE(?, rate_daily), deposit=COALESCE(?, deposit), status=COALESCE(?, status),
            width=COALESCE(?, width), length=COALESCE(?, length), height=COALESCE(?, height),
            layout=COALESCE(?, layout), extra_charges=COALESCE(?, extra_charges), note=COALESCE(?, note)
         WHERE id=? RETURNING *",
    )
    .bind(&u.name)
    .bind(u.floor)
    .bind(u.rent_monthly)
    .bind(u.rate_daily)
    .bind(u.deposit)
    .bind(&u.status)
    .bind(u.width)
    .bind(u.length)
    .bind(u.height)
    .bind(u.layout.map(sqlx::types::Json))
    .bind(u.extra_charges.map(sqlx::types::Json))
    .bind(&u.note)
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<()>> {
    ctx.require_admin()?;
    ensure_unit(&s.db, ctx.org_id, id).await?;
    sqlx::query("DELETE FROM units WHERE id = ?")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(()))
}
