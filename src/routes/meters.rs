use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use chrono::NaiveDate;
use serde::Deserialize;

use super::validate_in;
use crate::{
    auth::{ensure_unit, OrgCtx},
    error::{AppError, AppResult},
    models::MeterReading,
    AppState,
};

#[derive(Deserialize)]
pub struct Filter {
    unit_id: Option<i64>,
    meter_type: Option<String>,
}

pub async fn list(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Query(f): Query<Filter>,
) -> AppResult<Json<Vec<MeterReading>>> {
    let rows = sqlx::query_as(
        "SELECT m.* FROM meter_readings m JOIN units u ON u.id = m.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.org_id = ?3 AND (?1 IS NULL OR m.unit_id = ?1) AND (?2 IS NULL OR m.meter_type = ?2)
         ORDER BY m.reading_date DESC, m.id DESC LIMIT 200",
    )
    .bind(f.unit_id)
    .bind(f.meter_type)
    .bind(ctx.org_id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

fn bad(msg: &str) -> AppError {
    AppError::BadRequest(msg.into())
}

/// รับข้อมูลแบบ multipart: unit_id, meter_type, reading_date, value, ocr_raw?, allow_decrease?, photo?
pub async fn create(
    State(s): State<AppState>,
    ctx: OrgCtx,
    mut form: Multipart,
) -> AppResult<Json<MeterReading>> {
    let (mut unit_id, mut meter_type, mut date, mut value) = (None, None, None, None);
    let (mut ocr_raw, mut allow_decrease, mut photo) = (None, false, None::<(String, Vec<u8>)>);

    while let Some(field) = form.next_field().await.map_err(|e| bad(&e.to_string()))? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "photo" {
            let ext = match field.content_type() {
                Some("image/png") => "png",
                Some("image/webp") => "webp",
                Some("image/jpeg") | Some("image/jpg") => "jpg",
                _ => return Err(bad("รองรับเฉพาะรูป JPG, PNG หรือ WEBP")),
            };
            let bytes = field.bytes().await.map_err(|e| bad(&e.to_string()))?;
            if !bytes.is_empty() {
                photo = Some((ext.to_string(), bytes.to_vec()));
            }
            continue;
        }
        let text = field.text().await.map_err(|e| bad(&e.to_string()))?;
        match name.as_str() {
            "unit_id" => unit_id = Some(text.parse::<i64>().map_err(|_| bad("unit_id ไม่ถูกต้อง"))?),
            "meter_type" => meter_type = Some(text),
            "reading_date" => {
                date = Some(
                    NaiveDate::parse_from_str(&text, "%Y-%m-%d").map_err(|_| bad("วันที่ไม่ถูกต้อง"))?,
                )
            }
            "value" => {
                value = Some(
                    text.trim()
                        .parse::<f64>()
                        .map_err(|_| bad("ค่ามิเตอร์ต้องเป็นตัวเลข"))?,
                )
            }
            "ocr_raw" => ocr_raw = Some(text),
            "allow_decrease" => allow_decrease = text == "1" || text == "true",
            _ => {}
        }
    }

    let unit_id = unit_id.ok_or_else(|| bad("กรุณาเลือกห้อง"))?;
    ensure_unit(&s.db, ctx.org_id, unit_id).await?;
    let meter_type = meter_type.ok_or_else(|| bad("กรุณาเลือกประเภทมิเตอร์"))?;
    validate_in("meter_type", &meter_type, &["electric", "water"])?;
    let date = date.unwrap_or_else(|| chrono::Local::now().date_naive());
    let value = value.ok_or_else(|| bad("กรุณาระบุค่ามิเตอร์"))?;
    if value < 0.0 {
        return Err(bad("ค่ามิเตอร์ต้องไม่ติดลบ"));
    }

    let previous: Option<f64> = sqlx::query_scalar(
        "SELECT value FROM meter_readings WHERE unit_id = ? AND meter_type = ? AND reading_date <= ?
         ORDER BY reading_date DESC, id DESC LIMIT 1",
    )
    .bind(unit_id)
    .bind(&meter_type)
    .bind(date)
    .fetch_optional(&s.db)
    .await?;
    if let Some(prev) = previous {
        if value < prev && !allow_decrease {
            return Err(bad(&format!(
                "ค่าที่อ่านได้ ({value}) น้อยกว่าครั้งก่อน ({prev}) — ตรวจสอบตัวเลข หรือยืนยันกรณีเปลี่ยน/มิเตอร์วนรอบ"
            )));
        }
    }

    let photo_path = match photo {
        Some((ext, bytes)) => {
            let file = format!("meter-{}.{ext}", uuid::Uuid::new_v4());
            tokio::fs::write(s.upload_dir.join(&file), bytes)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
            let url = format!("/uploads/{file}");
            crate::uploads::register(&s.db, ctx.org_id, std::slice::from_ref(&url)).await?;
            Some(url)
        }
        None => None,
    };

    let row = sqlx::query_as(
        "INSERT INTO meter_readings (unit_id, meter_type, reading_date, value, photo_path, ocr_raw)
         VALUES (?,?,?,?,?,?) RETURNING *",
    )
    .bind(unit_id)
    .bind(&meter_type)
    .bind(date)
    .bind(value)
    .bind(&photo_path)
    .bind(&ocr_raw)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(s): State<AppState>,
    ctx: OrgCtx,
    Path(id): Path<i64>,
) -> AppResult<Json<()>> {
    let unit_id: i64 = sqlx::query_scalar("SELECT unit_id FROM meter_readings WHERE id = ?")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    ensure_unit(&s.db, ctx.org_id, unit_id).await?;
    let photo: Option<String> =
        sqlx::query_scalar("DELETE FROM meter_readings WHERE id = ? RETURNING photo_path")
            .bind(id)
            .fetch_one(&s.db)
            .await?;
    if let Some(name) = photo.as_deref().and_then(|p| p.strip_prefix("/uploads/")) {
        let _ = tokio::fs::remove_file(s.upload_dir.join(name)).await;
    }
    Ok(Json(()))
}
