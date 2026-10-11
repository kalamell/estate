//! ผู้เช่าแจ้งชำระพร้อมสลิป (พอร์ทัล / ส่งรูปใน LINE) → ตรวจสลิป → ทีมงานยืนยัน หรือยืนยันอัตโนมัติ

use std::time::Duration;

use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{invoices, validate_in};
use crate::{
    audit,
    auth::OrgCtx,
    billing::round2,
    error::{AppError, AppResult},
    line::{self, OrgLine},
    slip::{self, SlipCheck},
    uploads, AppState,
};

// ---------- ตั้งค่า ----------

pub async fn settings(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let (p, auto) = slip::org_provider(&s.db, ctx.org_id).await?;
    Ok(Json(json!({
        "provider": p.kind, "has_key": !p.api_key.is_empty(), "branch_id": p.branch_id, "auto_approve": auto,
    })))
}

#[derive(Deserialize)]
pub struct SettingsInput {
    provider: String,
    /// ว่าง = คงคีย์เดิม
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    branch_id: String,
    #[serde(default)]
    auto_approve: bool,
}

pub async fn update_settings(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(i): Json<SettingsInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    validate_in("provider", &i.provider, slip::PROVIDERS)?;
    if i.provider == "slipok" && i.branch_id.trim().is_empty() {
        return Err(AppError::BadRequest("SlipOK ต้องระบุ Branch ID".into()));
    }
    let key = i.api_key.trim();
    sqlx::query(
        "UPDATE organizations SET slip_provider = ?, slip_api_key = COALESCE(NULLIF(?, ''), slip_api_key),
            slip_branch_id = ?, slip_auto_approve = ? WHERE id = ?",
    )
    .bind(&i.provider)
    .bind(if key.is_empty() {
        String::new()
    } else {
        crate::crypto::encrypt(key)
    })
    .bind(i.branch_id.trim())
    .bind(i.auto_approve && i.provider != "none")
    .bind(ctx.org_id)
    .execute(&s.db)
    .await?;
    audit::record(
        &s.db,
        &ctx,
        "slip.settings",
        "org",
        Some(ctx.org_id),
        Some(json!({ "provider": i.provider, "auto_approve": i.auto_approve })),
    )
    .await;
    settings(State(s), ctx).await
}

// ---------- แจ้งชำระ ----------

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Notice {
    id: i64,
    invoice_id: i64,
    invoice_doc_no: Option<String>,
    period: String,
    unit_name: String,
    tenant_id: Option<i64>,
    tenant_name: Option<String>,
    amount: f64,
    slip_url: String,
    note: String,
    channel: String,
    status: String,
    reject_reason: Option<String>,
    receipt_id: Option<i64>,
    reviewed_by_name: Option<String>,
    reviewed_at: Option<String>,
    created_at: String,
}

const NOTICE_SELECT: &str =
    "SELECT n.id, n.invoice_id, i.doc_no AS invoice_doc_no, i.period, u.name AS unit_name,
        n.tenant_id, t.full_name AS tenant_name, n.amount, n.slip_url, n.note, n.channel, n.status,
        n.reject_reason, n.receipt_id, us.name AS reviewed_by_name, n.reviewed_at, n.created_at
    FROM payment_notices n
    JOIN invoices i ON i.id = n.invoice_id
    JOIN units u ON u.id = i.unit_id
    LEFT JOIN tenants t ON t.id = n.tenant_id
    LEFT JOIN users us ON us.id = n.reviewed_by";

async fn notice_json(s: &AppState, n: Notice) -> AppResult<Value> {
    let check = slip::latest(&s.db, "payment", n.id).await?;
    let mut v = serde_json::to_value(&n).unwrap_or_default();
    v["check"] = serde_json::to_value(check).unwrap_or_default();
    Ok(v)
}

async fn load_notice(s: &AppState, org_id: i64, id: i64) -> AppResult<Notice> {
    sqlx::query_as(&format!("{NOTICE_SELECT} WHERE n.id = ? AND n.org_id = ?"))
        .bind(id)
        .bind(org_id)
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::NotFound)
}

