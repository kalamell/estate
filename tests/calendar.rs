//! ทดสอบปฏิทินรวม ซิงก์ iCal กับ Airbnb/Booking.com และหน้าจองออนไลน์

mod common;

use axum::http::{Method, StatusCode};
use chrono::{Duration, Local};
use common::*;
use serde_json::json;

fn ics(events: &[(&str, &str, &str)]) -> String {
    let mut s = String::from(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Airbnb Inc//Hosting Calendar//EN\r\n",
    );
    for (uid, start, end) in events {
        s += &format!(
            "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:{start}\r\nDTEND;VALUE=DATE:{end}\r\nUID:{uid}\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\n"
        );
    }
    s + "END:VCALENDAR\r\n"
}

fn day(offset: i64) -> chrono::NaiveDate {
    Local::now().date_naive() + Duration::days(offset)
}

fn ics_day(offset: i64) -> String {
    day(offset).format("%Y%m%d").to_string()
}

/// องค์กร Pro + โครงการห้องพักรายวัน 1 ห้อง
async fn stay_org() -> (Client, i64, i64) {
    let mut owner = setup().await;
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
            Some(json!({"name": "บ้านริมน้ำ", "kind": "short_stay", "promptpay_id": "0812345678"})),
        )
        .await;
    let (_, unit) = owner
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": prop["id"], "name": "A1", "rate_daily": 1500})),
        )
        .await;
    (
        owner,
        prop["id"].as_i64().unwrap(),
        unit["id"].as_i64().unwrap(),
    )
}

#[tokio::test]
async fn ical_import_blocks_double_booking_and_exports() {
    let (mut owner, pid, uid) = stay_org().await;
    let (url, feed_body) =
        spawn_ics_server(&ics(&[("a1@airbnb.com", &ics_day(10), &ics_day(13))])).await;

    let (st, added) = owner
        .call(
            Method::POST,
            &format!("/api/units/{uid}/channels"),
            Some(json!({"source": "airbnb", "url": url})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{added}");
    assert_eq!(added["feed"]["events_count"], 1);
    assert_eq!(added["feed"]["last_status"], "ok");
    let feed_id = added["feed"]["id"].as_i64().unwrap();

    // จองทับวันที่ Airbnb ไม่ได้
    let (_, tenant) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "แขก"})),
        )
        .await;
    let booking = |s: i64, e: i64| {
        json!({"unit_id": uid, "tenant_id": tenant["id"], "kind": "short_stay",
               "start_date": day(s).to_string(), "end_date": day(e).to_string()})
    };
    let (st, err) = owner
        .call(Method::POST, "/api/bookings", Some(booking(11, 12)))
        .await;
    assert_eq!(st, StatusCode::CONFLICT);
    assert!(err["error"].as_str().unwrap().contains("Airbnb"), "{err}");
    // วันเช็คเอาท์ของ Airbnb จองต่อได้
    let (st, b) = owner
        .call(Method::POST, "/api/bookings", Some(booking(13, 15)))
        .await;
    assert_eq!(st, StatusCode::OK, "{b}");

    // ส่งออก: มีทั้งการจองในระบบและที่ปิดจาก Airbnb; exclude ตัด feed นั้นออก
    let (_, ch) = owner
        .call(Method::GET, &format!("/api/units/{uid}/channels"), None)
        .await;
    let export = ch["export_url"]
        .as_str()
        .unwrap()
        .replace("https://estate.test", "");
    let (st, text) = owner.get_text(&export).await;
    assert_eq!(st, StatusCode::OK);
    assert!(text.contains(&format!("DTSTART;VALUE=DATE:{}", ics_day(13))));
    assert!(text.contains(&format!("DTSTART;VALUE=DATE:{}", ics_day(10))));
    let (_, excluded) = owner.get_text(&format!("{export}?exclude={feed_id}")).await;
    assert!(!excluded.contains(&format!("DTSTART;VALUE=DATE:{}", ics_day(10))));
    assert!(!text.contains("แขก"), "ห้ามเปิดเผยชื่อผู้เข้าพักใน iCal");
    let (st, _) = owner.get_text("/ical/not-a-token.ics").await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // Airbnb ยกเลิกรายการเดิม และมีการจองใหม่ที่ชนกับของเรา → แจ้ง conflict
    *feed_body.lock().unwrap() = ics(&[("a2@airbnb.com", &ics_day(14), &ics_day(16))]);
    let (_, sync) = owner
        .call(Method::POST, &format!("/api/channels/{feed_id}/sync"), None)
        .await;
    assert_eq!(sync["imported"], 1);
    assert_eq!(sync["removed"], 1);
    assert_eq!(sync["conflicts"].as_array().unwrap().len(), 1, "{sync}");

    let q = format!(
        "/api/calendar?from={}&to={}&property_id={pid}",
        day(0),
        day(30)
    );
    let (_, cal) = owner.call(Method::GET, &q, None).await;
    let events = cal["events"].as_array().unwrap();
    assert_eq!(events.len(), 2);
    assert!(events.iter().all(|e| e["conflict"] == true));
    assert!(events
        .iter()
        .any(|e| e["type"] == "block" && e["source"] == "airbnb"));

    // ลิงก์เสีย → บันทึกสถานะ error
    *feed_body.lock().unwrap() = "<html>not a calendar</html>".into();
    let (st, _) = owner
        .call(Method::POST, &format!("/api/channels/{feed_id}/sync"), None)
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (_, feeds) = owner.call(Method::GET, "/api/channels", None).await;
    assert_eq!(feeds[0]["last_status"], "error");
}

