//! ทดสอบอีเมล: ยืนยันอีเมลตอนสมัคร, ลืมรหัสผ่าน, เปลี่ยนรหัสผ่าน, อีเมลค่าแพ็กเกจ

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;

/// ดึงโทเค็นจากลิงก์ในอีเมลล่าสุดของผู้รับ
async fn token_from_email(c: &Client, to: &str, kind: &str) -> String {
    let body: String = sqlx::query_scalar(
        "SELECT body_text FROM email_outbox WHERE to_addr = ? AND kind = ? ORDER BY id DESC LIMIT 1",
    )
    .bind(to)
    .bind(kind)
    .fetch_one(&c.state.db)
    .await
    .unwrap();
    body.split("token=")
        .nth(1)
        .unwrap()
        .chars()
        .take_while(|c| c.is_ascii_hexdigit())
        .collect()
}

async fn count_emails(c: &Client, to: &str, kind: &str) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM email_outbox WHERE to_addr = ? AND kind = ?")
        .bind(to)
        .bind(kind)
        .fetch_one(&c.state.db)
        .await
        .unwrap()
}

#[tokio::test]
async fn verify_email_and_reset_password() {
    let mut a = setup().await;
    let me = a.register("Owner@Test.local", "หอ").await;
    assert_eq!(me["user"]["email_verified"], false);

    // ยืนยันอีเมล
    let token = token_from_email(&a, "owner@test.local", "verify").await;
    assert_eq!(token.len(), 64);
    let (st, _) = a
        .call(
            Method::POST,
            "/api/auth/verify",
            Some(json!({"token": token})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (_, me) = a.call(Method::GET, "/api/auth/me", None).await;
    assert_eq!(me["user"]["email_verified"], true);
    let (st, _) = a
        .call(
            Method::POST,
            "/api/auth/verify",
            Some(json!({"token": token})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "ใช้ซ้ำไม่ได้");

    // ส่งอีเมลจากคิว (ไม่ได้ตั้ง SMTP → บันทึกลง log)
    let n = estate::mail::flush(&a.state.db, &a.state.mailer)
        .await
        .unwrap();
    assert!(n >= 1);
    let status: String =
        sqlx::query_scalar("SELECT status FROM email_outbox WHERE kind = 'verify' LIMIT 1")
            .fetch_one(&a.state.db)
            .await
            .unwrap();
    assert_eq!(status, "logged");

    // ลืมรหัสผ่าน: อีเมลที่ไม่มีในระบบตอบเหมือนกันแต่ไม่ส่งอีเมล
    let mut guest = a.other();
    let (st, _) = guest
        .call(
            Method::POST,
            "/api/auth/forgot",
            Some(json!({"email": "nobody@test.local"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(count_emails(&a, "nobody@test.local", "reset").await, 0);
    let (st, _) = guest
        .call(
            Method::POST,
            "/api/auth/forgot",
            Some(json!({"email": "OWNER@test.local "})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let token = token_from_email(&a, "owner@test.local", "reset").await;

    let (st, _) = guest
        .call(
            Method::POST,
            "/api/auth/reset",
            Some(json!({"token": token, "password": "short"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = guest
        .call(
            Method::POST,
            "/api/auth/reset",
            Some(json!({"token": token, "password": "brand-new-pass"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    // ลิงก์ใช้ได้ครั้งเดียว และเซสชันเดิมถูกออกจากระบบ
    let (st, _) = guest
        .call(
            Method::POST,
            "/api/auth/reset",
            Some(json!({"token": token, "password": "another-pass"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = a.call(Method::GET, "/api/auth/me", None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);

    let (st, _) = guest
        .call(
            Method::POST,
            "/api/auth/login",
            Some(json!({"email": "owner@test.local", "password": "password123"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    // เข้าสู่ระบบด้วยอีเมลตัวพิมพ์ใหญ่ได้
    guest.login("Owner@test.local", "brand-new-pass").await;
}

#[tokio::test]
async fn change_password_signs_out_other_devices() {
    let mut a = setup().await;
    a.register("owner@test.local", "หอ").await;
    let mut phone = a.other();
    phone.login("owner@test.local", "password123").await;

    let (st, _) = a
        .call(
            Method::POST,
            "/api/auth/password",
            Some(json!({"current_password": "wrong-pass", "new_password": "new-password-1"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = a
        .call(
            Method::POST,
            "/api/auth/password",
            Some(json!({"current_password": "password123", "new_password": "new-password-1"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = a.call(Method::GET, "/api/auth/me", None).await;
    assert_eq!(st, StatusCode::OK, "เครื่องที่เปลี่ยนรหัสยังใช้งานต่อได้");
    let (st, _) = phone.call(Method::GET, "/api/auth/me", None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED, "เครื่องอื่นถูกออกจากระบบ");
}

#[tokio::test]
async fn billing_emails_reach_owner_and_admins() {
    let mut a = setup().await;
    a.register("owner@test.local", "หอ").await;
    let mut root = a.other();
    root.login("root@test.local", "password123").await;
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
    assert_eq!(count_emails(&a, "owner@test.local", "invoice").await, 1);
    let id = res["invoice"]["id"].as_i64().unwrap();
    a.upload_photo_auth(&format!("/api/billing/invoices/{id}/slip"))
        .await;
    assert_eq!(count_emails(&a, "root@test.local", "slip_review").await, 1);
    root.call(
        Method::POST,
        &format!("/api/admin/billing/invoices/{id}/approve"),
        None,
    )
    .await;
    assert_eq!(count_emails(&a, "owner@test.local", "receipt").await, 1);

    let (_, outbox) = root.call(Method::GET, "/api/admin/emails", None).await;
    assert_eq!(outbox["smtp_configured"], false);
    assert!(outbox["emails"].as_array().unwrap().len() >= 3);
    let (_, test) = root
        .call(
            Method::POST,
            "/api/admin/emails/test",
            Some(json!({"to": "me@test.local"})),
        )
        .await;
    assert_eq!(test["status"], "logged");
}
