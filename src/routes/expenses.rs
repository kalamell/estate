//! รายจ่าย (ค่าไฟส่วนกลาง ค่าซ่อม เงินเดือน ฯลฯ) รายจ่ายประจำ และรายงานกำไรต่อโครงการ
//!
//! รายรับ = เงินที่รับชำระจริง (ตามวันที่ชำระ) แบบเดียวกับรายงานรายรับ
//! รายจ่ายที่ไม่ระบุโครงการ = ค่าใช้จ่ายส่วนกลาง แสดงแยกและหักในกำไรรวม

use std::collections::BTreeMap;

use axum::{
    extract::{Multipart, Path, Query, State},
    http::header,
    response::IntoResponse,
    Json,
};
use chrono::{Datelike, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::validate_in;
use crate::{
    audit,
    auth::{self, OrgCtx},
    billing::round2,
    error::{AppError, AppResult},
    uploads, AppState,
};

pub const METHODS: &[&str] = &["cash", "transfer", "card", "other"];

const DEFAULT_CATEGORIES: &[&str] = &[
    "ค่าไฟฟ้า (จ่ายการไฟฟ้า)",
    "ค่าน้ำประปา (จ่ายการประปา)",
    "ซ่อมบำรุง",
    "ทำความสะอาด / ของใช้",
    "เงินเดือน / ค่าจ้าง",
    "อินเทอร์เน็ต / เคเบิล",
    "ภาษีที่ดินและสิ่งปลูกสร้าง",
    "ประกันภัย",
    "ค่าธรรมเนียมแพลตฟอร์ม / คอมมิชชัน",
    "ดอกเบี้ยเงินกู้",
    "อื่น ๆ",
];

async fn ensure_categories(db: &SqlitePool, org_id: i64) -> AppResult<()> {
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM expense_categories WHERE org_id = ?")
        .bind(org_id)
        .fetch_one(db)
        .await?;
    if n == 0 {
        for (i, name) in DEFAULT_CATEGORIES.iter().enumerate() {
            sqlx::query(
                "INSERT OR IGNORE INTO expense_categories (org_id, name, sort_order) VALUES (?, ?, ?)",
            )
            .bind(org_id)
            .bind(name)
            .bind(i as i64)
            .execute(db)
            .await?;
        }
    }
    Ok(())
}

async fn ensure_category(db: &SqlitePool, org_id: i64, id: i64) -> AppResult<()> {
    sqlx::query_scalar::<_, i64>("SELECT id FROM expense_categories WHERE id = ? AND org_id = ?")
        .bind(id)
        .bind(org_id)
        .fetch_optional(db)
        .await?
        .map(|_| ())
        .ok_or_else(|| AppError::BadRequest("ไม่พบหมวดรายจ่าย".into()))
}

// ---------- หมวด ----------

#[derive(Serialize, sqlx::FromRow)]
pub struct Category {
    id: i64,
    name: String,
    is_active: bool,
    sort_order: i64,
    used: i64,
}

pub async fn categories(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Vec<Category>>> {
    ensure_categories(&s.db, ctx.org_id).await?;
    Ok(Json(
        sqlx::query_as(
            "SELECT c.id, c.name, c.is_active, c.sort_order,
                    (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id) AS used
             FROM expense_categories c WHERE c.org_id = ? ORDER BY c.sort_order, c.id",
        )
        .bind(ctx.org_id)
        .fetch_all(&s.db)
        .await?,
    ))
}

#[derive(Deserialize)]
pub struct CategoryInput {
    name: String,
    #[serde(default = "yes")]
    is_active: bool,
}

fn yes() -> bool {
    true
}

pub async fn create_category(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(c): Json<CategoryInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let name = c.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อหมวด".into()));
    }
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO expense_categories (org_id, name, sort_order)
         VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM expense_categories WHERE org_id = ?))
         RETURNING id",
    )
    .bind(ctx.org_id)
    .bind(name)
    .bind(ctx.org_id)
    .fetch_one(&s.db)
    .await
    .map_err(|e| match AppError::from(e) {
        AppError::Conflict(_) => AppError::Conflict("มีหมวดชื่อนี้แล้ว".into()),
        o => o,
    })?;
    Ok(Json(json!({ "id": id })))
}

