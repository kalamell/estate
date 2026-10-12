//! ทดสอบหน้าแนะนำระบบ (แพ็กเกจสาธารณะ ฟอร์มติดต่อ) และศูนย์รวมการเชื่อมต่อ

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;

#[tokio::test]
async fn public_site_and_contact_form() {
    let mut guest = setup().await;
    let (st, site) = guest.call(Method::GET, "/api/public/site", None).await;
    assert_eq!(st, StatusCode::OK);
    let packages = site["packages"].as_array().unwrap();
    assert_eq!(packages.len(), 3);
    assert_eq!(packages[0]["name"], "Starter");
    assert_eq!(packages[0]["is_default"], true);
    let pro = packages.iter().find(|p| p["name"] == "Pro").unwrap();
    assert_eq!(pro["price_yearly"], 9900.0);

    let (st, _) = guest
        .call(
            Method::POST,
            "/api/public/contact",
            Some(json!({"name": "คุณเอ", "consent": true})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "ต้องมีเบอร์หรืออีเมล");
    let (st, _) = guest
        .call(
            Method::POST,
            "/api/public/contact",
            Some(json!({"name": "คุณเอ", "phone": "0812345678"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "ต้องยินยอม");
    let (st, _) = guest
        .call(
            Method::POST,
            "/api/public/contact",
            Some(json!({"name": "บอท", "phone": "0812345678", "consent": true, "website": "spam.example"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = guest
        .call(
            Method::POST,
            "/api/public/contact",
            Some(
                json!({"name": "คุณเอ", "phone": "081-234-5678", "business": "หอพักเอ", "units": 40,
                        "message": "สนใจทดลองใช้", "consent": true}),
            ),
        )
        .await;
    assert_eq!(st, StatusCode::OK);

    let mut root = guest.other();
    root.login("root@test.local", "password123").await;
    let (_, leads) = root.call(Method::GET, "/api/admin/leads", None).await;
    assert_eq!(leads["new"], 1, "บอทไม่ถูกบันทึก");
    let lead = &leads["leads"][0];
    assert_eq!(lead["business"], "หอพักเอ");
    assert_eq!(lead["units"], 40);
    let mails: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM email_outbox WHERE kind = 'lead'")
        .fetch_one(&guest.state.db)
        .await
        .unwrap();
    assert_eq!(mails, 1);
    let (st, upd) = root
        .call(
            Method::PATCH,
            &format!("/api/admin/leads/{}", lead["id"]),
            Some(json!({"status": "contacted", "note": "โทรแล้ว นัดเดโมวันศุกร์"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(upd["status"], "contacted");

    let mut user = guest.other();
    user.register("owner@test.local", "หอ").await;
    let (st, _) = user.call(Method::GET, "/api/admin/leads", None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn integrations_overview() {
    let (mut owner, ..) = pro_org_with_lease().await;
    let (st, i) = owner.call(Method::GET, "/api/integrations", None).await;
    assert_eq!(st, StatusCode::OK, "{i}");
    assert_eq!(i["line"]["ready"], false);
    assert_eq!(i["slip"]["provider"], "none");
    assert_eq!(i["promptpay"]["properties"], 1);
    assert_eq!(i["email"]["platform_smtp"], false);
    assert!(i["channels"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn promo_video_on_landing() {
    let mut root = setup().await;
    root.login("root@test.local", "password123").await;
    let (st, _) = root
        .call(
            Method::PUT,
            "/api/admin/site",
            Some(json!({"promo_video_url": "https://evil.example/x.mp4"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, v) = root
        .call(
            Method::PUT,
            "/api/admin/site",
            Some(json!({"promo_video_url": "https://youtu.be/dQw4w9WgXcQ"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{v}");
    let mut guest = root.other();
    let (_, site) = guest.call(Method::GET, "/api/public/site", None).await;
    assert_eq!(site["promo_video"]["provider"], "youtube");
    assert!(site["promo_video"]["embed_url"]
        .as_str()
        .unwrap()
        .starts_with("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"));
    root.call(
        Method::PUT,
        "/api/admin/site",
        Some(json!({"promo_video_url": ""})),
    )
    .await;
    let (_, site) = guest.call(Method::GET, "/api/public/site", None).await;
    assert!(site["promo_video"].is_null());
}
