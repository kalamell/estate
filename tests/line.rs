//! ทดสอบ LINE OA: เชื่อมบัญชีผ่าน webhook, ตอบคำสั่ง, ส่งบิล/ใบเสร็จอัตโนมัติ, แจ้งเตือนไม่ซ้ำ

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{json, Value};

fn text_event(user: &str, text: &str) -> Value {
    json!({ "destination": "x", "events": [{
        "type": "message", "replyToken": "rt-1", "source": { "type": "user", "userId": user },
        "message": { "type": "text", "id": "1", "text": text }
    }]})
}

async fn configured() -> (Client, LineLog, String, Value, i64) {
    let (api, log) = spawn_line_mock().await;
    let mut owner = setup_with_line(&api).await;
    owner.register("owner@test.local", "หอทดสอบ").await;
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

    let (st, line) = owner
        .call(
            Method::PUT,
            "/api/org/line",
            Some(
                json!({"enabled": true, "channel_id": "123", "basic_id": "estate",
                        "channel_secret": "s3cret", "channel_access_token": "tok"}),
            ),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{line}");
    assert_eq!(line["basic_id"], "@estate");
    assert_eq!(line["has_secret"], true);
    assert!(
        !line.to_string().contains("s3cret"),
        "ห้ามส่ง secret กลับไปหน้าเว็บ"
    );
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
    (owner, log, webhook, tenant, prop["id"].as_i64().unwrap())
}

#[tokio::test]
async fn link_account_and_receive_bills() {
    let (mut owner, log, webhook, tenant, pid) = configured().await;

    // ลายเซ็นปลอมต้องถูกปฏิเสธ
    let st = owner
        .line_webhook(&webhook, "wrong", text_event("U1", "บิล"))
        .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);

    // ยังไม่เชื่อม: ตอบแนะนำวิธีเชื่อม
    assert_eq!(
        owner
            .line_webhook(&webhook, "s3cret", text_event("U1", "บิล"))
            .await,
        StatusCode::OK
    );
    let reply = wait_for(&log, |(k, _)| k == "reply").await;
    assert!(reply.to_string().contains("ยังไม่ได้เชื่อม"));

    // ขอรหัสแล้วเชื่อมผ่านแชต
    let (_, link) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/line-link", tenant["id"]),
            None,
        )
        .await;
    let code = link["code"].as_str().unwrap();
    assert!(link["link_url"]
        .as_str()
        .unwrap()
        .starts_with("https://line.me/R/oaMessage/%40estate/"));
    owner
        .line_webhook(
            &webhook,
            "s3cret",
            text_event("U1", &format!("เชื่อมบัญชี {}", code.to_lowercase())),
        )
        .await;
    let (_, tenants) = owner.call(Method::GET, "/api/tenants", None).await;
    assert_eq!(tenants[0]["line_linked"], true);
    assert_eq!(tenants[0]["line_display_name"], "สมชาย LINE");

    // รหัสใช้ซ้ำไม่ได้
    log.lock().unwrap().clear();
    owner
        .line_webhook(
            &webhook,
            "s3cret",
            text_event("U2", &format!("เชื่อมบัญชี {code}")),
        )
        .await;
    let reply = wait_for(&log, |(k, _)| k == "reply").await;
    assert!(reply.to_string().contains("ไม่ถูกต้องหรือหมดอายุ"));

    // ออกบิล → ส่งอัตโนมัติถึง U1
    log.lock().unwrap().clear();
    let (_, gen) = owner
        .call(
            Method::POST,
            "/api/invoices/generate",
            Some(json!({"property_id": pid, "period": "2025-05"})),
        )
        .await;
    let inv_id = gen["created"][0].as_i64().unwrap();
    let push = wait_for(&log, |(k, b)| k == "push" && b["to"] == "U1").await;
    let s = push.to_string();
    assert!(
        s.contains("ใบแจ้งหนี้ รอบ 2025-05") && s.contains(&format!("?invoice={inv_id}")),
        "{s}"
    );

    // ถามยอดในแชต → การ์ดบิล
    log.lock().unwrap().clear();
    owner
        .line_webhook(&webhook, "s3cret", text_event("U1", "บิล"))
        .await;
    let reply = wait_for(&log, |(k, _)| k == "reply").await;
    assert!(reply.to_string().contains("carousel"));

    // รับชำระ → ส่งใบเสร็จอัตโนมัติ
    log.lock().unwrap().clear();
    owner
        .call(
            Method::POST,
            &format!("/api/invoices/{inv_id}/pay"),
            Some(json!({})),
        )
        .await;
    let push = wait_for(&log, |(k, _)| k == "push").await;
    assert!(push.to_string().contains("ได้รับชำระเงินแล้ว"));

    // บันทึกประวัติการส่ง
    let (_, msgs) = owner.call(Method::GET, "/api/line/messages", None).await;
    let kinds: Vec<&str> = msgs
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["kind"].as_str().unwrap())
        .collect();
    assert!(
        kinds.contains(&"invoice") && kinds.contains(&"receipt"),
        "{kinds:?}"
    );
}

