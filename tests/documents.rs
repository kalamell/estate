//! ทดสอบเอกสารการเงิน (ใบแจ้งหนี้ ใบเสร็จ VAT การยกเลิก) พอร์ทัลผู้เช่า และการย้ายออก

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{json, Value};

/// องค์กรแพ็กเกจ Pro พร้อมโครงการ ห้อง (มีค่าเน็ตคิด VAT) ผู้เช่า และสัญญาที่กำลังเข้าพัก
async fn org_with_lease(vat: bool) -> (Client, i64, i64, i64, Value) {
    let mut owner = setup().await;
    owner.register("owner@test.local", "Org").await;
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

    let (st, _) = owner
        .call(
            Method::PUT,
            "/api/org",
            Some(json!({"name": "Org", "legal_name": "บริษัท ทดสอบ จำกัด", "tax_id": "0105560000000",
                        "branch_code": "00000", "address": "กรุงเทพฯ", "vat_registered": vat, "vat_rate": 7})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (_, prop) = owner
        .call(
            Method::POST,
            "/api/properties",
            Some(json!({"name": "หอ", "kind": "dormitory", "late_fee_type": "per_day", "late_fee_amount": 50, "late_fee_grace_days": 0})),
        )
        .await;
    let (_, unit) = owner
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": prop["id"], "name": "101", "rent_monthly": 3000, "deposit": 6000,
                        "extra_charges": [{"label": "อินเทอร์เน็ต", "amount": 300, "vatable": true}]})),
        )
        .await;
    let (_, tenant) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "ผู้เช่า ก", "tax_id": "1234567890123"})),
        )
        .await;
    let (st, booking) = owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(json!({"unit_id": unit["id"], "tenant_id": tenant["id"], "kind": "lease", "start_date": "2024-01-01"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{booking}");
    let (_, b) = owner
        .call(
            Method::PATCH,
            &format!("/api/bookings/{}", booking["id"]),
            Some(json!({"deposit_status": "paid"})),
        )
        .await;
    assert_eq!(b["status"], "active");
    let pid = prop["id"].as_i64().unwrap();
    (
        owner,
        pid,
        booking["id"].as_i64().unwrap(),
        unit["id"].as_i64().unwrap(),
        tenant,
    )
}

#[tokio::test]
async fn invoice_receipt_and_void_flow() {
    let (mut owner, pid, _, _, _) = org_with_lease(true).await;
    let (_, gen) = owner
        .call(
            Method::POST,
            "/api/invoices/generate",
            Some(json!({"property_id": pid, "period": "2025-01"})),
        )
        .await;
    let inv_id = gen["created"][0].as_i64().unwrap();
    let (_, detail) = owner
        .call(Method::GET, &format!("/api/invoices/{inv_id}"), None)
        .await;
    let inv = &detail["invoice"];
    assert!(inv["doc_no"].as_str().unwrap().starts_with("INV"));
    // ค่าเช่า 3000 (ยกเว้น VAT) + เน็ต 300 (VAT 21)
    assert_eq!(inv["subtotal"], 3300.0);
    assert_eq!(inv["vat_amount"], 21.0);
    assert_eq!(inv["total"], 3321.0);

    let (st, paid) = owner
        .call(
            Method::POST,
            &format!("/api/invoices/{inv_id}/pay"),
            Some(json!({"method": "transfer", "paid_at": "2025-01-05", "wht_amount": 150})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{paid}");
    let r = &paid["receipt"];
    assert!(r["doc_no"].as_str().unwrap().starts_with("RC2568-"));
    assert_eq!(r["is_tax_invoice"], true);
    assert_eq!(r["total"], 3321.0);
    assert_eq!(r["net_received"], 3171.0);
    assert_eq!(r["amount_text"], "สามพันสามร้อยยี่สิบเอ็ดบาทถ้วน");
    assert_eq!(r["issuer"]["tax_id"], "0105560000000");
    assert_eq!(r["payer"]["tax_id"], "1234567890123");
    assert_eq!(paid["invoice"]["status"], "paid");

    // ยกเลิกใบแจ้งหนี้ที่ชำระแล้วไม่ได้ ต้องยกเลิกใบเสร็จก่อน
    let (st, _) = owner
        .call(
            Method::POST,
            &format!("/api/invoices/{inv_id}/void"),
            Some(json!({"reason": "x"})),
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);
    let rid = r["id"].as_i64().unwrap();
    let (st, _) = owner
        .call(
            Method::POST,
            &format!("/api/receipts/{rid}/void"),
            Some(json!({"reason": ""})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, voided) = owner
        .call(
            Method::POST,
            &format!("/api/receipts/{rid}/void"),
            Some(json!({"reason": "บันทึกผิดวิธีชำระ"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(voided["receipt"]["status"], "void");
    let (_, detail) = owner
        .call(Method::GET, &format!("/api/invoices/{inv_id}"), None)
        .await;
    assert_eq!(detail["invoice"]["status"], "unpaid");
    assert_eq!(detail["invoice"]["paid_amount"], 0.0);

    // ชำระใหม่: เลขใบเสร็จต้องต่อเนื่อง
    let (_, paid2) = owner
        .call(
            Method::POST,
            &format!("/api/invoices/{inv_id}/pay"),
            Some(json!({"method": "cash", "paid_at": "2025-01-20"})),
        )
        .await;
    let n1: i64 = r["doc_no"]
        .as_str()
        .unwrap()
        .rsplit('-')
        .next()
        .unwrap()
        .parse()
        .unwrap();
    let n2: i64 = paid2["receipt"]["doc_no"]
        .as_str()
        .unwrap()
        .rsplit('-')
        .next()
        .unwrap()
        .parse()
        .unwrap();
    assert_eq!(n2, n1 + 1);

    // บิลที่เกินกำหนด: มีค่าปรับ 50 บาท/วัน และรวมในใบเสร็จได้
    let unit_id = detail["invoice"]["unit_id"].clone();
    let (_, late) = owner
        .call(
            Method::POST,
            "/api/invoices",
            Some(json!({"unit_id": unit_id, "due_date": "2025-01-01",
                        "items": [{"label": "ค่าซ่อม", "qty": 1, "unit_price": 200}]})),
        )
        .await;
    assert!(late["overdue_days"].as_i64().unwrap() > 0);
    assert_eq!(
        late["late_fee"].as_f64().unwrap(),
        50.0 * late["overdue_days"].as_f64().unwrap()
    );
    let (_, paid3) = owner
        .call(
            Method::POST,
            &format!("/api/invoices/{}/pay", late["id"]),
            Some(json!({"include_late_fee": true})),
        )
        .await;
    let items = paid3["receipt"]["items"].as_array().unwrap();
    assert!(items
        .iter()
        .any(|i| i["label"].as_str().unwrap().starts_with("ค่าปรับชำระล่าช้า")));
    assert_eq!(
        paid3["receipt"]["total"].as_f64().unwrap(),
        200.0 + late["late_fee"].as_f64().unwrap()
    );

    // บิลรายเดือนซ้ำรอบเดิมไม่ได้
    let (_, again) = owner
        .call(
            Method::POST,
            "/api/invoices/generate",
            Some(json!({"property_id": pid, "period": "2025-01"})),
        )
        .await;
    assert_eq!(again["created"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn non_vat_org_issues_plain_receipt() {
    let (mut owner, pid, _, unit_id, _) = org_with_lease(false).await;
    let (_, inv) = owner
        .call(
            Method::POST,
            "/api/invoices",
            Some(json!({"unit_id": unit_id, "due_date": "2030-01-01",
                        "items": [{"label": "ค่าซ่อมก๊อกน้ำ", "qty": 1, "unit_price": 450, "vatable": true}]})),
        )
        .await;
    assert_eq!(inv["vat_amount"], 0.0);
    assert_eq!(inv["kind"], "manual");
    let (_, paid) = owner
        .call(
            Method::POST,
            &format!("/api/invoices/{}/pay", inv["id"]),
            Some(json!({})),
        )
        .await;
    assert_eq!(paid["receipt"]["is_tax_invoice"], false);
    let _ = pid;
}

#[tokio::test]
async fn tenant_portal_access_is_limited_to_own_data() {
    let (mut owner, pid, _, _, tenant) = org_with_lease(false).await;
    owner
        .call(
            Method::POST,
            "/api/invoices/generate",
            Some(json!({"property_id": pid, "period": "2025-02"})),
        )
        .await;
    let token = tenant["portal_token"].as_str().unwrap().to_string();

    let mut guest = owner.other();
    let (st, home) = guest
        .call(Method::GET, &format!("/api/portal/{token}"), None)
        .await;
    assert_eq!(st, StatusCode::OK, "{home}");
    assert_eq!(home["unit"]["name"], "101");
    let inv_id = home["invoices"][0]["id"].as_i64().unwrap();
    let (st, _) = guest
        .call(
            Method::GET,
            &format!("/api/portal/{token}/invoices/{inv_id}"),
            None,
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = guest
        .call(
            Method::GET,
            "/api/portal/not-a-real-token-123456/invoices/1",
            None,
        )
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // ผู้เช่าอีกคนดูบิลนี้ไม่ได้
    let (_, other) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "คนอื่น"})),
        )
        .await;
    let other_token = other["portal_token"].as_str().unwrap();
    let (st, _) = guest
        .call(
            Method::GET,
            &format!("/api/portal/{other_token}/invoices/{inv_id}"),
            None,
        )
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // แจ้งซ่อมจากพอร์ทัล → ทีมงานเห็น, บันทึกภายในผู้เช่าไม่เห็น
    let (st, t) = guest
        .multipart(
            &format!("/api/portal/{token}/tickets"),
            &[
                ("category", "plumbing"),
                ("title", "น้ำรั่ว"),
                ("description", "ใต้ซิงค์"),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{t}");
    let tid = t["ticket"]["id"].as_i64().unwrap();
    assert_eq!(t["ticket"]["unit_name"], "101");
    let (_, list) = owner.call(Method::GET, "/api/tickets", None).await;
    assert_eq!(list.as_array().unwrap().len(), 1);
    owner
        .multipart(
            &format!("/api/tickets/{tid}/messages"),
            &[("body", "โน้ตภายใน"), ("internal", "1")],
        )
        .await;
    owner
        .multipart(
            &format!("/api/tickets/{tid}/messages"),
            &[("body", "ช่างเข้าพรุ่งนี้")],
        )
        .await;
    let (_, seen) = guest
        .call(
            Method::GET,
            &format!("/api/portal/{token}/tickets/{tid}"),
            None,
        )
        .await;
    let msgs = seen["messages"].as_array().unwrap();
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0]["body"], "ช่างเข้าพรุ่งนี้");

    // ปิดฟีเจอร์พอร์ทัลแล้วลิงก์ใช้ไม่ได้
    let (_, rotated) = owner
        .call(
            Method::POST,
            &format!("/api/tenants/{}/portal-token", tenant["id"]),
            None,
        )
        .await;
    assert_ne!(rotated["portal_token"].as_str().unwrap(), token);
    let (st, _) = guest
        .call(Method::GET, &format!("/api/portal/{token}"), None)
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn move_out_settles_deposit() {
    let (mut owner, pid, booking_id, _, _) = org_with_lease(false).await;
    owner
        .call(
            Method::POST,
            "/api/invoices/generate",
            Some(json!({"property_id": pid, "period": "2025-03"})),
        )
        .await;
    let (st, m) = owner
        .call(
            Method::POST,
            "/api/move-outs",
            Some(json!({"booking_id": booking_id, "move_out_date": "2025-03-31",
                        "deductions": [{"label": "ทำความสะอาด", "amount": 500}], "include_outstanding": true})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{m}");
    // มัดจำ 6000 − หัก 500 − บิลค้าง 3300 = คืน 2200
    assert_eq!(m["outstanding_total"], 3300.0);
    assert_eq!(m["refund_amount"], 2200.0);
    let id = m["id"].as_i64().unwrap();
    let (st, settled) = owner
        .call(
            Method::POST,
            &format!("/api/move-outs/{id}/settle"),
            Some(json!({"refund_method": "transfer", "refunded_at": "2025-04-03"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{settled}");
    assert_eq!(settled["status"], "settled");
    assert!(settled["doc_no"].as_str().unwrap().starts_with("DS"));
    assert_eq!(settled["refund_amount"], 2200.0);

    let (_, receipts) = owner.call(Method::GET, "/api/receipts", None).await;
    assert_eq!(receipts.as_array().unwrap().len(), 2); // บิลค้าง + ค่าทำความสะอาด
    let (_, unpaid) = owner
        .call(Method::GET, "/api/invoices?status=unpaid", None)
        .await;
    assert_eq!(unpaid.as_array().unwrap().len(), 0);
    let (_, bookings) = owner.call(Method::GET, "/api/bookings", None).await;
    assert_eq!(bookings[0]["status"], "completed");
    assert_eq!(bookings[0]["deposit_status"], "refunded");

    let (st, report) = owner
        .call(Method::GET, "/api/reports/summary?months=3", None)
        .await;
    assert_eq!(st, StatusCode::OK, "{report}");
    assert_eq!(report["revenue"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn org_can_contact_platform() {
    let (mut owner, _, _, _, _) = org_with_lease(false).await;
    let (st, t) = owner
        .multipart(
            "/api/support",
            &[
                ("category", "bug"),
                ("title", "ออกบิลไม่ได้"),
                ("description", "กดแล้วไม่ขึ้น"),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{t}");
    let id = t["ticket"]["id"].as_i64().unwrap();

    let mut root = owner.other();
    root.login("root@test.local", "password123").await;
    let (_, inbox) = root.call(Method::GET, "/api/admin/support", None).await;
    assert_eq!(inbox[0]["org_name"], "Org");
    root.multipart(
        &format!("/api/admin/support/{id}/messages"),
        &[("body", "กำลังตรวจสอบครับ")],
    )
    .await;
    let (_, thread) = owner
        .call(Method::GET, &format!("/api/support/{id}"), None)
        .await;
    assert_eq!(thread["messages"][0]["author_type"], "platform");

    // องค์กรอื่นมองไม่เห็นคำร้องนี้
    let mut other = owner.other();
    other.register("other@test.local", "Other").await;
    let (st, _) = other
        .call(Method::GET, &format!("/api/support/{id}"), None)
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}
