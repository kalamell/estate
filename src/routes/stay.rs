//! หน้าจองห้องพักออนไลน์ (สาธารณะ) และการอนุมัติคำขอจองโดยทีมงาน

use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::{bookings::sync_unit_status, calendar::find_conflict};
use crate::{
    auth::OrgCtx,
    error::{AppError, AppResult},
    models::PackageFeatures,
    promptpay, uploads, AppState,
};

#[derive(sqlx::FromRow)]
struct StayProperty {
    id: i64,
    org_id: i64,
    name: String,
    address: String,
    lat: Option<f64>,
    lng: Option<f64>,
    booking_intro: String,
    check_in_time: String,
    check_out_time: String,
    min_nights: i64,
    deposit_percent: f64,
    org_name: String,
    org_phone: String,
    theme: String,
}

/// โครงการที่เปิดรับจองออนไลน์ (องค์กรต้องใช้งานได้และแพ็กเกจรองรับห้องพักรายวัน)
async fn property_by_slug(db: &SqlitePool, slug: &str) -> AppResult<StayProperty> {
    let row: Option<(StayProperty, sqlx::types::Json<PackageFeatures>, bool)> = sqlx::query_as::<_, StayRow>(
        "SELECT p.id, p.org_id, p.name, p.address, p.lat, p.lng, p.booking_intro, p.check_in_time, p.check_out_time,
                p.min_nights, p.deposit_percent, o.name AS org_name, o.phone AS org_phone, o.theme,
                pk.features,
                (o.status IN ('trial','active') AND (o.ends_at IS NULL OR date(o.ends_at, '+' || (SELECT grace_days FROM platform_settings WHERE id = 1) || ' days') >= date('now'))) AS active
         FROM properties p JOIN organizations o ON o.id = p.org_id JOIN packages pk ON pk.id = o.package_id
         WHERE p.booking_slug = ? AND p.booking_enabled = 1",
    )
    .bind(slug)
    .fetch_optional(db)
    .await?
    .map(|r| r.split());
    match row {
        Some((p, features, true)) if features.0.short_stay => Ok(p),
        _ => Err(AppError::NotFound),
    }
}

#[derive(sqlx::FromRow)]
struct StayRow {
    #[sqlx(flatten)]
    property: StayProperty,
    features: sqlx::types::Json<PackageFeatures>,
    active: bool,
}

impl StayRow {
    fn split(self) -> (StayProperty, sqlx::types::Json<PackageFeatures>, bool) {
        (self.property, self.features, self.active)
    }
}

#[derive(Serialize, sqlx::FromRow)]
struct StayUnit {
    id: i64,
    name: String,
    floor: i64,
    rate_daily: f64,
    width: f64,
    length: f64,
    deposit: f64,
}

async fn bookable_units(db: &SqlitePool, property_id: i64) -> AppResult<Vec<StayUnit>> {
    Ok(sqlx::query_as(
        "SELECT id, name, floor, rate_daily, width, length, deposit FROM units
         WHERE property_id = ? AND rate_daily > 0 AND status != 'maintenance' ORDER BY floor, name",
    )
    .bind(property_id)
    .fetch_all(db)
    .await?)
}

pub async fn stay(State(s): State<AppState>, Path(slug): Path<String>) -> AppResult<Json<Value>> {
    let p = property_by_slug(&s.db, &slug).await?;
    Ok(Json(json!({
        "property": {
            "name": p.name, "address": p.address, "lat": p.lat, "lng": p.lng, "intro": p.booking_intro,
            "check_in_time": p.check_in_time, "check_out_time": p.check_out_time,
            "min_nights": p.min_nights, "deposit_percent": p.deposit_percent,
        },
        "org": { "name": p.org_name, "phone": p.org_phone, "theme": p.theme },
        "units": bookable_units(&s.db, p.id).await?,
    })))
}

#[derive(Deserialize)]
pub struct RangeQuery {
    from: NaiveDate,
    to: NaiveDate,
}

