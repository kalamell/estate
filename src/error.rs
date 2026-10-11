use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("ไม่พบข้อมูล")]
    NotFound,
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Conflict(String),
    #[error("กรุณาเข้าสู่ระบบ")]
    Unauthorized,
    #[error("ไม่มีสิทธิ์ดำเนินการนี้")]
    Forbidden,
    #[error("มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่")]
    TooManyRequests,
    #[error("{message}")]
    PaymentRequired { code: &'static str, message: String },
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NotFound,
            sqlx::Error::Database(ref db) if db.is_unique_violation() => {
                AppError::Conflict("ข้อมูลซ้ำกับที่มีอยู่แล้ว".into())
            }
            sqlx::Error::Database(ref db) if db.is_check_violation() => {
                AppError::BadRequest("ค่าที่ส่งมาไม่ถูกต้อง".into())
            }
            other => AppError::Internal(other.into()),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::TooManyRequests => StatusCode::TOO_MANY_REQUESTS,
            AppError::PaymentRequired { .. } => StatusCode::PAYMENT_REQUIRED,
            AppError::Internal(e) => {
                tracing::error!(error = ?e, "internal error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        let message = match &self {
            AppError::Internal(_) => "เกิดข้อผิดพลาดภายในระบบ".to_string(),
            other => other.to_string(),
        };
        let code = match &self {
            AppError::PaymentRequired { code, .. } => Some(*code),
            _ => None,
        };
        (status, Json(json!({ "error": message, "code": code }))).into_response()
    }
}
