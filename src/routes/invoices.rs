use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::receipts;
use crate::{
    auth::{ensure_property, ensure_unit, OrgCtx},
    billing::{self, LineItem, MeterPair, MonthlyInput},
    docs::{self, DocType},
    error::{AppError, AppResult},
    models::{ExtraCharge, Invoice, Payer, Receipt},
    promptpay, AppState,
};

pub(crate) const SELECT: &str = "SELECT i.id, i.doc_no, i.kind, i.unit_id, i.booking_id, i.period, i.issue_date,
        i.due_date, i.items, i.subtotal, i.vat_amount, i.total, i.status, i.void_reason, i.paid_at, i.created_at,
        u.name AS unit_name, p.id AS property_id, p.name AS property_name,
        b.tenant_id AS tenant_id, t.full_name AS tenant_name,
        (SELECT COALESCE(SUM(pm.amount), 0.0) FROM payments pm WHERE pm.invoice_id = i.id AND pm.voided = 0)
            AS paid_amount,
        CASE WHEN i.status = 'unpaid'
             THEN MAX(0, CAST(julianday(date('now', 'localtime')) - julianday(i.due_date) AS INTEGER))
             ELSE 0 END AS overdue_days,
        p.late_fee_type, p.late_fee_amount, p.late_fee_grace_days
    FROM invoices i JOIN units u ON u.id = i.unit_id JOIN properties p ON p.id = u.property_id
    LEFT JOIN bookings b ON b.id = i.booking_id LEFT JOIN tenants t ON t.id = b.tenant_id";

#[derive(Deserialize)]
pub struct Filter {
    property_id: Option<i64>,
    status: Option<String>,
    period: Option<String>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(f): Query<Filter>,
) -> AppResult<Json<Vec<Invoice>>> {
    let overdue = f.status.as_deref() == Some("overdue");
    let sql = format!(
        "{SELECT} WHERE p.org_id = ?4 AND (?1 IS NULL OR p.id = ?1) AND (?2 IS NULL OR i.status = ?2)
           AND (?3 IS NULL OR i.period = ?3)
           AND (?5 = 0 OR (i.status = 'unpaid' AND i.due_date < date('now', 'localtime')))
         ORDER BY i.period DESC, p.name, u.name, i.id DESC"
    );
    let rows: Vec<Invoice> = sqlx::query_as(&sql)
        .bind(f.property_id)
        .bind(if overdue { None } else { f.status })
        .bind(f.period)
        .bind(ctx.org_id)
        .bind(overdue)
        .fetch_all(&s.db)
        .await?;
    Ok(Json(rows.into_iter().map(Invoice::with_late_fee).collect()))
}

pub(crate) async fn fetch(db: &SqlitePool, org_id: i64, id: i64) -> AppResult<Invoice> {
    let inv: Invoice = sqlx::query_as(&format!("{SELECT} WHERE i.id = ? AND p.org_id = ?"))
        .bind(id)
        .bind(org_id)
        .fetch_one(db)
        .await?;
    Ok(inv.with_late_fee())
}

/// รายละเอียดใบแจ้งหนี้ (ใช้ร่วมกับพอร์ทัลผู้เช่า)
pub(crate) async fn detail(db: &SqlitePool, org_id: i64, invoice: Invoice) -> AppResult<Value> {
    let (pp_id, property_address): (Option<String>, String) =
        sqlx::query_as("SELECT promptpay_id, address FROM properties WHERE id = ?")
            .bind(invoice.property_id)
            .fetch_one(db)
            .await?;
    let payload = (invoice.status == "unpaid")
        .then(|| {
            pp_id.and_then(|t| promptpay::payload(&t, Some(invoice.remaining() + invoice.late_fee)))
        })
        .flatten();
    let tenant: Option<(String, String, String, String, String)> =
        match invoice.tenant_id {
            Some(tid) => sqlx::query_as(
                "SELECT full_name, address, tax_id, branch_code, phone FROM tenants WHERE id = ?",
            )
            .bind(tid)
            .fetch_optional(db)
            .await?,
            None => None,
        };
    let receipts = receipts::for_invoice(db, invoice.id).await?;
    let issuer = docs::load_issuer(db, org_id).await?;
    Ok(json!({
        "paid_amount": invoice.paid_amount,
        "promptpay_payload": payload,
        "receipts": receipts,
        "issuer": issuer,
        "tenant": tenant.map(|(full_name, address, tax_id, branch_code, phone)| json!({
            "full_name": full_name, "address": address, "tax_id": tax_id,
            "branch_code": branch_code, "phone": phone,
        })),
        "property": { "name": invoice.property_name, "address": property_address },
        "amount_text": crate::thai::baht_text(invoice.total),
        "invoice": invoice,
    }))
}

