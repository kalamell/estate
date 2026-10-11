//! แจ้งซ่อม / ติดต่อ
//! - scope `org`: ผู้เช่าหรือพนักงาน → ทีมงานหอพัก
//! - scope `platform`: ลูกค้า (องค์กร) → ผู้ให้บริการแพลตฟอร์ม (Super Admin)

use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::validate_in;
use crate::{
    auth::{ensure_tenant, ensure_unit, OrgCtx, SuperAdmin},
    error::{AppError, AppResult},
    uploads, AppState,
};

pub const ORG_CATEGORIES: &[&str] = &[
    "electric",
    "plumbing",
    "aircon",
    "furniture",
    "internet",
    "cleaning",
    "noise",
    "billing",
    "move_out",
    "other",
];
pub const SUPPORT_CATEGORIES: &[&str] = &["bug", "question", "billing", "feature", "other"];
const PRIORITIES: &[&str] = &["low", "normal", "high", "urgent"];
const STATUSES: &[&str] = &["open", "in_progress", "waiting", "resolved", "closed"];

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Ticket {
    id: i64,
    scope: String,
    title: String,
    description: String,
    category: String,
    priority: String,
    status: String,
    property_id: Option<i64>,
    property_name: Option<String>,
    unit_id: Option<i64>,
    unit_name: Option<String>,
    tenant_id: Option<i64>,
    tenant_name: Option<String>,
    org_id: i64,
    org_name: String,
    reporter_name: String,
    source: String,
    assignee_user_id: Option<i64>,
    assignee_name: Option<String>,
    #[sqlx(json)]
    photos: Vec<String>,
    message_count: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Message {
    id: i64,
    author_type: String,
    author_name: String,
    body: String,
    internal: bool,
    #[sqlx(json)]
    photos: Vec<String>,
    created_at: String,
}

const SELECT: &str = "SELECT t.id, t.scope, t.title, t.description, t.category, t.priority, t.status,
        t.property_id, p.name AS property_name, t.unit_id, u.name AS unit_name, t.tenant_id,
        tn.full_name AS tenant_name, t.org_id, o.name AS org_name, t.reporter_name, t.source,
        t.assignee_user_id, au.name AS assignee_name, t.photos,
        (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id AND (?9 = 1 OR m.internal = 0))
            AS message_count,
        t.created_at, t.updated_at
    FROM tickets t JOIN organizations o ON o.id = t.org_id
    LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN units u ON u.id = t.unit_id
    LEFT JOIN tenants tn ON tn.id = t.tenant_id LEFT JOIN users au ON au.id = t.assignee_user_id";

/// ขอบเขตการมองเห็นของผู้เรียก
#[derive(Default, Clone, Copy)]
pub(crate) struct Scope<'a> {
    pub scope: &'a str,
    pub org_id: Option<i64>,
    pub tenant_id: Option<i64>,
    pub include_internal: bool,
}

#[derive(Deserialize, Default)]
pub struct Filter {
    status: Option<String>,
    property_id: Option<i64>,
    category: Option<String>,
}

pub(crate) async fn query(
    db: &SqlitePool,
    sc: Scope<'_>,
    f: &Filter,
    id: Option<i64>,
) -> AppResult<Vec<Ticket>> {
    Ok(sqlx::query_as(&format!(
        "{SELECT} WHERE t.scope = ?1 AND (?2 IS NULL OR t.org_id = ?2) AND (?3 IS NULL OR t.tenant_id = ?3)
           AND (?4 IS NULL OR t.status = ?4) AND (?5 IS NULL OR t.property_id = ?5)
           AND (?6 IS NULL OR t.category = ?6) AND (?7 IS NULL OR t.id = ?7)
         ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
                  CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                  t.updated_at DESC
         LIMIT ?8"
    ))
    .bind(sc.scope)
    .bind(sc.org_id)
    .bind(sc.tenant_id)
    .bind(&f.status)
    .bind(f.property_id)
    .bind(&f.category)
    .bind(id)
    .bind(500)
    .bind(sc.include_internal)
    .fetch_all(db)
    .await?)
}

pub(crate) async fn detail(db: &SqlitePool, sc: Scope<'_>, id: i64) -> AppResult<Value> {
    let ticket = query(db, sc, &Filter::default(), Some(id))
        .await?
        .into_iter()
        .next()
        .ok_or(AppError::NotFound)?;
    let messages: Vec<Message> = sqlx::query_as(
        "SELECT id, author_type, author_name, body, internal, photos, created_at FROM ticket_messages
         WHERE ticket_id = ? AND (? = 1 OR internal = 0) ORDER BY id",
    )
    .bind(id)
    .bind(sc.include_internal)
    .fetch_all(db)
    .await?;
    Ok(json!({ "ticket": ticket, "messages": messages }))
}

