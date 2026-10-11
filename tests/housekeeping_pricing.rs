//! ทดสอบงานแม่บ้าน (อัตโนมัติหลังเช็คเอาท์, สถานะห้อง, แจ้งพนักงานทาง LINE) และราคาตามฤดูกาล

mod common;

use axum::http::{Method, StatusCode};
use chrono::{Datelike, Duration, Local};
use common::*;
use serde_json::{json, Value};

fn day(offset: i64) -> chrono::NaiveDate {
    Local::now().date_naive() + Duration::days(offset)
}

async fn pro_org(line_api: &str) -> (Client, i64, i64, Value) {
    let mut owner = setup_with_line(line_api).await;
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
    let (_, prop) = owner
        .call(
            Method::POST,
            "/api/properties",
            Some(json!({"name": "บ้านพัก", "kind": "short_stay", "booking_enabled": true, "booking_slug": "baan-pak", "deposit_percent": 50})),
        )
        .await;
    let (_, unit) = owner
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": prop["id"], "name": "A1", "rate_daily": 1000})),
        )
        .await;
    let (_, tenant) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "แขก"})),
        )
        .await;
    (
        owner,
        prop["id"].as_i64().unwrap(),
        unit["id"].as_i64().unwrap(),
        tenant,
    )
}

#[tokio::test]
async fn checkout_creates_cleaning_task_and_updates_room() {
    let (mut owner, _, uid, tenant) = pro_org("http://127.0.0.1:9").await;
    let (_, b) = owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(
                json!({"unit_id": uid, "tenant_id": tenant["id"], "kind": "short_stay",
                        "start_date": day(-2).to_string(), "end_date": day(0).to_string()}),
            ),
        )
        .await;
    let (_, today) = owner
        .call(Method::GET, "/api/housekeeping/today", None)
        .await;
    assert_eq!(today["checkouts"][0]["unit_name"], "A1");

    owner
        .call(
            Method::PATCH,
            &format!("/api/bookings/{}", b["id"]),
            Some(json!({"status": "completed"})),
        )
        .await;
    let (_, tasks) = owner
        .call(Method::GET, "/api/housekeeping/tasks", None)
        .await;
    let task = &tasks[0];
    assert_eq!(task["kind"], "checkout_clean");
    assert_eq!(task["guest_name"], "แขก");
    assert!(task["checklist"].as_array().unwrap().len() >= 5);
    let (_, units) = owner.call(Method::GET, "/api/units", None).await;
    assert_eq!(units[0]["housekeeping_status"], "dirty");

    // งานอัตโนมัติไม่สร้างซ้ำ
    assert_eq!(estate_auto(&owner).await, 0);

    let tid = task["id"].as_i64().unwrap();
    let (_, t) = owner
        .call(
            Method::PATCH,
            &format!("/api/housekeeping/tasks/{tid}"),
            Some(json!({"status": "in_progress"})),
        )
        .await;
    assert!(t["started_at"].is_string());
    let (_, units) = owner.call(Method::GET, "/api/units", None).await;
    assert_eq!(units[0]["housekeeping_status"], "in_progress");

    let mut checklist = t["checklist"].clone();
    for item in checklist.as_array_mut().unwrap() {
        item["done"] = json!(true);
    }
    owner
        .call(
            Method::PATCH,
            &format!("/api/housekeeping/tasks/{tid}"),
            Some(json!({"checklist": checklist})),
        )
        .await;
    let (st, t) = owner
        .upload_photo_auth(&format!("/api/housekeeping/tasks/{tid}/photos"))
        .await;
    assert_eq!(st, StatusCode::OK, "{t}");
    assert_eq!(t["photos"].as_array().unwrap().len(), 1);
    let (_, t) = owner
        .call(
            Method::PATCH,
            &format!("/api/housekeeping/tasks/{tid}"),
            Some(json!({"status": "done"})),
        )
        .await;
    assert!(t["completed_at"].is_string());
    let (_, units) = owner.call(Method::GET, "/api/units", None).await;
    assert_eq!(units[0]["housekeeping_status"], "clean");
    let (_, dash) = owner.call(Method::GET, "/api/dashboard", None).await;
    assert_eq!(dash["housekeeping"]["open_tasks"], 0);
}

async fn estate_auto(c: &Client) -> usize {
    estate::routes::run_housekeeping(&c.state).await.unwrap()
}

#[tokio::test]
async fn hourly_job_covers_checkouts_nobody_closed() {
    let (mut owner, _, uid, tenant) = pro_org("http://127.0.0.1:9").await;
    owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(
                json!({"unit_id": uid, "tenant_id": tenant["id"], "kind": "short_stay",
                        "start_date": day(-3).to_string(), "end_date": day(0).to_string()}),
            ),
        )
        .await;
    assert_eq!(estate_auto(&owner).await, 1);
    assert_eq!(estate_auto(&owner).await, 0);
}