pub async fn get(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    let invoice = fetch(&s.db, ctx.org_id, id).await?;
    Ok(Json(detail(&s.db, ctx.org_id, invoice).await?))
}

fn period_bounds(period: &str) -> AppResult<(NaiveDate, NaiveDate)> {
    let start = NaiveDate::parse_from_str(&format!("{period}-01"), "%Y-%m-%d")
        .map_err(|_| AppError::BadRequest("รอบบิลต้องอยู่ในรูปแบบ YYYY-MM".into()))?;
    let next = if start.month() == 12 {
        NaiveDate::from_ymd_opt(start.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(start.year(), start.month() + 1, 1)
    }
    .expect("valid date");
    Ok((start, next - Duration::days(1)))
}

async fn meter_pair(
    db: &SqlitePool,
    unit_id: i64,
    kind: &str,
    until: NaiveDate,
) -> AppResult<Option<MeterPair>> {
    let vals: Vec<f64> = sqlx::query_scalar(
        "SELECT value FROM meter_readings WHERE unit_id = ? AND meter_type = ? AND reading_date <= ?
         ORDER BY reading_date DESC, id DESC LIMIT 2",
    )
    .bind(unit_id)
    .bind(kind)
    .bind(until)
    .fetch_all(db)
    .await?;
    Ok(match vals.as_slice() {
        [current, previous] => Some(MeterPair {
            previous: *previous,
            current: *current,
        }),
        _ => None,
    })
}

struct NewInvoice<'a> {
    org_id: i64,
    unit_id: i64,
    booking_id: Option<i64>,
    kind: &'a str,
    period: &'a str,
    due_date: NaiveDate,
    items: Vec<LineItem>,
}

/// บันทึกใบแจ้งหนี้พร้อมออกเลขที่เอกสารใน transaction เดียวกัน
async fn insert_invoice(db: &SqlitePool, inv: NewInvoice<'_>) -> AppResult<i64> {
    let issuer = docs::load_issuer(db, inv.org_id).await?;
    let t = billing::totals(&inv.items, issuer.vat_registered, issuer.vat_rate);
    let today = Local::now().date_naive();
    let mut tx = db.begin().await?;
    let doc_no = docs::next_doc_no(&mut tx, inv.org_id, DocType::Invoice, today).await?;
    let id = sqlx::query_scalar(
        "INSERT INTO invoices (doc_no, kind, unit_id, booking_id, period, issue_date, due_date, items,
            subtotal, vat_amount, total)
         VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(&doc_no)
    .bind(inv.kind)
    .bind(inv.unit_id)
    .bind(inv.booking_id)
    .bind(inv.period)
    .bind(today)
    .bind(inv.due_date)
    .bind(sqlx::types::Json(&inv.items))
    .bind(t.subtotal)
    .bind(t.vat_amount)
    .bind(t.total)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| match AppError::from(e) {
        AppError::Conflict(_) => AppError::Conflict("ห้องนี้มีบิลรายเดือนของรอบนี้แล้ว".into()),
        other => other,
    })?;
    tx.commit().await?;
    Ok(id)
}

/// (booking_id, unit_id, unit_name, ค่าเช่า, ค่าบริการเพิ่มเติม)
type LeaseRow = (i64, i64, String, f64, sqlx::types::Json<Vec<ExtraCharge>>);

#[derive(Deserialize)]
pub struct GenerateInput {
    property_id: i64,
    period: String,
    #[serde(default = "default_due_days")]
    due_days: i64,
}

fn default_due_days() -> i64 {
    5
}

