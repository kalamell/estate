//! พัสดุ: ทีมงานรับแทนผู้เช่า → แจ้ง LINE พร้อมรหัสรับ → ผู้เช่ามารับ (ลงชื่อ/ถ่ายรูป) → ปิดรายการ

use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::validate_in;
use crate::{
    audit,
    auth::{self, OrgCtx},
    error::{AppError, AppResult},
    line::{self, OrgLine},
    uploads, AppState,
};

pub const KINDS: &[&str] = &["parcel", "letter", "food", "large", "other"];

fn kind_label(kind: &str) -> &'static str {
    match kind {
        "letter" => "จดหมาย/เอกสาร",
        "food" => "อาหาร/ของสด",
        "large" => "พัสดุขนาดใหญ่",
        "other" => "อื่น ๆ",
        _ => "พัสดุ",
    }
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Parcel {
    id: i64,
    property_id: i64,
    property_name: String,
    unit_id: Option<i64>,
    unit_name: Option<String>,
    tenant_id: Option<i64>,
    tenant_name: Option<String>,
    tenant_line_linked: bool,
    recipient_name: String,
    carrier: String,
    tracking_no: String,
    kind: String,
    note: String,
    photo_url: Option<String>,
    pickup_code: String,
    status: String,
    received_at: String,
    received_by_name: Option<String>,
    notified_at: Option<String>,
    picked_up_at: Option<String>,
    picked_up_by: Option<String>,
    pickup_photo_url: Option<String>,
    signature_url: Option<String>,
    handed_by_name: Option<String>,
}

const SELECT: &str = "SELECT pc.id, pc.property_id, p.name AS property_name, pc.unit_id, u.name AS unit_name,
        pc.tenant_id, t.full_name AS tenant_name, (t.line_user_id IS NOT NULL) AS tenant_line_linked,
        pc.recipient_name, pc.carrier, pc.tracking_no, pc.kind, pc.note, pc.photo_url, pc.pickup_code, pc.status,
        pc.received_at, rb.name AS received_by_name, pc.notified_at, pc.picked_up_at, pc.picked_up_by,
        pc.pickup_photo_url, pc.signature_url, hb.name AS handed_by_name
    FROM parcels pc
    JOIN properties p ON p.id = pc.property_id
    LEFT JOIN units u ON u.id = pc.unit_id
    LEFT JOIN tenants t ON t.id = pc.tenant_id
    LEFT JOIN users rb ON rb.id = pc.received_by
    LEFT JOIN users hb ON hb.id = pc.handed_by";

async fn fetch(s: &AppState, org_id: i64, id: i64) -> AppResult<Parcel> {
    sqlx::query_as(&format!("{SELECT} WHERE pc.id = ? AND pc.org_id = ?"))
        .bind(id)
        .bind(org_id)
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::NotFound)
}

#[derive(Deserialize)]
pub struct ListQuery {
    status: Option<String>,
    property_id: Option<i64>,
    q: Option<String>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    let like =
        q.q.as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(|v| format!("%{v}%"));
    let rows: Vec<Parcel> = sqlx::query_as(&format!(
        "{SELECT} WHERE pc.org_id = ?1 AND (?2 IS NULL OR pc.status = ?2) AND (?3 IS NULL OR pc.property_id = ?3)
           AND (?4 IS NULL OR pc.recipient_name LIKE ?4 OR pc.tracking_no LIKE ?4 OR t.full_name LIKE ?4
                OR u.name LIKE ?4 OR pc.carrier LIKE ?4 OR pc.pickup_code = ?5)
         ORDER BY CASE pc.status WHEN 'waiting' THEN 0 ELSE 1 END, pc.received_at DESC LIMIT 300"
    ))
    .bind(ctx.org_id)
    .bind(&q.status)
    .bind(q.property_id)
    .bind(&like)
    .bind(q.q.as_deref().map(str::trim))
    .fetch_all(&s.db)
    .await?;
    let (waiting, today, overdue): (i64, i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(status = 'waiting'), 0),
                COALESCE(SUM(date(received_at, 'localtime') = date('now', 'localtime')), 0),
                COALESCE(SUM(status = 'waiting' AND received_at < datetime('now', '-3 days')), 0)
         FROM parcels WHERE org_id = ?",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({
        "parcels": rows,
        "summary": { "waiting": waiting, "received_today": today, "waiting_over_3_days": overdue },
    })))
}

