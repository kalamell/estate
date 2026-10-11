//! ค่าบริการแพลตฟอร์ม (SaaS): ใบแจ้งหนี้ค่าแพ็กเกจ → โอนผ่าน PromptPay + แนบสลิป
//! → ผู้ดูแลแพลตฟอร์มยืนยัน → ต่ออายุ/เปลี่ยนแพ็กเกจให้อัตโนมัติ
//!
//! ราคาแพ็กเกจเป็นราคารวม VAT แล้ว (ถ้าผู้ให้บริการจด VAT ระบบแยกภาษีออกจากยอดรวมในเอกสาร)

use std::time::Duration as StdDuration;

use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use chrono::{Datelike, Duration, Local, Months, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{SqliteConnection, SqlitePool};

use super::validate_in;
use crate::{
    audit,
    auth::{BillingCtx, ClientIp, SuperAdmin},
    billing::round2,
    error::{AppError, AppResult},
    models::PackageFeatures,
    promptpay,
    thai::buddhist_year,
    uploads, AppState,
};

pub const CYCLES: &[&str] = &["monthly", "yearly"];

// ---------- ข้อมูลผู้ให้บริการ ----------

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Platform {
    #[serde(default)]
    pub company_name: String,
    #[serde(default)]
    pub tax_id: String,
    #[serde(default = "head_office")]
    pub branch_code: String,
    #[serde(default)]
    pub address: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub vat_registered: bool,
    #[serde(default = "seven")]
    pub vat_rate: f64,
    #[serde(default)]
    pub promptpay_id: String,
    #[serde(default)]
    pub bank_info: String,
    #[serde(default = "seven_days")]
    pub remind_days: i64,
    #[serde(default = "three")]
    pub grace_days: i64,
    #[serde(default = "ten")]
    pub yearly_months: i64,
}

fn head_office() -> String {
    "00000".into()
}
fn seven() -> f64 {
    7.0
}
fn seven_days() -> i64 {
    7
}
fn three() -> i64 {
    3
}
fn ten() -> i64 {
    10
}

pub async fn load_platform(db: &SqlitePool) -> AppResult<Platform> {
    Ok(sqlx::query_as(
        "SELECT company_name, tax_id, branch_code, address, phone, email, vat_registered, vat_rate,
                promptpay_id, bank_info, remind_days, grace_days, yearly_months
         FROM platform_settings WHERE id = 1",
    )
    .fetch_one(db)
    .await?)
}

fn today() -> NaiveDate {
    Local::now().date_naive()
}

// ---------- แพ็กเกจและรอบบิล ----------

#[derive(Debug, Clone, sqlx::FromRow)]
struct Pkg {
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
    is_active: bool,
}

const PKG_SELECT: &str =
    "SELECT id, name, description, price_monthly, price_yearly, max_properties, max_units,
        max_members, features, is_active FROM packages";

async fn load_pkg(db: &SqlitePool, id: i64) -> AppResult<Pkg> {
    sqlx::query_as(&format!("{PKG_SELECT} WHERE id = ?"))
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::BadRequest("ไม่พบแพ็กเกจ".into()))
}

fn price_for(p: &Pkg, cycle: &str, plat: &Platform) -> f64 {
    match cycle {
        "yearly" if p.price_yearly > 0.0 => p.price_yearly,
        "yearly" => round2(p.price_monthly * plat.yearly_months as f64),
        _ => p.price_monthly,
    }
}

fn period_end(start: NaiveDate, cycle: &str) -> NaiveDate {
    let months = if cycle == "yearly" { 12 } else { 1 };
    start
        .checked_add_months(Months::new(months))
        .unwrap_or(start)
}

fn cycle_days(cycle: &str) -> f64 {
    if cycle == "yearly" {
        365.0
    } else {
        30.0
    }
}

/// ต่ออายุแบบต่อเนื่อง: ถ้ายังไม่เลยช่วงผ่อนผันเริ่มรอบใหม่ต่อจากวันหมดอายุเดิม ไม่งั้นเริ่มวันนี้
fn renewal_start(ends_at: Option<NaiveDate>, grace_days: i64, today: NaiveDate) -> NaiveDate {
    match ends_at {
        Some(e) if e + Duration::days(grace_days) >= today => e,
        _ => today,
    }
}

#[derive(Debug, sqlx::FromRow)]
struct OrgSub {
    package_id: i64,
    status: String,
    ends_at: Option<NaiveDate>,
    billing_cycle: String,
}

async fn load_org(conn: &mut SqliteConnection, org_id: i64) -> AppResult<OrgSub> {
    Ok(sqlx::query_as(
        "SELECT package_id, status, ends_at, billing_cycle FROM organizations WHERE id = ?",
    )
    .bind(org_id)
    .fetch_one(conn)
    .await?)
}

struct Draft {
    kind: &'static str,
    pkg: Pkg,
    cycle: String,
    start: NaiveDate,
    price: f64,
    credit: f64,
    due: NaiveDate,
}

