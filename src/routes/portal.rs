//! พอร์ทัลผู้เช่า: เข้าผ่านลิงก์ลับ ไม่ต้องสมัครสมาชิก — ดูบิล/ใบเสร็จ สแกนจ่าย แจ้งซ่อม อ่านประกาศ

use axum::{
    extract::{Multipart, Path, State},
    Json,
};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::{invoices, receipts, tickets};
use crate::{
    error::{AppError, AppResult},
    models::{Invoice, PackageFeatures},
    uploads, AppState,
};

struct PortalTenant {
    tenant_id: i64,
    org_id: i64,
    full_name: String,
    phone: String,
}

async fn resolve(db: &SqlitePool, token: &str) -> AppResult<PortalTenant> {
    if token.len() < 16 {
        return Err(AppError::NotFound);
    }
    let row: Option<(i64, i64, String, String, sqlx::types::Json<PackageFeatures>)> =
        sqlx::query_as(
            "SELECT t.id, t.org_id, t.full_name, t.phone, p.features FROM tenants t
         JOIN organizations o ON o.id = t.org_id JOIN packages p ON p.id = o.package_id
         WHERE t.portal_token = ?",
        )
        .bind(token)
        .fetch_optional(db)
        .await?;
    let (tenant_id, org_id, full_name, phone, features) = row.ok_or(AppError::NotFound)?;
    if !features.0.portal {
        return Err(AppError::NotFound);
    }
    Ok(PortalTenant {
        tenant_id,
        org_id,
        full_name,
        phone,
    })
}

/// (booking, unit, unit_name, floor, property, property_name, start, end, price, deposit, kind)
type BookingRow = (
    i64,
    i64,
    String,
    i64,
    i64,
    String,
    String,
    Option<String>,
    f64,
    f64,
    String,
);

/// การเช่าปัจจุบัน (กำลังพัก > จองไว้ > ล่าสุด)
async fn current_booking(
    db: &SqlitePool,
    tenant_id: i64,
) -> AppResult<Option<(i64, i64, String, i64, i64, String, Value)>> {
    let row: Option<BookingRow> = sqlx::query_as(
        "SELECT b.id, u.id, u.name, u.floor, p.id, p.name, b.start_date, b.end_date, b.price, b.deposit_amount, b.kind
         FROM bookings b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
         WHERE b.tenant_id = ? AND b.status != 'cancelled'
         ORDER BY CASE b.status WHEN 'active' THEN 0 WHEN 'reserved' THEN 1 ELSE 2 END, b.start_date DESC LIMIT 1",
    )
    .bind(tenant_id)
    .fetch_optional(db)
    .await?;
    Ok(row.map(|(bid, uid, uname, floor, pid, pname, start, end, price, deposit, kind)| {
        (
            bid,
            uid,
            uname,
            floor,
            pid,
            pname,
            json!({ "kind": kind, "start_date": start, "end_date": end, "price": price, "deposit_amount": deposit }),
        )
    }))
}

async fn tenant_invoices(db: &SqlitePool, tenant_id: i64) -> AppResult<Vec<Invoice>> {
    let rows: Vec<Invoice> = sqlx::query_as(&format!(
        "{} WHERE b.tenant_id = ? AND i.status != 'void' ORDER BY i.due_date DESC, i.id DESC LIMIT 60",
        invoices::SELECT
    ))
    .bind(tenant_id)
    .fetch_all(db)
    .await?;
    Ok(rows.into_iter().map(Invoice::with_late_fee).collect())
}

