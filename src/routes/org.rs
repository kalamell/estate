use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    auth::{self, OrgCtx, Role},
    error::{AppError, AppResult},
    AppState,
};

pub async fn get(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    let (id, name, status, ends_at, created_at): (i64, String, String, Option<String>, String) =
        sqlx::query_as(
            "SELECT id, name, status, ends_at, created_at FROM organizations WHERE id = ?",
        )
        .bind(ctx.org_id)
        .fetch_one(&s.db)
        .await?;
    let issuer = crate::docs::load_issuer(&s.db, ctx.org_id).await?;
    let package: (i64, String, String, f64) = sqlx::query_as(
        "SELECT p.id, p.name, p.description, p.price_monthly FROM packages p
         JOIN organizations o ON o.package_id = p.id WHERE o.id = ?",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    let (properties, units, members): (i64, i64, i64) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM properties WHERE org_id = ?1),
                (SELECT COUNT(*) FROM units u JOIN properties p ON p.id = u.property_id WHERE p.org_id = ?1),
                (SELECT COUNT(*) FROM org_members WHERE org_id = ?1)",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    let role = match ctx.role {
        Role::Owner => "owner",
        Role::Admin => "admin",
        Role::Staff => "staff",
    };
    Ok(Json(json!({
        "org": {
            "id": id, "name": name, "status": status, "ends_at": ends_at, "created_at": created_at,
            "legal_name": issuer.legal_name, "tax_id": issuer.tax_id, "branch_code": issuer.branch_code,
            "address": issuer.address, "phone": issuer.phone, "vat_registered": issuer.vat_registered,
            "vat_rate": issuer.vat_rate, "receipt_note": issuer.receipt_note,
        },
        "package": {
            "id": package.0, "name": package.1, "description": package.2, "price_monthly": package.3,
            "max_properties": ctx.max_properties, "max_units": ctx.max_units, "max_members": ctx.max_members,
            "features": ctx.features,
        },
        "usage": { "properties": properties, "units": units, "members": members },
        "role": role,
    })))
}

#[derive(Deserialize)]
pub struct OrgInput {
    name: String,
    legal_name: Option<String>,
    tax_id: Option<String>,
    branch_code: Option<String>,
    address: Option<String>,
    phone: Option<String>,
    vat_registered: Option<bool>,
    vat_rate: Option<f64>,
    receipt_note: Option<String>,
}

pub async fn update(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(o): Json<OrgInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    if o.name.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อองค์กร".into()));
    }
    let digits = |v: &Option<String>, len: usize, label: &str| -> AppResult<()> {
        match v.as_deref().map(str::trim) {
            Some(t)
                if !t.is_empty() && (t.len() != len || !t.chars().all(|c| c.is_ascii_digit())) =>
            {
                Err(AppError::BadRequest(format!(
                    "{label}ต้องเป็นตัวเลข {len} หลัก"
                )))
            }
            _ => Ok(()),
        }
    };
    digits(&o.tax_id, 13, "เลขประจำตัวผู้เสียภาษี")?;
    digits(&o.branch_code, 5, "รหัสสาขา")?;
    if matches!(o.vat_rate, Some(r) if !(0.0..=30.0).contains(&r)) {
        return Err(AppError::BadRequest("อัตราภาษีไม่ถูกต้อง".into()));
    }
    sqlx::query(
        "UPDATE organizations SET name = ?, legal_name = COALESCE(?, legal_name), tax_id = COALESCE(?, tax_id),
            branch_code = COALESCE(NULLIF(?, ''), branch_code), address = COALESCE(?, address),
            phone = COALESCE(?, phone), vat_registered = COALESCE(?, vat_registered),
            vat_rate = COALESCE(?, vat_rate), receipt_note = COALESCE(?, receipt_note)
         WHERE id = ?",
    )
    .bind(o.name.trim())
    .bind(o.legal_name.as_deref().map(str::trim))
    .bind(o.tax_id.as_deref().map(str::trim))
    .bind(o.branch_code.as_deref().map(str::trim))
    .bind(&o.address)
    .bind(&o.phone)
    .bind(o.vat_registered)
    .bind(o.vat_rate)
    .bind(&o.receipt_note)
    .bind(ctx.org_id)
        .execute(&s.db)
        .await?;
    get(State(s), ctx).await
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Member {
    user_id: i64,
    name: String,
    email: String,
    role: String,
    created_at: String,
}

