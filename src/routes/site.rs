//! ข้อมูลสาธารณะสำหรับหน้าแนะนำระบบ (แพ็กเกจและราคา) และฟอร์มติดต่อของผู้สนใจ

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::validate_in;
use crate::{
    auth::{ClientIp, SuperAdmin},
    error::{AppError, AppResult},
    models::PackageFeatures,
    AppState,
};

#[derive(sqlx::FromRow)]
struct PublicPackage {
    id: i64,
    name: String,
    description: String,
    price_monthly: f64,
    price_yearly: f64,
    max_properties: i64,
    max_units: i64,
    max_members: i64,
    #[sqlx(json)]
    features: PackageFeatures,
    is_default: bool,
}

/// คลิปจากลิงก์ YouTube / Vimeo → (ผู้ให้บริการ, id) — ลิงก์อื่นไม่รับ (กันฝังเว็บแปลกปลอม)
pub fn parse_video(url: &str) -> Option<(&'static str, String)> {
    let url = url.trim();
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    let rest = rest.strip_prefix("www.").unwrap_or(rest);
    let rest = rest.strip_prefix("m.").unwrap_or(rest);
    let valid = |id: &str, len: std::ops::RangeInclusive<usize>, digits_only: bool| {
        len.contains(&id.len())
            && id.chars().all(|c| {
                if digits_only {
                    c.is_ascii_digit()
                } else {
                    c.is_ascii_alphanumeric() || c == '-' || c == '_'
                }
            })
    };
    let take = |s: &str| {
        s.split(['?', '&', '#', '/'])
            .next()
            .unwrap_or_default()
            .to_string()
    };
    let yt = if let Some(r) = rest.strip_prefix("youtu.be/") {
        Some(take(r))
    } else if let Some(r) = rest.strip_prefix("youtube.com/watch") {
        r.split(['?', '&'])
            .find_map(|kv| kv.strip_prefix("v="))
            .map(take)
    } else {
        [
            "youtube.com/shorts/",
            "youtube.com/embed/",
            "youtube.com/live/",
            "youtube-nocookie.com/embed/",
        ]
        .iter()
        .find_map(|p| rest.strip_prefix(p))
        .map(take)
    };
    if let Some(id) = yt.filter(|id| valid(id, 11..=11, false)) {
        return Some(("youtube", id));
    }
    if let Some(r) = rest.strip_prefix("vimeo.com/") {
        let id = take(r);
        if valid(&id, 6..=12, true) {
            return Some(("vimeo", id));
        }
    }
    None
}

fn video_json(url: &str) -> Value {
    match parse_video(url) {
        Some(("youtube", id)) => json!({
            "provider": "youtube", "id": id, "url": url,
            "embed_url": format!("https://www.youtube-nocookie.com/embed/{id}?autoplay=1&rel=0"),
            "thumbnail": format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"),
        }),
        Some((_, id)) => json!({
            "provider": "vimeo", "id": id, "url": url,
            "embed_url": format!("https://player.vimeo.com/video/{id}?autoplay=1"),
            "thumbnail": null,
        }),
        None => Value::Null,
    }
}

async fn promo_url(db: &sqlx::SqlitePool) -> AppResult<String> {
    Ok(
        sqlx::query_scalar("SELECT promo_video_url FROM platform_settings WHERE id = 1")
            .fetch_one(db)
            .await?,
    )
}

