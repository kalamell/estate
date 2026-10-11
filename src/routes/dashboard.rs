use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{auth::OrgCtx, error::AppResult, AppState};

pub async fn summary(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    let units_by_status: Vec<(String, i64)> = sqlx::query_as(
        "SELECT u.status, COUNT(*) FROM units u JOIN properties p ON p.id = u.property_id
             WHERE p.org_id = ? GROUP BY u.status",
    )
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    let properties: Vec<(i64, String, String, i64, i64)> = sqlx::query_as(
        "SELECT p.id, p.name, p.kind, COUNT(u.id),
                COALESCE(SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END), 0)
         FROM properties p LEFT JOIN units u ON u.property_id = p.id WHERE p.org_id = ?
         GROUP BY p.id ORDER BY p.id",
    )
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    let revenue_month: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(pm.amount), 0.0) FROM payments pm JOIN invoices i ON i.id = pm.invoice_id
         JOIN units u ON u.id = i.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ? AND strftime('%Y-%m', pm.paid_at) = strftime('%Y-%m', 'now')",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    let (outstanding, outstanding_count): (f64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(i.total), 0.0), COUNT(*) FROM invoices i JOIN units u ON u.id = i.unit_id
         JOIN properties p ON p.id = u.property_id WHERE p.org_id = ? AND i.status = 'unpaid'",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    let deposits_held: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(b.deposit_amount), 0.0) FROM bookings b JOIN units u ON u.id = b.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ? AND b.deposit_status = 'paid' AND b.status IN ('reserved','active')",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    let upcoming: Vec<(i64, String, String, String, String)> = sqlx::query_as(
        "SELECT b.id, b.start_date, u.name, p.name, t.full_name FROM bookings b
         JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
         JOIN tenants t ON t.id = b.tenant_id
         WHERE p.org_id = ? AND b.status = 'reserved' AND b.start_date BETWEEN date('now') AND date('now', '+14 day')
         ORDER BY b.start_date LIMIT 10",
    )
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;

    let open_tickets: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tickets WHERE org_id = ? AND scope = 'org' AND status IN ('open','in_progress','waiting')",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;
    let (overdue_count, overdue_amount): (i64, f64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(i.total), 0.0) FROM invoices i JOIN units u ON u.id = i.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ? AND i.status = 'unpaid' AND i.due_date < date('now', 'localtime')",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;

    let pending_requests: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM booking_requests WHERE org_id = ? AND status = 'pending' AND expires_at > datetime('now')",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await?;

    let hk: (i64, i64, i64) = sqlx::query_as(
        "SELECT
            (SELECT COUNT(*) FROM units u JOIN properties p ON p.id = u.property_id
             WHERE p.org_id = ?1 AND u.housekeeping_status = 'dirty'),
            (SELECT COUNT(*) FROM units u JOIN properties p ON p.id = u.property_id
             WHERE p.org_id = ?1 AND u.housekeeping_status = 'in_progress'),
            (SELECT COUNT(*) FROM housekeeping_tasks WHERE org_id = ?1 AND status IN ('pending','in_progress'))",
    )
    .bind(ctx.org_id)
    .fetch_one(&s.db)
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
        "open_tickets": open_tickets,
        "overdue_count": overdue_count,
        "overdue_amount": overdue_amount,
        "pending_requests": pending_requests,
        "housekeeping": { "dirty": hk.0, "in_progress": hk.1, "open_tasks": hk.2 },
        "properties": properties.into_iter().map(|(id, name, kind, units, occupied)| json!({
            "id": id, "name": name, "kind": kind, "units": units, "occupied": occupied
        })).collect::<Vec<_>>(),
        "upcoming_checkins": upcoming.into_iter().map(|(id, date, unit, prop, tenant)| json!({
            "id": id, "start_date": date, "unit_name": unit, "property_name": prop, "tenant_name": tenant
        })).collect::<Vec<_>>(),
    })))
}
