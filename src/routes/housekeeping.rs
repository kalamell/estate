//! งานแม่บ้าน: สถานะความสะอาดของห้อง งานทำความสะอาดหลังเช็คเอาท์ เช็กลิสต์ รูปภาพ และแจ้งพนักงานทาง LINE

use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::validate_in;
use crate::{
    auth::{ensure_unit, OrgCtx},
    error::{AppError, AppResult},
    line::{self, card, flex, OrgLine},
    thai::short_date,
    uploads, AppState,
};

const KINDS: &[&str] = &[
    "checkout_clean",
    "stayover",
    "deep_clean",
    "inspection",
    "maintenance",
];
const HK_STATUSES: &[&str] = &["clean", "dirty", "in_progress"];

pub(crate) fn kind_label(kind: &str) -> &'static str {
    match kind {
        "checkout_clean" => "ทำความสะอาดหลังเช็คเอาท์",
        "stayover" => "ทำความสะอาดระหว่างเข้าพัก",
        "deep_clean" => "ทำความสะอาดใหญ่",
        "inspection" => "ตรวจห้อง",
        _ => "ซ่อมบำรุง",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckItem {
    label: String,
    #[serde(default)]
    done: bool,
}

fn default_checklist(kind: &str) -> Vec<CheckItem> {
    let items: &[&str] = match kind {
        "checkout_clean" => &[
            "เปลี่ยนผ้าปูที่นอนและปลอกหมอน",
            "เปลี่ยนผ้าเช็ดตัว",
            "ทำความสะอาดห้องน้ำ",
            "ดูดฝุ่น / ถูพื้น",
            "ทิ้งขยะ เปลี่ยนถุง",
            "เติมของใช้ (สบู่ แชมพู ทิชชู่ น้ำดื่ม)",
            "ตรวจอุปกรณ์และความเสียหาย",
            "ตรวจของลืม",
        ],
        "stayover" => &["เก็บขยะ", "จัดเตียง", "เติมของใช้", "เช็ดห้องน้ำ"],
        "deep_clean" => &[
            "ล้างแอร์ / ทำความสะอาดฟิลเตอร์",
            "ทำความสะอาดตู้และลิ้นชัก",
            "เช็ดกระจกและหน้าต่าง",
            "ขัดห้องน้ำและยาแนว",
            "ทำความสะอาดระเบียง",
            "ตรวจและถ่ายรูปสภาพห้อง",
        ],
        "inspection" => &[
            "ตรวจความสะอาด",
            "ตรวจอุปกรณ์ไฟฟ้า",
            "ตรวจประปา",
            "ถ่ายรูปสภาพห้อง",
        ],
        _ => &["ตรวจสอบปัญหา", "ซ่อม / เปลี่ยนอะไหล่", "ทดสอบการใช้งาน"],
    };
    items
        .iter()
        .map(|l| CheckItem {
            label: (*l).into(),
            done: false,
        })
        .collect()
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Task {
    id: i64,
    unit_id: i64,
    unit_name: String,
    property_id: i64,
    property_name: String,
    booking_id: Option<i64>,
    guest_name: Option<String>,
    kind: String,
    status: String,
    due_date: NaiveDate,
    assignee_user_id: Option<i64>,
    assignee_name: Option<String>,
    notes: String,
    #[sqlx(json)]
    checklist: Vec<CheckItem>,
    #[sqlx(json)]
    photos: Vec<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
    created_at: String,
}

const SELECT: &str = "SELECT h.id, h.unit_id, u.name AS unit_name, u.property_id, p.name AS property_name, h.booking_id,
        t.full_name AS guest_name, h.kind, h.status, h.due_date, h.assignee_user_id, a.name AS assignee_name, h.notes,
        h.checklist, h.photos, h.started_at, h.completed_at, h.created_at
    FROM housekeeping_tasks h JOIN units u ON u.id = h.unit_id JOIN properties p ON p.id = u.property_id
    LEFT JOIN bookings b ON b.id = h.booking_id LEFT JOIN tenants t ON t.id = b.tenant_id
    LEFT JOIN users a ON a.id = h.assignee_user_id";

async fn fetch(db: &SqlitePool, org_id: i64, id: i64) -> AppResult<Task> {
    Ok(
        sqlx::query_as(&format!("{SELECT} WHERE h.id = ? AND h.org_id = ?"))
            .bind(id)
            .bind(org_id)
            .fetch_one(db)
            .await?,
    )
}

async fn set_unit_status(db: &SqlitePool, unit_id: i64, status: &str) -> AppResult<()> {
    sqlx::query("UPDATE units SET housekeeping_status = ? WHERE id = ?")
        .bind(status)
        .bind(unit_id)
        .execute(db)
        .await?;
    Ok(())
}

/// สร้างงาน (ไม่ซ้ำต่อการจองเดียวกัน) — งานทำความสะอาดทำให้ห้องเป็น "รอทำความสะอาด" ทันที
pub(crate) struct NewTask<'a> {
    pub unit_id: i64,
    pub booking_id: Option<i64>,
    pub kind: &'a str,
    pub due_date: NaiveDate,
    pub assignee: Option<i64>,
    pub notes: &'a str,
}

pub(crate) async fn create_task(
    state: &AppState,
    org_id: i64,
    t: NewTask<'_>,
) -> AppResult<Option<i64>> {
    let id: Option<i64> = sqlx::query_scalar(
        "INSERT INTO housekeeping_tasks (org_id, unit_id, booking_id, kind, due_date, assignee_user_id, notes, checklist)
         VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING id",
    )
    .bind(org_id)
    .bind(t.unit_id)
    .bind(t.booking_id)
    .bind(t.kind)
    .bind(t.due_date)
    .bind(t.assignee)
    .bind(t.notes)
    .bind(sqlx::types::Json(default_checklist(t.kind)))
    .fetch_optional(&state.db)
    .await?;
    if let Some(id) = id {
        if matches!(t.kind, "checkout_clean" | "deep_clean") {
            set_unit_status(&state.db, t.unit_id, "dirty").await?;
        }
        notify(state, org_id, id);
    }
    Ok(id)
}

/// สร้างงานทำความสะอาดเมื่อแขกรายวันเช็คเอาท์
pub(crate) async fn on_checkout(state: &AppState, booking_id: i64) -> AppResult<()> {
    let row: Option<(i64, i64, String)> = sqlx::query_as(
        "SELECT p.org_id, b.unit_id, b.kind FROM bookings b JOIN units u ON u.id = b.unit_id
         JOIN properties p ON p.id = u.property_id WHERE b.id = ?",
    )
    .bind(booking_id)
    .fetch_optional(&state.db)
    .await?;
    if let Some((org_id, unit_id, kind)) = row {
        let task = if kind == "short_stay" {
            "checkout_clean"
        } else {
            "deep_clean"
        };
        let new = NewTask {
            unit_id,
            booking_id: Some(booking_id),
            kind: task,
            due_date: Local::now().date_naive(),
            assignee: None,
            notes: "",
        };
        create_task(state, org_id, new).await?;
    }
    Ok(())
}

/// ทุกชั่วโมง: แขกรายวันที่ครบกำหนดเช็คเอาท์วันนี้/เมื่อวาน แต่ยังไม่มีงาน → สร้างงานให้
pub async fn run_auto_tasks(state: &AppState) -> AppResult<usize> {
    let due: Vec<i64> = sqlx::query_scalar(
        "SELECT b.id FROM bookings b
         WHERE b.kind = 'short_stay' AND b.status IN ('active','completed')
           AND b.end_date BETWEEN date('now', 'localtime', '-1 day') AND date('now', 'localtime')
           AND NOT EXISTS (SELECT 1 FROM housekeeping_tasks h WHERE h.booking_id = b.id)",
    )
    .fetch_all(&state.db)
    .await?;
    for id in &due {
        on_checkout(state, *id).await?;
    }
    Ok(due.len())
}

pub fn spawn_auto_tasks(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            tick.tick().await;
            if let Err(e) = run_auto_tasks(&state).await {
                tracing::warn!(error = %e, "สร้างงานแม่บ้านอัตโนมัติไม่สำเร็จ");
            }
        }
    });
}

