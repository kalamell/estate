//! ปฏิทินการจองรวม + ซิงก์ช่องทางขาย (Airbnb / Booking.com / Agoda) ผ่าน iCal

use std::collections::HashMap;

use axum::{
    extract::{Path, Query, State},
    http::header,
    response::IntoResponse,
    Json,
};
use chrono::{Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::validate_in;
use crate::{
    auth::{ensure_unit, OrgCtx},
    error::{AppError, AppResult},
    ical, AppState,
};

const SOURCES: &[&str] = &["airbnb", "booking", "agoda", "vrbo", "other"];

pub(crate) fn source_label(source: &str) -> &'static str {
    match source {
        "airbnb" => "Airbnb",
        "booking" => "Booking.com",
        "agoda" => "Agoda",
        "vrbo" => "VRBO",
        _ => "ช่องทางอื่น",
    }
}

/// ตรวจว่าห้องว่างช่วง [start, end) หรือไม่ — รวมการจอง, วันที่ถูกปิดจากช่องทางอื่น และคำขอจองที่รออนุมัติ
pub(crate) async fn find_conflict(
    db: &SqlitePool,
    unit_id: i64,
    start: NaiveDate,
    end: NaiveDate,
    ignore_request: Option<i64>,
) -> AppResult<Option<String>> {
    let booking: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM bookings WHERE unit_id = ? AND status IN ('reserved','active')
           AND start_date < ? AND COALESCE(end_date, '9999-12-31') > ? LIMIT 1",
    )
    .bind(unit_id)
    .bind(end)
    .bind(start)
    .fetch_optional(db)
    .await?;
    if let Some(id) = booking {
        return Ok(Some(format!("ช่วงวันที่ทับซ้อนกับการจอง #{id}")));
    }
    let block: Option<(String, String, String)> = sqlx::query_as(
        "SELECT f.source, b.start_date, b.end_date FROM calendar_blocks b JOIN channel_feeds f ON f.id = b.feed_id
         WHERE b.unit_id = ? AND b.start_date < ? AND b.end_date > ? LIMIT 1",
    )
    .bind(unit_id)
    .bind(end)
    .bind(start)
    .fetch_optional(db)
    .await?;
    if let Some((source, s, e)) = block {
        return Ok(Some(format!(
            "ช่วงวันที่ถูกจองผ่าน {} แล้ว ({s} ถึง {e})",
            source_label(&source)
        )));
    }
    let request: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM booking_requests WHERE unit_id = ? AND status = 'pending' AND expires_at > datetime('now')
           AND check_in < ? AND check_out > ? AND (? IS NULL OR id != ?) LIMIT 1",
    )
    .bind(unit_id)
    .bind(end)
    .bind(start)
    .bind(ignore_request)
    .bind(ignore_request)
    .fetch_optional(db)
    .await?;
    if request.is_some() {
        return Ok(Some("มีคำขอจองออนไลน์ช่วงนี้ที่รออนุมัติอยู่".into()));
    }
    Ok(None)
}

// ---------- ปฏิทินรวม ----------

#[derive(Deserialize)]
pub struct CalendarQuery {
    from: NaiveDate,
    to: NaiveDate,
    property_id: Option<i64>,
}

#[derive(Serialize, sqlx::FromRow)]
struct CalUnit {
    id: i64,
    property_id: i64,
    property_name: String,
    name: String,
    floor: i64,
    status: String,
    rate_daily: f64,
    rent_monthly: f64,
}

#[derive(Serialize, Clone)]
struct CalEvent {
    id: String,
    #[serde(rename = "type")]
    kind: &'static str,
    unit_id: i64,
    start: NaiveDate,
    end: NaiveDate,
    title: String,
    source: String,
    status: String,
    booking_id: Option<i64>,
    request_id: Option<i64>,
    conflict: bool,
}

/// (id, unit, start, end, kind, source, status, ชื่อผู้เช่า)
type BookingRow = (
    i64,
    i64,
    NaiveDate,
    Option<NaiveDate>,
    String,
    String,
    String,
    String,
);

