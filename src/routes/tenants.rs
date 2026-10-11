use axum::{
    extract::{Path, State},
    Json,
};
use rand::RngCore;
use serde_json::{json, Value};

use crate::{
    auth::{ensure_tenant, OrgCtx, Role},
    error::{AppError, AppResult},
    models::{Tenant, TenantInput},
    AppState,
};

pub(crate) const COLUMNS: &str =
    "id, full_name, phone, email, id_card, note, tax_id, address, branch_code, portal_token,
     line_user_id IS NOT NULL AS line_linked, line_display_name, line_linked_at,
     consent_at, consent_source, anonymized_at, nationality, gender, birth_date, arrival_date, visa_type,
     visa_expiry, created_at";

/// ค่าเลขบัตรที่ส่งมาแก้ไข: ค่าที่ถูกปิดบัง (มี •) ถือว่าไม่เปลี่ยน
fn id_card_input(v: &Option<String>) -> Option<String> {
    v.as_deref()
        .filter(|v| !v.contains('•'))
        .map(|v| v.trim().to_string())
}

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
    if let Some(n) = t.nationality.as_deref().map(str::trim) {
        if !n.is_empty() && (n.len() != 2 || !n.chars().all(|c| c.is_ascii_alphabetic())) {
            return Err(AppError::BadRequest(
                "สัญชาติต้องเป็นรหัสประเทศ 2 ตัวอักษร เช่น US, CN, JP".into(),
            ));
        }
    }
    if let Some(g) = t.gender.as_deref() {
        super::validate_in("gender", g, &["", "M", "F"])?;
    }
    for (v, label) in [
        (&t.birth_date, "วันเกิด"),
        (&t.arrival_date, "วันที่เดินทางเข้า"),
        (&t.visa_expiry, "วันครบกำหนดวีซ่า"),
    ] {
        if let Some(d) = v.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
            if d.parse::<chrono::NaiveDate>().is_err() {
                return Err(AppError::BadRequest(format!("{label}ไม่ถูกต้อง")));
            }
        }
    }
    Ok(())
}

/// ค่าที่ส่งมา: None = ไม่เปลี่ยน, "" = ล้าง (ใช้กับคอลัมน์ที่เป็น NULL ได้)
fn opt_date(v: &Option<String>) -> (bool, Option<String>) {
    match v.as_deref().map(str::trim) {
        None => (false, None),
        Some("") => (true, None),
        Some(d) => (true, Some(d.to_string())),
    }
}

/// บันทึกข้อมูลคนต่างชาติ (แยกจาก insert/update หลัก เพราะเป็นค่าที่ไม่บังคับส่ง)
async fn save_foreign_fields(s: &AppState, id: i64, t: &TenantInput) -> AppResult<()> {
    let (set_birth, birth) = opt_date(&t.birth_date);
    let (set_arrival, arrival) = opt_date(&t.arrival_date);
    let (set_visa, visa) = opt_date(&t.visa_expiry);
    sqlx::query(
        "UPDATE tenants SET nationality = COALESCE(?, nationality), gender = COALESCE(?, gender),
            visa_type = COALESCE(?, visa_type),
            birth_date = CASE WHEN ? THEN ? ELSE birth_date END,
            arrival_date = CASE WHEN ? THEN ? ELSE arrival_date END,
            visa_expiry = CASE WHEN ? THEN ? ELSE visa_expiry END
         WHERE id = ?",
    )
    .bind(t.nationality.as_deref().map(|n| n.trim().to_uppercase()))
    .bind(t.gender.as_deref())
    .bind(t.visa_type.as_deref().map(str::trim))
    .bind(set_birth)
    .bind(birth)
    .bind(set_arrival)
    .bind(arrival)
    .bind(set_visa)
    .bind(visa)
    .bind(id)
    .execute(&s.db)
    .await?;
    Ok(())
}

async fn reload(s: &AppState, id: i64) -> AppResult<Tenant> {
    Ok(
        sqlx::query_as(&format!("SELECT {COLUMNS} FROM tenants WHERE id = ?"))
            .bind(id)
            .fetch_one(&s.db)
            .await?,
    )
}

pub async fn list(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Vec<Tenant>>> {
    let rows = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM tenants WHERE org_id = ? ORDER BY full_name"
    ))
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    let reveal = ctx.role >= Role::Admin;
    let rows: Vec<Tenant> = rows;
    Ok(Json(rows.into_iter().map(|t| t.masked(reveal)).collect()))
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(t): Json<TenantInput>,
) -> AppResult<Json<Tenant>> {
    validate(&t)?;
    let row = sqlx::query_as(&format!(
        "INSERT INTO tenants (org_id, full_name, phone, email, id_card, note, tax_id, address, branch_code, portal_token,
            consent_at, consent_source)
         VALUES (?,?,?,?,?,?,?,?,?,?, CASE WHEN ? THEN datetime('now') END, CASE WHEN ? THEN 'staff' END)
         RETURNING {COLUMNS}"
    ))
    .bind(ctx.org_id)
    .bind(t.full_name.trim())
    .bind(&t.phone)
    .bind(&t.email)
    .bind(id_card_input(&t.id_card).unwrap_or_default())
    .bind(&t.note)
    .bind(t.tax_id.trim())
    .bind(&t.address)
    .bind(t.branch_code.trim())
    .bind(new_portal_token())
    .bind(t.consent_obtained == Some(true))
    .bind(t.consent_obtained == Some(true))
    .fetch_one(&s.db)
    .await?;
    let row: Tenant = row;
    save_foreign_fields(&s, row.id, &t).await?;
    Ok(Json(
        reload(&s, row.id).await?.masked(ctx.role >= Role::Admin),
    ))
}

pub async fn update(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(t): Json<TenantInput>,
) -> AppResult<Json<Tenant>> {
    ensure_tenant(&s.db, ctx.org_id, id).await?;
    validate(&t)?;
    let anonymized: Option<String> =
        sqlx::query_scalar("SELECT anonymized_at FROM tenants WHERE id = ?")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    if anonymized.is_some() {
        return Err(AppError::Conflict(
            "ผู้เช่านี้ถูกลบข้อมูลส่วนบุคคลแล้ว แก้ไขไม่ได้".into(),
        ));
    }
    let row = sqlx::query_as(&format!(
        "UPDATE tenants SET full_name=?, phone=?, email=?, id_card=COALESCE(?, id_card), note=?, tax_id=?, address=?,
            branch_code=?,
            consent_at = CASE WHEN ? AND consent_at IS NULL THEN datetime('now') ELSE consent_at END,
            consent_source = CASE WHEN ? AND consent_at IS NULL THEN 'staff' ELSE consent_source END
         WHERE id=? RETURNING {COLUMNS}"
    ))
    .bind(t.full_name.trim())
    .bind(&t.phone)
    .bind(&t.email)
    .bind(id_card_input(&t.id_card))
    .bind(&t.note)
    .bind(t.tax_id.trim())
    .bind(&t.address)
    .bind(t.branch_code.trim())
    .bind(t.consent_obtained == Some(true))
    .bind(t.consent_obtained == Some(true))
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    let _: Tenant = row;
    save_foreign_fields(&s, id, &t).await?;
    Ok(Json(reload(&s, id).await?.masked(ctx.role >= Role::Admin)))
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
    crate::audit::record(&s.db, &ctx, "tenant.portal_token", "tenant", Some(id), None).await;
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
