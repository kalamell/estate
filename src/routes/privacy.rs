//! PDPA: ประกาศความเป็นส่วนตัว ความยินยอม คำขอของเจ้าของข้อมูล ส่งออก/ลบข้อมูล และระยะเวลาเก็บรักษา

use axum::{
    extract::{Path, Query, State},
    http::header,
    response::IntoResponse,
    Json,
};
use chrono::{Duration, Local};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::validate_in;
use crate::{
    audit,
    auth::{ensure_tenant, OrgCtx},
    error::{AppError, AppResult},
    AppState,
};

pub const REQUEST_KINDS: &[&str] = &[
    "access",
    "correction",
    "deletion",
    "objection",
    "withdraw_consent",
];

/// ประกาศความเป็นส่วนตัวมาตรฐาน (ร่าง — ควรให้ผู้เชี่ยวชาญกฎหมายตรวจก่อนใช้จริง)
pub fn default_notice(org_name: &str, dpo_contact: &str, retention_years: i64) -> String {
    let contact = if dpo_contact.trim().is_empty() {
        "ติดต่อสำนักงานของผู้ให้เช่า".to_string()
    } else {
        dpo_contact.trim().to_string()
    };
    format!(
        "ประกาศความเป็นส่วนตัวสำหรับผู้เช่าและผู้เข้าพัก — {org_name}\n\n\
1. ข้อมูลที่เก็บ: ชื่อ-นามสกุล เบอร์โทรศัพท์ อีเมล เลขบัตรประชาชน/หนังสือเดินทาง ที่อยู่ ข้อมูลสัญญาเช่า การชำระเงิน ค่ามิเตอร์ รูปภาพที่ท่านส่งให้ (เช่น สลิป รูปแจ้งซ่อม) และบัญชี LINE หากท่านเลือกเชื่อมต่อ\n\n\
2. วัตถุประสงค์และฐานทางกฎหมาย: เพื่อทำและปฏิบัติตามสัญญาเช่า/การจอง ออกใบแจ้งหนี้และใบเสร็จ ติดต่อและแจ้งเตือน ดูแลซ่อมบำรุง และปฏิบัติตามกฎหมาย (เช่น กฎหมายภาษีอากร การแจ้งที่พักของคนต่างด้าว)\n\n\
3. การเปิดเผย: เปิดเผยเฉพาะเท่าที่จำเป็นต่อผู้ให้บริการระบบบริหารห้องเช่า ผู้ให้บริการชำระเงิน/ส่งข้อความ และหน่วยงานรัฐตามที่กฎหมายกำหนด\n\n\
4. ระยะเวลาเก็บรักษา: ตลอดอายุสัญญาและอีก {retention_years} ปีหลังสิ้นสุด ส่วนเอกสารทางบัญชีและภาษีเก็บตามระยะเวลาที่กฎหมายกำหนด\n\n\
5. สิทธิของท่าน: ขอเข้าถึงและรับสำเนา ขอแก้ไข ขอลบหรือทำให้ไม่สามารถระบุตัวตน คัดค้านหรือขอระงับการใช้ และถอนความยินยอม โดยยื่นคำขอผ่านหน้าข้อมูลผู้เช่า เราจะตอบภายใน 30 วัน และท่านมีสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล\n\n\
6. ติดต่อ: {contact}"
    )
}

pub(crate) async fn org_notice(
    db: &SqlitePool,
    org_id: i64,
) -> AppResult<(String, bool, String, i64)> {
    let (name, legal, notice, dpo, years): (String, String, String, String, i64) = sqlx::query_as(
        "SELECT name, legal_name, privacy_notice, dpo_contact, retention_years FROM organizations WHERE id = ?",
    )
    .bind(org_id)
    .fetch_one(db)
    .await?;
    let custom = !notice.trim().is_empty();
    let display = if legal.trim().is_empty() { name } else { legal };
    let text = if custom {
        notice
    } else {
        default_notice(&display, &dpo, years)
    };
    Ok((text, custom, dpo, years))
}

// ---------- คำขอของเจ้าของข้อมูล ----------

#[derive(Serialize, sqlx::FromRow)]
pub struct PrivacyRequest {
    id: i64,
    tenant_id: Option<i64>,
    tenant_name: Option<String>,
    kind: String,
    note: String,
    status: String,
    response: String,
    due_date: String,
    created_at: String,
    resolved_at: Option<String>,
}

const SELECT: &str =
    "SELECT r.id, r.tenant_id, t.full_name AS tenant_name, r.kind, r.note, r.status, r.response,
        r.due_date, r.created_at, r.resolved_at
    FROM privacy_requests r LEFT JOIN tenants t ON t.id = r.tenant_id";

