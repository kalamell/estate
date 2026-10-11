//! กฎราคาตามฤดูกาล/วันหยุด/วันในสัปดาห์ และใบเสนอราคาห้องพักรายวัน

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{Duration, NaiveDate};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::validate_in;
use crate::{
    auth::{ensure_property, ensure_unit, OrgCtx},
    error::{AppError, AppResult},
    pricing::{self, Quote, Rule},
    AppState,
};

const SELECT: &str =
    "SELECT r.id, r.property_id, r.unit_id, u.name AS unit_name, r.name, r.rule_type, r.start_date,
        r.end_date, r.weekdays, r.adjustment, r.value, r.min_nights, r.priority, r.active
    FROM rate_rules r LEFT JOIN units u ON u.id = r.unit_id";

pub(crate) async fn rules_for_property(db: &SqlitePool, property_id: i64) -> AppResult<Vec<Rule>> {
    Ok(sqlx::query_as(&format!(
        "{SELECT} WHERE r.property_id = ? ORDER BY r.rule_type DESC, r.priority DESC, r.id"
    ))
    .bind(property_id)
    .fetch_all(db)
    .await?)
}

/// ใบเสนอราคาของห้อง (ใช้ทั้งหน้าจองสาธารณะและตอนสร้างการจอง)
pub(crate) async fn quote_unit(
    db: &SqlitePool,
    unit_id: i64,
    check_in: NaiveDate,
    check_out: NaiveDate,
) -> AppResult<Quote> {
    if check_out <= check_in || (check_out - check_in).num_days() > 366 {
        return Err(AppError::BadRequest("ช่วงวันที่ไม่ถูกต้อง".into()));
    }
    let (property_id, base): (i64, f64) =
        sqlx::query_as("SELECT property_id, rate_daily FROM units WHERE id = ?")
            .bind(unit_id)
            .fetch_one(db)
            .await?;
    let rules = rules_for_property(db, property_id).await?;
    Ok(pricing::quote(base, &rules, unit_id, check_in, check_out))
}

pub(crate) async fn prices_for(
    db: &SqlitePool,
    unit_ids: &[(i64, f64)],
    property_id: i64,
    from: NaiveDate,
    to: NaiveDate,
) -> AppResult<Vec<(i64, Vec<pricing::Night>)>> {
    if to <= from || (to - from).num_days() > 400 {
        return Err(AppError::BadRequest("ช่วงวันที่ไม่ถูกต้อง".into()));
    }
    let rules = rules_for_property(db, property_id).await?;
    let days = (to - from).num_days();
    Ok(unit_ids
        .iter()
        .map(|(id, base)| {
            (
                *id,
                (0..days)
                    .map(|i| pricing::night_price(*base, &rules, *id, from + Duration::days(i)))
                    .collect(),
            )
        })
        .collect())
}

#[derive(Deserialize)]
pub struct PropertyQuery {
    property_id: Option<i64>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<PropertyQuery>,
) -> AppResult<Json<Vec<Rule>>> {
    Ok(Json(
        sqlx::query_as(&format!(
            "{SELECT} WHERE r.org_id = ?1 AND (?2 IS NULL OR r.property_id = ?2)
             ORDER BY r.property_id, r.rule_type DESC, r.priority DESC, r.id"
        ))
        .bind(ctx.org_id)
        .bind(q.property_id)
        .fetch_all(&s.db)
        .await?,
    ))
}

#[derive(Deserialize)]
pub struct RuleInput {
    property_id: i64,
    unit_id: Option<i64>,
    name: String,
    rule_type: String,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    #[serde(default)]
    weekdays: Vec<u32>,
    #[serde(default = "percent")]
    adjustment: String,
    value: f64,
    min_nights: Option<i64>,
    #[serde(default)]
    priority: i64,
    #[serde(default = "yes")]
    active: bool,
}

fn percent() -> String {
    "percent".into()
}

fn yes() -> bool {
    true
}