/// ช่วงวันที่ไม่ว่าง (ไม่เปิดเผยรายละเอียดผู้จอง)
pub async fn availability(
    State(s): State<AppState>,
    Path(slug): Path<String>,
    Query(q): Query<RangeQuery>,
) -> AppResult<Json<Value>> {
    let p = property_by_slug(&s.db, &slug).await?;
    if q.to <= q.from || (q.to - q.from).num_days() > 400 {
        return Err(AppError::BadRequest("ช่วงวันที่ไม่ถูกต้อง".into()));
    }
    let busy: Vec<(i64, NaiveDate, NaiveDate)> = sqlx::query_as(
        "SELECT b.unit_id, b.start_date, COALESCE(b.end_date, ?3) FROM bookings b JOIN units u ON u.id = b.unit_id
         WHERE u.property_id = ?1 AND b.status IN ('reserved','active')
           AND b.start_date < ?3 AND COALESCE(b.end_date, '9999-12-31') > ?2
         UNION ALL
         SELECT c.unit_id, c.start_date, c.end_date FROM calendar_blocks c JOIN units u ON u.id = c.unit_id
         WHERE u.property_id = ?1 AND c.start_date < ?3 AND c.end_date > ?2
         UNION ALL
         SELECT r.unit_id, r.check_in, r.check_out FROM booking_requests r
         WHERE r.property_id = ?1 AND r.status = 'pending' AND r.expires_at > datetime('now')
           AND r.check_in < ?3 AND r.check_out > ?2",
    )
    .bind(p.id)
    .bind(q.from)
    .bind(q.to)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(json!({
        "busy": busy.into_iter().map(|(unit_id, start, end)| json!({ "unit_id": unit_id, "start": start, "end": end })).collect::<Vec<_>>()
    })))
}

#[derive(Deserialize)]
pub struct RequestInput {
    unit_id: i64,
    check_in: NaiveDate,
    check_out: NaiveDate,
    #[serde(default = "one")]
    guests: i64,
    guest_name: String,
    phone: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    note: String,
    /// ยินยอมให้เก็บและใช้ข้อมูลส่วนบุคคลเพื่อการจอง (PDPA)
    #[serde(default)]
    consent: bool,
}

fn one() -> i64 {
    1
}

pub async fn create_request(
    State(s): State<AppState>,
    ip: crate::auth::ClientIp,
    Path(slug): Path<String>,
    Json(r): Json<RequestInput>,
) -> AppResult<Json<Value>> {
    s.limiter.check(
        &format!("stay-request:{}", ip.key()),
        10,
        std::time::Duration::from_secs(3600),
    )?;
    if !r.consent {
        return Err(AppError::BadRequest(
            "กรุณายินยอมให้ใช้ข้อมูลส่วนบุคคลเพื่อการจอง".into(),
        ));
    }
    let p = property_by_slug(&s.db, &slug).await?;
    let unit = bookable_units(&s.db, p.id)
        .await?
        .into_iter()
        .find(|u| u.id == r.unit_id)
        .ok_or_else(|| AppError::BadRequest("ไม่พบห้องที่เลือก".into()))?;
    let today = Local::now().date_naive();
    let nights = (r.check_out - r.check_in).num_days();
    if r.check_in < today {
        return Err(AppError::BadRequest("วันเช็คอินต้องไม่เป็นวันที่ผ่านมาแล้ว".into()));
    }
    if nights < p.min_nights.max(1) {
        return Err(AppError::BadRequest(format!(
            "ต้องจองขั้นต่ำ {} คืน",
            p.min_nights.max(1)
        )));
    }
    if nights > 90 {
        return Err(AppError::BadRequest("จองออนไลน์ได้สูงสุด 90 คืน".into()));
    }
    let name = r.guest_name.trim();
    let phone: String = r
        .phone
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '+')
        .collect();
    if name.is_empty() || name.chars().count() > 100 || phone.len() < 9 || phone.len() > 15 {
        return Err(AppError::BadRequest("กรุณากรอกชื่อและเบอร์โทรที่ถูกต้อง".into()));
    }
    // กันสแปม: เบอร์เดียวกันมีคำขอรออนุมัติได้ไม่เกิน 3 รายการ
    let pending: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM booking_requests WHERE phone = ? AND status = 'pending' AND expires_at > datetime('now')",
    )
    .bind(&phone)
    .fetch_one(&s.db)
    .await?;
    if pending >= 3 {
        return Err(AppError::Conflict(
            "มีคำขอจองที่รออนุมัติจากเบอร์นี้หลายรายการแล้ว กรุณาติดต่อที่พัก".into(),
        ));
    }
    if let Some(msg) = find_conflict(&s.db, unit.id, r.check_in, r.check_out, None).await? {
        tracing::debug!(%msg, "คำขอจองชนกับช่วงที่ไม่ว่าง");
        return Err(AppError::Conflict("ช่วงวันที่นี้ไม่ว่างแล้ว กรุณาเลือกวันอื่น".into()));
    }
    let quote = super::pricing::quote_unit(&s.db, unit.id, r.check_in, r.check_out).await?;
    let total = quote.total;
    let deposit = (total * p.deposit_percent.clamp(0.0, 100.0) / 100.0).round();
    let token = {
        use rand::RngCore;
        let mut b = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut b);
        hex::encode(b)
    };
    sqlx::query(
        "INSERT INTO booking_requests (org_id, property_id, unit_id, token, check_in, check_out, nights, rate, total,
            deposit_amount, guests, guest_name, phone, email, note, expires_at, consent_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', '+24 hours'), datetime('now'))",
    )
    .bind(p.org_id)
    .bind(p.id)
    .bind(unit.id)
    .bind(&token)
    .bind(r.check_in)
    .bind(r.check_out)
    .bind(nights)
    .bind(quote.average_rate)
    .bind(total)
    .bind(deposit)
    .bind(r.guests.clamp(1, 20))
    .bind(name)
    .bind(&phone)
    .bind(r.email.trim())
    .bind(r.note.trim().chars().take(1000).collect::<String>())
    .execute(&s.db)
    .await?;
    Ok(Json(json!({ "token": token })))
}