// ---------- แจ้งพนักงานทาง LINE ----------

fn notify(state: &AppState, org_id: i64, task_id: i64) {
    line::spawn_auto(
        state,
        org_id,
        |o| o.auto_housekeeping,
        move |st, org| async move { notify_staff(&st, &org, task_id).await },
    );
}

/// ส่งถึงผู้รับผิดชอบ (ถ้าเชื่อม LINE) ไม่เช่นนั้นส่งถึงพนักงานทุกคนที่เชื่อมไว้
pub(crate) async fn notify_staff(state: &AppState, org: &OrgLine, task_id: i64) -> AppResult<()> {
    let task = fetch(&state.db, org.org_id, task_id).await?;
    let assigned: Option<String> = match task.assignee_user_id {
        Some(uid) => sqlx::query_scalar(
            "SELECT line_user_id FROM org_members WHERE org_id = ? AND user_id = ?",
        )
        .bind(org.org_id)
        .bind(uid)
        .fetch_optional(&state.db)
        .await?
        .flatten(),
        None => None,
    };
    let targets: Vec<String> = match assigned {
        Some(id) => vec![id],
        None => sqlx::query_scalar(
            "SELECT line_user_id FROM org_members WHERE org_id = ? AND line_user_id IS NOT NULL",
        )
        .bind(org.org_id)
        .fetch_all(&state.db)
        .await?,
    };
    let url = format!("{}/housekeeping?task={}", state.public_url, task.id);
    let mut rows = vec![("กำหนด".to_string(), short_date(task.due_date), false)];
    if let Some(g) = &task.guest_name {
        rows.push(("แขก".into(), g.clone(), false));
    }
    if let Some(a) = &task.assignee_name {
        rows.push(("ผู้รับผิดชอบ".into(), a.clone(), false));
    }
    let bubble = card(
        org,
        &format!("งานใหม่: {}", kind_label(&task.kind)),
        &format!("ห้อง {} · {}", task.unit_name, task.property_name),
        rows,
        ("เปิดดูงาน", &url),
    );
    for to in targets {
        let result = state
            .line
            .push(
                &org.token,
                &to,
                vec![flex(
                    format!("งาน{} ห้อง {}", kind_label(&task.kind), task.unit_name),
                    bubble.clone(),
                )],
            )
            .await;
        sqlx::query("INSERT INTO line_messages (org_id, kind, status, error) VALUES (?, 'housekeeping', ?, ?)")
            .bind(org.org_id)
            .bind(if result.is_ok() { "sent" } else { "failed" })
            .bind(result.err())
            .execute(&state.db)
            .await?;
    }
    Ok(())
}

