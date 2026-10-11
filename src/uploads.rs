//! รับฟอร์ม multipart ที่มีรูปภาพแนบ (แจ้งซ่อม ข้อความ)

use std::{collections::HashMap, path::Path};

use axum::extract::Multipart;

use crate::error::{AppError, AppResult};

pub const MAX_PHOTOS: usize = 6;

pub struct Form {
    pub fields: HashMap<String, String>,
    pub photos: Vec<String>,
}

impl Form {
    pub fn text(&self, key: &str) -> Option<&str> {
        self.fields
            .get(key)
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
    }

    pub fn required(&self, key: &str, label: &str) -> AppResult<String> {
        self.text(key)
            .map(str::to_string)
            .ok_or_else(|| AppError::BadRequest(format!("กรุณาระบุ{label}")))
    }

    pub fn id(&self, key: &str) -> AppResult<Option<i64>> {
        self.text(key)
            .map(|v| {
                v.parse()
                    .map_err(|_| AppError::BadRequest(format!("{key} ไม่ถูกต้อง")))
            })
            .transpose()
    }
}

fn bad(e: impl std::fmt::Display) -> AppError {
    AppError::BadRequest(e.to_string())
}

/// อ่านทุกฟิลด์ เก็บรูป (field `photos`) ลงโฟลเดอร์อัปโหลด และคืน URL `/uploads/...`
/// บันทึกว่าไฟล์เป็นขององค์กรใด (ใช้ตรวจสิทธิ์ตอนเปิดไฟล์)
pub async fn register(db: &sqlx::SqlitePool, org_id: i64, urls: &[String]) -> AppResult<()> {
    for url in urls {
        if let Some(name) = url.strip_prefix("/uploads/") {
            sqlx::query("INSERT OR IGNORE INTO uploads (name, org_id) VALUES (?, ?)")
                .bind(name)
                .bind(org_id)
                .execute(db)
                .await?;
        }
    }
    Ok(())
}

/// อ่านฟอร์มและบันทึกเจ้าของไฟล์ในครั้งเดียว
pub async fn parse_for(
    state: &crate::AppState,
    org_id: i64,
    form: Multipart,
    prefix: &str,
) -> AppResult<Form> {
    let parsed = parse(form, &state.upload_dir, prefix).await?;
    register(&state.db, org_id, &parsed.photos).await?;
    if let Some(sig) = parsed.fields.get("signature_url") {
        register(&state.db, org_id, std::slice::from_ref(sig)).await?;
    }
    Ok(parsed)
}

pub async fn parse(mut form: Multipart, upload_dir: &Path, prefix: &str) -> AppResult<Form> {
    let mut fields = HashMap::new();
    let mut photos = Vec::new();
    while let Some(field) = form.next_field().await.map_err(bad)? {
        let name = field.name().unwrap_or_default().to_string();
        // `signature` = ภาพลายเซ็น (เก็บ URL ไว้ในฟิลด์ `signature_url`)
        if name == "photos" || name == "photo" || name == "signature" {
            let ext = match field.content_type() {
                Some("image/png") => "png",
                Some("image/webp") => "webp",
                Some("image/jpeg") | Some("image/jpg") => "jpg",
                Some("application/octet-stream") | None => continue,
                _ => {
                    return Err(AppError::BadRequest(
                        "รองรับเฉพาะรูป JPG, PNG หรือ WEBP".into(),
                    ))
                }
            };
            let bytes = field.bytes().await.map_err(bad)?;
            if bytes.is_empty() {
                continue;
            }
            if name != "signature" && photos.len() >= MAX_PHOTOS {
                return Err(AppError::BadRequest(format!("แนบรูปได้สูงสุด {MAX_PHOTOS} รูป")));
            }
            let file = format!("{prefix}-{}.{ext}", uuid::Uuid::new_v4());
            tokio::fs::write(upload_dir.join(&file), &bytes)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
            if name == "signature" {
                fields.insert("signature_url".into(), format!("/uploads/{file}"));
            } else {
                photos.push(format!("/uploads/{file}"));
            }
            continue;
        }
        let value = field.text().await.map_err(bad)?;
        // กันการส่ง URL ไฟล์ปลอมมาเป็นข้อความ
        if name != "signature_url" {
            fields.insert(name, value);
        }
    }
    Ok(Form { fields, photos })
}
