//! ทดสอบสัญญาอิเล็กทรอนิกส์: แม่แบบ → ร่าง → ส่ง → ผู้เช่าลงนามในพอร์ทัล → ผู้ให้เช่าลงนาม

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;

#[tokio::test]
async fn contract_draft_send_and_sign() {
    let (mut owner, _unit, tenant, booking) = pro_org_with_lease().await;

    // แม่แบบตั้งต้นถูกสร้างให้ + ตรวจตัวแปรที่ไม่รู้จัก
    let (_, t) = owner
        .call(Method::GET, "/api/contract-templates", None)
        .await;
    assert_eq!(t["templates"].as_array().unwrap().len(), 2);
    assert!(t["placeholders"].as_array().unwrap().len() > 10);
    let (st, err) = owner
        .call(
            Method::POST,
            "/api/contract-templates",
            Some(json!({"name": "x", "body": "{{tenant_name}} {{oops}}"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert!(err["error"].to_string().contains("oops"), "{err}");

    // สร้างร่างจากการจอง: แทนค่าตัวแปรครบ
    let (st, res) = owner
        .call(
            Method::POST,
            "/api/contracts",
            Some(json!({"booking_id": booking["id"]})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{res}");
    let c = &res["contract"];
    let id = c["id"].as_i64().unwrap();
    let body = c["body"].as_str().unwrap();
    assert!(c["doc_no"].as_str().unwrap().starts_with("CT"));
    assert!(body.contains("สมชาย"));
    assert!(body.contains("สามพันบาทถ้วน"));
    assert!(body.contains("1101700012345"));
    assert!(!body.contains("{{"));
    assert_eq!(c["status"], "draft");

    // ร่างยังไม่แสดงในพอร์ทัล
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
            Method::GET,
            &format!("/api/portal/{token}/contracts/{id}"),
            None,
        )
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // แก้ร่าง แล้วส่ง → ล็อกเนื้อหา
    let edited = format!("{body}\n\nข้อ 8 ห้ามเลี้ยงสัตว์");
    let (st, _) = owner
        .call(
            Method::PUT,
            &format!("/api/contracts/{id}"),
            Some(json!({"title": "สัญญาเช่าห้อง 101", "body": edited})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, sent) = owner
        .call(Method::POST, &format!("/api/contracts/{id}/send"), None)
        .await;
    assert_eq!(st, StatusCode::OK, "{sent}");
    assert_eq!(sent["status"], "sent");
    let hash = sent["content_hash"].as_str().unwrap().to_string();
    assert_eq!(hash.len(), 64);
    let (st, _) = owner
        .call(
            Method::PUT,
            &format!("/api/contracts/{id}"),
            Some(json!({"title": "x", "body": "y"})),
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);

    // พอร์ทัล: เห็นในรายการ อ่านได้
    let (_, home) = guest
        .call(Method::GET, &format!("/api/portal/{token}"), None)
        .await;
    assert_eq!(home["contracts"][0]["status"], "sent");
    let (_, view) = guest
        .call(
            Method::GET,
            &format!("/api/portal/{token}/contracts/{id}"),
            None,
        )
        .await;
    assert!(view["contract"]["body"]
        .as_str()
        .unwrap()
        .contains("ห้ามเลี้ยงสัตว์"));

    // ลงนาม: ต้องยอมรับ + hash ตรงกับที่เห็น
    let sign = format!("/api/portal/{token}/contracts/{id}/sign");
    let (st, _) = guest
        .upload_file(
            &sign,
            "signature",
            b"\x89PNG sig",
            &[("signed_name", "สมชาย"), ("content_hash", &hash)],
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = guest
        .upload_file(
            &sign,
            "signature",
            b"\x89PNG sig",
            &[
                ("signed_name", "สมชาย"),
                ("agree", "true"),
                ("content_hash", "old"),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);
    let (st, signed) = guest
        .upload_file(
            &sign,
            "signature",
            b"\x89PNG sig",
            &[
                ("signed_name", "สมชาย ใจดี"),
                ("agree", "true"),
                ("content_hash", &hash),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{signed}");
    assert_eq!(signed["contract"]["status"], "tenant_signed");
    assert_eq!(signed["contract"]["tenant_signed_name"], "สมชาย ใจดี");
    let sig_url = signed["contract"]["tenant_signature_url"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        guest.get_status(&format!("{sig_url}?t={token}")).await,
        StatusCode::OK
    );
    let (st, _) = guest
        .upload_file(
            &sign,
            "signature",
            b"\x89PNG sig",
            &[
                ("signed_name", "x"),
                ("agree", "true"),
                ("content_hash", &hash),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);

    // ผู้ให้เช่าลงนาม → ฉบับสมบูรณ์ พร้อมหลักฐานการลงนาม
    let (st, done) = owner
        .upload_file(
            &format!("/api/contracts/{id}/landlord-sign"),
            "signature",
            b"\x89PNG sig2",
            &[("signed_name", "ผู้จัดการหอ")],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{done}");
    assert_eq!(done["status"], "completed");
    assert!(done["tenant_signed_at"].is_string());
    assert!(done["tenant_signed_ua"].is_string());
    let (_, logs) = owner.call(Method::GET, "/api/audit-logs", None).await;
    assert!(logs
        .as_array()
        .unwrap()
        .iter()
        .any(|l| l["action"] == "contract.tenant_sign"));

    // ยกเลิก
    let (st, v) = owner
        .call(
            Method::POST,
            &format!("/api/contracts/{id}/void"),
            Some(json!({"reason": "ทำสัญญาใหม่"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(v["status"], "void");
}
