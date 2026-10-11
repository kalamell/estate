#![allow(dead_code)]
//! ตัวช่วยสำหรับ integration test

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
    Router,
};
use estate::{build_app, db, AppState};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

pub struct Client {
    pub state: AppState,
    pub app: Router,
    pub cookie: Option<String>,
    pub org: Option<i64>,
}

impl Client {
    pub async fn call(
        &mut self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut req = Request::builder().method(method).uri(path);
        if let Some(c) = &self.cookie {
            req = req.header(header::COOKIE, c);
        }
        if let Some(o) = self.org {
            req = req.header("x-org-id", o.to_string());
        }
        let req = match body {
            Some(b) => req
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(b.to_string())),
            None => req.body(Body::empty()),
        }
        .unwrap();
        let res = self.app.clone().oneshot(req).await.unwrap();
        if let Some(sc) = res.headers().get(header::SET_COOKIE) {
            self.cookie = Some(sc.to_str().unwrap().split(';').next().unwrap().to_string());
        }
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }

    pub fn other(&self) -> Client {
        Client {
            state: self.state.clone(),
            app: self.app.clone(),
            cookie: None,
            org: None,
        }
    }

    pub async fn register(&mut self, email: &str, org: &str) -> Value {
        let (st, body) = self
            .call(
                Method::POST,
                "/api/auth/register",
                Some(json!({"name": email, "email": email, "password": "password123", "org_name": org})),
            )
            .await;
        assert_eq!(st, StatusCode::OK, "{body}");
        self.org = body["orgs"][0]["id"].as_i64();
        body
    }
}

pub async fn setup() -> Client {
    // พอร์ต 9 ไม่มีใครฟัง: การส่ง LINE จะล้มเหลวแบบปลอดภัย
    setup_with_line("http://127.0.0.1:9").await
}

pub async fn setup_with_line(line_api: &str) -> Client {
    let path = std::env::temp_dir().join(format!("estate-test-{}.db", uuid::Uuid::new_v4()));
    let pool = db::connect(&format!("sqlite://{}?mode=rwc", path.display()))
        .await
        .unwrap();
    db::seed_packages(&pool).await.unwrap();
    db::ensure_super_admin(&pool, "root@test.local", "password123")
        .await
        .unwrap();
    let state = AppState {
        db: pool,
        upload_dir: std::env::temp_dir(),
        secure_cookies: false,
        line: estate::line::LineClient::new(line_api),
        public_url: "https://estate.test".into(),
    };
    Client {
        state: state.clone(),
        app: build_app(state, std::path::Path::new("frontend/dist")),
        cookie: None,
        org: None,
    }
}

impl Client {
    pub async fn login(&mut self, email: &str, password: &str) -> Value {
        let (st, body) = self
            .call(
                Method::POST,
                "/api/auth/login",
                Some(json!({"email": email, "password": password})),
            )
            .await;
        assert_eq!(st, StatusCode::OK, "{body}");
        self.org = body["orgs"][0]["id"].as_i64();
        body
    }

    /// ส่งฟอร์ม multipart (ข้อความล้วน)
    pub async fn multipart(&mut self, path: &str, fields: &[(&str, &str)]) -> (StatusCode, Value) {
        let boundary = "estate-test-boundary";
        let mut body = String::new();
        for (k, v) in fields {
            body += &format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n"
            );
        }
        body += &format!("--{boundary}--\r\n");
        let mut req = Request::builder().method(Method::POST).uri(path).header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
        );
        if let Some(c) = &self.cookie {
            req = req.header(header::COOKIE, c);
        }
        if let Some(o) = self.org {
            req = req.header("x-org-id", o.to_string());
        }
        let res = self
            .app
            .clone()
            .oneshot(req.body(Body::from(body)).unwrap())
            .await
            .unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }
}

/// คำขอที่ mock LINE API ได้รับ: (ชนิด push/reply, body)
pub type LineLog = std::sync::Arc<std::sync::Mutex<Vec<(String, Value)>>>;

/// เซิร์ฟเวอร์จำลอง LINE Messaging API
pub async fn spawn_line_mock() -> (String, LineLog) {
    use axum::{
        extract::Path as AxPath,
        routing::{get, post},
        Json,
    };
    let log: LineLog = Default::default();
    let record = log.clone();
    let app = Router::new()
        .route(
            "/v2/bot/message/:kind",
            post(
                move |AxPath(kind): AxPath<String>, Json(body): Json<Value>| {
                    let record = record.clone();
                    async move {
                        record.lock().unwrap().push((kind, body));
                        Json(json!({}))
                    }
                },
            ),
        )
        .route(
            "/v2/bot/info",
            get(|| async {
                Json(json!({"displayName": "หอทดสอบ", "basicId": "@estate"}))
            }),
        )
        .route(
            "/v2/bot/profile/:id",
            get(|| async { Json(json!({"displayName": "สมชาย LINE"})) }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}"), log)
}

/// รอจนกว่า mock จะได้รับคำขอที่ตรงเงื่อนไข (งานส่งอัตโนมัติทำงานเบื้องหลัง)
pub async fn wait_for(log: &LineLog, pred: impl Fn(&(String, Value)) -> bool) -> Value {
    for _ in 0..100 {
        if let Some(hit) = log.lock().unwrap().iter().find(|e| pred(e)) {
            return hit.1.clone();
        }
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    }
    panic!("mock LINE ไม่ได้รับข้อความที่คาดไว้: {:?}", log.lock().unwrap());
}

impl Client {
    /// ส่ง webhook จาก LINE (ลงลายเซ็นด้วย channel secret)
    pub async fn line_webhook(&self, path: &str, secret: &str, body: Value) -> StatusCode {
        let raw = body.to_string();
        let sig = estate::line::sign(secret, raw.as_bytes());
        let req = Request::builder()
            .method(Method::POST)
            .uri(path)
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-line-signature", sig)
            .body(Body::from(raw))
            .unwrap();
        self.app.clone().oneshot(req).await.unwrap().status()
    }
}
