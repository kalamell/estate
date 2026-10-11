//! ทดสอบภาษาอังกฤษ: เลือกภาษาในพอร์ทัล/แชต, ข้อความ LINE ตามภาษา, ผู้เช่าต่างชาติเริ่มที่อังกฤษ, สัญญาภาษาอังกฤษ

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{json, Value};

fn text(t: &str) -> Value {
    json!({"destination": "x", "events": [{"type": "message", "replyToken": "rt",
        "source": {"type": "user", "userId": "U1"}, "message": {"type": "text", "id": "1", "text": t}}]})
}

#[tokio::test]
async fn english_tenant_gets_english_messages() {
    let (api, log) = spawn_line_mock().await;
    let mut owner = setup_with_line(&api).await;
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
    let (_, line) = owner
        .call(
            Method::PUT,
            "/api/org/line",
            Some(
                json!({"enabled": true, "channel_id": "1", "basic_id": "estate",
                        "channel_secret": "s3cret", "channel_access_token": "tok"}),
            ),
        )
        .await;
    let webhook = line["webhook_url"]
        .as_str()
        .unwrap()
        .replace("https://estate.test", "");
    let (_, prop) = owner
        .call(
            Method::POST,
            "/api/properties",
            Some(json!({"name": "Sukhumvit Place", "kind": "apartment"})),
        )
        .await;
    let (_, unit) = owner
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": prop["id"], "name": "301", "rent_monthly": 12000})),
        )
        .await;

    // ผู้เช่าต่างชาติใหม่ → ภาษาอังกฤษโดยอัตโนมัติ
    let (_, tenant) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "Emma Brown", "nationality": "GB"})),
        )
        .await;
    assert_eq!(tenant["lang"], "en");
    let (_, booking) = owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(
                json!({"unit_id": unit["id"], "tenant_id": tenant["id"], "kind": "lease",
                        "start_date": "2024-01-01", "end_date": "2025-01-01"}),
            ),
        )
        .await;
    let (_, link) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/line-link", tenant["id"]),
            None,
        )
        .await;
    owner
        .line_webhook(
            &webhook,
            "s3cret",
            text(&format!("เชื่อมบัญชี {}", link["code"].as_str().unwrap())),
        )
        .await;

    // คำสั่งภาษาอังกฤษ → ตอบภาษาอังกฤษ
    owner.line_webhook(&webhook, "s3cret", text("bill")).await;
    wait_for(&log, |(k, b)| {
        k == "reply" && b.to_string().contains("Nothing to pay")
    })
    .await;

    // บิลส่งอัตโนมัติเป็นภาษาอังกฤษ
    let (_, inv) = owner
        .call(
            Method::POST,
            "/api/invoices",
            Some(json!({"unit_id": unit["id"], "due_date": "2099-01-05",
                        "items": [{"label": "Rent", "qty": 1, "unit_price": 12000}]})),
        )
        .await;
    owner
        .call(
            Method::POST,
            &format!("/api/invoices/{}/send-line", inv["id"]),
            None,
        )
        .await;
    let push = wait_for(&log, |(k, b)| {
        k == "push" && b.to_string().contains("Amount due")
    })
    .await;
    assert!(push.to_string().contains("View bill & pay"));
    assert!(push.to_string().contains("5 Jan 2099"));

    // เปลี่ยนเป็นภาษาไทยในแชต
    owner
        .line_webhook(&webhook, "s3cret", text("ภาษาไทย"))
        .await;
    wait_for(&log, |(k, b)| {
        k == "reply" && b.to_string().contains("เปลี่ยนเป็นภาษาไทยแล้ว")
    })
    .await;
    let (_, tenants) = owner.call(Method::GET, "/api/tenants", None).await;
    assert_eq!(tenants[0]["lang"], "th");

    // เลือกภาษาในพอร์ทัล
    let (_, tok) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/portal-token", tenant["id"]),
            None,
        )
        .await;
    let token = tok["portal_token"].as_str().unwrap().to_string();
    let mut guest = owner.other();
    let (st, _) = guest
        .call(
            Method::POST,
            &format!("/api/portal/{token}/lang"),
            Some(json!({"lang": "fr"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    guest
        .call(
            Method::POST,
            &format!("/api/portal/{token}/lang"),
            Some(json!({"lang": "en"})),
        )
        .await;
    let (_, home) = guest
        .call(Method::GET, &format!("/api/portal/{token}"), None)
        .await;
    assert_eq!(home["tenant"]["lang"], "en");

    // สัญญาภาษาอังกฤษ
    let (_, t) = owner
        .call(Method::GET, "/api/contract-templates", None)
        .await;
    let en = t["templates"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["name"].as_str().unwrap().contains("English"))
        .unwrap()["id"]
        .clone();
    let (_, c) = owner
        .call(
            Method::POST,
            "/api/contracts",
            Some(json!({"booking_id": booking["id"], "template_id": en})),
        )
        .await;
    let body = c["contract"]["body"].as_str().unwrap();
    assert!(body.contains("Emma Brown"));
    assert!(body.contains("1 January 2024"));
    assert!(body.contains("1 year"));
    assert!(!body.contains("{{"));
}
