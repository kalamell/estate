mod admin;
mod auth;
mod bookings;
mod dashboard;
mod invoices;
mod meters;
mod move_outs;
mod org;
mod portal;
mod properties;
mod receipts;
mod reports;
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
