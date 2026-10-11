//! แจ้งที่พักคนต่างด้าว (ตม.30)
//!
//! เจ้าบ้าน/ผู้ให้เช่าที่มีคนต่างชาติเข้าพักต้องแจ้งเจ้าหน้าที่ตรวจคนเข้าเมืองภายใน 24 ชั่วโมง
//! ระบบสร้างรายการให้อัตโนมัติจากการจองของผู้เช่าที่ไม่ใช่สัญชาติไทย แจ้งเตือนทีมงานทาง LINE
//! รวบรวมข้อมูลที่ต้องใช้กรอก และเก็บเลขที่รับแจ้งเป็นหลักฐาน — การยื่นแจ้งทำในระบบของ ตม. เอง

use axum::{
    extract::{Multipart, Path, Query, State},
    http::header,
    response::IntoResponse,
    Json,
};
use chrono::{Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    audit,
    auth::OrgCtx,
    error::{AppError, AppResult},
    line::{self, OrgLine},
    uploads, AppState,
};

/// สร้างรายการ ตม.30 ให้การจองของผู้เช่าต่างชาติที่ยังไม่มีรายการ (เฉพาะที่เข้าพักไม่เกิน 30 วันที่ผ่านมา)
pub async fn sync(db: &sqlx::SqlitePool, org_id: Option<i64>) -> AppResult<u64> {
    Ok(sqlx::query(
        "INSERT INTO tm30_reports (org_id, tenant_id, booking_id, check_in)
         SELECT p.org_id, t.id, b.id, b.start_date
         FROM bookings b
         JOIN tenants t ON t.id = b.tenant_id
         JOIN units u ON u.id = b.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE (?1 IS NULL OR p.org_id = ?1)
           AND t.nationality NOT IN ('', 'TH') AND t.anonymized_at IS NULL
           AND b.status IN ('reserved','active')
           AND b.start_date >= date('now', 'localtime', '-30 days')
           AND NOT EXISTS (SELECT 1 FROM tm30_reports r WHERE r.booking_id = b.id)",
    )
    .bind(org_id)
    .execute(db)
    .await?
    .rows_affected())
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Report {
    id: i64,
    tenant_id: i64,
    booking_id: i64,
    check_in: NaiveDate,
    status: String,
    reference_no: String,
    submitted_at: Option<String>,
    submitted_by_name: Option<String>,
    proof_url: Option<String>,
    note: String,
    full_name: String,
    nationality: String,
    passport_no: String,
    gender: String,
    birth_date: Option<String>,
    arrival_date: Option<String>,
    visa_type: String,
    visa_expiry: Option<String>,
    phone: String,
    unit_name: String,
    property_name: String,
    property_address: String,
    booking_kind: String,
    check_out: Option<String>,
    #[sqlx(skip)]
    deadline: Option<NaiveDate>,
    #[sqlx(skip)]
    overdue_days: i64,
    #[sqlx(skip)]
    missing: Vec<&'static str>,
}

const SELECT: &str = "SELECT r.id, r.tenant_id, r.booking_id, r.check_in, r.status, r.reference_no, r.submitted_at,
        us.name AS submitted_by_name, r.proof_url, r.note, t.full_name, t.nationality, t.id_card AS passport_no,
        t.gender, t.birth_date, t.arrival_date, t.visa_type, t.visa_expiry, t.phone,
        u.name AS unit_name, p.name AS property_name, p.address AS property_address, b.kind AS booking_kind,
        b.end_date AS check_out
    FROM tm30_reports r
    JOIN tenants t ON t.id = r.tenant_id
    JOIN bookings b ON b.id = r.booking_id
    JOIN units u ON u.id = b.unit_id
    JOIN properties p ON p.id = u.property_id
    LEFT JOIN users us ON us.id = r.submitted_by";

impl Report {
    fn enrich(mut self, today: NaiveDate) -> Self {
        // ต้องแจ้งภายใน 24 ชั่วโมงหลังเข้าพัก → นับถึงสิ้นวันถัดไป
        let deadline = self.check_in + Duration::days(1);
        self.deadline = Some(deadline);
        self.overdue_days = if self.status == "pending" {
            (today - deadline).num_days().max(0)
        } else {
            0
        };
        let mut missing = Vec::new();
        if self.passport_no.trim().is_empty() {
            missing.push("passport_no");
        }
        if self.arrival_date.is_none() {
            missing.push("arrival_date");
        }
        if self.visa_type.trim().is_empty() {
            missing.push("visa_type");
        }
        if self.gender.is_empty() {
            missing.push("gender");
        }
        if self.birth_date.is_none() {
            missing.push("birth_date");
        }
        self.missing = missing;
        self
    }
}

#[derive(Deserialize)]
pub struct ListQuery {
    status: Option<String>,
}

async fn load_list(s: &AppState, org_id: i64, status: Option<&str>) -> AppResult<Vec<Report>> {
    sync(&s.db, Some(org_id)).await?;
    let today = Local::now().date_naive();
    let rows: Vec<Report> = sqlx::query_as(&format!(
        "{SELECT} WHERE r.org_id = ?1 AND (?2 IS NULL OR r.status = ?2)
         ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.check_in DESC LIMIT 300"
    ))
    .bind(org_id)
    .bind(status)
    .fetch_all(&s.db)
    .await?;
    Ok(rows.into_iter().map(|r| r.enrich(today)).collect())
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    let rows = load_list(&s, ctx.org_id, q.status.as_deref()).await?;
    let today = Local::now().date_naive();
    let visa_soon: Vec<Value> = sqlx::query_as::<_, (i64, String, String, String)>(
        "SELECT t.id, t.full_name, t.nationality, t.visa_expiry FROM tenants t
         WHERE t.org_id = ? AND t.visa_expiry IS NOT NULL AND t.anonymized_at IS NULL
           AND t.visa_expiry <= date('now', 'localtime', '+30 days')
           AND EXISTS (SELECT 1 FROM bookings b WHERE b.tenant_id = t.id AND b.status IN ('reserved','active'))
         ORDER BY t.visa_expiry",
    )
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?
    .into_iter()
    .map(|(id, name, nat, exp)| {
        json!({ "tenant_id": id, "full_name": name, "nationality": nat, "visa_expiry": exp })
    })
    .collect();
    let pending = rows.iter().filter(|r| r.status == "pending").count();
    let overdue = rows.iter().filter(|r| r.overdue_days > 0).count();
    let due_today = rows
        .iter()
        .filter(|r| r.status == "pending" && r.deadline == Some(today))
        .count();
    Ok(Json(json!({
        "reports": rows,
        "summary": { "pending": pending, "overdue": overdue, "due_today": due_today },
        "visa_expiring": visa_soon,
    })))
}

async fn fetch(s: &AppState, org_id: i64, id: i64) -> AppResult<Report> {
    let r: Report = sqlx::query_as(&format!("{SELECT} WHERE r.id = ? AND r.org_id = ?"))
        .bind(id)
        .bind(org_id)
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(r.enrich(Local::now().date_naive()))
}

/// บันทึกว่ายื่นแจ้งแล้ว (multipart: reference_no, note, photo = ใบรับแจ้ง)
pub async fn submit(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    form: Multipart,
) -> AppResult<Json<Report>> {
    ctx.require_admin()?;
    fetch(&s, ctx.org_id, id).await?;
    let form = uploads::parse_for(&s, ctx.org_id, form, "tm30").await?;
    let reference = form.text("reference_no").unwrap_or_default().to_string();
    if reference.is_empty() && form.photos.is_empty() {
        return Err(AppError::BadRequest(
            "กรุณาระบุเลขที่รับแจ้ง หรือแนบรูปใบรับแจ้ง".into(),
        ));
    }
    sqlx::query(
        "UPDATE tm30_reports SET status = 'submitted', reference_no = ?, proof_url = COALESCE(?, proof_url),
            note = ?, submitted_at = datetime('now'), submitted_by = ?
         WHERE id = ?",
    )
    .bind(&reference)
    .bind(form.photos.first())
    .bind(form.text("note").unwrap_or_default())
    .bind(ctx.user.id)
    .bind(id)
    .execute(&s.db)
    .await?;
    audit::record(
        &s.db,
        &ctx,
        "tm30.submit",
        "tm30",
        Some(id),
        Some(json!({ "reference_no": reference })),
    )
    .await;
    Ok(Json(fetch(&s, ctx.org_id, id).await?))
}

#[derive(Deserialize)]
pub struct SkipInput {
    reason: String,
}

/// ไม่ต้องแจ้ง (เช่น ผู้เช่ามีถิ่นที่อยู่ถาวร หรือโรงแรมแจ้งแล้ว)
pub async fn skip(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(i): Json<SkipInput>,
) -> AppResult<Json<Report>> {
    ctx.require_admin()?;
    fetch(&s, ctx.org_id, id).await?;
    let reason = i.reason.trim();
    if reason.is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุเหตุผล".into()));
    }
    sqlx::query("UPDATE tm30_reports SET status = 'not_required', note = ? WHERE id = ?")
        .bind(reason)
        .bind(id)
        .execute(&s.db)
        .await?;
    audit::record(
        &s.db,
        &ctx,
        "tm30.skip",
        "tm30",
        Some(id),
        Some(json!({ "reason": reason })),
    )
    .await;
    Ok(Json(fetch(&s, ctx.org_id, id).await?))
}

