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

/// สร้างองค์กรใหม่ด้วยแพ็กเกจเริ่มต้นและตั้งผู้ใช้เป็นเจ้าของ
/// (แพ็กเกจเสียเงินได้ทดลองใช้ 14 วัน, แพ็กเกจฟรีใช้ได้ไม่มีวันหมดอายุ)
pub async fn create_org_for(db: &SqlitePool, user_id: i64, name: &str) -> AppResult<i64> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อองค์กร".into()));
    }
    let (package_id, price): (i64, f64) = sqlx::query_as(
        "SELECT id, price_monthly FROM packages WHERE is_active = 1 ORDER BY is_default DESC, sort_order, id LIMIT 1",
    )
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::Conflict("ระบบยังไม่มีแพ็กเกจที่เปิดใช้งาน".into()))?;
    let mut tx = db.begin().await?;
    let org_id: i64 = sqlx::query_scalar(
        "INSERT INTO organizations (name, package_id, status, ends_at)
         VALUES (?1, ?2, CASE WHEN ?3 > 0 THEN 'trial' ELSE 'active' END,
                 CASE WHEN ?3 > 0 THEN date('now', '+14 days') END)
         RETURNING id",
    )
    .bind(name)
    .bind(package_id)
    .bind(price)
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
    let verified: Option<String> =
        sqlx::query_scalar("SELECT email_verified_at FROM users WHERE id = ?")
            .bind(user.id)
            .fetch_one(db)
            .await?;
    let mut u = serde_json::to_value(user).unwrap_or_default();
    u["email_verified"] = json!(verified.is_some());
    Ok(json!({ "user": u, "orgs": user_orgs(db, user.id).await? }))
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
    send_verification(&s, &user).await?;
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
            .bind(l.email.trim().to_lowercase())
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

// ---------- อีเมล: ยืนยันอีเมล / ลืมรหัสผ่าน / เปลี่ยนรหัสผ่าน ----------

fn hash_token(token: &str) -> String {
    use sha2::Digest;
    hex::encode(sha2::Sha256::digest(token.as_bytes()))
}

/// สร้างโทเค็นแบบใช้ครั้งเดียว (เก็บเฉพาะ hash) — ยกเลิกโทเค็นเดิมที่ยังไม่ได้ใช้ของจุดประสงค์เดียวกัน
async fn issue_token(
    db: &SqlitePool,
    user_id: i64,
    purpose: &str,
    hours: i64,
) -> AppResult<String> {
    let token = {
        use rand::RngCore;
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        hex::encode(bytes)
    };
    sqlx::query("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL")
        .bind(user_id)
        .bind(purpose)
        .execute(db)
        .await?;
    sqlx::query(
        "INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
         VALUES (?, ?, ?, datetime('now', '+' || ? || ' hours'))",
    )
    .bind(user_id)
    .bind(purpose)
    .bind(hash_token(&token))
    .bind(hours)
    .execute(db)
    .await?;
    Ok(token)
}

/// ใช้โทเค็น (ครั้งเดียว ภายในเวลาที่กำหนด) คืน user_id
async fn consume_token(db: &SqlitePool, token: &str, purpose: &str) -> AppResult<i64> {
    let invalid = || AppError::BadRequest("ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว — กรุณาขอลิงก์ใหม่".into());
    if token.len() < 32 {
        return Err(invalid());
    }
    sqlx::query_scalar(
        "UPDATE auth_tokens SET used_at = datetime('now')
         WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > datetime('now')
         RETURNING user_id",
    )
    .bind(hash_token(token))
    .bind(purpose)
    .fetch_optional(db)
    .await?
    .ok_or_else(invalid)
}

async fn send_verification(s: &AppState, user: &AuthUser) -> AppResult<()> {
    let token = issue_token(&s.db, user.id, "verify", 72).await?;
    crate::mail::queue(
        &s.db,
        crate::mail::Email {
            to: &user.email,
            kind: "verify",
            subject: "ยืนยันอีเมลของคุณ — Estate".into(),
            heading: format!("ยินดีต้อนรับ คุณ{}", user.name),
            paragraphs: vec![
                "กรุณายืนยันอีเมลนี้ เพื่อให้รับใบแจ้งหนี้ค่าบริการ การแจ้งเตือน และกู้คืนรหัสผ่านได้".into(),
            ],
            button: Some((
                "ยืนยันอีเมล".into(),
                format!("{}/verify-email?token={token}", s.public_url),
            )),
            footer: "ลิงก์นี้ใช้ได้ภายใน 72 ชั่วโมง หากคุณไม่ได้สมัครใช้งาน ไม่ต้องดำเนินการใด ๆ".into(),
        },
    )
    .await?;
    Ok(())
}

#[derive(Deserialize)]
pub struct ForgotInput {
    email: String,
}