pub async fn members(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Vec<Member>>> {
    let rows = sqlx::query_as(
        "SELECT u.id AS user_id, u.name, u.email, m.role, m.created_at FROM org_members m
         JOIN users u ON u.id = m.user_id WHERE m.org_id = ?
         ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name",
    )
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct MemberInput {
    email: String,
    name: Option<String>,
    password: Option<String>,
    role: String,
}

/// เจ้าของ/แอดมินกำหนดได้เฉพาะบทบาทที่ไม่สูงกว่าตัวเอง และมีเจ้าของได้คนเดียว
fn assignable_role(ctx: &OrgCtx, role: &str) -> AppResult<Role> {
    let r = Role::parse(role).ok_or_else(|| AppError::BadRequest("บทบาทไม่ถูกต้อง".into()))?;
    if r == Role::Owner || r > ctx.role {
        return Err(AppError::Forbidden);
    }
    Ok(r)
}

pub async fn add_member(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(m): Json<MemberInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    assignable_role(&ctx, &m.role)?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM org_members WHERE org_id = ?")
        .bind(ctx.org_id)
        .fetch_one(&s.db)
        .await?;
    if count >= ctx.max_members {
        return Err(OrgCtx::limit_reached("จำนวนผู้ใช้", ctx.max_members));
    }
    let email = m.email.trim().to_lowercase();
    let existing: Option<i64> = sqlx::query_scalar("SELECT id FROM users WHERE email = ?")
        .bind(&email)
        .fetch_optional(&s.db)
        .await?;
    let user_id = match existing {
        Some(id) => id,
        None => {
            let password = m.password.as_deref().unwrap_or_default();
            if password.chars().count() < 8 || !email.contains('@') {
                return Err(AppError::BadRequest(
                    "ผู้ใช้ใหม่ต้องระบุอีเมลที่ถูกต้องและรหัสผ่านอย่างน้อย 8 ตัวอักษร".into(),
                ));
            }
            let name = m
                .name
                .as_deref()
                .map(str::trim)
                .filter(|n| !n.is_empty())
                .unwrap_or(&email);
            sqlx::query_scalar(
                "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?) RETURNING id",
            )
            .bind(&email)
            .bind(name)
            .bind(auth::hash_password(password)?)
            .fetch_one(&s.db)
            .await?
        }
    };
    sqlx::query("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)")
        .bind(ctx.org_id)
        .bind(user_id)
        .bind(&m.role)
        .execute(&s.db)
        .await
        .map_err(|e| match AppError::from(e) {
            AppError::Conflict(_) => AppError::Conflict("ผู้ใช้นี้เป็นสมาชิกอยู่แล้ว".into()),
            other => other,
        })?;
    Ok(Json(json!({ "user_id": user_id })))
}

async fn member_role(s: &AppState, org_id: i64, user_id: i64) -> AppResult<Role> {
    let role: String =
        sqlx::query_scalar("SELECT role FROM org_members WHERE org_id = ? AND user_id = ?")
            .bind(org_id)
            .bind(user_id)
            .fetch_optional(&s.db)
            .await?
            .ok_or(AppError::NotFound)?;
    Ok(Role::parse(&role).unwrap_or(Role::Staff))
}

#[derive(Deserialize)]
pub struct RoleInput {
    role: String,
}

pub async fn update_member(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(user_id): Path<i64>,
    Json(r): Json<RoleInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    assignable_role(&ctx, &r.role)?;
    let current = member_role(&s, ctx.org_id, user_id).await?;
    if current == Role::Owner || current > ctx.role {
        return Err(AppError::Forbidden);
    }
    sqlx::query("UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?")
        .bind(&r.role)
        .bind(ctx.org_id)
        .bind(user_id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

pub async fn remove_member(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(user_id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let current = member_role(&s, ctx.org_id, user_id).await?;
    if current == Role::Owner || current > ctx.role {
        return Err(AppError::Forbidden);
    }
    sqlx::query("DELETE FROM org_members WHERE org_id = ? AND user_id = ?")
        .bind(ctx.org_id)
        .bind(user_id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}