pub(crate) struct NewTicket<'a> {
    pub org_id: i64,
    pub scope: &'a str,
    pub source: &'a str,
    pub unit_id: Option<i64>,
    pub tenant_id: Option<i64>,
    pub reporter_user_id: Option<i64>,
    pub reporter_name: &'a str,
}

pub(crate) async fn create_from_form(
    db: &SqlitePool,
    t: NewTicket<'_>,
    form: uploads::Form,
) -> AppResult<i64> {
    let categories = if t.scope == "platform" {
        SUPPORT_CATEGORIES
    } else {
        ORG_CATEGORIES
    };
    let category = form.text("category").unwrap_or("other").to_string();
    validate_in("category", &category, categories)?;
    let priority = form.text("priority").unwrap_or("normal").to_string();
    validate_in("priority", &priority, PRIORITIES)?;
    let title = form.required("title", "หัวข้อ")?;
    let property_id: Option<i64> = match t.unit_id {
        Some(uid) => {
            sqlx::query_scalar("SELECT property_id FROM units WHERE id = ?")
                .bind(uid)
                .fetch_optional(db)
                .await?
        }
        None => None,
    };
    Ok(sqlx::query_scalar(
        "INSERT INTO tickets (org_id, scope, property_id, unit_id, tenant_id, source, reporter_user_id, reporter_name,
            category, priority, title, description, photos)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(t.org_id)
    .bind(t.scope)
    .bind(property_id)
    .bind(t.unit_id)
    .bind(t.tenant_id)
    .bind(t.source)
    .bind(t.reporter_user_id)
    .bind(t.reporter_name)
    .bind(category)
    .bind(priority)
    .bind(title)
    .bind(form.text("description").unwrap_or_default())
    .bind(sqlx::types::Json(&form.photos))
    .fetch_one(db)
    .await?)
}

pub(crate) struct Author<'a> {
    pub kind: &'a str, // staff / tenant / platform
    pub user_id: Option<i64>,
    pub name: &'a str,
}

/// เพิ่มข้อความ — ถ้าฝั่งผู้แจ้งตอบกลับเรื่องที่รอ/ปิดไปแล้ว ให้เปิดเรื่องใหม่อัตโนมัติ
pub(crate) async fn add_message(
    db: &SqlitePool,
    ticket_id: i64,
    author: Author<'_>,
    form: uploads::Form,
    reopen: bool,
) -> AppResult<()> {
    let body = form.text("body").unwrap_or_default().to_string();
    if body.is_empty() && form.photos.is_empty() {
        return Err(AppError::BadRequest("กรุณาพิมพ์ข้อความหรือแนบรูป".into()));
    }
    let internal =
        author.kind == "staff" && matches!(form.text("internal"), Some("1") | Some("true"));
    let mut tx = db.begin().await?;
    sqlx::query(
        "INSERT INTO ticket_messages (ticket_id, author_type, author_user_id, author_name, body, internal, photos)
         VALUES (?,?,?,?,?,?,?)",
    )
    .bind(ticket_id)
    .bind(author.kind)
    .bind(author.user_id)
    .bind(author.name)
    .bind(body)
    .bind(internal)
    .bind(sqlx::types::Json(&form.photos))
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE tickets SET updated_at = datetime('now'),
            status = CASE WHEN ? AND status IN ('waiting','resolved') THEN 'open' ELSE status END
         WHERE id = ?",
    )
    .bind(reopen)
    .bind(ticket_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

#[derive(Deserialize)]
pub struct Patch {
    status: Option<String>,
    priority: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    assignee_user_id: Option<Option<i64>>,
}

fn double_option<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Option<i64>>, D::Error> {
    Option::<i64>::deserialize(d).map(Some)
}

async fn apply_patch(db: &SqlitePool, id: i64, p: &Patch) -> AppResult<()> {
    if let Some(s) = &p.status {
        validate_in("status", s, STATUSES)?;
    }
    if let Some(pr) = &p.priority {
        validate_in("priority", pr, PRIORITIES)?;
    }
    sqlx::query(
        "UPDATE tickets SET status = COALESCE(?, status), priority = COALESCE(?, priority),
            updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&p.status)
    .bind(&p.priority)
    .bind(id)
    .execute(db)
    .await?;
    if let Some(assignee) = p.assignee_user_id {
        sqlx::query("UPDATE tickets SET assignee_user_id = ? WHERE id = ?")
            .bind(assignee)
            .bind(id)
            .execute(db)
            .await?;
    }
    Ok(())
}

async fn ensure_ticket(
    db: &SqlitePool,
    id: i64,
    scope: &str,
    org_id: Option<i64>,
) -> AppResult<()> {
    sqlx::query_scalar::<_, i64>(
        "SELECT id FROM tickets WHERE id = ? AND scope = ? AND (? IS NULL OR org_id = ?)",
    )
    .bind(id)
    .bind(scope)
    .bind(org_id)
    .bind(org_id)
    .fetch_optional(db)
    .await?
    .map(|_| ())
    .ok_or(AppError::NotFound)
}

// ---------- ทีมงานหอพัก (scope org) ----------

fn org_scope(ctx: &OrgCtx) -> Scope<'static> {
    Scope {
        scope: "org",
        org_id: Some(ctx.org_id),
        tenant_id: None,
        include_internal: true,
    }
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(f): Query<Filter>,
) -> AppResult<Json<Vec<Ticket>>> {
    Ok(Json(query(&s.db, org_scope(&ctx), &f, None).await?))
}

pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    form: Multipart,
) -> AppResult<Json<Value>> {
    let form = uploads::parse(form, &s.upload_dir, "ticket").await?;
    let unit_id = form.id("unit_id")?;
    let tenant_id = form.id("tenant_id")?;
    if let Some(uid) = unit_id {
        ensure_unit(&s.db, ctx.org_id, uid).await?;
    }
    if let Some(tid) = tenant_id {
        ensure_tenant(&s.db, ctx.org_id, tid).await?;
    }
    let id = create_from_form(
        &s.db,
        NewTicket {
            org_id: ctx.org_id,
            scope: "org",
            source: "staff",
            unit_id,
            tenant_id,
            reporter_user_id: Some(ctx.user.id),
            reporter_name: &ctx.user.name,
        },
        form,
    )
    .await?;
    Ok(Json(detail(&s.db, org_scope(&ctx), id).await?))
}

pub async fn get(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    Ok(Json(detail(&s.db, org_scope(&ctx), id).await?))
}

pub async fn patch(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    Json(p): Json<Patch>,
) -> AppResult<Json<Value>> {
    ensure_ticket(&s.db, id, "org", Some(ctx.org_id)).await?;
    if let Some(Some(uid)) = p.assignee_user_id {
        sqlx::query_scalar::<_, i64>(
            "SELECT user_id FROM org_members WHERE org_id = ? AND user_id = ?",
        )
        .bind(ctx.org_id)
        .bind(uid)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("ผู้รับผิดชอบต้องเป็นสมาชิกในองค์กร".into()))?;
    }
    apply_patch(&s.db, id, &p).await?;
    Ok(Json(detail(&s.db, org_scope(&ctx), id).await?))
}

pub async fn message(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    form: Multipart,
) -> AppResult<Json<Value>> {
    ensure_ticket(&s.db, id, "org", Some(ctx.org_id)).await?;
    let form = uploads::parse(form, &s.upload_dir, "ticket").await?;
    let internal = matches!(form.text("internal"), Some("1") | Some("true"));
    let body = form.text("body").unwrap_or("(ส่งรูปภาพ)").to_string();
    let author = Author {
        kind: "staff",
        user_id: Some(ctx.user.id),
        name: &ctx.user.name,
    };
    add_message(&s.db, id, author, form, false).await?;
    if !internal {
        crate::line::spawn_auto(
            &s,
            ctx.org_id,
            |o| o.auto_ticket,
            move |st, org| async move { crate::line::send_ticket_reply(&st, &org, id, &body).await },
        );
    }
    Ok(Json(detail(&s.db, org_scope(&ctx), id).await?))
}

// ---------- ลูกค้าติดต่อผู้ให้บริการ (scope platform) ----------

fn support_scope(ctx: &OrgCtx) -> Scope<'static> {
    Scope {
        scope: "platform",
        org_id: Some(ctx.org_id),
        tenant_id: None,
        include_internal: false,
    }
}

pub async fn support_list(State(s): State<AppState>, ctx: OrgCtx) -> AppResult<Json<Vec<Ticket>>> {
    Ok(Json(
        query(&s.db, support_scope(&ctx), &Filter::default(), None).await?,
    ))
}

pub async fn support_create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    form: Multipart,
) -> AppResult<Json<Value>> {
    let form = uploads::parse(form, &s.upload_dir, "support").await?;
    let id = create_from_form(
        &s.db,
        NewTicket {
            org_id: ctx.org_id,
            scope: "platform",
            source: "org",
            unit_id: None,
            tenant_id: None,
            reporter_user_id: Some(ctx.user.id),
            reporter_name: &ctx.user.name,
        },
        form,
    )
    .await?;
    Ok(Json(detail(&s.db, support_scope(&ctx), id).await?))
}

pub async fn support_get(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    Ok(Json(detail(&s.db, support_scope(&ctx), id).await?))
}