/// คำขอที่ไม่มีสลิปและเลยเวลาจะหมดอายุ (คืนห้องให้คนอื่นจอง)
async fn expire_stale(db: &SqlitePool) -> AppResult<()> {
    sqlx::query("UPDATE booking_requests SET status = 'expired' WHERE status = 'pending' AND expires_at <= datetime('now')")
        .execute(db)
        .await?;
    Ok(())
}

#[derive(Serialize, sqlx::FromRow)]
pub struct RequestRow {
    id: i64,
    status: String,
    property_id: i64,
    property_name: String,
    unit_id: i64,
    unit_name: String,
    check_in: NaiveDate,
    check_out: NaiveDate,
    nights: i64,
    rate: f64,
    total: f64,
    deposit_amount: f64,
    guests: i64,
    guest_name: String,
    phone: String,
    email: String,
    note: String,
    slip_url: Option<String>,
    reject_reason: Option<String>,
    booking_id: Option<i64>,
    expires_at: String,
    created_at: String,
}

const REQUEST_SELECT: &str = "SELECT r.id, r.status, r.property_id, p.name AS property_name, r.unit_id,
        u.name AS unit_name, r.check_in, r.check_out, r.nights, r.rate, r.total, r.deposit_amount, r.guests,
        r.guest_name, r.phone, r.email, r.note, r.slip_url, r.reject_reason, r.booking_id, r.expires_at, r.created_at
    FROM booking_requests r JOIN properties p ON p.id = r.property_id JOIN units u ON u.id = r.unit_id";

