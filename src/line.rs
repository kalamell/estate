//! LINE Official Account (Messaging API): ส่งบิล/ใบเสร็จ/การแจ้งเตือนถึงผู้เช่า และตอบคำสั่งในแชต

use base64::Engine;
use chrono::{Local, NaiveDate, Timelike};
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::SqlitePool;

use crate::{
    error::{AppError, AppResult},
    thai::{money, short_date},
    AppState,
};

#[derive(Clone)]
pub struct LineClient {
    http: reqwest::Client,
    api_base: String,
}

impl LineClient {
    pub fn new(api_base: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("http client");
        Self {
            http,
            api_base: api_base.trim_end_matches('/').to_string(),
        }
    }

    async fn post(&self, token: &str, path: &str, body: Value) -> Result<(), String> {
        let res = self
            .http
            .post(format!("{}{path}", self.api_base))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("เชื่อมต่อ LINE ไม่ได้: {e}"))?;
        if res.status().is_success() {
            return Ok(());
        }
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        Err(format!(
            "LINE ตอบกลับ {status}: {}",
            text.chars().take(300).collect::<String>()
        ))
    }

    /// ดึงไฟล์รูปที่ผู้ใช้ส่งมาในแชต (LINE เก็บไว้ที่โดเมน api-data)
    pub async fn content(
        &self,
        token: &str,
        message_id: &str,
    ) -> Result<(Vec<u8>, String), String> {
        let base = self
            .api_base
            .replace("://api.line.me", "://api-data.line.me");
        let res = self
            .http
            .get(format!(
                "{base}/v2/bot/message/{}/content",
                urlencoding::encode(message_id)
            ))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("เชื่อมต่อ LINE ไม่ได้: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("LINE ตอบกลับ {}", res.status()));
        }
        let content_type = res
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_string();
        let bytes = res.bytes().await.map_err(|e| e.to_string())?;
        if bytes.len() > 15 * 1024 * 1024 {
            return Err("ไฟล์ใหญ่เกินไป".into());
        }
        Ok((bytes.to_vec(), content_type))
    }

    pub async fn push(&self, token: &str, to: &str, messages: Vec<Value>) -> Result<(), String> {
        self.post(
            token,
            "/v2/bot/message/push",
            json!({ "to": to, "messages": messages }),
        )
        .await
    }

    pub async fn reply(
        &self,
        token: &str,
        reply_token: &str,
        messages: Vec<Value>,
    ) -> Result<(), String> {
        self.post(
            token,
            "/v2/bot/message/reply",
            json!({ "replyToken": reply_token, "messages": messages }),
        )
        .await
    }

    async fn get(&self, token: &str, path: &str) -> Result<Value, String> {
        let res = self
            .http
            .get(format!("{}{path}", self.api_base))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("เชื่อมต่อ LINE ไม่ได้: {e}"))?;
        let status = res.status();
        let body: Value = res.json().await.unwrap_or(Value::Null);
        if status.is_success() {
            Ok(body)
        } else {
            Err(format!(
                "LINE ตอบกลับ {status}: {}",
                body["message"].as_str().unwrap_or("")
            ))
        }
    }

    pub async fn bot_info(&self, token: &str) -> Result<Value, String> {
        self.get(token, "/v2/bot/info").await
    }

    pub async fn display_name(&self, token: &str, user_id: &str) -> Option<String> {
        let profile = self
            .get(token, &format!("/v2/bot/profile/{user_id}"))
            .await
            .ok()?;
        profile["displayName"].as_str().map(str::to_string)
    }
}

/// ตรวจลายเซ็น `X-Line-Signature` = base64(HMAC-SHA256(channel secret, body))
pub fn verify_signature(secret: &str, body: &[u8], signature: &str) -> bool {
    let Ok(expected) = base64::engine::general_purpose::STANDARD.decode(signature.trim()) else {
        return false;
    };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(body);
    mac.verify_slice(&expected).is_ok()
}

pub fn sign(secret: &str, body: &[u8]) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("hmac key");
    mac.update(body);
    base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes())
}