/// คำนวณใบแจ้งหนี้: แพ็กเกจ/รอบเดิม = ต่ออายุ, อย่างอื่น = เปลี่ยนแพ็กเกจ (เริ่มวันนี้ หักมูลค่าวันที่เหลือของรอบเดิม)
fn plan(
    org: &OrgSub,
    current: &Pkg,
    target: Pkg,
    cycle: &str,
    plat: &Platform,
    today: NaiveDate,
) -> Draft {
    let price = price_for(&target, cycle, plat);
    if target.id == org.package_id && cycle == org.billing_cycle {
        let start = renewal_start(org.ends_at, plat.grace_days, today);
        return Draft {
            kind: "renewal",
            pkg: target,
            cycle: cycle.into(),
            start,
            price,
            credit: 0.0,
            due: start.max(today),
        };
    }
    let credit = match org.ends_at {
        // ช่วงทดลองใช้ไม่ได้จ่ายเงิน จึงไม่มีส่วนลด
        Some(e) if org.status == "active" && e > today => {
            let paid = price_for(current, &org.billing_cycle, plat);
            let left = (e - today).num_days() as f64;
            round2((paid * left / cycle_days(&org.billing_cycle)).min(paid))
        }
        _ => 0.0,
    };
    Draft {
        kind: "change",
        pkg: target,
        cycle: cycle.into(),
        start: today,
        price,
        credit: credit.min(price),
        due: today,
    }
}

/// แพ็กเกจใหม่ต้องรองรับการใช้งานปัจจุบัน (กันลดแพ็กเกจแล้วข้อมูลเกินขีดจำกัด)
async fn check_fits(db: &SqlitePool, org_id: i64, pkg: &Pkg) -> AppResult<()> {
    let (properties, units, members): (i64, i64, i64) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM properties WHERE org_id = ?1),
                (SELECT COUNT(*) FROM units u JOIN properties p ON p.id = u.property_id WHERE p.org_id = ?1),
                (SELECT COUNT(*) FROM org_members WHERE org_id = ?1)",
    )
    .bind(org_id)
    .fetch_one(db)
    .await?;
    let mut over = Vec::new();
    if properties > pkg.max_properties {
        over.push(format!("โครงการ {properties}/{}", pkg.max_properties));
    }
    if units > pkg.max_units {
        over.push(format!("ห้อง {units}/{}", pkg.max_units));
    }
    if members > pkg.max_members {
        over.push(format!("สมาชิก {members}/{}", pkg.max_members));
    }
    if over.is_empty() {
        Ok(())
    } else {
        Err(AppError::Conflict(format!(
            "การใช้งานเกินขีดจำกัดของแพ็กเกจ {} ({}) — ลดจำนวนก่อนเปลี่ยนแพ็กเกจ",
            pkg.name,
            over.join(", ")
        )))
    }
}

// ---------- ใบแจ้งหนี้ ----------

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SubInvoice {
    id: i64,
    org_id: i64,
    org_name: String,
    doc_no: String,
    kind: String,
    package_id: i64,
    package_name: String,
    cycle: String,
    period_start: String,
    period_end: String,
    price: f64,
    credit: f64,
    subtotal: f64,
    vat_amount: f64,
    total: f64,
    due_date: String,
    status: String,
    slip_url: Option<String>,
    slip_at: Option<String>,
    reject_reason: Option<String>,
    paid_at: Option<String>,
    payment_ref: Option<String>,
    receipt_no: Option<String>,
    #[sqlx(json)]
    issuer: Value,
    #[sqlx(json)]
    payer: Value,
    void_reason: Option<String>,
    created_at: String,
    /// ผลตรวจสลิปล่าสุด
    slip_result: Option<String>,
    slip_message: Option<String>,
}

const INV_SELECT: &str = "SELECT i.*, o.name AS org_name,
        (SELECT c.result FROM slip_checks c WHERE c.source = 'subscription' AND c.source_id = i.id ORDER BY c.id DESC LIMIT 1) AS slip_result,
        (SELECT c.message FROM slip_checks c WHERE c.source = 'subscription' AND c.source_id = i.id ORDER BY c.id DESC LIMIT 1) AS slip_message
    FROM subscription_invoices i JOIN organizations o ON o.id = i.org_id";

async fn load_invoice(db: &SqlitePool, id: i64) -> AppResult<SubInvoice> {
    sqlx::query_as(&format!("{INV_SELECT} WHERE i.id = ?"))
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or(AppError::NotFound)
}

async fn next_no(conn: &mut SqliteConnection, prefix: &str, date: NaiveDate) -> AppResult<String> {
    let year = buddhist_year(date.year());
    let no: i64 = sqlx::query_scalar(
        "INSERT INTO platform_doc_sequences (doc_type, year, last_no) VALUES (?, ?, 1)
         ON CONFLICT (doc_type, year) DO UPDATE SET last_no = last_no + 1 RETURNING last_no",
    )
    .bind(prefix)
    .bind(year)
    .fetch_one(conn)
    .await?;
    Ok(format!("{prefix}{year}-{no:05}"))
}

fn issuer_json(p: &Platform) -> Value {
    json!({
        "name": p.company_name, "tax_id": p.tax_id, "branch_code": p.branch_code, "address": p.address,
        "phone": p.phone, "email": p.email, "vat_registered": p.vat_registered, "vat_rate": p.vat_rate,
    })
}

async fn payer_json(db: &SqlitePool, org_id: i64) -> AppResult<Value> {
    let i = crate::docs::load_issuer(db, org_id).await?;
    Ok(json!({
        "name": i.legal_name, "tax_id": i.tax_id, "branch_code": i.branch_code,
        "address": i.address, "phone": i.phone,
    }))
}