pub async fn update_category(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(c): Json<CategoryInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    ensure_category(&s.db, ctx.org_id, id).await?;
    if c.name.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุชื่อหมวด".into()));
    }
    sqlx::query("UPDATE expense_categories SET name = ?, is_active = ? WHERE id = ?")
        .bind(c.name.trim())
        .bind(c.is_active)
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

pub async fn delete_category(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    ensure_category(&s.db, ctx.org_id, id).await?;
    let used: i64 = sqlx::query_scalar(
        "SELECT (SELECT COUNT(*) FROM expenses WHERE category_id = ?1)
              + (SELECT COUNT(*) FROM recurring_expenses WHERE category_id = ?1)",
    )
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    if used > 0 {
        return Err(AppError::Conflict(
            "หมวดนี้มีรายการอยู่ — ปิดการใช้งานแทนการลบ".into(),
        ));
    }
    sqlx::query("DELETE FROM expense_categories WHERE id = ?")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

// ---------- รายจ่าย ----------

#[derive(Serialize, sqlx::FromRow)]
pub struct Expense {
    id: i64,
    property_id: Option<i64>,
    property_name: Option<String>,
    unit_id: Option<i64>,
    unit_name: Option<String>,
    category_id: i64,
    category_name: String,
    expense_date: String,
    amount: f64,
    vendor: String,
    note: String,
    method: String,
    receipt_url: Option<String>,
    ticket_id: Option<i64>,
    ticket_title: Option<String>,
    recurring_id: Option<i64>,
    created_by_name: Option<String>,
    created_at: String,
}

const SELECT: &str = "SELECT e.id, e.property_id, p.name AS property_name, e.unit_id, u.name AS unit_name,
        e.category_id, c.name AS category_name, e.expense_date, e.amount, e.vendor, e.note, e.method, e.receipt_url,
        e.ticket_id, t.title AS ticket_title, e.recurring_id, us.name AS created_by_name, e.created_at
    FROM expenses e
    JOIN expense_categories c ON c.id = e.category_id
    LEFT JOIN properties p ON p.id = e.property_id
    LEFT JOIN units u ON u.id = e.unit_id
    LEFT JOIN tickets t ON t.id = e.ticket_id
    LEFT JOIN users us ON us.id = e.created_by";

#[derive(Deserialize)]
pub struct ListQuery {
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    property_id: Option<i64>,
    /// "shared" = เฉพาะส่วนกลาง
    scope: Option<String>,
    category_id: Option<i64>,
    q: Option<String>,
}

async fn query_list(s: &AppState, org_id: i64, q: &ListQuery) -> AppResult<Vec<Expense>> {
    let like =
        q.q.as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(|v| format!("%{v}%"));
    Ok(sqlx::query_as(&format!(
        "{SELECT} WHERE e.org_id = ?1 AND (?2 IS NULL OR e.expense_date >= ?2) AND (?3 IS NULL OR e.expense_date <= ?3)
           AND (?4 IS NULL OR e.property_id = ?4) AND (?5 IS NULL OR e.category_id = ?5)
           AND (?6 IS NULL OR e.vendor LIKE ?6 OR e.note LIKE ?6)
           AND (?7 IS NULL OR e.property_id IS NULL)
         ORDER BY e.expense_date DESC, e.id DESC LIMIT 2000"
    ))
    .bind(org_id)
    .bind(q.from)
    .bind(q.to)
    .bind(q.property_id)
    .bind(q.category_id)
    .bind(like)
    .bind((q.scope.as_deref() == Some("shared")).then_some(1))
    .fetch_all(&s.db)
    .await?)
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    run_recurring_for(&s.db, ctx.org_id, Local::now().date_naive()).await?;
    let rows = query_list(&s, ctx.org_id, &q).await?;
    let total = round2(rows.iter().map(|e| e.amount).sum());
    let mut by_category: BTreeMap<String, f64> = BTreeMap::new();
    for e in &rows {
        *by_category.entry(e.category_name.clone()).or_default() += e.amount;
    }
    Ok(Json(json!({
        "expenses": rows,
        "total": total,
        "by_category": by_category.into_iter().map(|(k, v)| json!({ "category": k, "amount": round2(v) })).collect::<Vec<_>>(),
    })))
}

struct ExpenseFields {
    property_id: Option<i64>,
    unit_id: Option<i64>,
    category_id: i64,
    expense_date: NaiveDate,
    amount: f64,
    vendor: String,
    note: String,
    method: String,
    ticket_id: Option<i64>,
}

async fn validate(s: &AppState, org_id: i64, f: &mut ExpenseFields) -> AppResult<()> {
    if f.amount.is_nan() || f.amount <= 0.0 || f.amount > 100_000_000.0 {
        return Err(AppError::BadRequest("จำนวนเงินต้องมากกว่า 0".into()));
    }
    f.amount = round2(f.amount);
    validate_in("method", &f.method, METHODS)?;
    ensure_category(&s.db, org_id, f.category_id).await?;
    if let Some(u) = f.unit_id {
        auth::ensure_unit(&s.db, org_id, u).await?;
        // ห้องอยู่โครงการไหน รายจ่ายก็เป็นของโครงการนั้น
        f.property_id = Some(
            sqlx::query_scalar("SELECT property_id FROM units WHERE id = ?")
                .bind(u)
                .fetch_one(&s.db)
                .await?,
        );
    }
    if let Some(p) = f.property_id {
        auth::ensure_property(&s.db, org_id, p).await?;
    }
    if let Some(t) = f.ticket_id {
        sqlx::query_scalar::<_, i64>(
            "SELECT id FROM tickets WHERE id = ? AND org_id = ? AND scope = 'org'",
        )
        .bind(t)
        .bind(org_id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("ไม่พบเรื่องแจ้งซ่อม".into()))?;
    }
    Ok(())
}

fn parse_form(form: &uploads::Form) -> AppResult<ExpenseFields> {
    let date = form
        .text("expense_date")
        .map(|d| {
            d.parse::<NaiveDate>()
                .map_err(|_| AppError::BadRequest("วันที่ไม่ถูกต้อง".into()))
        })
        .transpose()?
        .unwrap_or_else(|| Local::now().date_naive());
    Ok(ExpenseFields {
        property_id: form.id("property_id")?,
        unit_id: form.id("unit_id")?,
        category_id: form
            .id("category_id")?
            .ok_or_else(|| AppError::BadRequest("กรุณาเลือกหมวดรายจ่าย".into()))?,
        expense_date: date,
        amount: form
            .text("amount")
            .and_then(|a| a.replace(',', "").parse().ok())
            .ok_or_else(|| AppError::BadRequest("กรุณาระบุจำนวนเงิน".into()))?,
        vendor: form.text("vendor").unwrap_or_default().to_string(),
        note: form.text("note").unwrap_or_default().to_string(),
        method: form.text("method").unwrap_or("transfer").to_string(),
        ticket_id: form.id("ticket_id")?,
    })
}

async fn fetch(s: &AppState, org_id: i64, id: i64) -> AppResult<Expense> {
    sqlx::query_as(&format!("{SELECT} WHERE e.id = ? AND e.org_id = ?"))
        .bind(id)
        .bind(org_id)
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::NotFound)
}