pub async fn calendar(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<CalendarQuery>,
) -> AppResult<Json<Value>> {
    if q.to <= q.from || (q.to - q.from).num_days() > 400 {
        return Err(AppError::BadRequest("ช่วงวันที่ไม่ถูกต้อง (สูงสุด 400 วัน)".into()));
    }
    let units: Vec<CalUnit> = sqlx::query_as(
        "SELECT u.id, u.property_id, p.name AS property_name, u.name, u.floor, u.status, u.rate_daily, u.rent_monthly
         FROM units u JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) ORDER BY p.id, u.floor, u.name",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .fetch_all(&s.db)
    .await?;
    let open_end = q.to + Duration::days(1);
    let mut events: Vec<CalEvent> = Vec::new();

    let bookings: Vec<BookingRow> = sqlx::query_as(
        "SELECT b.id, b.unit_id, b.start_date, b.end_date, b.kind, b.source, b.status, t.full_name
         FROM bookings b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
         JOIN tenants t ON t.id = b.tenant_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) AND b.status IN ('reserved','active','completed')
           AND b.start_date < ?3 AND COALESCE(b.end_date, '9999-12-31') > ?4",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .bind(q.to)
    .bind(q.from)
    .fetch_all(&s.db)
    .await?;
    for (id, unit_id, start, end, kind, source, status, name) in bookings {
        events.push(CalEvent {
            id: format!("b{id}"),
            kind: "booking",
            unit_id,
            start,
            end: end.unwrap_or(open_end),
            title: name,
            source: if kind == "lease" {
                "lease".into()
            } else {
                source
            },
            status,
            booking_id: Some(id),
            request_id: None,
            conflict: false,
        });
    }

    let blocks: Vec<(i64, i64, NaiveDate, NaiveDate, String, String)> = sqlx::query_as(
        "SELECT b.id, b.unit_id, b.start_date, b.end_date, f.source, b.summary
         FROM calendar_blocks b JOIN channel_feeds f ON f.id = b.feed_id
         JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) AND b.start_date < ?3 AND b.end_date > ?4",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .bind(q.to)
    .bind(q.from)
    .fetch_all(&s.db)
    .await?;
    for (id, unit_id, start, end, source, summary) in blocks {
        let label = source_label(&source);
        events.push(CalEvent {
            id: format!("x{id}"),
            kind: "block",
            unit_id,
            start,
            end,
            title: if summary.is_empty() {
                label.to_string()
            } else {
                format!("{label} · {summary}")
            },
            source,
            status: "blocked".into(),
            booking_id: None,
            request_id: None,
            conflict: false,
        });
    }

    let requests: Vec<(i64, i64, NaiveDate, NaiveDate, String)> = sqlx::query_as(
        "SELECT r.id, r.unit_id, r.check_in, r.check_out, r.guest_name FROM booking_requests r
         WHERE r.org_id = ?1 AND (?2 IS NULL OR r.property_id = ?2) AND r.status = 'pending'
           AND r.expires_at > datetime('now') AND r.check_in < ?3 AND r.check_out > ?4",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .bind(q.to)
    .bind(q.from)
    .fetch_all(&s.db)
    .await?;
    for (id, unit_id, start, end, guest) in requests {
        events.push(CalEvent {
            id: format!("r{id}"),
            kind: "request",
            unit_id,
            start,
            end,
            title: format!("คำขอจอง · {guest}"),
            source: "direct".into(),
            status: "pending".into(),
            booking_id: None,
            request_id: Some(id),
            conflict: false,
        });
    }

    // ทำเครื่องหมายช่วงที่ซ้อนกันในห้องเดียวกัน (ไม่นับการเช่าที่สิ้นสุดแล้ว)
    let mut by_unit: HashMap<i64, Vec<usize>> = HashMap::new();
    for (i, e) in events.iter().enumerate() {
        if e.status != "completed" {
            by_unit.entry(e.unit_id).or_default().push(i);
        }
    }
    let mut flagged = vec![false; events.len()];
    for idx in by_unit.values() {
        for (a, &i) in idx.iter().enumerate() {
            for &j in &idx[a + 1..] {
                if events[i].start < events[j].end && events[j].start < events[i].end {
                    flagged[i] = true;
                    flagged[j] = true;
                }
            }
        }
    }
    for (e, f) in events.iter_mut().zip(flagged) {
        e.conflict = f;
    }
    events.sort_by(|a, b| a.unit_id.cmp(&b.unit_id).then(a.start.cmp(&b.start)));
    Ok(Json(json!({ "units": units, "events": events })))
}

// ---------- ช่องทางขาย ----------

#[derive(Serialize, sqlx::FromRow)]
pub struct Feed {
    id: i64,
    unit_id: i64,
    unit_name: String,
    property_name: String,
    source: String,
    name: String,
    url: String,
    last_synced_at: Option<String>,
    last_status: Option<String>,
    last_error: Option<String>,
    events_count: i64,
}

const FEED_SELECT: &str = "SELECT f.id, f.unit_id, u.name AS unit_name, p.name AS property_name, f.source, f.name,
        f.url, f.last_synced_at, f.last_status, f.last_error,
        (SELECT COUNT(*) FROM calendar_blocks b WHERE b.feed_id = f.id) AS events_count
    FROM channel_feeds f JOIN units u ON u.id = f.unit_id JOIN properties p ON p.id = u.property_id";

fn new_token() -> String {
    use rand::RngCore;
    let mut b = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut b);
    hex::encode(b)
}