/// ออกใบแจ้งหนี้ใหม่ (ยกเลิกใบค้างชำระเดิมให้) — ถ้ามีสลิปรอตรวจอยู่ต้องรอผลก่อน
async fn issue(
    s: &AppState,
    org_id: i64,
    package_id: i64,
    cycle: &str,
    created_by: Option<i64>,
) -> AppResult<i64> {
    validate_in("cycle", cycle, CYCLES)?;
    let plat = load_platform(&s.db).await?;
    let target = load_pkg(&s.db, package_id).await?;
    let mut conn = s.db.acquire().await?;
    let org = load_org(&mut conn, org_id).await?;
    drop(conn);
    if !target.is_active && target.id != org.package_id {
        return Err(AppError::BadRequest("แพ็กเกจนี้ปิดการขายแล้ว".into()));
    }
    let current = load_pkg(&s.db, org.package_id).await?;
    if price_for(&target, cycle, &plat) <= 0.0 {
        return Err(AppError::BadRequest("แพ็กเกจฟรีไม่ต้องออกใบแจ้งหนี้".into()));
    }
    check_fits(&s.db, org_id, &target).await?;
    let d = plan(&org, &current, target, cycle, &plat, today());
    let amount = round2((d.price - d.credit).max(0.0));
    let (subtotal, vat) = if plat.vat_registered && plat.vat_rate > 0.0 {
        let net = round2(amount * 100.0 / (100.0 + plat.vat_rate));
        (net, round2(amount - net))
    } else {
        (amount, 0.0)
    };
    let payer = payer_json(&s.db, org_id).await?;

    let mut tx = s.db.begin().await?;
    let in_review: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM subscription_invoices WHERE org_id = ? AND status = 'review'",
    )
    .bind(org_id)
    .fetch_one(&mut *tx)
    .await?;
    if in_review > 0 {
        return Err(AppError::Conflict(
            "มีสลิปที่รอผู้ให้บริการตรวจสอบอยู่ — รอผลก่อนสั่งซื้อใหม่".into(),
        ));
    }
    sqlx::query(
        "UPDATE subscription_invoices SET status = 'void', void_reason = 'ออกใบแจ้งหนี้ใบใหม่แทน'
         WHERE org_id = ? AND status = 'pending'",
    )
    .bind(org_id)
    .execute(&mut *tx)
    .await?;
    let doc_no = next_no(&mut tx, "PINV", today()).await?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO subscription_invoices (org_id, doc_no, kind, package_id, package_name, cycle, period_start,
            period_end, price, credit, subtotal, vat_amount, total, due_date, issuer, payer, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(org_id)
    .bind(&doc_no)
    .bind(d.kind)
    .bind(d.pkg.id)
    .bind(&d.pkg.name)
    .bind(&d.cycle)
    .bind(d.start)
    .bind(period_end(d.start, &d.cycle))
    .bind(d.price)
    .bind(d.credit)
    .bind(subtotal)
    .bind(vat)
    .bind(amount)
    .bind(d.due)
    .bind(issuer_json(&plat).to_string())
    .bind(payer.to_string())
    .bind(created_by)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    email_owners(
        s,
        org_id,
        "invoice",
        format!("ใบแจ้งหนี้ค่าบริการ {doc_no}"),
        vec![
            format!(
                "แพ็กเกจ {} ({}) รอบ {} – {}",
                d.pkg.name,
                if d.cycle == "yearly" {
                    "รายปี"
                } else {
                    "รายเดือน"
                },
                crate::thai::long_date(d.start),
                crate::thai::long_date(period_end(d.start, &d.cycle))
            ),
            format!(
                "ยอดชำระ {} บาท ครบกำหนด {}",
                crate::thai::money(amount),
                crate::thai::long_date(d.due)
            ),
            "ชำระด้วย QR พร้อมเพย์ในหน้าแพ็กเกจ แล้วแนบสลิปเพื่อยืนยันการชำระ".into(),
        ],
    )
    .await;
    Ok(id)
}

/// แจ้งผู้ดูแลแพลตฟอร์มว่ามีสลิปรอตรวจ
async fn notify_super_admins(s: &AppState, inv: &SubInvoice) {
    let admins: Vec<String> =
        sqlx::query_scalar("SELECT email FROM users WHERE is_super_admin = 1 AND is_active = 1")
            .fetch_all(&s.db)
            .await
            .unwrap_or_default();
    for to in admins {
        let _ = crate::mail::queue(
            &s.db,
            crate::mail::Email {
                to: &to,
                kind: "slip_review",
                subject: format!("สลิปรอตรวจ {} — {}", inv.doc_no, inv.org_name),
                heading: "มีสลิปค่าบริการรอตรวจ".into(),
                paragraphs: vec![format!(
                    "{} แนบสลิปสำหรับ {} ({} {}) ยอด {} บาท",
                    inv.org_name,
                    inv.doc_no,
                    inv.package_name,
                    if inv.cycle == "yearly" {
                        "รายปี"
                    } else {
                        "รายเดือน"
                    },
                    crate::thai::money(inv.total)
                )],
                button: Some((
                    "เปิดหน้าค่าบริการ".into(),
                    format!("{}/admin/billing", s.public_url),
                )),
                footer: "อีเมลแจ้งเตือนสำหรับผู้ดูแลแพลตฟอร์ม Estate".into(),
            },
        )
        .await;
    }
}

/// ส่งอีเมลถึงเจ้าของบัญชีองค์กร (ล้มเหลวไม่กระทบการทำงานหลัก)
async fn email_owners(
    s: &AppState,
    org_id: i64,
    kind: &str,
    subject: String,
    paragraphs: Vec<String>,
) {
    let owners: Vec<(String, String)> = match sqlx::query_as(
        "SELECT u.email, o.name FROM org_members m JOIN users u ON u.id = m.user_id
         JOIN organizations o ON o.id = m.org_id
         WHERE m.org_id = ? AND m.role = 'owner' AND u.is_active = 1",
    )
    .bind(org_id)
    .fetch_all(&s.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!(error = %e, "อ่านอีเมลเจ้าของบัญชีไม่ได้");
            return;
        }
    };
    for (to, org_name) in owners {
        let r = crate::mail::queue(
            &s.db,
            crate::mail::Email {
                to: &to,
                kind,
                subject: format!("{subject} — {org_name}"),
                heading: subject.clone(),
                paragraphs: paragraphs.clone(),
                button: Some((
                    "เปิดหน้าแพ็กเกจและการชำระเงิน".into(),
                    format!("{}/billing", s.public_url),
                )),
                footer: format!("อีเมลนี้ส่งถึงเจ้าของบัญชี {org_name} บนระบบ Estate"),
            },
        )
        .await;
        if let Err(e) = r {
            tracing::warn!(error = %e, "เข้าคิวอีเมลไม่สำเร็จ");
        }
    }
}