#[derive(Serialize)]
pub struct GenerateResult {
    created: Vec<i64>,
    skipped: Vec<String>,
}

/// ออกบิลรายเดือนให้ทุกห้องที่มีสัญญาเช่า (lease) ที่ยังมีผลในโครงการ
pub async fn generate(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(g): Json<GenerateInput>,
) -> AppResult<Json<GenerateResult>> {
    ctx.require_feature(ctx.features.invoices, "การออกบิลอัตโนมัติ")?;
    ensure_property(&s.db, ctx.org_id, g.property_id).await?;
    let (start, end) = period_bounds(&g.period)?;
    let (e_rate, w_rate): (f64, f64) =
        sqlx::query_as("SELECT electric_rate, water_rate FROM properties WHERE id = ?")
            .bind(g.property_id)
            .fetch_one(&s.db)
            .await?;

    let leases: Vec<LeaseRow> = sqlx::query_as(
        "SELECT b.id, u.id, u.name, b.price, u.extra_charges FROM bookings b JOIN units u ON u.id = b.unit_id
         WHERE u.property_id = ? AND b.kind = 'lease' AND b.status = 'active'
           AND b.start_date <= ? AND COALESCE(b.end_date, '9999-12-31') >= ?
         ORDER BY u.floor, u.name",
    )
    .bind(g.property_id)
    .bind(end)
    .bind(start)
    .fetch_all(&s.db)
    .await?;

    let due = Local::now().date_naive() + Duration::days(g.due_days.clamp(0, 60));
    let mut result = GenerateResult {
        created: vec![],
        skipped: vec![],
    };
    for (booking_id, unit_id, unit_name, rent, extras) in leases {
        let exists: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM invoices WHERE unit_id = ? AND period = ? AND kind = 'monthly' AND status != 'void'",
        )
        .bind(unit_id)
        .bind(&g.period)
        .fetch_optional(&s.db)
        .await?;
        if exists.is_some() {
            result.skipped.push(format!("ห้อง {unit_name}: มีบิลรอบนี้แล้ว"));
            continue;
        }
        let input = MonthlyInput {
            rent,
            electric: meter_pair(&s.db, unit_id, "electric", end).await?,
            electric_rate: e_rate,
            water: meter_pair(&s.db, unit_id, "water", end).await?,
            water_rate: w_rate,
        };
        let mut items = match billing::monthly_items(&input) {
            Ok(items) => items,
            Err(msg) => {
                result.skipped.push(format!("ห้อง {unit_name}: {msg}"));
                continue;
            }
        };
        items.extend(
            extras
                .0
                .iter()
                .map(|c| LineItem::new(&c.label, 1.0, c.amount).vatable(c.vatable)),
        );
        let id = insert_invoice(
            &s.db,
            NewInvoice {
                org_id: ctx.org_id,
                unit_id,
                booking_id: Some(booking_id),
                kind: "monthly",
                period: &g.period,
                due_date: due,
                items,
            },
        )
        .await?;
        result.created.push(id);
    }
    for id in result.created.clone() {
        crate::line::spawn_auto(
            &s,
            ctx.org_id,
            |o| o.auto_invoice,
            move |st, org| async move {
                crate::line::send_invoice(&st, &org, id, "invoice", None).await
            },
        );
    }
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct ItemInput {
    label: String,
    qty: f64,
    unit_price: f64,
    #[serde(default)]
    vatable: bool,
}

#[derive(Deserialize)]
pub struct ManualInput {
    unit_id: i64,
    due_date: NaiveDate,
    period: Option<String>,
    items: Vec<ItemInput>,
}