// ---------- การตั้งค่าขององค์กร ----------

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OrgLine {
    pub org_id: i64,
    pub org_name: String,
    pub theme: String,
    pub enabled: bool,
    pub channel_id: String,
    pub basic_id: String,
    pub secret: String,
    pub token: String,
    pub webhook_key: Option<String>,
    pub auto_invoice: bool,
    pub auto_receipt: bool,
    pub auto_ticket: bool,
    pub auto_remind: bool,
    pub auto_housekeeping: bool,
    pub auto_parcel: bool,
}

impl OrgLine {
    pub fn ready(&self) -> bool {
        self.enabled && !self.token.is_empty()
    }

    pub fn add_friend_url(&self) -> Option<String> {
        (!self.basic_id.is_empty()).then(|| {
            format!(
                "https://line.me/R/ti/p/{}",
                urlencoding::encode(&self.basic_id)
            )
        })
    }

    /// เปิดแชตกับ OA พร้อมข้อความเชื่อมบัญชี ผู้เช่ากดส่งได้ทันที
    pub fn link_url(&self, code: &str) -> Option<String> {
        (!self.basic_id.is_empty()).then(|| {
            format!(
                "https://line.me/R/oaMessage/{}/?{}",
                urlencoding::encode(&self.basic_id),
                urlencoding::encode(&format!("เชื่อมบัญชี {code}"))
            )
        })
    }

    fn accent(&self) -> &'static str {
        match self.theme.as_str() {
            "navy" => "#14213D",
            "terracotta" => "#B5532E",
            "ocean" => "#145A63",
            "mono" => "#0A0A0A",
            _ => "#1F5135",
        }
    }
}

const ORG_LINE_SELECT: &str = "SELECT id AS org_id, name AS org_name, theme, line_enabled AS enabled,
        line_channel_id AS channel_id, line_basic_id AS basic_id, line_channel_secret AS secret,
        line_access_token AS token, line_webhook_key AS webhook_key, line_auto_invoice AS auto_invoice,
        line_auto_receipt AS auto_receipt, line_auto_ticket AS auto_ticket, line_auto_remind AS auto_remind,
        line_auto_housekeeping AS auto_housekeeping, line_auto_parcel AS auto_parcel
    FROM organizations";

impl OrgLine {
    /// ถอดรหัสค่าลับที่เก็บแบบเข้ารหัสในฐานข้อมูล
    fn decrypted(mut self) -> Self {
        self.secret = crate::crypto::decrypt(&self.secret);
        self.token = crate::crypto::decrypt(&self.token);
        self
    }
}

pub async fn load(db: &SqlitePool, org_id: i64) -> AppResult<OrgLine> {
    let org: OrgLine = sqlx::query_as(&format!("{ORG_LINE_SELECT} WHERE id = ?"))
        .bind(org_id)
        .fetch_one(db)
        .await?;
    Ok(org.decrypted())
}

pub async fn load_by_webhook(db: &SqlitePool, key: &str) -> AppResult<Option<OrgLine>> {
    Ok(
        sqlx::query_as(&format!("{ORG_LINE_SELECT} WHERE line_webhook_key = ?"))
            .bind(key)
            .fetch_optional(db)
            .await?
            .map(OrgLine::decrypted),
    )
}

// ---------- ข้อความ ----------

pub fn text(msg: impl Into<String>) -> Value {
    json!({ "type": "text", "text": msg.into() })
}

/// ข้อความพร้อมปุ่มลัดคำสั่ง
pub fn text_with_menu(msg: impl Into<String>) -> Value {
    let items: Vec<Value> = ["บิล", "ใบเสร็จ", "พัสดุ", "ข้อมูลของฉัน", "แจ้งซ่อม"]
        .iter()
        .map(
            |t| json!({ "type": "action", "action": { "type": "message", "label": t, "text": t } }),
        )
        .collect();
    json!({ "type": "text", "text": msg.into(), "quickReply": { "items": items } })
}