#[tokio::test]
async fn public_booking_request_flow() {
    let (mut owner, pid, uid) = stay_org().await;
    let (st, prop) = owner
        .call(
            Method::PUT,
            &format!("/api/properties/{pid}"),
            Some(json!({"name": "บ้านริมน้ำ", "kind": "short_stay", "promptpay_id": "0812345678",
                        "booking_enabled": true, "booking_slug": "rim-nam", "min_nights": 2, "deposit_percent": 30})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{prop}");
    assert_eq!(prop["booking_slug"], "rim-nam");

    let mut guest = owner.other();
    let (st, stay) = guest
        .call(Method::GET, "/api/public/stay/rim-nam", None)
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(stay["units"][0]["name"], "A1");
    let (st, _) = guest.call(Method::GET, "/api/public/stay/nope", None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    let req = |s: i64, e: i64, phone: &str| {
        json!({"unit_id": uid, "check_in": day(s).to_string(), "check_out": day(e).to_string(),
               "guest_name": "คุณแขก", "phone": phone, "guests": 2})
    };
    let (st, err) = guest
        .call(
            Method::POST,
            "/api/public/stay/rim-nam/requests",
            Some(req(5, 6, "0899999999")),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "{err}");
    let (st, created) = guest
        .call(
            Method::POST,
            "/api/public/stay/rim-nam/requests",
            Some(req(5, 8, "0899999999")),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{created}");
    let token = created["token"].as_str().unwrap().to_string();

    // ช่วงเดียวกันถูกกันไว้แล้ว
    let (st, _) = guest
        .call(
            Method::POST,
            "/api/public/stay/rim-nam/requests",
            Some(req(6, 9, "0811111111")),
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);
    let (_, avail) = guest
        .call(
            Method::GET,
            &format!(
                "/api/public/stay/rim-nam/availability?from={}&to={}",
                day(0),
                day(30)
            ),
            None,
        )
        .await;
    assert_eq!(avail["busy"].as_array().unwrap().len(), 1);
    assert!(!avail.to_string().contains("คุณแขก"), "ห้ามเปิดเผยข้อมูลผู้จอง");

    // สถานะ + QR มัดจำ 30% ของ 3 คืน × 1500
    let (_, status) = guest
        .call(Method::GET, &format!("/api/public/requests/{token}"), None)
        .await;
    assert_eq!(status["request"]["status"], "pending");
    assert_eq!(status["request"]["total"], 4500.0);
    assert_eq!(status["request"]["deposit_amount"], 1350.0);
    assert!(status["promptpay_payload"]
        .as_str()
        .unwrap()
        .contains("54071350.00"));
    let (st, slip) = guest
        .upload_photo(&format!("/api/public/requests/{token}/slip"))
        .await;
    assert_eq!(st, StatusCode::OK, "{slip}");

    // ทีมงานเห็นและอนุมัติ → สร้างผู้เช่าและการจอง
    let (_, dash) = owner.call(Method::GET, "/api/dashboard", None).await;
    assert_eq!(dash["pending_requests"], 1);
    let (_, list) = owner
        .call(Method::GET, "/api/booking-requests?status=pending", None)
        .await;
    let rid = list[0]["id"].as_i64().unwrap();
    assert!(list[0]["slip_url"]
        .as_str()
        .unwrap()
        .starts_with("/uploads/slip-"));
    let (st, approved) = owner
        .call(
            Method::POST,
            &format!("/api/booking-requests/{rid}/approve"),
            Some(json!({"deposit_paid": true})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{approved}");
    let (_, bookings) = owner.call(Method::GET, "/api/bookings", None).await;
    let b = &bookings[0];
    assert_eq!(b["source"], "direct");
    assert_eq!(b["kind"], "short_stay");
    assert_eq!(b["tenant_name"], "คุณแขก");
    assert_eq!(b["deposit_status"], "paid");
    let (_, status) = guest
        .call(Method::GET, &format!("/api/public/requests/{token}"), None)
        .await;
    assert_eq!(status["request"]["status"], "approved");
    assert!(status["promptpay_payload"].is_null());

    // คำขอใหม่ช่วงอื่น → ปฏิเสธพร้อมเหตุผล
    let (_, c2) = guest
        .call(
            Method::POST,
            "/api/public/stay/rim-nam/requests",
            Some(req(20, 22, "0822222222")),
        )
        .await;
    let (_, list) = owner
        .call(Method::GET, "/api/booking-requests?status=pending", None)
        .await;
    let rid2 = list[0]["id"].as_i64().unwrap();
    let (st, _) = owner
        .call(
            Method::POST,
            &format!("/api/booking-requests/{rid2}/reject"),
            Some(json!({"reason": "ปิดปรับปรุง"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (_, s2) = guest
        .call(
            Method::GET,
            &format!("/api/public/requests/{}", c2["token"].as_str().unwrap()),
            None,
        )
        .await;
    assert_eq!(s2["request"]["status"], "rejected");
    assert_eq!(s2["request"]["reject_reason"], "ปิดปรับปรุง");

    // ปิดหน้าจอง → ลิงก์สาธารณะใช้ไม่ได้
    owner
        .call(
            Method::PUT,
            &format!("/api/properties/{pid}"),
            Some(json!({"name": "บ้านริมน้ำ", "kind": "short_stay", "booking_enabled": false})),
        )
        .await;
    let (st, _) = guest
        .call(Method::GET, "/api/public/stay/rim-nam", None)
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn open_ended_lease_blocks_future_bookings() {
    let (mut owner, _, uid) = stay_org().await;
    let (_, tenant) = owner
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "ผู้เช่ารายเดือน"})),
        )
        .await;
    let (st, _) = owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(json!({"unit_id": uid, "tenant_id": tenant["id"], "kind": "lease", "start_date": day(1).to_string()})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = owner
        .call(
            Method::POST,
            "/api/bookings",
            Some(
                json!({"unit_id": uid, "tenant_id": tenant["id"], "kind": "short_stay",
                        "start_date": day(200).to_string(), "end_date": day(202).to_string()}),
            ),
        )
        .await;
    assert_eq!(st, StatusCode::CONFLICT);
}