/// บันทึกรายจ่าย (multipart: ฟิลด์ + รูปใบเสร็จ `photo`) — พนักงานบันทึกได้ เช่น ซื้ออะไหล่ซ่อม
pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    form: Multipart,
) -> AppResult<Json<Expense>> {
    ensure_categories(&s.db, ctx.org_id).await?;
    let form = uploads::parse_for(&s, ctx.org_id, form, "expense").await?;
    let mut f = parse_form(&form)?;
    validate(&s, ctx.org_id, &mut f).await?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO expenses (org_id, property_id, unit_id, category_id, expense_date, amount, vendor, note, method,
            receipt_url, ticket_id, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(ctx.org_id)
    .bind(f.property_id)
    .bind(f.unit_id)
    .bind(f.category_id)
    .bind(f.expense_date)
    .bind(f.amount)
    .bind(f.vendor.trim())
    .bind(f.note.trim())
    .bind(&f.method)
    .bind(form.photos.first())
    .bind(f.ticket_id)
    .bind(ctx.user.id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(fetch(&s, ctx.org_id, id).await?))
}

/// แก้ไข (multipart เหมือนตอนสร้าง — แนบรูปใหม่เพื่อแทนรูปเดิม, `remove_receipt=1` เพื่อลบรูป)
pub async fn update(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    form: Multipart,
) -> AppResult<Json<Expense>> {
    ctx.require_admin()?;
    let before = fetch(&s, ctx.org_id, id).await?;
    let form = uploads::parse_for(&s, ctx.org_id, form, "expense").await?;
    let mut f = parse_form(&form)?;
    validate(&s, ctx.org_id, &mut f).await?;
    let receipt = match (form.photos.first(), form.text("remove_receipt")) {
        (Some(url), _) => Some(url.clone()),
        (None, Some("1")) => None,
        (None, _) => before.receipt_url.clone(),
    };
    sqlx::query(
        "UPDATE expenses SET property_id = ?, unit_id = ?, category_id = ?, expense_date = ?, amount = ?, vendor = ?,
            note = ?, method = ?, receipt_url = ?, ticket_id = ? WHERE id = ?",
    )
    .bind(f.property_id)
    .bind(f.unit_id)
    .bind(f.category_id)
    .bind(f.expense_date)
    .bind(f.amount)
    .bind(f.vendor.trim())
    .bind(f.note.trim())
    .bind(&f.method)
    .bind(receipt)
    .bind(f.ticket_id)
    .bind(id)
    .execute(&s.db)
    .await?;
    if (before.amount - f.amount).abs() > 0.004 {
        audit::record(
            &s.db,
            &ctx,
            "expense.update",
            "expense",
            Some(id),
            Some(json!({ "from": before.amount, "to": f.amount })),
        )
        .await;
    }
    Ok(Json(fetch(&s, ctx.org_id, id).await?))
}

pub async fn delete(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let e = fetch(&s, ctx.org_id, id).await?;
    sqlx::query("DELETE FROM expenses WHERE id = ?")
        .bind(id)
        .execute(&s.db)
        .await?;
    audit::record(
        &s.db,
        &ctx,
        "expense.delete",
        "expense",
        Some(id),
        Some(json!({ "amount": e.amount, "category": e.category_name, "date": e.expense_date })),
    )
    .await;
    Ok(Json(json!({})))
}

fn csv_field(v: &str) -> String {
    let v = if v.starts_with(['=', '+', '-', '@']) {
        format!("'{v}")
    } else {
        v.to_string()
    };
    if v.contains([',', '"', '\n']) {
        format!("\"{}\"", v.replace('"', "\"\""))
    } else {
        v
    }
}

/// ส่งออกรายจ่ายเป็น CSV (เปิดใน Excel ได้) สำหรับนักบัญชี
pub async fn export(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ListQuery>,
) -> AppResult<impl IntoResponse> {
    ctx.require_admin()?;
    let rows = query_list(&s, ctx.org_id, &q).await?;
    let mut out =
        String::from("\u{feff}วันที่,หมวด,โครงการ,ห้อง,ผู้รับเงิน,รายละเอียด,วิธีจ่าย,จำนวนเงิน,มีใบเสร็จ\n");
    for e in &rows {
        let method = match e.method.as_str() {
            "cash" => "เงินสด",
            "card" => "บัตร",
            "other" => "อื่น ๆ",
            _ => "โอน",
        };
        let cols = [
            e.expense_date.clone(),
            e.category_name.clone(),
            e.property_name.clone().unwrap_or_else(|| "ส่วนกลาง".into()),
            e.unit_name.clone().unwrap_or_default(),
            e.vendor.clone(),
            e.note.clone(),
            method.into(),
            format!("{:.2}", e.amount),
            if e.receipt_url.is_some() {
                "มี"
            } else {
                ""
            }
            .into(),
        ];
        out.push_str(
            &cols
                .iter()
                .map(|c| csv_field(c))
                .collect::<Vec<_>>()
                .join(","),
        );
        out.push('\n');
    }
    Ok((
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"expenses.csv\"",
            ),
        ],
        out,
    ))
}