pub async fn home(State(s): State<AppState>, Path(token): Path<String>) -> AppResult<Json<Value>> {
    let t = resolve(&s.db, &token).await?;
    let line_org = crate::line::load(&s.db, t.org_id).await?;
    let privacy = super::privacy::org_notice(&s.db, t.org_id).await?;
    let consent_at: Option<String> =
        sqlx::query_scalar("SELECT consent_at FROM tenants WHERE id = ?")
            .bind(t.tenant_id)
            .fetch_one(&s.db)
            .await?;
    let (line_linked, line_name): (bool, Option<String>) = sqlx::query_as(
        "SELECT line_user_id IS NOT NULL, line_display_name FROM tenants WHERE id = ?",
    )
    .bind(t.tenant_id)
    .fetch_one(&s.db)
    .await?;
    let (org_name, org_phone): (String, String) =
        sqlx::query_as("SELECT name, phone FROM organizations WHERE id = ?")
            .bind(t.org_id)
            .fetch_one(&s.db)
            .await?;
    let booking = current_booking(&s.db, t.tenant_id).await?;
    let property_id = booking.as_ref().map(|b| b.4);
    let property = match property_id {
        Some(pid) => sqlx::query_as::<_, (String, String)>(
            "SELECT name, address FROM properties WHERE id = ?",
        )
        .bind(pid)
        .fetch_optional(&s.db)
        .await?
        .map(|(name, address)| json!({ "name": name, "address": address })),
        None => None,
    };
    let invoices = tenant_invoices(&s.db, t.tenant_id).await?;
    let receipts = receipts::for_tenant(&s.db, t.tenant_id).await?;
    Ok(Json(json!({
        "tenant": {
            "full_name": t.full_name, "phone": t.phone,
            "lang": crate::i18n::tenant_lang(&s.db, t.tenant_id).await.code(),
        },
        "org": { "name": org_name, "phone": org_phone, "theme": line_org.theme },
        "line": {
            "enabled": line_org.ready() && !line_org.basic_id.is_empty(),
            "basic_id": line_org.basic_id,
            "add_friend_url": line_org.add_friend_url(),
            "linked": line_linked,
            "display_name": line_name,
        },
        "property": property,
        "unit": booking.as_ref().map(|b| json!({ "name": b.2, "floor": b.3 })),
        "booking": booking.as_ref().map(|b| b.6.clone()),
        "announcements": tickets::announcements_for(&s.db, t.org_id, property_id).await?,
        "invoices": invoices.iter().map(|i| json!({
            "id": i.id, "doc_no": i.doc_no, "period": i.period, "due_date": i.due_date, "total": i.total,
            "status": i.status, "paid_amount": i.paid_amount, "overdue_days": i.overdue_days, "late_fee": i.late_fee,
        })).collect::<Vec<_>>(),
        "receipts": receipts.iter().map(|r| json!({
            "id": r.id, "doc_no": r.doc_no, "issue_date": r.issue_date, "total": r.total, "status": r.status,
        })).collect::<Vec<_>>(),
        "features": { "portal": true },
        "payment_notices": super::slips::portal_notices(&s.db, t.tenant_id).await?,
        "parcels": super::parcels::for_tenant(&s.db, t.tenant_id).await?,
        "contracts": super::contracts::for_tenant(&s.db, t.tenant_id).await?,
        "privacy": {
            "notice": privacy.0, "dpo_contact": privacy.2,
            "consented": consent_at.is_some(), "consent_at": consent_at,
        },
    })))
}

pub async fn invoice(
    State(s): State<AppState>,
    Path((token, id)): Path<(String, i64)>,
) -> AppResult<Json<Value>> {
    let t = resolve(&s.db, &token).await?;
    let inv = invoices::fetch(&s.db, t.org_id, id).await?;
    if inv.tenant_id != Some(t.tenant_id) || inv.status == "void" {
        return Err(AppError::NotFound);
    }
    Ok(Json(invoices::detail(&s.db, t.org_id, inv).await?))
}

pub async fn receipt(
    State(s): State<AppState>,
    Path((token, id)): Path<(String, i64)>,
) -> AppResult<Json<Value>> {
    let t = resolve(&s.db, &token).await?;
    let r = receipts::fetch(&s.db, t.org_id, id).await?;
    if r.tenant_id != Some(t.tenant_id) {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "receipt": r })))
}

fn scope(t: &PortalTenant) -> tickets::Scope<'static> {
    tickets::Scope {
        scope: "org",
        org_id: Some(t.org_id),
        tenant_id: Some(t.tenant_id),
        include_internal: false,
    }
}

