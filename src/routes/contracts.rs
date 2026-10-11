//! สัญญาเช่าอิเล็กทรอนิกส์
//!
//! แม่แบบ (มีตัวแปร {{...}}) → สร้างสัญญาจากการจอง → แก้ไขได้ระหว่างร่าง → ส่งให้ผู้เช่า (ล็อกเนื้อหา + เก็บ hash)
//! → ผู้เช่าลงนามในพอร์ทัล (ลายเซ็น ชื่อ เวลา IP อุปกรณ์) → ผู้ให้เช่าลงนาม → ฉบับสมบูรณ์
//!
//! พ.ร.บ.ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ฯ รับรองลายมือชื่ออิเล็กทรอนิกส์ที่ระบุตัวผู้ลงนามได้และเชื่อถือได้
//! ระบบจึงเก็บหลักฐานประกอบการลงนามไว้ทุกครั้ง — แม่แบบตั้งต้นเป็นร่างตัวอย่าง ควรให้ทนายตรวจก่อนใช้งานจริง

use std::collections::BTreeMap;

use axum::{
    extract::{Multipart, Path, Query, State},
    http::HeaderMap,
    Json,
};
use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use super::validate_in;
use crate::{
    audit,
    auth::{ClientIp, OrgCtx},
    docs::{self, DocType},
    error::{AppError, AppResult},
    line, thai, uploads, AppState,
};

pub const KINDS: &[&str] = &["lease", "short_stay", "other"];

/// ตัวแปรที่ใช้ในแม่แบบได้ (ชื่อ, คำอธิบาย)
pub const PLACEHOLDERS: &[(&str, &str)] = &[
    ("contract_no", "เลขที่สัญญา"),
    ("today", "วันที่ทำสัญญา"),
    ("org_name", "ชื่อผู้ให้เช่า (นิติบุคคล/ชื่อองค์กร)"),
    ("org_tax_id", "เลขประจำตัวผู้เสียภาษีผู้ให้เช่า"),
    ("org_address", "ที่อยู่ผู้ให้เช่า"),
    ("org_phone", "โทรศัพท์ผู้ให้เช่า"),
    ("tenant_name", "ชื่อผู้เช่า"),
    ("tenant_id_card", "เลขบัตรประชาชน/หนังสือเดินทางผู้เช่า"),
    ("tenant_phone", "โทรศัพท์ผู้เช่า"),
    ("tenant_address", "ที่อยู่ผู้เช่า"),
    ("property_name", "ชื่อโครงการ"),
    ("property_address", "ที่ตั้งโครงการ"),
    ("unit_name", "เลขห้อง"),
    ("floor", "ชั้น"),
    ("start_date", "วันเริ่มเช่า"),
    ("end_date", "วันสิ้นสุดสัญญา"),
    ("term", "ระยะเวลาเช่า"),
    ("rent", "ค่าเช่า (ตัวเลข)"),
    ("rent_text", "ค่าเช่า (ตัวอักษร)"),
    ("deposit", "เงินประกัน (ตัวเลข)"),
    ("deposit_text", "เงินประกัน (ตัวอักษร)"),
    ("electric_rate", "ค่าไฟฟ้าต่อหน่วย"),
    ("water_rate", "ค่าน้ำต่อหน่วย"),
    ("today_en", "วันที่ทำสัญญา (อังกฤษ)"),
    ("start_date_en", "วันเริ่มเช่า (อังกฤษ)"),
    ("end_date_en", "วันสิ้นสุดสัญญา (อังกฤษ)"),
    ("term_en", "ระยะเวลาเช่า (อังกฤษ)"),
];

const DEFAULT_LEASE_EN: &str = "RESIDENTIAL LEASE AGREEMENT
No. {{contract_no}}

Made at {{property_name}} on {{today_en}}