/// คำสั่ง "งาน" ในแชตของพนักงาน: งานที่ยังไม่เสร็จถึงวันนี้
pub(crate) async fn staff_tasks_reply(
    state: &AppState,
    org: &OrgLine,
    user_id: i64,
) -> AppResult<Value> {
    let rows: Vec<(String, String, String, NaiveDate)> = sqlx::query_as(
        "SELECT u.name, p.name, h.kind, h.due_date FROM housekeeping_tasks h JOIN units u ON u.id = h.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE h.org_id = ? AND h.status IN ('pending','in_progress') AND h.due_date <= date('now', 'localtime')
           AND (h.assignee_user_id IS NULL OR h.assignee_user_id = ?)
         ORDER BY h.due_date, u.name LIMIT 10",
    )
    .bind(org.org_id)
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;
    let url = format!("{}/housekeeping", state.public_url);
    if rows.is_empty() {
        return Ok(flex(
            "ไม่มีงานค้าง",
            card(org, "ไม่มีงานค้างวันนี้ 🎉", "", vec![], ("เปิดหน้างานแม่บ้าน", &url)),
        ));
    }
    let list = rows
        .iter()
        .map(|(unit, prop, kind, due)| {
            (
                format!("ห้อง {unit} · {prop}"),
                format!("{} · {}", kind_label(kind), short_date(*due)),
                false,
            )
        })
        .collect();
    Ok(flex(
        "งานวันนี้",
        card(
            org,
            &format!("งานวันนี้ {} รายการ", rows.len()),
            "",
            list,
            ("เปิดหน้างานแม่บ้าน", &url),
        ),
    ))
}