async fn export_url(s: &AppState, unit_id: i64) -> AppResult<String> {
    let token: Option<String> = sqlx::query_scalar("SELECT ical_token FROM units WHERE id = ?")
        .bind(unit_id)
        .fetch_one(&s.db)
        .await?;
    let token = match token {
        Some(t) => t,
        None => {
            let t = new_token();
            sqlx::query("UPDATE units SET ical_token = ? WHERE id = ?")
                .bind(&t)
                .bind(unit_id)
                .execute(&s.db)
                .await?;
            t
        }
    };
    Ok(format!("{}/ical/{token}.ics", s.public_url))
}

pub async fn unit_channels(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(unit_id): Path<i64>,
) -> AppResult<Json<Value>> {
    ensure_unit(&s.db, ctx.org_id, unit_id).await?;
    let feeds: Vec<Feed> =
        sqlx::query_as(&format!("{FEED_SELECT} WHERE f.unit_id = ? ORDER BY f.id"))
            .bind(unit_id)
            .fetch_all(&s.db)
            .await?;
    Ok(Json(
        json!({ "export_url": export_url(&s, unit_id).await?, "feeds": feeds }),
    ))
}

#[derive(Deserialize)]
pub struct ChannelQuery {
    property_id: Option<i64>,
}

pub async fn list_channels(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ChannelQuery>,
) -> AppResult<Json<Vec<Feed>>> {
    Ok(Json(
        sqlx::query_as(&format!(
            "{FEED_SELECT} WHERE f.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) ORDER BY p.id, u.floor, u.name, f.id"
        ))
        .bind(ctx.org_id)
        .bind(q.property_id)
        .fetch_all(&s.db)
        .await?,
    ))
}

#[derive(Deserialize)]
pub struct FeedInput {
    source: String,
    #[serde(default)]
    name: String,
    url: String,
}

pub async fn add_channel(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(unit_id): Path<i64>,
    Json(f): Json<FeedInput>,
) -> AppResult<Json<Value>> {
    ctx.require_feature(ctx.features.short_stay, "การเชื่อมช่องทางขาย")?;
    ensure_unit(&s.db, ctx.org_id, unit_id).await?;
    validate_in("source", &f.source, SOURCES)?;
    let url = f.url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.len() > 2000 {
        return Err(AppError::BadRequest("ลิงก์ iCal ต้องขึ้นต้นด้วย https://".into()));
    }
    let name = if f.name.trim().is_empty() {
        source_label(&f.source).to_string()
    } else {
        f.name.trim().to_string()
    };
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO channel_feeds (org_id, unit_id, source, name, url) VALUES (?,?,?,?,?) RETURNING id",
    )
    .bind(ctx.org_id)
    .bind(unit_id)
    .bind(&f.source)
    .bind(name)
    .bind(url)
    .fetch_one(&s.db)
    .await?;
    let sync = sync_feed(&s, id).await;
    let feed: Feed = sqlx::query_as(&format!("{FEED_SELECT} WHERE f.id = ?"))
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    Ok(Json(json!({ "feed": feed, "sync": sync.ok() })))
}

