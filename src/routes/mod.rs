mod bookings;
mod dashboard;
mod invoices;
mod meters;
mod properties;
mod tenants;
mod units;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};

use crate::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
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
        .route("/api/invoices", get(invoices::list))
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
