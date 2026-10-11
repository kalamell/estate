mod admin;
mod auth;
mod bookings;
mod calendar;
mod contracts;
mod dashboard;
mod files;
mod housekeeping;
mod imports;
mod invoices;
mod line;
mod meters;
mod move_outs;
mod org;
mod parcels;
mod portal;
mod pricing;
mod privacy;
mod properties;
mod receipts;
mod reports;
mod slips;
mod stay;
mod subscription;
mod tenants;
mod tickets;
mod tm30;
mod units;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};

use crate::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/me", get(auth::me))
        .route("/api/admin/emails", get(admin::emails))
        .route("/api/admin/emails/test", post(admin::test_email))
        .route("/api/auth/forgot", post(auth::forgot))
        .route("/api/auth/reset", post(auth::reset))
        .route("/api/auth/verify", post(auth::verify_email))
        .route("/api/auth/verify/resend", post(auth::resend_verification))
        .route("/api/auth/password", post(auth::change_password))
        .route("/api/orgs", post(auth::create_org))
        .route("/api/org", get(org::get).put(org::update))
        .route("/api/org/members", get(org::members).post(org::add_member))
        .route(
            "/api/org/members/:user_id",
            axum::routing::put(org::update_member).delete(org::remove_member),
        )
        .route("/api/org/line", axum::routing::put(line::update_settings))
        .route("/api/org/line/test", post(line::test_connection))
        .route("/api/line/messages", get(line::messages))
        .route("/api/line/webhook/:key", post(line::webhook))
        .route("/api/tenants/:id/line-link", post(line::tenant_link_code))
        .route(
            "/api/tenants/:id/line",
            axum::routing::delete(line::tenant_unlink),
        )
        .route(
            "/api/tenants/:id/line/send-portal",
            post(line::tenant_send_portal),
        )
        .route("/api/invoices/send-line", post(line::send_invoices))
        .route("/api/invoices/:id/send-line", post(line::send_invoice))
        .route("/api/receipts/:id/send-line", post(line::send_receipt))
        .route("/api/portal/:token/line-link", post(portal::line_link))
        .route("/api/calendar", get(calendar::calendar))
        .route("/api/channels", get(calendar::list_channels))
        .route(
            "/api/channels/:id",
            axum::routing::delete(calendar::delete_channel),
        )
        .route("/api/channels/:id/sync", post(calendar::sync_channel))
        .route(
            "/api/units/:id/channels",
            get(calendar::unit_channels).post(calendar::add_channel),
        )
        .route(
            "/api/units/:id/channels/regenerate-export",
            post(calendar::regenerate_export),
        )
        .route("/ical/:file", get(calendar::export))
        .route("/api/public/stay/:slug", get(stay::stay))
        .route(
            "/api/public/stay/:slug/availability",
            get(stay::availability),
        )
        .route(
            "/api/public/stay/:slug/requests",
            post(stay::create_request),
        )
        .route("/api/public/requests/:token", get(stay::request_status))
        .route(
            "/api/public/requests/:token/slip",
            post(stay::upload_slip).layer(DefaultBodyLimit::max(15 * 1024 * 1024)),
        )
        .route("/api/booking-requests", get(stay::list_requests))
        .route("/api/booking-requests/:id/approve", post(stay::approve))
        .route("/api/booking-requests/:id/reject", post(stay::reject))
        .route(
            "/api/housekeeping/tasks",
            get(housekeeping::list).post(housekeeping::create),
        )
        .route(
            "/api/housekeeping/tasks/:id",
            axum::routing::patch(housekeeping::patch).delete(housekeeping::delete),
        )
        .route(
            "/api/housekeeping/tasks/:id/photos",
            post(housekeeping::add_photos).layer(DefaultBodyLimit::max(40 * 1024 * 1024)),
        )
        .route("/api/housekeeping/today", get(housekeeping::today))
        .route(
            "/api/units/:id/housekeeping",
            axum::routing::patch(housekeeping::set_unit),
        )
        .route(
            "/api/org/line/staff-link",
            post(housekeeping::staff_link).delete(housekeeping::staff_unlink),
        )
        .route("/api/rate-rules", get(pricing::list).post(pricing::create))
        .route(
            "/api/rate-rules/:id",
            axum::routing::put(pricing::update).delete(pricing::delete),
        )
        .route("/api/units/:id/quote", get(pricing::unit_quote))
        .route("/api/units/:id/prices", get(pricing::unit_prices))
        .route("/api/public/stay/:slug/quote", get(stay::quote))
        .route("/api/public/stay/:slug/prices", get(stay::prices))
        .route("/uploads/:name", get(files::serve))
        .route("/api/tenants/:id/export", get(privacy::export_tenant))
        .route(
            "/api/tenants/:id/anonymize",
            post(privacy::anonymize_tenant),
        )
        .route("/api/privacy-requests", get(privacy::list_requests))
        .route(
            "/api/privacy-requests/:id",
            axum::routing::patch(privacy::update_request),
        )
        .route("/api/privacy/retention", get(privacy::retention))
        .route("/api/audit-logs", get(audit_logs))
        .route(
            "/api/org/slip",
            get(slips::settings).put(slips::update_settings),
        )
        .route(
            "/api/parcels",
            get(parcels::list)
                .post(parcels::create)
                .layer(DefaultBodyLimit::max(15 * 1024 * 1024)),
        )
        .route("/api/parcels/:id", axum::routing::delete(parcels::delete))
        .route("/api/parcels/:id/notify", post(parcels::resend))
        .route(
            "/api/parcels/:id/pickup",
            post(parcels::pickup).layer(DefaultBodyLimit::max(15 * 1024 * 1024)),
        )
        .route("/api/parcels/:id/return", post(parcels::mark_returned))
        .route(
            "/api/contract-templates",
            get(contracts::templates).post(contracts::create_template),
        )
        .route(
            "/api/contract-templates/:id",
            axum::routing::put(contracts::update_template).delete(contracts::delete_template),
        )
        .route(
            "/api/contracts",
            get(contracts::list).post(contracts::create),
        )
        .route(
            "/api/contracts/:id",
            get(contracts::get).put(contracts::update),
        )
        .route("/api/contracts/:id/send", post(contracts::send))
        .route(
            "/api/contracts/:id/landlord-sign",
            post(contracts::landlord_sign).layer(DefaultBodyLimit::max(5 * 1024 * 1024)),
        )
        .route("/api/contracts/:id/void", post(contracts::void))
        .route(
            "/api/portal/:token/contracts/:id",
            get(contracts::portal_get),
        )
        .route(
            "/api/portal/:token/contracts/:id/sign",
            post(contracts::portal_sign).layer(DefaultBodyLimit::max(5 * 1024 * 1024)),
        )
        .route(
            "/api/imports",
            post(imports::upload).layer(DefaultBodyLimit::max(10 * 1024 * 1024)),
        )
        .route("/api/imports/template.csv", get(imports::template))
        .route("/api/imports/:id/inspect", post(imports::inspect))
        .route("/api/imports/:id/preview", post(imports::preview))
        .route("/api/imports/:id/commit", post(imports::commit))
        .route("/api/import-mappings", get(imports::mappings))
        .route(
            "/api/import-mappings/:id",
            axum::routing::delete(imports::delete_mapping),
        )
        .route("/api/tm30", get(tm30::list))
        .route("/api/tm30/export.csv", get(tm30::export))
        .route(
            "/api/tm30/:id/submit",
            post(tm30::submit).layer(DefaultBodyLimit::max(15 * 1024 * 1024)),
        )
        .route("/api/tm30/:id/skip", post(tm30::skip))
        .route("/api/tm30/:id/reopen", post(tm30::reopen))
        .route("/api/payment-notices", get(slips::list))
        .route("/api/payment-notices/:id/approve", post(slips::approve))
        .route("/api/payment-notices/:id/reject", post(slips::reject))
        .route(
            "/api/portal/:token/invoices/:id/slip",
            post(slips::portal_submit).layer(DefaultBodyLimit::max(15 * 1024 * 1024)),
        )
        .route("/api/billing", get(subscription::overview))
        .route("/api/billing/checkout", post(subscription::checkout))
        .route("/api/billing/invoices/:id", get(subscription::invoice))
        .route(
            "/api/billing/invoices/:id/slip",
            post(subscription::upload_slip).layer(DefaultBodyLimit::max(15 * 1024 * 1024)),
        )
        .route(
            "/api/billing/invoices/:id/cancel",
            post(subscription::cancel),
        )
        .route("/api/admin/billing", get(subscription::admin_overview))
        .route(
            "/api/admin/billing/settings",
            axum::routing::put(subscription::update_settings),
        )
        .route(
            "/api/admin/billing/slip",
            axum::routing::put(subscription::update_slip_settings),
        )
        .route(
            "/api/admin/billing/invoices",
            post(subscription::admin_issue),
        )
        .route(
            "/api/admin/billing/invoices/:id",
            get(subscription::admin_invoice),
        )
        .route(
            "/api/admin/billing/invoices/:id/approve",
            post(subscription::approve),
        )
        .route(
            "/api/admin/billing/invoices/:id/reject",
            post(subscription::reject),
        )
        .route(
            "/api/admin/billing/invoices/:id/void",
            post(subscription::void),
        )
        .route("/api/portal/:token/consent", post(portal::consent))
        .route("/api/portal/:token/lang", post(portal::set_lang))
        .route(
            "/api/portal/:token/privacy-requests",
            post(portal::privacy_request),
        )
        .route("/api/portal/:token/export", get(portal::export))
        .route("/api/admin/stats", get(admin::stats))
        .route(
            "/api/admin/packages",
            get(admin::packages).post(admin::create_package),
        )
        .route(
            "/api/admin/packages/:id",
            axum::routing::put(admin::update_package).delete(admin::delete_package),
        )
        .route("/api/admin/orgs", get(admin::orgs))
        .route("/api/admin/orgs/:id", axum::routing::put(admin::update_org))
        .route("/api/admin/users", get(admin::users))
        .route(
            "/api/admin/users/:id",
            axum::routing::put(admin::update_user),
        )
        .route("/api/health", get(health))
        .route("/api/dashboard", get(dashboard::summary))
        .route(
            "/api/properties",
            get(properties::list).post(properties::create),
        )
        .route(
            "/api/properties/:id",
            get(properties::get)
                .put(properties::update)
                .delete(properties::delete),
        )
        .route("/api/units", get(units::list).post(units::create))
        .route(
            "/api/units/:id",
            get(units::get).put(units::update).delete(units::delete),
        )
        .route("/api/tenants", get(tenants::list).post(tenants::create))
        .route(
            "/api/tenants/:id",
            axum::routing::put(tenants::update).delete(tenants::delete),
        )
        .route(
            "/api/tenants/:id/portal-token",
            post(tenants::regenerate_portal),
        )
        .route("/api/bookings", get(bookings::list).post(bookings::create))
        .route("/api/bookings/:id", axum::routing::patch(bookings::patch))
        .route(
            "/api/meter-readings",
            get(meters::list)
                .post(meters::create)
                .layer(DefaultBodyLimit::max(15 * 1024 * 1024)),
        )
        .route(
            "/api/meter-readings/:id",
            axum::routing::delete(meters::delete),
        )
        .route("/api/invoices", get(invoices::list).post(invoices::create))
        .route("/api/invoices/:id/void", post(invoices::void))
        .route("/api/receipts", get(receipts::list))
        .route("/api/receipts/:id", get(receipts::get))
        .route("/api/receipts/:id/void", post(receipts::void))
        .route(
            "/api/move-outs",
            get(move_outs::list).post(move_outs::create),
        )
        .route(
            "/api/move-outs/:id",
            get(move_outs::get).put(move_outs::update),
        )
        .route("/api/move-outs/:id/settle", post(move_outs::settle))
        .route("/api/reports/summary", get(reports::summary))
        .route("/api/reports/export", get(reports::export))
        .route(
            "/api/announcements",
            get(tickets::announcements).post(tickets::create_announcement),
        )
        .route(
            "/api/announcements/:id",
            axum::routing::delete(tickets::delete_announcement),
        )
        .route(
            "/api/tickets",
            get(tickets::list)
                .post(tickets::create)
                .layer(DefaultBodyLimit::max(40 * 1024 * 1024)),
        )
        .route("/api/tickets/:id", get(tickets::get).patch(tickets::patch))
        .route(
            "/api/tickets/:id/messages",
            post(tickets::message).layer(DefaultBodyLimit::max(40 * 1024 * 1024)),
        )
        .route(
            "/api/support",
            get(tickets::support_list)
                .post(tickets::support_create)
                .layer(DefaultBodyLimit::max(40 * 1024 * 1024)),
        )
        .route("/api/support/:id", get(tickets::support_get))
        .route(
            "/api/support/:id/messages",
            post(tickets::support_message).layer(DefaultBodyLimit::max(40 * 1024 * 1024)),
        )
        .route("/api/admin/support", get(tickets::admin_list))
        .route(
            "/api/admin/support/:id",
            get(tickets::admin_get).patch(tickets::admin_patch),
        )
        .route(
            "/api/admin/support/:id/messages",
            post(tickets::admin_message).layer(DefaultBodyLimit::max(40 * 1024 * 1024)),
        )
        .route("/api/portal/:token", get(portal::home))
        .route("/api/portal/:token/invoices/:id", get(portal::invoice))
        .route("/api/portal/:token/receipts/:id", get(portal::receipt))
        .route(
            "/api/portal/:token/tickets",
            get(portal::ticket_list)
                .post(portal::ticket_create)
                .layer(DefaultBodyLimit::max(40 * 1024 * 1024)),
        )
        .route("/api/portal/:token/tickets/:id", get(portal::ticket_get))
        .route(
            "/api/portal/:token/tickets/:id/messages",
            post(portal::ticket_message).layer(DefaultBodyLimit::max(40 * 1024 * 1024)),
        )
        .route("/api/invoices/generate", post(invoices::generate))
        .route("/api/invoices/:id", get(invoices::get))
        .route("/api/invoices/:id/pay", post(invoices::pay))
}

