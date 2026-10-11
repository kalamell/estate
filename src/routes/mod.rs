mod admin;
mod auth;
mod bookings;
mod calendar;
mod dashboard;
mod housekeeping;
mod invoices;
mod line;
mod meters;
mod move_outs;
mod org;
mod portal;
mod pricing;
mod properties;
mod receipts;
mod reports;
mod stay;
mod tenants;
mod tickets;
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
    housekeeping::spawn_auto_tasks(state);
}

/// งานแม่บ้านอัตโนมัติ (เปิดให้ test เรียกได้)
pub async fn run_housekeeping(state: &crate::AppState) -> crate::error::AppResult<usize> {
    housekeeping::run_auto_tasks(state).await
}