fn row(label: &str, value: &str, bold: bool) -> Value {
    json!({
        "type": "box", "layout": "horizontal", "contents": [
            { "type": "text", "text": label, "size": "sm", "color": if bold { "#1C1B19" } else { "#6B675F" },
              "weight": if bold { "bold" } else { "regular" }, "flex": 5, "wrap": true },
            { "type": "text", "text": value, "size": "sm", "align": "end", "color": "#1C1B19",
              "weight": if bold { "bold" } else { "regular" }, "flex": 3 }
        ]
    })
}

/// การ์ด (Flex bubble) หัวเรื่อง + รายการ + ปุ่มลิงก์
pub fn card(
    org: &OrgLine,
    title: &str,
    subtitle: &str,
    rows: Vec<(String, String, bool)>,
    button: (&str, &str),
) -> Value {
    let mut contents = vec![
        json!({ "type": "text", "text": org.org_name, "size": "xs", "color": "#8C877D" }),
        json!({ "type": "text", "text": title, "weight": "bold", "size": "lg", "wrap": true }),
    ];
    if !subtitle.is_empty() {
        contents.push(json!({ "type": "text", "text": subtitle, "size": "sm", "color": "#6B675F", "wrap": true }));
    }
    if !rows.is_empty() {
        contents.push(json!({ "type": "separator", "margin": "md" }));
        contents.extend(rows.iter().map(|(l, v, b)| row(l, v, *b)));
    }
    json!({
        "type": "bubble",
        "body": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": contents },
        "footer": { "type": "box", "layout": "vertical", "contents": [
            { "type": "button", "style": "primary", "color": org.accent(), "height": "sm",
              "action": { "type": "uri", "label": button.0, "uri": button.1 } }
        ]}
    })
}

pub fn flex(alt: impl Into<String>, contents: Value) -> Value {
    json!({ "type": "flex", "altText": alt.into(), "contents": contents })
}

// ---------- ข้อมูลผู้เช่า ----------

#[derive(sqlx::FromRow)]
pub struct LinkedTenant {
    pub id: i64,
    pub full_name: String,
    pub line_user_id: Option<String>,
    pub portal_token: Option<String>,
}

async fn tenant(db: &SqlitePool, org_id: i64, tenant_id: i64) -> AppResult<LinkedTenant> {
    Ok(sqlx::query_as(
        "SELECT id, full_name, line_user_id, portal_token FROM tenants WHERE id = ? AND org_id = ?",
    )
    .bind(tenant_id)
    .bind(org_id)
    .fetch_one(db)
    .await?)
}

pub fn portal_url(state: &AppState, token: &str, suffix: &str) -> String {
    format!("{}/p/{token}{suffix}", state.public_url)
}

async fn log(
    db: &SqlitePool,
    org_id: i64,
    tenant_id: Option<i64>,
    kind: &str,
    result: &Result<(), String>,
    dedupe: Option<&str>,
) {
    let (status, error) = match result {
        Ok(()) => ("sent", None),
        Err(e) => ("failed", Some(e.as_str())),
    };
    let r = sqlx::query(
        "INSERT INTO line_messages (org_id, tenant_id, kind, status, error, dedupe_key) VALUES (?,?,?,?,?,?)",
    )
    .bind(org_id)
    .bind(tenant_id)
    .bind(kind)
    .bind(status)
    .bind(error)
    .bind(dedupe)
    .execute(db)
    .await;
    if let Err(e) = r {
        tracing::warn!(error = ?e, "บันทึก line_messages ไม่ได้");
    }
}

/// ส่งข้อความถึงผู้เช่า 1 คน — คืน error ที่อ่านเข้าใจได้เมื่อยังไม่ได้ตั้งค่าหรือยังไม่ได้เชื่อมบัญชี
pub async fn push_to_tenant(
    state: &AppState,
    org: &OrgLine,
    tenant_id: i64,
    kind: &str,
    messages: Vec<Value>,
    dedupe: Option<&str>,
) -> AppResult<()> {
    if !org.ready() {
        return Err(AppError::BadRequest(
            "ยังไม่ได้ตั้งค่า LINE OA (ตั้งค่า → LINE OA)".into(),
        ));
    }
    let t = tenant(&state.db, org.org_id, tenant_id).await?;
    let to = t
        .line_user_id
        .ok_or_else(|| AppError::BadRequest(format!("{} ยังไม่ได้เชื่อม LINE", t.full_name)))?;
    let result = state.line.push(&org.token, &to, messages).await;
    log(
        &state.db,
        org.org_id,
        Some(tenant_id),
        kind,
        &result,
        dedupe,
    )
    .await;
    result.map_err(AppError::BadRequest)
}

