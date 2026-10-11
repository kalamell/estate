//! ย้ายออก & คืนเงินประกัน: หักค่าเสียหาย หักบิลค้าง ออกใบเสร็จ และเอกสารสรุปการคืนเงิน

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::{bookings::sync_unit_status, invoices, receipts};
use crate::{
    auth::OrgCtx,
    billing::{self, LineItem},
    docs::{self, DocType},
    error::{AppError, AppResult},
    models::Payer,
    AppState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deduction {
    label: String,
    amount: f64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MoveOut {
    id: i64,
    doc_no: Option<String>,
    booking_id: i64,
    tenant_id: i64,
    tenant_name: String,
    unit_name: String,
    property_name: String,
    move_out_date: NaiveDate,
    deposit_amount: f64,
    #[sqlx(json)]
    deductions: Vec<Deduction>,
    include_outstanding: bool,
    note: String,
    status: String,
    refund_method: Option<String>,
    settled_at: Option<String>,
    outstanding_settled: f64,
    created_at: String,
    #[sqlx(default)]
    deductions_total: f64,
    #[sqlx(default)]
    outstanding_total: f64,
    #[sqlx(default)]
    refund_amount: f64,
    /// วันที่ต้องคืนเงินประกันตามกฎหมาย (ภายใน 7 วันนับจากวันย้ายออก)
    #[sqlx(default)]
    refund_due_date: Option<NaiveDate>,
}

const SELECT: &str = "SELECT m.id, m.doc_no, m.booking_id, b.tenant_id, t.full_name AS tenant_name,
        u.name AS unit_name, p.name AS property_name, m.move_out_date, m.deposit_amount, m.deductions,
        m.include_outstanding, m.note, m.status, m.refund_method, m.settled_at, m.outstanding_settled, m.created_at
    FROM move_outs m JOIN bookings b ON b.id = m.booking_id JOIN tenants t ON t.id = b.tenant_id
    JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id";

async fn outstanding(db: &SqlitePool, booking_id: i64) -> AppResult<f64> {
    Ok(sqlx::query_scalar(
        "SELECT COALESCE(SUM(i.total - (SELECT COALESCE(SUM(pm.amount), 0) FROM payments pm
                                         WHERE pm.invoice_id = i.id AND pm.voided = 0)), 0.0)
         FROM invoices i WHERE i.booking_id = ? AND i.status = 'unpaid'",
    )
    .bind(booking_id)
    .fetch_one(db)
    .await?)
}

async fn compute(db: &SqlitePool, mut m: MoveOut) -> AppResult<MoveOut> {
    m.deductions_total = billing::round2(m.deductions.iter().map(|d| d.amount).sum());
    m.outstanding_total = if m.status == "settled" {
        m.outstanding_settled
    } else {
        outstanding(db, m.booking_id).await?
    };
    let applied = if m.include_outstanding {
        m.outstanding_total
    } else {
        0.0
    };
    m.refund_amount = billing::round2(m.deposit_amount - m.deductions_total - applied);
    m.refund_due_date = Some(m.move_out_date + chrono::Duration::days(7));
    Ok(m)
}

async fn fetch(db: &SqlitePool, org_id: i64, id: i64) -> AppResult<MoveOut> {
    let m = sqlx::query_as(&format!("{SELECT} WHERE m.id = ? AND m.org_id = ?"))
        .bind(id)
        .bind(org_id)
        .fetch_one(db)
        .await?;
    compute(db, m).await
}

