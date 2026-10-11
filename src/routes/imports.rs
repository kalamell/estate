//! นำเข้าห้อง ผู้เช่า สัญญา และเลขมิเตอร์จาก Excel/CSV ของลูกค้า (จับคู่คอลัมน์เอง)
//!
//! อัปโหลด → เลือกชีต/แถวหัวตาราง → จับคู่คอลัมน์ (ระบบเดาให้ + จำของเดิม) → ตรวจตัวอย่างผล → นำเข้า
//! ทุกแถวถูกตรวจก่อน แถวที่ผิดจะถูกข้ามและแจ้งเหตุผล นำเข้าทั้งหมดในรายการเดียว (ล้มเหลว = ไม่มีอะไรเปลี่ยน)

use std::collections::{BTreeMap, HashMap};

use axum::{
    extract::{Multipart, Path, State},
    http::header,
    response::IntoResponse,
    Json,
};
use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::validate_in;
use crate::{
    audit,
    auth::{self, OrgCtx},
    error::{AppError, AppResult},
    import::{self, DateOrder, Sheet},
    models::PROPERTY_KINDS,
    AppState,
};

// ---------- อัปโหลด / ดูหัวตาราง ----------

async fn load_sheets(
    s: &AppState,
    org_id: i64,
    id: i64,
) -> AppResult<(String, Vec<Sheet>, String)> {
    let (filename, sheets, status): (String, String, String) =
        sqlx::query_as("SELECT filename, sheets, status FROM imports WHERE id = ? AND org_id = ?")
            .bind(id)
            .bind(org_id)
            .fetch_optional(&s.db)
            .await?
            .ok_or(AppError::NotFound)?;
    let sheets: Vec<Sheet> =
        serde_json::from_str(&sheets).map_err(|e| AppError::Internal(e.into()))?;
    Ok((filename, sheets, status))
}

fn headers_of(sheet: &Sheet, header_row: usize) -> Vec<String> {
    let width = sheet.rows.iter().map(Vec::len).max().unwrap_or(0);
    let row = sheet.rows.get(header_row).cloned().unwrap_or_default();
    (0..width)
        .map(|i| {
            let h = row.get(i).map(|s| s.trim().to_string()).unwrap_or_default();
            if h.is_empty() {
                format!("คอลัมน์ {}", column_letter(i))
            } else {
                h
            }
        })
        .collect()
}

/// A, B, ..., Z, AA, AB ...
fn column_letter(mut i: usize) -> String {
    let mut s = String::new();
    loop {
        s.insert(0, (b'A' + (i % 26) as u8) as char);
        if i < 26 {
            break;
        }
        i = i / 26 - 1;
    }
    s
}

async fn describe(
    s: &AppState,
    org_id: i64,
    id: i64,
    sheet_index: usize,
    header_row: Option<usize>,
) -> AppResult<Value> {
    let (filename, sheets, status) = load_sheets(s, org_id, id).await?;
    let sheet = sheets
        .get(sheet_index)
        .ok_or_else(|| AppError::BadRequest("ไม่พบชีตที่เลือก".into()))?;
    let header_row = header_row.unwrap_or_else(|| import::guess_header_row(&sheet.rows));
    let headers = headers_of(sheet, header_row);
    let signature = import::header_signature(&headers);
    let saved: Option<(i64, String, String, String)> = sqlx::query_as(
        "SELECT id, name, mapping, options FROM import_mappings WHERE org_id = ? AND signature = ?",
    )
    .bind(org_id)
    .bind(&signature)
    .fetch_optional(&s.db)
    .await?;
    let (mapping, source, options) = match saved {
        Some((_, name, mapping, options)) => (
            serde_json::from_str::<Value>(&mapping).unwrap_or(json!({})),
            json!({ "type": "saved", "name": name }),
            serde_json::from_str::<Value>(&options).unwrap_or(json!({})),
        ),
        None => (
            json!(import::suggest_mapping(&headers)),
            json!({ "type": "auto" }),
            json!({}),
        ),
    };
    let data_rows = sheet.rows.len().saturating_sub(header_row + 1);
    let properties: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, name FROM properties WHERE org_id = ? ORDER BY name")
            .bind(org_id)
            .fetch_all(&s.db)
            .await?;
    Ok(json!({
        "id": id,
        "filename": filename,
        "status": status,
        "sheets": sheets.iter().enumerate().map(|(i, sh)| json!({ "index": i, "name": sh.name, "rows": sh.rows.len() })).collect::<Vec<_>>(),
        "sheet": sheet_index,
        "header_row": header_row,
        "headers": headers,
        "columns": headers.iter().enumerate().map(|(i, h)| json!({ "index": i, "letter": column_letter(i), "header": h })).collect::<Vec<_>>(),
        "sample": sheet.rows.iter().skip(header_row + 1).take(8).collect::<Vec<_>>(),
        "preview_rows": sheet.rows.iter().take(header_row + 4).collect::<Vec<_>>(),
        "row_count": data_rows,
        "too_many_rows": data_rows > import::MAX_ROWS,
        "mapping": mapping,
        "mapping_source": source,
        "options": options,
        "fields": import::FIELDS.iter().map(|f| json!({ "key": f.key, "label": f.label, "group": f.group, "kind": f.kind })).collect::<Vec<_>>(),
        "properties": properties.into_iter().map(|(id, name)| json!({ "id": id, "name": name })).collect::<Vec<_>>(),
    }))
}

