//! การยืนยันตัวตน (session cookie) และบริบทองค์กร (multi-tenant)

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};
use axum_extra::extract::CookieJar;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::{
    error::{AppError, AppResult},
    models::PackageFeatures,
    AppState,
};

pub const SESSION_COOKIE: &str = "estate_session";
pub const SESSION_DAYS: i64 = 30;

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("hash password: {e}")))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|h| {
            Argon2::default()
                .verify_password(password.as_bytes(), &h)
                .is_ok()
        })
        .unwrap_or(false)
}

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

/// สร้าง session ใหม่ คืนค่า token ดิบ (เก็บเฉพาะ hash ในฐานข้อมูล)
pub async fn create_session(db: &SqlitePool, user_id: i64) -> AppResult<String> {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = hex::encode(bytes);
    sqlx::query(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))",
    )
    .bind(token_hash(&token))
    .bind(user_id)
    .bind(format!("+{SESSION_DAYS} days"))
    .execute(db)
    .await?;
    Ok(token)
}

pub async fn delete_session(db: &SqlitePool, token: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM sessions WHERE token_hash = ?")
        .bind(token_hash(token))
        .execute(db)
        .await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct AuthUser {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub is_super_admin: bool,
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = AppState::from_ref(state);
        let jar = CookieJar::from_headers(&parts.headers);
        let token = jar
            .get(SESSION_COOKIE)
            .map(|c| c.value().to_string())
            .ok_or(AppError::Unauthorized)?;
        sqlx::query_as(
            "SELECT u.id, u.name, u.email, u.is_super_admin FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.is_active = 1",
        )
        .bind(token_hash(&token))
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)
    }
}

/// ผู้ดูแลแพลตฟอร์ม (เจ้าของระบบ SaaS)
pub struct SuperAdmin(pub AuthUser);

#[async_trait]
impl<S> FromRequestParts<S> for SuperAdmin
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if !user.is_super_admin {
            return Err(AppError::Forbidden);
        }
        Ok(SuperAdmin(user))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Role {
    Staff,
    Admin,
    Owner,
}

impl Role {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "owner" => Some(Role::Owner),
            "admin" => Some(Role::Admin),
            "staff" => Some(Role::Staff),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OrgRow {
    pub org_id: i64,
    pub role: String,
    pub status: String,
    pub expired: bool,
    pub max_properties: i64,
    pub max_units: i64,
    pub max_members: i64,
    #[sqlx(json)]
    pub features: PackageFeatures,
}

/// บริบทของคำขอที่ผูกกับองค์กร (จาก header `X-Org-Id`) — ทุกข้อมูลธุรกิจต้องผ่านตัวนี้
#[derive(Debug, Clone)]
pub struct OrgCtx {
    pub user: AuthUser,
    pub ip: Option<String>,
    pub org_id: i64,
    pub role: Role,
    pub status: String,
    pub expired: bool,
    pub max_properties: i64,
    pub max_units: i64,
    pub max_members: i64,
    pub features: PackageFeatures,
}

impl OrgCtx {
    pub fn require_admin(&self) -> AppResult<()> {
        if self.role >= Role::Admin {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }

    pub fn require_owner(&self) -> AppResult<()> {
        if self.role == Role::Owner {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }

    /// การเขียนข้อมูลทำได้เมื่อสมาชิกภาพยังใช้งานได้ (trial/active และยังไม่หมดอายุ)
    pub fn require_writable(&self) -> AppResult<()> {
        if matches!(self.status.as_str(), "trial" | "active") && !self.expired {
            Ok(())
        } else {
            Err(AppError::PaymentRequired {
                code: "subscription_inactive",
                message: "บัญชีถูกระงับหรือหมดอายุ — ติดต่อผู้ให้บริการเพื่อต่ออายุแพ็กเกจ".into(),
            })
        }
    }

    pub fn require_feature(&self, enabled: bool, name: &str) -> AppResult<()> {
        if enabled {
            Ok(())
        } else {
            Err(AppError::PaymentRequired {
                code: "feature_unavailable",
                message: format!("แพ็กเกจปัจจุบันไม่รองรับ{name} — อัปเกรดแพ็กเกจเพื่อใช้งาน"),
            })
        }
    }

    pub fn limit_reached(what: &str, max: i64) -> AppError {
        AppError::PaymentRequired {
            code: "limit_reached",
            message: format!("ถึงขีดจำกัด{what}ของแพ็กเกจแล้ว ({max}) — อัปเกรดแพ็กเกจเพื่อเพิ่ม"),
        }
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for OrgCtx
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let ctx = load_org_ctx(parts, state).await?;
        if !parts.method.is_safe() {
            ctx.require_writable()?;
        }
        Ok(ctx)
    }
}

/// เหมือน [`OrgCtx`] แต่ไม่บล็อกการเขียนเมื่อบัญชีหมดอายุ — ใช้กับหน้าชำระค่าแพ็กเกจเท่านั้น
pub struct BillingCtx(pub OrgCtx);

#[async_trait]
impl<S> FromRequestParts<S> for BillingCtx
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Ok(BillingCtx(load_org_ctx(parts, state).await?))
    }
}

async fn load_org_ctx<S>(parts: &mut Parts, state: &S) -> AppResult<OrgCtx>
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    {
        let user = AuthUser::from_request_parts(parts, state).await?;
        let db = AppState::from_ref(state).db;
        let org_id: i64 = parts
            .headers
            .get("x-org-id")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())
            // ลิงก์ดาวน์โหลด (เช่น CSV) ส่ง header ไม่ได้: รับ ?org_id= เฉพาะคำขอแบบอ่านอย่างเดียว
            .or_else(|| {
                parts.method.is_safe().then_some(())?;
                parts
                    .uri
                    .query()?
                    .split('&')
                    .find_map(|kv| kv.strip_prefix("org_id=")?.parse().ok())
            })
            .ok_or_else(|| AppError::BadRequest("ต้องระบุองค์กร (X-Org-Id)".into()))?;