/// เปิดกลับเป็นรอแจ้ง (บันทึกผิด)
pub async fn reopen(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Report>> {
    ctx.require_admin()?;
    fetch(&s, ctx.org_id, id).await?;
    sqlx::query(
        "UPDATE tm30_reports SET status = 'pending', submitted_at = NULL, submitted_by = NULL WHERE id = ?",
    )
    .bind(id)
    .execute(&s.db)
    .await?;
    Ok(Json(fetch(&s, ctx.org_id, id).await?))
}

fn csv_field(v: &str) -> String {
    // กันสูตร Excel (CSV injection) และใส่เครื่องหมายคำพูดเมื่อจำเป็น
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

/// ส่งออกรายการรอแจ้งเป็น CSV (เปิดใน Excel ได้) — ช่วยกรอกข้อมูลในระบบ ตม.
pub async fn export(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<ListQuery>,
) -> AppResult<impl IntoResponse> {
    ctx.require_admin()?;
    let rows = load_list(
        &s,
        ctx.org_id,
        Some(q.status.as_deref().unwrap_or("pending")),
    )
    .await?;
    let mut out = String::from("\u{feff}");
    out.push_str("ชื่อ-นามสกุล,สัญชาติ,เลขหนังสือเดินทาง,เพศ,วันเกิด,วันที่เดินทางเข้า,ประเภทวีซ่า,วีซ่าครบกำหนด,วันที่เข้าพัก,ครบกำหนดแจ้ง,โครงการ,ห้อง,ที่อยู่ที่พัก,โทรศัพท์\n");
    for r in &rows {
        let cols = [
            r.full_name.clone(),
            r.nationality.clone(),
            r.passport_no.clone(),
            r.gender.clone(),
            r.birth_date.clone().unwrap_or_default(),
            r.arrival_date.clone().unwrap_or_default(),
            r.visa_type.clone(),
            r.visa_expiry.clone().unwrap_or_default(),
            r.check_in.to_string(),
            r.deadline.map(|d| d.to_string()).unwrap_or_default(),
            r.property_name.clone(),
            r.unit_name.clone(),
            r.property_address.clone(),
            r.phone.clone(),
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
    audit::record(
        &s.db,
        &ctx,
        "tm30.export",
        "tm30",
        None,
        Some(json!({ "rows": rows.len() })),
    )
    .await;
    Ok((
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"tm30.csv\"",
            ),
        ],
        out,
    ))
}

// ---------- แจ้งเตือนทีมงาน ----------

async fn alert_org(s: &AppState, org: &OrgLine) -> AppResult<usize> {
    let due: Vec<(i64, String, String, String, NaiveDate)> = sqlx::query_as(
        "SELECT r.id, t.full_name, t.nationality, u.name, r.check_in FROM tm30_reports r
         JOIN tenants t ON t.id = r.tenant_id JOIN bookings b ON b.id = r.booking_id JOIN units u ON u.id = b.unit_id
         WHERE r.org_id = ? AND r.status = 'pending' AND r.alerted_at IS NULL
           AND r.check_in <= date('now', 'localtime')",
    )
    .bind(org.org_id)
    .fetch_all(&s.db)
    .await?;
    if due.is_empty() {
        return Ok(0);
    }
    let targets: Vec<String> = sqlx::query_scalar(
        "SELECT line_user_id FROM org_members WHERE org_id = ? AND line_user_id IS NOT NULL
           AND role IN ('owner','admin')",
    )
    .bind(org.org_id)
    .fetch_all(&s.db)
    .await?;
    if targets.is_empty() {
        return Ok(0);
    }
    let url = format!("{}/tm30", s.public_url);
    let rows = due
        .iter()
        .take(8)
        .map(|(_, name, nat, unit, check_in)| {
            (
                format!("{name} ({nat}) ห้อง {unit}"),
                crate::thai::short_date(*check_in + Duration::days(1)),
                false,
            )
        })
        .collect();
    let bubble = line::card(
        org,
        "แจ้งที่พักคนต่างด้าว (ตม.30)",
        "ต้องแจ้ง ตม. ภายใน 24 ชั่วโมงหลังเข้าพัก — กำหนดแจ้งด้านขวา",
        rows,
        ("เปิดรายการ ตม.30", &url),
    );
    for to in targets {
        let r = s
            .line
            .push(
                &org.token,
                &to,
                vec![line::flex("มีผู้เช่าต่างชาติต้องแจ้ง ตม.30", bubble.clone())],
            )
            .await;
        sqlx::query(
            "INSERT INTO line_messages (org_id, kind, status, error) VALUES (?, 'tm30', ?, ?)",
        )
        .bind(org.org_id)
        .bind(if r.is_ok() { "sent" } else { "failed" })
        .bind(r.err())
        .execute(&s.db)
        .await?;
    }
    for (id, ..) in &due {
        sqlx::query("UPDATE tm30_reports SET alerted_at = datetime('now') WHERE id = ?")
            .bind(id)
            .execute(&s.db)
            .await?;
    }
    Ok(due.len())
}

/// สร้างรายการใหม่ทุกองค์กร แล้วแจ้งเตือนทีมงานที่เชื่อม LINE (ครั้งเดียวต่อรายการ)
pub async fn run_alerts(s: &AppState) -> AppResult<usize> {
    sync(&s.db, None).await?;
    let orgs: Vec<i64> = sqlx::query_scalar(
        "SELECT DISTINCT org_id FROM tm30_reports WHERE status = 'pending' AND alerted_at IS NULL",
    )
    .fetch_all(&s.db)
    .await?;
    let mut sent = 0;
    for org_id in orgs {
        let org = line::load(&s.db, org_id).await?;
        if org.ready() {
            sent += alert_org(s, &org).await?;
        }
    }
    Ok(sent)
}

pub fn spawn_alerts(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            tick.tick().await;
            if let Err(e) = run_alerts(&state).await {
                tracing::warn!(error = %e, "แจ้งเตือน ตม.30 ไม่สำเร็จ");
            }
        }
    });
}