fn with_payment(inv: &SubInvoice, plat: &Platform) -> Value {
    let payload = matches!(inv.status.as_str(), "pending" | "review")
        .then(|| promptpay::payload(&plat.promptpay_id, Some(inv.total)))
        .flatten();
    json!({
        "invoice": inv,
        "promptpay_payload": payload,
        "bank_info": plat.bank_info,
        "baht_text": crate::thai::baht_text(inv.total),
    })
}

/// สรุปสถานะสมาชิกสำหรับแถบแจ้งเตือนในแอป
pub async fn summary(db: &SqlitePool, org_id: i64) -> AppResult<Value> {
    let grace: i64 = sqlx::query_scalar("SELECT grace_days FROM platform_settings WHERE id = 1")
        .fetch_one(db)
        .await?;
    let ends_at: Option<NaiveDate> =
        sqlx::query_scalar("SELECT ends_at FROM organizations WHERE id = ?")
            .bind(org_id)
            .fetch_one(db)
            .await?;
    let open: Option<(i64, String, f64, String, String, Option<String>)> = sqlx::query_as(
        "SELECT id, doc_no, total, due_date, status, reject_reason FROM subscription_invoices
         WHERE org_id = ? AND status IN ('pending','review')",
    )
    .bind(org_id)
    .fetch_optional(db)
    .await?;
    let today = today();
    Ok(json!({
        "days_left": ends_at.map(|e| (e - today).num_days()),
        "grace_until": ends_at.map(|e| e + Duration::days(grace)),
        "in_grace": ends_at.is_some_and(|e| e < today && e + Duration::days(grace) >= today),
        "open_invoice": open.map(|o| json!({
            "id": o.0, "doc_no": o.1, "total": o.2, "due_date": o.3, "status": o.4, "reject_reason": o.5,
        })),
    }))
}

// ---------- องค์กรลูกค้า ----------

pub async fn overview(
    State(s): State<AppState>,
    BillingCtx(ctx): BillingCtx,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let plat = load_platform(&s.db).await?;
    let mut conn = s.db.acquire().await?;
    let org = load_org(&mut conn, ctx.org_id).await?;
    drop(conn);
    let current = load_pkg(&s.db, org.package_id).await?;
    let packages: Vec<Pkg> = sqlx::query_as(&format!(
        "{PKG_SELECT} WHERE is_active = 1 OR id = ? ORDER BY sort_order, id"
    ))
    .bind(org.package_id)
    .fetch_all(&s.db)
    .await?;
    let invoices: Vec<SubInvoice> = sqlx::query_as(&format!(
        "{INV_SELECT} WHERE i.org_id = ? ORDER BY i.id DESC LIMIT 50"
    ))
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    let open = invoices
        .iter()
        .find(|i| matches!(i.status.as_str(), "pending" | "review"))
        .map(|i| with_payment(i, &plat));
    Ok(Json(json!({
        "platform": {
            "company_name": plat.company_name, "bank_info": plat.bank_info,
            "has_promptpay": promptpay::payload(&plat.promptpay_id, None).is_some(),
            "vat_registered": plat.vat_registered, "vat_rate": plat.vat_rate,
            "grace_days": plat.grace_days, "yearly_months": plat.yearly_months,
        },
        "subscription": {
            "package_id": current.id, "package_name": current.name, "cycle": org.billing_cycle,
            "status": org.status, "ends_at": org.ends_at,
            "price": price_for(&current, &org.billing_cycle, &plat),
            "read_only": !matches!(org.status.as_str(), "trial" | "active") || ctx.expired,
        },
        "summary": summary(&s.db, ctx.org_id).await?,
        "packages": packages.iter().map(|p| json!({
            "id": p.id, "name": p.name, "description": p.description,
            "price_monthly": p.price_monthly, "price_yearly": price_for(p, "yearly", &plat),
            "max_properties": p.max_properties, "max_units": p.max_units, "max_members": p.max_members,
            "features": p.features, "current": p.id == org.package_id,
        })).collect::<Vec<_>>(),
        "open_invoice": open,
        "invoices": invoices,
    })))
}

#[derive(Deserialize)]
pub struct CheckoutInput {
    package_id: i64,
    #[serde(default = "monthly")]
    cycle: String,
}

fn monthly() -> String {
    "monthly".into()
}