// ---------- เนื้อหาข้อความแต่ละประเภท ----------

#[derive(sqlx::FromRow)]
struct BillRow {
    id: i64,
    doc_no: Option<String>,
    period: String,
    due_date: NaiveDate,
    total: f64,
    paid: f64,
    unit_name: String,
    property_name: String,
    tenant_id: Option<i64>,
    portal_token: Option<String>,
    items: String,
}

const BILL_SELECT: &str = "SELECT i.id, i.doc_no, i.period, i.due_date, i.total,
        (SELECT COALESCE(SUM(pm.amount), 0.0) FROM payments pm WHERE pm.invoice_id = i.id AND pm.voided = 0) AS paid,
        u.name AS unit_name, p.name AS property_name, b.tenant_id, t.portal_token, i.items
    FROM invoices i JOIN units u ON u.id = i.unit_id JOIN properties p ON p.id = u.property_id
    LEFT JOIN bookings b ON b.id = i.booking_id LEFT JOIN tenants t ON t.id = b.tenant_id";

fn bill_bubble(state: &AppState, org: &OrgLine, b: &BillRow, heading: &str) -> Value {
    let items: Vec<crate::billing::LineItem> = serde_json::from_str(&b.items).unwrap_or_default();
    let mut rows: Vec<(String, String, bool)> = items
        .iter()
        .take(6)
        .map(|i| (i.label.clone(), format!("฿{}", money(i.amount)), false))
        .collect();
    if b.paid > 0.0 {
        rows.push(("ชำระแล้ว".into(), format!("-฿{}", money(b.paid)), false));
    }
    rows.push((
        "ยอดที่ต้องชำระ".into(),
        format!("฿{}", money(b.total - b.paid)),
        true,
    ));
    rows.push(("ครบกำหนด".into(), short_date(b.due_date), false));
    let url = b
        .portal_token
        .as_deref()
        .map(|t| portal_url(state, t, &format!("?invoice={}", b.id)))
        .unwrap_or_else(|| state.public_url.clone());
    let subtitle = format!(
        "ห้อง {} · {}{}",
        b.unit_name,
        b.property_name,
        b.doc_no
            .as_deref()
            .map(|d| format!(" · {d}"))
            .unwrap_or_default()
    );
    card(
        org,
        &format!("{heading} รอบ {}", b.period),
        &subtitle,
        rows,
        ("ดูบิลและสแกนจ่าย", &url),
    )
}

pub async fn send_invoice(
    state: &AppState,
    org: &OrgLine,
    invoice_id: i64,
    kind: &str,
    dedupe: Option<&str>,
) -> AppResult<()> {
    let b: BillRow = sqlx::query_as(&format!("{BILL_SELECT} WHERE i.id = ? AND p.org_id = ?"))
        .bind(invoice_id)
        .bind(org.org_id)
        .fetch_one(&state.db)
        .await?;
    let tenant_id = b
        .tenant_id
        .ok_or_else(|| AppError::BadRequest("บิลนี้ไม่ได้ผูกกับผู้เช่า".into()))?;
    let heading = match kind {
        "reminder" => "แจ้งเตือนค่าเช่า",
        _ => "ใบแจ้งหนี้",
    };
    let alt = format!(
        "{heading} รอบ {} ยอด ฿{} ครบกำหนด {}",
        b.period,
        money(b.total - b.paid),
        short_date(b.due_date)
    );
    let mut messages = vec![flex(alt, bill_bubble(state, org, &b, heading))];
    if kind == "reminder" {
        messages.insert(
            0,
            text(
                dedupe
                    .map(reminder_text)
                    .unwrap_or("แจ้งเตือนยอดค้างชำระ")
                    .to_string(),
            ),
        );
    }
    push_to_tenant(state, org, tenant_id, kind, messages, dedupe).await
}

