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
                Some(json!({"name": email, "email": email, "password": "password123", "org_name": org, "accept_terms": true})),
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
    estate::crypto::init("integration-test-secret-key");
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
        http: estate::http_client(),
        allow_private_urls: true,
        limiter: Default::default(),
        public_url: "https://estate.test".into(),
        slip_api_base: None,
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

/// รูปที่ mock LINE ส่งกลับเมื่อดึงเนื้อหาข้อความรูปภาพ
pub static LINE_IMAGE: std::sync::Mutex<Vec<u8>> = std::sync::Mutex::new(Vec::new());

/// รูป PNG ที่มี QR ของข้อความที่กำหนด (ใช้จำลองสลิปโอนเงิน)
pub fn qr_png(text: &str) -> Vec<u8> {
    let code = qrcode::QrCode::new(text.as_bytes()).unwrap();
    let width = code.width();
    let colors = code.to_colors();
    let (scale, quiet) = (6usize, 4usize);
    let size = (width + quiet * 2) * scale;
    let img = image::GrayImage::from_fn(size as u32, size as u32, |x, y| {
        let (mx, my) = (x as usize / scale, y as usize / scale);
        let dark = mx >= quiet
            && my >= quiet
            && mx < width + quiet
            && my < width + quiet
            && colors[(my - quiet) * width + (mx - quiet)] == qrcode::Color::Dark;
        image::Luma([if dark { 0 } else { 255 }])
    });
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

/// payload แบบเดียวกับ QR บนสลิปธนาคาร
pub fn slip_payload(bank: &str, trans_ref: &str) -> String {
    let t = |tag: &str, v: &str| format!("{tag}{:02}{v}", v.len());
    let inner = t("00", "000001") + &t("01", bank) + &t("02", trans_ref);
    let body = t("00", &inner) + &t("51", "TH") + "9104";
    let crc = estate::promptpay::crc16(body.as_bytes());
    format!("{body}{crc:04X}")
}

impl Client {
    /// อัปโหลดไฟล์ 1 ไฟล์ (field ที่กำหนด) พร้อมฟิลด์ข้อความ ส่ง cookie/X-Org-Id ถ้ามี
    pub async fn upload_file(
        &mut self,
        path: &str,
        field: &str,
        bytes: &[u8],
        fields: &[(&str, &str)],
    ) -> (StatusCode, Value) {
        let boundary = "estate-test-boundary";
        let mut body: Vec<u8> = Vec::new();
        for (k, v) in fields {
            body.extend(
                format!(
                    "--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n"
                )
                .as_bytes(),
            );
        }
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"slip.png\"\r\nContent-Type: image/png\r\n\r\n").as_bytes());
        body.extend(bytes);
        body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
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
        )
        .route(
            "/v2/bot/message/:id/content",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "image/png")],
                    LINE_IMAGE.lock().unwrap().clone(),
                )
            }),
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

/// เซิร์ฟเวอร์จำลองที่เสิร์ฟไฟล์ iCal (แก้เนื้อหาได้ระหว่าง test)
pub async fn spawn_ics_server(initial: &str) -> (String, std::sync::Arc<std::sync::Mutex<String>>) {
    use axum::routing::get;
    let body = std::sync::Arc::new(std::sync::Mutex::new(initial.to_string()));
    let shared = body.clone();
    let app = Router::new().route(
        "/cal.ics",
        get(move || {
            let shared = shared.clone();
            async move { shared.lock().unwrap().clone() }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}/cal.ics"), body)
}

impl Client {
    /// GET ที่คืนข้อความดิบ (เช่น ไฟล์ .ics)
    /// GET แบบข้อความ (ส่ง cookie ถ้ามี — ไม่ส่ง X-Org-Id)
    pub async fn get_text(&self, path: &str) -> (StatusCode, String) {
        let mut req = Request::builder().uri(path);
        if let Some(c) = &self.cookie {
            req = req.header(header::COOKIE, c);
        }
        let req = req.body(Body::empty()).unwrap();
        let res = self.app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (status, String::from_utf8_lossy(&bytes).to_string())
    }

    /// ส่งรูป 1 ไฟล์แบบ multipart (field `photo`)
    pub async fn upload_photo(&mut self, path: &str) -> (StatusCode, Value) {
        let boundary = "estate-test-boundary";
        let mut body: Vec<u8> = Vec::new();
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"slip.png\"\r\nContent-Type: image/png\r\n\r\n").as_bytes());
        body.extend(b"\x89PNG fake");
        body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
        let req = Request::builder()
            .method(Method::POST)
            .uri(path)
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(Body::from(body))
            .unwrap();
        let res = self.app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }
}

impl Client {
    /// อัปโหลดรูปแบบมี cookie และ X-Org-Id (สำหรับ endpoint ของทีมงาน)
    pub async fn upload_photo_auth(&mut self, path: &str) -> (StatusCode, Value) {
        let boundary = "estate-test-boundary";
        let mut body: Vec<u8> = Vec::new();
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"photos\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\n").as_bytes());
        body.extend(b"\x89PNG fake");
        body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
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

impl Client {
    /// multipart ข้อความ + รูป 1 ไฟล์ (field `photos`) ส่ง cookie/X-Org-Id ถ้ามี
    pub async fn multipart_with_photo(
        &mut self,
        path: &str,
        fields: &[(&str, &str)],
    ) -> (StatusCode, Value) {
        let boundary = "estate-test-boundary";
        let mut body: Vec<u8> = Vec::new();
        for (k, v) in fields {
            body.extend(
                format!(
                    "--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n"
                )
                .as_bytes(),
            );
        }
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"photos\"; filename=\"p.png\"\r\nContent-Type: image/png\r\n\r\n").as_bytes());
        body.extend(b"\x89PNG fake");
        body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
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

    /// GET ที่ส่ง cookie (ไม่ส่ง X-Org-Id) คืนสถานะ
    pub async fn get_status(&self, path: &str) -> StatusCode {
        let mut req = Request::builder().uri(path);
        if let Some(c) = &self.cookie {
            req = req.header(header::COOKIE, c);
        }
        self.app
            .clone()
            .oneshot(req.body(Body::empty()).unwrap())
            .await
            .unwrap()
            .status()
    }
}

/// องค์กร Pro พร้อมโครงการ ห้อง ผู้เช่า (มีเลขบัตร) และสัญญาที่กำลังเข้าพัก
pub async fn pro_org_with_lease() -> (Client, Value, Value, Value) {
    let mut owner = setup().await;
    owner.register("owner@test.local", "หอ").await;
    let org_id = owner.org.unwrap();
    let mut root = owner.other();
    root.login("root@test.local", "password123").await;
    let (_, packages) = root.call(Method::GET, "/api/admin/packages", None).await;
    let pro = packages
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "Pro")
        .unwrap()["id"]
        .clone();
    root.call(
        Method::PUT,
        &format!("/api/admin/orgs/{org_id}"),
        Some(json!({"package_id": pro, "status": "active"})),
    )
    .await;
    let (_, prop) = owner
        .call(
            Method::POST,
            "/api/properties",
            Some(json!({"name": "หอ", "kind": "dormitory"})),
        )
        .await;
    let (_, unit) = owner
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": prop["id"], "name": "101", "rent_monthly": 3000})),
        )
        .await;
    let (_, tenant) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "สมชาย", "phone": "0811111111", "id_card": "1101700012345"})),
        )
        .await;
    let (_, booking) = owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(json!({"unit_id": unit["id"], "tenant_id": tenant["id"], "kind": "lease", "start_date": "2024-01-01"})),
        )
        .await;
    (owner, unit, tenant, booking)
}
