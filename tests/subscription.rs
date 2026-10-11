mod common;

use axum::http::{Method, StatusCode};
use chrono::{Duration, Local, Months};
use common::*;
use serde_json::{json, Value};

async fn root_of(c: &Client) -> Client {
    let mut root = c.other();
    root.login("root@test.local", "password123").await;
    root
}

async fn package_id(root: &mut Client, name: &str) -> Value {
    let (_, packages) = root.call(Method::GET, "/api/admin/packages", None).await;
    packages
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == name)
        .unwrap()["id"]
        .clone()
}

#[tokio::test]
async fn checkout_slip_review_and_renewal() {
    let mut a = setup().await;
    a.register("owner@test.local", "หอ A").await;
    let org_id = a.org.unwrap();
    let mut root = root_of(&a).await;
    let pro = package_id(&mut root, "Pro").await;

    let (st, settings) = root
        .call(
            Method::PUT,
            "/api/admin/billing/settings",
            Some(json!({
                "company_name": "บริษัท เอสเตท จำกัด", "tax_id": "0105500000001", "promptpay_id": "0812345678",
                "vat_registered": true, "vat_rate": 7, "remind_days": 7, "grace_days": 3, "yearly_months": 10,
            })),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{settings}");
    let (st, _) = root
        .call(
            Method::PUT,
            "/api/admin/billing/settings",
            Some(json!({ "promptpay_id": "12" })),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let (st, billing) = a.call(Method::GET, "/api/billing", None).await;
    assert_eq!(st, StatusCode::OK, "{billing}");
    assert_eq!(billing["subscription"]["package_name"], "Starter");
    let pro_row = billing["packages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "Pro")
        .unwrap();
    assert_eq!(pro_row["price_yearly"], 9900.0);

    // สั่งซื้อ Pro รายเดือน → ใบแจ้งหนี้ + QR (ราคารวม VAT)
    let (st, res) = a
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": pro, "cycle": "monthly"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{res}");
    let inv = &res["invoice"];
    assert!(inv["doc_no"].as_str().unwrap().starts_with("PINV"));
    assert_eq!(inv["total"], 990.0);
    assert_eq!(inv["vat_amount"], 64.77);
    assert_eq!(inv["subtotal"], 925.23);
    assert_eq!(inv["kind"], "change");
    assert_eq!(inv["payer"]["name"], "หอ A");
    assert!(res["promptpay_payload"]
        .as_str()
        .unwrap()
        .contains("5406990.00"));
    let id = inv["id"].as_i64().unwrap();

    // องค์กรอื่นมองไม่เห็น
    let mut b = a.other();
    b.register("b@test.local", "หอ B").await;
    let (st, _) = b
        .call(Method::GET, &format!("/api/billing/invoices/{id}"), None)
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // แนบสลิป → รอตรวจ, สั่งซื้อซ้ำระหว่างรอไม่ได้
    let (st, res) = a
        .upload_photo_auth(&format!("/api/billing/invoices/{id}/slip"))
        .await;
    assert_eq!(st, StatusCode::OK, "{res}");
    assert_eq!(res["invoice"]["status"], "review");
    let (st, _) = a
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": pro, "cycle": "yearly"})),
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);

    // ผู้ดูแลตีกลับ → แนบใหม่ → ยืนยัน
    let (_, admin) = root
        .call(Method::GET, "/api/admin/billing?status=review", None)
        .await;
    assert_eq!(admin["summary"]["review"], 1);
    assert_eq!(admin["invoices"][0]["org_name"], "หอ A");
    let (st, res) = root
        .call(
            Method::POST,
            &format!("/api/admin/billing/invoices/{id}/reject"),
            Some(json!({"reason": "ยอดเงินไม่ตรง"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(res["invoice"]["status"], "pending");
    let (_, org) = a.call(Method::GET, "/api/org", None).await;
    assert_eq!(
        org["billing"]["open_invoice"]["reject_reason"],
        "ยอดเงินไม่ตรง"
    );
    a.upload_photo_auth(&format!("/api/billing/invoices/{id}/slip"))
        .await;
    let (st, res) = root
        .call(
            Method::POST,
            &format!("/api/admin/billing/invoices/{id}/approve"),
            Some(json!({"payment_ref": "KBANK123"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{res}");
    assert_eq!(res["invoice"]["status"], "paid");
    assert!(res["invoice"]["receipt_no"]
        .as_str()
        .unwrap()
        .starts_with("PRC"));
    assert!(res["promptpay_payload"].is_null());

    let today = Local::now().date_naive();
    let month_later = today.checked_add_months(Months::new(1)).unwrap();
    let (_, org) = a.call(Method::GET, "/api/org", None).await;
    assert_eq!(org["package"]["name"], "Pro");
    assert_eq!(org["org"]["status"], "active");
    assert_eq!(org["org"]["ends_at"], month_later.to_string());
    let (_, logs) = a.call(Method::GET, "/api/audit-logs", None).await;
    assert!(logs
        .as_array()
        .unwrap()
        .iter()
        .any(|l| l["action"] == "subscription.paid"));

    // ใกล้หมดอายุ → ระบบออกใบต่ออายุเอง ครั้งเดียว
    let soon = today + Duration::days(3);
    root.call(
        Method::PUT,
        &format!("/api/admin/orgs/{org_id}"),
        Some(json!({"ends_at": soon.to_string()})),
    )
    .await;
    let n = estate::routes::run_subscription_renewals(&a.state)
        .await
        .unwrap();
    assert_eq!(n, 1);
    assert_eq!(
        estate::routes::run_subscription_renewals(&a.state)
            .await
            .unwrap(),
        0
    );
    let (_, billing) = a.call(Method::GET, "/api/billing", None).await;
    let renewal = &billing["open_invoice"]["invoice"];
    assert_eq!(renewal["kind"], "renewal");
    assert_eq!(renewal["period_start"], soon.to_string());
    assert_eq!(renewal["due_date"], soon.to_string());
    let rid = renewal["id"].as_i64().unwrap();

    // ลูกค้ายกเลิก → ไม่ออกซ้ำในรอบเดียวกัน
    let (st, _) = a
        .call(
            Method::POST,
            &format!("/api/billing/invoices/{rid}/cancel"),
            None,
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(
        estate::routes::run_subscription_renewals(&a.state)
            .await
            .unwrap(),
        0
    );

    // ต่ออายุเองแล้วยืนยัน → ต่อจากวันหมดอายุเดิม (ไม่เสียวันที่เหลือ)
    let (_, res) = a
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": pro, "cycle": "monthly"})),
        )
        .await;
    let rid = res["invoice"]["id"].as_i64().unwrap();
    assert_eq!(res["invoice"]["kind"], "renewal");
    let (_, res) = root
        .call(
            Method::POST,
            &format!("/api/admin/billing/invoices/{rid}/approve"),
            None,
        )
        .await;
    let next = soon.checked_add_months(Months::new(1)).unwrap();
    assert_eq!(res["invoice"]["period_end"], next.to_string());
    let (_, org) = a.call(Method::GET, "/api/org", None).await;
    assert_eq!(org["org"]["ends_at"], next.to_string());
}

#[tokio::test]
async fn expired_org_can_still_pay_and_change_plan() {
    let mut a = setup().await;
    a.register("owner@test.local", "หอ").await;
    let org_id = a.org.unwrap();
    let mut root = root_of(&a).await;
    let pro = package_id(&mut root, "Pro").await;
    let starter = package_id(&mut root, "Starter").await;
    root.call(
        Method::PUT,
        &format!("/api/admin/orgs/{org_id}"),
        Some(json!({"package_id": pro, "status": "active", "ends_at": "2000-01-01"})),
    )
    .await;

    let (st, err) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(json!({"name": "x", "kind": "dormitory"})),
        )
        .await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED, "{err}");

    // หมดอายุนานแล้ว: ต่ออายุเริ่มนับจากวันที่ยืนยัน
    let (st, res) = a
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": pro, "cycle": "yearly"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{res}");
    assert_eq!(res["invoice"]["total"], 9900.0);
    assert_eq!(res["invoice"]["credit"], 0.0);
    let id = res["invoice"]["id"].as_i64().unwrap();
    root.call(
        Method::POST,
        &format!("/api/admin/billing/invoices/{id}/approve"),
        None,
    )
    .await;
    let year_later = Local::now()
        .date_naive()
        .checked_add_months(Months::new(12))
        .unwrap();
    let (_, org) = a.call(Method::GET, "/api/org", None).await;
    assert_eq!(org["org"]["ends_at"], year_later.to_string());
    let (st, _) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(json!({"name": "x", "kind": "dormitory"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);

    // เปลี่ยนแพ็กเกจกลางรอบ: ได้ส่วนลดจากวันที่เหลือ
    let ent = package_id(&mut root, "Enterprise").await;
    let (_, res) = a
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": ent, "cycle": "monthly"})),
        )
        .await;
    assert_eq!(res["invoice"]["kind"], "change");
    assert_eq!(res["invoice"]["price"], 2990.0);
    assert_eq!(res["invoice"]["credit"], 2990.0); // ส่วนลดไม่เกินราคาใหม่
    assert_eq!(res["invoice"]["total"], 0.0);

    // ลดเป็นแพ็กเกจฟรีไม่ได้ถ้าใช้งานเกินขีดจำกัด
    a.call(
        Method::POST,
        "/api/properties",
        Some(json!({"name": "y", "kind": "dormitory"})),
    )
    .await;
    let (st, err) = a
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": starter})),
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT, "{err}");
    let (_, props) = a.call(Method::GET, "/api/properties", None).await;
    let last = props.as_array().unwrap().last().unwrap()["id"].clone();
    a.call(Method::DELETE, &format!("/api/properties/{last}"), None)
        .await;
    let (st, res) = a
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": starter})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{res}");
    assert_eq!(res["switched"], true);
    let (_, org) = a.call(Method::GET, "/api/org", None).await;
    assert_eq!(org["package"]["name"], "Starter");
    assert!(org["org"]["ends_at"].is_null());
    // ใบที่ค้างอยู่ถูกยกเลิกให้
    let (_, billing) = a.call(Method::GET, "/api/billing", None).await;
    assert!(billing["open_invoice"].is_null());

    // ระงับโดยผู้ให้บริการ: เปลี่ยนเป็นแพ็กเกจฟรีเพื่อปลดเองไม่ได้
    root.call(
        Method::PUT,
        &format!("/api/admin/orgs/{org_id}"),
        Some(json!({"status": "suspended", "package_id": pro})),
    )
    .await;
    let (st, _) = a
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": starter})),
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);
}

#[tokio::test]
async fn staff_cannot_manage_billing() {
    let mut a = setup().await;
    a.register("owner@test.local", "หอ").await;
    let mut staff = a.other();
    staff.register("staff@test.local", "ของฉัน").await;
    let (st, res) = a
        .call(
            Method::POST,
            "/api/org/members",
            Some(json!({"email": "staff@test.local", "role": "staff"})),
        )
        .await;
    // แพ็กเกจฟรีจำกัดสมาชิก 1 คน
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED, "{res}");
    let mut root = root_of(&a).await;
    let pro = package_id(&mut root, "Pro").await;
    let org_id = a.org.unwrap();
    root.call(
        Method::PUT,
        &format!("/api/admin/orgs/{org_id}"),
        Some(json!({"package_id": pro})),
    )
    .await;
    let (st, _) = a
        .call(
            Method::POST,
            "/api/org/members",
            Some(json!({"email": "staff@test.local", "role": "staff"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    staff.org = Some(org_id);
    let (st, _) = staff.call(Method::GET, "/api/billing", None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = staff
        .call(
            Method::POST,
            "/api/billing/checkout",
            Some(json!({"package_id": pro})),
        )
        .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}