pub struct Submitted {
    pub notice_id: i64,
    pub check: SlipCheck,
    pub receipt_id: Option<i64>,
}

/// บันทึกการแจ้งชำระ ตรวจสลิป และยืนยันอัตโนมัติถ้าตั้งค่าไว้และตรวจกับธนาคารผ่าน
#[allow(clippy::too_many_arguments)]
pub(crate) async fn submit(
    s: &AppState,
    org_id: i64,
    tenant_id: Option<i64>,
    invoice_id: i64,
    amount: Option<f64>,
    slip_url: &str,
    note: &str,
    channel: &str,
) -> AppResult<Submitted> {
    let invoice = invoices::fetch(&s.db, org_id, invoice_id).await?;
    if invoice.status != "unpaid" {
        return Err(AppError::Conflict("บิลนี้ไม่อยู่ในสถานะรอชำระ".into()));
    }
    let full = round2(invoice.remaining() + invoice.late_fee);
    let amount = round2(amount.unwrap_or(full));
    if amount <= 0.0 || amount > full + 0.005 {
        return Err(AppError::BadRequest(format!(
            "ยอดที่แจ้งต้องมากกว่า 0 และไม่เกินยอดค้างชำระ {full:.2} บาท"
        )));
    }
    let notice_id: i64 = sqlx::query_scalar(
        "INSERT INTO payment_notices (org_id, invoice_id, tenant_id, amount, slip_url, note, channel)
         VALUES (?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(org_id)
    .bind(invoice_id)
    .bind(tenant_id.or(invoice.tenant_id))
    .bind(amount)
    .bind(slip_url)
    .bind(note)
    .bind(channel)
    .fetch_one(&s.db)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(d) if d.is_unique_violation() => AppError::Conflict(
            "แจ้งชำระบิลนี้แล้ว กำลังรอเจ้าหน้าที่ตรวจสอบ".into(),
        ),
        _ => e.into(),
    })?;
    let (provider, auto) = slip::org_provider(&s.db, org_id).await?;
    let check = slip::check(
        s,
        Some(&provider),
        slip::CheckInput {
            org_id,
            source: "payment",
            source_id: notice_id,
            slip_url,
            expected: Some(amount),
        },
    )
    .await?;
    let mut receipt_id = None;
    if auto && check.verified() {
        match approve_notice(s, org_id, notice_id, None, ApproveInput::default()).await {
            Ok(r) => receipt_id = Some(r),
            Err(e) => tracing::warn!(notice_id, error = %e, "ยืนยันการชำระอัตโนมัติไม่สำเร็จ"),
        }
    }
    Ok(Submitted {
        notice_id,
        check,
        receipt_id,
    })
}

#[derive(Deserialize, Default)]
pub struct ApproveInput {
    amount: Option<f64>,
    paid_at: Option<NaiveDate>,
    method: Option<String>,
}