pub(crate) fn validate_in(
    field: &str,
    value: &str,
    allowed: &[&str],
) -> crate::error::AppResult<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(crate::error::AppError::BadRequest(format!(
            "{field} ต้องเป็นหนึ่งใน: {}",
            allowed.join(", ")
        )))
    }
}

pub fn spawn_background(state: crate::AppState) {
    calendar::spawn_sync(state.clone());
    subscription::spawn_renewals(state.clone());
    tm30::spawn_alerts(state.clone());
    housekeeping::spawn_auto_tasks(state);
}

/// ออกใบแจ้งหนี้ต่ออายุแพ็กเกจ (เปิดให้ test เรียกได้)
pub async fn run_subscription_renewals(state: &crate::AppState) -> crate::error::AppResult<usize> {
    subscription::run_renewals(state).await
}

/// แจ้งเตือน ตม.30 (เปิดให้ test เรียกได้)
pub async fn run_tm30_alerts(state: &crate::AppState) -> crate::error::AppResult<usize> {
    tm30::run_alerts(state).await
}

/// งานแม่บ้านอัตโนมัติ (เปิดให้ test เรียกได้)
pub async fn run_housekeeping(state: &crate::AppState) -> crate::error::AppResult<usize> {
    housekeeping::run_auto_tasks(state).await
}

