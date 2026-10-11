//! ทดสอบ PDPA (ความยินยอม คำขอ ส่งออก ลบข้อมูล ปิดบังเลขบัตร) และความปลอดภัย (สิทธิ์ไฟล์ rate limit audit เข้ารหัส)

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;

#[tokio::test]
async fn register_requires_terms() {
    let mut c = setup().await;
    let (st, _) = c
        .call(
            Method::POST,
            "/api/auth/register",
            Some(json!({"name": "a", "email": "a@test.local", "password": "password123", "org_name": "x"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn id_card_is_masked_for_staff_and_not_wiped() {
    let (mut owner, _, tenant, _) = pro_org_with_lease().await;
    let (_, list) = owner.call(Method::GET, "/api/tenants", None).await;
    assert_eq!(list[0]["id_card"], "1101700012345");
    owner
        .call(
            Method::POST,
            "/api/org/members",
            Some(json!({"email": "staff@test.local", "name": "พนักงาน", "password": "password123", "role": "staff"})),
        )
        .await;
    let mut staff = owner.other();
    staff.login("staff@test.local", "password123").await;
    let (_, list) = staff.call(Method::GET, "/api/tenants", None).await;
    let masked = list[0]["id_card"].as_str().unwrap();
    assert!(
        masked.starts_with('•') && masked.ends_with("2345"),
        "{masked}"
    );
    // พนักงานแก้ชื่อโดยส่งค่าที่ปิดบังกลับมา → เลขบัตรจริงต้องไม่หาย
    staff
        .call(
            Method::PUT,
            &format!("/api/tenants/{}", tenant["id"]),
            Some(json!({"full_name": "สมชาย ใจดี", "phone": "0811111111", "id_card": masked})),
        )
        .await;
    let (_, list) = owner.call(Method::GET, "/api/tenants", None).await;
    assert_eq!(list[0]["id_card"], "1101700012345");
    assert_eq!(list[0]["full_name"], "สมชาย ใจดี");
    // staff ส่งออก/ลบข้อมูลไม่ได้
    let (st, _) = staff
        .call(
            Method::GET,
            &format!("/api/tenants/{}/export", tenant["id"]),
            None,
        )
        .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn portal_consent_requests_export_and_anonymize() {
    let (mut owner, _, tenant, booking) = pro_org_with_lease().await;
    let token = tenant["portal_token"].as_str().unwrap().to_string();
    let mut guest = owner.other();
    let (_, home) = guest
        .call(Method::GET, &format!("/api/portal/{token}"), None)
        .await;
    assert_eq!(home["privacy"]["consented"], false);
    assert!(home["privacy"]["notice"]
        .as_str()
        .unwrap()
        .contains("สิทธิของท่าน"));
    guest
        .call(Method::POST, &format!("/api/portal/{token}/consent"), None)
        .await;
    let (_, list) = owner.call(Method::GET, "/api/tenants", None).await;
    assert_eq!(list[0]["consent_source"], "portal");

    let (st, req) = guest
        .call(
            Method::POST,
            &format!("/api/portal/{token}/privacy-requests"),
            Some(json!({"kind": "access", "note": "ขอสำเนา"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{req}");
    let (_, dash) = owner.call(Method::GET, "/api/dashboard", None).await;
    assert_eq!(dash["open_privacy_requests"], 1);
    let (st, _) = owner
        .call(
            Method::PATCH,
            &format!("/api/privacy-requests/{}", req["id"]),
            Some(json!({"status": "rejected"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "ปฏิเสธต้องมีเหตุผล");
    let (st, done) = owner
        .call(
            Method::PATCH,
            &format!("/api/privacy-requests/{}", req["id"]),
            Some(json!({"status": "done", "response": "ส่งไฟล์แล้ว"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert!(done["resolved_at"].is_string());

    let (st, text) = guest.get_text(&format!("/api/portal/{token}/export")).await;
    assert_eq!(st, StatusCode::OK);
    assert!(text.contains("1101700012345") && text.contains("\"bookings\""));

    // ยังเช่าอยู่ → ลบไม่ได้; สิ้นสุดสัญญาแล้วลบได้
    let anon = json!({"confirm": "ลบข้อมูล"});
    let (st, _) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/anonymize", tenant["id"]),
            Some(anon.clone()),
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);
    owner
        .call(
            Method::PATCH,
            &format!("/api/bookings/{}", booking["id"]),
            Some(json!({"status": "completed"})),
        )
        .await;
    let (st, t) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/anonymize", tenant["id"]),
            Some(anon),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{t}");
    assert!(t["full_name"]
        .as_str()
        .unwrap()
        .starts_with("ผู้เช่าที่ลบข้อมูลแล้ว"));
    assert_eq!(t["id_card"], "");
    assert!(t["anonymized_at"].is_string());
    let (st, _) = guest
        .call(Method::GET, &format!("/api/portal/{token}"), None)
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND, "ลิงก์พอร์ทัลเดิมต้องใช้ไม่ได้");

    let (_, logs) = owner.call(Method::GET, "/api/audit-logs", None).await;
    let actions: Vec<&str> = logs
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["action"].as_str().unwrap())
        .collect();
    assert!(
        actions.contains(&"tenant.anonymize") && actions.contains(&"booking.update"),
        "{actions:?}"
    );
}

#[tokio::test]
async fn uploaded_files_require_permission() {
    let (mut owner, _, tenant, _) = pro_org_with_lease().await;
    let token = tenant["portal_token"].as_str().unwrap().to_string();
    let mut guest = owner.other();
    let (st, t) = guest
        .multipart_with_photo(
            &format!("/api/portal/{token}/tickets"),
            &[("category", "plumbing"), ("title", "น้ำรั่ว")],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{t}");
    let url = t["ticket"]["photos"][0].as_str().unwrap().to_string();

    assert_eq!(
        guest.get_status(&url).await,
        StatusCode::NOT_FOUND,
        "ไม่มีสิทธิ์"
    );
    assert_eq!(
        guest.get_status(&format!("{url}?t={token}")).await,
        StatusCode::OK
    );
    assert_eq!(owner.get_status(&url).await, StatusCode::OK, "ทีมงานในองค์กร");
    assert_eq!(
        guest.get_status("/uploads/..%2Fsecret.key").await,
        StatusCode::NOT_FOUND
    );

    // ผู้เช่าคนอื่นและองค์กรอื่นเปิดไม่ได้
    let (_, other) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "คนอื่น"})),
        )
        .await;
    let other_token = other["portal_token"].as_str().unwrap();
    assert_eq!(
        guest.get_status(&format!("{url}?t={other_token}")).await,
        StatusCode::NOT_FOUND
    );
    let mut stranger = owner.other();
    stranger.register("x@test.local", "อีกองค์กร").await;
    assert_eq!(stranger.get_status(&url).await, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn login_is_rate_limited() {
    let mut c = setup().await;
    c.register("a@test.local", "x").await;
    let mut attacker = c.other();
    let mut last = StatusCode::OK;
    for _ in 0..11 {
        let (st, _) = attacker
            .call(
                Method::POST,
                "/api/auth/login",
                Some(json!({"email": "a@test.local", "password": "wrong-password"})),
            )
            .await;
        last = st;
    }
    assert_eq!(last, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn line_secrets_are_encrypted_at_rest() {
    let (api, _) = spawn_line_mock().await;
    let mut owner = setup_with_line(&api).await;
    owner.register("o@test.local", "หอ").await;
    owner
        .call(
            Method::PUT,
            "/api/org/line",
            Some(json!({"enabled": true, "basic_id": "@x", "channel_secret": "plain-secret", "channel_access_token": "plain-token"})),
        )
        .await;
    let (secret, token): (String, String) =
        sqlx::query_as("SELECT line_channel_secret, line_access_token FROM organizations LIMIT 1")
            .fetch_one(&owner.state.db)
            .await
            .unwrap();
    assert!(secret.starts_with("enc:v1:") && !secret.contains("plain"));
    assert!(token.starts_with("enc:v1:"));
    let (st, info) = owner.call(Method::POST, "/api/org/line/test", None).await;
    assert_eq!(st, StatusCode::OK, "ถอดรหัสแล้วใช้งานได้: {info}");
}
