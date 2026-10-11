//! หลังบ้านเจ้าของแพลตฟอร์ม: แพ็กเกจ, องค์กรลูกค้า, ผู้ใช้

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::validate_in;
use crate::{
    auth::SuperAdmin,
    error::{AppError, AppResult},
    models::{Package, PackageInput, ORG_STATUSES},
    AppState,
};

pub async fn stats(State(s): State<AppState>, _: SuperAdmin) -> AppResult<Json<Value>> {
    let (orgs, active, trial, suspended): (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(status = 'active'), 0), COALESCE(SUM(status = 'trial'), 0),
                COALESCE(SUM(status IN ('suspended','cancelled')), 0) FROM organizations",
    )
    .fetch_one(&s.db)
    .await?;
    let (users, properties, units): (i64, i64, i64) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM users), (SELECT COUNT(*) FROM properties), (SELECT COUNT(*) FROM units)",
    )
    .fetch_one(&s.db)
    .await?;
    let mrr: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(p.price_monthly), 0.0) FROM organizations o JOIN packages p ON p.id = o.package_id
         WHERE o.status = 'active'",
    )
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({
        "orgs": orgs, "active_orgs": active, "trial_orgs": trial, "suspended_orgs": suspended,
        "users": users, "properties": properties, "units": units, "mrr": mrr,
    })))
}

// ---------- packages ----------

const PACKAGE_SELECT: &str =
    "SELECT p.*, (SELECT COUNT(*) FROM organizations o WHERE o.package_id = p.id) AS org_count
    FROM packages p";

pub async fn packages(State(s): State<AppState>, _: SuperAdmin) -> AppResult<Json<Vec<Package>>> {
    let rows = sqlx::query_as(&format!("{PACKAGE_SELECT} ORDER BY p.sort_order, p.id"))
        .fetch_all(&s.db)
        .await?;
    Ok(Json(rows))
}

fn validate_package(p: &PackageInput) -> AppResult<()> {
    if p.name.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อแพ็กเกจ".into()));
    }
    if p.price_monthly < 0.0
        || p.price_yearly < 0.0
        || p.max_properties < 1
        || p.max_units < 1
        || p.max_members < 1
    {
        return Err(AppError::BadRequest(
            "ราคาและขีดจำกัดต้องไม่ติดลบ และขีดจำกัดอย่างน้อย 1".into(),
        ));
    }
    Ok(())
}

async fn save_package(s: &AppState, id: Option<i64>, p: PackageInput) -> AppResult<Package> {
    validate_package(&p)?;
    let mut tx = s.db.begin().await?;
    if p.is_default {
        sqlx::query("UPDATE packages SET is_default = 0")
            .execute(&mut *tx)
            .await?;
    }
    let sql = match id {
        Some(_) => {
            "UPDATE packages SET name=?, description=?, price_monthly=?, price_yearly=?, max_properties=?, max_units=?,
                max_members=?, features=?, is_active=?, is_default=?, sort_order=? WHERE id=? RETURNING id"
        }
        None => {
            "INSERT INTO packages (name, description, price_monthly, price_yearly, max_properties, max_units, max_members,
                features, is_active, is_default, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id"
        }
    };
    let mut q = sqlx::query_scalar::<_, i64>(sql)
        .bind(p.name.trim())
        .bind(&p.description)
        .bind(p.price_monthly)
        .bind(p.price_yearly)
        .bind(p.max_properties)
        .bind(p.max_units)
        .bind(p.max_members)
        .bind(sqlx::types::Json(&p.features))
        .bind(p.is_active)
        .bind(p.is_default)
        .bind(p.sort_order);
    if let Some(id) = id {
        q = q.bind(id);
    }
    let id = q.fetch_one(&mut *tx).await?;
    tx.commit().await?;
    Ok(sqlx::query_as(&format!("{PACKAGE_SELECT} WHERE p.id = ?"))
        .bind(id)
        .fetch_one(&s.db)
        .await?)
}