pub async fn checkout(
    State(s): State<AppState>,
    BillingCtx(ctx): BillingCtx,
    Json(c): Json<CheckoutInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    validate_in("cycle", &c.cycle, CYCLES)?;
    let plat = load_platform(&s.db).await?;
    let target = load_pkg(&s.db, c.package_id).await?;
    let mut conn = s.db.acquire().await?;
    let org = load_org(&mut conn, ctx.org_id).await?;
    drop(conn);
    if org.status == "cancelled" {
        return Err(AppError::Forbidden);
    }
    if !target.is_active && target.id != org.package_id {
        return Err(AppError::BadRequest("แพ็กเกจนี้ปิดการขายแล้ว".into()));
    }

    if price_for(&target, &c.cycle, &plat) <= 0.0 {
        // แพ็กเกจฟรี: เปลี่ยนได้ทันที ไม่ต้องชำระ (แต่ปลดการระงับโดยผู้ให้บริการไม่ได้)
        if org.status == "suspended" {
            return Err(AppError::Conflict(
                "บัญชีถูกระงับโดยผู้ให้บริการ — กรุณาติดต่อผู้ให้บริการ".into(),
            ));
        }
        if target.id == org.package_id && org.ends_at.is_none() {
            return Err(AppError::Conflict("ใช้แพ็กเกจนี้อยู่แล้ว".into()));
        }
        check_fits(&s.db, ctx.org_id, &target).await?;
        let mut tx = s.db.begin().await?;
        let in_review: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM subscription_invoices WHERE org_id = ? AND status = 'review'",
        )
        .bind(ctx.org_id)
        .fetch_one(&mut *tx)
        .await?;
        if in_review > 0 {
            return Err(AppError::Conflict(
                "มีสลิปที่รอผู้ให้บริการตรวจสอบอยู่ — รอผลก่อนเปลี่ยนแพ็กเกจ".into(),
            ));
        }
        sqlx::query(
            "UPDATE subscription_invoices SET status = 'void', void_reason = 'เปลี่ยนเป็นแพ็กเกจฟรี'
             WHERE org_id = ? AND status = 'pending'",
        )
        .bind(ctx.org_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE organizations SET package_id = ?, billing_cycle = 'monthly', status = 'active', ends_at = NULL
             WHERE id = ?",
        )
        .bind(target.id)
        .bind(ctx.org_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        audit::record(
            &s.db,
            &ctx,
            "subscription.checkout",
            "subscription",
            None,
            Some(json!({ "package": target.name, "free": true })),
        )
        .await;
        return Ok(Json(json!({ "switched": true })));
    }

    let id = issue(&s, ctx.org_id, target.id, &c.cycle, Some(ctx.user.id)).await?;
    let inv = load_invoice(&s.db, id).await?;
    audit::record(
        &s.db,
        &ctx,
        "subscription.checkout",
        "subscription",
        Some(id),
        Some(json!({ "doc_no": inv.doc_no, "package": inv.package_name, "cycle": inv.cycle, "total": inv.total })),
    )
    .await;
    Ok(Json(with_payment(&inv, &plat)))
}

async fn own_invoice(s: &AppState, org_id: i64, id: i64) -> AppResult<SubInvoice> {
    let inv = load_invoice(&s.db, id).await?;
    if inv.org_id != org_id {
        return Err(AppError::NotFound);
    }
    Ok(inv)
}

pub async fn invoice(
    State(s): State<AppState>,
    BillingCtx(ctx): BillingCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let inv = own_invoice(&s, ctx.org_id, id).await?;
    let plat = load_platform(&s.db).await?;
    Ok(Json(with_payment(&inv, &plat)))
}

pub async fn upload_slip(
    State(s): State<AppState>,
    BillingCtx(ctx): BillingCtx,
    Path(id): Path<i64>,
    form: Multipart,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    s.limiter.check(
        &format!("pslip:{}", ctx.org_id),
        20,
        StdDuration::from_secs(3600),
    )?;
    let inv = own_invoice(&s, ctx.org_id, id).await?;
    if inv.status != "pending" {
        return Err(AppError::Conflict(match inv.status.as_str() {
            "review" => "แนบสลิปแล้ว กำลังรอตรวจสอบ".into(),
            "paid" => "ใบแจ้งหนี้นี้ชำระแล้ว".into(),
            _ => "ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว".into(),
        }));
    }
    let form = uploads::parse_for(&s, ctx.org_id, form, "pslip").await?;
    let url = form
        .photos
        .first()
        .cloned()
        .ok_or_else(|| AppError::BadRequest("กรุณาแนบรูปสลิป".into()))?;
    let note = form.text("note").map(str::to_string);
    sqlx::query(
        "UPDATE subscription_invoices SET status = 'review', slip_url = ?, slip_at = datetime('now'),
            reject_reason = NULL, payment_ref = COALESCE(?, payment_ref)
         WHERE id = ? AND status = 'pending'",
    )
    .bind(&url)
    .bind(note)
    .bind(id)
    .execute(&s.db)
    .await?;
    audit::record(
        &s.db,
        &ctx,
        "subscription.slip",
        "subscription",
        Some(id),
        Some(json!({ "doc_no": inv.doc_no })),
    )
    .await;
    let (provider, auto) = crate::slip::platform_provider(&s.db).await?;
    let check = crate::slip::check(
        &s,
        Some(&provider),
        crate::slip::CheckInput {
            org_id: ctx.org_id,
            source: "subscription",
            source_id: id,
            slip_url: &url,
            expected: Some(inv.total),
        },
    )
    .await?;
    let mut paid = false;
    if auto && check.verified() {
        match mark_paid(&s, id, None, None, check.trans_ref.as_deref()).await {
            Ok(()) => paid = true,
            Err(e) => tracing::warn!(id, error = %e, "ยืนยันค่าแพ็กเกจอัตโนมัติไม่สำเร็จ"),
        }
    }
    if !paid {
        notify_super_admins(&s, &inv).await;
    }
    let plat = load_platform(&s.db).await?;
    Ok(Json(with_payment(&load_invoice(&s.db, id).await?, &plat)))
}