pub async fn list(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Vec<MoveOut>>> {
    let rows: Vec<MoveOut> =
        sqlx::query_as(&format!("{SELECT} WHERE m.org_id = ? ORDER BY m.id DESC"))
            .bind(ctx.org_id)
            .fetch_all(&s.db)
            .await?;
    let mut out = Vec::with_capacity(rows.len());
    for m in rows {
        out.push(compute(&s.db, m).await?);
    }
    Ok(Json(out))
}

pub async fn get(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    let m = fetch(&s.db, ctx.org_id, id).await?;
    let tenant: (String, String, String, String, String) = sqlx::query_as(
        "SELECT full_name, address, tax_id, branch_code, phone FROM tenants WHERE id = ?",
    )
    .bind(m.tenant_id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({
        "move_out": m,
        "issuer": docs::load_issuer(&s.db, ctx.org_id).await?,
        "tenant": { "full_name": tenant.0, "address": tenant.1, "tax_id": tenant.2, "branch_code": tenant.3, "phone": tenant.4 },
    })))
}

#[derive(Deserialize)]
pub struct MoveOutInput {
    booking_id: i64,
    move_out_date: NaiveDate,
    #[serde(default)]
    deductions: Vec<Deduction>,
    #[serde(default = "yes")]
    include_outstanding: bool,
    #[serde(default)]
    note: String,
}

fn yes() -> bool {
    true
}

