//! ทดสอบพัสดุ: บันทึก → แจ้ง LINE พร้อมรหัสรับ → ดูในพอร์ทัล/แชต → ส่งมอบพร้อมลายเซ็น

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{json, Value};

fn text(t: &str) -> Value {
    json!({"destination": "x", "events": [{"type": "message", "replyToken": "rt",
        "source": {"type": "user", "userId": "U1"}, "message": {"type": "text", "id": "1", "text": t}}]})
}

#[tokio::test]
async fn parcel_lifecycle_with_line_notice() {
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
    assert_eq!(line["auto_parcel"], true);
    let webhook = line["webhook_url"]
        .as_str()
        .unwrap()
        .replace("https://estate.test", "");
    let (_, prop) = owner
        .call(
            Method::POST,
            "/api/properties",
            Some(json!({"name": "หอใจดี", "kind": "dormitory"})),
        )
        .await;
    let (_, unit) = owner
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": prop["id"], "name": "203", "rent_monthly": 3000})),
        )
        .await;
    let (_, empty_unit) = owner
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": prop["id"], "name": "204", "rent_monthly": 3000})),
        )
        .await;
    let (_, tenant) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "มานี"})),
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
    owner
        .line_webhook(
            &webhook,
            "s3cret",
            text(&format!("เชื่อมบัญชี {}", link["code"].as_str().unwrap())),
        )
        .await;

    // บันทึกพัสดุด้วยห้อง → ผูกผู้เช่าปัจจุบันให้เอง และแจ้ง LINE
    let unit_id = unit["id"].to_string();
    let (st, parcel) = owner
        .multipart_with_photo(
            "/api/parcels",
            &[
                ("unit_id", &unit_id),
                ("carrier", "Kerry"),
                ("tracking_no", "KER123456"),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{parcel}");
    assert_eq!(parcel["tenant_name"], "มานี");
    assert_eq!(parcel["status"], "waiting");
    let code = parcel["pickup_code"].as_str().unwrap().to_string();
    assert_eq!(code.len(), 4);
    let push = wait_for(&log, |(k, b)| {
        k == "push" && b.to_string().contains("มีพัสดุมาถึงคุณ")
    })
    .await;
    assert!(push.to_string().contains(&code));
    assert!(push.to_string().contains("KER123456"));

    // ห้องว่างต้องระบุชื่อผู้รับ
    let empty_id = empty_unit["id"].to_string();
    let (st, _) = owner
        .multipart("/api/parcels", &[("unit_id", &empty_id)])
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, other) = owner
        .multipart(
            "/api/parcels",
            &[
                ("unit_id", &empty_id),
                ("recipient_name", "คุณเอ"),
                ("kind", "letter"),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{other}");

    // ถามในแชต
    owner
        .line_webhook(&webhook, "s3cret", text("มีพัสดุไหม"))
        .await;
    wait_for(&log, |(k, b)| {
        k == "reply" && b.to_string().contains("มีพัสดุรอรับ 1 ชิ้น")
    })
    .await;

    // พอร์ทัลเห็นพัสดุพร้อมรหัส และเปิดรูปพัสดุของตัวเองได้
    let (_, t) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/portal-token", tenant["id"]),
            None,
        )
        .await;
    let token = t["portal_token"].as_str().unwrap();
    let mut guest = owner.other();
    let (_, home) = guest
        .call(Method::GET, &format!("/api/portal/{token}"), None)
        .await;
    assert_eq!(home["parcels"][0]["pickup_code"], code.as_str());
    let photo = parcel["photo_url"].as_str().unwrap();
    assert_eq!(
        guest.get_status(&format!("{photo}?t={token}")).await,
        StatusCode::OK
    );
    assert_eq!(guest.get_status(photo).await, StatusCode::NOT_FOUND);

    // สรุป + ค้นหาด้วยรหัสรับ
    let (_, list) = owner
        .call(Method::GET, &format!("/api/parcels?q={code}"), None)
        .await;
    assert_eq!(list["parcels"][0]["id"], parcel["id"]);
    let (_, list) = owner.call(Method::GET, "/api/parcels", None).await;
    assert_eq!(list["summary"]["waiting"], 2);
    let (_, dash) = owner.call(Method::GET, "/api/dashboard", None).await;
    assert_eq!(dash["parcels_waiting"], 2);

    // รหัสผิด → ไม่ส่งมอบ, รหัสถูก → ส่งมอบพร้อมลายเซ็น
    let id = parcel["id"].as_i64().unwrap();
    let (st, _) = owner
        .multipart(&format!("/api/parcels/{id}/pickup"), &[("code", "xxxx")])
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, done) = owner
        .upload_file(
            &format!("/api/parcels/{id}/pickup"),
            "signature",
            b"\x89PNG sig",
            &[("code", &code), ("signature_url", "/uploads/evil.png")],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{done}");
    assert_eq!(done["status"], "picked_up");
    assert_eq!(done["picked_up_by"], "มานี");
    let sig = done["signature_url"].as_str().unwrap();
    assert!(sig.starts_with("/uploads/pickup-"), "{sig}");
    let (st, _) = owner
        .multipart(&format!("/api/parcels/{id}/pickup"), &[])
        .await;
    assert_eq!(st, StatusCode::CONFLICT);

    // ตีกลับ
    let (st, ret) = owner
        .call(
            Method::POST,
            &format!("/api/parcels/{}/return", other["id"]),
            Some(json!({"note": "ไม่มีผู้รับ"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(ret["status"], "returned");
    assert!(ret["note"].as_str().unwrap().contains("ไม่มีผู้รับ"));
}