#[tokio::test]
async fn reminders_are_sent_once_per_stage() {
    let (mut owner, log, webhook, tenant, _) = configured().await;
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
            text_event("U9", &format!("เชื่อมบัญชี {}", link["code"].as_str().unwrap())),
        )
        .await;
    let unit_id = 1;
    let (_, inv) = owner
        .call(
            Method::POST,
            "/api/invoices",
            Some(json!({"unit_id": unit_id, "due_date": "2025-06-10", "items": [{"label": "ค่าเช่า", "qty": 1, "unit_price": 3000}]})),
        )
        .await;
    assert!(inv["id"].is_i64(), "{inv}");
    log.lock().unwrap().clear();

    let day = |d: &str| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").unwrap();
    assert_eq!(
        estate::line::run_reminders(&owner.state, day("2025-06-09"))
            .await
            .unwrap(),
        1
    ); // ก่อนครบกำหนด 1 วัน
    assert_eq!(
        estate::line::run_reminders(&owner.state, day("2025-06-09"))
            .await
            .unwrap(),
        0
    ); // ไม่ส่งซ้ำ
    assert_eq!(
        estate::line::run_reminders(&owner.state, day("2025-06-10"))
            .await
            .unwrap(),
        0
    ); // วันครบกำหนด
    assert_eq!(
        estate::line::run_reminders(&owner.state, day("2025-06-13"))
            .await
            .unwrap(),
        1
    ); // เกิน 3 วัน
    let pushes = log
        .lock()
        .unwrap()
        .iter()
        .filter(|(k, _)| k == "push")
        .count();
    assert_eq!(pushes, 2);

    // ปิดการเตือน → ไม่ส่ง
    owner
        .call(
            Method::PUT,
            "/api/org/line",
            Some(json!({"enabled": true, "basic_id": "@estate", "auto_remind": false})),
        )
        .await;
    assert_eq!(
        estate::line::run_reminders(&owner.state, day("2025-06-17"))
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn manual_send_requires_linked_tenant_and_setup() {
    let (mut owner, _, _, tenant, _) = configured().await;
    let (st, err) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/line/send-portal", tenant["id"]),
            None,
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert!(err["error"].as_str().unwrap().contains("ยังไม่ได้เชื่อม LINE"));

    // พอร์ทัลแสดงสถานะ LINE และขอรหัสเชื่อมเองได้
    let token = tenant["portal_token"].as_str().unwrap();
    let mut guest = owner.other();
    let (_, home) = guest
        .call(Method::GET, &format!("/api/portal/{token}"), None)
        .await;
    assert_eq!(home["line"]["enabled"], true);
    assert_eq!(home["line"]["linked"], false);
    let (st, link) = guest
        .call(
            Method::POST,
            &format!("/api/portal/{token}/line-link"),
            None,
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(link["code"].as_str().unwrap().len(), 6);

    // องค์กรอื่นเรียก webhook key ผิดไม่ได้
    let st = owner
        .line_webhook(
            "/api/line/webhook/not-a-key",
            "s3cret",
            text_event("U1", "บิล"),
        )
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}
