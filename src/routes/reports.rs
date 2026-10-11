//! รายงาน: รายรับ ยอดเรียกเก็บ อัตราเข้าพัก อายุหนี้ และส่งออก CSV

use std::collections::{HashMap, HashSet};

use axum::{
    extract::{Query, State},
    http::header,
    response::IntoResponse,
    Json,
};
use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::OrgCtx,
    billing::round2,
    error::{AppError, AppResult},
    AppState,
};

#[derive(Deserialize)]
pub struct SummaryQuery {
    months: Option<u32>,
    property_id: Option<i64>,
}

fn month_start(d: NaiveDate) -> NaiveDate {
    NaiveDate::from_ymd_opt(d.year(), d.month(), 1).expect("valid")
}

fn add_months(d: NaiveDate, n: i32) -> NaiveDate {
    let total = d.year() * 12 + d.month() as i32 - 1 + n;
    NaiveDate::from_ymd_opt(total.div_euclid(12), total.rem_euclid(12) as u32 + 1, 1)
        .expect("valid")
}

pub async fn summary(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<SummaryQuery>,
) -> AppResult<Json<Value>> {
    ctx.require_feature(ctx.features.reports, "รายงาน")?;
    let n = q.months.unwrap_or(12).clamp(1, 36) as i32;
    let today = Local::now().date_naive();
    let first = add_months(month_start(today), -(n - 1));
    let months: Vec<NaiveDate> = (0..n).map(|i| add_months(first, i)).collect();
    let key = |d: &NaiveDate| d.format("%Y-%m").to_string();

    let revenue: HashMap<String, f64> = sqlx::query_as::<_, (String, f64)>(
        "SELECT strftime('%Y-%m', pm.paid_at), SUM(pm.amount + pm.late_fee) FROM payments pm
         JOIN invoices i ON i.id = pm.invoice_id JOIN units u ON u.id = i.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) AND pm.voided = 0 AND pm.paid_at >= ?3
         GROUP BY 1",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .bind(first.to_string())
    .fetch_all(&s.db)
    .await?
    .into_iter()
    .collect();
    let billed: HashMap<String, f64> = sqlx::query_as::<_, (String, f64)>(
        "SELECT i.period, SUM(i.total) FROM invoices i JOIN units u ON u.id = i.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) AND i.status != 'void' AND i.period >= ?3
         GROUP BY 1",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .bind(key(&first))
    .fetch_all(&s.db)
    .await?
    .into_iter()
    .collect();

    // อัตราเข้าพักรายเดือน: ห้องที่มีการเช่าคาบเกี่ยวเดือนนั้น / จำนวนห้องทั้งหมด
    let unit_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM units u JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2)",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .fetch_one(&s.db)
    .await?;
    let stays: Vec<(i64, NaiveDate, Option<NaiveDate>)> = sqlx::query_as(
        "SELECT b.unit_id, b.start_date, b.end_date FROM bookings b JOIN units u ON u.id = b.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) AND b.status IN ('active','completed')",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .fetch_all(&s.db)
    .await?;
    let occupancy: Vec<Value> = months
        .iter()
        .map(|m| {
            let end = add_months(*m, 1) - Duration::days(1);
            let occupied: HashSet<i64> = stays
                .iter()
                .filter(|(_, start, stop)| *start <= end && stop.unwrap_or(NaiveDate::MAX) >= *m)
                .map(|(u, _, _)| *u)
                .collect();
            let rate = if unit_count > 0 {
                occupied.len() as f64 / unit_count as f64
            } else {
                0.0
            };
            json!({ "month": key(m), "rate": (rate * 1000.0).round() / 1000.0 })
        })
        .collect();

    // อายุหนี้ค้างชำระ
    let unpaid: Vec<(f64, i64)> = sqlx::query_as(
        "SELECT i.total - (SELECT COALESCE(SUM(pm.amount), 0) FROM payments pm WHERE pm.invoice_id = i.id AND pm.voided = 0),
                CAST(julianday(date('now', 'localtime')) - julianday(i.due_date) AS INTEGER)
         FROM invoices i JOIN units u ON u.id = i.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) AND i.status = 'unpaid'",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .fetch_all(&s.db)
    .await?;
    let mut aging = [0.0f64; 5];
    for (amount, days) in unpaid {
        let bucket = match days {
            d if d <= 0 => 0,
            1..=30 => 1,
            31..=60 => 2,
            61..=90 => 3,
            _ => 4,
        };
        aging[bucket] += amount;
    }

    let debtors: Vec<(Option<String>, String, String, f64, String)> = sqlx::query_as(
        "SELECT t.full_name, u.name, p.name,
                SUM(i.total - (SELECT COALESCE(SUM(pm.amount), 0) FROM payments pm WHERE pm.invoice_id = i.id AND pm.voided = 0)),
                MIN(i.due_date)
         FROM invoices i JOIN units u ON u.id = i.unit_id JOIN properties p ON p.id = u.property_id
         LEFT JOIN bookings b ON b.id = i.booking_id LEFT JOIN tenants t ON t.id = b.tenant_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) AND i.status = 'unpaid'
         GROUP BY b.tenant_id, u.id ORDER BY 4 DESC LIMIT 10",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .fetch_all(&s.db)
    .await?;

    Ok(Json(json!({
        "revenue": months.iter().map(|m| json!({ "month": key(m), "amount": round2(*revenue.get(&key(m)).unwrap_or(&0.0)) })).collect::<Vec<_>>(),
        "billed": months.iter().map(|m| json!({ "month": key(m), "amount": round2(*billed.get(&key(m)).unwrap_or(&0.0)) })).collect::<Vec<_>>(),
        "occupancy": occupancy,
        "aging": {
            "current": round2(aging[0]), "d1_30": round2(aging[1]), "d31_60": round2(aging[2]),
            "d61_90": round2(aging[3]), "d90_plus": round2(aging[4]),
        },
        "top_debtors": debtors.into_iter().map(|(tenant, unit, property, amount, due)| json!({
            "tenant_name": tenant.unwrap_or_else(|| "-".into()), "unit_name": unit, "property_name": property,
            "amount": round2(amount), "oldest_due": due,
        })).collect::<Vec<_>>(),
    })))
}

#[derive(Deserialize)]
pub struct ExportQuery {
    #[serde(rename = "type")]
    kind: String,
    from: NaiveDate,
    to: NaiveDate,
}

fn csv_cell(v: &str) -> String {
    if v.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", v.replace('"', "\"\""))
    } else {
        v.to_string()
    }
}