pub async fn cancel(
    State(s): State<AppState>,
    BillingCtx(ctx): BillingCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let inv = own_invoice(&s, ctx.org_id, id).await?;
    if inv.status != "pending" {
        return Err(AppError::Conflict("ยกเลิกได้เฉพาะใบที่ยังไม่ได้แนบสลิป".into()));
    }
    sqlx::query(
        "UPDATE subscription_invoices SET status = 'void', void_reason = 'ลูกค้ายกเลิก' WHERE id = ?",
    )
    .bind(id)
    .execute(&s.db)
    .await?;
    audit::record(
        &s.db,
        &ctx,
        "subscription.cancel",
        "subscription",
        Some(id),
        Some(json!({ "doc_no": inv.doc_no })),
    )
    .await;
    Ok(Json(json!({})))
}

// ---------- ผู้ดูแลแพลตฟอร์ม ----------

#[derive(Deserialize)]
pub struct AdminQuery {
    status: Option<String>,
    org_id: Option<i64>,
}

pub async fn admin_overview(
    State(s): State<AppState>,
    _: SuperAdmin,
    Query(q): Query<AdminQuery>,
) -> AppResult<Json<Value>> {
    let invoices: Vec<SubInvoice> = sqlx::query_as(&format!(
        "{INV_SELECT} WHERE (?1 IS NULL OR i.status = ?1) AND (?2 IS NULL OR i.org_id = ?2)
         ORDER BY CASE i.status WHEN 'review' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, i.id DESC LIMIT 300"
    ))
    .bind(&q.status)
    .bind(q.org_id)
    .fetch_all(&s.db)
    .await?;
    let (review, pending, overdue, month, year): (i64, i64, i64, f64, f64) = sqlx::query_as(
        "SELECT COALESCE(SUM(status = 'review'), 0), COALESCE(SUM(status = 'pending'), 0),
                COALESCE(SUM(status = 'pending' AND due_date < date('now')), 0),
                COALESCE(SUM(CASE WHEN status = 'paid' AND strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now') THEN total END), 0.0),
                COALESCE(SUM(CASE WHEN status = 'paid' AND strftime('%Y', paid_at) = strftime('%Y', 'now') THEN total END), 0.0)
         FROM subscription_invoices",
    )
    .fetch_one(&s.db)
    .await?;
    let (slip, slip_auto) = crate::slip::platform_provider(&s.db).await?;
    Ok(Json(json!({
        "settings": load_platform(&s.db).await?,
        "slip": { "provider": slip.kind, "has_key": !slip.api_key.is_empty(), "branch_id": slip.branch_id,
                  "auto_approve": slip_auto },
        "summary": { "review": review, "pending": pending, "overdue": overdue,
                     "revenue_month": month, "revenue_year": year },
        "invoices": invoices,
    })))
}

pub async fn update_settings(
    State(s): State<AppState>,
    _: SuperAdmin,
    Json(p): Json<Platform>,
) -> AppResult<Json<Platform>> {
    let digits = |v: &str, len: usize| {
        v.is_empty() || (v.len() == len && v.chars().all(|c| c.is_ascii_digit()))
    };
    if !digits(p.tax_id.trim(), 13) {
        return Err(AppError::BadRequest(
            "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก".into(),
        ));
    }
    if !digits(p.branch_code.trim(), 5) {
        return Err(AppError::BadRequest("รหัสสาขาต้องเป็นตัวเลข 5 หลัก".into()));
    }
    if !p.promptpay_id.trim().is_empty() && promptpay::payload(&p.promptpay_id, None).is_none() {
        return Err(AppError::BadRequest(
            "พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก เลขบัตร/เลขผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก".into(),
        ));
    }
    if !(0..=60).contains(&p.remind_days) || !(0..=60).contains(&p.grace_days) {
        return Err(AppError::BadRequest(
            "จำนวนวันแจ้งเตือน/ผ่อนผันต้องอยู่ระหว่าง 0–60".into(),
        ));
    }
    if !(1..=12).contains(&p.yearly_months) || !(0.0..=30.0).contains(&p.vat_rate) {
        return Err(AppError::BadRequest("ค่าราคารายปีหรืออัตราภาษีไม่ถูกต้อง".into()));
    }
    sqlx::query(
        "UPDATE platform_settings SET company_name = ?, tax_id = ?, branch_code = ?, address = ?, phone = ?,
            email = ?, vat_registered = ?, vat_rate = ?, promptpay_id = ?, bank_info = ?, remind_days = ?,
            grace_days = ?, yearly_months = ? WHERE id = 1",
    )
    .bind(p.company_name.trim())
    .bind(p.tax_id.trim())
    .bind(if p.branch_code.trim().is_empty() { "00000" } else { p.branch_code.trim() })
    .bind(p.address.trim())
    .bind(p.phone.trim())
    .bind(p.email.trim())
    .bind(p.vat_registered)
    .bind(p.vat_rate)
    .bind(p.promptpay_id.trim())
    .bind(p.bank_info.trim())
    .bind(p.remind_days)
    .bind(p.grace_days)
    .bind(p.yearly_months)
    .execute(&s.db)
    .await?;
    Ok(Json(load_platform(&s.db).await?))
}

#[derive(Deserialize)]
pub struct SlipSettingsInput {
    provider: String,
    /// ว่าง = คงคีย์เดิม
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    branch_id: String,
    #[serde(default)]
    auto_approve: bool,
}

/// ผู้ให้บริการตรวจสลิปสำหรับค่าแพ็กเกจ (แยกจากของแต่ละองค์กร)
pub async fn update_slip_settings(
    State(s): State<AppState>,
    _: SuperAdmin,
    Json(i): Json<SlipSettingsInput>,
) -> AppResult<Json<Value>> {
    validate_in("provider", &i.provider, crate::slip::PROVIDERS)?;
    if i.provider == "slipok" && i.branch_id.trim().is_empty() {
        return Err(AppError::BadRequest("SlipOK ต้องระบุ Branch ID".into()));
    }
    let key = i.api_key.trim();
    sqlx::query(
        "UPDATE platform_settings SET slip_provider = ?, slip_api_key = COALESCE(NULLIF(?, ''), slip_api_key),
            slip_branch_id = ?, slip_auto_approve = ? WHERE id = 1",
    )
    .bind(&i.provider)
    .bind(if key.is_empty() {
        String::new()
    } else {
        crate::crypto::encrypt(key)
    })
    .bind(i.branch_id.trim())
    .bind(i.auto_approve && i.provider != "none")
    .execute(&s.db)
    .await?;
    let (p, auto) = crate::slip::platform_provider(&s.db).await?;
    Ok(Json(json!({
        "provider": p.kind, "has_key": !p.api_key.is_empty(), "branch_id": p.branch_id, "auto_approve": auto,
    })))
}

#[derive(Deserialize)]
pub struct AdminIssueInput {
    org_id: i64,
    package_id: i64,
    #[serde(default = "monthly")]
    cycle: String,
}

pub async fn admin_issue(
    State(s): State<AppState>,
    SuperAdmin(me): SuperAdmin,
    Json(i): Json<AdminIssueInput>,
) -> AppResult<Json<Value>> {
    let id = issue(&s, i.org_id, i.package_id, &i.cycle, Some(me.id)).await?;
    let plat = load_platform(&s.db).await?;
    Ok(Json(with_payment(&load_invoice(&s.db, id).await?, &plat)))
}

pub async fn admin_invoice(
    State(s): State<AppState>,
    _: SuperAdmin,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    let plat = load_platform(&s.db).await?;
    Ok(Json(with_payment(&load_invoice(&s.db, id).await?, &plat)))
}

#[derive(Deserialize, Default)]
pub struct ApproveInput {
    #[serde(default)]
    payment_ref: Option<String>,
}

pub async fn approve(
    State(s): State<AppState>,
    SuperAdmin(me): SuperAdmin,
    ip: ClientIp,
    Path(id): Path<i64>,
    body: Option<Json<ApproveInput>>,
) -> AppResult<Json<Value>> {
    let input = body.map(|b| b.0).unwrap_or_default();
    mark_paid(
        &s,
        id,
        Some(me.id),
        ip.0.as_deref(),
        input.payment_ref.as_deref(),
    )
    .await?;
    let plat = load_platform(&s.db).await?;
    Ok(Json(with_payment(&load_invoice(&s.db, id).await?, &plat)))
}

/// ยืนยันการชำระ: ออกเลขใบเสร็จ แล้วต่ออายุ/เปลี่ยนแพ็กเกจขององค์กรในรายการเดียวกัน
/// `approver = None` คือระบบยืนยันเองจากผลตรวจสลิปกับธนาคาร
async fn mark_paid(
    s: &AppState,
    id: i64,
    approver: Option<i64>,
    ip: Option<&str>,
    payment_ref: Option<&str>,
) -> AppResult<()> {
    let plat = load_platform(&s.db).await?;
    let today = today();
    let mut tx = s.db.begin().await?;
    let (org_id, kind, cycle, package_id, status): (i64, String, String, i64, String) =
        sqlx::query_as(
            "SELECT org_id, kind, cycle, package_id, status FROM subscription_invoices WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(AppError::NotFound)?;
    if !matches!(status.as_str(), "pending" | "review") {
        return Err(AppError::Conflict("ใบแจ้งหนี้นี้ชำระแล้วหรือถูกยกเลิก".into()));
    }
    let org = load_org(&mut tx, org_id).await?;
    // รอบจริงนับจากวันที่ยืนยัน (ลูกค้าอาจจ่ายช้ากว่าวันที่ออกใบ)
    let start = if kind == "renewal" && org.package_id == package_id {
        renewal_start(org.ends_at, plat.grace_days, today)
    } else {
        today
    };
    let end = period_end(start, &cycle);
    let receipt_no = next_no(&mut tx, "PRC", today).await?;
    sqlx::query(
        "UPDATE subscription_invoices SET status = 'paid', paid_at = datetime('now'), receipt_no = ?,
            approved_by = ?, payment_ref = COALESCE(NULLIF(?, ''), payment_ref), period_start = ?, period_end = ?,
            reject_reason = NULL
         WHERE id = ?",
    )
    .bind(&receipt_no)
    .bind(approver)
    .bind(payment_ref.map(str::trim))
    .bind(start)
    .bind(end)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE organizations SET package_id = ?, billing_cycle = ?, ends_at = ?,
            status = CASE WHEN status = 'cancelled' THEN status ELSE 'active' END
         WHERE id = ?",
    )
    .bind(package_id)
    .bind(&cycle)
    .bind(end)
    .bind(org_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit::log(
        &s.db,
        Some(org_id),
        approver,
        ip,
        "subscription.paid",
        "subscription",
        Some(id),
        Some(json!({ "receipt_no": receipt_no, "ends_at": end, "auto": approver.is_none() })),
    )
    .await;
    email_owners(
        s,
        org_id,
        "receipt",
        format!("ได้รับชำระค่าบริการแล้ว ใบเสร็จ {receipt_no}"),
        vec![
            "ขอบคุณที่ชำระค่าบริการ ระบบต่ออายุแพ็กเกจให้เรียบร้อยแล้ว".into(),
            format!("ใช้งานได้ถึง {}", crate::thai::long_date(end)),
            "ดาวน์โหลดใบเสร็จรับเงิน/ใบกำกับภาษีได้ที่ประวัติในหน้าแพ็กเกจ".into(),
        ],
    )
    .await;
    Ok(())
}

#[derive(Deserialize)]
pub struct ReasonInput {
    reason: String,
}

/// สลิปไม่ถูกต้อง: กลับไปรอชำระ ให้ลูกค้าแนบใหม่
pub async fn reject(
    State(s): State<AppState>,
    SuperAdmin(me): SuperAdmin,
    ip: ClientIp,
    Path(id): Path<i64>,
    Json(r): Json<ReasonInput>,
) -> AppResult<Json<Value>> {
    let reason = r.reason.trim();
    if reason.is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุเหตุผล".into()));
    }
    let inv = load_invoice(&s.db, id).await?;
    if inv.status != "review" {
        return Err(AppError::Conflict("ใบนี้ไม่ได้อยู่ระหว่างตรวจสลิป".into()));
    }
    sqlx::query(
        "UPDATE subscription_invoices SET status = 'pending', reject_reason = ? WHERE id = ? AND status = 'review'",
    )
    .bind(reason)
    .bind(id)
    .execute(&s.db)
    .await?;
    audit::log(
        &s.db,
        Some(inv.org_id),
        Some(me.id),
        ip.0.as_deref(),
        "subscription.rejected",
        "subscription",
        Some(id),
        Some(json!({ "doc_no": inv.doc_no, "reason": reason })),
    )
    .await;
    email_owners(
        &s,
        inv.org_id,
        "slip_rejected",
        format!("สลิปค่าบริการ {} ยังไม่ผ่านการตรวจสอบ", inv.doc_no),
        vec![
            format!("เหตุผล: {reason}"),
            "กรุณาตรวจสอบและแนบสลิปใหม่ในหน้าแพ็กเกจ".into(),
        ],
    )
    .await;
    let plat = load_platform(&s.db).await?;
    Ok(Json(with_payment(&load_invoice(&s.db, id).await?, &plat)))
}

pub async fn void(
    State(s): State<AppState>,
    _: SuperAdmin,
    Path(id): Path<i64>,
    Json(r): Json<ReasonInput>,
) -> AppResult<Json<Value>> {
    let reason = r.reason.trim();
    if reason.is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุเหตุผล".into()));
    }
    let n = sqlx::query(
        "UPDATE subscription_invoices SET status = 'void', void_reason = ?
         WHERE id = ? AND status IN ('pending','review')",
    )
    .bind(reason)
    .bind(id)
    .execute(&s.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::Conflict(
            "ยกเลิกได้เฉพาะใบที่ยังไม่ชำระ — ถ้าต้องการปรับวันหมดอายุให้แก้ที่หน้าองค์กร".into(),
        ));
    }
    let plat = load_platform(&s.db).await?;
    Ok(Json(with_payment(&load_invoice(&s.db, id).await?, &plat)))
}