pub async fn create_package(
    State(s): State<AppState>,
    _: SuperAdmin,
    Json(p): Json<PackageInput>,
) -> AppResult<Json<Package>> {
    Ok(Json(save_package(&s, None, p).await?))
}

pub async fn update_package(
    State(s): State<AppState>,
    _: SuperAdmin,
    Path(id): Path<i64>,
    Json(p): Json<PackageInput>,
) -> AppResult<Json<Package>> {
    Ok(Json(save_package(&s, Some(id), p).await?))
}

pub async fn delete_package(
    State(s): State<AppState>,
    _: SuperAdmin,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    let used: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM organizations WHERE package_id = ?")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    if used > 0 {
        return Err(AppError::Conflict(format!(
            "มี {used} องค์กรใช้แพ็กเกจนี้อยู่ — ย้ายองค์กรก่อน หรือปิดการใช้งานแทนการลบ"
        )));
    }
    sqlx::query("DELETE FROM packages WHERE id = ?")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

// ---------- organizations ----------

#[derive(Serialize, sqlx::FromRow)]
pub struct OrgAdminRow {
    id: i64,
    name: String,
    owner_name: Option<String>,
    owner_email: Option<String>,
    package_id: i64,
    package_name: String,
    status: String,
    ends_at: Option<String>,
    properties: i64,
    units: i64,
    members: i64,
    created_at: String,
}

const ORG_SELECT: &str = "SELECT o.id, o.name, u.name AS owner_name, u.email AS owner_email, o.package_id,
        p.name AS package_name, o.status, o.ends_at,
        (SELECT COUNT(*) FROM properties pr WHERE pr.org_id = o.id) AS properties,
        (SELECT COUNT(*) FROM units un JOIN properties pr ON pr.id = un.property_id WHERE pr.org_id = o.id) AS units,
        (SELECT COUNT(*) FROM org_members mm WHERE mm.org_id = o.id) AS members,
        o.created_at
    FROM organizations o JOIN packages p ON p.id = o.package_id
    LEFT JOIN org_members m ON m.org_id = o.id AND m.role = 'owner'
    LEFT JOIN users u ON u.id = m.user_id";