pub(crate) async fn create_request(
    db: &SqlitePool,
    org_id: i64,
    tenant_id: i64,
    kind: &str,
    note: &str,
) -> AppResult<PrivacyRequest> {
    validate_in("kind", kind, REQUEST_KINDS)?;
    let open: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM privacy_requests WHERE tenant_id = ? AND status = 'open'",
    )
    .bind(tenant_id)
    .fetch_one(db)
    .await?;
    if open >= 5 {
        return Err(AppError::Conflict("มีคำขอที่รอดำเนินการหลายรายการแล้ว".into()));
    }
    // กฎหมายกำหนดให้ดำเนินการภายใน 30 วันนับแต่ได้รับคำขอ
    let due = Local::now().date_naive() + Duration::days(30);
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO privacy_requests (org_id, tenant_id, kind, note, due_date) VALUES (?,?,?,?,?) RETURNING id",
    )
    .bind(org_id)
    .bind(tenant_id)
    .bind(kind)
    .bind(note.trim().chars().take(2000).collect::<String>())
    .bind(due)
    .fetch_one(db)
    .await?;
    if kind == "withdraw_consent" {
        sqlx::query("UPDATE tenants SET consent_at = NULL, consent_source = NULL WHERE id = ?")
            .bind(tenant_id)
            .execute(db)
            .await?;
    }
    Ok(sqlx::query_as(&format!("{SELECT} WHERE r.id = ?"))
        .bind(id)
        .fetch_one(db)
        .await?)
}

#[derive(Deserialize)]
pub struct StatusFilter {
    status: Option<String>,
}

pub async fn list_requests(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(f): Query<StatusFilter>,
) -> AppResult<Json<Vec<PrivacyRequest>>> {
    ctx.require_admin()?;
    Ok(Json(
        sqlx::query_as(&format!(
            "{SELECT} WHERE r.org_id = ?1 AND (?2 IS NULL OR r.status = ?2)
             ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.due_date, r.id DESC"
        ))
        .bind(ctx.org_id)
        .bind(f.status)
        .fetch_all(&s.db)
        .await?,
    ))
}

#[derive(Deserialize)]
pub struct RequestPatch {
    status: String,
    #[serde(default)]
    response: String,
}

pub async fn update_request(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(p): Json<RequestPatch>,
) -> AppResult<Json<PrivacyRequest>> {
    ctx.require_admin()?;
    validate_in("status", &p.status, &["open", "done", "rejected"])?;
    if p.status == "rejected" && p.response.trim().is_empty() {
        return Err(AppError::BadRequest("การปฏิเสธคำขอต้องระบุเหตุผล".into()));
    }
    let r = sqlx::query(
        "UPDATE privacy_requests SET status = ?, response = ?,
            resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE datetime('now') END
         WHERE id = ? AND org_id = ?",
    )
    .bind(&p.status)
    .bind(p.response.trim())
    .bind(&p.status)
    .bind(id)
    .bind(ctx.org_id)
    .execute(&s.db)
    .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    audit::record(
        &s.db,
        &ctx,
        "privacy_request.update",
        "privacy_request",
        Some(id),
        Some(json!({ "status": p.status })),
    )
    .await;
    Ok(Json(
        sqlx::query_as(&format!("{SELECT} WHERE r.id = ?"))
            .bind(id)
            .fetch_one(&s.db)
            .await?,
    ))
}

// ---------- ส่งออก / ลบข้อมูล ----------

/// ข้อมูลทั้งหมดของผู้เช่า 1 คน (สิทธิ์ขอรับสำเนาข้อมูล)
pub(crate) async fn tenant_export(db: &SqlitePool, tenant_id: i64) -> AppResult<Value> {
    let tenant: Value = sqlx::query_scalar(
        "SELECT json_object('id', id, 'full_name', full_name, 'phone', phone, 'email', email, 'id_card', id_card,
            'address', address, 'tax_id', tax_id, 'branch_code', branch_code, 'note', note,
            'consent_at', consent_at, 'consent_source', consent_source, 'line_linked', line_user_id IS NOT NULL,
            'line_display_name', line_display_name, 'created_at', created_at) FROM tenants WHERE id = ?",
    )
    .bind(tenant_id)
    .fetch_one(db)
    .await
    .map(|s: String| serde_json::from_str(&s).unwrap_or(Value::Null))?;
    let rows = |sql: &'static str| async move {
        let list: Vec<String> = sqlx::query_scalar(sql)
            .bind(tenant_id)
            .fetch_all(db)
            .await?;
        Ok::<Vec<Value>, AppError>(
            list.into_iter()
                .filter_map(|s| serde_json::from_str(&s).ok())
                .collect(),
        )
    };
    Ok(json!({
        "exported_at": Local::now().to_rfc3339(),
        "tenant": tenant,
        "bookings": rows("SELECT json_object('id', b.id, 'unit', u.name, 'property', p.name, 'kind', b.kind,
                'start_date', b.start_date, 'end_date', b.end_date, 'price', b.price, 'deposit', b.deposit_amount,
                'deposit_status', b.deposit_status, 'status', b.status, 'source', b.source)
            FROM bookings b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
            WHERE b.tenant_id = ?").await?,
        "invoices": rows("SELECT json_object('doc_no', i.doc_no, 'period', i.period, 'issue_date', i.issue_date,
                'due_date', i.due_date, 'total', i.total, 'status', i.status, 'items', json(i.items))
            FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE b.tenant_id = ?").await?,
        "receipts": rows("SELECT json_object('doc_no', doc_no, 'issue_date', issue_date, 'total', total,
                'method', method, 'status', status) FROM receipts WHERE tenant_id = ?").await?,
        "tickets": rows("SELECT json_object('id', t.id, 'title', t.title, 'description', t.description,
                'category', t.category, 'status', t.status, 'created_at', t.created_at,
                'messages', (SELECT json_group_array(json_object('from', m.author_name, 'body', m.body, 'at', m.created_at))
                             FROM ticket_messages m WHERE m.ticket_id = t.id AND m.internal = 0))
            FROM tickets t WHERE t.tenant_id = ?").await?,
        "privacy_requests": rows("SELECT json_object('kind', kind, 'note', note, 'status', status,
                'response', response, 'created_at', created_at) FROM privacy_requests WHERE tenant_id = ?").await?,
    }))
}

