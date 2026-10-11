//! ทดสอบการแยกข้อมูลระหว่างองค์กร สิทธิ์ผู้ใช้ และขีดจำกัดแพ็กเกจ

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
    Router,
};
use estate::{build_app, db, AppState};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

struct Client {
    app: Router,
    cookie: Option<String>,
    org: Option<i64>,
}

impl Client {
    async fn call(
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

    fn other(&self) -> Client {
        Client {
            app: self.app.clone(),
            cookie: None,
            org: None,
        }
    }

    async fn register(&mut self, email: &str, org: &str) -> Value {
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

async fn setup() -> Client {
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
    };
    Client {
        app: build_app(state, std::path::Path::new("frontend/dist")),
        cookie: None,
        org: None,
    }
}

fn property(name: &str, kind: &str) -> Value {
    json!({"name": name, "kind": kind, "address": "", "lat": 13.7, "lng": 100.5})
}

#[tokio::test]
async fn organizations_are_isolated() {
    let mut a = setup().await;
    a.register("a@test.local", "Org A").await;
    let (st, prop) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("A Dorm", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{prop}");
    let pid = prop["id"].as_i64().unwrap();

    let mut b = a.other();
    b.register("b@test.local", "Org B").await;
    let (_, list) = b.call(Method::GET, "/api/properties", None).await;
    assert_eq!(list.as_array().unwrap().len(), 0);
    let (st, _) = b
        .call(Method::GET, &format!("/api/properties/{pid}"), None)
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = b
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": pid, "name": "101"})),
        )
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // ใช้ X-Org-Id ขององค์กรอื่นไม่ได้
    b.org = a.org;
    let (st, _) = b.call(Method::GET, "/api/properties", None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn package_limits_and_features_are_enforced() {
    let mut a = setup().await;
    a.register("a@test.local", "Org A").await;
    let (_, org) = a.call(Method::GET, "/api/org", None).await;
    assert_eq!(org["package"]["name"], "Starter");
    assert_eq!(org["org"]["status"], "trial");

    let (st, _) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("One", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, err) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("Two", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED);
    assert_eq!(err["code"], "limit_reached");

    let (st, err) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("Stay", "short_stay")),
        )
        .await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED);
    assert_eq!(err["code"], "feature_unavailable");
}

#[tokio::test]
async fn staff_cannot_manage_properties() {
    let mut owner = setup().await;
    owner.register("owner@test.local", "Org").await;
    let (st, body) = owner
        .call(
            Method::POST,
            "/api/org/members",
            Some(json!({"email": "staff@test.local", "name": "Staff", "password": "password123", "role": "staff"})),
        )
        .await;
    // แพ็กเกจ Starter มีผู้ใช้ได้ 1 คน
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED, "{body}");

    let mut root = owner.other();
    root.call(
        Method::POST,
        "/api/auth/login",
        Some(json!({"email": "root@test.local", "password": "password123"})),
    )
    .await;
    let (_, packages) = root.call(Method::GET, "/api/admin/packages", None).await;
    let pro = packages
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "Pro")
        .unwrap()["id"]
        .clone();
    let org_id = owner.org.unwrap();
    let (st, _) = root
        .call(
            Method::PUT,
            &format!("/api/admin/orgs/{org_id}"),
            Some(json!({"package_id": pro, "status": "active"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);

    let (st, _) = owner
        .call(
            Method::POST,
            "/api/org/members",
            Some(json!({"email": "staff@test.local", "name": "Staff", "password": "password123", "role": "staff"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);

    let mut staff = owner.other();
    let (_, me) = staff
        .call(
            Method::POST,
            "/api/auth/login",
            Some(json!({"email": "staff@test.local", "password": "password123"})),
        )
        .await;
    staff.org = me["orgs"][0]["id"].as_i64();
    let (st, _) = staff
        .call(
            Method::POST,
            "/api/properties",
            Some(property("X", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = staff
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "ผู้เช่า"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
}

#[tokio::test]
async fn super_admin_controls_subscription() {
    let mut a = setup().await;
    a.register("a@test.local", "Org A").await;
    let (st, _) = a.call(Method::GET, "/api/admin/packages", None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);

    let mut root = a.other();
    root.call(
        Method::POST,
        "/api/auth/login",
        Some(json!({"email": "root@test.local", "password": "password123"})),
    )
    .await;
    let org_id = a.org.unwrap();
    let (st, _) = root
        .call(
            Method::PUT,
            &format!("/api/admin/orgs/{org_id}"),
            Some(json!({"status": "suspended"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);

    // ถูกระงับ: อ่านได้ เขียนไม่ได้
    let (st, _) = a.call(Method::GET, "/api/properties", None).await;
    assert_eq!(st, StatusCode::OK);
    let (st, err) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("One", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED);
    assert_eq!(err["code"], "subscription_inactive");

    // หมดอายุ
    let (st, _) = root
        .call(
            Method::PUT,
            &format!("/api/admin/orgs/{org_id}"),
            Some(json!({"status": "active", "ends_at": "2000-01-01"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("One", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED);
    let (_, _) = root
        .call(
            Method::PUT,
            &format!("/api/admin/orgs/{org_id}"),
            Some(json!({"ends_at": null})),
        )
        .await;
    let (st, _) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("One", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
}

#[tokio::test]
async fn login_logout_flow() {
    let mut a = setup().await;
    a.register("a@test.local", "Org A").await;
    let (st, _) = a.call(Method::POST, "/api/auth/logout", None).await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = a.call(Method::GET, "/api/auth/me", None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    let (st, _) = a
        .call(
            Method::POST,
            "/api/auth/login",
            Some(json!({"email": "a@test.local", "password": "wrong-pass"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, me) = a
        .call(
            Method::POST,
            "/api/auth/login",
            Some(json!({"email": "A@test.local", "password": "password123"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(me["orgs"].as_array().unwrap().len(), 1);
}
