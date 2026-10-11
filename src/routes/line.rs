//! ตั้งค่า LINE OA, ส่งข้อความด้วยมือ, Webhook รับคำสั่งจากผู้เช่า

use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::HeaderMap,
    Json,
};
use chrono::{Duration, Local, NaiveDateTime};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    auth::{ensure_tenant, OrgCtx},
    error::{AppError, AppResult},
    line::{self, card, flex, text_with_menu, OrgLine},
    thai::{money, short_date},
    AppState,
};

pub const THEMES: &[&str] = &["ink", "navy", "terracotta", "ocean", "mono"];

/// ข้อมูลการตั้งค่าที่ส่งให้หน้าเว็บ (ไม่ส่งค่าลับออกไป)
pub async fn settings_json(state: &AppState, org_id: i64) -> AppResult<Value> {
    let org = line::load(&state.db, org_id).await?;
    let linked: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tenants WHERE org_id = ? AND line_user_id IS NOT NULL",
    )
    .bind(org_id)
    .fetch_one(&state.db)
    .await?;
    Ok(json!({
        "enabled": org.enabled,
        "channel_id": org.channel_id,
        "basic_id": org.basic_id,
        "has_secret": !org.secret.is_empty(),
        "has_token": !org.token.is_empty(),
        "webhook_url": org.webhook_key.as_deref().map(|k| format!("{}/api/line/webhook/{k}", state.public_url)),
        "auto_invoice": org.auto_invoice,
        "auto_receipt": org.auto_receipt,
        "auto_ticket_reply": org.auto_ticket,
        "auto_remind": org.auto_remind,
        "auto_housekeeping": org.auto_housekeeping,
        "linked_tenants": linked,
        "add_friend_url": org.add_friend_url(),
    }))
}

#[derive(Deserialize)]
pub struct LineInput {
    enabled: bool,
    #[serde(default)]
    channel_id: String,
    #[serde(default)]
    basic_id: String,
    channel_secret: Option<String>,
    channel_access_token: Option<String>,
    #[serde(default = "yes")]
    auto_invoice: bool,
    #[serde(default = "yes")]
    auto_receipt: bool,
    #[serde(default = "yes")]
    auto_ticket_reply: bool,
    #[serde(default = "yes")]
    auto_remind: bool,
    #[serde(default = "yes")]
    auto_housekeeping: bool,
}

fn yes() -> bool {
    true
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill(&mut buf[..]);
    hex::encode(buf)
}

pub async fn update_settings(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(l): Json<LineInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let basic_id = l.basic_id.trim();
    let basic_id = if basic_id.is_empty() || basic_id.starts_with('@') {
        basic_id.to_string()
    } else {
        format!("@{basic_id}")
    };
    let non_empty = |v: &Option<String>| {
        v.as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string)
    };
    sqlx::query(
        "UPDATE organizations SET line_enabled = ?, line_channel_id = ?, line_basic_id = ?,
            line_channel_secret = COALESCE(?, line_channel_secret), line_access_token = COALESCE(?, line_access_token),
            line_webhook_key = COALESCE(line_webhook_key, ?), line_auto_invoice = ?, line_auto_receipt = ?,
            line_auto_ticket = ?, line_auto_remind = ?, line_auto_housekeeping = ?
         WHERE id = ?",
    )
    .bind(l.enabled)
    .bind(l.channel_id.trim())
    .bind(basic_id)
    .bind(non_empty(&l.channel_secret).map(|v| crate::crypto::encrypt(&v)))
    .bind(non_empty(&l.channel_access_token).map(|v| crate::crypto::encrypt(&v)))
    .bind(random_hex(16))
    .bind(l.auto_invoice)
    .bind(l.auto_receipt)
    .bind(l.auto_ticket_reply)
    .bind(l.auto_remind)
    .bind(l.auto_housekeeping)
    .bind(ctx.org_id)
    .execute(&s.db)
    .await?;
    crate::audit::record(
        &s.db,
        &ctx,
        "line.update",
        "organization",
        Some(ctx.org_id),
        Some(serde_json::json!({ "enabled": l.enabled })),
    )
    .await;
    Ok(Json(settings_json(&s, ctx.org_id).await?))
}