#[derive(serde::Deserialize)]
pub struct AuditQuery {
    entity: Option<String>,
    user_id: Option<i64>,
    limit: Option<i64>,
    before_id: Option<i64>,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct AuditRow {
    id: i64,
    user_id: Option<i64>,
    user_name: Option<String>,
    action: String,
    entity: String,
    entity_id: Option<i64>,
    #[sqlx(json(nullable))]
    detail: Option<serde_json::Value>,
    ip: Option<String>,
    created_at: String,
}

/// ประวัติการใช้งานขององค์กร (แอดมินขึ้นไป)
async fn audit_logs(
    axum::extract::State(s): axum::extract::State<crate::AppState>,
    ctx: crate::auth::OrgCtx,
    axum::extract::Query(q): axum::extract::Query<AuditQuery>,
) -> crate::error::AppResult<axum::Json<Vec<AuditRow>>> {
    ctx.require_admin()?;
    Ok(axum::Json(
        sqlx::query_as(
            "SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity, a.entity_id, a.detail, a.ip, a.created_at
             FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
             WHERE (a.org_id = ?1 OR (a.org_id IS NULL AND a.user_id IN (SELECT user_id FROM org_members WHERE org_id = ?1)))
               AND (?2 IS NULL OR a.entity = ?2) AND (?3 IS NULL OR a.user_id = ?3) AND (?4 IS NULL OR a.id < ?4)
             ORDER BY a.id DESC LIMIT ?5",
        )
        .bind(ctx.org_id)
        .bind(q.entity)
        .bind(q.user_id)
        .bind(q.before_id)
        .bind(q.limit.unwrap_or(50).clamp(1, 200))
        .fetch_all(&s.db)
        .await?,
    ))
}

/// ใช้ตรวจว่าระบบและฐานข้อมูลทำงาน (Docker healthcheck)
async fn health(
    axum::extract::State(s): axum::extract::State<crate::AppState>,
) -> crate::error::AppResult<axum::Json<serde_json::Value>> {
    sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(&s.db)
        .await?;
    Ok(axum::Json(serde_json::json!({ "ok": true })))
}