fn validate(m: &MoveOutInput) -> AppResult<()> {
    if m.deductions
        .iter()
        .any(|d| d.label.trim().is_empty() || d.amount < 0.0)
    {
        return Err(AppError::BadRequest(
            "รายการหักต้องมีชื่อและจำนวนเงินไม่ติดลบ".into(),
        ));
    }
    Ok(())
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(m): Json<MoveOutInput>,
) -> AppResult<Json<MoveOut>> {
    validate(&m)?;
    let booking: Option<(String, f64, String)> = sqlx::query_as(
        "SELECT b.status, b.deposit_amount, b.deposit_status FROM bookings b JOIN units u ON u.id = b.unit_id
         JOIN properties p ON p.id = u.property_id WHERE b.id = ? AND p.org_id = ?",
    )
    .bind(m.booking_id)
    .bind(ctx.org_id)
    .fetch_optional(&s.db)
    .await?;
    let (status, deposit, deposit_status) = booking.ok_or(AppError::NotFound)?;
    if status != "active" {
        return Err(AppError::Conflict(
            "ทำรายการย้ายออกได้เฉพาะการเช่าที่กำลังเข้าพัก".into(),
        ));
    }
    let held = if deposit_status == "paid" {
        deposit
    } else {
        0.0
    };
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO move_outs (org_id, booking_id, move_out_date, deposit_amount, deductions, include_outstanding, note)
         VALUES (?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(ctx.org_id)
    .bind(m.booking_id)
    .bind(m.move_out_date)
    .bind(held)
    .bind(sqlx::types::Json(&m.deductions))
    .bind(m.include_outstanding)
    .bind(m.note.trim())
    .fetch_one(&s.db)
    .await
    .map_err(|e| match AppError::from(e) {
        AppError::Conflict(_) => AppError::Conflict("การเช่านี้มีรายการย้ายออกอยู่แล้ว".into()),
        other => other,
    })?;
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

pub async fn update(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(m): Json<MoveOutInput>,
) -> AppResult<Json<MoveOut>> {
    validate(&m)?;
    let current = fetch(&s.db, ctx.org_id, id).await?;
    if current.status != "draft" {
        return Err(AppError::Conflict("รายการนี้ปิดยอดแล้ว แก้ไขไม่ได้".into()));
    }
    sqlx::query("UPDATE move_outs SET move_out_date = ?, deductions = ?, include_outstanding = ?, note = ? WHERE id = ?")
        .bind(m.move_out_date)
        .bind(sqlx::types::Json(&m.deductions))
        .bind(m.include_outstanding)
        .bind(m.note.trim())
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

#[derive(Deserialize)]
pub struct SettleInput {
    refund_method: String,
    refunded_at: NaiveDate,
}

/// ปิดยอด: หักบิลค้างจากเงินประกัน (ออกใบเสร็จ), ออกใบเสร็จค่าเสียหาย, สิ้นสุดสัญญา, ออกเลขเอกสาร
pub async fn settle(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(input): Json<SettleInput>,
) -> AppResult<Json<MoveOut>> {
    ctx.require_admin()?;
    super::validate_in("refund_method", &input.refund_method, &["transfer", "cash"])?;
    let m = fetch(&s.db, ctx.org_id, id).await?;
    if m.status != "draft" {
        return Err(AppError::Conflict("รายการนี้ปิดยอดแล้ว".into()));
    }
    let mut available = billing::round2(m.deposit_amount - m.deductions_total);
    let mut applied = 0.0;

    if m.include_outstanding {
        let unpaid: Vec<i64> = sqlx::query_scalar(
            "SELECT id FROM invoices WHERE booking_id = ? AND status = 'unpaid' ORDER BY due_date, id",
        )
        .bind(m.booking_id)
        .fetch_all(&s.db)
        .await?;
        for invoice_id in unpaid {
            let inv = invoices::fetch(&s.db, ctx.org_id, invoice_id).await?;
            let remaining = inv.remaining();
            if remaining <= 0.0 || available + 0.005 < remaining {
                continue;
            }
            invoices::pay_invoice(
                &s.db,
                ctx.org_id,
                invoice_id,
                invoices::PayInput {
                    amount: None,
                    method: Some("deposit".into()),
                    paid_at: Some(input.refunded_at),
                    include_late_fee: false,
                    wht_amount: 0.0,
                    note: format!("หักจากเงินประกันตามรายการย้ายออก #{id}"),
                },
            )
            .await?;
            available = billing::round2(available - remaining);
            applied = billing::round2(applied + remaining);
        }
    }

    let issuer = docs::load_issuer(&s.db, ctx.org_id).await?;
    let payer: (String, String, String, String) =
        sqlx::query_as("SELECT full_name, address, tax_id, branch_code FROM tenants WHERE id = ?")
            .bind(m.tenant_id)
            .fetch_one(&s.db)
            .await?;
    let payer = Payer {
        name: payer.0,
        address: payer.1,
        tax_id: payer.2,
        branch_code: payer.3,
    };

    let mut tx = s.db.begin().await?;
    if m.deductions_total > 0.0 {
        let items: Vec<LineItem> = m
            .deductions
            .iter()
            .map(|d| LineItem::new(&d.label, 1.0, d.amount))
            .collect();
        receipts::insert(
            &mut tx,
            receipts::NewReceipt {
                org_id: ctx.org_id,
                invoice_id: None,
                tenant_id: Some(m.tenant_id),
                payment_id: None,
                issue_date: input.refunded_at,
                issuer: &issuer,
                payer: &payer,
                unit_name: &m.unit_name,
                property_name: &m.property_name,
                items: &items,
                subtotal: m.deductions_total,
                vat_amount: 0.0,
                total: m.deductions_total,
                wht_amount: 0.0,
                method: "deposit",
            },
        )
        .await?;
    }
    let doc_no = docs::next_doc_no(
        &mut tx,
        ctx.org_id,
        DocType::DepositSettlement,
        input.refunded_at,
    )
    .await?;
    sqlx::query(
        "UPDATE move_outs SET status = 'settled', doc_no = ?, refund_method = ?, settled_at = ?, outstanding_settled = ?
         WHERE id = ?",
    )
    .bind(doc_no)
    .bind(&input.refund_method)
    .bind(input.refunded_at.to_string())
    .bind(applied)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    let unit_id: i64 = sqlx::query_scalar(
        "UPDATE bookings SET status = 'completed', end_date = ?, deposit_status = ? WHERE id = ? RETURNING unit_id",
    )
    .bind(m.move_out_date)
    .bind(if available > 0.0 { "refunded" } else { "forfeited" })
    .bind(m.booking_id)
    .fetch_one(&mut *tx)
    .await?;
    sync_unit_status(&mut tx, unit_id).await?;
    tx.commit().await?;
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}