// ---------- งานเบื้องหลัง ----------

/// ออกใบแจ้งหนี้ต่ออายุล่วงหน้าให้องค์กรที่ใกล้หมดอายุ (ครั้งเดียวต่อรอบ — ถ้าลูกค้ายกเลิกจะไม่ออกซ้ำ)
/// เลยช่วงผ่อนผันแล้วไม่ออกให้อีก ลูกค้าต่ออายุเองได้ที่หน้าแพ็กเกจ
pub async fn run_renewals(s: &AppState) -> AppResult<usize> {
    let rows: Vec<(i64, i64, String)> = sqlx::query_as(
        "SELECT o.id, o.package_id, o.billing_cycle
         FROM organizations o JOIN packages p ON p.id = o.package_id, platform_settings ps
         WHERE ps.id = 1 AND o.status IN ('trial','active') AND o.ends_at IS NOT NULL
           AND o.ends_at <= date('now', '+' || ps.remind_days || ' days')
           AND o.ends_at >= date('now', '-' || ps.grace_days || ' days')
           AND p.price_monthly > 0
           AND NOT EXISTS (SELECT 1 FROM subscription_invoices i WHERE i.org_id = o.id
                 AND (i.status IN ('pending','review')
                      OR (i.kind = 'renewal' AND i.period_start = o.ends_at)))",
    )
    .fetch_all(&s.db)
    .await?;
    let mut created = 0;
    for (org_id, package_id, cycle) in rows {
        match issue(s, org_id, package_id, &cycle, None).await {
            Ok(_) => created += 1,
            Err(e) => tracing::warn!(org_id, error = %e, "ออกใบแจ้งหนี้ต่ออายุไม่สำเร็จ"),
        }
    }
    Ok(created)
}