/// ยืนยันการแจ้งชำระ → บันทึกรับเงิน + ออกใบเสร็จ (ส่งใบเสร็จทาง LINE ถ้าเปิดอัตโนมัติไว้)
async fn approve_notice(
    s: &AppState,
    org_id: i64,
    id: i64,
    reviewer: Option<i64>,
    a: ApproveInput,
) -> AppResult<i64> {
    let (invoice_id, amount, status, channel): (i64, f64, String, String) = sqlx::query_as(
        "SELECT invoice_id, amount, status, channel FROM payment_notices WHERE id = ? AND org_id = ?",
    )
    .bind(id)
    .bind(org_id)
    .fetch_optional(&s.db)
    .await?
    .ok_or(AppError::NotFound)?;
    if status != "pending" {
        return Err(AppError::Conflict("รายการนี้ตรวจสอบไปแล้ว".into()));
    }
    let invoice = invoices::fetch(&s.db, org_id, invoice_id).await?;
    let amount = round2(a.amount.unwrap_or(amount));
    let remaining = invoice.remaining();
    // โอนมาครบรวมค่าปรับ → รับชำระเต็มบิลพร้อมค่าปรับ
    let with_fee = invoice.late_fee > 0.0 && amount >= remaining + invoice.late_fee - 0.005;
    let pay = invoices::PayInput {
        amount: Some(if with_fee {
            remaining
        } else {
            amount.min(remaining)
        }),
        method: Some(a.method.unwrap_or_else(|| "transfer".into())),
        paid_at: Some(a.paid_at.unwrap_or_else(|| Local::now().date_naive())),
        include_late_fee: with_fee,
        wht_amount: 0.0,
        note: format!(
            "แจ้งชำระผ่าน{} พร้อมสลิป",
            if channel == "line" {
                "LINE"
            } else {
                "พอร์ทัล"
            }
        ),
    };
    let (_, receipt) = invoices::pay_invoice(&s.db, org_id, invoice_id, pay).await?;
    sqlx::query(
        "UPDATE payment_notices SET status = 'approved', receipt_id = ?, reviewed_by = ?, reviewed_at = datetime('now')
         WHERE id = ?",
    )
    .bind(receipt.id)
    .bind(reviewer)
    .bind(id)
    .execute(&s.db)
    .await?;
    let receipt_id = receipt.id;
    line::spawn_auto(
        s,
        org_id,
        |o| o.auto_receipt,
        move |st, org| async move { line::send_receipt(&st, &org, receipt_id).await },
    );
    audit::log(
        &s.db,
        Some(org_id),
        reviewer,
        None,
        "payment.create",
        "invoice",
        Some(invoice_id),
        Some(json!({ "receipt": receipt_id, "notice": id, "auto": reviewer.is_none() })),
    )
    .await;
    Ok(receipt_id)
}

#[derive(Deserialize)]
pub struct ListQuery {
    status: Option<String>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<Value>>> {
    let rows: Vec<Notice> = sqlx::query_as(&format!(
        "{NOTICE_SELECT} WHERE n.org_id = ?1 AND (?2 IS NULL OR n.status = ?2)
         ORDER BY CASE n.status WHEN 'pending' THEN 0 ELSE 1 END, n.id DESC LIMIT 200"
    ))
    .bind(ctx.org_id)
    .bind(&q.status)
    .fetch_all(&s.db)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for n in rows {
        out.push(notice_json(&s, n).await?);
    }
    Ok(Json(out))
}

pub async fn approve(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    body: Option<Json<ApproveInput>>,
) -> AppResult<Json<Value>> {
    if let Some(m) = body.as_ref().and_then(|b| b.method.as_deref()) {
        validate_in("method", m, &["promptpay", "transfer", "cash"])?;
    }
    approve_notice(
        &s,
        ctx.org_id,
        id,
        Some(ctx.user.id),
        body.map(|b| b.0).unwrap_or_default(),
    )
    .await?;
    Ok(Json(
        notice_json(&s, load_notice(&s, ctx.org_id, id).await?).await?,
    ))
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
    let reason = r.reason.trim();
    if reason.is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุเหตุผล".into()));
    }
    let n = sqlx::query(
        "UPDATE payment_notices SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = datetime('now')
         WHERE id = ? AND org_id = ? AND status = 'pending'",
    )
    .bind(reason)
    .bind(ctx.user.id)
    .bind(id)
    .bind(ctx.org_id)
    .execute(&s.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::Conflict("รายการนี้ตรวจสอบไปแล้ว".into()));
    }
    let notice = load_notice(&s, ctx.org_id, id).await?;
    audit::record(
        &s.db,
        &ctx,
        "payment_notice.reject",
        "invoice",
        Some(notice.invoice_id),
        Some(json!({ "notice": id, "reason": reason })),
    )
    .await;
    if let Some(tenant_id) = notice.tenant_id {
        let msg = format!(
            "แจ้งชำระบิลรอบ {} ยังไม่ผ่านการตรวจสอบ\nเหตุผล: {reason}\nกรุณาตรวจสอบและส่งสลิปอีกครั้ง หรือติดต่อเจ้าหน้าที่",
            notice.period
        );
        let st = s.clone();
        let org_id = ctx.org_id;
        tokio::spawn(async move {
            if let Ok(org) = line::load(&st.db, org_id).await {
                if org.ready() {
                    let _ = line::push_to_tenant(
                        &st,
                        &org,
                        tenant_id,
                        "notice_rejected",
                        vec![line::text(msg)],
                        None,
                    )
                    .await;
                }
            }
        });
    }
    Ok(Json(notice_json(&s, notice).await?))
}