/// ผู้เช่าปัจจุบันของห้อง (สัญญาที่กำลังพักอยู่)
async fn current_tenant(s: &AppState, unit_id: i64) -> AppResult<Option<i64>> {
    Ok(sqlx::query_scalar(
        "SELECT tenant_id FROM bookings WHERE unit_id = ? AND status IN ('active','reserved')
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, start_date DESC LIMIT 1",
    )
    .bind(unit_id)
    .fetch_optional(&s.db)
    .await?
    .flatten())
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    form: Multipart,
) -> AppResult<Json<Parcel>> {
    let form = uploads::parse_for(&s, ctx.org_id, form, "parcel").await?;
    let unit_id = form.id("unit_id")?;
    let mut tenant_id = form.id("tenant_id")?;
    let property_id = match (unit_id, form.id("property_id")?) {
        (Some(u), _) => {
            auth::ensure_unit(&s.db, ctx.org_id, u).await?;
            sqlx::query_scalar("SELECT property_id FROM units WHERE id = ?")
                .bind(u)
                .fetch_one(&s.db)
                .await?
        }
        (None, Some(p)) => {
            auth::ensure_property(&s.db, ctx.org_id, p).await?;
            p
        }
        (None, None) => return Err(AppError::BadRequest("กรุณาเลือกห้องหรือโครงการ".into())),
    };
    if let Some(t) = tenant_id {
        auth::ensure_tenant(&s.db, ctx.org_id, t).await?;
    } else if let Some(u) = unit_id {
        tenant_id = current_tenant(&s, u).await?;
    }
    let recipient = form.text("recipient_name").unwrap_or_default().to_string();
    if tenant_id.is_none() && recipient.is_empty() {
        return Err(AppError::BadRequest("ห้องนี้ไม่มีผู้เช่า — กรุณาระบุชื่อผู้รับ".into()));
    }
    let kind = form.text("kind").unwrap_or("parcel").to_string();
    validate_in("kind", &kind, KINDS)?;
    let code = format!("{:04}", rand::thread_rng().gen_range(0..10000));
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO parcels (org_id, property_id, unit_id, tenant_id, recipient_name, carrier, tracking_no, kind,
            note, photo_url, pickup_code, received_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(ctx.org_id)
    .bind(property_id)
    .bind(unit_id)
    .bind(tenant_id)
    .bind(&recipient)
    .bind(form.text("carrier").unwrap_or_default())
    .bind(form.text("tracking_no").unwrap_or_default())
    .bind(&kind)
    .bind(form.text("note").unwrap_or_default())
    .bind(form.photos.first())
    .bind(&code)
    .bind(ctx.user.id)
    .fetch_one(&s.db)
    .await?;
    if tenant_id.is_some() {
        let org_id = ctx.org_id;
        line::spawn_auto(
            &s,
            org_id,
            |o| o.auto_parcel,
            move |st, org| async move { notify(&st, &org, id).await },
        );
    }
    Ok(Json(fetch(&s, ctx.org_id, id).await?))
}

fn parcel_rows(p: &Parcel) -> Vec<(String, String, bool)> {
    let mut rows = vec![("ประเภท".into(), kind_label(&p.kind).into(), false)];
    if !p.carrier.is_empty() {
        rows.push(("ขนส่ง".into(), p.carrier.clone(), false));
    }
    if !p.tracking_no.is_empty() {
        rows.push(("เลขพัสดุ".into(), p.tracking_no.clone(), false));
    }
    rows.push((
        "รับไว้เมื่อ".into(),
        p.received_at
            .get(..16)
            .unwrap_or(&p.received_at)
            .to_string(),
        false,
    ));
    rows.push(("รหัสรับพัสดุ".into(), p.pickup_code.clone(), true));
    rows
}

/// ส่งการ์ดแจ้งพัสดุถึงผู้เช่าทาง LINE
async fn notify(s: &AppState, org: &OrgLine, id: i64) -> AppResult<()> {
    let p = fetch(s, org.org_id, id).await?;
    let Some(tenant_id) = p.tenant_id else {
        return Err(AppError::BadRequest("พัสดุนี้ไม่ได้ระบุผู้เช่า".into()));
    };
    if p.status != "waiting" {
        return Err(AppError::Conflict("พัสดุนี้รับไปแล้ว".into()));
    }
    let token: Option<String> = sqlx::query_scalar("SELECT portal_token FROM tenants WHERE id = ?")
        .bind(tenant_id)
        .fetch_one(&s.db)
        .await?;
    let url = line::portal_url(s, token.as_deref().unwrap_or(""), "");
    let bubble = line::card(
        org,
        "📦 มีพัสดุมาถึงคุณ",
        &format!("{} — แสดงรหัสรับพัสดุกับเจ้าหน้าที่เมื่อมารับ", p.property_name),
        parcel_rows(&p),
        ("ดูรายการพัสดุ", &url),
    );
    line::push_to_tenant(
        s,
        org,
        tenant_id,
        "parcel",
        vec![line::flex("มีพัสดุมาถึงคุณ", bubble)],
        None,
    )
    .await?;
    sqlx::query("UPDATE parcels SET notified_at = datetime('now') WHERE id = ?")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(())
}

pub async fn resend(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Parcel>> {
    let org = line::load(&s.db, ctx.org_id).await?;
    notify(&s, &org, id).await?;
    Ok(Json(fetch(&s, ctx.org_id, id).await?))
}

/// ส่งมอบพัสดุ (multipart: picked_up_by, code, photos, signature)
pub async fn pickup(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    form: Multipart,
) -> AppResult<Json<Parcel>> {
    let p = fetch(&s, ctx.org_id, id).await?;
    if p.status != "waiting" {
        return Err(AppError::Conflict("พัสดุนี้ส่งมอบไปแล้ว".into()));
    }
    let form = uploads::parse_for(&s, ctx.org_id, form, "pickup").await?;
    if let Some(code) = form.text("code") {
        if code != p.pickup_code {
            return Err(AppError::BadRequest("รหัสรับพัสดุไม่ถูกต้อง".into()));
        }
    }
    let by = form
        .text("picked_up_by")
        .map(str::to_string)
        .or_else(|| p.tenant_name.clone())
        .or_else(|| (!p.recipient_name.is_empty()).then(|| p.recipient_name.clone()))
        .ok_or_else(|| AppError::BadRequest("กรุณาระบุชื่อผู้รับพัสดุ".into()))?;
    sqlx::query(
        "UPDATE parcels SET status = 'picked_up', picked_up_at = datetime('now'), picked_up_by = ?,
            pickup_photo_url = ?, signature_url = ?, handed_by = ?
         WHERE id = ? AND status = 'waiting'",
    )
    .bind(&by)
    .bind(form.photos.first())
    .bind(form.fields.get("signature_url"))
    .bind(ctx.user.id)
    .bind(id)
    .execute(&s.db)
    .await?;
    Ok(Json(fetch(&s, ctx.org_id, id).await?))
}

#[derive(Deserialize)]
pub struct ReturnInput {
    #[serde(default)]
    note: String,
}

/// ตีกลับผู้ส่ง / ไม่มีผู้รับ
pub async fn mark_returned(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(r): Json<ReturnInput>,
) -> AppResult<Json<Parcel>> {
    let n = sqlx::query(
        "UPDATE parcels SET status = 'returned', picked_up_at = datetime('now'), handed_by = ?,
            note = CASE WHEN ? = '' THEN note ELSE trim(note || char(10) || 'ตีกลับ: ' || ?) END
         WHERE id = ? AND org_id = ? AND status = 'waiting'",
    )
    .bind(ctx.user.id)
    .bind(r.note.trim())
    .bind(r.note.trim())
    .bind(id)
    .bind(ctx.org_id)
    .execute(&s.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::Conflict("พัสดุนี้ปิดรายการไปแล้ว".into()));
    }
    Ok(Json(fetch(&s, ctx.org_id, id).await?))
}

pub async fn delete(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let p = fetch(&s, ctx.org_id, id).await?;
    sqlx::query("DELETE FROM parcels WHERE id = ?")
        .bind(id)
        .execute(&s.db)
        .await?;
    audit::record(
        &s.db,
        &ctx,
        "parcel.delete",
        "parcel",
        Some(id),
        Some(json!({ "recipient": p.tenant_name.unwrap_or(p.recipient_name), "status": p.status })),
    )
    .await;
    Ok(Json(json!({})))
}

#[derive(sqlx::FromRow)]
struct TenantParcel {
    id: i64,
    kind: String,
    carrier: String,
    tracking_no: String,
    pickup_code: String,
    status: String,
    received_at: String,
    picked_up_at: Option<String>,
    photo_url: Option<String>,
}

/// พัสดุของผู้เช่า (แสดงในพอร์ทัล): รอรับทั้งหมด + ที่รับแล้วล่าสุด
pub async fn for_tenant(db: &sqlx::SqlitePool, tenant_id: i64) -> AppResult<Vec<Value>> {
    let rows: Vec<TenantParcel> = sqlx::query_as(
        "SELECT id, kind, carrier, tracking_no, pickup_code, status, received_at, picked_up_at, photo_url
         FROM parcels WHERE tenant_id = ?
           AND (status = 'waiting' OR picked_up_at > datetime('now', '-30 days'))
         ORDER BY CASE status WHEN 'waiting' THEN 0 ELSE 1 END, received_at DESC LIMIT 20",
    )
    .bind(tenant_id)
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let waiting = r.status == "waiting";
            json!({
                "id": r.id, "kind_label": kind_label(&r.kind), "kind": r.kind, "carrier": r.carrier,
                "tracking_no": r.tracking_no, "pickup_code": waiting.then_some(r.pickup_code),
                "status": r.status, "received_at": r.received_at, "picked_up_at": r.picked_up_at,
                "photo_url": r.photo_url,
            })
        })
        .collect())
}