pub async fn upload(
    State(s): State<AppState>,
    ctx: OrgCtx,
    mut form: Multipart,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let mut file: Option<(String, Vec<u8>)> = None;
    while let Some(field) = form
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        if field.name() == Some("file") {
            let name = field.file_name().unwrap_or("data.csv").to_string();
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            file = Some((name, bytes.to_vec()));
        }
    }
    let (filename, bytes) = file.ok_or_else(|| AppError::BadRequest("กรุณาเลือกไฟล์".into()))?;
    let sheets = tokio::task::spawn_blocking({
        let filename = filename.clone();
        move || import::read_file(&filename, &bytes)
    })
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .map_err(AppError::BadRequest)?;
    sqlx::query("DELETE FROM imports WHERE org_id = ? AND created_at < datetime('now', '-7 days')")
        .bind(ctx.org_id)
        .execute(&s.db)
        .await?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO imports (org_id, user_id, filename, sheets) VALUES (?,?,?,?) RETURNING id",
    )
    .bind(ctx.org_id)
    .bind(ctx.user.id)
    .bind(&filename)
    .bind(serde_json::to_string(&sheets).unwrap_or_default())
    .fetch_one(&s.db)
    .await?;
    Ok(Json(describe(&s, ctx.org_id, id, 0, None).await?))
}

#[derive(Deserialize)]
pub struct InspectInput {
    #[serde(default)]
    sheet: usize,
    header_row: Option<usize>,
}

pub async fn inspect(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(i): Json<InspectInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    Ok(Json(
        describe(&s, ctx.org_id, id, i.sheet, i.header_row).await?,
    ))
}

// ---------- ตรวจและวางแผน ----------

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Options {
    /// ใช้โครงการเดียวกับทุกแถว (ไม่ต้องมีคอลัมน์ชื่อโครงการ)
    #[serde(default)]
    property_id: Option<i64>,
    #[serde(default = "yes")]
    create_properties: bool,
    #[serde(default = "dormitory")]
    property_kind: String,
    /// ห้องที่มีอยู่แล้ว: อัปเดตชั้น/ค่าเช่าตามไฟล์
    #[serde(default = "yes")]
    update_units: bool,
    #[serde(default)]
    date_order: DateOrder,
    /// ผู้เช่าเดิมจ่ายเงินประกันแล้ว
    #[serde(default = "yes")]
    deposit_paid: bool,
}

impl Default for Options {
    fn default() -> Self {
        serde_json::from_value(json!({})).expect("defaults")
    }
}

fn yes() -> bool {
    true
}
fn dormitory() -> String {
    "dormitory".into()
}

#[derive(Debug, Clone, Deserialize)]
pub struct Spec {
    #[serde(default)]
    sheet: usize,
    header_row: Option<usize>,
    #[serde(default)]
    mapping: BTreeMap<String, usize>,
    #[serde(default)]
    options: Options,
}

/// ช่วงเข้าพัก (วันเริ่ม, วันสิ้นสุด — None = ไม่กำหนด)
type Stay = (NaiveDate, Option<NaiveDate>);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum PropRef {
    Id(i64),
    New(String),
}

#[derive(Debug, Clone, Default)]
struct UnitData {
    name: String,
    floor: Option<i64>,
    rent: Option<f64>,
    daily: Option<f64>,
}

#[derive(Debug, Clone, Default)]
struct TenantData {
    name: String,
    phone: String,
    email: String,
    id_card: String,
    address: String,
    nationality: String,
    keys: Vec<String>,
}