// ---------- พอร์ทัลผู้เช่า ----------

pub async fn portal_submit(
    State(s): State<AppState>,
    Path((token, invoice_id)): Path<(String, i64)>,
    form: Multipart,
) -> AppResult<Json<Value>> {
    s.limiter
        .check(&format!("notice:{token}"), 20, Duration::from_secs(3600))?;
    let (tenant_id, org_id): (i64, i64) = sqlx::query_as(
        "SELECT id, org_id FROM tenants WHERE portal_token = ? AND anonymized_at IS NULL",
    )
    .bind(&token)
    .fetch_optional(&s.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let invoice = invoices::fetch(&s.db, org_id, invoice_id).await?;
    if invoice.tenant_id != Some(tenant_id) {
        return Err(AppError::NotFound);
    }
    let form = uploads::parse_for(&s, org_id, form, "slip").await?;
    let url = form
        .photos
        .first()
        .cloned()
        .ok_or_else(|| AppError::BadRequest("กรุณาแนบรูปสลิป".into()))?;
    let amount = form
        .text("amount")
        .map(|v| {
            v.replace(',', "")
                .parse::<f64>()
                .map_err(|_| AppError::BadRequest("ยอดเงินไม่ถูกต้อง".into()))
        })
        .transpose()?;
    let r = submit(
        &s,
        org_id,
        Some(tenant_id),
        invoice_id,
        amount,
        &url,
        form.text("note").unwrap_or_default(),
        "portal",
    )
    .await?;
    let notice = load_notice(&s, org_id, r.notice_id).await?;
    Ok(Json(json!({
        "notice": { "id": notice.id, "status": notice.status, "amount": notice.amount, "created_at": notice.created_at },
        "check": { "result": r.check.result, "message": r.check.message },
        "paid": r.receipt_id.is_some(),
        "receipt_id": r.receipt_id,
    })))
}

/// การแจ้งชำระล่าสุดของแต่ละบิล (แสดงในพอร์ทัล)
pub async fn portal_notices(db: &sqlx::SqlitePool, tenant_id: i64) -> AppResult<Vec<Value>> {
    let rows: Vec<(i64, i64, f64, String, Option<String>, String)> = sqlx::query_as(
        "SELECT n.id, n.invoice_id, n.amount, n.status, n.reject_reason, n.created_at FROM payment_notices n
         WHERE n.tenant_id = ? AND n.id = (SELECT MAX(id) FROM payment_notices WHERE invoice_id = n.invoice_id)
         ORDER BY n.id DESC LIMIT 24",
    )
    .bind(tenant_id)
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            json!({ "id": r.0, "invoice_id": r.1, "amount": r.2, "status": r.3, "reject_reason": r.4, "created_at": r.5 })
        })
        .collect())
}

// ---------- รูปสลิปจาก LINE ----------

