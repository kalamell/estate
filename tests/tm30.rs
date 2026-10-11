//! ทดสอบ ตม.30: สร้างรายการจากผู้เช่าต่างชาติ, ข้อมูลที่ขาด, บันทึกการแจ้ง, ส่งออก CSV, เตือนทีมงานทาง LINE

mod common;

use axum::http::{Method, StatusCode};
use chrono::{Duration, Local};
use common::*;
use serde_json::json;

#[tokio::test]
async fn foreign_tenant_creates_tm30_report() {
    let (mut owner, unit, thai, _) = pro_org_with_lease().await;
    // ผู้เช่าคนไทย → ไม่มีรายการ
    let (_, list) = owner.call(Method::GET, "/api/tm30", None).await;
    assert_eq!(list["reports"].as_array().unwrap().len(), 0);

    let today = Local::now().date_naive();
    let (st, foreigner) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "John Smith", "nationality": "us", "id_card": "P1234567",
                        "gender": "M", "visa_type": "Non-B", "visa_expiry": (today + Duration::days(20)).to_string()})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{foreigner}");
    assert_eq!(foreigner["nationality"], "US");
    let (st, _) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "x", "nationality": "USA"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // แก้ไขจากหน้าเดิมที่ไม่ส่งฟิลด์ต่างชาติ → ข้อมูลเดิมไม่หาย
    let (_, edited) = owner
        .call(
            Method::PUT,
            &format!("/api/tenants/{}", foreigner["id"]),
            Some(json!({"full_name": "John A. Smith", "phone": "0899999999"})),
        )
        .await;
    assert_eq!(edited["nationality"], "US");
    assert_eq!(edited["visa_type"], "Non-B");

    let (_, unit2) = owner
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": unit["property_id"], "name": "102", "rent_monthly": 3000})),
        )
        .await;
    let (st, booking) = owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(
                json!({"unit_id": unit2["id"], "tenant_id": foreigner["id"], "kind": "lease",
                        "start_date": (today - Duration::days(2)).to_string()}),
            ),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{booking}");

    let (_, dash) = owner.call(Method::GET, "/api/dashboard", None).await;
    assert_eq!(dash["tm30_pending"], 1);
    let (_, list) = owner.call(Method::GET, "/api/tm30", None).await;
    let r = &list["reports"][0];
    assert_eq!(r["full_name"], "John A. Smith");
    assert_eq!(r["passport_no"], "P1234567");
    assert_eq!(r["overdue_days"], 1);
    assert_eq!(list["summary"]["overdue"], 1);
    let missing = r["missing"].as_array().unwrap();
    assert!(missing.contains(&json!("arrival_date")));
    assert!(missing.contains(&json!("birth_date")));
    assert!(!missing.contains(&json!("passport_no")));
    assert_eq!(list["visa_expiring"][0]["full_name"], "John A. Smith");
    let _ = thai;

    // CSV สำหรับกรอกในระบบ ตม.
    let (st, csv) = owner
        .get_text(&format!(
            "/api/tm30/export.csv?org_id={}",
            owner.org.unwrap()
        ))
        .await;
    assert_eq!(st, StatusCode::OK);
    assert!(csv.contains("P1234567"));
    assert!(csv.contains("John A. Smith"));

    // บันทึกเลขที่รับแจ้ง
    let id = r["id"].as_i64().unwrap();
    let (st, _) = owner
        .multipart(&format!("/api/tm30/{id}/submit"), &[])
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, done) = owner
        .multipart(
            &format!("/api/tm30/{id}/submit"),
            &[("reference_no", "TM30-0001")],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{done}");
    assert_eq!(done["status"], "submitted");
    assert_eq!(done["overdue_days"], 0);
    let (_, logs) = owner.call(Method::GET, "/api/audit-logs", None).await;
    assert!(logs
        .as_array()
        .unwrap()
        .iter()
        .any(|l| l["action"] == "tm30.export"));
}

#[tokio::test]
async fn staff_cannot_open_tm30() {
    let (owner, ..) = pro_org_with_lease().await;
    let mut staff = owner.other();
    staff.register("staff@test.local", "อื่น").await;
    let mut owner = owner;
    owner
        .call(
            Method::POST,
            "/api/org/members",
            Some(json!({"email": "staff@test.local", "role": "staff"})),
        )
        .await;
    staff.org = owner.org;
    let (st, _) = staff.call(Method::GET, "/api/tm30", None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn tm30_alert_goes_to_linked_admins_once() {
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
    // เจ้าของเชื่อม LINE แบบพนักงาน
    let (_, link) = owner
        .call(Method::POST, "/api/org/line/staff-link", None)
        .await;
    let code = link["code"].as_str().unwrap();
    owner
        .line_webhook(
            &webhook,
            "s3cret",
            json!({"destination": "x", "events": [{"type": "message", "replyToken": "r",
                "source": {"type": "user", "userId": "UOWNER"},
                "message": {"type": "text", "id": "1", "text": format!("เชื่อมพนักงาน {code}")}}]}),
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
    let (_, t) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "Li Wei", "nationality": "CN"})),
        )
        .await;
    owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(
                json!({"unit_id": unit["id"], "tenant_id": t["id"], "kind": "lease",
                        "start_date": Local::now().date_naive().to_string()}),
            ),
        )
        .await;
    let sent = estate::routes::run_tm30_alerts(&owner.state).await.unwrap();
    assert_eq!(sent, 1);
    let push = wait_for(&log, |(k, b)| {
        k == "push" && b.to_string().contains("ตม.30")
    })
    .await;
    assert_eq!(push["to"], "UOWNER");
    assert!(push.to_string().contains("Li Wei"));
    assert_eq!(
        estate::routes::run_tm30_alerts(&owner.state).await.unwrap(),
        0
    );
}
