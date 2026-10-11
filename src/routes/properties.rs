use axum::{
    extract::{Path, State},
    Json,
};

use super::validate_in;
use crate::{
    error::AppResult,
    models::{Property, PropertyInput, PROPERTY_KINDS},
    AppState,
};

pub async fn list(State(s): State<AppState>) -> AppResult<Json<Vec<Property>>> {
    let rows = sqlx::query_as("SELECT * FROM properties ORDER BY id")
        .fetch_all(&s.db)
        .await?;
    Ok(Json(rows))
}

pub async fn get(State(s): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<Property>> {
    let row = sqlx::query_as("SELECT * FROM properties WHERE id = ?")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    Ok(Json(row))
}

pub async fn create(
    State(s): State<AppState>,
    Json(p): Json<PropertyInput>,
) -> AppResult<Json<Property>> {
    validate_in("kind", &p.kind, PROPERTY_KINDS)?;
    let row = sqlx::query_as(
        "INSERT INTO properties (name, kind, address, lat, lng, electric_rate, water_rate, promptpay_id)
         VALUES (?,?,?,?,?,?,?,?) RETURNING *",
    )
    .bind(&p.name)
    .bind(&p.kind)
    .bind(&p.address)
    .bind(p.lat)
    .bind(p.lng)
    .bind(p.electric_rate.unwrap_or(8.0))
    .bind(p.water_rate.unwrap_or(18.0))
    .bind(&p.promptpay_id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
}

pub async fn update(
    State(s): State<AppState>,
    Path(id): Path<i64>,
    Json(p): Json<PropertyInput>,
) -> AppResult<Json<Property>> {
    validate_in("kind", &p.kind, PROPERTY_KINDS)?;
    let row = sqlx::query_as(
        "UPDATE properties SET name=?, kind=?, address=?, lat=?, lng=?,
            electric_rate=COALESCE(?, electric_rate), water_rate=COALESCE(?, water_rate), promptpay_id=?
         WHERE id=? RETURNING *",
    )
    .bind(&p.name)
    .bind(&p.kind)
    .bind(&p.address)
    .bind(p.lat)
    .bind(p.lng)
    .bind(p.electric_rate)
    .bind(p.water_rate)
    .bind(&p.promptpay_id)
    .bind(id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(row))
}

pub async fn delete(State(s): State<AppState>, Path(id): Path<i64>) -> AppResult<Json<()>> {
    sqlx::query("DELETE FROM properties WHERE id=?")
        .bind(id)
        .execute(&s.db)
        .await?;
    Ok(Json(()))
}
