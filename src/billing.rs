//! การคำนวณค่าเช่าและค่าสาธารณูปโภค (แยกจาก DB เพื่อทดสอบได้ง่าย)

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LineItem {
    pub label: String,
    pub qty: f64,
    pub unit_price: f64,
    pub amount: f64,
    /// คิดภาษีมูลค่าเพิ่มหรือไม่ (ค่าเช่าที่อยู่อาศัยโดยทั่วไปได้รับยกเว้น)
    #[serde(default)]
    pub vatable: bool,
}

impl LineItem {
    pub fn new(label: impl Into<String>, qty: f64, unit_price: f64) -> Self {
        Self {
            label: label.into(),
            qty,
            unit_price,
            amount: round2(qty * unit_price),
            vatable: false,
        }
    }

    pub fn vatable(mut self, vatable: bool) -> Self {
        self.vatable = vatable;
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Totals {
    pub subtotal: f64,
    pub vat_amount: f64,
    pub total: f64,
}

/// รวมยอด: VAT คิดแบบแยกนอกเฉพาะรายการที่ `vatable` และเมื่อผู้ออกจดทะเบียน VAT
pub fn totals(items: &[LineItem], vat_registered: bool, vat_rate: f64) -> Totals {
    let subtotal = round2(items.iter().map(|i| i.amount).sum());
    let vatable: f64 = items.iter().filter(|i| i.vatable).map(|i| i.amount).sum();
    let vat_amount = if vat_registered {
        round2(vatable * vat_rate / 100.0)
    } else {
        0.0
    };
    Totals {
        subtotal,
        vat_amount,
        total: round2(subtotal + vat_amount),
    }
}

/// ค่าปรับชำระล่าช้าตามกติกาของโครงการ
pub fn late_fee(kind: &str, amount: f64, grace_days: i64, overdue_days: i64) -> f64 {
    let days = overdue_days - grace_days.max(0);
    if days <= 0 {
        return 0.0;
    }
    match kind {
        "flat" => round2(amount),
        "per_day" => round2(amount * days as f64),
        _ => 0.0,
    }
}

#[derive(Debug, Clone, Copy)]
pub struct MeterPair {
    pub previous: f64,
    pub current: f64,
}

impl MeterPair {
    /// จำนวนหน่วยที่ใช้ รองรับมิเตอร์วนรอบ (เช่น 9999 -> 0012) เมื่อระบุ `rollover`
    pub fn usage(&self, rollover: Option<f64>) -> Result<f64, String> {
        let diff = self.current - self.previous;
        if diff >= 0.0 {
            return Ok(diff);
        }
        match rollover {
            Some(max) => Ok(max - self.previous + self.current),
            None => Err(format!(
                "ค่ามิเตอร์ปัจจุบัน ({}) น้อยกว่าครั้งก่อน ({})",
                self.current, self.previous
            )),
        }
    }
}

pub struct MonthlyInput {
    pub rent: f64,
    pub electric: Option<MeterPair>,
    pub electric_rate: f64,
    pub water: Option<MeterPair>,
    pub water_rate: f64,
}

pub fn monthly_items(input: &MonthlyInput) -> Result<Vec<LineItem>, String> {
    let mut items = vec![LineItem::new("ค่าเช่าห้อง", 1.0, input.rent)];
    if let Some(m) = input.electric {
        let used = m.usage(None)?;
        items.push(LineItem::new(
            format!("ค่าไฟฟ้า ({} → {})", m.previous, m.current),
            used,
            input.electric_rate,
        ));
    }
    if let Some(m) = input.water {
        let used = m.usage(None)?;
        items.push(LineItem::new(
            format!("ค่าน้ำประปา ({} → {})", m.previous, m.current),
            used,
            input.water_rate,
        ));
    }
    Ok(items)
}

pub fn total(items: &[LineItem]) -> f64 {
    round2(items.iter().map(|i| i.amount).sum())
}

pub fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_monthly_bill() {
        let items = monthly_items(&MonthlyInput {
            rent: 3500.0,
            electric: Some(MeterPair {
                previous: 1200.0,
                current: 1325.0,
            }),
            electric_rate: 8.0,
            water: Some(MeterPair {
                previous: 50.0,
                current: 58.0,
            }),
            water_rate: 18.0,
        })
        .unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[1].amount, 1000.0);
        assert_eq!(items[2].amount, 144.0);
        assert_eq!(total(&items), 4644.0);
    }

    #[test]
    fn vat_only_on_vatable_lines() {
        let items = vec![
            LineItem::new("ค่าเช่า", 1.0, 3500.0),
            LineItem::new("ค่าอินเทอร์เน็ต", 1.0, 300.0).vatable(true),
        ];
        let t = totals(&items, true, 7.0);
        assert_eq!((t.subtotal, t.vat_amount, t.total), (3800.0, 21.0, 3821.0));
        assert_eq!(totals(&items, false, 7.0).vat_amount, 0.0);
    }

    #[test]
    fn late_fee_rules() {
        assert_eq!(late_fee("none", 50.0, 0, 10), 0.0);
        assert_eq!(late_fee("flat", 200.0, 3, 2), 0.0);
        assert_eq!(late_fee("flat", 200.0, 3, 4), 200.0);
        assert_eq!(late_fee("per_day", 50.0, 3, 10), 350.0);
    }

    #[test]
    fn rejects_decreasing_meter() {
        let r = MeterPair {
            previous: 100.0,
            current: 90.0,
        }
        .usage(None);
        assert!(r.is_err());
    }

    #[test]
    fn handles_rollover() {
        let r = MeterPair {
            previous: 9990.0,
            current: 15.0,
        }
        .usage(Some(10000.0));
        assert_eq!(r.unwrap(), 25.0);
    }
}