/// ขอลิงก์ตั้งรหัสผ่านใหม่ — ตอบเหมือนกันเสมอ (ไม่เปิดเผยว่ามีอีเมลนี้ในระบบหรือไม่)
pub async fn forgot(
    State(s): State<AppState>,
    ip: auth::ClientIp,
    Json(f): Json<ForgotInput>,
) -> AppResult<Json<Value>> {
    let email = f.email.trim().to_lowercase();
    let hour = std::time::Duration::from_secs(3600);
    s.limiter
        .check(&format!("forgot-ip:{}", ip.key()), 10, hour)?;
    s.limiter.check(&format!("forgot:{email}"), 3, hour)?;
    let user: Option<(i64, String)> =
        sqlx::query_as("SELECT id, name FROM users WHERE email = ? AND is_active = 1")
            .bind(&email)
            .fetch_optional(&s.db)
            .await?;
    if let Some((id, name)) = user {
        let token = issue_token(&s.db, id, "reset", 1).await?;
        crate::mail::queue(
            &s.db,
            crate::mail::Email {
                to: &email,
                kind: "reset",
                subject: "ตั้งรหัสผ่านใหม่ — Estate".into(),
                heading: "ตั้งรหัสผ่านใหม่".into(),
                paragraphs: vec![
                    format!("สวัสดีคุณ{name}"),
                    "มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่".into(),
                ],
                button: Some((
                    "ตั้งรหัสผ่านใหม่".into(),
                    format!("{}/reset-password?token={token}", s.public_url),
                )),
                footer: "ลิงก์นี้ใช้ได้ภายใน 1 ชั่วโมงและใช้ได้ครั้งเดียว หากคุณไม่ได้ขอ ไม่ต้องดำเนินการใด ๆ รหัสผ่านเดิมยังใช้ได้ตามปกติ".into(),
            },
        )
        .await?;
        crate::audit::log(
            &s.db,
            None,
            Some(id),
            ip.0.as_deref(),
            "auth.reset_request",
            "user",
            Some(id),
            None,
        )
        .await;
    }
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct ResetInput {
    token: String,
    password: String,
}

/// ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล — ออกจากระบบทุกอุปกรณ์
pub async fn reset(
    State(s): State<AppState>,
    ip: auth::ClientIp,
    Json(r): Json<ResetInput>,
) -> AppResult<Json<Value>> {
    s.limiter.check(
        &format!("reset-ip:{}", ip.key()),
        20,
        std::time::Duration::from_secs(3600),
    )?;
    if r.password.chars().count() < 8 {
        return Err(AppError::BadRequest("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร".into()));
    }
    let user_id = consume_token(&s.db, r.token.trim(), "reset").await?;
    let hash = auth::hash_password(&r.password)?;
    // เปิดลิงก์จากอีเมลได้ แปลว่าอีเมลนี้เป็นของผู้ใช้จริง
    sqlx::query(
        "UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, datetime('now'))
         WHERE id = ?",
    )
    .bind(hash)
    .bind(user_id)
    .execute(&s.db)
    .await?;
    sqlx::query("DELETE FROM sessions WHERE user_id = ?")
        .bind(user_id)
        .execute(&s.db)
        .await?;
    crate::audit::log(
        &s.db,
        None,
        Some(user_id),
        ip.0.as_deref(),
        "auth.password_reset",
        "user",
        Some(user_id),
        None,
    )
    .await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct VerifyInput {
    token: String,
}

pub async fn verify_email(
    State(s): State<AppState>,
    Json(v): Json<VerifyInput>,
) -> AppResult<Json<Value>> {
    let user_id = consume_token(&s.db, v.token.trim(), "verify").await?;
    sqlx::query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?")
        .bind(user_id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn resend_verification(
    State(s): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Value>> {
    s.limiter.check(
        &format!("verify:{}", user.id),
        3,
        std::time::Duration::from_secs(3600),
    )?;
    let verified: Option<String> =
        sqlx::query_scalar("SELECT email_verified_at FROM users WHERE id = ?")
            .bind(user.id)
            .fetch_one(&s.db)
            .await?;
    if verified.is_some() {
        return Err(AppError::Conflict("ยืนยันอีเมลแล้ว".into()));
    }
    send_verification(&s, &user).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct PasswordInput {
    current_password: String,
    new_password: String,
}

/// เปลี่ยนรหัสผ่าน — ออกจากระบบอุปกรณ์อื่นทั้งหมด (คงเซสชันปัจจุบันไว้)
pub async fn change_password(
    State(s): State<AppState>,
    user: AuthUser,
    ip: auth::ClientIp,
    jar: CookieJar,
    Json(p): Json<PasswordInput>,
) -> AppResult<Json<Value>> {
    s.limiter.check(
        &format!("password:{}", user.id),
        10,
        std::time::Duration::from_secs(900),
    )?;
    let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = ?")
        .bind(user.id)
        .fetch_one(&s.db)
        .await?;
    if !auth::verify_password(&p.current_password, &hash) {
        return Err(AppError::BadRequest("รหัสผ่านปัจจุบันไม่ถูกต้อง".into()));
    }
    if p.new_password.chars().count() < 8 {
        return Err(AppError::BadRequest("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร".into()));
    }
    sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(auth::hash_password(&p.new_password)?)
        .bind(user.id)
        .execute(&s.db)
        .await?;
    let current = jar
        .get(SESSION_COOKIE)
        .map(|c| hash_token(c.value()))
        .unwrap_or_default();
    sqlx::query("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
        .bind(user.id)
        .bind(current)
        .execute(&s.db)
        .await?;
    crate::audit::log(
        &s.db,
        None,
        Some(user.id),
        ip.0.as_deref(),
        "auth.password_change",
        "user",
        Some(user.id),
        None,
    )
    .await;
    Ok(Json(json!({ "ok": true })))
}
