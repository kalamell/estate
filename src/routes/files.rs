//! ส่งไฟล์อัปโหลด (รูปมิเตอร์ สลิป รูปแจ้งซ่อม) เฉพาะผู้มีสิทธิ์
//! - ทีมงานที่ล็อกอินและเป็นสมาชิกขององค์กรเจ้าของไฟล์ (หรือ Super Admin)
//! - ผู้เช่าผ่าน `?t=<portal token>` เฉพาะรูปในเรื่องแจ้งซ่อม พัสดุ และสลิปที่แจ้งชำระของตัวเอง
//! - แขกผ่าน `?r=<request token>` เฉพาะสลิปของคำขอจองนั้น

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap},
    response::IntoResponse,
};
use axum_extra::extract::CookieJar;
use serde::Deserialize;

use crate::{
    auth::SESSION_COOKIE,
    error::{AppError, AppResult},
    AppState,
};

#[derive(Deserialize)]
pub struct Access {
    t: Option<String>,
    r: Option<String>,
}

fn content_type(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or_default() {
        "png" => "image/png",
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "application/octet-stream",
    }
}

async fn allowed(
    s: &AppState,
    jar: &CookieJar,
    name: &str,
    org_id: i64,
    q: &Access,
) -> AppResult<bool> {
    if let Some(token) = jar.get(SESSION_COOKIE).map(|c| c.value().to_string()) {
        use sha2::Digest;
        let hash = hex::encode(sha2::Sha256::digest(token.as_bytes()));
        let ok: Option<i64> = sqlx::query_scalar(
            "SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ?1 AND s.expires_at > datetime('now') AND u.is_active = 1
               AND (u.is_super_admin = 1 OR EXISTS (SELECT 1 FROM org_members m WHERE m.user_id = u.id AND m.org_id = ?2))",
        )
        .bind(hash)
        .bind(org_id)
        .fetch_optional(&s.db)
        .await?;
        if ok.is_some() {
            return Ok(true);
        }
    }
    let url = format!("/uploads/{name}");
    if let Some(t) = q.t.as_deref().filter(|t| t.len() >= 16) {
        let ok: Option<i64> = sqlx::query_scalar(
            "SELECT tk.id FROM tickets tk JOIN tenants tn ON tn.id = tk.tenant_id
             WHERE tn.portal_token = ?1 AND tk.org_id = ?2 AND (
                EXISTS (SELECT 1 FROM json_each(tk.photos) j WHERE j.value = ?3)
                OR EXISTS (SELECT 1 FROM ticket_messages m, json_each(m.photos) j
                           WHERE m.ticket_id = tk.id AND m.internal = 0 AND j.value = ?3))
             LIMIT 1",
        )
        .bind(t)
        .bind(org_id)
        .bind(&url)
        .fetch_optional(&s.db)
        .await?;
        if ok.is_some() {
            return Ok(true);
        }
    }
    if let Some(t) = q.t.as_deref().filter(|t| t.len() >= 16) {
        // รูปพัสดุและสลิปที่ผู้เช่าแจ้งชำระเอง
        let ok: Option<i64> = sqlx::query_scalar(
            "SELECT tn.id FROM tenants tn WHERE tn.portal_token = ?1 AND tn.org_id = ?2 AND (
                EXISTS (SELECT 1 FROM parcels pc WHERE pc.tenant_id = tn.id AND pc.photo_url = ?3)
                OR EXISTS (SELECT 1 FROM payment_notices n WHERE n.tenant_id = tn.id AND n.slip_url = ?3)
                OR EXISTS (SELECT 1 FROM contracts c WHERE c.tenant_id = tn.id AND c.status != 'draft'
                           AND (c.tenant_signature_url = ?3 OR c.landlord_signature_url = ?3)))",
        )
        .bind(t)
        .bind(org_id)
        .bind(&url)
        .fetch_optional(&s.db)
        .await?;
        if ok.is_some() {
            return Ok(true);
        }
    }
    if let Some(r) = q.r.as_deref().filter(|r| r.len() >= 16) {
        let ok: Option<i64> =
            sqlx::query_scalar("SELECT id FROM booking_requests WHERE token = ? AND slip_url = ?")
                .bind(r)
                .bind(&url)
                .fetch_optional(&s.db)
                .await?;
        if ok.is_some() {
            return Ok(true);
        }
    }
    Ok(false)
}

pub async fn serve(
    State(s): State<AppState>,
    Path(name): Path<String>,
    Query(q): Query<Access>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    // ชื่อไฟล์ต้องเป็นแบบที่ระบบสร้างเท่านั้น (กัน path traversal)
    if name.is_empty()
        || name.len() > 120
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        || name.starts_with('.')
    {
        return Err(AppError::NotFound);
    }
    let org_id: i64 = sqlx::query_scalar("SELECT org_id FROM uploads WHERE name = ?")
        .bind(&name)
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let jar = CookieJar::from_headers(&headers);
    if !allowed(&s, &jar, &name, org_id, &q).await? {
        return Err(AppError::NotFound);
    }
    let bytes = tokio::fs::read(s.upload_dir.join(&name))
        .await
        .map_err(|_| AppError::NotFound)?;
    Ok((
        [
            (header::CONTENT_TYPE, content_type(&name)),
            (header::CACHE_CONTROL, "private, max-age=3600"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        bytes,
    ))
}