#[derive(Debug, Clone)]
struct LeaseData {
    start: NaiveDate,
    end: Option<NaiveDate>,
    price: Option<f64>,
    deposit: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
struct RowPlan {
    row: usize,
    status: &'static str,
    property: Option<String>,
    property_action: Option<&'static str>,
    unit: Option<String>,
    unit_action: Option<&'static str>,
    tenant: Option<String>,
    tenant_action: Option<&'static str>,
    lease_action: Option<&'static str>,
    lease: Option<String>,
    meters: usize,
    errors: Vec<String>,
    warnings: Vec<String>,
    #[serde(skip)]
    prop: Option<PropRef>,
    #[serde(skip)]
    unit_data: Option<UnitData>,
    #[serde(skip)]
    tenant_data: Option<TenantData>,
    #[serde(skip)]
    lease_data: Option<LeaseData>,
    #[serde(skip)]
    meter_data: Vec<(&'static str, f64, NaiveDate)>,
    #[serde(skip)]
    note: String,
}

#[derive(Debug, Default, Serialize)]
struct Summary {
    rows: usize,
    ok: usize,
    warnings: usize,
    errors: usize,
    properties_create: usize,
    units_create: usize,
    units_update: usize,
    tenants_create: usize,
    tenants_existing: usize,
    leases_create: usize,
    leases_skip: usize,
    meters: usize,
}

struct Plan {
    headers: Vec<String>,
    rows: Vec<RowPlan>,
    summary: Summary,
    global_errors: Vec<String>,
}

fn tenant_keys(phone: &str, id_card: &str, name: &str) -> Vec<String> {
    let mut keys = Vec::new();
    if phone.chars().filter(|c| c.is_ascii_digit()).count() >= 9 {
        keys.push(format!("p:{phone}"));
    }
    if id_card.len() >= 6 {
        keys.push(format!("i:{}", id_card.to_lowercase()));
    }
    if keys.is_empty() && !name.trim().is_empty() {
        keys.push(format!("n:{}", name.trim().to_lowercase()));
    }
    keys
}

/// ชั้นจากเลขห้อง เช่น 203 → 2, 1205 → 12
fn floor_from_name(name: &str) -> Option<i64> {
    let digits: String = name.chars().filter(|c| c.is_ascii_digit()).collect();
    (digits.len() >= 3
        && digits.len()
            == name
                .trim()
                .trim_start_matches(|c: char| c.is_alphabetic() || c == '-')
                .len())
    .then(|| digits[..digits.len() - 2].parse().ok())
    .flatten()
    .filter(|f| *f >= 1 && *f <= 200)
}

fn overlaps(a: Stay, b: Stay) -> bool {
    let far = NaiveDate::from_ymd_opt(9999, 12, 31).expect("date");
    a.0 < b.1.unwrap_or(far) && b.0 < a.1.unwrap_or(far)
}

async fn plan(s: &AppState, ctx: &OrgCtx, id: i64, spec: &Spec) -> AppResult<(String, Plan)> {
    let (filename, sheets, _) = load_sheets(s, ctx.org_id, id).await?;
    let sheet = sheets
        .get(spec.sheet)
        .ok_or_else(|| AppError::BadRequest("ไม่พบชีตที่เลือก".into()))?;
    let header_row = spec
        .header_row
        .unwrap_or_else(|| import::guess_header_row(&sheet.rows));
    let headers = headers_of(sheet, header_row);
    let o = &spec.options;
    validate_in("property_kind", &o.property_kind, PROPERTY_KINDS)?;
    for (key, col) in &spec.mapping {
        if import::field(key).is_none() {
            return Err(AppError::BadRequest(format!("ไม่รู้จักช่องข้อมูล {key}")));
        }
        if *col >= headers.len() {
            return Err(AppError::BadRequest(format!("คอลัมน์ของ {key} ไม่ถูกต้อง")));
        }
    }
    if let Some(pid) = o.property_id {
        auth::ensure_property(&s.db, ctx.org_id, pid).await?;
    }
    let mapped = |k: &str| spec.mapping.contains_key(k);
    let mut global_errors = Vec::new();
    if !mapped("unit_name") && !mapped("tenant_name") {
        global_errors.push("ต้องจับคู่อย่างน้อยคอลัมน์ \"เลขห้อง\" หรือ \"ชื่อผู้เช่า\"".to_string());
    }

    // ข้อมูลเดิมในองค์กร
    let properties: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, name FROM properties WHERE org_id = ?")
            .bind(ctx.org_id)
            .fetch_all(&s.db)
            .await?;
    let prop_by_name: HashMap<String, i64> = properties
        .iter()
        .map(|(id, n)| (n.trim().to_lowercase(), *id))
        .collect();
    let only_property = (properties.len() == 1).then(|| properties[0].0);
    if o.property_id.is_none()
        && !mapped("property_name")
        && only_property.is_none()
        && mapped("unit_name")
    {
        global_errors.push(if properties.is_empty() {
            "ยังไม่มีโครงการ — จับคู่คอลัมน์ชื่อโครงการเพื่อสร้างให้อัตโนมัติ หรือสร้างโครงการก่อน".to_string()
        } else {
            "มีหลายโครงการ — เลือกโครงการที่จะนำเข้า หรือจับคู่คอลัมน์ชื่อโครงการ".to_string()
        });
    }
    let units: Vec<(i64, i64, String, f64)> = sqlx::query_as(
        "SELECT u.id, u.property_id, u.name, u.rent_monthly FROM units u JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?",
    )
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    let mut unit_by_key: HashMap<(PropRef, String), (Option<i64>, f64)> = units
        .iter()
        .map(|(id, pid, name, rent)| {
            (
                (PropRef::Id(*pid), name.trim().to_lowercase()),
                (Some(*id), *rent),
            )
        })
        .collect();
    let tenants: Vec<(i64, String, String, String)> =
        sqlx::query_as("SELECT id, full_name, phone, id_card FROM tenants WHERE org_id = ? AND anonymized_at IS NULL")
            .bind(ctx.org_id)
            .fetch_all(&s.db)
            .await?;
    let mut tenant_known: HashMap<String, bool> = HashMap::new(); // key → มีอยู่แล้วในระบบ
    for (_, name, phone, id_card) in &tenants {
        for k in tenant_keys(
            &import::normalize_phone(phone),
            &import::normalize_id(id_card),
            name,
        ) {
            tenant_known.insert(k, true);
        }
        tenant_known.insert(format!("n:{}", name.trim().to_lowercase()), true);
    }
    let bookings: Vec<(i64, NaiveDate, Option<NaiveDate>)> = sqlx::query_as(
        "SELECT b.unit_id, b.start_date, b.end_date FROM bookings b JOIN units u ON u.id = b.unit_id
         JOIN properties p ON p.id = u.property_id WHERE p.org_id = ? AND b.status IN ('reserved','active')",
    )
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    let mut stays: HashMap<(PropRef, String), Vec<Stay>> = HashMap::new();
    for (unit_id, start, end) in bookings {
        if let Some((pid, name)) = units
            .iter()
            .find(|u| u.0 == unit_id)
            .map(|u| (u.1, u.2.trim().to_lowercase()))
        {
            stays
                .entry((PropRef::Id(pid), name))
                .or_default()
                .push((start, end));
        }
    }

    let today = Local::now().date_naive();
    let mut rows = Vec::new();
    let mut new_props: Vec<String> = Vec::new();
    for (i, raw) in sheet
        .rows
        .iter()
        .enumerate()
        .skip(header_row + 1)
        .take(import::MAX_ROWS)
    {
        let get = |k: &str| -> String {
            spec.mapping
                .get(k)
                .and_then(|c| raw.get(*c))
                .map(|v| v.trim().to_string())
                .unwrap_or_default()
        };
        let mut r = RowPlan {
            row: i + 1,
            status: "ok",
            ..Default::default()
        };
        if spec.mapping.keys().all(|k| get(k).is_empty()) {
            r.status = "empty";
            rows.push(r);
            continue;
        }
        let num = |k: &str, label: &str, r: &mut RowPlan| -> Option<f64> {
            let v = get(k);
            if v.is_empty() {
                return None;
            }
            match import::parse_number(&v) {
                Some(n) if n >= 0.0 => Some(n),
                _ => {
                    r.errors.push(format!("{label} \"{v}\" ไม่ใช่ตัวเลข"));
                    None
                }
            }
        };
        let date = |k: &str, label: &str, r: &mut RowPlan| -> Option<NaiveDate> {
            let v = get(k);
            if v.is_empty() {
                return None;
            }
            let d = import::parse_date(&v, o.date_order);
            if d.is_none() {
                r.errors.push(format!("{label} \"{v}\" อ่านเป็นวันที่ไม่ได้"));
            }
            d
        };
        r.note = get("note");

        // ห้อง
        let unit_name = get("unit_name");
        let has_unit_stuff = !unit_name.is_empty();
        if has_unit_stuff {
            let prop = if let Some(pid) = o.property_id {
                Some(PropRef::Id(pid))
            } else {
                let pname = get("property_name");
                if pname.is_empty() {
                    only_property.map(PropRef::Id)
                } else if let Some(pid) = prop_by_name.get(&pname.to_lowercase()) {
                    r.property = Some(pname.clone());
                    r.property_action = Some("existing");
                    Some(PropRef::Id(*pid))
                } else if o.create_properties {
                    r.property = Some(pname.clone());
                    r.property_action = Some("create");
                    if !new_props.contains(&pname.to_lowercase()) {
                        new_props.push(pname.to_lowercase());
                    }
                    Some(PropRef::New(pname.to_lowercase()))
                } else {
                    r.errors.push(format!("ไม่พบโครงการ \"{pname}\""));
                    None
                }
            };
            if prop.is_none() && r.errors.is_empty() {
                r.errors.push("ไม่ได้ระบุโครงการ".into());
            }
            let floor = num("floor", "ชั้น", &mut r).map(|f| f as i64);
            let rent = num("rent_monthly", "ค่าเช่า", &mut r);
            let daily = num("rate_daily", "ราคารายวัน", &mut r);
            r.unit = Some(unit_name.clone());
            if let Some(p) = &prop {
                let key = (p.clone(), unit_name.to_lowercase());
                match unit_by_key.get(&key) {
                    Some((Some(_), _)) => {
                        let changes = floor.is_some() || rent.is_some() || daily.is_some();
                        r.unit_action = Some(if o.update_units && changes {
                            "update"
                        } else {
                            "existing"
                        });
                    }
                    Some((None, _)) => {
                        r.unit_action = Some("existing");
                        r.warnings.push(format!("ห้อง {unit_name} ซ้ำกับแถวก่อนหน้า"));
                    }
                    None => {
                        r.unit_action = Some("create");
                        if rent.is_none() && get("rent_monthly").is_empty() {
                            r.warnings.push("ไม่มีค่าเช่า — ตั้งเป็น 0 แก้ภายหลังได้".into());
                        }
                        unit_by_key.insert(key, (None, rent.unwrap_or(0.0)));
                    }
                }
            }
            r.prop = prop;
            r.unit_data = Some(UnitData {
                name: unit_name.clone(),
                floor: floor.or_else(|| floor_from_name(&unit_name)),
                rent,
                daily,
            });
        }

        // ผู้เช่า
        let tenant_name = get("tenant_name");
        if !tenant_name.is_empty() {
            let phone = import::normalize_phone(&get("tenant_phone"));
            let id_card = import::normalize_id(&get("tenant_id_card"));
            let email = get("tenant_email");
            if !email.is_empty() && !email.contains('@') {
                r.warnings
                    .push(format!("อีเมล \"{email}\" ไม่ถูกต้อง — ข้ามช่องนี้"));
            }
            let nationality = match import::normalize_nationality(&get("tenant_nationality")) {
                Some(n) => n,
                None => {
                    r.warnings.push(format!(
                        "ไม่รู้จักสัญชาติ \"{}\" — ใช้รหัสประเทศ 2 ตัว เช่น US, CN",
                        get("tenant_nationality")
                    ));
                    String::new()
                }
            };
            let keys = tenant_keys(&phone, &id_card, &tenant_name);
            let existing = keys.iter().any(|k| tenant_known.contains_key(k));
            r.tenant_action = Some(if existing { "existing" } else { "create" });
            for k in &keys {
                tenant_known.entry(k.clone()).or_insert(false);
            }
            r.tenant = Some(tenant_name.clone());
            r.tenant_data = Some(TenantData {
                name: tenant_name,
                phone,
                email: if email.contains('@') {
                    email
                } else {
                    String::new()
                },
                id_card,
                address: get("tenant_address"),
                nationality: if nationality == "TH" {
                    String::new()
                } else {
                    nationality
                },
                keys,
            });
        }

        // สัญญา
        let start = date("start_date", "วันเริ่มสัญญา", &mut r);
        let end = date("end_date", "วันสิ้นสุดสัญญา", &mut r);
        let lease_rent = num("lease_rent", "ค่าเช่าตามสัญญา", &mut r);
        let deposit = num("deposit", "เงินประกัน", &mut r).unwrap_or(0.0);
        if r.tenant_data.is_some() && r.unit_data.is_some() && r.errors.is_empty() {
            let start = match start {
                Some(d) => d,
                None => {
                    r.warnings.push("ไม่มีวันเริ่มสัญญา — ใช้วันนี้".into());
                    today
                }
            };
            if end.is_some_and(|e| e <= start) {
                r.errors.push("วันสิ้นสุดสัญญาต้องหลังวันเริ่ม".into());
            } else if let Some(p) = &r.prop {
                let key = (
                    p.clone(),
                    r.unit_data
                        .as_ref()
                        .map(|u| u.name.to_lowercase())
                        .unwrap_or_default(),
                );
                let list = stays.entry(key).or_default();
                if list.iter().any(|b| overlaps(*b, (start, end))) {
                    r.lease_action = Some("skip");
                    r.warnings
                        .push("ห้องนี้มีสัญญา/การจองช่วงเดียวกันอยู่แล้ว — ข้ามการสร้างสัญญา".into());
                } else {
                    list.push((start, end));
                    r.lease_action = Some("create");
                    r.lease = Some(match end {
                        Some(e) => format!("{start} ถึง {e}"),
                        None => format!("ตั้งแต่ {start}"),
                    });
                    r.lease_data = Some(LeaseData {
                        start,
                        end,
                        price: lease_rent,
                        deposit,
                    });
                }
            }
        } else if r.tenant_data.is_none() && start.is_some() {
            r.warnings
                .push("มีวันเข้าพักแต่ไม่มีชื่อผู้เช่า — ข้ามการสร้างสัญญา".into());
        }

        // มิเตอร์
        let reading_date = date("reading_date", "วันที่จดมิเตอร์", &mut r).unwrap_or(today);
        for (key, kind, label) in [
            ("electric_reading", "electric", "เลขมิเตอร์ไฟ"),
            ("water_reading", "water", "เลขมิเตอร์น้ำ"),
        ] {
            if let Some(v) = num(key, label, &mut r) {
                if r.unit_data.is_some() {
                    r.meter_data.push((kind, v, reading_date));
                } else {
                    r.warnings.push(format!("มี{label}แต่ไม่มีเลขห้อง — ข้าม"));
                }
            }
        }
        r.meters = r.meter_data.len();
        if !has_unit_stuff && r.tenant_data.is_none() {
            r.errors.push("ไม่มีเลขห้องหรือชื่อผู้เช่า".into());
        }
        r.status = if !r.errors.is_empty() {
            "error"
        } else if !r.warnings.is_empty() {
            "warning"
        } else {
            "ok"
        };
        rows.push(r);
    }

    let mut sum = Summary::default();
    for r in rows.iter().filter(|r| r.status != "empty") {
        sum.rows += 1;
        match r.status {
            "error" => {
                sum.errors += 1;
                continue;
            }
            "warning" => sum.warnings += 1,
            _ => sum.ok += 1,
        }
        match r.unit_action {
            Some("create") => sum.units_create += 1,
            Some("update") => sum.units_update += 1,
            _ => {}
        }
        match r.tenant_action {
            Some("create") => sum.tenants_create += 1,
            Some("existing") => sum.tenants_existing += 1,
            _ => {}
        }
        match r.lease_action {
            Some("create") => sum.leases_create += 1,
            Some("skip") => sum.leases_skip += 1,
            _ => {}
        }
        sum.meters += r.meters;
    }
    // ผู้เช่าคนเดียวกันหลายแถว (หลายห้อง) นับครั้งเดียว
    let mut seen = std::collections::HashSet::new();
    sum.tenants_create = rows
        .iter()
        .filter(|r| r.status != "error" && r.tenant_action == Some("create"))
        .filter(|r| {
            let first = r
                .tenant_data
                .as_ref()
                .and_then(|t| t.keys.first().cloned())
                .unwrap_or_default();
            seen.insert(first)
        })
        .count();
    sum.properties_create = new_props.len();
    if properties.len() + new_props.len() > ctx.max_properties as usize && !new_props.is_empty() {
        global_errors.push(format!(
            "จำนวนโครงการจะเกินขีดจำกัดของแพ็กเกจ ({}) — อัปเกรดแพ็กเกจหรือเลือกโครงการเดิม",
            ctx.max_properties
        ));
    }
    if units.len() + sum.units_create > ctx.max_units as usize && sum.units_create > 0 {
        global_errors.push(format!(
            "จำนวนห้องจะเกินขีดจำกัดของแพ็กเกจ ({} ห้อง, มีอยู่ {} + นำเข้า {})",
            ctx.max_units,
            units.len(),
            sum.units_create
        ));
    }
    if sheet.rows.len().saturating_sub(header_row + 1) > import::MAX_ROWS {
        global_errors.push(format!(
            "ไฟล์มีมากกว่า {} แถว — แบ่งเป็นหลายไฟล์",
            import::MAX_ROWS
        ));
    }
    Ok((
        filename,
        Plan {
            headers,
            rows,
            summary: sum,
            global_errors,
        },
    ))
}

pub async fn preview(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(spec): Json<Spec>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let (_, p) = plan(&s, &ctx, id, &spec).await?;
    let rows: Vec<&RowPlan> = p.rows.iter().filter(|r| r.status != "empty").collect();
    Ok(Json(json!({
        "summary": p.summary,
        "global_errors": p.global_errors,
        "rows": rows,
    })))
}

// ---------- นำเข้าจริง ----------

pub async fn commit(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(spec): Json<Spec>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let (filename, p) = plan(&s, &ctx, id, &spec).await?;
    if !p.global_errors.is_empty() {
        return Err(AppError::BadRequest(p.global_errors.join(" / ")));
    }
    let o = &spec.options;
    let today = Local::now().date_naive();
    let mut tx = s.db.begin().await?;

    let mut prop_ids: HashMap<PropRef, i64> = HashMap::new();
    let mut unit_ids: HashMap<(i64, String), i64> = sqlx::query_as::<_, (i64, i64, String)>(
        "SELECT u.id, u.property_id, u.name FROM units u JOIN properties p ON p.id = u.property_id WHERE p.org_id = ?",
    )
    .bind(ctx.org_id)
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|(id, pid, name)| ((pid, name.trim().to_lowercase()), id))
    .collect();
    let mut tenant_ids: HashMap<String, i64> = HashMap::new();
    for (tid, name, phone, id_card) in sqlx::query_as::<_, (i64, String, String, String)>(
        "SELECT id, full_name, phone, id_card FROM tenants WHERE org_id = ? AND anonymized_at IS NULL ORDER BY id",
    )
    .bind(ctx.org_id)
    .fetch_all(&mut *tx)
    .await?
    {
        for k in tenant_keys(&import::normalize_phone(&phone), &import::normalize_id(&id_card), &name) {
            tenant_ids.entry(k).or_insert(tid);
        }
        tenant_ids
            .entry(format!("n:{}", name.trim().to_lowercase()))
            .or_insert(tid);
    }