pub(crate) fn json_download(name: &str, body: &Value) -> impl IntoResponse {
    (
        [
            (
                header::CONTENT_TYPE,
                "application/json; charset=utf-8".to_string(),
            ),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{name}\""),
            ),
        ],
        serde_json::to_string_pretty(body).unwrap_or_default(),
    )
}

pub async fn export_tenant(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    ctx.require_admin()?;
    ensure_tenant(&s.db, ctx.org_id, id).await?;
    let data = tenant_export(&s.db, id).await?;
    audit::record(&s.db, &ctx, "tenant.export", "tenant", Some(id), None).await;
    Ok(json_download(&format!("tenant-{id}.json"), &data))
}

#[derive(Deserialize)]
pub struct AnonymizeInput {
    confirm: String,
}

/// ลบข้อมูลส่วนบุคคล (ทำให้ไม่ระบุตัวตน) — ใบเสร็จ/เอกสารภาษียังเก็บตามกฎหมาย
pub async fn anonymize_tenant(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(i): Json<AnonymizeInput>,
) -> AppResult<Json<crate::models::Tenant>> {
    ctx.require_admin()?;
    ensure_tenant(&s.db, ctx.org_id, id).await?;
    if i.confirm.trim() != "ลบข้อมูล" {
        return Err(AppError::BadRequest("พิมพ์คำว่า \"ลบข้อมูล\" เพื่อยืนยัน".into()));
    }
    let active: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM bookings WHERE tenant_id = ? AND status IN ('reserved','active')",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    if active > 0 {
        return Err(AppError::Conflict(
            "ผู้เช่ายังมีการเช่า/การจองที่ใช้งานอยู่ — สิ้นสุดสัญญาก่อน".into(),
        ));
    }
    let placeholder = format!("ผู้เช่าที่ลบข้อมูลแล้ว #{id}");
    let mut tx = s.db.begin().await?;
    sqlx::query(
        "UPDATE tenants SET full_name = ?, phone = '', email = '', id_card = '', address = '', tax_id = '',
            branch_code = '', note = '', portal_token = NULL, line_user_id = NULL, line_display_name = NULL,
            line_linked_at = NULL, line_link_code = NULL, consent_at = NULL, consent_source = NULL,
            gender = '', birth_date = NULL, arrival_date = NULL, visa_type = '', visa_expiry = NULL,
            anonymized_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&placeholder)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE tickets SET reporter_name = ? WHERE tenant_id = ? AND source = 'tenant'")
        .bind(&placeholder)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE ticket_messages SET author_name = ? WHERE author_type = 'tenant'
           AND ticket_id IN (SELECT id FROM tickets WHERE tenant_id = ?)",
    )
    .bind(&placeholder)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit::record(&s.db, &ctx, "tenant.anonymize", "tenant", Some(id), None).await;
    let tenant = sqlx::query_as(&format!(
        "SELECT {} FROM tenants WHERE id = ?",
        super::tenants::COLUMNS
    ))
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(tenant))
}

/// ผู้เช่าที่พ้นระยะเวลาเก็บรักษาแล้ว (ไม่มีการเช่าที่ใช้งานอยู่)
pub async fn retention(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let years: i64 = sqlx::query_scalar("SELECT retention_years FROM organizations WHERE id = ?")
        .bind(ctx.org_id)
        .fetch_one(&s.db)
        .await?;
    let rows: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT t.id, t.full_name,
            MAX(substr(t.created_at, 1, 10),
                COALESCE((SELECT MAX(COALESCE(b.end_date, b.start_date)) FROM bookings b WHERE b.tenant_id = t.id), ''),
                COALESCE((SELECT MAX(r.issue_date) FROM receipts r WHERE r.tenant_id = t.id), '')) AS last_activity
         FROM tenants t
         WHERE t.org_id = ?1 AND t.anonymized_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.tenant_id = t.id AND b.status IN ('reserved','active'))
         GROUP BY t.id
         HAVING last_activity < date('now', '-' || ?2 || ' years')
         ORDER BY last_activity",
    )
    .bind(ctx.org_id)
    .bind(years)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(json!(rows
        .into_iter()
        .map(|(id, name, last)| json!({ "tenant_id": id, "tenant_name": name, "last_activity": last, "years": years }))
        .collect::<Vec<_>>())))
}
