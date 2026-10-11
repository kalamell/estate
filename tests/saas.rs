//! ทดสอบการแยกข้อมูลระหว่างองค์กร สิทธิ์ผู้ใช้ และขีดจำกัดแพ็กเกจ

mod common;

use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{json, Value};

fn property(name: &str, kind: &str) -> Value {
    json!({"name": name, "kind": kind, "address": "", "lat": 13.7, "lng": 100.5})
}

#[tokio::test]
async fn organizations_are_isolated() {
    let mut a = setup().await;
    a.register("a@test.local", "Org A").await;
    let (st, prop) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("A Dorm", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::OK, "{prop}");
    let pid = prop["id"].as_i64().unwrap();

    let mut b = a.other();
    b.register("b@test.local", "Org B").await;
    let (_, list) = b.call(Method::GET, "/api/properties", None).await;
    assert_eq!(list.as_array().unwrap().len(), 0);
    let (st, _) = b
        .call(Method::GET, &format!("/api/properties/{pid}"), None)
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = b
        .call(
            Method::POST,
            "/api/units",
            Some(json!({"property_id": pid, "name": "101"})),
        )
        .await;
    assert_eq!(st, StatusCode::NOT_FOUND);

    // ใช้ X-Org-Id ขององค์กรอื่นไม่ได้
    b.org = a.org;
    let (st, _) = b.call(Method::GET, "/api/properties", None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn package_limits_and_features_are_enforced() {
    let mut a = setup().await;
    a.register("a@test.local", "Org A").await;
    let (_, org) = a.call(Method::GET, "/api/org", None).await;
    assert_eq!(org["package"]["name"], "Starter");
    assert_eq!(org["org"]["status"], "trial");

    let (st, _) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("One", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, err) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("Two", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED);
    assert_eq!(err["code"], "limit_reached");

    let (st, err) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("Stay", "short_stay")),
        )
        .await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED);
    assert_eq!(err["code"], "feature_unavailable");
}

#[tokio::test]
async fn staff_cannot_manage_properties() {
    let mut owner = setup().await;
    owner.register("owner@test.local", "Org").await;
    let (st, body) = owner
        .call(
            Method::POST,
            "/api/org/members",
            Some(json!({"email": "staff@test.local", "name": "Staff", "password": "password123", "role": "staff"})),
        )
        .await;
    // แพ็กเกจ Starter มีผู้ใช้ได้ 1 คน
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED, "{body}");

    let mut root = owner.other();
    root.call(
        Method::POST,
        "/api/auth/login",
        Some(json!({"email": "root@test.local", "password": "password123"})),
    )
    .await;
    let (_, packages) = root.call(Method::GET, "/api/admin/packages", None).await;
    let pro = packages
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "Pro")
        .unwrap()["id"]
        .clone();
    let org_id = owner.org.unwrap();
    let (st, _) = root
        .call(
            Method::PUT,
            &format!("/api/admin/orgs/{org_id}"),
            Some(json!({"package_id": pro, "status": "active"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);

    let (st, _) = owner
        .call(
            Method::POST,
            "/api/org/members",
            Some(json!({"email": "staff@test.local", "name": "Staff", "password": "password123", "role": "staff"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);

    let mut staff = owner.other();
    let (_, me) = staff
        .call(
            Method::POST,
            "/api/auth/login",
            Some(json!({"email": "staff@test.local", "password": "password123"})),
        )
        .await;
    staff.org = me["orgs"][0]["id"].as_i64();
    let (st, _) = staff
        .call(
            Method::POST,
            "/api/properties",
            Some(property("X", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = staff
        .call(
            Method::POST,
            "/api/tenants",
            Some(json!({"full_name": "ผู้เช่า"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
}

#[tokio::test]
async fn super_admin_controls_subscription() {
    let mut a = setup().await;
    a.register("a@test.local", "Org A").await;
    let (st, _) = a.call(Method::GET, "/api/admin/packages", None).await;
    assert_eq!(st, StatusCode::FORBIDDEN);

    let mut root = a.other();
    root.call(
        Method::POST,
        "/api/auth/login",
        Some(json!({"email": "root@test.local", "password": "password123"})),
    )
    .await;
    let org_id = a.org.unwrap();
    let (st, _) = root
        .call(
            Method::PUT,
            &format!("/api/admin/orgs/{org_id}"),
            Some(json!({"status": "suspended"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);

    // ถูกระงับ: อ่านได้ เขียนไม่ได้
    let (st, _) = a.call(Method::GET, "/api/properties", None).await;
    assert_eq!(st, StatusCode::OK);
    let (st, err) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("One", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED);
    assert_eq!(err["code"], "subscription_inactive");

    // หมดอายุ
    let (st, _) = root
        .call(
            Method::PUT,
            &format!("/api/admin/orgs/{org_id}"),
            Some(json!({"status": "active", "ends_at": "2000-01-01"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("One", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::PAYMENT_REQUIRED);
    let (_, _) = root
        .call(
            Method::PUT,
            &format!("/api/admin/orgs/{org_id}"),
            Some(json!({"ends_at": null})),
        )
        .await;
    let (st, _) = a
        .call(
            Method::POST,
            "/api/properties",
            Some(property("One", "dormitory")),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
}

#[tokio::test]
async fn login_logout_flow() {
    let mut a = setup().await;
    a.register("a@test.local", "Org A").await;
    let (st, _) = a.call(Method::POST, "/api/auth/logout", None).await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = a.call(Method::GET, "/api/auth/me", None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    let (st, _) = a
        .call(
            Method::POST,
            "/api/auth/login",
            Some(json!({"email": "a@test.local", "password": "wrong-pass"})),
        )
        .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, me) = a
        .call(
            Method::POST,
            "/api/auth/login",
            Some(json!({"email": "A@test.local", "password": "password123"})),
        )
        .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(me["orgs"].as_array().unwrap().len(), 1);
}