// ---------- API ----------

#[derive(Deserialize)]
pub struct Filter {
    status: Option<String>,
    property_id: Option<i64>,
    date: Option<NaiveDate>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(f): Query<Filter>,
) -> AppResult<Json<Vec<Task>>> {
    Ok(Json(
        sqlx::query_as(&format!(
            "{SELECT} WHERE h.org_id = ?1 AND (?2 IS NULL OR h.status = ?2) AND (?3 IS NULL OR u.property_id = ?3)
               AND (?4 IS NULL OR (h.status IN ('pending','in_progress') AND h.due_date <= ?4)
                    OR (h.status IN ('done','cancelled') AND substr(COALESCE(h.completed_at, h.created_at), 1, 10) = ?4))
             ORDER BY CASE h.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, h.due_date, u.name
             LIMIT 500"
        ))
        .bind(ctx.org_id)
        .bind(f.status)
        .bind(f.property_id)
        .bind(f.date)
        .fetch_all(&s.db)
        .await?,
    ))
}

#[derive(Deserialize)]
pub struct TaskInput {
    unit_id: i64,
    kind: String,
    due_date: NaiveDate,
    assignee_user_id: Option<i64>,
    #[serde(default)]
    notes: String,
}

async fn ensure_member(db: &SqlitePool, org_id: i64, user_id: i64) -> AppResult<()> {
    sqlx::query_scalar::<_, i64>("SELECT user_id FROM org_members WHERE org_id = ? AND user_id = ?")
        .bind(org_id)
        .bind(user_id)
        .fetch_optional(db)
        .await?
        .map(|_| ())
        .ok_or_else(|| AppError::BadRequest("ผู้รับผิดชอบต้องเป็นสมาชิกในองค์กร".into()))
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(t): Json<TaskInput>,
) -> AppResult<Json<Task>> {
    ensure_unit(&s.db, ctx.org_id, t.unit_id).await?;
    validate_in("kind", &t.kind, KINDS)?;
    if let Some(a) = t.assignee_user_id {
        ensure_member(&s.db, ctx.org_id, a).await?;
    }
    let new = NewTask {
        unit_id: t.unit_id,
        booking_id: None,
        kind: &t.kind,
        due_date: t.due_date,
        assignee: t.assignee_user_id,
        notes: t.notes.trim(),
    };
    let id = create_task(&s, ctx.org_id, new)
        .await?
        .ok_or_else(|| AppError::Conflict("สร้างงานไม่ได้".into()))?;
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

#[derive(Deserialize)]
pub struct TaskPatch {
    status: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    assignee_user_id: Option<Option<i64>>,
    checklist: Option<Vec<CheckItem>>,
    notes: Option<String>,
    due_date: Option<NaiveDate>,
}

fn double_option<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Option<i64>>, D::Error> {
    Option::<i64>::deserialize(d).map(Some)
}

pub async fn patch(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(p): Json<TaskPatch>,
) -> AppResult<Json<Task>> {
    let before = fetch(&s.db, ctx.org_id, id).await?;
    if let Some(st) = &p.status {
        validate_in(
            "status",
            st,
            &["pending", "in_progress", "done", "cancelled"],
        )?;
    }
    if let Some(Some(a)) = p.assignee_user_id {
        ensure_member(&s.db, ctx.org_id, a).await?;
    }
    if p.checklist
        .as_ref()
        .is_some_and(|c| c.len() > 50 || c.iter().any(|i| i.label.trim().is_empty()))
    {
        return Err(AppError::BadRequest("เช็กลิสต์ไม่ถูกต้อง".into()));
    }
    sqlx::query(
        "UPDATE housekeeping_tasks SET status = COALESCE(?1, status), checklist = COALESCE(?2, checklist),
            notes = COALESCE(?3, notes), due_date = COALESCE(?4, due_date),
            started_at = CASE WHEN ?1 = 'in_progress' AND started_at IS NULL THEN datetime('now') ELSE started_at END,
            completed_at = CASE WHEN ?1 IN ('done','cancelled') THEN datetime('now')
                                WHEN ?1 IN ('pending','in_progress') THEN NULL ELSE completed_at END
         WHERE id = ?5",
    )
    .bind(&p.status)
    .bind(p.checklist.as_ref().map(sqlx::types::Json))
    .bind(&p.notes)
    .bind(p.due_date)
    .bind(id)
    .execute(&s.db)
    .await?;
    if let Some(assignee) = p.assignee_user_id {
        sqlx::query("UPDATE housekeeping_tasks SET assignee_user_id = ? WHERE id = ?")
            .bind(assignee)
            .bind(id)
            .execute(&s.db)
            .await?;
        if assignee.is_some() && assignee != before.assignee_user_id {
            notify(&s, ctx.org_id, id);
        }
    }
    // สถานะห้องตามความคืบหน้าของงานทำความสะอาด
    if let Some(st) = p.status.as_deref() {
        let unit_status = match st {
            "in_progress" => Some("in_progress"),
            "done" => Some("clean"),
            "pending" if matches!(before.kind.as_str(), "checkout_clean" | "deep_clean") => {
                Some("dirty")
            }
            _ => None,
        };
        if let Some(us) = unit_status.filter(|_| before.kind != "maintenance") {
            set_unit_status(&s.db, before.unit_id, us).await?;
        }
    }
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

pub async fn add_photos(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    form: Multipart,
) -> AppResult<Json<Task>> {
    let task = fetch(&s.db, ctx.org_id, id).await?;
    let form = uploads::parse(form, &s.upload_dir, "hk").await?;
    let mut photos = task.photos;
    photos.extend(form.photos);
    if photos.len() > 30 {
        return Err(AppError::BadRequest("แนบรูปได้สูงสุด 30 รูปต่องาน".into()));
    }
    sqlx::query("UPDATE housekeeping_tasks SET photos = ? WHERE id = ?")
        .bind(sqlx::types::Json(&photos))
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(fetch(&s.db, ctx.org_id, id).await?))
}

pub async fn delete(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    fetch(&s.db, ctx.org_id, id).await?;
    sqlx::query("DELETE FROM housekeeping_tasks WHERE id = ?")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

#[derive(Deserialize)]
pub struct TodayQuery {
    property_id: Option<i64>,
}

pub async fn today(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(q): Query<TodayQuery>,
) -> AppResult<Json<Value>> {
    let today = Local::now().date_naive();
    let moves = |col: &str| {
        format!(
            "SELECT b.id, b.unit_id, u.name, p.name, t.full_name, b.{col}, b.source FROM bookings b
             JOIN units u ON u.id = b.unit_id JOIN properties p ON p.id = u.property_id
             JOIN tenants t ON t.id = b.tenant_id
             WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) AND b.{col} = ?3
               AND b.status IN ('reserved','active','completed') ORDER BY u.name"
        )
    };
    type Move = (i64, i64, String, String, String, NaiveDate, String);
    let to_json = |rows: Vec<Move>, key: &str| -> Vec<Value> {
        rows.into_iter()
            .map(|(bid, uid, unit, prop, guest, date, source)| {
                json!({ "booking_id": bid, "unit_id": uid, "unit_name": unit, "property_name": prop,
                        "guest_name": guest, key: date, "source": source })
            })
            .collect()
    };
    let checkouts: Vec<Move> = sqlx::query_as(&moves("end_date"))
        .bind(ctx.org_id)
        .bind(q.property_id)
        .bind(today)
        .fetch_all(&s.db)
        .await?;
    let checkins: Vec<Move> = sqlx::query_as(&moves("start_date"))
        .bind(ctx.org_id)
        .bind(q.property_id)
        .bind(today)
        .fetch_all(&s.db)
        .await?;
    let summary: Vec<(String, i64)> = sqlx::query_as(
        "SELECT u.housekeeping_status, COUNT(*) FROM units u JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?1 AND (?2 IS NULL OR p.id = ?2) GROUP BY 1",
    )
    .bind(ctx.org_id)
    .bind(q.property_id)
    .fetch_all(&s.db)
    .await?;
    let count = |k: &str| summary.iter().find(|(s, _)| s == k).map_or(0, |(_, c)| *c);
    Ok(Json(json!({
        "date": today,
        "checkouts": to_json(checkouts, "end_date"),
        "checkins": to_json(checkins, "start_date"),
        "summary": { "clean": count("clean"), "dirty": count("dirty"), "in_progress": count("in_progress") },
    })))
}

#[derive(Deserialize)]
pub struct UnitStatusInput {
    status: String,
}

pub async fn set_unit(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(unit_id): Path<i64>,
    Json(i): Json<UnitStatusInput>,
) -> AppResult<Json<crate::models::Unit>> {
    ensure_unit(&s.db, ctx.org_id, unit_id).await?;
    validate_in("status", &i.status, HK_STATUSES)?;
    set_unit_status(&s.db, unit_id, &i.status).await?;
    Ok(Json(
        sqlx::query_as("SELECT * FROM units WHERE id = ?")
            .bind(unit_id)
            .fetch_one(&s.db)
            .await?,
    ))
}

// ---------- พนักงานเชื่อม LINE ----------

pub async fn staff_link(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code: String = {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        (0..6)
            .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
            .collect()
    };
    let org = line::load(&s.db, ctx.org_id).await?;
    let expires = (Local::now() + chrono::Duration::days(7))
        .naive_local()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    sqlx::query("UPDATE org_members SET line_link_code = ?, line_link_expires = ? WHERE org_id = ? AND user_id = ?")
        .bind(&code)
        .bind(&expires)
        .bind(ctx.org_id)
        .bind(ctx.user.id)
        .execute(&s.db)
        .await?;
    let link_url = (!org.basic_id.is_empty()).then(|| {
        format!(
            "https://line.me/R/oaMessage/{}/?{}",
            urlencoding::encode(&org.basic_id),
            urlencoding::encode(&format!("เชื่อมพนักงาน {code}"))
        )
    });
    Ok(Json(
        json!({ "code": code, "link_url": link_url, "add_friend_url": org.add_friend_url(), "expires_at": expires }),
    ))
}

pub async fn staff_unlink(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Value>> {
    sqlx::query("UPDATE org_members SET line_user_id = NULL WHERE org_id = ? AND user_id = ?")
        .bind(ctx.org_id)
        .bind(ctx.user.id)
        .execute(&s.db)
        .await?;
    Ok(Json(json!({})))
}

/// webhook: "เชื่อมพนักงาน CODE" → ผูก LINE กับสมาชิก คืนชื่อสมาชิกเมื่อสำเร็จ
pub(crate) async fn link_staff(
    db: &SqlitePool,
    org_id: i64,
    code: &str,
    line_user: &str,
) -> AppResult<Option<String>> {
    let row: Option<(i64, String)> = sqlx::query_as(
        "SELECT m.user_id, u.name FROM org_members m JOIN users u ON u.id = m.user_id
         WHERE m.org_id = ? AND m.line_link_code = ? AND m.line_link_expires > ?",
    )
    .bind(org_id)
    .bind(code)
    .bind(
        Local::now()
            .naive_local()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string(),
    )
    .fetch_optional(db)
    .await?;
    let Some((user_id, name)) = row else {
        return Ok(None);
    };
    sqlx::query(
        "UPDATE org_members SET line_user_id = ?, line_link_code = NULL, line_link_expires = NULL
         WHERE org_id = ? AND user_id = ?",
    )
    .bind(line_user)
    .bind(org_id)
    .bind(user_id)
    .execute(db)
    .await?;
    Ok(Some(name))
}

pub(crate) async fn staff_by_line(
    db: &SqlitePool,
    org_id: i64,
    line_user: &str,
) -> AppResult<Option<i64>> {
    Ok(sqlx::query_scalar(
        "SELECT user_id FROM org_members WHERE org_id = ? AND line_user_id = ? LIMIT 1",
    )
    .bind(org_id)
    .bind(line_user)
    .fetch_optional(db)
    .await?)
}