// ---------- รายจ่ายประจำ ----------

#[derive(Serialize, sqlx::FromRow)]
pub struct Recurring {
    id: i64,
    property_id: Option<i64>,
    property_name: Option<String>,
    category_id: i64,
    category_name: String,
    amount: f64,
    vendor: String,
    note: String,
    day_of_month: i64,
    is_active: bool,
    last_generated: Option<String>,
}

const RECURRING_SELECT: &str =
    "SELECT r.id, r.property_id, p.name AS property_name, r.category_id, c.name AS category_name,
        r.amount, r.vendor, r.note, r.day_of_month, r.is_active, r.last_generated
    FROM recurring_expenses r JOIN expense_categories c ON c.id = r.category_id
    LEFT JOIN properties p ON p.id = r.property_id";

pub async fn recurring(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Vec<Recurring>>> {
    ctx.require_admin()?;
    Ok(Json(
        sqlx::query_as(&format!(
            "{RECURRING_SELECT} WHERE r.org_id = ? ORDER BY r.day_of_month, r.id"
        ))
        .bind(ctx.org_id)
        .fetch_all(&s.db)
        .await?,
    ))
}

#[derive(Deserialize)]
pub struct RecurringInput {
    property_id: Option<i64>,
    category_id: i64,
    amount: f64,
    #[serde(default)]
    vendor: String,
    #[serde(default)]
    note: String,
    #[serde(default = "first")]
    day_of_month: i64,
    #[serde(default = "yes")]
    is_active: bool,
}

fn first() -> i64 {
    1
}

async fn save_recurring(
    s: &AppState,
    ctx: &OrgCtx,
    id: Option<i64>,
    r: RecurringInput,
) -> AppResult<Recurring> {
    ctx.require_admin()?;
    if r.amount.is_nan() || r.amount <= 0.0 {
        return Err(AppError::BadRequest("จำนวนเงินต้องมากกว่า 0".into()));
    }
    if !(1..=28).contains(&r.day_of_month) {
        return Err(AppError::BadRequest("วันที่ในเดือนต้องอยู่ระหว่าง 1–28".into()));
    }
    ensure_category(&s.db, ctx.org_id, r.category_id).await?;
    if let Some(p) = r.property_id {
        auth::ensure_property(&s.db, ctx.org_id, p).await?;
    }
    let id: i64 = match id {
        Some(id) => sqlx::query_scalar(
            "UPDATE recurring_expenses SET property_id = ?, category_id = ?, amount = ?, vendor = ?, note = ?,
                day_of_month = ?, is_active = ? WHERE id = ? AND org_id = ? RETURNING id",
        )
        .bind(r.property_id)
        .bind(r.category_id)
        .bind(round2(r.amount))
        .bind(r.vendor.trim())
        .bind(r.note.trim())
        .bind(r.day_of_month)
        .bind(r.is_active)
        .bind(id)
        .bind(ctx.org_id)
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::NotFound)?,
        None => {
            // เริ่มสร้างตั้งแต่เดือนนี้ถ้ายังไม่เลยวันที่กำหนด ไม่งั้นเริ่มเดือนหน้า
            let today = Local::now().date_naive();
            let last = (today.day() as i64 >= r.day_of_month)
                .then(|| today.format("%Y-%m").to_string());
            sqlx::query_scalar(
                "INSERT INTO recurring_expenses (org_id, property_id, category_id, amount, vendor, note, day_of_month,
                    is_active, last_generated)
                 VALUES (?,?,?,?,?,?,?,?,?) RETURNING id",
            )
            .bind(ctx.org_id)
            .bind(r.property_id)
            .bind(r.category_id)
            .bind(round2(r.amount))
            .bind(r.vendor.trim())
            .bind(r.note.trim())
            .bind(r.day_of_month)
            .bind(r.is_active)
            .bind(last)
            .fetch_one(&s.db)
            .await?
        }
    };
    Ok(
        sqlx::query_as(&format!("{RECURRING_SELECT} WHERE r.id = ?"))
            .bind(id)
            .fetch_one(&s.db)
            .await?,
    )
}

