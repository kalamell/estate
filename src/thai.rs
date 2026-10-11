//! ตัวช่วยภาษาไทย: จำนวนเงินเป็นตัวอักษร (BAHTTEXT) และปี พ.ศ.

const DIGITS: [&str; 10] = [
    "ศูนย์",
    "หนึ่ง",
    "สอง",
    "สาม",
    "สี่",
    "ห้า",
    "หก",
    "เจ็ด",
    "แปด",
    "เก้า",
];
const PLACES: [&str; 6] = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/// อ่านจำนวนเต็มบวก (`has_higher` = มีหลักที่สูงกว่านี้อยู่ข้างหน้า ใช้ตัดสิน "เอ็ด")
fn words(n: u64, has_higher: bool) -> String {
    if n >= 1_000_000 {
        let (high, rest) = (n / 1_000_000, n % 1_000_000);
        let mut out = words(high, has_higher) + "ล้าน";
        if rest > 0 {
            out += &words(rest, true);
        }
        return out;
    }
    let mut out = String::new();
    let digits: Vec<u64> = n
        .to_string()
        .chars()
        .map(|c| c as u64 - '0' as u64)
        .collect();
    let len = digits.len();
    for (i, &d) in digits.iter().enumerate() {
        let pos = len - 1 - i;
        if d == 0 {
            continue;
        }
        match pos {
            0 if d == 1 && (has_higher || len > 1) => out += "เอ็ด",
            1 if d == 1 => out += "สิบ",
            1 if d == 2 => out += "ยี่สิบ",
            _ => {
                out += DIGITS[d as usize];
                out += PLACES[pos];
            }
        }
    }
    out
}

/// จำนวนเงินเป็นตัวอักษรไทย เช่น 1056.5 → "หนึ่งพันห้าสิบหกบาทห้าสิบสตางค์"
pub fn baht_text(amount: f64) -> String {
    let negative = amount < 0.0;
    let satang_total = (amount.abs() * 100.0).round() as u64;
    let (baht, satang) = (satang_total / 100, satang_total % 100);
    let mut out = String::from(if negative { "ลบ" } else { "" });
    if baht == 0 && satang == 0 {
        return "ศูนย์บาทถ้วน".into();
    }
    if baht > 0 {
        out += &words(baht, false);
        out += "บาท";
    }
    if satang == 0 {
        out += "ถ้วน";
    } else {
        out += &words(satang, false);
        out += "สตางค์";
    }
    out
}

pub fn buddhist_year(year: i32) -> i32 {
    year + 543
}

#[cfg(test)]
mod tests {
    use super::baht_text;

    #[test]
    fn reads_amounts() {
        let cases = [
            (0.0, "ศูนย์บาทถ้วน"),
            (1.0, "หนึ่งบาทถ้วน"),
            (11.0, "สิบเอ็ดบาทถ้วน"),
            (21.0, "ยี่สิบเอ็ดบาทถ้วน"),
            (101.0, "หนึ่งร้อยเอ็ดบาทถ้วน"),
            (4644.0, "สี่พันหกร้อยสี่สิบสี่บาทถ้วน"),
            (1056.5, "หนึ่งพันห้าสิบหกบาทห้าสิบสตางค์"),
            (0.25, "ยี่สิบห้าสตางค์"),
            (1_000_000.0, "หนึ่งล้านบาทถ้วน"),
            (1_000_001.0, "หนึ่งล้านเอ็ดบาทถ้วน"),
            (21_000_000.0, "ยี่สิบเอ็ดล้านบาทถ้วน"),
            (
                12_345_678.9,
                "สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปดบาทเก้าสิบสตางค์",
            ),
        ];
        for (n, expected) in cases {
            assert_eq!(baht_text(n), expected, "{n}");
        }
    }
}