    let mut touched_units = Vec::new();
    let mut done = Summary::default();
    let mut skipped = Vec::new();
    for r in &p.rows {
        if r.status == "empty" {
            continue;
        }
        if r.status == "error" {
            skipped.push(json!({ "row": r.row, "errors": r.errors }));
            continue;
        }
        let mut unit_id = None;
        if let (Some(prop), Some(u)) = (&r.prop, &r.unit_data) {
            let pid = match prop {
                PropRef::Id(id) => *id,
                PropRef::New(name) => match prop_ids.get(prop) {
                    Some(id) => *id,
                    None => {
                        let display = r.property.clone().unwrap_or_else(|| name.clone());
                        let id: i64 = sqlx::query_scalar(
                            "INSERT INTO properties (org_id, name, kind) VALUES (?,?,?) RETURNING id",
                        )
                        .bind(ctx.org_id)
                        .bind(display.trim())
                        .bind(&o.property_kind)
                        .fetch_one(&mut *tx)
                        .await?;
                        prop_ids.insert(prop.clone(), id);
                        done.properties_create += 1;
                        id
                    }
                },
            };
            let key = (pid, u.name.trim().to_lowercase());
            let id = match unit_ids.get(&key) {
                Some(id) => {
                    if o.update_units
                        && (u.floor.is_some() || u.rent.is_some() || u.daily.is_some())
                    {
                        sqlx::query(
                            "UPDATE units SET floor = COALESCE(?, floor), rent_monthly = COALESCE(?, rent_monthly),
                                rate_daily = COALESCE(?, rate_daily) WHERE id = ?",
                        )
                        .bind(u.floor)
                        .bind(u.rent)
                        .bind(u.daily)
                        .bind(id)
                        .execute(&mut *tx)
                        .await?;
                        done.units_update += 1;
                    }
                    *id
                }
                None => {
                    let id: i64 = sqlx::query_scalar(
                        "INSERT INTO units (property_id, name, floor, rent_monthly, rate_daily, note)
                         VALUES (?,?,?,?,?,?) RETURNING id",
                    )
                    .bind(pid)
                    .bind(u.name.trim())
                    .bind(u.floor.unwrap_or(1))
                    .bind(u.rent.unwrap_or(0.0))
                    .bind(u.daily.unwrap_or(0.0))
                    .bind(if r.tenant_data.is_none() { r.note.as_str() } else { "" })
                    .fetch_one(&mut *tx)
                    .await?;
                    unit_ids.insert(key, id);
                    done.units_create += 1;
                    id
                }
            };
            unit_id = Some(id);
        }

        let mut tenant_id = None;
        if let Some(t) = &r.tenant_data {
            let found = t.keys.iter().find_map(|k| tenant_ids.get(k)).copied();
            let id = match found {
                Some(id) => {
                    done.tenants_existing += 1;
                    id
                }
                None => {
                    let id: i64 = sqlx::query_scalar(
                        "INSERT INTO tenants (org_id, full_name, phone, email, id_card, address, note, nationality,
                            lang, portal_token)
                         VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id",
                    )
                    .bind(ctx.org_id)
                    .bind(t.name.trim())
                    .bind(&t.phone)
                    .bind(&t.email)
                    .bind(&t.id_card)
                    .bind(&t.address)
                    .bind(&r.note)
                    .bind(&t.nationality)
                    .bind(if t.nationality.is_empty() { "th" } else { "en" })
                    .bind(super::tenants::new_portal_token())
                    .fetch_one(&mut *tx)
                    .await?;
                    for k in &t.keys {
                        tenant_ids.insert(k.clone(), id);
                    }
                    done.tenants_create += 1;
                    id
                }
            };
            tenant_id = Some(id);
        }

