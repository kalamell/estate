use axum::{
    extract::{Path, State},
    Json,
};
use rand::RngCore;
use serde_json::{json, Value};

use crate::{
    auth::{ensure_tenant, OrgCtx},
    error::{AppError, AppResult},
    models::{Tenant, TenantInput},
    AppState,
};

const COLUMNS: &str =
    "id, full_name, phone, email, id_card, note, tax_id, address, branch_code, portal_token, created_at";

/// โทเค็นสุ่ม 128 บิตสำหรับลิงก์พอร์ทัลผู้เช่า
pub fn new_portal_token() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn validate(t: &TenantInput) -> AppResult<()> {
    if t.full_name.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อผู้เช่า".into()));
    }
    let tax = t.tax_id.trim();
    if !tax.is_empty() && (tax.len() != 13 || !tax.chars().all(|c| c.is_ascii_digit())) {
        return Err(AppError::BadRequest(
            "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก".into(),
        ));
    }
    Ok(())
}

pub async fn list(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Vec<Tenant>>> {
    let rows = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM tenants WHERE org_id = ? ORDER BY full_name"
    ))
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(t): Json<TenantInput>,
) -> AppResult<Json<Tenant>> {
    validate(&t)?;
    let row = sqlx::query_as(&format!(
        "INSERT INTO tenants (org_id, full_name, phone, email, id_card, note, tax_id, address, branch_code, portal_token)
         VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING {COLUMNS}"
    ))
    .bind(ctx.org_id)
    .bind(t.full_name.trim())
    .bind(&t.phone)
    .bind(&t.email)
    .bind(&t.id_card)
    .bind(&t.note)
    .bind(t.tax_id.trim())
    .bind(&t.address)
    .bind(t.branch_code.trim())
    .bind(new_portal_token())
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
}

pub async fn update(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(t): Json<TenantInput>,
) -> AppResult<Json<Tenant>> {
    ensure_tenant(&s.db, ctx.org_id, id).await?;
    validate(&t)?;
    let row = sqlx::query_as(&format!(
        "UPDATE tenants SET full_name=?, phone=?, email=?, id_card=?, note=?, tax_id=?, address=?, branch_code=?
         WHERE id=? RETURNING {COLUMNS}"
    ))
    .bind(t.full_name.trim())
    .bind(&t.phone)
    .bind(&t.email)
    .bind(&t.id_card)
    .bind(&t.note)
    .bind(t.tax_id.trim())
    .bind(&t.address)
    .bind(t.branch_code.trim())
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
}

/// สร้างลิงก์พอร์ทัลใหม่ (ลิงก์เดิมใช้ไม่ได้ทันที)
pub async fn regenerate_portal(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ensure_tenant(&s.db, ctx.org_id, id).await?;
    let token = new_portal_token();
    sqlx::query("UPDATE tenants SET portal_token = ? WHERE id = ?")
        .bind(&token)
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({ "portal_token": token })))
}

pub async fn delete(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<()>> {
    ensure_tenant(&s.db, ctx.org_id, id).await?;
    let used: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bookings WHERE tenant_id = ?")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    if used > 0 {
        return Err(AppError::Conflict("ผู้เช่านี้มีประวัติการจอง ลบไม่ได้".into()));
    }
    sqlx::query("DELETE FROM tenants WHERE id = ?")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(()))
}