async fn ensure_feed(db: &SqlitePool, org_id: i64, id: i64) -> AppResult<()> {
    sqlx::query_scalar::<_, i64>("SELECT id FROM channel_feeds WHERE id = ? AND org_id = ?")
        .bind(id)
        .bind(org_id)
        .fetch_optional(db)
        .await?
        .map(|_| ())
        .ok_or(AppError::NotFound)
}

pub async fn delete_channel(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ensure_feed(&s.db, ctx.org_id, id).await?;
    sqlx::query("DELETE FROM channel_feeds WHERE id = ?")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

pub async fn sync_channel(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<SyncResult>> {
    ensure_feed(&s.db, ctx.org_id, id).await?;
    Ok(Json(sync_feed(&s, id).await?))
}

pub async fn regenerate_export(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(unit_id): Path<i64>,
) -> AppResult<Json<Value>> {
    ensure_unit(&s.db, ctx.org_id, unit_id).await?;
    sqlx::query("UPDATE units SET ical_token = ? WHERE id = ?")
        .bind(new_token())
        .bind(unit_id)
        .execute(&s.db)
        .await?;
    Ok(Json(
        json!({ "export_url": export_url(&s, unit_id).await? }),
    ))
}

#[derive(Serialize)]
pub struct SyncResult {
    imported: usize,
    removed: u64,
    conflicts: Vec<String>,
}

fn is_internal(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.octets()[0] == 100 && (v4.octets()[1] & 0xC0) == 64 // CGNAT
        }
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback() || v6.is_unspecified() || (v6.segments()[0] & 0xfe00) == 0xfc00 // unique local
                || (v6.segments()[0] & 0xffc0) == 0xfe80 // link local
                || v6.to_ipv4_mapped().is_some_and(|v4| is_internal(v4.into()))
        }
    }
}

/// กัน SSRF: ไม่ให้ระบบไปดึง URL ภายในเครือข่าย (เช่น metadata ของคลาวด์)
async fn check_public_url(s: &AppState, url: &str) -> Result<(), String> {
    if s.allow_private_urls {
        return Ok(());
    }
    let parsed = reqwest::Url::parse(url).map_err(|_| "ลิงก์ไม่ถูกต้อง".to_string())?;
    let host = parsed.host_str().ok_or("ลิงก์ไม่ถูกต้อง")?;
    let port = parsed.port_or_known_default().unwrap_or(443);
    let addrs = tokio::net::lookup_host((host, port))
        .await
        .map_err(|_| "หาโดเมนของลิงก์ไม่พบ".to_string())?;
    let mut any = false;
    for addr in addrs {
        any = true;
        if is_internal(addr.ip()) {
            return Err("ไม่อนุญาตลิงก์ที่ชี้ไปยังเครือข่ายภายใน".into());
        }
    }
    if any {
        Ok(())
    } else {
        Err("หาโดเมนของลิงก์ไม่พบ".into())
    }
}