This agreement is made between {{org_name}}, address {{org_address}} (the \"Landlord\"), and {{tenant_name}}, ID/passport no. {{tenant_id_card}}, address {{tenant_address}}, phone {{tenant_phone}} (the \"Tenant\"). The parties agree as follows.

1. Premises
The Landlord lets and the Tenant rents room {{unit_name}}, floor {{floor}}, at {{property_name}}, {{property_address}}, for residential use only.

2. Term
{{term_en}}, from {{start_date_en}} to {{end_date_en}}.

3. Rent and utilities
The Tenant shall pay rent of {{rent}} Baht per month by the due date stated on each invoice. Electricity is charged at {{electric_rate}} Baht per unit and water at {{water_rate}} Baht per unit, according to the meters.

4. Deposit
The Tenant has paid a security deposit of {{deposit}} Baht. The Landlord will return the deposit after the lease ends and the room is handed back, less any documented damage or unpaid amounts, with a written statement of deductions, within the period required by law.

5. Tenant's obligations
5.1 Use the room for living only and take reasonable care of it.
5.2 Make no alterations without the Landlord's written consent.
5.3 Not sublet or assign the lease.
5.4 Follow the building rules and not disturb others or act unlawfully.

6. Termination
If either party breaches this agreement, the other party may give notice to remedy the breach within a reasonable time and, if it is not remedied, terminate the agreement as permitted by law.

7. Communication
Invoices, receipts and notices delivered through the tenant portal or the LINE account linked by the Tenant have the same effect as written notice.

8. Language
This agreement may be made in Thai and English. If there is any inconsistency, the Thai version prevails.

Both parties have read and understood this agreement and sign it electronically below.";

const DEFAULT_LEASE: &str = "สัญญาเช่าห้องพักอาศัย
เลขที่ {{contract_no}}

ทำที่ {{property_name}} เมื่อวันที่ {{today}}

สัญญานี้ทำขึ้นระหว่าง {{org_name}} ที่อยู่ {{org_address}} ซึ่งต่อไปเรียกว่า \"ผู้ให้เช่า\" ฝ่ายหนึ่ง กับ {{tenant_name}} เลขบัตรประจำตัว {{tenant_id_card}} ที่อยู่ {{tenant_address}} โทรศัพท์ {{tenant_phone}} ซึ่งต่อไปเรียกว่า \"ผู้เช่า\" อีกฝ่ายหนึ่ง ทั้งสองฝ่ายตกลงกันดังนี้

ข้อ 1 ทรัพย์ที่เช่า
ผู้ให้เช่าตกลงให้เช่าและผู้เช่าตกลงเช่าห้องเลขที่ {{unit_name}} ชั้น {{floor}} ของ {{property_name}} ตั้งอยู่ที่ {{property_address}} เพื่อใช้เป็นที่พักอาศัย

ข้อ 2 ระยะเวลาเช่า
มีกำหนด {{term}} เริ่มตั้งแต่วันที่ {{start_date}} ถึงวันที่ {{end_date}}

ข้อ 3 ค่าเช่าและค่าบริการ
ผู้เช่าตกลงชำระค่าเช่าเดือนละ {{rent}} บาท ({{rent_text}}) ตามใบแจ้งหนี้ที่ผู้ให้เช่าออกให้ภายในวันครบกำหนดที่ระบุในใบแจ้งหนี้ ค่าไฟฟ้าคิดหน่วยละ {{electric_rate}} บาท ค่าน้ำประปาคิดหน่วยละ {{water_rate}} บาท ตามที่ใช้จริงจากมาตรวัด

ข้อ 4 เงินประกัน
ผู้เช่าได้วางเงินประกันการเช่าจำนวน {{deposit}} บาท ({{deposit_text}}) ผู้ให้เช่าจะคืนเงินประกันเมื่อสัญญาสิ้นสุดและผู้เช่าส่งมอบห้องคืนแล้ว โดยหักค่าเสียหายหรือหนี้ค้างชำระที่มีหลักฐาน พร้อมแจ้งรายละเอียดการหักให้ผู้เช่าทราบเป็นลายลักษณ์อักษร ภายในระยะเวลาที่กฎหมายกำหนด

ข้อ 5 หน้าที่ของผู้เช่า
5.1 ใช้ห้องเพื่อพักอาศัยเท่านั้น ดูแลรักษาทรัพย์สินเสมือนวิญญูชนจะพึงรักษาทรัพย์สินของตนเอง
5.2 ไม่ดัดแปลงต่อเติมห้องโดยไม่ได้รับความยินยอมเป็นหนังสือจากผู้ให้เช่า
5.3 ไม่ให้ผู้อื่นเช่าช่วงหรือโอนสิทธิการเช่า
5.4 ปฏิบัติตามระเบียบของอาคาร และไม่กระทำการใดที่ผิดกฎหมายหรือรบกวนผู้อื่น

ข้อ 6 การบอกเลิกสัญญา
หากฝ่ายใดผิดสัญญาข้อหนึ่งข้อใด อีกฝ่ายมีสิทธิบอกกล่าวให้แก้ไขภายในเวลาอันสมควร หากไม่แก้ไขจึงบอกเลิกสัญญาได้ ทั้งนี้ตามที่กฎหมายกำหนด

ข้อ 7 การติดต่อสื่อสาร
คู่สัญญาตกลงให้การแจ้งใบแจ้งหนี้ ใบเสร็จ และการบอกกล่าวต่าง ๆ ผ่านพอร์ทัลผู้เช่าหรือ LINE ที่ผู้เช่าได้เชื่อมต่อไว้ มีผลเช่นเดียวกับการแจ้งเป็นหนังสือ

คู่สัญญาได้อ่านและเข้าใจข้อความในสัญญานี้โดยตลอดแล้ว จึงได้ลงลายมือชื่ออิเล็กทรอนิกส์ไว้เป็นสำคัญ";

/// สร้างแม่แบบตั้งต้นให้องค์กรที่ยังไม่มี
async fn ensure_default(db: &SqlitePool, org_id: i64) -> AppResult<()> {
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM contract_templates WHERE org_id = ?")
        .bind(org_id)
        .fetch_one(db)
        .await?;
    if n == 0 {
        sqlx::query(
            "INSERT INTO contract_templates (org_id, name, kind, body, is_default)
             VALUES (?1, 'สัญญาเช่าห้องพัก (ร่างตัวอย่าง)', 'lease', ?2, 1),
                    (?1, 'Residential Lease (English draft)', 'lease', ?3, 0)",
        )
        .bind(org_id)
        .bind(DEFAULT_LEASE)
        .bind(DEFAULT_LEASE_EN)
        .execute(db)
        .await?;
    }
    Ok(())
}

/// แทนค่าตัวแปร {{name}} — คืนข้อความและรายชื่อตัวแปรที่ไม่รู้จัก
pub fn render(template: &str, vars: &BTreeMap<&str, String>) -> (String, Vec<String>) {
    let mut out = String::with_capacity(template.len());
    let mut unknown = Vec::new();
    let mut rest = template;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find("}}") {
            Some(end) => {
                let key = after[..end].trim();
                match vars.get(key) {
                    Some(v) => out.push_str(v),
                    None => {
                        out.push_str(&rest[start..start + 2 + end + 2]);
                        if !unknown.iter().any(|u| u == key) {
                            unknown.push(key.to_string());
                        }
                    }
                }
                rest = &after[end + 2..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    (out, unknown)
}

fn term_text_en(start: NaiveDate, end: Option<NaiveDate>) -> String {
    let Some(end) = end else {
        return "Month-to-month, no fixed term".into();
    };
    let days = (end - start).num_days();
    let months = ((days as f64) / 30.4).round() as i64;
    let plural = |n: i64, unit: &str| format!("{n} {unit}{}", if n == 1 { "" } else { "s" });
    if months >= 1 {
        if months % 12 == 0 {
            plural(months / 12, "year")
        } else {
            plural(months, "month")
        }
    } else {
        plural(days, "day")
    }
}

fn long_date_en(d: NaiveDate) -> String {
    d.format("%-d %B %Y").to_string()
}

fn term_text(start: NaiveDate, end: Option<NaiveDate>) -> String {
    let Some(end) = end else {
        return "ไม่มีกำหนดระยะเวลา (รายเดือน)".into();
    };
    let days = (end - start).num_days();
    let months = ((days as f64) / 30.4).round() as i64;
    if months >= 1 {
        if months % 12 == 0 {
            format!("{} ปี", months / 12)
        } else {
            format!("{months} เดือน")
        }
    } else {
        format!("{days} วัน")
    }
}

#[derive(sqlx::FromRow)]
struct BookingVars {
    tenant_id: i64,
    start_date: NaiveDate,
    end_date: Option<NaiveDate>,
    price: f64,
    deposit_amount: f64,
    unit_name: String,
    floor: i64,
    property_name: String,
    property_address: String,
    electric_rate: f64,
    water_rate: f64,
    tenant_name: String,
    tenant_id_card: String,
    tenant_phone: String,
    tenant_address: String,
}

async fn variables(
    db: &SqlitePool,
    org_id: i64,
    booking_id: i64,
    contract_no: &str,
) -> AppResult<(i64, BTreeMap<&'static str, String>)> {
    let b: BookingVars = sqlx::query_as(
        "SELECT b.tenant_id, b.start_date, b.end_date, b.price, b.deposit_amount, u.name AS unit_name, u.floor,
                p.name AS property_name, p.address AS property_address, p.electric_rate, p.water_rate,
                t.full_name AS tenant_name, t.id_card AS tenant_id_card, t.phone AS tenant_phone,
                t.address AS tenant_address
         FROM bookings b JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
         JOIN tenants t ON t.id = b.tenant_id
         WHERE b.id = ? AND p.org_id = ?",
    )
    .bind(booking_id)
    .bind(org_id)
    .fetch_optional(db)
    .await?
    .ok_or(AppError::NotFound)?;
    let issuer = docs::load_issuer(db, org_id).await?;
    let dash = |v: &str| {
        if v.trim().is_empty() {
            "-".to_string()
        } else {
            v.trim().to_string()
        }
    };
    let mut v = BTreeMap::new();
    v.insert("contract_no", contract_no.to_string());
    v.insert("today", thai::long_date(Local::now().date_naive()));
    v.insert("org_name", issuer.legal_name.clone());
    v.insert("org_tax_id", dash(&issuer.tax_id));
    v.insert("org_address", dash(&issuer.address));
    v.insert("org_phone", dash(&issuer.phone));
    v.insert("tenant_name", b.tenant_name);
    v.insert("tenant_id_card", dash(&b.tenant_id_card));
    v.insert("tenant_phone", dash(&b.tenant_phone));
    v.insert("tenant_address", dash(&b.tenant_address));
    v.insert("property_name", b.property_name);
    v.insert("property_address", dash(&b.property_address));
    v.insert("unit_name", b.unit_name);
    v.insert("floor", b.floor.to_string());
    v.insert("start_date", thai::long_date(b.start_date));
    v.insert(
        "end_date",
        b.end_date
            .map(thai::long_date)
            .unwrap_or_else(|| "ไม่มีกำหนด".into()),
    );
    v.insert("term", term_text(b.start_date, b.end_date));
    v.insert("term_en", term_text_en(b.start_date, b.end_date));
    v.insert("today_en", long_date_en(Local::now().date_naive()));
    v.insert("start_date_en", long_date_en(b.start_date));
    v.insert(
        "end_date_en",
        b.end_date
            .map(long_date_en)
            .unwrap_or_else(|| "no fixed end date".into()),
    );
    v.insert("rent", thai::money(b.price));
    v.insert("rent_text", thai::baht_text(b.price));
    v.insert("deposit", thai::money(b.deposit_amount));
    v.insert("deposit_text", thai::baht_text(b.deposit_amount));
    v.insert("electric_rate", thai::money(b.electric_rate));
    v.insert("water_rate", thai::money(b.water_rate));
    Ok((b.tenant_id, v))
}

fn hash(title: &str, body: &str) -> String {
    hex::encode(Sha256::digest(format!("{title}\n{body}").as_bytes()))
}

// ---------- แม่แบบ ----------

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Template {
    id: i64,
    name: String,
    kind: String,
    body: String,
    is_default: bool,
    updated_at: String,
}

pub async fn templates(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    ensure_default(&s.db, ctx.org_id).await?;
    let rows: Vec<Template> = sqlx::query_as(
        "SELECT id, name, kind, body, is_default, updated_at FROM contract_templates WHERE org_id = ?
         ORDER BY is_default DESC, name",
    )
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(json!({
        "templates": rows,
        "placeholders": PLACEHOLDERS.iter().map(|(k, d)| json!({ "key": k, "label": d })).collect::<Vec<_>>(),
    })))
}

#[derive(Deserialize)]
pub struct TemplateInput {
    name: String,
    #[serde(default = "lease")]
    kind: String,
    body: String,
    #[serde(default)]
    is_default: bool,
}

fn lease() -> String {
    "lease".into()
}

async fn save_template(
    s: &AppState,
    ctx: &OrgCtx,
    id: Option<i64>,
    t: TemplateInput,
) -> AppResult<Template> {
    ctx.require_admin()?;
    validate_in("kind", &t.kind, KINDS)?;
    if t.name.trim().is_empty() || t.body.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อและเนื้อหาแม่แบบ".into()));
    }
    let known: BTreeMap<&str, String> = PLACEHOLDERS
        .iter()
        .map(|(k, _)| (*k, String::new()))
        .collect();
    let (_, unknown) = render(&t.body, &known);
    if !unknown.is_empty() {
        return Err(AppError::BadRequest(format!(
            "ไม่รู้จักตัวแปร: {}",
            unknown
                .iter()
                .map(|u| format!("{{{{{u}}}}}"))
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }
    let mut tx = s.db.begin().await?;
    if t.is_default {
        sqlx::query("UPDATE contract_templates SET is_default = 0 WHERE org_id = ?")
            .bind(ctx.org_id)
            .execute(&mut *tx)
            .await?;
    }
    let id: i64 = match id {
        Some(id) => sqlx::query_scalar(
            "UPDATE contract_templates SET name = ?, kind = ?, body = ?, is_default = ?, updated_at = datetime('now')
             WHERE id = ? AND org_id = ? RETURNING id",
        )
        .bind(t.name.trim())
        .bind(&t.kind)
        .bind(&t.body)
        .bind(t.is_default)
        .bind(id)
        .bind(ctx.org_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(AppError::NotFound)?,
        None => sqlx::query_scalar(
            "INSERT INTO contract_templates (org_id, name, kind, body, is_default) VALUES (?,?,?,?,?) RETURNING id",
        )
        .bind(ctx.org_id)
        .bind(t.name.trim())
        .bind(&t.kind)
        .bind(&t.body)
        .bind(t.is_default)
        .fetch_one(&mut *tx)
        .await?,
    };
    tx.commit().await?;
    Ok(sqlx::query_as(
        "SELECT id, name, kind, body, is_default, updated_at FROM contract_templates WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?)
}

pub async fn create_template(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(t): Json<TemplateInput>,
) -> AppResult<Json<Template>> {
    Ok(Json(save_template(&s, &ctx, None, t).await?))
}

pub async fn update_template(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(t): Json<TemplateInput>,
) -> AppResult<Json<Template>> {
    Ok(Json(save_template(&s, &ctx, Some(id), t).await?))
}

pub async fn delete_template(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let n = sqlx::query("DELETE FROM contract_templates WHERE id = ? AND org_id = ?")
        .bind(id)
        .bind(ctx.org_id)
        .execute(&s.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({})))
}

// ---------- สัญญา ----------

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Contract {
    id: i64,
    booking_id: i64,
    tenant_id: Option<i64>,
    tenant_name: Option<String>,
    tenant_line_linked: bool,
    unit_name: String,
    property_name: String,
    template_id: Option<i64>,
    doc_no: String,
    title: String,
    body: String,
    content_hash: Option<String>,
    status: String,
    sent_at: Option<String>,
    tenant_signature_url: Option<String>,
    tenant_signed_name: Option<String>,
    tenant_signed_at: Option<String>,
    tenant_signed_ip: Option<String>,
    tenant_signed_ua: Option<String>,
    landlord_signature_url: Option<String>,
    landlord_signed_name: Option<String>,
    landlord_signed_at: Option<String>,
    void_reason: Option<String>,
    created_at: String,
}

const SELECT: &str = "SELECT c.id, c.booking_id, c.tenant_id, t.full_name AS tenant_name,
        (t.line_user_id IS NOT NULL) AS tenant_line_linked, u.name AS unit_name, p.name AS property_name,
        c.template_id, c.doc_no, c.title, c.body, c.content_hash, c.status, c.sent_at, c.tenant_signature_url,
        c.tenant_signed_name, c.tenant_signed_at, c.tenant_signed_ip, c.tenant_signed_ua, c.landlord_signature_url,
        c.landlord_signed_name, c.landlord_signed_at, c.void_reason, c.created_at
    FROM contracts c
    JOIN bookings b ON b.id = c.booking_id
    JOIN units u ON u.id = b.unit_id
    JOIN properties p ON p.id = u.property_id
    LEFT JOIN tenants t ON t.id = c.tenant_id";

async fn fetch(db: &SqlitePool, org_id: i64, id: i64) -> AppResult<Contract> {
    sqlx::query_as(&format!("{SELECT} WHERE c.id = ? AND c.org_id = ?"))
        .bind(id)
        .bind(org_id)
        .fetch_optional(db)
        .await?
        .ok_or(AppError::NotFound)
}

#[derive(Deserialize)]
pub struct ListQuery {
    booking_id: Option<i64>,
    tenant_id: Option<i64>,
    status: Option<String>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<Contract>>> {
    Ok(Json(
        sqlx::query_as(&format!(
            "{SELECT} WHERE c.org_id = ?1 AND (?2 IS NULL OR c.booking_id = ?2) AND (?3 IS NULL OR c.tenant_id = ?3)
               AND (?4 IS NULL OR c.status = ?4)
             ORDER BY c.id DESC LIMIT 300"
        ))
        .bind(ctx.org_id)
        .bind(q.booking_id)
        .bind(q.tenant_id)
        .bind(&q.status)
        .fetch_all(&s.db)
        .await?,
    ))
}

pub async fn get(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Contract>> {
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

#[derive(Deserialize)]
pub struct CreateInput {
    booking_id: i64,
    template_id: Option<i64>,
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(i): Json<CreateInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    ensure_default(&s.db, ctx.org_id).await?;
    let (template_id, name, body): (i64, String, String) = sqlx::query_as(
        "SELECT id, name, body FROM contract_templates WHERE org_id = ?1 AND (?2 IS NULL OR id = ?2)
         ORDER BY is_default DESC, id LIMIT 1",
    )
    .bind(ctx.org_id)
    .bind(i.template_id)
    .fetch_optional(&s.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let mut tx = s.db.begin().await?;
    let doc_no = docs::next_doc_no(
        &mut tx,
        ctx.org_id,
        DocType::Contract,
        Local::now().date_naive(),
    )
    .await?;
    let (tenant_id, vars) = variables(&s.db, ctx.org_id, i.booking_id, &doc_no).await?;
    let (rendered, unknown) = render(&body, &vars);
    let title = name.split(" (").next().unwrap_or(&name).trim().to_string();
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO contracts (org_id, booking_id, tenant_id, template_id, doc_no, title, body, created_by)
         VALUES (?,?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(ctx.org_id)
    .bind(i.booking_id)
    .bind(tenant_id)
    .bind(template_id)
    .bind(&doc_no)
    .bind(&title)
    .bind(&rendered)
    .bind(ctx.user.id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({
        "contract": fetch(&s.db, ctx.org_id, id).await?,
        "unknown_placeholders": unknown,
    })))
}

#[derive(Deserialize)]
pub struct EditInput {
    title: String,
    body: String,
}

pub async fn update(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(e): Json<EditInput>,
) -> AppResult<Json<Contract>> {
    ctx.require_admin()?;
    if e.title.trim().is_empty() || e.body.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อและเนื้อหาสัญญา".into()));
    }
    let n = sqlx::query(
        "UPDATE contracts SET title = ?, body = ? WHERE id = ? AND org_id = ? AND status = 'draft'",
    )
    .bind(e.title.trim())
    .bind(&e.body)
    .bind(id)
    .bind(ctx.org_id)
    .execute(&s.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::Conflict(
            "แก้ไขได้เฉพาะสัญญาที่ยังเป็นร่าง — ยกเลิกแล้วสร้างใหม่ถ้าต้องการแก้".into(),
        ));
    }
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

/// ส่งให้ผู้เช่าลงนาม: ล็อกเนื้อหา เก็บ hash และแจ้งทาง LINE (ถ้าเชื่อมไว้)
pub async fn send(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Contract>> {
    ctx.require_admin()?;
    let c = fetch(&s.db, ctx.org_id, id).await?;
    if c.status != "draft" {
        return Err(AppError::Conflict("ส่งสัญญานี้ไปแล้ว".into()));
    }
    let tenant_id = c
        .tenant_id
        .ok_or_else(|| AppError::BadRequest("สัญญานี้ไม่มีผู้เช่า".into()))?;
    sqlx::query(
        "UPDATE contracts SET status = 'sent', sent_at = datetime('now'), content_hash = ? WHERE id = ?",
    )
    .bind(hash(&c.title, &c.body))
    .bind(id)
    .execute(&s.db)
    .await?;
    audit::record(
        &s.db,
        &ctx,
        "contract.send",
        "contract",
        Some(id),
        Some(json!({ "doc_no": c.doc_no })),
    )
    .await;
    let (doc_no, title) = (c.doc_no.clone(), c.title.clone());
    line::spawn_auto(
        &s,
        ctx.org_id,
        |_| true,
        move |st, org| async move {
            let token: Option<String> =
                sqlx::query_scalar("SELECT portal_token FROM tenants WHERE id = ?")
                    .bind(tenant_id)
                    .fetch_one(&st.db)
                    .await?;
            let url = line::portal_url(
                &st,
                token.as_deref().unwrap_or(""),
                &format!("/contract/{id}"),
            );
            let lang = crate::i18n::tenant_lang(&st.db, tenant_id).await;
            let bubble = line::card(
                &org,
                lang.t("สัญญาเช่ารอลงนาม", "Lease ready to sign"),
                lang.t(
                    "กรุณาอ่านสัญญาและลงนามอิเล็กทรอนิกส์ในลิงก์ด้านล่าง",
                    "Please read your lease and sign it electronically using the link below.",
                ),
                vec![
                    (lang.t("สัญญา", "Contract").into(), title, false),
                    (lang.t("เลขที่", "No.").into(), doc_no, false),
                ],
                (lang.t("อ่านและลงนาม", "Read & sign"), &url),
            );
            line::push_to_tenant(
                &st,
                &org,
                tenant_id,
                "contract",
                vec![line::flex(
                    lang.t("สัญญาเช่ารอลงนาม", "Lease ready to sign"),
                    bubble,
                )],
                None,
            )
            .await
        },
    );
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

/// ผู้ให้เช่าลงนาม (multipart: signature, signed_name) หลังส่งสัญญาแล้ว
pub async fn landlord_sign(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    form: Multipart,
) -> AppResult<Json<Contract>> {
    ctx.require_admin()?;
    let c = fetch(&s.db, ctx.org_id, id).await?;
    if !matches!(c.status.as_str(), "sent" | "tenant_signed") || c.landlord_signed_at.is_some() {
        return Err(AppError::Conflict(
            "ลงนามได้หลังส่งสัญญาให้ผู้เช่าแล้ว และลงนามได้ครั้งเดียว".into(),
        ));
    }
    let form = uploads::parse_for(&s, ctx.org_id, form, "sign").await?;
    let signature = form
        .fields
        .get("signature_url")
        .cloned()
        .ok_or_else(|| AppError::BadRequest("กรุณาลงลายมือชื่อ".into()))?;
    let name = form
        .text("signed_name")
        .map(str::to_string)
        .unwrap_or_else(|| ctx.user.name.clone());
    sqlx::query(
        "UPDATE contracts SET landlord_signature_url = ?, landlord_signed_name = ?, landlord_signed_at = datetime('now'),
            landlord_signed_by = ?, status = CASE WHEN status = 'tenant_signed' THEN 'completed' ELSE status END
         WHERE id = ?",
    )
    .bind(&signature)
    .bind(&name)
    .bind(ctx.user.id)
    .bind(id)
    .execute(&s.db)
    .await?;
    audit::record(
        &s.db,
        &ctx,
        "contract.landlord_sign",
        "contract",
        Some(id),
        Some(json!({ "doc_no": c.doc_no })),
    )
    .await;
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

#[derive(Deserialize)]
pub struct VoidInput {
    reason: String,
}

pub async fn void(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(v): Json<VoidInput>,
) -> AppResult<Json<Contract>> {
    ctx.require_admin()?;
    let reason = v.reason.trim();
    if reason.is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุเหตุผล".into()));
    }
    let n = sqlx::query(
        "UPDATE contracts SET status = 'void', void_reason = ? WHERE id = ? AND org_id = ? AND status != 'void'",
    )
    .bind(reason)
    .bind(id)
    .bind(ctx.org_id)
    .execute(&s.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    audit::record(
        &s.db,
        &ctx,
        "contract.void",
        "contract",
        Some(id),
        Some(json!({ "reason": reason })),
    )
    .await;
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

// ---------- พอร์ทัลผู้เช่า ----------

async fn portal_tenant(db: &SqlitePool, token: &str) -> AppResult<(i64, i64)> {
    sqlx::query_as(
        "SELECT id, org_id FROM tenants WHERE portal_token = ? AND anonymized_at IS NULL",
    )
    .bind(token)
    .fetch_optional(db)
    .await?
    .ok_or(AppError::NotFound)
}

#[derive(Serialize, sqlx::FromRow)]
pub struct PortalContract {
    id: i64,
    doc_no: String,
    title: String,
    status: String,
    sent_at: Option<String>,
    tenant_signed_at: Option<String>,
}

/// สัญญาที่ส่งให้ผู้เช่าแล้ว (ไม่แสดงร่าง)
pub async fn for_tenant(db: &SqlitePool, tenant_id: i64) -> AppResult<Vec<PortalContract>> {
    Ok(sqlx::query_as(
        "SELECT id, doc_no, title, status, sent_at, tenant_signed_at FROM contracts
         WHERE tenant_id = ? AND status != 'draft' ORDER BY id DESC",
    )
    .bind(tenant_id)
    .fetch_all(db)
    .await?)
}

pub async fn portal_get(
    State(s): State<AppState>,
    Path((token, id)): Path<(String, i64)>,
) -> AppResult<Json<Value>> {
    let (tenant_id, org_id) = portal_tenant(&s.db, &token).await?;
    let c = fetch(&s.db, org_id, id).await?;
    if c.tenant_id != Some(tenant_id) || c.status == "draft" {
        return Err(AppError::NotFound);
    }
    let org = docs::load_issuer(&s.db, org_id).await?;
    Ok(Json(json!({
        "contract": {
            "id": c.id, "doc_no": c.doc_no, "title": c.title, "body": c.body, "status": c.status,
            "content_hash": c.content_hash, "sent_at": c.sent_at, "unit_name": c.unit_name,
            "property_name": c.property_name, "tenant_name": c.tenant_name,
            "tenant_signature_url": c.tenant_signature_url, "tenant_signed_name": c.tenant_signed_name,
            "tenant_signed_at": c.tenant_signed_at, "landlord_signature_url": c.landlord_signature_url,
            "landlord_signed_name": c.landlord_signed_name, "landlord_signed_at": c.landlord_signed_at,
            "void_reason": c.void_reason,
        },
        "org": { "name": org.legal_name },
    })))
}

/// ผู้เช่าลงนาม (multipart: signature, signed_name, agree=true, content_hash = ค่าที่หน้าเว็บแสดงอยู่)
pub async fn portal_sign(
    State(s): State<AppState>,
    Path((token, id)): Path<(String, i64)>,
    ip: ClientIp,
    headers: HeaderMap,
    form: Multipart,
) -> AppResult<Json<Value>> {
    s.limiter.check(
        &format!("sign:{token}"),
        10,
        std::time::Duration::from_secs(3600),
    )?;
    let (tenant_id, org_id) = portal_tenant(&s.db, &token).await?;
    let c = fetch(&s.db, org_id, id).await?;
    if c.tenant_id != Some(tenant_id) || c.status == "draft" {
        return Err(AppError::NotFound);
    }
    if c.status != "sent" {
        return Err(AppError::Conflict(match c.status.as_str() {
            "void" => "สัญญานี้ถูกยกเลิกแล้ว".into(),
            _ => "ลงนามสัญญานี้แล้ว".into(),
        }));
    }
    // เนื้อหาต้องตรงกับที่ส่งให้ และตรงกับที่ผู้เช่าเห็นบนหน้าจอ
    let current = hash(&c.title, &c.body);
    if c.content_hash.as_deref() != Some(current.as_str()) {
        return Err(AppError::Conflict(
            "เนื้อหาสัญญาไม่ตรงกับฉบับที่ส่ง — กรุณาติดต่อผู้ให้เช่า".into(),
        ));
    }
    let form = uploads::parse_for(&s, org_id, form, "sign").await?;
    if form.text("content_hash") != Some(current.as_str()) {
        return Err(AppError::Conflict(
            "สัญญามีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่แล้วอ่านอีกครั้ง".into(),
        ));
    }
    if form.text("agree") != Some("true") {
        return Err(AppError::BadRequest("กรุณายืนยันว่าได้อ่านและยอมรับสัญญา".into()));
    }
    let signature = form
        .fields
        .get("signature_url")
        .cloned()
        .ok_or_else(|| AppError::BadRequest("กรุณาลงลายมือชื่อ".into()))?;
    let name = form.required("signed_name", "ชื่อผู้ลงนาม")?;
    let ua: String = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .chars()
        .take(300)
        .collect();
    sqlx::query(
        "UPDATE contracts SET tenant_signature_url = ?, tenant_signed_name = ?, tenant_signed_at = datetime('now'),
            tenant_signed_ip = ?, tenant_signed_ua = ?,
            status = CASE WHEN landlord_signed_at IS NOT NULL THEN 'completed' ELSE 'tenant_signed' END
         WHERE id = ? AND status = 'sent'",
    )
    .bind(&signature)
    .bind(&name)
    .bind(ip.0.as_deref())
    .bind(&ua)
    .bind(id)
    .execute(&s.db)
    .await?;
    audit::log(
        &s.db,
        Some(org_id),
        None,
        ip.0.as_deref(),
        "contract.tenant_sign",
        "contract",
        Some(id),
        Some(json!({ "doc_no": c.doc_no, "tenant_id": tenant_id, "hash": current })),
    )
    .await;
    portal_get(State(s), Path((token, id))).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_placeholders() {
        let mut v = BTreeMap::new();
        v.insert("tenant_name", "สมชาย".to_string());
        let (out, unknown) = render("เรียน {{ tenant_name }} {{nope}} {{tenant_name}} {{", &v);
        assert_eq!(out, "เรียน สมชาย {{nope}} สมชาย {{");
        assert_eq!(unknown, vec!["nope".to_string()]);
    }

    #[test]
    fn default_template_uses_known_placeholders() {
        let known: BTreeMap<&str, String> = PLACEHOLDERS
            .iter()
            .map(|(k, _)| (*k, String::new()))
            .collect();
        assert!(render(DEFAULT_LEASE, &known).1.is_empty());
        assert!(render(DEFAULT_LEASE_EN, &known).1.is_empty());
    }

    #[test]
    fn describes_term() {
        let d = |s: &str| s.parse::<NaiveDate>().unwrap();
        assert_eq!(term_text(d("2026-01-01"), Some(d("2027-01-01"))), "1 ปี");
        assert_eq!(term_text(d("2026-01-01"), Some(d("2026-07-01"))), "6 เดือน");
        assert_eq!(term_text(d("2026-01-01"), Some(d("2026-01-10"))), "9 วัน");
        assert_eq!(
            term_text_en(d("2026-01-01"), Some(d("2026-02-01"))),
            "1 month"
        );
        assert_eq!(
            term_text_en(d("2026-01-01"), Some(d("2028-01-01"))),
            "2 years"
        );
        assert_eq!(long_date_en(d("2026-10-05")), "5 October 2026");
    }
}