        if let (Some(l), Some(uid), Some(tid)) = (&r.lease_data, unit_id, tenant_id) {
            let rent: f64 = sqlx::query_scalar("SELECT rent_monthly FROM units WHERE id = ?")
                .bind(uid)
                .fetch_one(&mut *tx)
                .await?;
            let ended = l.end.is_some_and(|e| e < today);
            sqlx::query(
                "INSERT INTO bookings (unit_id, tenant_id, kind, start_date, end_date, price, deposit_amount,
                    deposit_status, status, source)
                 VALUES (?, ?, 'lease', ?, ?, ?, ?, ?, ?, 'import')",
            )
            .bind(uid)
            .bind(tid)
            .bind(l.start)
            .bind(l.end)
            .bind(l.price.unwrap_or(rent))
            .bind(l.deposit)
            .bind(if o.deposit_paid && l.deposit > 0.0 { "paid" } else { "pending" })
            .bind(if ended {
                "completed"
            } else if l.start <= today {
                "active"
            } else {
                "reserved"
            })
            .execute(&mut *tx)
            .await?;
            touched_units.push(uid);
            done.leases_create += 1;
        } else if r.lease_action == Some("skip") {
            done.leases_skip += 1;
        }

        if let Some(uid) = unit_id {
            for (kind, value, date) in &r.meter_data {
                // นำเข้าไฟล์เดิมซ้ำ: ไม่บันทึกเลขมิเตอร์วันเดียวกันซ้ำ
                let n = sqlx::query(
                    "INSERT INTO meter_readings (unit_id, meter_type, reading_date, value, ocr_raw)
                     SELECT ?1, ?2, ?3, ?4, 'นำเข้าจากไฟล์'
                     WHERE NOT EXISTS (SELECT 1 FROM meter_readings
                                       WHERE unit_id = ?1 AND meter_type = ?2 AND reading_date = ?3)",
                )
                .bind(uid)
                .bind(kind)
                .bind(date)
                .bind(value)
                .execute(&mut *tx)
                .await?
                .rows_affected();
                done.meters += n as usize;
            }
        }
        done.rows += 1;
    }
    touched_units.sort_unstable();
    touched_units.dedup();
    for uid in touched_units {
        super::bookings::sync_unit_status(&mut tx, uid).await?;
    }
    done.errors = skipped.len();
    let result = json!({ "summary": done, "skipped": skipped });
    sqlx::query("UPDATE imports SET status = 'committed', result = ? WHERE id = ?")
        .bind(result.to_string())
        .bind(id)
        .execute(&mut *tx)
        .await?;
    // จำการจับคู่ไว้ใช้กับไฟล์รูปแบบเดียวกันครั้งหน้า
    sqlx::query(
        "INSERT INTO import_mappings (org_id, name, signature, mapping, options) VALUES (?,?,?,?,?)
         ON CONFLICT (org_id, signature) DO UPDATE SET mapping = excluded.mapping, options = excluded.options,
            name = excluded.name, updated_at = datetime('now')",
    )
    .bind(ctx.org_id)
    .bind(&filename)
    .bind(import::header_signature(&p.headers))
    .bind(serde_json::to_string(&spec.mapping).unwrap_or_default())
    .bind(serde_json::to_string(&spec.options).unwrap_or_default())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit::record(
        &s.db,
        &ctx,
        "import.commit",
        "import",
        Some(id),
        Some(json!({ "file": filename, "summary": done })),
    )
    .await;
    Ok(Json(result))
}