#[tokio::test]
async fn staff_receive_tasks_on_line() {
    let (api, log) = spawn_line_mock().await;
    let (mut owner, _, uid, _) = pro_org(&api).await;
    let (_, line) = owner
        .call(
            Method::PUT,
            "/api/org/line",
            Some(json!({"enabled": true, "basic_id": "@hotel", "channel_secret": "sec", "channel_access_token": "tok"})),
        )
        .await;
    let webhook = line["webhook_url"]
        .as_str()
        .unwrap()
        .replace("https://estate.test", "");
    let (_, link) = owner
        .call(Method::POST, "/api/org/line/staff-link", None)
        .await;
    assert!(link["link_url"].as_str().unwrap().contains("oaMessage"));
    let event = |text: String| {
        json!({"events": [{"type": "message", "replyToken": "r", "source": {"userId": "Ustaff"},
                           "message": {"type": "text", "text": text}}]})
    };
    owner
        .line_webhook(
            &webhook,
            "sec",
            event(format!("เชื่อมพนักงาน {}", link["code"].as_str().unwrap())),
        )
        .await;
    let (_, members) = owner.call(Method::GET, "/api/org/members", None).await;
    assert_eq!(members[0]["line_linked"], true);

    log.lock().unwrap().clear();
    let me = members[0]["user_id"].clone();
    owner
        .call(
            Method::POST,
            "/api/housekeeping/tasks",
            Some(json!({"unit_id": uid, "kind": "deep_clean", "due_date": day(0).to_string(), "assignee_user_id": me})),
        )
        .await;
    let push = wait_for(&log, |(k, b)| k == "push" && b["to"] == "Ustaff").await;
    assert!(push.to_string().contains("ทำความสะอาดใหญ่"));

    log.lock().unwrap().clear();
    owner
        .line_webhook(&webhook, "sec", event("งาน".into()))
        .await;
    let reply = wait_for(&log, |(k, _)| k == "reply").await;
    assert!(reply.to_string().contains("ห้อง A1"), "{reply}");
}

#[tokio::test]
async fn seasonal_pricing_and_long_stay_discount() {
    let (mut owner, pid, uid, tenant) = pro_org("http://127.0.0.1:9").await;
    let (st, _) = owner
        .call(
            Method::POST,
            "/api/rate-rules",
            Some(json!({"property_id": pid, "name": "ผิด", "rule_type": "length", "value": 10, "min_nights": 1})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, weekend) = owner
        .call(
            Method::POST,
            "/api/rate-rules",
            Some(json!({"property_id": pid, "name": "สุดสัปดาห์", "rule_type": "night", "weekdays": [5, 6],
                        "adjustment": "percent", "value": 20})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{weekend}");
    owner
        .call(
            Method::POST,
            "/api/rate-rules",
            Some(json!({"property_id": pid, "name": "7 คืนขึ้นไป", "rule_type": "length", "value": 10, "min_nights": 7})),
        )
        .await;

    // หาวันศุกร์ถัดไป แล้วขอราคา ศ–อา (2 คืน: ศ 1200 + ส 1200)
    let mut fri = day(1);
    while fri.weekday().num_days_from_sunday() != 5 {
        fri += Duration::days(1);
    }
    let (_, q) = owner
        .call(
            Method::GET,
            &format!(
                "/api/units/{uid}/quote?check_in={fri}&check_out={}",
                fri + Duration::days(2)
            ),
            None,
        )
        .await;
    assert_eq!(q["total"], 2400.0, "{q}");
    // 7 คืน: ศ ส = 1200×2, อีก 5 คืน 1000 = 7400 → ลด 10% = 6660
    let (_, q7) = owner
        .call(
            Method::GET,
            &format!(
                "/api/units/{uid}/quote?check_in={fri}&check_out={}",
                fri + Duration::days(7)
            ),
            None,
        )
        .await;
    assert_eq!(q7["subtotal"], 7400.0);
    assert_eq!(q7["total"], 6660.0);

    // จองโดยไม่ระบุราคา → ใช้ราคาเฉลี่ยตามกฎ
    let (_, b) = owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(json!({"unit_id": uid, "tenant_id": tenant["id"], "kind": "short_stay",
                        "start_date": fri.to_string(), "end_date": (fri + Duration::days(2)).to_string()})),
        )
        .await;
    assert_eq!(b["price"], 1200.0);

    // หน้าจองสาธารณะ: ราคารายวัน + ใบเสนอราคา + มัดจำ 50%
    let mut guest = owner.other();
    let next = fri + Duration::days(7);
    let (_, prices) = guest
        .call(
            Method::GET,
            &format!(
                "/api/public/stay/baan-pak/prices?from={next}&to={}",
                next + Duration::days(3)
            ),
            None,
        )
        .await;
    let list = prices["units"][uid.to_string()].as_array().unwrap();
    assert_eq!(list[0]["price"], 1200.0); // ศุกร์
    assert_eq!(list[2]["price"], 1000.0); // อาทิตย์
    let (_, pq) = guest
        .call(
            Method::GET,
            &format!(
                "/api/public/stay/baan-pak/quote?unit_id={uid}&check_in={next}&check_out={}",
                next + Duration::days(2)
            ),
            None,
        )
        .await;
    assert_eq!(pq["total"], 2400.0);
    assert_eq!(pq["deposit_amount"], 1200.0);
    let (_, created) = guest
        .call(
            Method::POST,
            "/api/public/stay/baan-pak/requests",
            Some(json!({"unit_id": uid, "check_in": next.to_string(), "check_out": (next + Duration::days(2)).to_string(),
                        "guest_name": "คุณเอ", "phone": "0811112222", "consent": true})),
        )
        .await;
    let (_, status) = guest
        .call(
            Method::GET,
            &format!(
                "/api/public/requests/{}",
                created["token"].as_str().unwrap()
            ),
            None,
        )
        .await;
    assert_eq!(status["request"]["total"], 2400.0);

    // ลบกฎ → กลับเป็นราคาฐาน
    owner
        .call(
            Method::DELETE,
            &format!("/api/rate-rules/{}", weekend["id"]),
            None,
        )
        .await;
    let (_, q) = owner
        .call(
            Method::GET,
            &format!(
                "/api/units/{uid}/quote?check_in={fri}&check_out={}",
                fri + Duration::days(2)
            ),
            None,
        )
        .await;
    assert_eq!(q["total"], 2000.0);
}