pub async fn request_status(
    State(s): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<Json<Value>> {
    expire_stale(&s.db).await?;
    let r: RequestRow = sqlx::query_as(&format!("{REQUEST_SELECT} WHERE r.token = ?"))
        .bind(&token)
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let (pp, org_name, org_phone, theme): (Option<String>, String, String, String) = sqlx::query_as(
        "SELECT p.promptpay_id, o.name, o.phone, o.theme FROM properties p JOIN organizations o ON o.id = p.org_id
         WHERE p.id = ?",
    )
    .bind(r.property_id)
    .fetch_one(&s.db)
    .await?;
    let payload = (r.status == "pending" && r.deposit_amount > 0.0)
        .then(|| pp.and_then(|id| promptpay::payload(&id, Some(r.deposit_amount))))
        .flatten();
    Ok(Json(json!({
        "request": {
            "status": r.status, "unit_name": r.unit_name, "property_name": r.property_name,
            "check_in": r.check_in, "check_out": r.check_out, "nights": r.nights, "rate": r.rate, "total": r.total,
            "deposit_amount": r.deposit_amount, "guest_name": r.guest_name, "created_at": r.created_at,
            "expires_at": r.expires_at, "slip_url": r.slip_url, "reject_reason": r.reject_reason,
        },
        "promptpay_payload": payload,
        "org": { "name": org_name, "phone": org_phone, "theme": theme },
    })))
}

/// แนบสลิปมัดจำ — กันห้องต่ออีก 72 ชั่วโมงระหว่างรอทีมงานตรวจ
pub async fn upload_slip(
    State(s): State<AppState>,
    ip: crate::auth::ClientIp,
    Path(token): Path<String>,
    form: Multipart,
) -> AppResult<Json<Value>> {
    s.limiter.check(
        &format!("slip:{}", ip.key()),
        20,
        std::time::Duration::from_secs(3600),
    )?;
    expire_stale(&s.db).await?;
    let (status, org_id): (String, i64) =
        sqlx::query_as("SELECT status, org_id FROM booking_requests WHERE token = ?")
            .bind(&token)
            .fetch_optional(&s.db)
            .await?
            .ok_or(AppError::NotFound)?;
    if status != "pending" {
        return Err(AppError::Conflict("คำขอนี้ไม่อยู่ในสถานะรอชำระ".into()));
    }
    let form = uploads::parse_for(&s, org_id, form, "slip").await?;
    let url = form
        .photos
        .first()
        .cloned()
        .ok_or_else(|| AppError::BadRequest("กรุณาแนบรูปสลิป".into()))?;
    sqlx::query(
        "UPDATE booking_requests SET slip_url = ?, expires_at = MAX(expires_at, datetime('now', '+72 hours'))
         WHERE token = ?",
    )
    .bind(&url)
    .bind(&token)
    .execute(&s.db)
    .await?;
    Ok(Json(json!({ "slip_url": url })))
}

// ---------- ทีมงาน ----------

#[derive(Deserialize)]
pub struct StatusQuery {
    status: Option<String>,
}

pub async fn list_requests(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<StatusQuery>,
) -> AppResult<Json<Vec<RequestRow>>> {
    expire_stale(&s.db).await?;
    Ok(Json(
        sqlx::query_as(&format!(
            "{REQUEST_SELECT} WHERE r.org_id = ?1 AND (?2 IS NULL OR r.status = ?2)
             ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC LIMIT 300"
        ))
        .bind(ctx.org_id)
        .bind(q.status)
        .fetch_all(&s.db)
        .await?,
    ))
}

async fn fetch_request(db: &SqlitePool, org_id: i64, id: i64) -> AppResult<RequestRow> {
    Ok(
        sqlx::query_as(&format!("{REQUEST_SELECT} WHERE r.id = ? AND r.org_id = ?"))
            .bind(id)
            .bind(org_id)
            .fetch_one(db)
            .await?,
    )
}

#[derive(Deserialize)]
pub struct ApproveInput {
    #[serde(default)]
    deposit_paid: bool,
}

/// อนุมัติ: สร้าง/ใช้ผู้เช่าเดิม (ตามเบอร์โทร) แล้วสร้างการจองรายวัน
pub async fn approve(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(a): Json<ApproveInput>,
) -> AppResult<Json<Value>> {
    let r = fetch_request(&s.db, ctx.org_id, id).await?;
    if r.status == "approved" || r.status == "rejected" {
        return Err(AppError::Conflict("คำขอนี้ดำเนินการไปแล้ว".into()));
    }
    if let Some(msg) = find_conflict(&s.db, r.unit_id, r.check_in, r.check_out, Some(id)).await? {
        return Err(AppError::Conflict(msg));
    }
    let mut tx = s.db.begin().await?;
    let existing: Option<i64> =
        sqlx::query_scalar("SELECT id FROM tenants WHERE org_id = ? AND phone = ? LIMIT 1")
            .bind(ctx.org_id)
            .bind(&r.phone)
            .fetch_optional(&mut *tx)
            .await?;
    let tenant_id = match existing {
        Some(id) => id,
        None => {
            sqlx::query_scalar(
                "INSERT INTO tenants (org_id, full_name, phone, email, note, portal_token) VALUES (?,?,?,?,?,?) RETURNING id",
            )
            .bind(ctx.org_id)
            .bind(&r.guest_name)
            .bind(&r.phone)
            .bind(&r.email)
            .bind("จองผ่านหน้าเว็บ")
            .bind(super::tenants::new_portal_token())
            .fetch_one(&mut *tx)
            .await?
        }
    };
    sqlx::query(
        "UPDATE tenants SET consent_at = COALESCE(consent_at, (SELECT consent_at FROM booking_requests WHERE id = ?)),
            consent_source = COALESCE(consent_source, 'online_booking') WHERE id = ?",
    )
    .bind(id)
    .bind(tenant_id)
    .execute(&mut *tx)
    .await?;
    let today = Local::now().date_naive();
    let booking_id: i64 = sqlx::query_scalar(
        "INSERT INTO bookings (unit_id, tenant_id, kind, start_date, end_date, price, deposit_amount, deposit_status, status, source)
         VALUES (?, ?, 'short_stay', ?, ?, ?, ?, ?, ?, 'direct') RETURNING id",
    )
    .bind(r.unit_id)
    .bind(tenant_id)
    .bind(r.check_in)
    .bind(r.check_out)
    .bind(r.rate)
    .bind(r.deposit_amount)
    .bind(if a.deposit_paid { "paid" } else { "pending" })
    .bind(if r.check_in <= today { "active" } else { "reserved" })
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("UPDATE booking_requests SET status = 'approved', booking_id = ? WHERE id = ?")
        .bind(booking_id)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sync_unit_status(&mut tx, r.unit_id).await?;
    tx.commit().await?;
    Ok(Json(json!({ "booking_id": booking_id })))
}

#[derive(Deserialize)]
pub struct RejectInput {
    reason: String,
}

pub async fn reject(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(r): Json<RejectInput>,
) -> AppResult<Json<Value>> {
    let req = fetch_request(&s.db, ctx.org_id, id).await?;
    if req.status == "approved" || req.status == "rejected" {
        return Err(AppError::Conflict("คำขอนี้ดำเนินการไปแล้ว".into()));
    }
    if r.reason.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุเหตุผล".into()));
    }
    sqlx::query("UPDATE booking_requests SET status = 'rejected', reject_reason = ? WHERE id = ?")
        .bind(r.reason.trim())
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

/// ใช้ตรวจ slug ตอนบันทึกโครงการ
pub(crate) fn valid_slug(slug: &str) -> bool {
    (3..=40).contains(&slug.len())
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !slug.starts_with('-')
        && !slug.ends_with('-')
}

#[derive(Deserialize)]
pub struct QuoteQuery {
    unit_id: i64,
    check_in: NaiveDate,
    check_out: NaiveDate,
}

/// ราคาตามฤดูกาล + ส่วนลดพักหลายคืน + มัดจำ สำหรับหน้าจองสาธารณะ
pub async fn quote(
    State(s): State<AppState>,
    Path(slug): Path<String>,
    Query(q): Query<QuoteQuery>,
) -> AppResult<Json<Value>> {
    let p = property_by_slug(&s.db, &slug).await?;
    if !bookable_units(&s.db, p.id)
        .await?
        .iter()
        .any(|u| u.id == q.unit_id)
    {
        return Err(AppError::NotFound);
    }
    let quote = super::pricing::quote_unit(&s.db, q.unit_id, q.check_in, q.check_out).await?;
    let deposit = (quote.total * p.deposit_percent.clamp(0.0, 100.0) / 100.0).round();
    let mut v = serde_json::to_value(quote).map_err(|e| AppError::Internal(e.into()))?;
    v["deposit_amount"] = json!(deposit);
    Ok(Json(v))
}

/// ราคารายคืนของทุกห้อง (แสดงในปฏิทินหน้าจอง)
pub async fn prices(
    State(s): State<AppState>,
    Path(slug): Path<String>,
    Query(q): Query<RangeQuery>,
) -> AppResult<Json<Value>> {
    let p = property_by_slug(&s.db, &slug).await?;
    let units: Vec<(i64, f64)> = bookable_units(&s.db, p.id)
        .await?
        .iter()
        .map(|u| (u.id, u.rate_daily))
        .collect();
    let prices = super::pricing::prices_for(&s.db, &units, p.id, q.from, q.to).await?;
    let map: serde_json::Map<String, Value> = prices
        .into_iter()
        .map(|(id, nights)| {
            let list: Vec<Value> = nights
                .into_iter()
                .map(|n| json!({ "date": n.date, "price": n.price }))
                .collect();
            (id.to_string(), Value::Array(list))
        })
        .collect();
    Ok(Json(json!({ "units": map })))
}