/// ใบแจ้งหนี้ที่สร้างเอง เช่น ค่าซ่อม ค่าบริการพิเศษ
pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(m): Json<ManualInput>,
) -> AppResult<Json<Invoice>> {
    ensure_unit(&s.db, ctx.org_id, m.unit_id).await?;
    if m.items.is_empty() {
        return Err(AppError::BadRequest("ต้องมีอย่างน้อย 1 รายการ".into()));
    }
    let mut items = Vec::with_capacity(m.items.len());
    for i in m.items {
        if i.label.trim().is_empty() || i.qty <= 0.0 || i.unit_price < 0.0 {
            return Err(AppError::BadRequest(
                "รายการต้องมีชื่อ จำนวนมากกว่า 0 และราคาไม่ติดลบ".into(),
            ));
        }
        items.push(LineItem::new(i.label.trim(), i.qty, i.unit_price).vatable(i.vatable));
    }
    let booking_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM bookings WHERE unit_id = ? AND status IN ('active','reserved') ORDER BY start_date DESC LIMIT 1",
    )
    .bind(m.unit_id)
    .fetch_optional(&s.db)
    .await?;
    let period = match m.period {
        Some(p) => {
            period_bounds(&p)?;
            p
        }
        None => Local::now().format("%Y-%m").to_string(),
    };
    let id = insert_invoice(
        &s.db,
        NewInvoice {
            org_id: ctx.org_id,
            unit_id: m.unit_id,
            booking_id,
            kind: "manual",
            period: &period,
            due_date: m.due_date,
            items,
        },
    )
    .await?;
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

#[derive(Deserialize)]
pub struct VoidInput {
    pub reason: String,
}

/// ยกเลิกใบแจ้งหนี้ (เก็บเอกสารไว้พร้อมเหตุผล ไม่ลบ)
pub async fn void(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(v): Json<VoidInput>,
) -> AppResult<Json<Invoice>> {
    ctx.require_admin()?;
    let invoice = fetch(&s.db, ctx.org_id, id).await?;
    if v.reason.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุเหตุผลการยกเลิก".into()));
    }
    if invoice.status == "void" {
        return Err(AppError::Conflict("ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว".into()));
    }
    if invoice.paid_amount > 0.0 {
        return Err(AppError::Conflict(
            "มีการรับชำระแล้ว — ยกเลิกใบเสร็จที่เกี่ยวข้องก่อน".into(),
        ));
    }
    sqlx::query("UPDATE invoices SET status = 'void', void_reason = ? WHERE id = ?")
        .bind(v.reason.trim())
        .bind(id)
        .execute(&s.db)
        .await?;
    crate::audit::record(
        &s.db,
        &ctx,
        "invoice.void",
        "invoice",
        Some(id),
        Some(serde_json::json!({ "reason": v.reason })),
    )
    .await;
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

#[derive(Deserialize)]
pub struct PayInput {
    pub amount: Option<f64>,
    pub method: Option<String>,
    pub paid_at: Option<NaiveDate>,
    #[serde(default)]
    pub include_late_fee: bool,
    #[serde(default)]
    pub wht_amount: f64,
    #[serde(default)]
    pub note: String,
}

