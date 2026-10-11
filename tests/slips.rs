//! ทดสอบตรวจสลิป: อ่าน QR, กันสลิปซ้ำ, ผู้เช่าแจ้งชำระ, ตรวจกับผู้ให้บริการ, ยืนยันอัตโนมัติ, ส่งสลิปใน LINE

mod common;

use std::sync::{Arc, Mutex};

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{json, Value};

async fn invoice(owner: &mut Client, unit: &Value, amount: f64) -> i64 {
    let (st, inv) = owner
        .call(
            Method::POST,
            "/api/invoices",
            Some(json!({"unit_id": unit["id"], "due_date": "2099-01-05",
                        "items": [{"label": "ค่าเช่า", "qty": 1, "unit_price": amount}]})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{inv}");
    inv["id"].as_i64().unwrap()
}

async fn portal_token(owner: &mut Client, tenant: &Value) -> String {
    let (_, t) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/portal-token", tenant["id"]),
            None,
        )
        .await;
    t["portal_token"].as_str().unwrap().to_string()
}

/// ผู้ให้บริการตรวจสลิปจำลอง (รูปแบบ EasySlip) คืนยอดเงินตามที่ตั้งไว้
async fn spawn_provider(amount: Arc<Mutex<f64>>) -> String {
    use axum::{extract::Query, routing::get, Json, Router};
    let app = Router::new().route(
        "/api/v1/verify",
        get(
            move |Query(q): Query<std::collections::HashMap<String, String>>| {
                let amount = amount.clone();
                async move {
                    let a = *amount.lock().unwrap();
                    Json(json!({"status": 200, "data": {
                        "payload": q.get("payload"), "transRef": "X", "date": "2026-10-01T10:00:00+07:00",
                        "amount": {"amount": a}, "sender": {"account": {"name": {"th": "นาย สมชาย"}}},
                        "receiver": {"account": {"name": {"th": "หอ"}}}
                    }}))
                }
            },
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

#[tokio::test]
async fn tenant_submits_slip_and_staff_reviews() {
    let (mut owner, unit, tenant, _) = pro_org_with_lease().await;
    let inv1 = invoice(&mut owner, &unit, 3000.0).await;
    let token = portal_token(&mut owner, &tenant).await;
    let mut guest = owner.other();
    let slip = qr_png(&slip_payload("004", "2026100112345KBANK01"));

    let (st, res) = guest
        .upload_file(
            &format!("/api/portal/{token}/invoices/{inv1}/slip"),
            "photo",
            &slip,
            &[],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{res}");
    assert_eq!(res["check"]["result"], "readable", "{res}");
    assert!(res["check"]["message"]
        .as_str()
        .unwrap()
        .contains("กสิกรไทย"));
    assert_eq!(res["paid"], false);
    assert_eq!(res["notice"]["amount"], 3000.0);

    // แจ้งซ้ำระหว่างรอตรวจไม่ได้
    let (st, _) = guest
        .upload_file(
            &format!("/api/portal/{token}/invoices/{inv1}/slip"),
            "photo",
            &slip,
            &[],
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);

    // พอร์ทัลแสดงสถานะแจ้งชำระ
    let (_, home) = guest
        .call(Method::GET, &format!("/api/portal/{token}"), None)
        .await;
    assert_eq!(home["payment_notices"][0]["status"], "pending");

    // ทีมงานเห็นผลตรวจ แล้วยืนยัน → ออกใบเสร็จ
    let (_, notices) = owner
        .call(Method::GET, "/api/payment-notices?status=pending", None)
        .await;
    let n = &notices[0];
    assert_eq!(n["check"]["trans_ref"], "2026100112345KBANK01");
    assert_eq!(n["tenant_name"], "สมชาย");
    let (_, dash) = owner.call(Method::GET, "/api/dashboard", None).await;
    assert_eq!(dash["pending_payment_notices"], 1);
    let (st, approved) = owner
        .call(
            Method::POST,
            &format!("/api/payment-notices/{}/approve", n["id"]),
            None,
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{approved}");
    assert_eq!(approved["status"], "approved");
    assert!(approved["receipt_id"].as_i64().is_some());
    let (_, inv) = owner
        .call(Method::GET, &format!("/api/invoices/{inv1}"), None)
        .await;
    assert_eq!(inv["invoice"]["status"], "paid");

    // ใช้สลิปเดิมกับบิลอื่น → ตรวจพบสลิปซ้ำ
    let inv2 = invoice(&mut owner, &unit, 3000.0).await;
    let (_, res) = guest
        .upload_file(
            &format!("/api/portal/{token}/invoices/{inv2}/slip"),
            "photo",
            &slip,
            &[],
        )
        .await;
    assert_eq!(res["check"]["result"], "duplicate", "{res}");

    // ตีกลับ → ผู้เช่าแจ้งใหม่ได้
    let (_, notices) = owner
        .call(Method::GET, "/api/payment-notices?status=pending", None)
        .await;
    let (st, rejected) = owner
        .call(
            Method::POST,
            &format!("/api/payment-notices/{}/reject", notices[0]["id"]),
            Some(json!({"reason": "สลิปซ้ำกับเดือนก่อน"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(rejected["reject_reason"], "สลิปซ้ำกับเดือนก่อน");

    // รูปที่ไม่มี QR → อ่านไม่ได้ แต่ยังส่งให้ทีมงานตรวจด้วยตาได้
    let (st, res) = guest
        .upload_file(
            &format!("/api/portal/{token}/invoices/{inv2}/slip"),
            "photo",
            b"\x89PNG not really",
            &[("amount", "1,500")],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{res}");
    assert_eq!(res["check"]["result"], "unreadable");
    assert_eq!(res["notice"]["amount"], 1500.0);

    // บิลของคนอื่น/ยอดเกินไม่ได้
    let (st, _) = guest
        .upload_file(
            &format!("/api/portal/{token}/invoices/999/slip"),
            "photo",
            &slip,
            &[],
        )
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn provider_verification_and_auto_approve() {
    let (mut owner, unit, tenant, _) = pro_org_with_lease().await;
    let amount = Arc::new(Mutex::new(2500.0));
    let base = spawn_provider(amount.clone()).await;
    owner.state.slip_api_base = Some(base);
    owner.app = estate::build_app(owner.state.clone(), std::path::Path::new("frontend/dist"));

    let (st, settings) = owner
        .call(
            Method::PUT,
            "/api/org/slip",
            Some(json!({"provider": "easyslip", "api_key": "secret-key", "auto_approve": true})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{settings}");
    assert_eq!(settings["has_key"], true);
    assert!(!settings.to_string().contains("secret-key"));
    let stored: String = sqlx::query_scalar("SELECT slip_api_key FROM organizations WHERE id = ?")
        .bind(owner.org.unwrap())
        .fetch_one(&owner.state.db)
        .await
        .unwrap();
    assert!(stored.starts_with("enc:v1:"));

    let token = portal_token(&mut owner, &tenant).await;
    let mut guest = owner.other();

    // ยอดไม่ตรง → รอทีมงาน
    let inv1 = invoice(&mut owner, &unit, 3000.0).await;
    let (_, res) = guest
        .upload_file(
            &format!("/api/portal/{token}/invoices/{inv1}/slip"),
            "photo",
            &qr_png(&slip_payload("014", "2026100199999SCB0001")),
            &[],
        )
        .await;
    assert_eq!(res["check"]["result"], "mismatch", "{res}");
    assert_eq!(res["paid"], false);

    // ยอดตรง → ยืนยันอัตโนมัติ ออกใบเสร็จทันที
    let inv2 = invoice(&mut owner, &unit, 2500.0).await;
    let (_, res) = guest
        .upload_file(
            &format!("/api/portal/{token}/invoices/{inv2}/slip"),
            "photo",
            &qr_png(&slip_payload("014", "2026100199999SCB0002")),
            &[],
        )
        .await;
    assert_eq!(res["check"]["result"], "verified", "{res}");
    assert_eq!(res["paid"], true);
    let (_, inv) = owner
        .call(Method::GET, &format!("/api/invoices/{inv2}"), None)
        .await;
    assert_eq!(inv["invoice"]["status"], "paid");
    let (_, notices) = owner
        .call(Method::GET, "/api/payment-notices?status=approved", None)
        .await;
    assert_eq!(notices[0]["check"]["sender_name"], "นาย สมชาย");
    assert!(notices[0]["reviewed_by_name"].is_null());
}

#[tokio::test]
async fn subscription_slip_auto_approved_by_platform() {
    let mut a = setup().await;
    a.register("owner@test.local", "หอ").await;
    let amount = Arc::new(Mutex::new(990.0));
    a.state.slip_api_base = Some(spawn_provider(amount).await);
    a.app = estate::build_app(a.state.clone(), std::path::Path::new("frontend/dist"));
    let mut root = a.other();
    root.login("root@test.local", "password123").await;
    root.call(
        Method::PUT,
        "/api/admin/billing/settings",
        Some(json!({"company_name": "Estate", "promptpay_id": "0812345678"})),
    )
    .await;
    let (st, slip) = root
        .call(
            Method::PUT,
            "/api/admin/billing/slip",
            Some(json!({"provider": "easyslip", "api_key": "k", "auto_approve": true})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{slip}");
    let (_, packages) = root.call(Method::GET, "/api/admin/packages", None).await;
    let pro = packages
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "Pro")
        .unwrap()["id"]
        .clone();
    let (_, res) = a
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": pro})),
        )
        .await;
    let id = res["invoice"]["id"].as_i64().unwrap();
    let (st, res) = a
        .upload_file(
            &format!("/api/billing/invoices/{id}/slip"),
            "photo",
            &qr_png(&slip_payload("006", "2026100177777KTB0001")),
            &[],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{res}");
    assert_eq!(res["invoice"]["status"], "paid", "{res}");
    assert_eq!(res["invoice"]["slip_result"], "verified");
    let (_, org) = a.call(Method::GET, "/api/org", None).await;
    assert_eq!(org["package"]["name"], "Pro");
}

#[tokio::test]
async fn slip_sent_in_line_chat_becomes_payment_notice() {
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
            Some(json!({"full_name": "สมชาย"})),
        )
        .await;
    owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(json!({"unit_id": unit["id"], "tenant_id": tenant["id"], "kind": "lease", "start_date": "2024-01-01"})),
        )
        .await;
    let (_, link) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/line-link", tenant["id"]),
            None,
        )
        .await;
    let text = |t: &str| {
        json!({"destination": "x", "events": [{"type": "message", "replyToken": "rt", "source": {"type": "user", "userId": "U1"},
            "message": {"type": "text", "id": "1", "text": t}}]})
    };
    let image = json!({"destination": "x", "events": [{"type": "message", "replyToken": "rt2",
        "source": {"type": "user", "userId": "U1"}, "message": {"type": "image", "id": "m-55"}}]});
    owner
        .line_webhook(
            &webhook,
            "s3cret",
            text(&format!("เชื่อมบัญชี {}", link["code"].as_str().unwrap())),
        )
        .await;
    let inv = invoice(&mut owner, &unit, 3000.0).await;

    // รูปที่ไม่ใช่สลิป → แนะนำ ไม่สร้างรายการ
    *LINE_IMAGE.lock().unwrap() = b"\x89PNG not a slip".to_vec();
    assert_eq!(
        owner.line_webhook(&webhook, "s3cret", image.clone()).await,
        StatusCode::OK
    );
    wait_for(&log, |(k, b)| {
        k == "reply" && b.to_string().contains("ไม่พบ QR")
    })
    .await;

    *LINE_IMAGE.lock().unwrap() = qr_png(&slip_payload("002", "2026100155555BBL0001"));
    owner.line_webhook(&webhook, "s3cret", image).await;
    wait_for(&log, |(k, b)| {
        k == "reply" && b.to_string().contains("ได้รับสลิปสำหรับบิล")
    })
    .await;
    let (_, notices) = owner.call(Method::GET, "/api/payment-notices", None).await;
    assert_eq!(notices.as_array().unwrap().len(), 1);
    assert_eq!(notices[0]["invoice_id"], inv);
    assert_eq!(notices[0]["channel"], "line");
    assert_eq!(notices[0]["check"]["result"], "readable");

    // ตีกลับ → แจ้งผู้เช่าทาง LINE
    owner
        .call(
            Method::POST,
            &format!("/api/payment-notices/{}/reject", notices[0]["id"]),
            Some(json!({"reason": "ยอดไม่ครบ"})),
        )
        .await;
    wait_for(&log, |(k, b)| {
        k == "push" && b.to_string().contains("ยอดไม่ครบ")
    })
    .await;
}
