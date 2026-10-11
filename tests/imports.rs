//! ทดสอบนำเข้าข้อมูล: ไฟล์ของลูกค้าเอง (หัวคอลัมน์ไม่ตรงแม่แบบ) → เดาการจับคู่ → แก้เอง → ตรวจ → นำเข้า → จำการจับคู่

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{json, Value};

async fn pro(owner: &mut Client) {
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
}

async fn upload(c: &mut Client, name: &str, bytes: &[u8]) -> (StatusCode, Value) {
    let boundary = "estate-test-boundary";
    let mut body: Vec<u8> = Vec::new();
    body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").as_bytes());
    body.extend(bytes);
    body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
    use axum::{
        body::Body,
        http::{header, Request},
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    let mut req = Request::builder()
        .method(Method::POST)
        .uri("/api/imports")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
        );
    if let Some(ck) = &c.cookie {
        req = req.header(header::COOKIE, ck);
    }
    if let Some(o) = c.org {
        req = req.header("x-org-id", o.to_string());
    }
    let res = c
        .app
        .clone()
        .oneshot(req.body(Body::from(body)).unwrap())
        .await
        .unwrap();
    let st = res.status();
    let b = res.into_body().collect().await.unwrap().to_bytes();
    (st, serde_json::from_slice(&b).unwrap_or(Value::Null))
}

const CSV: &str = "อาคาร,Room,ชั้นที่,ราคาห้อง/เดือน,ผู้เช่า,Tel,เลขบัตร,เข้าพัก,หมดสัญญา,มัดจำ,ไฟ,น้ำ,สัญชาติ
บ้านสวน,101,1,\"3,500\",สมชาย ใจดี,812345678,1101700012345,1/6/2567,31/5/2570,7000,1234,567,ไทย
บ้านสวน,102,,3500,,,,,,,1100,450,
บ้านสวน,201,2,abc,,,,,,,,,
ตึกใหม่,A1,1,4000,John Smith,+66811111111,P1234567,2024-02-01,,8000,,,อเมริกา
บ้านสวน,103,1,3500,สมชาย ใจดี,081-234-5678,,01/01/2567,,0,,,
,,,,,,,,,,,,
";