pub fn spawn_renewals(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(StdDuration::from_secs(3600));
        loop {
            tick.tick().await;
            match run_renewals(&state).await {
                Ok(0) => {}
                Ok(n) => tracing::info!(n, "ออกใบแจ้งหนี้ต่ออายุแพ็กเกจ"),
                Err(e) => tracing::warn!(error = %e, "งานต่ออายุแพ็กเกจล้มเหลว"),
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        s.parse().unwrap()
    }

    #[test]
    fn renewal_continues_within_grace() {
        assert_eq!(
            renewal_start(Some(d("2026-10-20")), 3, d("2026-10-11")),
            d("2026-10-20")
        );
        assert_eq!(
            renewal_start(Some(d("2026-10-09")), 3, d("2026-10-11")),
            d("2026-10-09")
        );
        assert_eq!(
            renewal_start(Some(d("2026-10-01")), 3, d("2026-10-11")),
            d("2026-10-11")
        );
        assert_eq!(renewal_start(None, 3, d("2026-10-11")), d("2026-10-11"));
    }

    #[test]
    fn period_end_handles_month_ends() {
        assert_eq!(period_end(d("2026-01-31"), "monthly"), d("2026-02-28"));
        assert_eq!(period_end(d("2026-10-11"), "yearly"), d("2027-10-11"));
    }
}
