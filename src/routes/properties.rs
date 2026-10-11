use axum::{
    extract::{Path, State},
    Json,
};

use super::validate_in;
use crate::{
    auth::OrgCtx,
    error::{AppError, AppResult},
    models::{Property, PropertyInput, PROPERTY_KINDS},
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
    Ok(())
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
        "INSERT INTO properties (org_id, name, kind, address, lat, lng, electric_rate, water_rate, promptpay_id)
         VALUES (?,?,?,?,?,?,?,?,?) RETURNING *",
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
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
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
            electric_rate=COALESCE(?, electric_rate), water_rate=COALESCE(?, water_rate), promptpay_id=?
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
    .bind(id)
    .bind(ctx.org_id)
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
