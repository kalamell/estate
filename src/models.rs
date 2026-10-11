use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::billing::LineItem;

#[derive(Debug, Serialize, FromRow)]
pub struct Property {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub address: String,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub electric_rate: f64,
    pub water_rate: f64,
    pub promptpay_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PropertyInput {
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub address: String,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub electric_rate: Option<f64>,
    pub water_rate: Option<f64>,
    pub promptpay_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Furniture {
    pub kind: String, // bed, desk, wardrobe, sofa, fridge, tv, bathroom, kitchen
    pub x: f64,
    pub z: f64,
    pub w: f64,
    pub d: f64,
    pub h: f64,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Unit {
    pub id: i64,
    pub property_id: i64,
    pub name: String,
    pub floor: i64,
    pub rent_monthly: f64,
    pub rate_daily: f64,
    pub deposit: f64,
    pub status: String,
    pub width: f64,
    pub length: f64,
    pub height: f64,
    #[sqlx(json)]
    pub layout: Vec<Furniture>,
    pub note: String,
}

#[derive(Debug, Deserialize)]
pub struct UnitInput {
    pub property_id: i64,
    pub name: String,
    pub floor: Option<i64>,
    pub rent_monthly: Option<f64>,
    pub rate_daily: Option<f64>,
    pub deposit: Option<f64>,
    pub status: Option<String>,
    pub width: Option<f64>,
    pub length: Option<f64>,
    pub height: Option<f64>,
    pub layout: Option<Vec<Furniture>>,
    pub note: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Tenant {
    pub id: i64,
    pub full_name: String,
    pub phone: String,
    pub email: String,
    pub id_card: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct TenantInput {
    pub full_name: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub id_card: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Booking {
    pub id: i64,
    pub unit_id: i64,
    pub tenant_id: i64,
    pub kind: String,
    pub start_date: NaiveDate,
    pub end_date: Option<NaiveDate>,
    pub price: f64,
    pub deposit_amount: f64,
    pub deposit_status: String,
    pub status: String,
    pub source: String,
    pub created_at: String,
    // joined
    pub unit_name: String,
    pub property_name: String,
    pub tenant_name: String,
}

#[derive(Debug, Deserialize)]
pub struct BookingInput {
    pub unit_id: i64,
    pub tenant_id: i64,
    pub kind: String,
    pub start_date: NaiveDate,
    pub end_date: Option<NaiveDate>,
    pub price: Option<f64>,
    pub deposit_amount: Option<f64>,
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BookingPatch {
    pub status: Option<String>,
    pub deposit_status: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MeterReading {
    pub id: i64,
    pub unit_id: i64,
    pub meter_type: String,
    pub reading_date: NaiveDate,
    pub value: f64,
    pub photo_path: Option<String>,
    pub ocr_raw: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Invoice {
    pub id: i64,
    pub unit_id: i64,
    pub booking_id: Option<i64>,
    pub period: String,
    pub issue_date: NaiveDate,
    pub due_date: NaiveDate,
    #[sqlx(json)]
    pub items: Vec<LineItem>,
    pub total: f64,
    pub status: String,
    pub paid_at: Option<String>,
    pub created_at: String,
    // joined
    pub unit_name: String,
    pub property_id: i64,
    pub property_name: String,
    pub tenant_name: Option<String>,
}

pub const PROPERTY_KINDS: &[&str] = &["dormitory", "apartment", "condo", "house", "short_stay"];
pub const UNIT_STATUSES: &[&str] = &["vacant", "reserved", "occupied", "maintenance"];

// ===== SaaS =====

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PackageFeatures {
    #[serde(default)]
    pub ocr: bool,
    #[serde(default)]
    pub view3d: bool,
    #[serde(default)]
    pub short_stay: bool,
    #[serde(default)]
    pub invoices: bool,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Package {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub price_monthly: f64,
    pub max_properties: i64,
    pub max_units: i64,
    pub max_members: i64,
    #[sqlx(json)]
    pub features: PackageFeatures,
    pub is_active: bool,
    pub is_default: bool,
    pub sort_order: i64,
    pub org_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct PackageInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub price_monthly: f64,
    pub max_properties: i64,
    pub max_units: i64,
    pub max_members: i64,
    #[serde(default)]
    pub features: PackageFeatures,
    #[serde(default = "yes")]
    pub is_active: bool,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub sort_order: i64,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Serialize, FromRow)]
pub struct OrgSummary {
    pub id: i64,
    pub name: String,
    pub role: String,
    pub status: String,
    pub package_name: String,
}

pub const ORG_STATUSES: &[&str] = &["trial", "active", "suspended", "cancelled"];
