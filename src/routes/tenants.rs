use axum::{
    extract::{Path, State},
    Json,
};

use crate::{
    error::{AppError, AppResult},
    models::{Tenant, TenantInput},
    AppState,
};

pub async fn list(State(s): State<AppState>) -> AppResult<Json<Vec<Tenant>>> {
    let rows = sqlx::query_as("SELECT * FROM tenants ORDER BY full_name")
        .fetch_all(&s.db)
        .await?;
    Ok(Json(rows))
}

pub async fn create(
    State(s): State<AppState>,
    Json(t): Json<TenantInput>,
) -> AppResult<Json<Tenant>> {
    if t.full_name.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อผู้เช่า".into()));
    }
    let row = sqlx::query_as(
        "INSERT INTO tenants (full_name, phone, email, id_card, note) VALUES (?,?,?,?,?) RETURNING *",
    )
    .bind(t.full_name.trim())
    .bind(&t.phone)
    .bind(&t.email)
    .bind(&t.id_card)
    .bind(&t.note)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
}

pub async fn update(
    State(s): State<AppState>,
    Path(id): Path<i64>,
    Json(t): Json<TenantInput>,
) -> AppResult<Json<Tenant>> {
    let row = sqlx::query_as(
        "UPDATE tenants SET full_name=?, phone=?, email=?, id_card=?, note=? WHERE id=? RETURNING *",
    )
    .bind(t.full_name.trim())
    .bind(&t.phone)
    .bind(&t.email)
    .bind(&t.id_card)
    .bind(&t.note)
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
}

pub async fn delete(State(s): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<()>> {
    let used: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bookings WHERE tenant_id=?")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    if used > 0 {
        return Err(AppError::Conflict("ผู้เช่านี้มีประวัติการจอง ลบไม่ได้".into()));
    }
    sqlx::query("DELETE FROM tenants WHERE id=?")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(()))
}