/// ตอบคำสั่ง "พัสดุ" ในแชต LINE
pub(crate) async fn chat_reply(
    s: &AppState,
    org: &OrgLine,
    tenant_ids: &str,
) -> AppResult<Vec<Value>> {
    let rows: Vec<Parcel> = sqlx::query_as(&format!(
        "{SELECT} WHERE pc.org_id = ? AND pc.tenant_id IN ({tenant_ids}) AND pc.status = 'waiting'
         ORDER BY pc.received_at LIMIT 5"
    ))
    .bind(org.org_id)
    .fetch_all(&s.db)
    .await?;
    if rows.is_empty() {
        return Ok(vec![line::text_with_menu("ตอนนี้ไม่มีพัสดุรอรับครับ/ค่ะ 📭")]);
    }
    let token: Option<String> = sqlx::query_scalar(&format!(
        "SELECT portal_token FROM tenants WHERE id IN ({tenant_ids}) AND portal_token IS NOT NULL LIMIT 1"
    ))
    .fetch_optional(&s.db)
    .await?
    .flatten();
    let url = line::portal_url(s, token.as_deref().unwrap_or(""), "");
    let bubbles: Vec<Value> = rows
        .iter()
        .map(|p| {
            line::card(
                org,
                &format!("📦 {}", kind_label(&p.kind)),
                &p.property_name,
                parcel_rows(p),
                ("ดูในพอร์ทัล", &url),
            )
        })
        .collect();
    let mut msgs = vec![line::text(format!(
        "มีพัสดุรอรับ {} ชิ้น — แสดงรหัสรับพัสดุกับเจ้าหน้าที่ได้เลย",
        rows.len()
    ))];
    msgs.push(line::flex(
        "พัสดุรอรับ",
        json!({ "type": "carousel", "contents": bubbles }),
    ));
    Ok(msgs)
}
