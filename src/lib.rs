//! แกนหลักของระบบ Estate — ใช้ได้ทั้งเป็นเว็บเซิร์ฟเวอร์ (`main.rs`)
//! และฝังในแอปเดสก์ท็อป (Tauri) ผ่าน [`serve`]

pub mod audit;
pub mod auth;
pub mod billing;
pub mod crypto;
pub mod db;
pub mod docs;
pub mod error;
pub mod ical;
pub mod line;
pub mod models;
pub mod pricing;
pub mod promptpay;
pub mod ratelimit;
pub mod routes;
pub mod thai;
pub mod uploads;

use std::{net::SocketAddr, path::PathBuf};

use sqlx::SqlitePool;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub upload_dir: PathBuf,
    pub secure_cookies: bool,
    pub line: line::LineClient,
    /// HTTP client ทั่วไป (ดึงปฏิทิน iCal จากช่องทางขาย)
    pub http: reqwest::Client,
    /// อนุญาตให้ดึง URL ในเครือข่ายภายใน (ใช้ตอนทดสอบเท่านั้น)
    pub allow_private_urls: bool,
    pub limiter: std::sync::Arc<ratelimit::RateLimiter>,
    /// URL สาธารณะของระบบ (ใช้สร้างลิงก์ในข้อความ LINE และ Webhook URL)
    pub public_url: String,
}

pub struct Config {
    pub database_url: String,
    pub upload_dir: PathBuf,
    pub static_dir: PathBuf,
    pub bind: SocketAddr,
    pub seed_demo: bool,
    /// ส่ง cookie เฉพาะ HTTPS (เปิดเมื่อติดตั้งจริงหลัง reverse proxy)
    pub secure_cookies: bool,
    /// สร้าง/เลื่อนสิทธิ์ผู้ดูแลแพลตฟอร์มตอนเริ่มระบบ: (email, password)
    pub super_admin: Option<(String, String)>,
    pub public_url: String,
    /// เปลี่ยนได้เพื่อทดสอบกับ mock server
    pub line_api_base: String,
    /// โฟลเดอร์เก็บไฟล์ระบบ เช่น secret.key
    pub data_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let var = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
        Ok(Self {
            database_url: var("DATABASE_URL", "sqlite://estate.db?mode=rwc"),
            upload_dir: var("UPLOAD_DIR", "uploads").into(),
            static_dir: var("STATIC_DIR", "frontend/dist").into(),
            bind: var("BIND", "0.0.0.0:3000").parse()?,
            seed_demo: var("SEED_DEMO", "1") != "0",
            secure_cookies: var("COOKIE_SECURE", "0") == "1",
            super_admin: std::env::var("SUPER_ADMIN_EMAIL")
                .ok()
                .zip(std::env::var("SUPER_ADMIN_PASSWORD").ok()),
            public_url: var("PUBLIC_URL", "http://localhost:3000")
                .trim_end_matches('/')
                .to_string(),
            line_api_base: var("LINE_API_BASE", "https://api.line.me"),
            data_dir: var("DATA_DIR", ".").into(),
        })
    }
}

pub fn http_client() -> reqwest::Client {
    // redirect ไปยัง IP ภายในถูกปฏิเสธ (กัน SSRF ผ่านการ redirect)
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        let internal = attempt
            .url()
            .host_str()
            .map(|h| {
                h == "localhost"
                    || h.parse::<std::net::IpAddr>().is_ok_and(|ip| {
                        ip.is_loopback()
                            || match ip {
                                std::net::IpAddr::V4(v4) => v4.is_private() || v4.is_link_local(),
                                std::net::IpAddr::V6(_) => false,
                            }
                    })
            })
            .unwrap_or(true);
        if internal || attempt.previous().len() >= 3 {
            attempt.stop()
        } else {
            attempt.follow()
        }
    });
    reqwest::Client::builder()
        .redirect(policy)
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("Estate/1.0 (calendar sync)")
        .build()
        .expect("http client")
}

/// ประกอบ Router ทั้งหมด (API + ไฟล์อัปโหลด + หน้าเว็บ SPA)
pub fn build_app(state: AppState, static_dir: &std::path::Path) -> axum::Router {
    // SPA: เส้นทางที่ไม่ใช่ไฟล์จริงให้ส่ง index.html แล้วให้ React Router จัดการต่อ
    let spa = ServeDir::new(static_dir).fallback(ServeFile::new(static_dir.join("index.html")));
    routes::api_router()
        .fallback_service(spa)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

pub async fn serve(config: Config) -> anyhow::Result<()> {
    tokio::fs::create_dir_all(&config.upload_dir).await?;
    crypto::init(&crypto::load_or_create_key(&config.data_dir)?);
    let db = db::connect(&config.database_url).await?;
    db::encrypt_existing_secrets(&db).await?;
    db::seed_packages(&db).await?;
    if let Some((email, password)) = &config.super_admin {
        db::ensure_super_admin(&db, email, password).await?;
    }
    if config.seed_demo {
        db::seed_demo(&db).await?;
    }

    let state = AppState {
        db,
        upload_dir: config.upload_dir.clone(),
        secure_cookies: config.secure_cookies,
        line: line::LineClient::new(&config.line_api_base),
        http: http_client(),
        allow_private_urls: std::env::var("ALLOW_PRIVATE_FEED_URLS").is_ok_and(|v| v == "1"),
        limiter: Default::default(),
        public_url: config.public_url.clone(),
    };
    line::spawn_reminders(state.clone());
    routes::spawn_background(state.clone());
    let app = build_app(state, &config.static_dir);

    tracing::info!("Estate พร้อมใช้งานที่ http://{}", config.bind);
    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}
