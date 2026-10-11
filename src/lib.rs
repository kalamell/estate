//! แกนหลักของระบบ Estate — ใช้ได้ทั้งเป็นเว็บเซิร์ฟเวอร์ (`main.rs`)
//! และฝังในแอปเดสก์ท็อป (Tauri) ผ่าน [`serve`]

pub mod billing;
pub mod db;
pub mod error;
pub mod models;
pub mod promptpay;
pub mod routes;

use std::{net::SocketAddr, path::PathBuf};

use sqlx::SqlitePool;
use tower_http::{services::ServeDir, trace::TraceLayer};

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub upload_dir: PathBuf,
}

pub struct Config {
    pub database_url: String,
    pub upload_dir: PathBuf,
    pub static_dir: PathBuf,
    pub bind: SocketAddr,
    pub seed_demo: bool,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let var = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
        Ok(Self {
            database_url: var("DATABASE_URL", "sqlite://estate.db?mode=rwc"),
            upload_dir: var("UPLOAD_DIR", "uploads").into(),
            static_dir: var("STATIC_DIR", "static").into(),
            bind: var("BIND", "0.0.0.0:3000").parse()?,
            seed_demo: var("SEED_DEMO", "1") != "0",
        })
    }
}

pub async fn serve(config: Config) -> anyhow::Result<()> {
    tokio::fs::create_dir_all(&config.upload_dir).await?;
    let db = db::connect(&config.database_url).await?;
    if config.seed_demo {
        db::seed_demo(&db).await?;
    }

    let state = AppState {
        db,
        upload_dir: config.upload_dir.clone(),
    };
    let app = routes::api_router()
        .nest_service("/uploads", ServeDir::new(&config.upload_dir))
        .fallback_service(ServeDir::new(&config.static_dir))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    tracing::info!("Estate พร้อมใช้งานที่ http://{}", config.bind);
    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