pub async fn support_message(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
    form: Multipart,
) -> AppResult<Json<Value>> {
    ensure_ticket(&s.db, id, "platform", Some(ctx.org_id)).await?;
    let form = uploads::parse(form, &s.upload_dir, "support").await?;
    let author = Author {
        kind: "staff",
        user_id: Some(ctx.user.id),
        name: &ctx.user.name,
    };
    add_message(&s.db, id, author, form, true).await?;
    Ok(Json(detail(&s.db, support_scope(&ctx), id).await?))
}

// ---------- ผู้ให้บริการ (Super Admin) ----------

const ADMIN_SCOPE: Scope<'static> = Scope {
    scope: "platform",
    org_id: None,
    tenant_id: None,
    include_internal: true,
};

pub async fn admin_list(
    State(s): State<AppState>,
    _: SuperAdmin,
    Query(f): Query<Filter>,
) -> AppResult<Json<Vec<Ticket>>> {
    Ok(Json(query(&s.db, ADMIN_SCOPE, &f, None).await?))
}

pub async fn admin_get(
    State(s): State<AppState>,
    _: SuperAdmin,
    Path(id): Path<i64>,
) -> AppResult<Json<Value>> {
    Ok(Json(detail(&s.db, ADMIN_SCOPE, id).await?))
}

pub async fn admin_message(
    State(s): State<AppState>,
    SuperAdmin(me): SuperAdmin,
    Path(id): Path<i64>,
    form: Multipart,
) -> AppResult<Json<Value>> {
    ensure_ticket(&s.db, id, "platform", None).await?;
    let form = uploads::parse(form, &s.upload_dir, "support").await?;
    let author = Author {
        kind: "platform",
        user_id: Some(me.id),
        name: "ทีมผู้ให้บริการ",
    };
    add_message(&s.db, id, author, form, false).await?;
    Ok(Json(detail(&s.db, ADMIN_SCOPE, id).await?))
}

pub async fn admin_patch(
    State(s): State<AppState>,
    _: SuperAdmin,
    Path(id): Path<i64>,
    Json(p): Json<Patch>,
) -> AppResult<Json<Value>> {
    ensure_ticket(&s.db, id, "platform", None).await?;
    apply_patch(
        &s.db,
        id,
        &Patch {
            assignee_user_id: None,
            ..p
        },
    )
    .await?;
    Ok(Json(detail(&s.db, ADMIN_SCOPE, id).await?))
}

// ---------- ประกาศ ----------

#[derive(Serialize, sqlx::FromRow)]
pub struct Announcement {
    id: i64,
    property_id: Option<i64>,
    property_name: Option<String>,
    title: String,
    body: String,
    pinned: bool,
    created_at: String,
}

pub(crate) async fn announcements_for(
    db: &SqlitePool,
    org_id: i64,
    property_id: Option<i64>,
) -> AppResult<Vec<Announcement>> {
    Ok(sqlx::query_as(
        "SELECT a.id, a.property_id, p.name AS property_name, a.title, a.body, a.pinned, a.created_at
         FROM announcements a LEFT JOIN properties p ON p.id = a.property_id
         WHERE a.org_id = ?1 AND (?2 IS NULL OR a.property_id IS NULL OR a.property_id = ?2)
         ORDER BY a.pinned DESC, a.id DESC LIMIT 50",
    )
    .bind(org_id)
    .bind(property_id)
    .fetch_all(db)
    .await?)
}

pub async fn announcements(
    State(s): State<AppState>,
    ctx: OrgCtx,
) -> AppResult<Json<Vec<Announcement>>> {
    Ok(Json(announcements_for(&s.db, ctx.org_id, None).await?))
}

#[derive(Deserialize)]
pub struct AnnouncementInput {
    property_id: Option<i64>,
    title: String,
    body: String,
    #[serde(default)]
    pinned: bool,
}

pub async fn create_announcement(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Json(a): Json<AnnouncementInput>,
) -> AppResult<Json<Value>> {
    ctx.require_admin()?;
    if a.title.trim().is_empty() || a.body.trim().is_empty() {
        return Err(AppError::BadRequest("กรุณาระบุหัวข้อและรายละเอียดประกาศ".into()));
    }
    if let Some(pid) = a.property_id {
        crate::auth::ensure_property(&s.db, ctx.org_id, pid).await?;
    }
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO announcements (org_id, property_id, title, body, pinned) VALUES (?,?,?,?,?) RETURNING id",
    )
    .bind(ctx.org_id)
    .bind(a.property_id)
    .bind(a.title.trim())
    .bind(a.body.trim())
    .bind(a.pinned)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(json!({ "id": id })))
}

pub async fn delete_announcement(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<()>> {
    ctx.require_admin()?;
    let r = sqlx::query("DELETE FROM announcements WHERE id = ? AND org_id = ?")
        .bind(id)
        .bind(ctx.org_id)
        .execute(&s.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(()))
}