fn reminder_text(key: &str) -> &'static str {
    if key.ends_with(":due_soon") {
        "ค่าเช่าจะครบกำหนดชำระพรุ่งนี้ครับ/ค่ะ"
    } else {
        "บิลนี้เกินกำหนดชำระแล้ว กรุณาชำระโดยเร็ว หากชำระแล้วขออภัยและขอบคุณครับ/ค่ะ"
    }
}

pub async fn send_receipt(state: &AppState, org: &OrgLine, receipt_id: i64) -> AppResult<()> {
    let (doc_no, total, issue_date, tenant_id, portal_token, unit_name): (
        String,
        f64,
        NaiveDate,
        Option<i64>,
        Option<String>,
        String,
    ) = sqlx::query_as(
        "SELECT r.doc_no, r.total, r.issue_date, r.tenant_id, t.portal_token, r.unit_name
         FROM receipts r LEFT JOIN tenants t ON t.id = r.tenant_id WHERE r.id = ? AND r.org_id = ?",
    )
    .bind(receipt_id)
    .bind(org.org_id)
    .fetch_one(&state.db)
    .await?;
    let tenant_id = tenant_id.ok_or_else(|| AppError::BadRequest("ใบเสร็จนี้ไม่ได้ผูกกับผู้เช่า".into()))?;
    let url = portal_url(
        state,
        portal_token.as_deref().unwrap_or(""),
        &format!("/print/receipt/{receipt_id}"),
    );
    let bubble = card(
        org,
        "ได้รับชำระเงินแล้ว ขอบคุณครับ/ค่ะ",
        &format!("ห้อง {unit_name} · ใบเสร็จ {doc_no}"),
        vec![
            ("จำนวนเงิน".into(), format!("฿{}", money(total)), true),
            ("วันที่".into(), short_date(issue_date), false),
        ],
        ("ดูใบเสร็จ", &url),
    );
    push_to_tenant(
        state,
        org,
        tenant_id,
        "receipt",
        vec![flex(format!("ใบเสร็จ {doc_no} ฿{}", money(total)), bubble)],
        None,
    )
    .await
}

pub async fn send_portal_link(state: &AppState, org: &OrgLine, tenant_id: i64) -> AppResult<()> {
    let t = tenant(&state.db, org.org_id, tenant_id).await?;
    let url = portal_url(state, t.portal_token.as_deref().unwrap_or(""), "");
    let bubble = card(
        org,
        "ข้อมูลห้องพักของคุณ",
        "ดูบิล ใบเสร็จ สถานะการแจ้งซ่อม และประกาศจากหอพักได้ที่ลิงก์นี้",
        vec![],
        ("เปิดดูข้อมูลของฉัน", &url),
    );
    push_to_tenant(
        state,
        org,
        tenant_id,
        "portal_link",
        vec![flex("ข้อมูลห้องพักของคุณ", bubble)],
        None,
    )
    .await
}

pub async fn send_ticket_reply(
    state: &AppState,
    org: &OrgLine,
    ticket_id: i64,
    body: &str,
) -> AppResult<()> {
    let (title, tenant_id, portal_token): (String, Option<i64>, Option<String>) = sqlx::query_as(
        "SELECT tk.title, tk.tenant_id, t.portal_token FROM tickets tk LEFT JOIN tenants t ON t.id = tk.tenant_id
         WHERE tk.id = ? AND tk.org_id = ?",
    )
    .bind(ticket_id)
    .bind(org.org_id)
    .fetch_one(&state.db)
    .await?;
    let Some(tenant_id) = tenant_id else {
        return Ok(());
    };
    let url = portal_url(
        state,
        portal_token.as_deref().unwrap_or(""),
        &format!("?tab=tickets&ticket={ticket_id}"),
    );
    let preview: String = body.chars().take(200).collect();
    let bubble = card(
        org,
        "ทีมงานตอบกลับเรื่องแจ้งของคุณ",
        &format!("{title}\n\n{preview}"),
        vec![],
        ("ดูรายละเอียด", &url),
    );
    push_to_tenant(
        state,
        org,
        tenant_id,
        "ticket_reply",
        vec![flex(format!("ตอบกลับ: {title}"), bubble)],
        None,
    )
    .await
}