/// แพ็กเกจที่เปิดขาย + ข้อมูลติดต่อผู้ให้บริการ
pub async fn site(State(s): State<AppState>) -> AppResult<Json<Value>> {
    let plat = super::subscription::load_platform(&s.db).await?;
    let packages: Vec<PublicPackage> = sqlx::query_as(
        "SELECT id, name, description, price_monthly, price_yearly, max_properties, max_units, max_members,
                features, is_default
         FROM packages WHERE is_active = 1 ORDER BY sort_order, price_monthly, id",
    )
    .fetch_all(&s.db)
    .await?;
    Ok(Json(json!({
        "company": { "name": plat.company_name, "phone": plat.phone, "email": plat.email },
        "yearly_months": plat.yearly_months,
        "promo_video": video_json(&promo_url(&s.db).await?),
        "packages": packages.iter().map(|p| json!({
            "id": p.id, "name": p.name, "description": p.description,
            "price_monthly": p.price_monthly,
            "price_yearly": if p.price_yearly > 0.0 { p.price_yearly } else { crate::billing::round2(p.price_monthly * plat.yearly_months as f64) },
            "max_properties": p.max_properties, "max_units": p.max_units, "max_members": p.max_members,
            "features": p.features, "is_default": p.is_default,
        })).collect::<Vec<_>>(),
    })))
}

#[derive(Deserialize)]
pub struct ContactInput {
    name: String,
    #[serde(default)]
    phone: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    business: String,
    units: Option<i64>,
    #[serde(default)]
    message: String,
    #[serde(default)]
    consent: bool,
    /// ช่องดักบอท (ผู้ใช้จริงมองไม่เห็น ต้องว่าง)
    #[serde(default)]
    website: String,
}

pub async fn contact(
    State(s): State<AppState>,
    ip: ClientIp,
    Json(c): Json<ContactInput>,
) -> AppResult<Json<Value>> {
    s.limiter.check(
        &format!("contact:{}", ip.key()),
        5,
        std::time::Duration::from_secs(3600),
    )?;
    if !c.website.is_empty() {
        // บอทกรอกช่องที่ซ่อนไว้ — ตอบเหมือนสำเร็จแต่ไม่บันทึก
        return Ok(Json(json!({ "ok": true })));
    }
    let name = c.name.trim();
    let phone = c.phone.trim();
    let email = c.email.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อ".into()));
    }
    if phone.chars().filter(|c| c.is_ascii_digit()).count() < 9 && !email.contains('@') {
        return Err(AppError::BadRequest(
            "กรุณาระบุเบอร์โทรหรืออีเมลอย่างน้อยหนึ่งช่อง".into(),
        ));
    }
    if !c.consent {
        return Err(AppError::BadRequest(
            "กรุณายินยอมให้ติดต่อกลับตามนโยบายความเป็นส่วนตัว".into(),
        ));
    }
    let clip = |v: &str, n: usize| v.trim().chars().take(n).collect::<String>();
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO leads (name, phone, email, business, units, message, ip, consent_at)
         VALUES (?,?,?,?,?,?,?, datetime('now')) RETURNING id",
    )
    .bind(clip(name, 120))
    .bind(clip(phone, 30))
    .bind(clip(email, 200))
    .bind(clip(&c.business, 200))
    .bind(c.units.filter(|u| (1..=100_000).contains(u)))
    .bind(clip(&c.message, 2000))
    .bind(ip.0.as_deref())
    .fetch_one(&s.db)
    .await?;
    let admins: Vec<String> =
        sqlx::query_scalar("SELECT email FROM users WHERE is_super_admin = 1 AND is_active = 1")
            .fetch_all(&s.db)
            .await?;
    for to in admins {
        let _ = crate::mail::queue(
            &s.db,
            crate::mail::Email {
                to: &to,
                kind: "lead",
                subject: format!("ผู้สนใจใหม่: {name}"),
                heading: "มีผู้สนใจติดต่อจากหน้าเว็บ".into(),
                paragraphs: vec![
                    format!("ชื่อ: {name}\nโทร: {phone}\nอีเมล: {email}"),
                    format!(
                        "กิจการ: {}{}",
                        c.business.trim(),
                        c.units.map(|u| format!(" ({u} ห้อง)")).unwrap_or_default()
                    ),
                    c.message.trim().to_string(),
                ],
                button: Some((
                    "เปิดรายชื่อผู้สนใจ".into(),
                    format!("{}/admin/leads", s.public_url),
                )),
                footer: format!("รายการที่ {id}"),
            },
        )
        .await;
    }
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Lead {
    id: i64,
    name: String,
    phone: String,
    email: String,
    business: String,
    units: Option<i64>,
    message: String,
    status: String,
    note: String,
    created_at: String,
}

