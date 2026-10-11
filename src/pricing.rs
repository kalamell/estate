//! คำนวณราคาห้องพักรายวันตามกฎ (ฤดูกาล วันหยุด วันในสัปดาห์) และส่วนลดเมื่อพักหลายคืน

use chrono::{Datelike, Duration, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::billing::round2;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Rule {
    pub id: i64,
    pub property_id: i64,
    pub unit_id: Option<i64>,
    #[sqlx(default)]
    pub unit_name: Option<String>,
    pub name: String,
    pub rule_type: String,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    #[sqlx(json)]
    pub weekdays: Vec<u32>,
    pub adjustment: String,
    pub value: f64,
    pub min_nights: Option<i64>,
    pub priority: i64,
    pub active: bool,
}

impl Rule {
    fn applies_to_unit(&self, unit_id: i64) -> bool {
        self.active && self.unit_id.is_none_or(|u| u == unit_id)
    }

    fn matches_night(&self, unit_id: i64, date: NaiveDate) -> bool {
        self.rule_type == "night"
            && self.applies_to_unit(unit_id)
            && self.start_date.is_none_or(|s| date >= s)
            && self.end_date.is_none_or(|e| date <= e)
            && (self.weekdays.is_empty()
                || self
                    .weekdays
                    .contains(&date.weekday().num_days_from_sunday()))
    }

    fn apply(&self, base: f64) -> f64 {
        let price = match self.adjustment.as_str() {
            "fixed" => self.value,
            "percent" => base * (1.0 + self.value / 100.0),
            _ => base + self.value,
        };
        price.max(0.0).round()
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Night {
    pub date: NaiveDate,
    pub base: f64,
    pub price: f64,
    pub rules: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Discount {
    pub name: String,
    pub percent: f64,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Quote {
    pub nights: Vec<Night>,
    pub nights_count: i64,
    pub subtotal: f64,
    pub discount: Option<Discount>,
    pub total: f64,
    pub average_rate: f64,
}

/// ราคาคืนเดียว: ใช้กฎที่ตรงเงื่อนไขและสำคัญที่สุด (priority สูงกว่า > เจาะจงห้อง > สร้างทีหลัง)
pub fn night_price(base: f64, rules: &[Rule], unit_id: i64, date: NaiveDate) -> Night {
    let winner = rules
        .iter()
        .filter(|r| r.matches_night(unit_id, date))
        .max_by_key(|r| (r.priority, r.unit_id.is_some(), r.id));
    match winner {
        Some(r) => Night {
            date,
            base,
            price: r.apply(base),
            rules: vec![r.name.clone()],
        },
        None => Night {
            date,
            base,
            price: base,
            rules: vec![],
        },
    }
}

pub fn quote(
    base: f64,
    rules: &[Rule],
    unit_id: i64,
    check_in: NaiveDate,
    check_out: NaiveDate,
) -> Quote {
    let count = (check_out - check_in).num_days().max(0);
    let nights: Vec<Night> = (0..count)
        .map(|i| night_price(base, rules, unit_id, check_in + Duration::days(i)))
        .collect();
    let subtotal = round2(nights.iter().map(|n| n.price).sum());
    // ส่วนลดพักหลายคืน: ใช้ขั้นที่จำนวนคืนขั้นต่ำสูงสุดที่เข้าเงื่อนไข
    let discount = rules
        .iter()
        .filter(|r| {
            r.rule_type == "length"
                && r.applies_to_unit(unit_id)
                && r.min_nights.is_some_and(|m| count >= m)
        })
        .max_by_key(|r| (r.min_nights, r.priority, r.id))
        .map(|r| {
            let percent = r.value.clamp(0.0, 100.0);
            Discount {
                name: r.name.clone(),
                percent,
                amount: (subtotal * percent / 100.0).round(),
            }
        })
        .filter(|d| d.amount > 0.0);
    let total = round2(subtotal - discount.as_ref().map_or(0.0, |d| d.amount));
    let average_rate = if count > 0 {
        round2(total / count as f64)
    } else {
        0.0
    };
    Quote {
        nights,
        nights_count: count,
        subtotal,
        discount,
        total,
        average_rate,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn rule(id: i64, name: &str, kind: &str) -> Rule {
        Rule {
            id,
            property_id: 1,
            unit_id: None,
            unit_name: None,
            name: name.into(),
            rule_type: kind.into(),
            start_date: None,
            end_date: None,
            weekdays: vec![],
            adjustment: "percent".into(),
            value: 0.0,
            min_nights: None,
            priority: 0,
            active: true,
        }
    }

    #[test]
    fn weekend_and_season_rules() {
        let weekend = Rule {
            weekdays: vec![5, 6],
            value: 20.0,
            ..rule(1, "สุดสัปดาห์", "night")
        };
        let songkran = Rule {
            start_date: Some(d("2026-04-12")),
            end_date: Some(d("2026-04-16")),
            value: 50.0,
            priority: 10,
            ..rule(2, "สงกรานต์", "night")
        };
        let rules = vec![weekend, songkran];
        // 2026-04-10 = ศุกร์, 2026-04-13 = จันทร์ (สงกรานต์), 2026-04-17 = ศุกร์ หลังสงกรานต์
        assert_eq!(
            night_price(1000.0, &rules, 7, d("2026-04-10")).price,
            1200.0
        );
        assert_eq!(
            night_price(1000.0, &rules, 7, d("2026-04-13")).price,
            1500.0
        );
        assert_eq!(
            night_price(1000.0, &rules, 7, d("2026-04-16")).rules,
            vec!["สงกรานต์".to_string()]
        );
        assert_eq!(
            night_price(1000.0, &rules, 7, d("2026-04-08")).price,
            1000.0
        ); // พุธ ไม่มีกฎ
    }

    #[test]
    fn unit_specific_and_fixed_price() {
        let all = Rule {
            value: 10.0,
            ..rule(1, "ทั้งโครงการ", "night")
        };
        let vip = Rule {
            unit_id: Some(9),
            adjustment: "fixed".into(),
            value: 2500.0,
            ..rule(2, "ห้อง VIP", "night")
        };
        let rules = vec![all, vip];
        assert_eq!(
            night_price(1000.0, &rules, 9, d("2026-01-05")).price,
            2500.0
        );
        assert_eq!(
            night_price(1000.0, &rules, 3, d("2026-01-05")).price,
            1100.0
        );
        let inactive = Rule {
            active: false,
            adjustment: "amount".into(),
            value: -300.0,
            ..rule(3, "ปิด", "night")
        };
        assert_eq!(
            night_price(1000.0, &[inactive], 3, d("2026-01-05")).price,
            1000.0
        );
    }

    #[test]
    fn length_of_stay_discount_uses_best_tier() {
        let week = Rule {
            min_nights: Some(7),
            value: 10.0,
            ..rule(1, "7 คืนขึ้นไป", "length")
        };
        let month = Rule {
            min_nights: Some(28),
            value: 25.0,
            ..rule(2, "28 คืนขึ้นไป", "length")
        };
        let rules = vec![week, month];
        let q = quote(1000.0, &rules, 1, d("2026-05-01"), d("2026-05-04"));
        assert_eq!(
            (q.nights_count, q.total, q.discount.is_none()),
            (3, 3000.0, true)
        );
        let q = quote(1000.0, &rules, 1, d("2026-05-01"), d("2026-05-08"));
        assert_eq!(q.discount.as_ref().unwrap().amount, 700.0);
        assert_eq!(q.total, 6300.0);
        assert_eq!(q.average_rate, 900.0);
        let q = quote(1000.0, &rules, 1, d("2026-05-01"), d("2026-05-31"));
        assert_eq!(q.discount.unwrap().percent, 25.0);
    }

    #[test]
    fn price_never_negative() {
        let r = Rule {
            adjustment: "amount".into(),
            value: -5000.0,
            ..rule(1, "ลดแรง", "night")
        };
        assert_eq!(night_price(1000.0, &[r], 1, d("2026-01-01")).price, 0.0);
    }
}
