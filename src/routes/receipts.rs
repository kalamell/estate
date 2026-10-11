//! ใบเสร็จรับเงิน / ใบกำกับภาษี — เก็บสำเนาข้อมูลผู้ออกและผู้จ่าย ณ วันออก แก้ไขไม่ได้ ยกเลิกได้พร้อมเหตุผล

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{SqliteConnection, SqlitePool};

use super::invoices::VoidInput;
use crate::{
    auth::OrgCtx,
    billing::{self, LineItem},
    docs::{self, DocType},
    error::{AppError, AppResult},
    models::{Issuer, Payer, Receipt},
    thai::baht_text,
    AppState,
};

const SELECT: &str = "SELECT r.id, r.doc_no, r.is_tax_invoice, r.invoice_id, i.doc_no AS invoice_doc_no, r.tenant_id,
        r.issue_date, r.issuer, r.payer, r.unit_name, r.property_name, r.items, r.subtotal, r.vat_amount, r.total,
        r.wht_amount, r.net_received, r.method, r.status, r.void_reason, r.created_at
    FROM receipts r LEFT JOIN invoices i ON i.id = r.invoice_id";

fn finish(mut r: Receipt) -> Receipt {
    r.amount_text = baht_text(r.total);
    r
}

pub(crate) struct NewReceipt<'a> {
    pub org_id: i64,
    pub invoice_id: Option<i64>,
    pub tenant_id: Option<i64>,
    pub payment_id: Option<i64>,
    pub issue_date: NaiveDate,
    pub issuer: &'a Issuer,
    pub payer: &'a Payer,
    pub unit_name: &'a str,
    pub property_name: &'a str,
    pub items: &'a [LineItem],
    pub subtotal: f64,
    pub vat_amount: f64,
    pub total: f64,
    pub wht_amount: f64,
    pub method: &'a str,
}

/// ต้องอยู่ใน transaction เดียวกับการบันทึกการชำระเงิน
pub(crate) async fn insert(conn: &mut SqliteConnection, r: NewReceipt<'_>) -> AppResult<i64> {
    let doc_no = docs::next_doc_no(conn, r.org_id, DocType::Receipt, r.issue_date).await?;
    let is_tax_invoice = r.issuer.vat_registered && r.vat_amount > 0.0;
    Ok(sqlx::query_scalar(
        "INSERT INTO receipts (org_id, doc_no, is_tax_invoice, invoice_id, tenant_id, payment_id, issue_date, issuer,
            payer, unit_name, property_name, items, subtotal, vat_amount, total, wht_amount, net_received, method)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(r.org_id)
    .bind(doc_no)
    .bind(is_tax_invoice)
    .bind(r.invoice_id)
    .bind(r.tenant_id)
    .bind(r.payment_id)
    .bind(r.issue_date)
    .bind(sqlx::types::Json(r.issuer))
    .bind(sqlx::types::Json(r.payer))
    .bind(r.unit_name)
    .bind(r.property_name)
    .bind(sqlx::types::Json(r.items))
    .bind(r.subtotal)
    .bind(r.vat_amount)
    .bind(r.total)
    .bind(r.wht_amount)
    .bind(billing::round2(r.total - r.wht_amount))
    .bind(r.method)
    .fetch_one(conn)
    .await?)
}

pub(crate) async fn fetch(db: &SqlitePool, org_id: i64, id: i64) -> AppResult<Receipt> {
    let r = sqlx::query_as(&format!("{SELECT} WHERE r.id = ? AND r.org_id = ?"))
        .bind(id)
        .bind(org_id)
        .fetch_one(db)
        .await?;
    Ok(finish(r))
}

pub(crate) async fn for_invoice(db: &SqlitePool, invoice_id: i64) -> AppResult<Vec<Receipt>> {
    let rows: Vec<Receipt> =
        sqlx::query_as(&format!("{SELECT} WHERE r.invoice_id = ? ORDER BY r.id"))
            .bind(invoice_id)
            .fetch_all(db)
            .await?;
    Ok(rows.into_iter().map(finish).collect())
}

pub(crate) async fn for_tenant(db: &SqlitePool, tenant_id: i64) -> AppResult<Vec<Receipt>> {
    let rows: Vec<Receipt> = sqlx::query_as(&format!(
        "{SELECT} WHERE r.tenant_id = ? ORDER BY r.issue_date DESC, r.id DESC"
    ))
    .bind(tenant_id)
    .fetch_all(db)
    .await?;
    Ok(rows.into_iter().map(finish).collect())
}

#[derive(Deserialize)]
pub struct Filter {
    property_id: Option<i64>,
    period: Option<String>,
    status: Option<String>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(f): Query<Filter>,
) -> AppResult<Json<Vec<Receipt>>> {
    let rows: Vec<Receipt> = sqlx::query_as(&format!(
        "{SELECT} LEFT JOIN units u ON u.id = i.unit_id
         WHERE r.org_id = ?1 AND (?2 IS NULL OR u.property_id = ?2)
           AND (?3 IS NULL OR strftime('%Y-%m', r.issue_date) = ?3) AND (?4 IS NULL OR r.status = ?4)
         ORDER BY r.issue_date DESC, r.id DESC"
    ))
    .bind(ctx.org_id)
    .bind(f.property_id)
    .bind(f.period)
    .bind(f.status)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows.into_iter().map(finish).collect()))
}

pub async fn get(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        json!({ "receipt": fetch(&s.db, ctx.org_id, id).await? }),
    ))
}

/// ยกเลิกใบเสร็จ: การชำระเงินที่ผูกอยู่ถือเป็นโมฆะ และใบแจ้งหนี้กลับเป็นรอชำระ
pub async fn void(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(v): Json<VoidInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    if v.reason.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุเหตุผลการยกเลิก".into()));
    }
    let (status, invoice_id, payment_id): (String, Option<i64>, Option<i64>) = sqlx::query_as(
        "SELECT status, invoice_id, payment_id FROM receipts WHERE id = ? AND org_id = ?",
    )
    .bind(id)
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    if status == "void" {
        return Err(AppError::Conflict("ใบเสร็จนี้ถูกยกเลิกแล้ว".into()));
    }
    let mut tx = s.db.begin().await?;
    sqlx::query("UPDATE receipts SET status = 'void', void_reason = ? WHERE id = ?")
        .bind(v.reason.trim())
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if let Some(pid) = payment_id {
        sqlx::query("UPDATE payments SET voided = 1 WHERE id = ?")
            .bind(pid)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(iid) = invoice_id {
        sqlx::query(
            "UPDATE invoices SET status = 'unpaid', paid_at = NULL
             WHERE id = ? AND status = 'paid'
               AND (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = ? AND voided = 0) < total - 0.005",
        )
        .bind(iid)
        .bind(iid)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    crate::audit::record(
        &s.db,
        &ctx,
        "receipt.void",
        "receipt",
        Some(id),
        Some(serde_json::json!({ "reason": v.reason })),
    )
    .await;
    Ok(Json(
        json!({ "receipt": fetch(&s.db, ctx.org_id, id).await? }),
    ))
}