pub async fn create_recurring(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(r): Json<RecurringInput>,
) -> AppResult<Json<Recurring>> {
    Ok(Json(save_recurring(&s, &ctx, None, r).await?))
}

pub async fn update_recurring(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(r): Json<RecurringInput>,
) -> AppResult<Json<Recurring>> {
    Ok(Json(save_recurring(&s, &ctx, Some(id), r).await?))
}

pub async fn delete_recurring(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    sqlx::query("DELETE FROM recurring_expenses WHERE id = ? AND org_id = ?")
        .bind(id)
        .bind(ctx.org_id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

#[derive(sqlx::FromRow)]
struct DueRecurring {
    id: i64,
    property_id: Option<i64>,
    category_id: i64,
    amount: f64,
    vendor: String,
    note: String,
    day_of_month: i64,
}

/// สร้างรายจ่ายประจำของเดือนนี้ เมื่อถึงวันที่กำหนด (ครั้งเดียวต่อเดือน)
async fn run_recurring_for(db: &SqlitePool, org_id: i64, today: NaiveDate) -> AppResult<usize> {
    let month = today.format("%Y-%m").to_string();
    let due: Vec<DueRecurring> = sqlx::query_as(
        "SELECT id, property_id, category_id, amount, vendor, note, day_of_month FROM recurring_expenses
         WHERE org_id = ? AND is_active = 1 AND day_of_month <= ? AND (last_generated IS NULL OR last_generated < ?)",
    )
    .bind(org_id)
    .bind(today.day() as i64)
    .bind(&month)
    .fetch_all(db)
    .await?;
    let mut n = 0;
    for DueRecurring {
        id,
        property_id,
        category_id,
        amount,
        vendor,
        note,
        day_of_month: day,
    } in due
    {
        let date =
            NaiveDate::from_ymd_opt(today.year(), today.month(), day as u32).unwrap_or(today);
        let mut tx = db.begin().await?;
        sqlx::query(
            "INSERT OR IGNORE INTO expenses (org_id, property_id, category_id, expense_date, amount, vendor, note,
                recurring_id) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(org_id)
        .bind(property_id)
        .bind(category_id)
        .bind(date)
        .bind(amount)
        .bind(&vendor)
        .bind(if note.is_empty() { "รายจ่ายประจำ".to_string() } else { note })
        .bind(id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE recurring_expenses SET last_generated = ? WHERE id = ?")
            .bind(&month)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        n += 1;
    }
    Ok(n)
}

/// ทุกองค์กร (งานเบื้องหลังรายชั่วโมง)
pub async fn run_recurring(db: &SqlitePool, today: NaiveDate) -> AppResult<usize> {
    let orgs: Vec<i64> =
        sqlx::query_scalar("SELECT DISTINCT org_id FROM recurring_expenses WHERE is_active = 1")
            .fetch_all(db)
            .await?;
    let mut n = 0;
    for org in orgs {
        n += run_recurring_for(db, org, today).await?;
    }
    Ok(n)
}

pub fn spawn_recurring(db: SqlitePool) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            tick.tick().await;
            if let Err(e) = run_recurring(&db, Local::now().date_naive()).await {
                tracing::warn!(error = %e, "สร้างรายจ่ายประจำไม่สำเร็จ");
            }
        }
    });
}