async fn validate(s: &AppState, ctx: &OrgCtx, r: &RuleInput) -> AppResult<()> {
    ctx.require_admin()?;
    ctx.require_feature(ctx.features.short_stay, "ราคาตามฤดูกาล")?;
    ensure_property(&s.db, ctx.org_id, r.property_id).await?;
    if let Some(u) = r.unit_id {
        let pid: i64 = sqlx::query_scalar("SELECT property_id FROM units WHERE id = ?")
            .bind(u)
            .fetch_one(&s.db)
            .await?;
        if pid != r.property_id {
            return Err(AppError::BadRequest("ห้องไม่ได้อยู่ในโครงการนี้".into()));
        }
    }
    validate_in("rule_type", &r.rule_type, &["night", "length"])?;
    validate_in("adjustment", &r.adjustment, &["fixed", "percent", "amount"])?;
    if r.name.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาตั้งชื่อกฎ".into()));
    }
    if r.weekdays.iter().any(|d| *d > 6) {
        return Err(AppError::BadRequest("วันในสัปดาห์ต้องเป็น 0–6".into()));
    }
    if matches!((r.start_date, r.end_date), (Some(s), Some(e)) if e < s) {
        return Err(AppError::BadRequest("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม".into()));
    }
    match r.rule_type.as_str() {
        "length" if !(r.min_nights.is_some_and(|m| m >= 2) && (0.0..=100.0).contains(&r.value)) => {
            Err(AppError::BadRequest(
                "ส่วนลดพักหลายคืนต้องมีจำนวนคืนขั้นต่ำ ≥ 2 และส่วนลด 0–100%".into(),
            ))
        }
        "night" if r.adjustment == "fixed" && r.value < 0.0 => {
            Err(AppError::BadRequest("ราคาต้องไม่ติดลบ".into()))
        }
        "night" if r.adjustment == "percent" && r.value <= -100.0 => {
            Err(AppError::BadRequest("ลดได้ไม่เกิน 100%".into()))
        }
        _ => Ok(()),
    }
}

async fn save(s: &AppState, ctx: &OrgCtx, id: Option<i64>, r: RuleInput) -> AppResult<Rule> {
    validate(s, ctx, &r).await?;
    let sql = match id {
        Some(_) => {
            "UPDATE rate_rules SET property_id=?, unit_id=?, name=?, rule_type=?, start_date=?, end_date=?, weekdays=?,
                adjustment=?, value=?, min_nights=?, priority=?, active=? WHERE id=? AND org_id=? RETURNING id"
        }
        None => {
            "INSERT INTO rate_rules (property_id, unit_id, name, rule_type, start_date, end_date, weekdays, adjustment,
                value, min_nights, priority, active, org_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id"
        }
    };
    let mut weekdays = r.weekdays.clone();
    weekdays.sort_unstable();
    weekdays.dedup();
    let mut q = sqlx::query_scalar::<_, i64>(sql)
        .bind(r.property_id)
        .bind(r.unit_id)
        .bind(r.name.trim())
        .bind(&r.rule_type)
        .bind(r.start_date)
        .bind(r.end_date)
        .bind(sqlx::types::Json(weekdays))
        .bind(&r.adjustment)
        .bind(r.value)
        .bind(r.min_nights)
        .bind(r.priority)
        .bind(r.active);
    q = match id {
        Some(id) => q.bind(id).bind(ctx.org_id),
        None => q.bind(ctx.org_id),
    };
    let id = q.fetch_optional(&s.db).await?.ok_or(AppError::NotFound)?;
    Ok(sqlx::query_as(&format!("{SELECT} WHERE r.id = ?"))
        .bind(id)
        .fetch_one(&s.db)
        .await?)
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(r): Json<RuleInput>,
) -> AppResult<Json<Rule>> {
    Ok(Json(save(&s, &ctx, None, r).await?))
}

pub async fn update(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(r): Json<RuleInput>,
) -> AppResult<Json<Rule>> {
    Ok(Json(save(&s, &ctx, Some(id), r).await?))
}

pub async fn delete(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let r = sqlx::query("DELETE FROM rate_rules WHERE id = ? AND org_id = ?")
        .bind(id)
        .bind(ctx.org_id)
        .execute(&s.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({})))
}

#[derive(Deserialize)]
pub struct QuoteQuery {
    check_in: NaiveDate,
    check_out: NaiveDate,
}

pub async fn unit_quote(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(unit_id): Path<i64>,
    Query(q): Query<QuoteQuery>,
) -> AppResult<Json<Quote>> {
    ensure_unit(&s.db, ctx.org_id, unit_id).await?;
    Ok(Json(
        quote_unit(&s.db, unit_id, q.check_in, q.check_out).await?,
    ))
}

#[derive(Deserialize)]
pub struct RangeQuery {
    from: NaiveDate,
    to: NaiveDate,
}

pub async fn unit_prices(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(unit_id): Path<i64>,
    Query(q): Query<RangeQuery>,
) -> AppResult<Json<Value>> {
    ensure_unit(&s.db, ctx.org_id, unit_id).await?;
    let (property_id, base): (i64, f64) =
        sqlx::query_as("SELECT property_id, rate_daily FROM units WHERE id = ?")
            .bind(unit_id)
            .fetch_one(&s.db)
            .await?;
    let prices = prices_for(&s.db, &[(unit_id, base)], property_id, q.from, q.to).await?;
    Ok(Json(
        json!({ "prices": prices.into_iter().next().map(|(_, n)| n).unwrap_or_default() }),
    ))
}