/// ส่งเบื้องหลัง (ไม่ให้คำขอของผู้ใช้ช้า) — ผลลัพธ์ถูกบันทึกใน line_messages
pub fn spawn_auto<F, Fut>(state: &AppState, org_id: i64, enabled: fn(&OrgLine) -> bool, job: F)
where
    F: FnOnce(AppState, OrgLine) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = AppResult<()>> + Send,
{
    let state = state.clone();
    tokio::spawn(async move {
        let Ok(org) = load(&state.db, org_id).await else {
            return;
        };
        if !org.ready() || !enabled(&org) {
            return;
        }
        if let Err(e) = job(state, org).await {
            tracing::debug!(error = %e, "ส่ง LINE อัตโนมัติไม่สำเร็จ");
        }
    });
}

// ---------- เตือนครบกำหนด / ค้างชำระ ----------

/// รอบเตือน: ก่อนครบกำหนด 1 วัน และเกินกำหนดวันที่ 1, 3, 7 — ส่งครั้งเดียวต่อรอบ (dedupe_key)
pub async fn run_reminders(state: &AppState, today: NaiveDate) -> AppResult<usize> {
    let orgs: Vec<OrgLine> = sqlx::query_as(&format!(
        "{ORG_LINE_SELECT} WHERE line_enabled = 1 AND line_auto_remind = 1 AND line_access_token != ''"
    ))
    .fetch_all(&state.db)
    .await?;
    let mut sent = 0;
    for org in orgs.into_iter().map(OrgLine::decrypted) {
        let due: Vec<(i64, NaiveDate)> = sqlx::query_as(
            "SELECT i.id, i.due_date FROM invoices i JOIN units u ON u.id = i.unit_id
             JOIN properties p ON p.id = u.property_id JOIN bookings b ON b.id = i.booking_id
             JOIN tenants t ON t.id = b.tenant_id
             WHERE p.org_id = ? AND i.status = 'unpaid' AND t.line_user_id IS NOT NULL",
        )
        .bind(org.org_id)
        .fetch_all(&state.db)
        .await?;
        for (id, due_date) in due {
            let days = (today - due_date).num_days();
            let stage = match days {
                -1 => "due_soon",
                1 => "overdue_1",
                3 => "overdue_3",
                7 => "overdue_7",
                _ => continue,
            };
            let key = format!("reminder:{id}:{stage}");
            let exists: Option<i64> =
                sqlx::query_scalar("SELECT id FROM line_messages WHERE dedupe_key = ?")
                    .bind(&key)
                    .fetch_optional(&state.db)
                    .await?;
            if exists.is_none()
                && send_invoice(state, &org, id, "reminder", Some(&key))
                    .await
                    .is_ok()
            {
                sent += 1;
            }
        }
    }
    Ok(sent)
}

/// ตรวจทุกชั่วโมง และส่งเฉพาะช่วง 09:00–19:59 เวลาท้องถิ่น
pub fn spawn_reminders(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            tick.tick().await;
            let now = Local::now();
            if !(9..20).contains(&now.hour()) {
                continue;
            }
            match run_reminders(&state, now.date_naive()).await {
                Ok(n) if n > 0 => tracing::info!("ส่งแจ้งเตือนทาง LINE {n} รายการ"),
                Err(e) => tracing::warn!(error = %e, "ส่งแจ้งเตือนทาง LINE ไม่สำเร็จ"),
                _ => {}
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_round_trip() {
        let body = br#"{"events":[]}"#;
        let sig = sign("secret", body);
        assert!(verify_signature("secret", body, &sig));
        assert!(!verify_signature("other", body, &sig));
        assert!(!verify_signature("secret", b"tampered", &sig));
    }
}
