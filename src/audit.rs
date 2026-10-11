//! บันทึกการใช้งาน (ใคร ทำอะไร กับข้อมูลใด เมื่อไร) — ใช้ตรวจสอบย้อนหลังและประกอบการปฏิบัติตาม PDPA

use serde_json::Value;
use sqlx::SqlitePool;

use crate::auth::OrgCtx;

#[allow(clippy::too_many_arguments)] // ฟังก์ชันบันทึกตรงไปตรงมา แยก struct แล้วอ่านยากกว่า
pub async fn log(
    db: &SqlitePool,
    org_id: Option<i64>,
    user_id: Option<i64>,
    ip: Option<&str>,
    action: &str,
    entity: &str,
    entity_id: Option<i64>,
    detail: Option<Value>,
) {
    let r = sqlx::query(
        "INSERT INTO audit_logs (org_id, user_id, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(org_id)
    .bind(user_id)
    .bind(action)
    .bind(entity)
    .bind(entity_id)
    .bind(detail.map(|d| d.to_string()))
    .bind(ip)
    .execute(db)
    .await;
    if let Err(e) = r {
        tracing::warn!(error = %e, action, "บันทึก audit log ไม่สำเร็จ");
    }
}

/// บันทึกการกระทำของผู้ใช้ในองค์กร
pub async fn record(
    db: &SqlitePool,
    ctx: &OrgCtx,
    action: &str,
    entity: &str,
    entity_id: Option<i64>,
    detail: Option<Value>,
) {
    log(
        db,
        Some(ctx.org_id),
        Some(ctx.user.id),
        ctx.ip.as_deref(),
        action,
        entity,
        entity_id,
        detail,
    )
    .await;
}
