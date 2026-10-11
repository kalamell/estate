use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::{
    billing::{self, MeterPair, MonthlyInput},
    error::{AppError, AppResult},
    models::Invoice,
    promptpay, AppState,
};

const SELECT: &str =
    "SELECT i.*, u.name AS unit_name, p.id AS property_id, p.name AS property_name,
        t.full_name AS tenant_name
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
    Query(f): Query<Filter>,
) -> AppResult<Json<Vec<Invoice>>> {
    let sql = format!(
        "{SELECT} WHERE (?1 IS NULL OR p.id = ?1) AND (?2 IS NULL OR i.status = ?2) AND (?3 IS NULL OR i.period = ?3)
         ORDER BY i.period DESC, p.name, u.name"
    );
    let rows = sqlx::query_as(&sql)
        .bind(f.property_id)
        .bind(f.status)
        .bind(f.period)
        .fetch_all(&s.db)
        .await?;
    Ok(Json(rows))
}

async fn fetch(db: &SqlitePool, id: i64) -> AppResult<Invoice> {
    Ok(sqlx::query_as(&format!("{SELECT} WHERE i.id = ?"))
        .bind(id)
        .fetch_one(db)
        .await?)
}

/// ใบแจ้งหนี้พร้อม PromptPay QR payload (ถ้าโครงการตั้งค่าไว้)
pub async fn get(State(s): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<Value>> {
    let invoice = fetch(&s.db, id).await?;
    let pp_id: Option<String> =
        sqlx::query_scalar("SELECT promptpay_id FROM properties WHERE id = ?")
            .bind(invoice.property_id)
            .fetch_one(&s.db)
            .await?;
    let payload = pp_id.and_then(|t| promptpay::payload(&t, Some(invoice.total)));
    let paid: f64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(amount), 0.0) FROM payments WHERE invoice_id = ?")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    Ok(Json(
        json!({ "invoice": invoice, "promptpay_payload": payload, "paid_amount": paid }),
    ))
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
    Json(g): Json<GenerateInput>,
) -> AppResult<Json<GenerateResult>> {
    let (start, end) = period_bounds(&g.period)?;
    let (e_rate, w_rate): (f64, f64) =
        sqlx::query_as("SELECT electric_rate, water_rate FROM properties WHERE id = ?")
            .bind(g.property_id)
            .fetch_one(&s.db)
            .await?;

    let leases: Vec<(i64, i64, String, f64)> = sqlx::query_as(
        "SELECT b.id, u.id, u.name, b.price FROM bookings b JOIN units u ON u.id = b.unit_id
         WHERE u.property_id = ? AND b.kind = 'lease' AND b.status = 'active'
           AND b.start_date <= ? AND COALESCE(b.end_date, '9999-12-31') >= ?
         ORDER BY u.floor, u.name",
    )
    .bind(g.property_id)
    .bind(end)
    .bind(start)
    .fetch_all(&s.db)
    .await?;

    let today = Local::now().date_naive();
    let mut result = GenerateResult {
        created: vec![],
        skipped: vec![],
    };
    for (booking_id, unit_id, unit_name, rent) in leases {
        let exists: Option<i64> =
            sqlx::query_scalar("SELECT id FROM invoices WHERE unit_id = ? AND period = ?")
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
        let items = match billing::monthly_items(&input) {
            Ok(items) => items,
            Err(msg) => {
                result.skipped.push(format!("ห้อง {unit_name}: {msg}"));
                continue;
            }
        };
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO invoices (unit_id, booking_id, period, issue_date, due_date, items, total)
             VALUES (?,?,?,?,?,?,?) RETURNING id",
        )
        .bind(unit_id)
        .bind(booking_id)
        .bind(&g.period)
        .bind(today)
        .bind(today + Duration::days(g.due_days))
        .bind(sqlx::types::Json(&items))
        .bind(billing::total(&items))
        .fetch_one(&s.db)
        .await?;
        result.created.push(id);
    }
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct PayInput {
    amount: Option<f64>,
    method: Option<String>,
    #[serde(default)]
    note: String,
}

pub async fn pay(
    State(s): State<AppState>,
    Path(id): Path<i64>,
    Json(p): Json<PayInput>,
) -> AppResult<Json<Invoice>> {
    let invoice = fetch(&s.db, id).await?;
    if invoice.status != "unpaid" {
        return Err(AppError::Conflict("บิลนี้ไม่อยู่ในสถานะรอชำระ".into()));
    }
    let paid: f64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(amount), 0.0) FROM payments WHERE invoice_id = ?")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    let amount = p.amount.unwrap_or(invoice.total - paid);
    if amount <= 0.0 {
        return Err(AppError::BadRequest("ยอดชำระต้องมากกว่า 0".into()));
    }
    let mut tx = s.db.begin().await?;
    sqlx::query("INSERT INTO payments (invoice_id, amount, method, note) VALUES (?,?,?,?)")
        .bind(id)
        .bind(amount)
        .bind(p.method.as_deref().unwrap_or("promptpay"))
        .bind(&p.note)
        .execute(&mut *tx)
        .await?;
    if billing::round2(paid + amount) >= invoice.total {
        sqlx::query("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(fetch(&s.db, id).await?))
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
