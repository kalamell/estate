use axum::{extract::State, Json};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::{
    auth::{self, AuthUser, SESSION_COOKIE, SESSION_DAYS},
    error::{AppError, AppResult},
    models::OrgSummary,
    AppState,
};

#[derive(Deserialize)]
pub struct RegisterInput {
    name: String,
    email: String,
    password: String,
    org_name: String,
    #[serde(default)]
    accept_terms: bool,
}

#[derive(Deserialize)]
pub struct LoginInput {
    email: String,
    password: String,
}

#[derive(Deserialize)]
pub struct OrgInput {
    name: String,
}

pub async fn user_orgs(db: &SqlitePool, user_id: i64) -> AppResult<Vec<OrgSummary>> {
    Ok(sqlx::query_as(
        "SELECT o.id, o.name, m.role, o.status, p.name AS package_name
         FROM org_members m JOIN organizations o ON o.id = m.org_id JOIN packages p ON p.id = o.package_id
         WHERE m.user_id = ? ORDER BY o.id",
    )
    .bind(user_id)
    .fetch_all(db)
    .await?)
}

fn session_cookie(state: &AppState, token: String) -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.secure_cookies)
        .max_age(time_days(SESSION_DAYS))
        .build()
}

fn time_days(days: i64) -> time::Duration {
    time::Duration::days(days)
}

fn validate_credentials(email: &str, password: &str) -> AppResult<()> {
    if !email.contains('@') || email.len() < 5 {
        return Err(AppError::BadRequest("อีเมลไม่ถูกต้อง".into()));
    }
    if password.chars().count() < 8 {
        return Err(AppError::BadRequest("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร".into()));
    }
    Ok(())
}

/// สร้างองค์กรใหม่ด้วยแพ็กเกจเริ่มต้น (ทดลองใช้ 14 วัน) และตั้งผู้ใช้เป็นเจ้าของ
pub async fn create_org_for(db: &SqlitePool, user_id: i64, name: &str) -> AppResult<i64> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อองค์กร".into()));
    }
    let package_id: i64 = sqlx::query_scalar(
        "SELECT id FROM packages WHERE is_active = 1 ORDER BY is_default DESC, sort_order, id LIMIT 1",
    )
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::Conflict("ระบบยังไม่มีแพ็กเกจที่เปิดใช้งาน".into()))?;
    let mut tx = db.begin().await?;
    let org_id: i64 = sqlx::query_scalar(
        "INSERT INTO organizations (name, package_id, status, ends_at) VALUES (?, ?, 'trial', date('now', '+14 days'))
         RETURNING id",
    )
    .bind(name)
    .bind(package_id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')")
        .bind(org_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(org_id)
}

async fn me_payload(db: &SqlitePool, user: &AuthUser) -> AppResult<Value> {
    Ok(json!({ "user": user, "orgs": user_orgs(db, user.id).await? }))
}

pub async fn register(
    State(s): State<AppState>,
    ip: auth::ClientIp,
    jar: CookieJar,
    Json(r): Json<RegisterInput>,
) -> AppResult<(CookieJar, Json<Value>)> {
    s.limiter.check(
        &format!("register:{}", ip.key()),
        10,
        std::time::Duration::from_secs(3600),
    )?;
    let email = r.email.trim().to_lowercase();
    validate_credentials(&email, &r.password)?;
    if !r.accept_terms {
        return Err(AppError::BadRequest(
            "กรุณายอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว".into(),
        ));
    }
    if r.name.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อ".into()));
    }
    let hash = auth::hash_password(&r.password)?;
    let user: AuthUser = sqlx::query_as(
        "INSERT INTO users (email, name, password_hash, terms_accepted_at) VALUES (?, ?, ?, datetime('now'))
         RETURNING id, name, email, is_super_admin",
    )
    .bind(&email)
    .bind(r.name.trim())
    .bind(hash)
    .fetch_one(&s.db)
    .await
    .map_err(|e| match AppError::from(e) {
        AppError::Conflict(_) => AppError::Conflict("อีเมลนี้ถูกใช้สมัครแล้ว".into()),
        other => other,
    })?;
    create_org_for(&s.db, user.id, &r.org_name).await?;
    let token = auth::create_session(&s.db, user.id).await?;
    Ok((
        jar.add(session_cookie(&s, token)),
        Json(me_payload(&s.db, &user).await?),
    ))
}

pub async fn login(
    State(s): State<AppState>,
    ip: auth::ClientIp,
    jar: CookieJar,
    Json(l): Json<LoginInput>,
) -> AppResult<(CookieJar, Json<Value>)> {
    // กันเดารหัสผ่าน: ต่อ IP และต่ออีเมล
    let window = std::time::Duration::from_secs(15 * 60);
    s.limiter
        .check(&format!("login-ip:{}", ip.key()), 30, window)?;
    s.limiter.check(
        &format!("login-email:{}", l.email.trim().to_lowercase()),
        10,
        window,
    )?;
    let row: Option<(i64, String, bool)> =
        sqlx::query_as("SELECT id, password_hash, is_active FROM users WHERE email = ?")
            .bind(l.email.trim())
            .fetch_optional(&s.db)
            .await?;
    let invalid = || AppError::BadRequest("อีเมลหรือรหัสผ่านไม่ถูกต้อง".into());
    let (id, hash, active) = row.ok_or_else(invalid)?;
    if !auth::verify_password(&l.password, &hash) {
        return Err(invalid());
    }
    if !active {
        return Err(AppError::Forbidden);
    }
    let user: AuthUser =
        sqlx::query_as("SELECT id, name, email, is_super_admin FROM users WHERE id = ?")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    sqlx::query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
        .execute(&s.db)
        .await?;
    let token = auth::create_session(&s.db, id).await?;
    crate::audit::log(
        &s.db,
        None,
        Some(id),
        ip.0.as_deref(),
        "auth.login",
        "user",
        Some(id),
        None,
    )
    .await;
    Ok((
        jar.add(session_cookie(&s, token)),
        Json(me_payload(&s.db, &user).await?),
    ))
}

pub async fn logout(
    State(s): State<AppState>,
    jar: CookieJar,
) -> AppResult<(CookieJar, Json<Value>)> {
    if let Some(c) = jar.get(SESSION_COOKIE) {
        auth::delete_session(&s.db, c.value()).await?;
    }
    Ok((
        jar.remove(Cookie::build(SESSION_COOKIE).path("/")),
        Json(json!({})),
    ))
}

pub async fn me(State(s): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    Ok(Json(me_payload(&s.db, &user).await?))
}

pub async fn create_org(
    State(s): State<AppState>,
    user: AuthUser,
    Json(o): Json<OrgInput>,
) -> AppResult<Json<OrgSummary>> {
    let id = create_org_for(&s.db, user.id, &o.name).await?;
    let org = user_orgs(&s.db, user.id)
        .await?
        .into_iter()
        .find(|o| o.id == id)
        .ok_or(AppError::NotFound)?;
    Ok(Json(org))
}
