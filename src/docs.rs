//! เลขที่เอกสารเรียงต่อเนื่อง (ใบแจ้งหนี้ ใบเสร็จ ใบคืนเงินประกัน) ไม่ข้ามเลข ไม่ซ้ำ

use chrono::{Datelike, NaiveDate};
use sqlx::SqliteConnection;

use crate::{error::AppResult, thai::buddhist_year};

#[derive(Clone, Copy)]
pub enum DocType {
    Invoice,
    Receipt,
    DepositSettlement,
}

impl DocType {
    fn prefix(self) -> &'static str {
        match self {
            DocType::Invoice => "INV",
            DocType::Receipt => "RC",
            DocType::DepositSettlement => "DS",
        }
    }
}

/// ต้องเรียกภายใน transaction เดียวกับการบันทึกเอกสาร เพื่อไม่ให้เลขหายเมื่อบันทึกล้มเหลว
pub async fn next_doc_no(
    conn: &mut SqliteConnection,
    org_id: i64,
    kind: DocType,
    date: NaiveDate,
) -> AppResult<String> {
    let year = buddhist_year(date.year());
    let no: i64 = sqlx::query_scalar(
        "INSERT INTO doc_sequences (org_id, doc_type, year, last_no) VALUES (?, ?, ?, 1)
         ON CONFLICT (org_id, doc_type, year) DO UPDATE SET last_no = last_no + 1
         RETURNING last_no",
    )
    .bind(org_id)
    .bind(kind.prefix())
    .bind(year)
    .fetch_one(conn)
    .await?;
    Ok(format!("{}{}-{:05}", kind.prefix(), year, no))
}

/// ข้อมูลผู้ออกเอกสารขององค์กร (ใช้ชื่อองค์กรถ้ายังไม่ได้กรอกชื่อนิติบุคคล)
pub async fn load_issuer(db: &sqlx::SqlitePool, org_id: i64) -> AppResult<crate::models::Issuer> {
    Ok(sqlx::query_as(
        "SELECT CASE WHEN legal_name = '' THEN name ELSE legal_name END AS legal_name, tax_id, branch_code,
                address, phone, vat_registered, vat_rate, receipt_note
         FROM organizations WHERE id = ?",
    )
    .bind(org_id)
    .fetch_one(db)
    .await?)
}
