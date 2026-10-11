//! ทดสอบรายจ่าย รายจ่ายประจำ และรายงานกำไรต่อโครงการ

mod common;

use axum::http::{Method, StatusCode};
use chrono::{Datelike, Local, NaiveDate};
use common::*;
use serde_json::json;

#[tokio::test]
async fn expenses_and_profit_per_property() {
    let (mut owner, unit, _tenant, _booking) = pro_org_with_lease().await;
    let today = Local::now().date_naive();
    let property_id = unit["property_id"].as_i64().unwrap();

    // รายรับ: บิล 3,000 ชำระแล้ว
    let (_, inv) = owner
        .call(
            Method::POST,
            "/api/invoices",
            Some(json!({"unit_id": unit["id"], "due_date": today.to_string(),
                        "items": [{"label": "ค่าเช่า", "qty": 1, "unit_price": 3000}]})),
        )
        .await;
    let (st, _) = owner
        .call(
            Method::POST,
            &format!("/api/invoices/{}/pay", inv["id"]),
            Some(json!({"method": "transfer"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);

    let (_, cats) = owner
        .call(Method::GET, "/api/expense-categories", None)
        .await;
    let cats = cats.as_array().unwrap();
    assert!(cats.len() >= 10);
    let repair = cats.iter().find(|c| c["name"] == "ซ่อมบำรุง").unwrap()["id"].to_string();
    let electric = cats
        .iter()
        .find(|c| c["name"].as_str().unwrap().starts_with("ค่าไฟฟ้า"))
        .unwrap()["id"]
        .to_string();
    let internet = cats
        .iter()
        .find(|c| c["name"].as_str().unwrap().starts_with("อินเทอร์เน็ต"))
        .unwrap()["id"]
        .as_i64()
        .unwrap();

    // ค่าซ่อมของห้อง (โครงการคิดจากห้องให้เอง) พร้อมรูปใบเสร็จ
    let unit_id = unit["id"].to_string();
    let date = today.to_string();
    let (st, e1) = owner
        .multipart_with_photo(
            "/api/expenses",
            &[
                ("unit_id", &unit_id),
                ("category_id", &repair),
                ("amount", "1,200"),
                ("expense_date", &date),
                ("vendor", "ร้านช่างแอร์"),
                ("method", "cash"),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{e1}");
    assert_eq!(e1["property_id"], property_id);
    assert_eq!(e1["amount"], 1200.0);
    assert!(e1["receipt_url"]
        .as_str()
        .unwrap()
        .starts_with("/uploads/expense-"));
    // ค่าไฟส่วนกลาง (ไม่ระบุโครงการ)
    let (st, _) = owner
        .multipart(
            "/api/expenses",
            &[
                ("category_id", &electric),
                ("amount", "500"),
                ("expense_date", &date),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = owner
        .multipart(
            "/api/expenses",
            &[("category_id", &electric), ("amount", "0")],
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = owner
        .multipart(
            "/api/expenses",
            &[("category_id", "99999"), ("amount", "10")],
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let (_, list) = owner.call(Method::GET, "/api/expenses", None).await;
    assert_eq!(list["total"], 1700.0);
    let (_, shared) = owner
        .call(Method::GET, "/api/expenses?scope=shared", None)
        .await;
    assert_eq!(shared["total"], 500.0);

    // กำไร
    let (st, p) = owner.call(Method::GET, "/api/reports/profit", None).await;
    assert_eq!(st, StatusCode::OK, "{p}");
    assert_eq!(p["totals"]["income"], 3000.0);
    assert_eq!(p["totals"]["expense"], 1700.0);
    assert_eq!(p["totals"]["net"], 1300.0);
    assert_eq!(p["shared_expense"], 500.0);
    let prop = &p["properties"][0];
    assert_eq!(prop["income"], 3000.0);
    assert_eq!(prop["expense"], 1200.0);
    assert_eq!(prop["net"], 1800.0);
    assert_eq!(prop["margin"], 60.0);
    let this_month = p["months"].as_array().unwrap().last().unwrap().clone();
    assert_eq!(this_month["month"], today.format("%Y-%m").to_string());
    assert_eq!(this_month["net"], 1300.0);
    assert_eq!(p["categories"][0]["category"], "ซ่อมบำรุง");
    let (_, dash) = owner.call(Method::GET, "/api/dashboard", None).await;
    assert_eq!(dash["expense_month"], 1700.0);

    // รายจ่ายประจำ: ค่าอินเทอร์เน็ตทุกวันที่ 1
    let (st, r) = owner
        .call(
            Method::POST,
            "/api/recurring-expenses",
            Some(json!({"category_id": internet, "amount": 899, "vendor": "AIS Fibre", "day_of_month": 1})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{r}");
    assert_eq!(
        r["last_generated"],
        today.format("%Y-%m").to_string(),
        "เลยวันที่ 1 ของเดือนนี้แล้ว เริ่มเดือนหน้า"
    );
    let next = NaiveDate::from_ymd_opt(
        if today.month() == 12 {
            today.year() + 1
        } else {
            today.year()
        },
        today.month() % 12 + 1,
        2,
    )
    .unwrap();
    let db = owner.state.db.clone();
    assert_eq!(
        estate::routes::run_recurring_expenses(&db, next)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        estate::routes::run_recurring_expenses(&db, next)
            .await
            .unwrap(),
        0
    );
    let (_, list) = owner
        .call(
            Method::GET,
            &format!("/api/expenses?from={}", next.with_day(1).unwrap()),
            None,
        )
        .await;
    assert_eq!(list["expenses"][0]["vendor"], "AIS Fibre");
    assert_eq!(
        list["expenses"][0]["expense_date"],
        next.with_day(1).unwrap().to_string()
    );

    // ส่งออก CSV + แก้ไข/ลบมี audit
    let (st, csv) = owner
        .get_text(&format!(
            "/api/expenses/export.csv?org_id={}",
            owner.org.unwrap()
        ))
        .await;
    assert_eq!(st, StatusCode::OK);
    assert!(csv.contains("ร้านช่างแอร์"));
    assert!(csv.contains("ส่วนกลาง"));
    let id = e1["id"].as_i64().unwrap();
    let (st, upd) = owner
        .multipart(
            &format!("/api/expenses/{id}"),
            &[
                ("unit_id", &unit_id),
                ("category_id", &repair),
                ("amount", "1500"),
                ("expense_date", &date),
            ],
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{upd}");
    assert_eq!(upd["amount"], 1500.0);
    assert!(upd["receipt_url"].is_string(), "ไม่แนบรูปใหม่ = คงรูปเดิม");
    let (st, _) = owner
        .call(Method::DELETE, &format!("/api/expenses/{id}"), None)
        .await;
    assert_eq!(st, StatusCode::OK);
    let (_, logs) = owner.call(Method::GET, "/api/audit-logs", None).await;
    let actions: Vec<_> = logs
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["action"].clone())
        .collect();
    assert!(actions.contains(&json!("expense.update")));
    assert!(actions.contains(&json!("expense.delete")));

    // หมวดที่มีรายการลบไม่ได้
    let (st, _) = owner
        .call(
            Method::DELETE,
            &format!("/api/expense-categories/{internet}"),
            None,
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);
}

#[tokio::test]
async fn profit_report_needs_reports_feature() {
    let mut a = setup().await;
    a.register("owner@test.local", "หอ").await;
    let (st, err) = a.call(Method::GET, "/api/reports/profit", None).await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED, "{err}");
    // บันทึกรายจ่ายได้ทุกแพ็กเกจ
    let (_, cats) = a.call(Method::GET, "/api/expense-categories", None).await;
    let cat = cats[0]["id"].to_string();
    let (st, _) = a
        .multipart("/api/expenses", &[("category_id", &cat), ("amount", "100")])
        .await;
    assert_eq!(st, StatusCode::OK);
}