/// ส่งออก CSV (UTF-8 พร้อม BOM เพื่อให้ Excel แสดงภาษาไทยถูกต้อง)
pub async fn export(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ExportQuery>,
) -> AppResult<impl IntoResponse> {
    ctx.require_feature(ctx.features.reports, "รายงาน")?;
    let (header_row, sql): (&str, &str) = match q.kind.as_str() {
        "invoices" => (
            "เลขที่,วันที่ออก,ครบกำหนด,รอบบิล,โครงการ,ห้อง,ผู้เช่า,ก่อนภาษี,ภาษีมูลค่าเพิ่ม,รวม,ชำระแล้ว,สถานะ",
            "SELECT COALESCE(i.doc_no, ''), i.issue_date, i.due_date, i.period, p.name, u.name, COALESCE(t.full_name, ''),
                    printf('%.2f', i.subtotal), printf('%.2f', i.vat_amount), printf('%.2f', i.total),
                    printf('%.2f', (SELECT COALESCE(SUM(pm.amount), 0) FROM payments pm WHERE pm.invoice_id = i.id AND pm.voided = 0)),
                    i.status
             FROM invoices i JOIN units u ON u.id = i.unit_id JOIN properties p ON p.id = u.property_id
             LEFT JOIN bookings b ON b.id = i.booking_id LEFT JOIN tenants t ON t.id = b.tenant_id
             WHERE p.org_id = ?1 AND i.issue_date BETWEEN ?2 AND ?3 ORDER BY i.issue_date, i.id",
        ),
        "receipts" => (
            "เลขที่,วันที่,ผู้จ่าย,เลขผู้เสียภาษีผู้จ่าย,ก่อนภาษี,ภาษีมูลค่าเพิ่ม,รวม,หัก ณ ที่จ่าย,รับสุทธิ,วิธีชำระ,ใบกำกับภาษี,อ้างอิงใบแจ้งหนี้,สถานะ",
            "SELECT r.doc_no, r.issue_date, json_extract(r.payer, '$.name'), json_extract(r.payer, '$.tax_id'),
                    printf('%.2f', r.subtotal), printf('%.2f', r.vat_amount), printf('%.2f', r.total),
                    printf('%.2f', r.wht_amount), printf('%.2f', r.net_received), r.method,
                    CASE WHEN r.is_tax_invoice THEN 'Y' ELSE 'N' END, COALESCE(i.doc_no, ''), r.status
             FROM receipts r LEFT JOIN invoices i ON i.id = r.invoice_id
             WHERE r.org_id = ?1 AND r.issue_date BETWEEN ?2 AND ?3 ORDER BY r.issue_date, r.id",
        ),
        "payments" => (
            "วันที่ชำระ,ใบแจ้งหนี้,โครงการ,ห้อง,จำนวนเงิน,ค่าปรับ,หัก ณ ที่จ่าย,วิธีชำระ,หมายเหตุ,ยกเลิก",
            "SELECT substr(pm.paid_at, 1, 10), COALESCE(i.doc_no, ''), p.name, u.name, printf('%.2f', pm.amount),
                    printf('%.2f', pm.late_fee), printf('%.2f', pm.wht_amount), pm.method, pm.note,
                    CASE WHEN pm.voided THEN 'Y' ELSE 'N' END
             FROM payments pm JOIN invoices i ON i.id = pm.invoice_id JOIN units u ON u.id = i.unit_id
             JOIN properties p ON p.id = u.property_id
             WHERE p.org_id = ?1 AND substr(pm.paid_at, 1, 10) BETWEEN ?2 AND ?3 ORDER BY pm.paid_at, pm.id",
        ),
        _ => return Err(AppError::BadRequest("type ต้องเป็น invoices, receipts หรือ payments".into())),
    };
    let rows = sqlx::query(sql)
        .bind(ctx.org_id)
        .bind(q.from.to_string())
        .bind(q.to.to_string())
        .fetch_all(&s.db)
        .await?;
    let mut out = String::from("\u{feff}");
    out += header_row;
    out += "\r\n";
    for row in rows {
        use sqlx::Row;
        let cells: Vec<String> = (0..row.len())
            .map(|i| {
                csv_cell(
                    &row.try_get::<Option<String>, _>(i)
                        .ok()
                        .flatten()
                        .unwrap_or_default(),
                )
            })
            .collect();
        out += &cells.join(",");
        out += "\r\n";
    }
    let filename = format!("estate-{}-{}-{}.csv", q.kind, q.from, q.to);
    Ok((
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        out,
    ))
}