// ---------- การจับคู่ที่บันทึกไว้ / แม่แบบ ----------

pub async fn mappings(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let rows: Vec<(i64, String, String, String)> = sqlx::query_as(
        "SELECT id, name, mapping, updated_at FROM import_mappings WHERE org_id = ? ORDER BY updated_at DESC",
    )
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(json!(rows
        .into_iter()
        .map(|(id, name, mapping, at)| json!({
            "id": id, "name": name, "fields": serde_json::from_str::<Value>(&mapping).map(|m| m.as_object().map(|o| o.len()).unwrap_or(0)).unwrap_or(0),
            "updated_at": at,
        }))
        .collect::<Vec<_>>())))
}

pub async fn delete_mapping(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    sqlx::query("DELETE FROM import_mappings WHERE id = ? AND org_id = ?")
        .bind(id)
        .bind(ctx.org_id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

/// ไฟล์ตัวอย่าง (ไม่บังคับใช้ — ไฟล์รูปแบบอื่นก็จับคู่คอลัมน์เองได้)
pub async fn template() -> impl IntoResponse {
    let body = "\u{feff}โครงการ,เลขห้อง,ชั้น,ค่าเช่า,ชื่อผู้เช่า,เบอร์โทร,เลขบัตรประชาชน,วันเริ่มสัญญา,วันสิ้นสุดสัญญา,เงินประกัน,มิเตอร์ไฟ,มิเตอร์น้ำ,หมายเหตุ\n\
                บ้านสวน,101,1,3500,สมชาย ใจดี,0812345678,1101700012345,01/06/2567,31/05/2568,7000,1234,567,\n\
                บ้านสวน,102,1,3500,,,,,,,1100,450,ห้องว่าง\n";
    (
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"estate-import-template.csv\"",
            ),
        ],
        body,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helpers() {
        assert_eq!(column_letter(0), "A");
        assert_eq!(column_letter(25), "Z");
        assert_eq!(column_letter(26), "AA");
        assert_eq!(floor_from_name("203"), Some(2));
        assert_eq!(floor_from_name("1205"), Some(12));
        assert_eq!(floor_from_name("A-305"), Some(3));
        assert_eq!(floor_from_name("12"), None);
        let d = |s: &str| s.parse::<NaiveDate>().unwrap();
        assert!(overlaps(
            (d("2024-01-01"), None),
            (d("2025-01-01"), Some(d("2025-02-01")))
        ));
        assert!(!overlaps(
            (d("2024-01-01"), Some(d("2024-06-01"))),
            (d("2024-06-01"), None)
        ));
    }
}