/// รับชำระและออกใบเสร็จ (ใช้ร่วมกับการหักเงินประกันตอนย้ายออก)
pub(crate) async fn pay_invoice(
    db: &SqlitePool,
    org_id: i64,
    id: i64,
    p: PayInput,
) -> AppResult<(Invoice, Receipt)> {
    let invoice = fetch(db, org_id, id).await?;
    if invoice.status != "unpaid" {
        return Err(AppError::Conflict("บิลนี้ไม่อยู่ในสถานะรอชำระ".into()));
    }
    let method = p.method.as_deref().unwrap_or("promptpay");
    super::validate_in(
        "method",
        method,
        &["promptpay", "transfer", "cash", "deposit"],
    )?;
    let remaining = invoice.remaining();
    let amount = billing::round2(p.amount.unwrap_or(remaining));
    if amount <= 0.0 || amount > remaining + 0.005 {
        return Err(AppError::BadRequest(format!(
            "ยอดชำระต้องมากกว่า 0 และไม่เกินยอดคงค้าง {remaining:.2}"
        )));
    }
    let partial = amount < remaining - 0.005 || invoice.paid_amount > 0.0;
    if partial && invoice.vat_amount > 0.0 {
        return Err(AppError::BadRequest(
            "บิลที่มีภาษีมูลค่าเพิ่มต้องชำระเต็มจำนวนในครั้งเดียว".into(),
        ));
    }
    let late_fee = if p.include_late_fee {
        invoice.late_fee
    } else {
        0.0
    };
    let paid_at = p.paid_at.unwrap_or_else(|| Local::now().date_naive());
    let doc_ref = invoice
        .doc_no
        .clone()
        .unwrap_or_else(|| format!("#{}", invoice.id));

    let mut items = if partial {
        vec![LineItem::new(
            format!("ชำระบางส่วนตามใบแจ้งหนี้ {doc_ref} รอบ {}", invoice.period),
            1.0,
            amount,
        )]
    } else {
        invoice.items.clone()
    };
    if late_fee > 0.0 {
        items.push(LineItem::new(
            format!("ค่าปรับชำระล่าช้า ({} วัน)", invoice.overdue_days),
            1.0,
            late_fee,
        ));
    }
    let subtotal = billing::round2(items.iter().map(|i| i.amount).sum());
    let vat_amount = if partial { 0.0 } else { invoice.vat_amount };
    let total = billing::round2(subtotal + vat_amount);
    if p.wht_amount < 0.0 || p.wht_amount > total {
        return Err(AppError::BadRequest("ภาษีหัก ณ ที่จ่ายไม่ถูกต้อง".into()));
    }

    let issuer = docs::load_issuer(db, org_id).await?;
    let payer = match invoice.tenant_id {
        Some(tid) => sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT full_name, address, tax_id, branch_code FROM tenants WHERE id = ?",
        )
        .bind(tid)
        .fetch_optional(db)
        .await?
        .map(|(name, address, tax_id, branch_code)| Payer {
            name,
            address,
            tax_id,
            branch_code,
        }),
        None => None,
    }
    .unwrap_or_else(|| Payer {
        name: format!("ผู้เช่าห้อง {}", invoice.unit_name),
        ..Default::default()
    });

    let mut tx = db.begin().await?;
    let payment_id: i64 = sqlx::query_scalar(
        "INSERT INTO payments (invoice_id, amount, method, paid_at, note, wht_amount, late_fee)
         VALUES (?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(id)
    .bind(amount)
    .bind(method)
    .bind(paid_at.to_string())
    .bind(&p.note)
    .bind(p.wht_amount)
    .bind(late_fee)
    .fetch_one(&mut *tx)
    .await?;
    let receipt_id = receipts::insert(
        &mut tx,
        receipts::NewReceipt {
            org_id,
            invoice_id: Some(id),
            tenant_id: invoice.tenant_id,
            payment_id: Some(payment_id),
            issue_date: paid_at,
            issuer: &issuer,
            payer: &payer,
            unit_name: &invoice.unit_name,
            property_name: &invoice.property_name,
            items: &items,
            subtotal,
            vat_amount,
            total,
            wht_amount: p.wht_amount,
            method,
        },
    )
    .await?;
    if billing::round2(invoice.paid_amount + amount) >= invoice.total - 0.005 {
        sqlx::query("UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?")
            .bind(paid_at.to_string())
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok((
        fetch(db, org_id, id).await?,
        receipts::fetch(db, org_id, receipt_id).await?,
    ))
}

pub async fn pay(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(p): Json<PayInput>,
) -> AppResult<Json<Value>> {
    let (invoice, receipt) = pay_invoice(&s.db, ctx.org_id, id, p).await?;
    let receipt_id = receipt.id;
    crate::line::spawn_auto(
        &s,
        ctx.org_id,
        |o| o.auto_receipt,
        move |st, org| async move { crate::line::send_receipt(&st, &org, receipt_id).await },
    );
    crate::audit::record(
        &s.db,
        &ctx,
        "payment.create",
        "invoice",
        Some(id),
        Some(serde_json::json!({ "receipt": receipt_id })),
    )
    .await;
    Ok(Json(json!({ "invoice": invoice, "receipt": receipt })))
}

#[cfg(test)]
mod tests {
    use super::period_bounds;

    #[test]
    fn period_bounds_handles_year_end() {
        let (s, e) = period_bounds("2025-12").unwrap();
        assert_eq!(s.to_string(), "2025-12-01");
        assert_eq!(e.to_string(), "2025-12-31");
        let (_, feb) = period_bounds("2024-02").unwrap();
        assert_eq!(feb.to_string(), "2024-02-29");
    }
}