pub async fn orgs(State(s): State<AppState>, _: SuperAdmin) -> AppResult<Json<Vec<OrgAdminRow>>> {
    let rows = sqlx::query_as(&format!(
        "{ORG_SELECT} GROUP BY o.id ORDER BY o.created_at DESC"
    ))
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct OrgPatch {
    package_id: Option<i64>,
    status: Option<String>,
    /// ส่ง `null` เพื่อล้างวันหมดอายุ, ไม่ส่ง = ไม่เปลี่ยน
    #[serde(default, deserialize_with = "double_option")]
    ends_at: Option<Option<NaiveDate>>,
}

fn double_option<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

pub async fn update_org(
    State(s): State<AppState>,
    _: SuperAdmin,
    Path(id): Path<i64>,
    Json(p): Json<OrgPatch>,
) -> AppResult<Json<OrgAdminRow>> {
    if let Some(st) = &p.status {
        validate_in("status", st, ORG_STATUSES)?;
    }
    let mut tx = s.db.begin().await?;
    sqlx::query("UPDATE organizations SET package_id = COALESCE(?, package_id), status = COALESCE(?, status) WHERE id = ?")
        .bind(p.package_id)
        .bind(&p.status)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if let Some(ends_at) = p.ends_at {
        sqlx::query("UPDATE organizations SET ends_at = ? WHERE id = ?")
            .bind(ends_at)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    let row = sqlx::query_as(&format!("{ORG_SELECT} WHERE o.id = ? GROUP BY o.id"))
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    Ok(Json(row))
}

// ---------- users ----------

#[derive(Serialize, sqlx::FromRow)]
pub struct UserAdminRow {
    id: i64,
    name: String,
    email: String,
    is_super_admin: bool,
    is_active: bool,
    org_count: i64,
    created_at: String,
}

const USER_SELECT: &str = "SELECT u.id, u.name, u.email, u.is_super_admin, u.is_active,
        (SELECT COUNT(*) FROM org_members m WHERE m.user_id = u.id) AS org_count, u.created_at
    FROM users u";

pub async fn users(State(s): State<AppState>, _: SuperAdmin) -> AppResult<Json<Vec<UserAdminRow>>> {
    let rows = sqlx::query_as(&format!("{USER_SELECT} ORDER BY u.created_at DESC"))
        .fetch_all(&s.db)
        .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct UserPatch {
    is_super_admin: Option<bool>,
    is_active: Option<bool>,
}

pub async fn update_user(
    State(s): State<AppState>,
    SuperAdmin(me): SuperAdmin,
    Path(id): Path<i64>,
    Json(p): Json<UserPatch>,
) -> AppResult<Json<UserAdminRow>> {
    if id == me.id && (p.is_super_admin == Some(false) || p.is_active == Some(false)) {
        return Err(AppError::BadRequest(
            "ไม่สามารถถอดสิทธิ์หรือปิดบัญชีของตัวเองได้".into(),
        ));
    }
    let mut tx = s.db.begin().await?;
    sqlx::query(
        "UPDATE users SET is_super_admin = COALESCE(?, is_super_admin), is_active = COALESCE(?, is_active) WHERE id = ?",
    )
    .bind(p.is_super_admin)
    .bind(p.is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if p.is_active == Some(false) {
        sqlx::query("DELETE FROM sessions WHERE user_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(
        sqlx::query_as(&format!("{USER_SELECT} WHERE u.id = ?"))
            .bind(id)
            .fetch_one(&s.db)
            .await?,
    ))
}

// ---------- อีเมล ----------

#[derive(Serialize, sqlx::FromRow)]
pub struct EmailRow {
    id: i64,
    to_addr: String,
    subject: String,
    kind: String,
    status: String,
    attempts: i64,
    last_error: Option<String>,
    created_at: String,
    sent_at: Option<String>,
}

#[derive(Deserialize)]
pub struct EmailQuery {
    status: Option<String>,
}

/// คิวอีเมลล่าสุด (ตรวจว่าส่งได้จริงหรือไม่)
pub async fn emails(
    State(s): State<AppState>,
    _: SuperAdmin,
    axum::extract::Query(q): axum::extract::Query<EmailQuery>,
) -> AppResult<Json<Value>> {
    let rows: Vec<EmailRow> = sqlx::query_as(
        "SELECT id, to_addr, subject, kind, status, attempts, last_error, created_at, sent_at FROM email_outbox
         WHERE (?1 IS NULL OR status = ?1) ORDER BY id DESC LIMIT 200",
    )
    .bind(&q.status)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(
        json!({ "smtp_configured": s.mailer.configured(), "emails": rows }),
    ))
}

#[derive(Deserialize)]
pub struct TestEmailInput {
    to: String,
}

/// ส่งอีเมลทดสอบทันที (ไม่รอคิว) เพื่อตรวจการตั้งค่า SMTP
pub async fn test_email(
    State(s): State<AppState>,
    _: SuperAdmin,
    Json(t): Json<TestEmailInput>,
) -> AppResult<Json<Value>> {
    if !t.to.contains('@') {
        return Err(AppError::BadRequest("อีเมลไม่ถูกต้อง".into()));
    }
    let id = crate::mail::queue(
        &s.db,
        crate::mail::Email {
            to: t.to.trim(),
            kind: "test",
            subject: "ทดสอบการส่งอีเมล — Estate".into(),
            heading: "ส่งอีเมลได้แล้ว".into(),
            paragraphs: vec!["ถ้าคุณได้รับอีเมลนี้ แปลว่าการตั้งค่า SMTP ถูกต้อง".into()],
            button: None,
            footer: "อีเมลทดสอบจากหน้าผู้ดูแลแพลตฟอร์ม".into(),
        },
    )
    .await?;
    crate::mail::flush(&s.db, &s.mailer).await?;
    let (status, error): (String, Option<String>) =
        sqlx::query_as("SELECT status, last_error FROM email_outbox WHERE id = ?")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    Ok(Json(
        json!({ "status": status, "error": error, "smtp_configured": s.mailer.configured() }),
    ))
}