async fn fetch_feed(s: &AppState, url: &str) -> Result<String, String> {
    check_public_url(s, url).await?;
    let res = s
        .http
        .get(url)
        .send()
        .await
        .map_err(|e| format!("ดึงปฏิทินไม่ได้: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("ช่องทางตอบกลับ {}", res.status()));
    }
    let bytes = res.bytes().await.map_err(|e| format!("อ่านข้อมูลไม่ได้: {e}"))?;
    if bytes.len() > 5 * 1024 * 1024 {
        return Err("ไฟล์ปฏิทินใหญ่เกินไป".into());
    }
    let text = String::from_utf8_lossy(&bytes).to_string();
    if !text.contains("BEGIN:VCALENDAR") {
        return Err("ลิงก์นี้ไม่ใช่ปฏิทิน iCal".into());
    }
    Ok(text)
}

/// ดึง iCal แล้วแทนที่ช่วงวันที่ถูกปิดของ feed นี้ทั้งหมด (ข้ามรายการที่จบไปเกิน 30 วัน)
pub(crate) async fn sync_feed(s: &AppState, feed_id: i64) -> AppResult<SyncResult> {
    let (unit_id, url, source): (i64, String, String) =
        sqlx::query_as("SELECT unit_id, url, source FROM channel_feeds WHERE id = ?")
            .bind(feed_id)
            .fetch_one(&s.db)
            .await?;
    let text = match fetch_feed(s, &url).await {
        Ok(t) => t,
        Err(e) => {
            sqlx::query(
                "UPDATE channel_feeds SET last_synced_at = datetime('now'), last_status = 'error', last_error = ? WHERE id = ?",
            )
            .bind(&e)
            .bind(feed_id)
            .execute(&s.db)
            .await?;
            return Err(AppError::BadRequest(e));
        }
    };
    let cutoff = Local::now().date_naive() - Duration::days(30);
    let events: Vec<ical::Event> = ical::parse(&text)
        .into_iter()
        .filter(|e| e.end >= cutoff)
        .collect();

    let mut tx = s.db.begin().await?;
    sqlx::query("CREATE TEMP TABLE IF NOT EXISTS sync_uids (uid TEXT PRIMARY KEY)")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM sync_uids")
        .execute(&mut *tx)
        .await?;
    for e in &events {
        sqlx::query(
            "INSERT INTO calendar_blocks (feed_id, unit_id, uid, start_date, end_date, summary) VALUES (?,?,?,?,?,?)
             ON CONFLICT (feed_id, uid) DO UPDATE SET start_date = excluded.start_date, end_date = excluded.end_date,
                summary = excluded.summary, updated_at = datetime('now')",
        )
        .bind(feed_id)
        .bind(unit_id)
        .bind(&e.uid)
        .bind(e.start)
        .bind(e.end)
        .bind(e.summary.chars().take(200).collect::<String>())
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT OR IGNORE INTO sync_uids (uid) VALUES (?)")
            .bind(&e.uid)
            .execute(&mut *tx)
            .await?;
    }
    let removed = sqlx::query(
        "DELETE FROM calendar_blocks WHERE feed_id = ? AND uid NOT IN (SELECT uid FROM sync_uids)",
    )
    .bind(feed_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    sqlx::query("DROP TABLE sync_uids")
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE channel_feeds SET last_synced_at = datetime('now'), last_status = 'ok', last_error = NULL WHERE id = ?",
    )
    .bind(feed_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    // แจ้งช่วงที่ชนกับการจองในระบบหรือช่องทางอื่น
    let mut conflicts = Vec::new();
    let today = Local::now().date_naive();
    for e in events.iter().filter(|e| e.end > today) {
        let booking: Option<(i64, String)> = sqlx::query_as(
            "SELECT b.id, t.full_name FROM bookings b JOIN tenants t ON t.id = b.tenant_id
             WHERE b.unit_id = ? AND b.status IN ('reserved','active')
               AND b.start_date < ? AND COALESCE(b.end_date, '9999-12-31') > ? LIMIT 1",
        )
        .bind(unit_id)
        .bind(e.end)
        .bind(e.start)
        .fetch_optional(&s.db)
        .await?;
        if let Some((id, name)) = booking {
            conflicts.push(format!(
                "{} {} ถึง {} ชนกับการจอง #{id} ({name})",
                source_label(&source),
                e.start,
                e.end
            ));
        }
        let other: Option<String> = sqlx::query_scalar(
            "SELECT f.source FROM calendar_blocks b JOIN channel_feeds f ON f.id = b.feed_id
             WHERE b.unit_id = ? AND b.feed_id != ? AND b.start_date < ? AND b.end_date > ? LIMIT 1",
        )
        .bind(unit_id)
        .bind(feed_id)
        .bind(e.end)
        .bind(e.start)
        .fetch_optional(&s.db)
        .await?;
        if let Some(o) = other {
            conflicts.push(format!(
                "{} {} ถึง {} ชนกับ {}",
                source_label(&source),
                e.start,
                e.end,
                source_label(&o)
            ));
        }
    }
    Ok(SyncResult {
        imported: events.len(),
        removed,
        conflicts,
    })
}

/// ซิงก์ทุก feed ทุก 30 นาที
pub fn spawn_sync(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(30 * 60));
        loop {
            tick.tick().await;
            let ids: Vec<i64> = match sqlx::query_scalar("SELECT id FROM channel_feeds")
                .fetch_all(&state.db)
                .await
            {
                Ok(ids) => ids,
                Err(e) => {
                    tracing::warn!(error = %e, "อ่านรายการปฏิทินไม่ได้");
                    continue;
                }
            };
            for id in ids {
                if let Err(e) = sync_feed(&state, id).await {
                    tracing::debug!(feed = id, error = %e, "ซิงก์ปฏิทินไม่สำเร็จ");
                }
            }
        }
    });
}

