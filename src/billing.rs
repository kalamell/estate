//! การคำนวณค่าเช่าและค่าสาธารณูปโภค (แยกจาก DB เพื่อทดสอบได้ง่าย)

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LineItem {
    pub label: String,
    pub qty: f64,
    pub unit_price: f64,
    pub amount: f64,
}

impl LineItem {
    pub fn new(label: impl Into<String>, qty: f64, unit_price: f64) -> Self {
        Self {
            label: label.into(),
            qty,
            unit_price,
            amount: round2(qty * unit_price),
        }
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
