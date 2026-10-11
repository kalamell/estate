use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{error::AppResult, AppState};

pub async fn summary(State(s): State<AppState>) -> AppResult<Json<Value>> {
    let units_by_status: Vec<(String, i64)> =
        sqlx::query_as("SELECT status, COUNT(*) FROM units GROUP BY status")
            .fetch_all(&s.db)
            .await?;
    let properties: Vec<(i64, String, String, i64, i64)> = sqlx::query_as(
        "SELECT p.id, p.name, p.kind, COUNT(u.id),
                COALESCE(SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END), 0)
         FROM properties p LEFT JOIN units u ON u.property_id = p.id GROUP BY p.id ORDER BY p.id",
    )
    .fetch_all(&s.db)
    .await?;
    let revenue_month: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0.0) FROM payments WHERE strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now')",
    )
    .fetch_one(&s.db)
    .await?;
    let (outstanding, outstanding_count): (f64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(total), 0.0), COUNT(*) FROM invoices WHERE status = 'unpaid'",
    )
    .fetch_one(&s.db)
    .await?;
    let deposits_held: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(deposit_amount), 0.0) FROM bookings
         WHERE deposit_status = 'paid' AND status IN ('reserved','active')",
    )
    .fetch_one(&s.db)
    .await?;
    let upcoming: Vec<(i64, String, String, String, String)> = sqlx::query_as(
        "SELECT b.id, b.start_date, u.name, p.name, t.full_name FROM bookings b
         JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
         JOIN tenants t ON t.id = b.tenant_id
         WHERE b.status = 'reserved' AND b.start_date BETWEEN date('now') AND date('now', '+14 day')
         ORDER BY b.start_date LIMIT 10",
    )
    .fetch_all(&s.db)
    .await?;

    let total_units: i64 = units_by_status.iter().map(|(_, c)| c).sum();
    let occupied: i64 = units_by_status
        .iter()
        .filter(|(s, _)| s == "occupied")
        .map(|(_, c)| c)
        .sum();
    Ok(Json(json!({
        "total_units": total_units,
        "occupancy_rate": if total_units > 0 { occupied as f64 / total_units as f64 } else { 0.0 },
        "units_by_status": units_by_status.into_iter().collect::<std::collections::HashMap<_, _>>(),
        "revenue_month": revenue_month,
        "outstanding": outstanding,
        "outstanding_count": outstanding_count,
        "deposits_held": deposits_held,
        "properties": properties.into_iter().map(|(id, name, kind, units, occupied)| json!({
            "id": id, "name": name, "kind": kind, "units": units, "occupied": occupied
        })).collect::<Vec<_>>(),
        "upcoming_checkins": upcoming.into_iter().map(|(id, date, unit, prop, tenant)| json!({
            "id": id, "start_date": date, "unit_name": unit, "property_name": prop, "tenant_name": tenant
        })).collect::<Vec<_>>(),
    })))
}
