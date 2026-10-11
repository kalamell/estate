//! ศูนย์รวมการเชื่อมต่อบริการภายนอกขององค์กร — สรุปสถานะทุกช่องทางไว้ในที่เดียว

use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{auth::OrgCtx, error::AppResult, AppState};

pub async fn status(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let org = ctx.org_id;
    let line = crate::line::load(&s.db, org).await?;
    let (linked_tenants, linked_staff): (i64, i64) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM tenants WHERE org_id = ?1 AND line_user_id IS NOT NULL),
                (SELECT COUNT(*) FROM org_members WHERE org_id = ?1 AND line_user_id IS NOT NULL)",
    )
    .bind(org)
    .fetch_one(&s.db)
    .await?;
    let auto_on = [
        line.auto_invoice,
        line.auto_receipt,
        line.auto_ticket,
        line.auto_remind,
        line.auto_housekeeping,
        line.auto_parcel,
    ]
    .iter()
    .filter(|v| **v)
    .count();

    let channels: Vec<(String, i64, i64, Option<String>)> = sqlx::query_as(
        "SELECT source, COUNT(*), COALESCE(SUM(last_status = 'error'), 0), MAX(last_synced_at)
         FROM channel_feeds WHERE org_id = ? GROUP BY source ORDER BY source",
    )
    .bind(org)
    .fetch_all(&s.db)
    .await?;
    let (short_units, exported): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(u.ical_token IS NOT NULL), 0) FROM units u
         JOIN properties p ON p.id = u.property_id WHERE p.org_id = ? AND p.kind = 'short_stay'",
    )
    .bind(org)
    .fetch_one(&s.db)
    .await?;
    let booking_pages: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT id, name, booking_slug FROM properties
         WHERE org_id = ? AND booking_enabled = 1 AND booking_slug IS NOT NULL ORDER BY name",
    )
    .bind(org)
    .fetch_all(&s.db)
    .await?;
    let (properties, with_promptpay): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(promptpay_id IS NOT NULL AND promptpay_id != ''), 0)
         FROM properties WHERE org_id = ?",
    )
    .bind(org)
    .fetch_one(&s.db)
    .await?;
    let (slip, slip_auto) = crate::slip::org_provider(&s.db, org).await?;

    Ok(Json(json!({
        "line": {
            "enabled": line.enabled, "ready": line.ready(), "basic_id": line.basic_id,
            "linked_tenants": linked_tenants, "linked_staff": linked_staff, "auto_on": auto_on, "auto_total": 6,
        },
        "channels": channels.into_iter().map(|(source, feeds, errors, last)| json!({
            "source": source, "feeds": feeds, "errors": errors, "last_synced_at": last,
        })).collect::<Vec<_>>(),
        "ical_export": { "short_stay_units": short_units, "exported_units": exported },
        "booking_pages": booking_pages.into_iter().map(|(id, name, slug)| json!({
            "property_id": id, "name": name, "url": format!("{}/stay/{slug}", s.public_url),
        })).collect::<Vec<_>>(),
        "promptpay": { "properties": properties, "configured": with_promptpay },
        "slip": { "provider": slip.kind, "has_key": !slip.api_key.is_empty(), "auto_approve": slip_auto },
        "email": { "platform_smtp": s.mailer.configured() },
        "public_url": s.public_url,
    })))
}