pub async fn ticket_list(
    State(s): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<Json<Value>> {
    let t = resolve(&s.db, &token).await?;
    let list = tickets::query(&s.db, scope(&t), &tickets::Filter::default(), None).await?;
    Ok(Json(json!(list)))
}

pub async fn ticket_create(
    State(s): State<AppState>,
    Path(token): Path<String>,
    form: Multipart,
) -> AppResult<Json<Value>> {
    let t = resolve(&s.db, &token).await?;
    let form = uploads::parse_for(&s, t.org_id, form, "ticket").await?;
    let unit_id = current_booking(&s.db, t.tenant_id).await?.map(|b| b.1);
    let id = tickets::create_from_form(
        &s.db,
        tickets::NewTicket {
            org_id: t.org_id,
            scope: "org",
            source: "tenant",
            unit_id,
            tenant_id: Some(t.tenant_id),
            reporter_user_id: None,
            reporter_name: &t.full_name,
        },
        form,
    )
    .await?;
    Ok(Json(tickets::detail(&s.db, scope(&t), id).await?))
}

pub async fn ticket_get(
    State(s): State<AppState>,
    Path((token, id)): Path<(String, i64)>,
) -> AppResult<Json<Value>> {
    let t = resolve(&s.db, &token).await?;
    Ok(Json(tickets::detail(&s.db, scope(&t), id).await?))
}

pub async fn ticket_message(
    State(s): State<AppState>,
    Path((token, id)): Path<(String, i64)>,
    form: Multipart,
) -> AppResult<Json<Value>> {
    let t = resolve(&s.db, &token).await?;
    tickets::detail(&s.db, scope(&t), id).await?; // ตรวจสิทธิ์
    let form = uploads::parse_for(&s, t.org_id, form, "ticket").await?;
    let author = tickets::Author {
        kind: "tenant",
        user_id: None,
        name: &t.full_name,
    };
    tickets::add_message(&s.db, id, author, form, true).await?;
    Ok(Json(tickets::detail(&s.db, scope(&t), id).await?))
}

pub async fn line_link(
    State(s): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<Json<Value>> {
    let t = resolve(&s.db, &token).await?;
    Ok(Json(
        super::line::issue_link_code(&s, t.org_id, t.tenant_id).await?,
    ))
}

#[derive(serde::Deserialize)]
pub struct LangInput {
    lang: String,
}

/// ผู้เช่าเลือกภาษา (ใช้กับพอร์ทัลและข้อความ LINE)
pub async fn set_lang(
    State(s): State<AppState>,
    Path(token): Path<String>,
    Json(i): Json<LangInput>,
) -> AppResult<Json<Value>> {
    super::validate_in("lang", &i.lang, crate::i18n::CODES)?;
    let t = resolve(&s.db, &token).await?;
    sqlx::query("UPDATE tenants SET lang = ? WHERE id = ?")
        .bind(&i.lang)
        .bind(t.tenant_id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({ "lang": i.lang })))
}

/// ผู้เช่ายอมรับประกาศความเป็นส่วนตัว
pub async fn consent(
    State(s): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<Json<Value>> {
    let t = resolve(&s.db, &token).await?;
    let at: String = sqlx::query_scalar(
        "UPDATE tenants SET consent_at = datetime('now'), consent_source = 'portal' WHERE id = ? RETURNING consent_at",
    )
    .bind(t.tenant_id)
    .fetch_one(&s.db)
    .await?;
    crate::audit::log(
        &s.db,
        Some(t.org_id),
        None,
        None,
        "tenant.consent",
        "tenant",
        Some(t.tenant_id),
        None,
    )
    .await;
    Ok(Json(json!({ "consent_at": at })))
}

#[derive(serde::Deserialize)]
pub struct PrivacyRequestInput {
    kind: String,
    #[serde(default)]
    note: String,
}

pub async fn privacy_request(
    State(s): State<AppState>,
    Path(token): Path<String>,
    Json(r): Json<PrivacyRequestInput>,
) -> AppResult<Json<Value>> {
    s.limiter.check(
        &format!("privacy:{token}"),
        10,
        std::time::Duration::from_secs(86400),
    )?;
    let t = resolve(&s.db, &token).await?;
    let req =
        super::privacy::create_request(&s.db, t.org_id, t.tenant_id, &r.kind, &r.note).await?;
    Ok(Json(json!(req)))
}

/// สิทธิ์ขอรับสำเนาข้อมูลของตัวเอง
pub async fn export(
    State(s): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<impl axum::response::IntoResponse> {
    s.limiter.check(
        &format!("export:{token}"),
        10,
        std::time::Duration::from_secs(3600),
    )?;
    let t = resolve(&s.db, &token).await?;
    let data = super::privacy::tenant_export(&s.db, t.tenant_id).await?;
    crate::audit::log(
        &s.db,
        Some(t.org_id),
        None,
        None,
        "tenant.self_export",
        "tenant",
        Some(t.tenant_id),
        None,
    )
    .await;
    Ok(super::privacy::json_download("my-data.json", &data))
}