#[tokio::test]
async fn import_csv_with_custom_columns() {
    let mut owner = setup().await;
    owner.register("owner@test.local", "หอ").await;
    pro(&mut owner).await;

    // CSV ภาษาไทยที่ Excel บันทึกเป็น Windows-874
    let (bytes, _, _) = encoding_rs::WINDOWS_874.encode(CSV);
    let (st, up) = upload(&mut owner, "ข้อมูลหอ.csv", &bytes).await;
    assert_eq!(st, StatusCode::OK, "{up}");
    let id = up["id"].as_i64().unwrap();
    assert_eq!(up["header_row"], 0);
    assert_eq!(up["mapping_source"]["type"], "auto");
    let m = &up["mapping"];
    assert_eq!(m["property_name"], 0);
    assert_eq!(m["unit_name"], 1);
    assert_eq!(m["floor"], 2);
    assert_eq!(m["rent_monthly"], 3);
    assert_eq!(m["tenant_name"], 4);
    assert_eq!(m["tenant_phone"], 5);
    assert_eq!(m["tenant_id_card"], 6);
    assert_eq!(m["start_date"], 7);
    assert_eq!(m["end_date"], 8);
    assert_eq!(m["deposit"], 9);
    assert_eq!(m["tenant_nationality"], 12);
    assert!(
        m.get("electric_reading").is_none(),
        "หัวคอลัมน์ 'ไฟ' ไม่ชัด ให้ผู้ใช้เลือกเอง"
    );

    // ผู้ใช้จับคู่คอลัมน์ที่เหลือเอง
    let mut mapping = m.as_object().unwrap().clone();
    mapping.insert("electric_reading".into(), json!(10));
    mapping.insert("water_reading".into(), json!(11));
    let spec = json!({ "sheet": 0, "header_row": 0, "mapping": mapping, "options": {} });

    let (st, pv) = owner
        .call(
            Method::POST,
            &format!("/api/imports/{id}/preview"),
            Some(spec.clone()),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{pv}");
    let s = &pv["summary"];
    assert_eq!(s["rows"], 5, "{pv}");
    assert_eq!(s["errors"], 1);
    assert_eq!(s["properties_create"], 2);
    assert_eq!(s["units_create"], 4);
    assert_eq!(s["tenants_create"], 2, "สมชายสองห้องนับครั้งเดียว");
    assert_eq!(s["leases_create"], 3);
    assert_eq!(s["meters"], 4);
    let bad = pv["rows"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["status"] == "error")
        .unwrap();
    assert_eq!(bad["row"], 4);
    assert!(bad["errors"][0].as_str().unwrap().contains("abc"));

    let (st, done) = owner
        .call(
            Method::POST,
            &format!("/api/imports/{id}/commit"),
            Some(spec.clone()),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{done}");
    assert_eq!(done["summary"]["units_create"], 4);
    assert_eq!(done["skipped"][0]["row"], 4);

    // ตรวจข้อมูลที่เข้าไป
    let (_, tenants) = owner.call(Method::GET, "/api/tenants", None).await;
    let tenants = tenants.as_array().unwrap();
    assert_eq!(tenants.len(), 2);
    let somchai = tenants
        .iter()
        .find(|t| t["full_name"] == "สมชาย ใจดี")
        .unwrap();
    assert_eq!(somchai["phone"], "0812345678", "เติม 0 ที่ Excel ตัด");
    let john = tenants
        .iter()
        .find(|t| t["full_name"] == "John Smith")
        .unwrap();
    assert_eq!(john["nationality"], "US");
    assert_eq!(john["lang"], "en");
    let (_, bookings) = owner.call(Method::GET, "/api/bookings", None).await;
    let b101 = bookings
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["unit_name"] == "101")
        .unwrap();
    assert_eq!(b101["start_date"], "2024-06-01");
    assert_eq!(b101["end_date"], "2027-05-31");
    assert_eq!(b101["status"], "active");
    assert_eq!(b101["deposit_status"], "paid");
    let (_, props) = owner.call(Method::GET, "/api/properties", None).await;
    assert_eq!(props.as_array().unwrap().len(), 2);
    let baan = props
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "บ้านสวน")
        .unwrap()["id"]
        .clone();
    let (_, units) = owner
        .call(Method::GET, &format!("/api/units?property_id={baan}"), None)
        .await;
    let u101 = units
        .as_array()
        .unwrap()
        .iter()
        .find(|u| u["name"] == "101")
        .unwrap();
    assert_eq!(u101["status"], "occupied");
    assert_eq!(u101["rent_monthly"], 3500.0);
    let u102_id = units
        .as_array()
        .unwrap()
        .iter()
        .find(|u| u["name"] == "102")
        .unwrap()["id"]
        .clone();
    let (_, meters) = owner
        .call(
            Method::GET,
            &format!("/api/meter-readings?unit_id={u102_id}"),
            None,
        )
        .await;
    assert_eq!(meters.as_array().unwrap().len(), 2);

    // นำเข้าไฟล์รูปแบบเดิมอีกครั้ง: ใช้การจับคู่ที่บันทึกไว้ ไม่สร้างซ้ำ
    let (_, up2) = upload(&mut owner, "ข้อมูลหอ-รอบ2.csv", &bytes).await;
    assert_eq!(up2["mapping_source"]["type"], "saved");
    assert_eq!(up2["mapping"]["electric_reading"], 10);
    let id2 = up2["id"].as_i64().unwrap();
    let spec2 = json!({ "mapping": up2["mapping"], "options": {} });
    let (_, pv2) = owner
        .call(
            Method::POST,
            &format!("/api/imports/{id2}/preview"),
            Some(spec2.clone()),
        )
        .await;
    assert_eq!(pv2["summary"]["units_create"], 0);
    assert_eq!(pv2["summary"]["properties_create"], 0);
    assert_eq!(pv2["summary"]["tenants_create"], 0);
    assert_eq!(pv2["summary"]["leases_create"], 0);
    assert_eq!(pv2["summary"]["leases_skip"], 3);
    let (_, done2) = owner
        .call(
            Method::POST,
            &format!("/api/imports/{id2}/commit"),
            Some(spec2),
        )
        .await;
    assert_eq!(done2["summary"]["meters"], 0, "มิเตอร์วันเดียวกันไม่ซ้ำ");
    let (_, tenants) = owner.call(Method::GET, "/api/tenants", None).await;
    assert_eq!(tenants.as_array().unwrap().len(), 2);

    let (_, maps) = owner.call(Method::GET, "/api/import-mappings", None).await;
    assert_eq!(maps.as_array().unwrap().len(), 1);
    let (_, logs) = owner.call(Method::GET, "/api/audit-logs", None).await;
    assert!(logs
        .as_array()
        .unwrap()
        .iter()
        .any(|l| l["action"] == "import.commit"));
}