// ---------- กำไรต่อโครงการ ----------

#[derive(Deserialize)]
pub struct ProfitQuery {
    /// YYYY-MM (ค่าเริ่มต้น: 11 เดือนก่อนถึงเดือนนี้)
    from: Option<String>,
    to: Option<String>,
    property_id: Option<i64>,
}

fn month_start(s: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(&format!("{s}-01"), "%Y-%m-%d")
        .map_err(|_| AppError::BadRequest("เดือนต้องอยู่ในรูปแบบ YYYY-MM".into()))
}

fn next_month(d: NaiveDate) -> NaiveDate {
    d.checked_add_months(chrono::Months::new(1)).unwrap_or(d)
}

pub async fn profit(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ProfitQuery>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    ctx.require_feature(ctx.features.reports, "รายงาน")?;
    run_recurring_for(&s.db, ctx.org_id, Local::now().date_naive()).await?;
    let today = Local::now().date_naive();
    let this_month = NaiveDate::from_ymd_opt(today.year(), today.month(), 1).expect("date");
    let to = match &q.to {
        Some(t) => month_start(t)?,
        None => this_month,
    };
    let from = match &q.from {
        Some(f) => month_start(f)?,
        None => to.checked_sub_months(chrono::Months::new(11)).unwrap_or(to),
    };
    if from > to {
        return Err(AppError::BadRequest("เดือนเริ่มต้องไม่หลังเดือนสิ้นสุด".into()));
    }
    let mut months = Vec::new();
    let mut m = from;
    while m <= to && months.len() < 36 {
        months.push(m.format("%Y-%m").to_string());
        m = next_month(m);
    }
    let end = next_month(to);

    // รายรับ: เงินรับชำระจริง (รวมค่าปรับ) แยกโครงการและเดือน
    let income: Vec<(i64, String, f64)> = sqlx::query_as(
        "SELECT p.id, strftime('%Y-%m', pm.paid_at), SUM(pm.amount + pm.late_fee) FROM payments pm
         JOIN invoices i ON i.id = pm.invoice_id JOIN units u ON u.id = i.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) AND pm.voided = 0 AND pm.paid_at >= ?3 AND pm.paid_at < ?4
         GROUP BY 1, 2",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .bind(from)
    .bind(end)
    .fetch_all(&s.db)
    .await?;
    let expenses: Vec<(Option<i64>, String, String, f64)> = sqlx::query_as(
        "SELECT e.property_id, substr(e.expense_date, 1, 7), c.name, SUM(e.amount) FROM expenses e
         JOIN expense_categories c ON c.id = e.category_id
         WHERE e.org_id = ?1 AND (?2 IS NULL OR e.property_id = ?2) AND e.expense_date >= ?3 AND e.expense_date < ?4
         GROUP BY 1, 2, 3",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .bind(from)
    .bind(end)
    .fetch_all(&s.db)
    .await?;
    let properties: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, name FROM properties WHERE org_id = ?1 AND (?2 IS NULL OR id = ?2) ORDER BY name",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .fetch_all(&s.db)
    .await?;

    let mut month_income: BTreeMap<&str, f64> = BTreeMap::new();
    let mut month_expense: BTreeMap<&str, f64> = BTreeMap::new();
    let mut prop_income: BTreeMap<i64, f64> = BTreeMap::new();
    let mut prop_expense: BTreeMap<i64, f64> = BTreeMap::new();
    let mut by_category: BTreeMap<String, f64> = BTreeMap::new();
    let mut shared = 0.0;
    for (pid, month, amount) in &income {
        if let Some(k) = months.iter().find(|m| *m == month) {
            *month_income.entry(k).or_default() += amount;
        }
        *prop_income.entry(*pid).or_default() += amount;
    }
    for (pid, month, cat, amount) in &expenses {
        if let Some(k) = months.iter().find(|m| *m == month) {
            *month_expense.entry(k).or_default() += amount;
        }
        match pid {
            Some(p) => *prop_expense.entry(*p).or_default() += amount,
            None => shared += amount,
        }
        *by_category.entry(cat.clone()).or_default() += amount;
    }
    let total_income: f64 = month_income.values().sum();
    let total_expense: f64 = month_expense.values().sum();
    let mut categories: Vec<(String, f64)> = by_category.into_iter().collect();
    categories.sort_by(|a, b| b.1.total_cmp(&a.1));
    Ok(Json(json!({
        "from": months.first(), "to": months.last(),
        "months": months.iter().map(|m| {
            let i = *month_income.get(m.as_str()).unwrap_or(&0.0);
            let e = *month_expense.get(m.as_str()).unwrap_or(&0.0);
            json!({ "month": m, "income": round2(i), "expense": round2(e), "net": round2(i - e) })
        }).collect::<Vec<_>>(),
        "properties": properties.iter().map(|(id, name)| {
            let i = *prop_income.get(id).unwrap_or(&0.0);
            let e = *prop_expense.get(id).unwrap_or(&0.0);
            json!({
                "property_id": id, "name": name, "income": round2(i), "expense": round2(e), "net": round2(i - e),
                "margin": if i > 0.0 { Some(round2((i - e) / i * 100.0)) } else { None },
            })
        }).collect::<Vec<_>>(),
        "shared_expense": round2(shared),
        "categories": categories.into_iter().map(|(c, a)| json!({ "category": c, "amount": round2(a) })).collect::<Vec<_>>(),
        "totals": {
            "income": round2(total_income), "expense": round2(total_expense), "net": round2(total_income - total_expense),
            "margin": if total_income > 0.0 { Some(round2((total_income - total_expense) / total_income * 100.0)) } else { None },
        },
    })))
}

/// รายจ่ายเดือนนี้ (สำหรับหน้าภาพรวม)
pub async fn month_expense(db: &SqlitePool, org_id: i64) -> AppResult<f64> {
    Ok(sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0.0) FROM expenses
         WHERE org_id = ? AND substr(expense_date, 1, 7) = strftime('%Y-%m', 'now', 'localtime')",
    )
    .bind(org_id)
    .fetch_one(db)
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_escapes_formulas() {
        assert_eq!(csv_field("=SUM(A1)"), "'=SUM(A1)");
        assert_eq!(csv_field("a,b"), "\"a,b\"");
    }
}
