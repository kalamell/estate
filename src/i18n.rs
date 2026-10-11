//! ภาษาของข้อความถึงผู้เช่า (ไทย / อังกฤษ) — ผู้เช่าเลือกเองในพอร์ทัลหรือพิมพ์ "English" ใน LINE

use chrono::{Datelike, NaiveDate};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Lang {
    #[default]
    Th,
    En,
}

pub const CODES: &[&str] = &["th", "en"];

impl Lang {
    pub fn from_code(code: &str) -> Self {
        if code.eq_ignore_ascii_case("en") {
            Lang::En
        } else {
            Lang::Th
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Lang::Th => "th",
            Lang::En => "en",
        }
    }

    /// เลือกข้อความตามภาษา
    pub fn t<'a>(self, th: &'a str, en: &'a str) -> &'a str {
        match self {
            Lang::Th => th,
            Lang::En => en,
        }
    }

    /// วันที่แบบสั้น: 16 ต.ค. 2569 / 16 Oct 2026
    pub fn date(self, d: NaiveDate) -> String {
        match self {
            Lang::Th => crate::thai::short_date(d),
            Lang::En => {
                const M: [&str; 12] = [
                    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov",
                    "Dec",
                ];
                format!("{} {} {}", d.day(), M[d.month0() as usize], d.year())
            }
        }
    }
}

/// ภาษาที่ผู้เช่าเลือกไว้
pub async fn tenant_lang(db: &SqlitePool, tenant_id: i64) -> Lang {
    sqlx::query_scalar::<_, String>("SELECT lang FROM tenants WHERE id = ?")
        .bind(tenant_id)
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
        .map(|c| Lang::from_code(&c))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_dates() {
        let d: NaiveDate = "2026-10-16".parse().unwrap();
        assert_eq!(Lang::En.date(d), "16 Oct 2026");
        assert_eq!(Lang::Th.date(d), "16 ต.ค. 2569");
        assert_eq!(Lang::from_code("EN"), Lang::En);
        assert_eq!(Lang::from_code("xx"), Lang::Th);
    }
}