#[derive(Deserialize)]
pub struct LeadQuery {
    status: Option<String>,
}

pub async fn leads(
    State(s): State<AppState>,
    _: SuperAdmin,
    Query(q): Query<LeadQuery>,
) -> AppResult<Json<Value>> {
    let rows: Vec<Lead> = sqlx::query_as(
        "SELECT id, name, phone, email, business, units, message, status, note, created_at FROM leads
         WHERE (?1 IS NULL OR status = ?1) ORDER BY id DESC LIMIT 500",
    )
    .bind(&q.status)
    .fetch_all(&s.db)
    .await?;
    let new: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM leads WHERE status = 'new'")
        .fetch_one(&s.db)
        .await?;
    Ok(Json(json!({ "leads": rows, "new": new })))
}

#[derive(Deserialize)]
pub struct LeadPatch {
    status: Option<String>,
    note: Option<String>,
}

pub async fn update_lead(
    State(s): State<AppState>,
    _: SuperAdmin,
    Path(id): Path<i64>,
    Json(p): Json<LeadPatch>,
) -> AppResult<Json<Lead>> {
    if let Some(st) = &p.status {
        validate_in("status", st, &["new", "contacted", "won", "lost"])?;
    }
    sqlx::query_as(
        "UPDATE leads SET status = COALESCE(?, status), note = COALESCE(?, note) WHERE id = ?
         RETURNING id, name, phone, email, business, units, message, status, note, created_at",
    )
    .bind(&p.status)
    .bind(p.note.as_deref().map(str::trim))
    .bind(id)
    .fetch_optional(&s.db)
    .await?
    .map(Json)
    .ok_or(AppError::NotFound)
}

// ---------- ตั้งค่าหน้า landing ----------

pub async fn admin_site(State(s): State<AppState>, _: SuperAdmin) -> AppResult<Json<Value>> {
    let url = promo_url(&s.db).await?;
    Ok(Json(
        json!({ "promo_video_url": url, "promo_video": video_json(&url) }),
    ))
}

#[derive(Deserialize)]
pub struct SiteInput {
    #[serde(default)]
    promo_video_url: String,
}

pub async fn update_site(
    State(s): State<AppState>,
    admin: SuperAdmin,
    Json(i): Json<SiteInput>,
) -> AppResult<Json<Value>> {
    let url = i.promo_video_url.trim();
    if !url.is_empty() && parse_video(url).is_none() {
        return Err(AppError::BadRequest(
            "ใส่ลิงก์ YouTube (youtube.com/watch?v=…, youtu.be/…, shorts) หรือ Vimeo".into(),
        ));
    }
    sqlx::query("UPDATE platform_settings SET promo_video_url = ? WHERE id = 1")
        .bind(url)
        .execute(&s.db)
        .await?;
    admin_site(State(s), admin).await
}

#[cfg(test)]
mod tests {
    use super::parse_video;

    #[test]
    fn parses_video_links() {
        let id = Some(("youtube", "dQw4w9WgXcQ".to_string()));
        assert_eq!(
            parse_video("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            id
        );
        assert_eq!(
            parse_video("https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10"),
            id
        );
        assert_eq!(parse_video("https://youtu.be/dQw4w9WgXcQ?si=abc"), id);
        assert_eq!(
            parse_video("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
            id
        );
        assert_eq!(parse_video("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), id);
        assert_eq!(
            parse_video("https://vimeo.com/123456789"),
            Some(("vimeo", "123456789".into()))
        );
        assert_eq!(
            parse_video("https://evil.example/watch?v=dQw4w9WgXcQ"),
            None
        );
        assert_eq!(parse_video("javascript:alert(1)"), None);
        assert_eq!(parse_video("https://youtu.be/short"), None);
    }
}