pub async fn test_connection(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    let org = line::load(&s.db, ctx.org_id).await?;
    if org.token.is_empty() {
        return Err(AppError::BadRequest("ยังไม่ได้ใส่ Channel access token".into()));
    }
    let info = s
        .line
        .bot_info(&org.token)
        .await
        .map_err(AppError::BadRequest)?;
    Ok(Json(json!({
        "ok": true,
        "bot": {
            "display_name": info["displayName"], "basic_id": info["basicId"], "picture_url": info["pictureUrl"],
        }
    })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct LogRow {
    id: i64,
    tenant_id: Option<i64>,
    tenant_name: Option<String>,
    kind: String,
    status: String,
    error: Option<String>,
    created_at: String,
}

#[derive(Deserialize)]
pub struct LogQuery {
    limit: Option<i64>,
}

pub async fn messages(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<LogQuery>,
) -> AppResult<Json<Vec<LogRow>>> {
    Ok(Json(
        sqlx::query_as(
            "SELECT m.id, m.tenant_id, t.full_name AS tenant_name, m.kind, m.status, m.error, m.created_at
             FROM line_messages m LEFT JOIN tenants t ON t.id = m.tenant_id
             WHERE m.org_id = ? ORDER BY m.id DESC LIMIT ?",
        )
        .bind(ctx.org_id)
        .bind(q.limit.unwrap_or(50).clamp(1, 500))
        .fetch_all(&s.db)
        .await?,
    ))
}

// ---------- เชื่อมบัญชีผู้เช่า ----------

/// รหัส 6 ตัว (ไม่มีตัวที่สับสนง่าย) ใช้ได้ 7 วัน
pub(crate) async fn issue_link_code(
    state: &AppState,
    org_id: i64,
    tenant_id: i64,
) -> AppResult<Value> {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code: String = {
        let mut rng = rand::thread_rng();
        (0..6)
            .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
            .collect()
    };
    let org = line::load(&state.db, org_id).await?;
    let expires = (Local::now() + Duration::days(7)).naive_local();
    sqlx::query(
        "UPDATE tenants SET line_link_code = ?, line_link_expires = ? WHERE id = ? AND org_id = ?",
    )
    .bind(&code)
    .bind(expires.format("%Y-%m-%d %H:%M:%S").to_string())
    .bind(tenant_id)
    .bind(org_id)
    .execute(&state.db)
    .await?;
    Ok(json!({
        "code": code,
        "link_url": org.link_url(&code),
        "add_friend_url": org.add_friend_url(),
        "expires_at": expires.format("%Y-%m-%d %H:%M:%S").to_string(),
    }))
}

pub async fn tenant_link_code(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ensure_tenant(&s.db, ctx.org_id, id).await?;
    Ok(Json(issue_link_code(&s, ctx.org_id, id).await?))
}

pub async fn tenant_unlink(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ensure_tenant(&s.db, ctx.org_id, id).await?;
    sqlx::query(
        "UPDATE tenants SET line_user_id = NULL, line_display_name = NULL, line_linked_at = NULL WHERE id = ?",
    )
    .bind(id)
    .execute(&s.db)
    .await?;
    Ok(Json(json!({})))
}

pub async fn tenant_send_portal(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ensure_tenant(&s.db, ctx.org_id, id).await?;
    let org = line::load(&s.db, ctx.org_id).await?;
    line::send_portal_link(&s, &org, id).await?;
    Ok(Json(json!({ "sent": true })))
}

// ---------- ส่งบิล / ใบเสร็จด้วยมือ ----------

pub async fn send_invoice(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    let org = line::load(&s.db, ctx.org_id).await?;
    line::send_invoice(&s, &org, id, "invoice", None).await?;
    Ok(Json(json!({ "sent": true })))
}

#[derive(Deserialize)]
pub struct BulkInput {
    property_id: i64,
    period: String,
}

pub async fn send_invoices(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(b): Json<BulkInput>,
) -> AppResult<Json<Value>> {
    crate::auth::ensure_property(&s.db, ctx.org_id, b.property_id).await?;
    let org = line::load(&s.db, ctx.org_id).await?;
    if !org.ready() {
        return Err(AppError::BadRequest(
            "ยังไม่ได้ตั้งค่า LINE OA (ตั้งค่า → LINE OA)".into(),
        ));
    }
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT i.id, u.name FROM invoices i JOIN units u ON u.id = i.unit_id
         WHERE u.property_id = ? AND i.period = ? AND i.status = 'unpaid' ORDER BY u.floor, u.name",
    )
    .bind(b.property_id)
    .bind(&b.period)
    .fetch_all(&s.db)
    .await?;
    let (mut sent, mut skipped) = (0, Vec::new());
    for (id, unit) in rows {
        match line::send_invoice(&s, &org, id, "invoice", None).await {
            Ok(()) => sent += 1,
            Err(e) => skipped.push(format!("ห้อง {unit}: {e}")),
        }
    }
    Ok(Json(json!({ "sent": sent, "skipped": skipped })))
}

pub async fn send_receipt(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    let org = line::load(&s.db, ctx.org_id).await?;
    line::send_receipt(&s, &org, id).await?;
    Ok(Json(json!({ "sent": true })))
}

// ---------- Webhook ----------

#[derive(sqlx::FromRow)]
struct ChatTenant {
    id: i64,
    full_name: String,
    portal_token: Option<String>,
}

async fn chat_tenants(s: &AppState, org_id: i64, user_id: &str) -> AppResult<Vec<ChatTenant>> {
    Ok(sqlx::query_as("SELECT id, full_name, portal_token FROM tenants WHERE org_id = ? AND line_user_id = ? ORDER BY id")
        .bind(org_id)
        .bind(user_id)
        .fetch_all(&s.db)
        .await?)
}

/// ตีความข้อความจากผู้เช่า แล้วสร้างข้อความตอบกลับ
async fn answer(
    s: &AppState,
    org: &OrgLine,
    user_id: &str,
    message: &str,
) -> AppResult<Vec<Value>> {
    let msg = message.trim();
    if let Some(code) = msg.strip_prefix("เชื่อมบัญชี") {
        let code = code.trim().to_uppercase();
        let found: Option<(i64, String, Option<String>, String)> = sqlx::query_as(
            "SELECT id, full_name, portal_token, line_link_expires FROM tenants
             WHERE org_id = ? AND line_link_code = ? AND line_link_code != ''",
        )
        .bind(org.org_id)
        .bind(&code)
        .fetch_optional(&s.db)
        .await?;
        let valid = found.filter(|(_, _, _, exp)| {
            NaiveDateTime::parse_from_str(exp, "%Y-%m-%d %H:%M:%S")
                .map(|e| e > Local::now().naive_local())
                .unwrap_or(false)
        });
        let Some((tenant_id, name, token, _)) = valid else {
            return Ok(vec![text_with_menu("รหัสเชื่อมบัญชีไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่จากเจ้าหน้าที่ หรือกดปุ่ม \"เชื่อมบัญชี\" ในหน้าข้อมูลห้องพักอีกครั้ง")]);
        };
        let display = s.line.display_name(&org.token, user_id).await;
        sqlx::query(
            "UPDATE tenants SET line_user_id = ?, line_display_name = ?, line_linked_at = datetime('now'),
                line_link_code = NULL, line_link_expires = NULL WHERE id = ?",
        )
        .bind(user_id)
        .bind(display)
        .bind(tenant_id)
        .execute(&s.db)
        .await?;
        let url = line::portal_url(s, token.as_deref().unwrap_or(""), "");
        let bubble = card(
            org,
            "เชื่อมบัญชีเรียบร้อย",
            &format!("สวัสดีคุณ{name} ต่อจากนี้คุณจะได้รับบิล ใบเสร็จ และการแจ้งเตือนทาง LINE นี้"),
            vec![],
            ("ดูข้อมูลของฉัน", &url),
        );
        return Ok(vec![
            flex("เชื่อมบัญชีเรียบร้อย", bubble),
            text_with_menu("พิมพ์หรือกดเมนูด้านล่างเพื่อดูข้อมูลได้ตลอดเวลา"),
        ]);
    }

    // พนักงาน: เชื่อมบัญชี และคำสั่ง "งาน"
    if let Some(code) = msg.strip_prefix("เชื่อมพนักงาน") {
        let code = code.trim().to_uppercase();
        return Ok(vec![match super::housekeeping::link_staff(&s.db, org.org_id, &code, user_id).await? {
            Some(name) => text_with_menu(format!("เชื่อม LINE ของพนักงาน {name} เรียบร้อย ✅\nจะได้รับแจ้งเมื่อมีงานใหม่ พิมพ์ \"งาน\" เพื่อดูงานวันนี้")),
            None => text_with_menu("รหัสเชื่อมพนักงานไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่จากหน้า ตั้งค่า → สมาชิก"),
        }]);
    }
    if let Some(staff_id) = super::housekeeping::staff_by_line(&s.db, org.org_id, user_id).await? {
        if msg.contains("งาน") {
            return Ok(vec![
                super::housekeeping::staff_tasks_reply(s, org, staff_id).await?,
            ]);
        }
    }

    let tenants = chat_tenants(s, org.org_id, user_id).await?;
    let Some(first) = tenants.first() else {
        return Ok(vec![text_with_menu(
            "บัญชี LINE นี้ยังไม่ได้เชื่อมกับห้องพัก\nกรุณาส่งข้อความ \"เชื่อมบัญชี รหัส6หลัก\" (ขอรหัสได้จากเจ้าหน้าที่) หรือกดปุ่ม \"เชื่อมบัญชี LINE\" ในลิงก์ข้อมูลห้องพักที่ได้รับ",
        )]);
    };
    let portal = |t: &ChatTenant, suffix: &str| {
        line::portal_url(s, t.portal_token.as_deref().unwrap_or(""), suffix)
    };
    let ids: Vec<String> = tenants.iter().map(|t| t.id.to_string()).collect();
    let id_list = ids.join(",");

    if ["บิล", "ยอด", "ค้าง", "จ่าย"].iter().any(|k| msg.contains(k)) {
        let bills: Vec<i64> = sqlx::query_scalar(&format!(
            "SELECT i.id FROM invoices i JOIN bookings b ON b.id = i.booking_id
             WHERE b.tenant_id IN ({id_list}) AND i.status = 'unpaid' ORDER BY i.due_date LIMIT 5"
        ))
        .fetch_all(&s.db)
        .await?;
        if bills.is_empty() {
            let bubble = card(
                org,
                "ไม่มียอดค้างชำระ",
                "ขอบคุณที่ชำระตรงเวลาครับ/ค่ะ",
                vec![],
                ("ดูประวัติบิล", &portal(first, "?tab=bills")),
            );
            return Ok(vec![flex("ไม่มียอดค้างชำระ", bubble)]);
        }
        // ส่งการ์ดบิลแบบเลื่อนดูได้ (carousel)
        let mut bubbles = Vec::new();
        for id in bills {
            if let Ok(b) = bill_for(s, org, id).await {
                bubbles.push(b);
            }
        }
        return Ok(vec![flex(
            "บิลที่ต้องชำระ",
            json!({ "type": "carousel", "contents": bubbles }),
        )]);
    }

    if msg.contains("ใบเสร็จ") {
        let rows: Vec<(i64, String, f64, chrono::NaiveDate)> = sqlx::query_as(&format!(
            "SELECT id, doc_no, total, issue_date FROM receipts WHERE tenant_id IN ({id_list}) AND status = 'issued'
             ORDER BY issue_date DESC, id DESC LIMIT 5"
        ))
        .fetch_all(&s.db)
        .await?;
        if rows.is_empty() {
            return Ok(vec![text_with_menu("ยังไม่มีใบเสร็จ")]);
        }
        let list: Vec<(String, String, bool)> = rows
            .iter()
            .map(|(_, doc, total, date)| {
                (
                    format!("{doc} · {}", short_date(*date)),
                    format!("฿{}", money(*total)),
                    false,
                )
            })
            .collect();
        let bubble = card(
            org,
            "ใบเสร็จล่าสุด",
            "",
            list,
            ("ดูใบเสร็จทั้งหมด", &portal(first, "?tab=receipts")),
        );
        return Ok(vec![flex("ใบเสร็จล่าสุด", bubble)]);
    }

    if msg.contains("ซ่อม") || msg.contains("แจ้ง") {
        let bubble = card(
            org,
            "แจ้งซ่อม / ติดต่อเจ้าหน้าที่",
            "ถ่ายรูปและเล่าปัญหาได้เลย ทีมงานจะตอบกลับทาง LINE นี้",
            vec![],
            ("แจ้งเรื่องใหม่", &portal(first, "?tab=tickets")),
        );
        return Ok(vec![flex("แจ้งซ่อม", bubble)]);
    }

    if ["ข้อมูล", "ของฉัน", "ห้อง", "สัญญา", "พอร์ทัล"]
        .iter()
        .any(|k| msg.contains(k))
    {
        let info: Option<(String, String, String)> = sqlx::query_as(&format!(
            "SELECT u.name, p.name, b.start_date FROM bookings b JOIN units u ON u.id = b.unit_id
             JOIN properties p ON p.id = u.property_id
             WHERE b.tenant_id IN ({id_list}) AND b.status IN ('active','reserved') ORDER BY b.start_date DESC LIMIT 1"
        ))
        .fetch_optional(&s.db)
        .await?;
        let rows = match info {
            Some((unit, property, start)) => vec![
                ("ห้อง".to_string(), unit, false),
                ("โครงการ".to_string(), property, false),
                ("เริ่มเช่า".to_string(), start, false),
            ],
            None => vec![],
        };
        let bubble = card(
            org,
            &format!("คุณ{}", first.full_name),
            "ข้อมูลห้องพักของคุณ",
            rows,
            ("เปิดดูข้อมูลทั้งหมด", &portal(first, "")),
        );
        return Ok(vec![flex("ข้อมูลของฉัน", bubble)]);
    }

    Ok(vec![text_with_menu(
        "พิมพ์หรือกดเมนูด้านล่างได้เลยครับ/ค่ะ\n• บิล — ดูยอดที่ต้องชำระและสแกนจ่าย\n• ใบเสร็จ — ใบเสร็จล่าสุด\n• ข้อมูลของฉัน — ห้องและสัญญาเช่า\n• แจ้งซ่อม — แจ้งปัญหาพร้อมรูป",
    )])
}

async fn bill_for(s: &AppState, org: &OrgLine, invoice_id: i64) -> AppResult<Value> {
    // ใช้การ์ดเดียวกับการส่งบิล แต่ไม่ push
    let row: (Option<String>, String, chrono::NaiveDate, f64, f64, String, Option<String>) = sqlx::query_as(
        "SELECT i.doc_no, i.period, i.due_date, i.total,
                (SELECT COALESCE(SUM(pm.amount), 0.0) FROM payments pm WHERE pm.invoice_id = i.id AND pm.voided = 0),
                u.name, t.portal_token
         FROM invoices i JOIN units u ON u.id = i.unit_id LEFT JOIN bookings b ON b.id = i.booking_id
         LEFT JOIN tenants t ON t.id = b.tenant_id WHERE i.id = ?",
    )
    .bind(invoice_id)
    .fetch_one(&s.db)
    .await?;
    let (doc_no, period, due, total, paid, unit, token) = row;
    let url = line::portal_url(
        s,
        token.as_deref().unwrap_or(""),
        &format!("?invoice={invoice_id}"),
    );
    Ok(card(
        org,
        &format!("บิลรอบ {period}"),
        &format!(
            "ห้อง {unit}{}",
            doc_no.map(|d| format!(" · {d}")).unwrap_or_default()
        ),
        vec![
            (
                "ยอดที่ต้องชำระ".into(),
                format!("฿{}", money(total - paid)),
                true,
            ),
            ("ครบกำหนด".into(), short_date(due), false),
        ],
        ("ดูบิลและสแกนจ่าย", &url),
    ))
}

/// รับเหตุการณ์จาก LINE — ต้องตอบ 200 เสมอเมื่อลายเซ็นถูกต้อง
pub async fn webhook(
    State(s): State<AppState>,
    Path(key): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<Json<Value>> {
    let org = line::load_by_webhook(&s.db, &key)
        .await?
        .ok_or(AppError::NotFound)?;
    let signature = headers
        .get("x-line-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    if org.secret.is_empty() || !line::verify_signature(&org.secret, &body, signature) {
        return Err(AppError::Unauthorized);
    }
    let payload: Value =
        serde_json::from_slice(&body).map_err(|_| AppError::BadRequest("invalid body".into()))?;
    if !org.ready() {
        return Ok(Json(json!({})));
    }
    for event in payload["events"].as_array().cloned().unwrap_or_default() {
        let (Some(reply_token), Some(user_id)) = (
            event["replyToken"].as_str(),
            event["source"]["userId"].as_str(),
        ) else {
            continue;
        };
        let messages = match event["type"].as_str() {
            Some("follow") => {
                let linked = !chat_tenants(&s, org.org_id, user_id).await?.is_empty();
                vec![text_with_menu(if linked {
                    format!(
                        "ยินดีต้อนรับกลับสู่ {} 🙏\nกดเมนูด้านล่างเพื่อดูบิลหรือแจ้งซ่อมได้เลย",
                        org.org_name
                    )
                } else {
                    format!(
                        "ขอบคุณที่เพิ่ม {} เป็นเพื่อน 🙏\nหากเป็นผู้เช่า กรุณาเชื่อมบัญชีโดยกดปุ่ม \"เชื่อมบัญชี LINE\" ในลิงก์ข้อมูลห้องพัก หรือส่งข้อความ \"เชื่อมบัญชี รหัส6หลัก\" ที่ได้รับจากเจ้าหน้าที่",
                        org.org_name
                    )
                })]
            }
            Some("message") if event["message"]["type"] == "text" => {
                answer(
                    &s,
                    &org,
                    user_id,
                    event["message"]["text"].as_str().unwrap_or_default(),
                )
                .await?
            }
            Some("message") if event["message"]["type"] == "image" => {
                let ids: Vec<i64> = chat_tenants(&s, org.org_id, user_id)
                    .await?
                    .iter()
                    .map(|t| t.id)
                    .collect();
                super::slips::from_line_image(
                    &s,
                    &org,
                    &ids,
                    event["message"]["id"].as_str().unwrap_or_default(),
                )
                .await?
            }
            _ => continue,
        };
        let tenant_id = chat_tenants(&s, org.org_id, user_id)
            .await?
            .first()
            .map(|t| t.id);
        let result = s.line.reply(&org.token, reply_token, messages).await;
        let kind = if event["type"] == "follow" {
            "welcome"
        } else {
            "reply"
        };
        sqlx::query(
            "INSERT INTO line_messages (org_id, tenant_id, kind, status, error) VALUES (?,?,?,?,?)",
        )
        .bind(org.org_id)
        .bind(tenant_id)
        .bind(kind)
        .bind(if result.is_ok() { "sent" } else { "failed" })
        .bind(result.err())
        .execute(&s.db)
        .await?;
    }
    Ok(Json(json!({})))
}