        let row: OrgRow = sqlx::query_as(
            "SELECT o.id AS org_id, m.role, o.status,
                    (o.ends_at IS NOT NULL AND date(o.ends_at, '+' || (SELECT grace_days FROM platform_settings WHERE id = 1) || ' days') < date('now')) AS expired,
                    p.max_properties, p.max_units, p.max_members, p.features
             FROM organizations o
             JOIN org_members m ON m.org_id = o.id AND m.user_id = ?
             JOIN packages p ON p.id = o.package_id
             WHERE o.id = ?",
        )
        .bind(user.id)
        .bind(org_id)
        .fetch_optional(&db)
        .await?
        .ok_or(AppError::Forbidden)?;

        let ctx = OrgCtx {
            user,
            ip: client_ip(parts),
            org_id: row.org_id,
            role: Role::parse(&row.role).unwrap_or(Role::Staff),
            status: row.status,
            expired: row.expired,
            max_properties: row.max_properties,
            max_units: row.max_units,
            max_members: row.max_members,
            features: row.features,
        };
        Ok(ctx)
    }
}

/// ตรวจว่าทรัพยากรอยู่ในองค์กรนี้ (กันการเข้าถึงข้ามองค์กร)
pub async fn ensure_property(db: &SqlitePool, org_id: i64, property_id: i64) -> AppResult<()> {
    sqlx::query_scalar::<_, i64>("SELECT id FROM properties WHERE id = ? AND org_id = ?")
        .bind(property_id)
        .bind(org_id)
        .fetch_optional(db)
        .await?
        .map(|_| ())
        .ok_or(AppError::NotFound)
}

pub async fn ensure_unit(db: &SqlitePool, org_id: i64, unit_id: i64) -> AppResult<()> {
    sqlx::query_scalar::<_, i64>(
        "SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND p.org_id = ?",
    )
    .bind(unit_id)
    .bind(org_id)
    .fetch_optional(db)
    .await?
    .map(|_| ())
    .ok_or(AppError::NotFound)
}

pub async fn ensure_tenant(db: &SqlitePool, org_id: i64, tenant_id: i64) -> AppResult<()> {
    sqlx::query_scalar::<_, i64>("SELECT id FROM tenants WHERE id = ? AND org_id = ?")
        .bind(tenant_id)
        .bind(org_id)
        .fetch_optional(db)
        .await?
        .map(|_| ())
        .ok_or(AppError::NotFound)
}

/// IP ของผู้ใช้: หลัง reverse proxy (TRUST_PROXY=1) ใช้ X-Forwarded-For ตัวแรก ไม่เช่นนั้นใช้ IP ที่เชื่อมต่อจริง
pub fn client_ip(parts: &Parts) -> Option<String> {
    if std::env::var("TRUST_PROXY").is_ok_and(|v| v == "1") {
        if let Some(ip) = parts
            .headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
        {
            return Some(ip);
        }
    }
    parts
        .extensions
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|c| c.0.ip().to_string())
}

/// ตัวดึง IP สำหรับ handler ที่ไม่ต้องล็อกอิน (ใช้กับ rate limit / audit)
pub struct ClientIp(pub Option<String>);

#[async_trait]
impl<S: Send + Sync> FromRequestParts<S> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        Ok(ClientIp(client_ip(parts)))
    }
}

impl ClientIp {
    pub fn key(&self) -> &str {
        self.0.as_deref().unwrap_or("unknown")
    }
}