// ---------- ส่งออก iCal (สาธารณะ ใช้โทเค็นลับ) ----------

#[derive(Deserialize)]
pub struct ExportQuery {
    exclude: Option<i64>,
}

pub async fn export(
    State(s): State<AppState>,
    Path(file): Path<String>,
    Query(q): Query<ExportQuery>,
) -> AppResult<impl IntoResponse> {
    let token = file.strip_suffix(".ics").unwrap_or(&file);
    let (unit_id, unit_name, property_name): (i64, String, String) = sqlx::query_as(
        "SELECT u.id, u.name, p.name FROM units u JOIN properties p ON p.id = u.property_id WHERE u.ical_token = ?",
    )
    .bind(token)
    .fetch_optional(&s.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let today = Local::now().date_naive();
    let horizon = today + Duration::days(365);
    let mut events = Vec::new();

    let bookings: Vec<(i64, NaiveDate, Option<NaiveDate>)> = sqlx::query_as(
        "SELECT id, start_date, end_date FROM bookings WHERE unit_id = ? AND status IN ('reserved','active')
           AND COALESCE(end_date, '9999-12-31') >= ?",
    )
    .bind(unit_id)
    .bind(today - Duration::days(30))
    .fetch_all(&s.db)
    .await?;
    for (id, start, end) in bookings {
        events.push(ical::Event {
            uid: format!("booking-{id}@estate"),
            start,
            end: end.unwrap_or(horizon).max(start + Duration::days(1)),
            summary: "Reserved".into(),
        });
    }
    let blocks: Vec<(i64, NaiveDate, NaiveDate)> = sqlx::query_as(
        "SELECT id, start_date, end_date FROM calendar_blocks WHERE unit_id = ? AND end_date >= ?
           AND (? IS NULL OR feed_id != ?)",
    )
    .bind(unit_id)
    .bind(today - Duration::days(30))
    .bind(q.exclude)
    .bind(q.exclude)
    .fetch_all(&s.db)
    .await?;
    for (id, start, end) in blocks {
        events.push(ical::Event {
            uid: format!("block-{id}@estate"),
            start,
            end,
            summary: "Not available".into(),
        });
    }
    let requests: Vec<(i64, NaiveDate, NaiveDate)> = sqlx::query_as(
        "SELECT id, check_in, check_out FROM booking_requests
         WHERE unit_id = ? AND status = 'pending' AND expires_at > datetime('now')",
    )
    .bind(unit_id)
    .fetch_all(&s.db)
    .await?;
    for (id, start, end) in requests {
        events.push(ical::Event {
            uid: format!("hold-{id}@estate"),
            start,
            end,
            summary: "Not available".into(),
        });
    }
    let body = ical::generate(&format!("{property_name} ห้อง {unit_name}"), &events);
    Ok((
        [
            (header::CONTENT_TYPE, "text/calendar; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        body,
    ))
}

#[cfg(test)]
mod tests {
    use super::is_internal;

    #[test]
    fn internal_addresses_are_blocked() {
        for ip in [
            "127.0.0.1",
            "10.0.0.5",
            "192.168.1.1",
            "172.16.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "::1",
            "fd00::1",
            "::ffff:10.0.0.1",
        ] {
            assert!(is_internal(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["8.8.8.8", "54.230.1.1", "2606:4700::1111"] {
            assert!(!is_internal(ip.parse().unwrap()), "{ip}");
        }
    }
}