#[tokio::test]
async fn import_excel_sheet_with_dates_and_limits() {
    use rust_xlsxwriter::{ExcelDateTime, Format, Workbook};
    let mut owner = setup().await;
    owner.register("owner@test.local", "หอ").await;
    // Starter: 1 โครงการ 20 ห้อง
    let (_, prop) = owner
        .call(
            Method::POST,
            "/api/properties",
            Some(json!({"name": "หอเดียว", "kind": "dormitory"})),
        )
        .await;

    let mut wb = Workbook::new();
    let readme = wb.add_worksheet().set_name("คำอธิบาย").unwrap();
    readme.write(0, 0, "ไฟล์รายชื่อผู้เช่า").unwrap();
    let ws = wb.add_worksheet().set_name("ผู้เช่า").unwrap();
    let date_fmt = Format::new().set_num_format("dd/mm/yyyy");
    ws.write(0, 0, "รายชื่อผู้เช่า ปี 2567").unwrap();
    for (c, h) in [
        "เลขห้อง",
        "ชื่อ-นามสกุล",
        "เบอร์โทร",
        "เลขบัตรประชาชน",
        "วันเข้าพัก",
        "ค่าเช่า",
    ]
    .iter()
    .enumerate()
    {
        ws.write(2, c as u16, *h).unwrap();
    }
    ws.write(3, 0, 301).unwrap();
    ws.write(3, 1, "มานี มีนา").unwrap();
    ws.write(3, 2, 891112222).unwrap();
    ws.write(3, 3, 1101700012345_f64).unwrap();
    ws.write_with_format(
        3,
        4,
        ExcelDateTime::from_ymd(2024, 3, 15).unwrap(),
        &date_fmt,
    )
    .unwrap();
    ws.write(3, 5, 4200).unwrap();
    let bytes = wb.save_to_buffer().unwrap();

    let (st, up) = upload(&mut owner, "tenants.xlsx", &bytes).await;
    assert_eq!(st, StatusCode::OK, "{up}");
    assert_eq!(up["sheets"].as_array().unwrap().len(), 2);
    let id = up["id"].as_i64().unwrap();
    // เลือกชีตที่ 2 — แถวหัวตารางอยู่แถวที่ 3 (ข้ามหัวรายงาน)
    let (_, ins) = owner
        .call(
            Method::POST,
            &format!("/api/imports/{id}/inspect"),
            Some(json!({"sheet": 1, "header_row": 2})),
        )
        .await;
    assert_eq!(ins["headers"][0], "เลขห้อง");
    assert_eq!(ins["sample"][0][4], "2024-03-15");
    let spec = json!({ "sheet": 1, "header_row": 2, "mapping": ins["mapping"], "options": {} });
    let (st, done) = owner
        .call(
            Method::POST,
            &format!("/api/imports/{id}/commit"),
            Some(spec),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{done}");
    assert_eq!(done["summary"]["leases_create"], 1);
    let (_, units) = owner
        .call(
            Method::GET,
            &format!("/api/units?property_id={}", prop["id"]),
            None,
        )
        .await;
    let u = &units[0];
    assert_eq!(u["name"], "301");
    assert_eq!(u["floor"], 3, "ชั้นจากเลขห้อง");
    let (_, tenants) = owner.call(Method::GET, "/api/tenants", None).await;
    assert_eq!(tenants[0]["phone"], "0891112222");
    assert_eq!(tenants[0]["id_card"], "1101700012345");

    // เกินขีดจำกัดแพ็กเกจ → ไม่ให้นำเข้า
    let mut csv = String::from("ห้อง,ค่าเช่า\n");
    for i in 0..25 {
        csv.push_str(&format!("{},3000\n", 400 + i));
    }
    let (_, up) = upload(&mut owner, "many.csv", csv.as_bytes()).await;
    let id = up["id"].as_i64().unwrap();
    let spec = json!({ "mapping": up["mapping"], "options": {} });
    let (_, pv) = owner
        .call(
            Method::POST,
            &format!("/api/imports/{id}/preview"),
            Some(spec.clone()),
        )
        .await;
    assert!(
        pv["global_errors"][0].as_str().unwrap().contains("ขีดจำกัด"),
        "{pv}"
    );
    let (st, _) = owner
        .call(
            Method::POST,
            &format!("/api/imports/{id}/commit"),
            Some(spec),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // ไฟล์ที่ไม่รองรับ
    let (st, _) = upload(&mut owner, "x.pdf", b"%PDF").await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}