/// ผู้เช่าส่งรูปใน LINE: ถ้าเป็นสลิป → แจ้งชำระบิลค้างที่เก่าที่สุด แล้วคืนข้อความตอบกลับ
pub(crate) async fn from_line_image(
    s: &AppState,
    org: &OrgLine,
    tenant_ids: &[i64],
    message_id: &str,
) -> AppResult<Vec<Value>> {
    if tenant_ids.is_empty() {
        return Ok(vec![line::text(
            "ยังไม่ได้เชื่อมบัญชีผู้เช่า — กรุณาเชื่อมบัญชีก่อน แล้วส่งสลิปได้เลย",
        )]);
    }
    let (bytes, content_type) = match s.line.content(&org.token, message_id).await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(error = %e, "ดึงรูปจาก LINE ไม่ได้");
            return Ok(vec![line::text("ขออภัย ระบบเปิดรูปไม่ได้ กรุณาส่งใหม่อีกครั้ง")]);
        }
    };
    let probe = bytes.clone();
    let is_slip = tokio::task::spawn_blocking(move || {
        slip::decode_qr(&probe)
            .iter()
            .any(|p| slip::parse_payload(p).is_some())
    })
    .await
    .unwrap_or(false);
    if !is_slip {
        return Ok(vec![line::text_with_menu(
            "ไม่พบ QR ของสลิปโอนเงินในรูปนี้\nถ้าเป็นสลิป กรุณาส่งภาพสลิปเต็มใบที่เห็น QR ชัดเจน\nถ้าต้องการแจ้งซ่อม กดเมนู \"แจ้งซ่อม\" ด้านล่าง",
        )]);
    }
    let placeholders = vec!["?"; tenant_ids.len()].join(",");
    let sql = format!(
        "SELECT i.id FROM invoices i JOIN bookings b ON b.id = i.booking_id
         WHERE b.tenant_id IN ({placeholders}) AND i.status = 'unpaid'
           AND NOT EXISTS (SELECT 1 FROM payment_notices n WHERE n.invoice_id = i.id AND n.status = 'pending')
         ORDER BY i.due_date, i.id LIMIT 1"
    );
    let mut q = sqlx::query_scalar::<_, i64>(&sql);
    for id in tenant_ids {
        q = q.bind(id);
    }
    let Some(invoice_id) = q.fetch_optional(&s.db).await? else {
        return Ok(vec![line::text_with_menu(
            "ได้รับรูปสลิปแล้ว แต่ไม่พบบิลค้างชำระที่รอแจ้งโอน\nถ้ามีข้อสงสัย ติดต่อเจ้าหน้าที่ได้เลย",
        )]);
    };
    let ext = match content_type.as_str() {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    };
    let file = format!("slip-line-{}.{ext}", uuid::Uuid::new_v4());
    tokio::fs::write(s.upload_dir.join(&file), &bytes)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    let url = format!("/uploads/{file}");
    uploads::register(&s.db, org.org_id, std::slice::from_ref(&url)).await?;
    let invoice = invoices::fetch(&s.db, org.org_id, invoice_id).await?;
    let r = submit(
        s,
        org.org_id,
        invoice.tenant_id,
        invoice_id,
        None,
        &url,
        "",
        "line",
    )
    .await?;
    let label = format!("บิลรอบ {} ห้อง {}", invoice.period, invoice.unit_name);
    let msg = match (r.receipt_id.is_some(), r.check.result.as_str()) {
        (true, _) => format!("✅ ได้รับชำระ{label} เรียบร้อย ขอบคุณครับ/ค่ะ\nใบเสร็จจะส่งให้ทางแชตนี้"),
        (_, "duplicate") => {
            format!("⚠️ สลิปนี้เคยถูกใช้แจ้งชำระแล้ว จึงยังไม่สามารถใช้กับ{label}\nเจ้าหน้าที่จะตรวจสอบและติดต่อกลับ")
        }
        (_, "mismatch") => format!(
            "ได้รับสลิปสำหรับ{label}แล้ว แต่ยอดเงินไม่ตรงกับยอดค้างชำระ\nเจ้าหน้าที่จะตรวจสอบและแจ้งผลอีกครั้ง"
        ),
        _ => format!(
            "ได้รับสลิปสำหรับ{label} ยอด {:.2} บาทแล้ว 🙏\nเจ้าหน้าที่จะตรวจสอบและส่งใบเสร็จให้เร็วที่สุด",
            invoice.remaining() + invoice.late_fee
        ),
    };
    Ok(vec![line::text_with_menu(msg)])
}
