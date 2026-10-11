//! อ่านไฟล์นำเข้า (CSV / Excel) และแปลงค่าในเซลล์ให้อยู่ในรูปแบบของระบบ
//!
//! ผู้ใช้ไม่ต้องใช้แม่แบบของเรา — อัปโหลดไฟล์ของตัวเอง แล้วจับคู่คอลัมน์กับช่องข้อมูล (mapping)
//! ระบบเดาการจับคู่จากชื่อหัวคอลัมน์ (ไทย/อังกฤษ) และจำการจับคู่ไว้ใช้ครั้งต่อไป

use std::io::Cursor;

use calamine::{open_workbook_auto_from_rs, Data, Reader};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

pub const MAX_ROWS: usize = 5000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sheet {
    pub name: String,
    pub rows: Vec<Vec<String>>,
}

// ---------- อ่านไฟล์ ----------

fn number_text(f: f64) -> String {
    if f.fract() == 0.0 && f.abs() < 1e15 {
        format!("{}", f as i64)
    } else {
        let s = format!("{f:.6}");
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

fn cell_text(c: &Data) -> String {
    match c {
        Data::Empty | Data::Error(_) => String::new(),
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => number_text(*f),
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(d) => excel_serial_date(d.as_f64())
            .map(|dt| dt.to_string())
            .unwrap_or_else(|| number_text(d.as_f64())),
        Data::DateTimeIso(s) => s.get(..10).unwrap_or(s).to_string(),
        Data::DurationIso(s) => s.clone(),
    }
}

/// เลขวันที่ของ Excel (นับวันจาก 30 ธ.ค. 1899)
fn excel_serial_date(n: f64) -> Option<NaiveDate> {
    if !(1.0..2_958_466.0).contains(&n) {
        return None;
    }
    NaiveDate::from_ymd_opt(1899, 12, 30)?
        .checked_add_signed(chrono::Duration::days(n.floor() as i64))
}

/// ข้อความ CSV: UTF-8 (มี/ไม่มี BOM) หรือ Windows-874 (CSV ภาษาไทยจาก Excel)
fn decode_text(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => encoding_rs::WINDOWS_874.decode(bytes).0.into_owned(),
    }
}

fn parse_csv(bytes: &[u8]) -> Result<Vec<Sheet>, String> {
    let text = decode_text(bytes);
    let first = text.lines().next().unwrap_or_default();
    let delimiter = (*b",;\t")
        .into_iter()
        .max_by_key(|d| first.matches(*d as char).count())
        .unwrap_or(b',');
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .delimiter(delimiter)
        .from_reader(text.as_bytes());
    let mut rows = Vec::new();
    for rec in reader.records().take(MAX_ROWS + 50) {
        let rec = rec.map_err(|e| format!("อ่านไฟล์ CSV ไม่ได้: {e}"))?;
        rows.push(rec.iter().map(|c| c.trim().to_string()).collect());
    }
    Ok(vec![Sheet {
        name: "CSV".into(),
        rows,
    }])
}

fn parse_workbook(bytes: &[u8]) -> Result<Vec<Sheet>, String> {
    let mut wb = open_workbook_auto_from_rs(Cursor::new(bytes.to_vec()))
        .map_err(|e| format!("อ่านไฟล์ Excel ไม่ได้: {e}"))?;
    let mut sheets = Vec::new();
    for name in wb.sheet_names().to_vec() {
        let Ok(range) = wb.worksheet_range(&name) else {
            continue;
        };
        let rows: Vec<Vec<String>> = range
            .rows()
            .take(MAX_ROWS + 50)
            .map(|r| r.iter().map(cell_text).collect())
            .collect();
        if rows.iter().any(|r| r.iter().any(|c| !c.is_empty())) {
            sheets.push(Sheet { name, rows });
        }
    }
    Ok(sheets)
}

/// อ่านไฟล์ตามนามสกุล (csv/txt หรือ xlsx/xls/xlsm/ods)
pub fn read_file(filename: &str, bytes: &[u8]) -> Result<Vec<Sheet>, String> {
    let ext = filename
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_lowercase();
    let sheets = match ext.as_str() {
        "csv" | "txt" | "tsv" => parse_csv(bytes)?,
        "xlsx" | "xlsm" | "xls" | "xlsb" | "ods" => parse_workbook(bytes)?,
        _ => return Err("รองรับไฟล์ .xlsx, .xls, .ods หรือ .csv เท่านั้น".into()),
    };
    if sheets.is_empty() {
        return Err("ไม่พบข้อมูลในไฟล์".into());
    }
    Ok(sheets)
}

/// แถวหัวตาราง: แถวแรกที่มีข้อความอย่างน้อย 2 ช่อง
pub fn guess_header_row(rows: &[Vec<String>]) -> usize {
    rows.iter()
        .take(20)
        .position(|r| r.iter().filter(|c| !c.trim().is_empty()).count() >= 2)
        .unwrap_or(0)
}

// ---------- ช่องข้อมูลของระบบ ----------

pub struct Field {
    pub key: &'static str,
    pub label: &'static str,
    pub group: &'static str,
    pub kind: &'static str, // text / number / date / phone
    synonyms: &'static [&'static str],
}

pub const FIELDS: &[Field] = &[
    Field {
        key: "property_name",
        label: "ชื่อโครงการ / อาคาร",
        group: "ห้อง",
        kind: "text",
        synonyms: &[
            "โครงการ",
            "ชื่อโครงการ",
            "อาคาร",
            "ตึก",
            "ชื่อหอ",
            "หอพัก",
            "property",
            "building",
            "project",
        ],
    },
    Field {
        key: "unit_name",
        label: "เลขห้อง",
        group: "ห้อง",
        kind: "text",
        synonyms: &[
            "ห้อง",
            "เลขห้อง",
            "หมายเลขห้อง",
            "เลขที่ห้อง",
            "room",
            "roomno",
            "roomnumber",
            "unit",
            "unitno",
        ],
    },
    Field {
        key: "floor",
        label: "ชั้น",
        group: "ห้อง",
        kind: "number",
        synonyms: &["ชั้น", "floor", "level"],
    },
    Field {
        key: "rent_monthly",
        label: "ค่าเช่ารายเดือน",
        group: "ห้อง",
        kind: "number",
        synonyms: &[
            "ค่าเช่า",
            "ค่าห้อง",
            "ค่าเช่ารายเดือน",
            "ค่าเช่าต่อเดือน",
            "ราคา",
            "ราคาห้อง",
            "rent",
            "monthlyrent",
            "price",
        ],
    },
    Field {
        key: "rate_daily",
        label: "ราคารายวัน",
        group: "ห้อง",
        kind: "number",
        synonyms: &[
            "รายวัน",
            "ราคารายวัน",
            "ค่าห้องรายวัน",
            "dailyrate",
            "nightly",
            "pernight",
        ],
    },
    Field {
        key: "tenant_name",
        label: "ชื่อผู้เช่า",
        group: "ผู้เช่า",
        kind: "text",
        synonyms: &[
            "ชื่อผู้เช่า",
            "ผู้เช่า",
            "ชื่อ-นามสกุล",
            "ชื่อนามสกุล",
            "ชื่อ",
            "tenant",
            "tenantname",
            "fullname",
            "name",
        ],
    },
    Field {
        key: "tenant_phone",
        label: "เบอร์โทร",
        group: "ผู้เช่า",
        kind: "phone",
        synonyms: &[
            "เบอร์โทร",
            "เบอร์โทรศัพท์",
            "โทรศัพท์",
            "เบอร์",
            "มือถือ",
            "โทร",
            "phone",
            "tel",
            "mobile",
            "telephone",
        ],
    },
    Field {
        key: "tenant_email",
        label: "อีเมล",
        group: "ผู้เช่า",
        kind: "text",
        synonyms: &["อีเมล", "อีเมล์", "email", "e-mail", "mail"],
    },
    Field {
        key: "tenant_id_card",
        label: "เลขบัตรประชาชน / พาสปอร์ต",
        group: "ผู้เช่า",
        kind: "text",
        synonyms: &[
            "เลขบัตรประชาชน",
            "บัตรประชาชน",
            "เลขบัตร",
            "เลขประจำตัว",
            "พาสปอร์ต",
            "หนังสือเดินทาง",
            "idcard",
            "citizenid",
            "passport",
            "nationalid",
        ],
    },
    Field {
        key: "tenant_address",
        label: "ที่อยู่ผู้เช่า",
        group: "ผู้เช่า",
        kind: "text",
        synonyms: &["ที่อยู่", "ที่อยู่ตามบัตร", "address"],
    },
    Field {
        key: "tenant_nationality",
        label: "สัญชาติ (รหัส 2 ตัว)",
        group: "ผู้เช่า",
        kind: "text",
        synonyms: &["สัญชาติ", "nationality", "country"],
    },
    Field {
        key: "start_date",
        label: "วันเริ่มสัญญา / วันเข้าพัก",
        group: "สัญญา",
        kind: "date",
        synonyms: &[
            "วันเริ่มสัญญา",
            "วันเข้าพัก",
            "วันที่เข้าพัก",
            "วันที่เข้า",
            "เริ่มสัญญา",
            "วันเริ่มเช่า",
            "เข้าพัก",
            "startdate",
            "start",
            "movein",
            "checkin",
        ],
    },
    Field {
        key: "end_date",
        label: "วันสิ้นสุดสัญญา",
        group: "สัญญา",
        kind: "date",
        synonyms: &[
            "วันสิ้นสุดสัญญา",
            "สิ้นสุดสัญญา",
            "หมดสัญญา",
            "วันหมดสัญญา",
            "วันสิ้นสุด",
            "enddate",
            "end",
            "moveout",
            "checkout",
        ],
    },
    Field {
        key: "lease_rent",
        label: "ค่าเช่าตามสัญญา (ถ้าต่างจากค่าห้อง)",
        group: "สัญญา",
        kind: "number",
        synonyms: &["ค่าเช่าตามสัญญา", "ค่าเช่าสัญญา", "contractrent", "leaserent"],
    },
    Field {
        key: "deposit",
        label: "เงินประกัน / มัดจำ",
        group: "สัญญา",
        kind: "number",
        synonyms: &[
            "เงินประกัน",
            "ประกัน",
            "มัดจำ",
            "ค่ามัดจำ",
            "เงินมัดจำ",
            "deposit",
            "securitydeposit",
        ],
    },
    Field {
        key: "electric_reading",
        label: "เลขมิเตอร์ไฟล่าสุด",
        group: "มิเตอร์",
        kind: "number",
        synonyms: &[
            "มิเตอร์ไฟ",
            "เลขมิเตอร์ไฟ",
            "มิเตอร์ไฟฟ้า",
            "หน่วยไฟ",
            "ไฟฟ้า",
            "electric",
            "electricity",
            "electricmeter",
        ],
    },
    Field {
        key: "water_reading",
        label: "เลขมิเตอร์น้ำล่าสุด",
        group: "มิเตอร์",
        kind: "number",
        synonyms: &[
            "มิเตอร์น้ำ",
            "เลขมิเตอร์น้ำ",
            "หน่วยน้ำ",
            "น้ำประปา",
            "น้ำ",
            "water",
            "watermeter",
        ],
    },
    Field {
        key: "reading_date",
        label: "วันที่จดมิเตอร์",
        group: "มิเตอร์",
        kind: "date",
        synonyms: &[
            "วันที่จดมิเตอร์",
            "วันจดมิเตอร์",
            "วันที่จด",
            "readingdate",
            "meterdate",
        ],
    },
    Field {
        key: "note",
        label: "หมายเหตุ",
        group: "อื่น ๆ",
        kind: "text",
        synonyms: &["หมายเหตุ", "note", "notes", "remark", "remarks"],
    },
];

pub fn field(key: &str) -> Option<&'static Field> {
    FIELDS.iter().find(|f| f.key == key)
}

fn norm(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| {
            !c.is_whitespace() && !matches!(c, '_' | '.' | ':' | '(' | ')' | '/' | '*' | '#')
        })
        .collect()
}

/// เดาการจับคู่คอลัมน์ → ช่องข้อมูล (แต่ละช่องใช้ได้คอลัมน์เดียว เลือกคะแนนสูงสุดก่อน)
pub fn suggest_mapping(headers: &[String]) -> std::collections::BTreeMap<String, usize> {
    let mut candidates: Vec<(i32, &str, usize)> = Vec::new();
    for (col, h) in headers.iter().enumerate() {
        let h = norm(h);
        if h.is_empty() {
            continue;
        }
        for f in FIELDS {
            let mut best = 0;
            for syn in f.synonyms {
                let s = norm(syn);
                let score = if h == s {
                    1000
                } else if h.starts_with(&s) || h.ends_with(&s) {
                    500 + s.chars().count() as i32
                } else if h.contains(&s) {
                    200 + s.chars().count() as i32
                } else {
                    0
                };
                best = best.max(score);
            }
            if best > 0 {
                candidates.push((best, f.key, col));
            }
        }
    }
    candidates.sort_by_key(|c| std::cmp::Reverse(c.0));
    let mut out = std::collections::BTreeMap::new();
    let mut used_cols = std::collections::HashSet::new();
    for (_, key, col) in candidates {
        if out.contains_key(key) || used_cols.contains(&col) {
            continue;
        }
        out.insert(key.to_string(), col);
        used_cols.insert(col);
    }
    out
}

/// ลายเซ็นของหัวตาราง ใช้จำการจับคู่ของไฟล์รูปแบบเดิม
pub fn header_signature(headers: &[String]) -> String {
    headers
        .iter()
        .map(|h| norm(h))
        .filter(|h| !h.is_empty())
        .collect::<Vec<_>>()
        .join("|")
}

// ---------- แปลงค่า ----------

pub fn parse_number(s: &str) -> Option<f64> {
    let cleaned: String = s
        .replace("บาท", "")
        .replace(['฿', ',', ' '], "")
        .trim()
        .to_string();
    if cleaned.is_empty() {
        return None;
    }
    cleaned.parse().ok()
}

/// เบอร์โทร: เก็บเฉพาะตัวเลข (+ นำหน้าได้) และเติม 0 ที่ Excel ตัดทิ้ง (เบอร์ 9 หลัก)
pub fn normalize_phone(s: &str) -> String {
    let plus = s.trim().starts_with('+');
    let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    if plus {
        return format!("+{digits}");
    }
    if digits.len() == 9 && digits.starts_with(['2', '3', '4', '5', '6', '7', '8', '9']) {
        return format!("0{digits}");
    }
    digits
}

/// เลขบัตร: Excel อาจแสดงเป็น 1.1017E+12 — แปลงกลับเป็นตัวเลขเต็ม
pub fn normalize_id(s: &str) -> String {
    let t = s.trim();
    if t.contains(['E', 'e']) && !t.chars().any(|c| c.is_alphabetic() && c != 'E' && c != 'e') {
        if let Ok(f) = t.parse::<f64>() {
            return number_text(f);
        }
    }
    t.replace([' ', '-'], "")
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum DateOrder {
    #[default]
    Dmy,
    Mdy,
    Ymd,
}

const TH_MONTHS: [&[&str]; 12] = [
    &["มกราคม", "ม.ค.", "มค"],
    &["กุมภาพันธ์", "ก.พ.", "กพ"],
    &["มีนาคม", "มี.ค.", "มีค"],
    &["เมษายน", "เม.ย.", "เมย"],
    &["พฤษภาคม", "พ.ค.", "พค"],
    &["มิถุนายน", "มิ.ย.", "มิย"],
    &["กรกฎาคม", "ก.ค.", "กค"],
    &["สิงหาคม", "ส.ค.", "สค"],
    &["กันยายน", "ก.ย.", "กย"],
    &["ตุลาคม", "ต.ค.", "ตค"],
    &["พฤศจิกายน", "พ.ย.", "พย"],
    &["ธันวาคม", "ธ.ค.", "ธค"],
];
const EN_MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// ปี: พ.ศ. (> 2400) → ค.ศ., ปี 2 หลัก: ≥ 40 ถือเป็น พ.ศ. 25xx, น้อยกว่าเป็น ค.ศ. 20xx
fn fix_year(y: i32) -> i32 {
    match y {
        y if y > 2400 => y - 543,
        y if (40..100).contains(&y) => 2500 + y - 543,
        y if y < 100 => 2000 + y,
        y => y,
    }
}

fn month_from_word(w: &str) -> Option<u32> {
    let w = w.trim().trim_end_matches(',');
    for (i, names) in TH_MONTHS.iter().enumerate() {
        if names.iter().any(|n| w == *n || norm(w) == norm(n)) {
            return Some(i as u32 + 1);
        }
    }
    let lw = w.to_lowercase();
    EN_MONTHS
        .iter()
        .position(|m| lw.starts_with(m))
        .map(|i| i as u32 + 1)
}

/// วันที่หลายรูปแบบ: 2024-01-31, 31/01/2567, 31-1-67, 31 ม.ค. 2567, 31 January 2024, เลขวันที่ของ Excel
pub fn parse_date(s: &str, order: DateOrder) -> Option<NaiveDate> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    // ค่าวันที่แบบตัวเลขของ Excel (เช่น 45292)
    if let Ok(n) = t.parse::<f64>() {
        if (20000.0..80000.0).contains(&n) {
            return excel_serial_date(n);
        }
        return None;
    }
    let t = t
        .split(['T', ' '])
        .next()
        .filter(|p| p.contains(['-', '/', '.']))
        .unwrap_or(t);
    let parts: Vec<&str> = t
        .split(|c: char| c == '/' || c == '-' || c == '.' || c.is_whitespace())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.len() != 3 {
        // "31 ม.ค. 2567" แยกด้วยช่องว่าง แต่ตัวย่อมีจุด
        let words: Vec<&str> = s.split_whitespace().collect();
        if words.len() == 3 {
            let d: u32 = words[0].parse().ok()?;
            let m = month_from_word(words[1])?;
            let y = fix_year(words[2].parse().ok()?);
            return NaiveDate::from_ymd_opt(y, m, d);
        }
        return None;
    }
    let num = |p: &str| p.parse::<i32>().ok();
    // มีชื่อเดือนอยู่ตรงกลาง
    if num(parts[1]).is_none() {
        let m = month_from_word(parts[1])?;
        return NaiveDate::from_ymd_opt(fix_year(num(parts[2])?), m, num(parts[0])? as u32);
    }
    let (a, b, c) = (num(parts[0])?, num(parts[1])?, num(parts[2])?);
    let (y, m, d) = if parts[0].len() == 4 || order == DateOrder::Ymd {
        (a, b, c)
    } else if order == DateOrder::Mdy {
        (c, a, b)
    } else {
        (c, b, a)
    };
    NaiveDate::from_ymd_opt(fix_year(y), m as u32, d as u32)
}

/// รหัสประเทศ 2 ตัวจากชื่อที่พบบ่อย (ไม่รู้จัก = คืนค่าเดิมถ้าเป็น 2 ตัวอักษร)
pub fn normalize_nationality(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        return Some(String::new());
    }
    if t.len() == 2 && t.chars().all(|c| c.is_ascii_alphabetic()) {
        return Some(t.to_uppercase());
    }
    let n = norm(t);
    let map: &[(&[&str], &str)] = &[
        (&["ไทย", "thai", "thailand"], "TH"),
        (&["พม่า", "เมียนมา", "myanmar", "burmese"], "MM"),
        (&["ลาว", "laos", "lao"], "LA"),
        (&["กัมพูชา", "เขมร", "cambodia", "cambodian"], "KH"),
        (&["เวียดนาม", "vietnam", "vietnamese"], "VN"),
        (&["จีน", "china", "chinese"], "CN"),
        (&["ญี่ปุ่น", "japan", "japanese"], "JP"),
        (&["เกาหลี", "korea", "korean"], "KR"),
        (&["อินเดีย", "india", "indian"], "IN"),
        (&["อเมริกา", "สหรัฐ", "usa", "american", "unitedstates"], "US"),
        (&["อังกฤษ", "uk", "british", "unitedkingdom"], "GB"),
        (&["ฝรั่งเศส", "france", "french"], "FR"),
        (&["เยอรมัน", "เยอรมนี", "germany", "german"], "DE"),
        (&["รัสเซีย", "russia", "russian"], "RU"),
        (&["ฟิลิปปินส์", "philippines", "filipino"], "PH"),
        (&["มาเลเซีย", "malaysia", "malaysian"], "MY"),
        (&["สิงคโปร์", "singapore", "singaporean"], "SG"),
        (&["อินโดนีเซีย", "indonesia", "indonesian"], "ID"),
        (&["ออสเตรเลีย", "australia", "australian"], "AU"),
    ];
    map.iter()
        .find(|(names, _)| names.iter().any(|x| n.contains(&norm(x))))
        .map(|(_, code)| code.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        s.parse().unwrap()
    }

    #[test]
    fn parses_thai_and_excel_dates() {
        let o = DateOrder::Dmy;
        assert_eq!(parse_date("31/01/2567", o), Some(d("2024-01-31")));
        assert_eq!(parse_date("1-2-67", o), Some(d("2024-02-01")));
        assert_eq!(parse_date("2024-03-05", o), Some(d("2024-03-05")));
        assert_eq!(parse_date("5 มี.ค. 2567", o), Some(d("2024-03-05")));
        assert_eq!(parse_date("5 มีนาคม 2567", o), Some(d("2024-03-05")));
        assert_eq!(parse_date("5 March 2024", o), Some(d("2024-03-05")));
        assert_eq!(parse_date("45292", o), Some(d("2024-01-01")));
        assert_eq!(
            parse_date("03/05/2024", DateOrder::Mdy),
            Some(d("2024-03-05"))
        );
        assert_eq!(parse_date("2024-01-31 00:00:00", o), Some(d("2024-01-31")));
        assert_eq!(parse_date("31/02/2024", o), None);
        assert_eq!(parse_date("ไม่ระบุ", o), None);
    }

    #[test]
    fn cleans_numbers_phones_ids() {
        assert_eq!(parse_number("฿3,500.50"), Some(3500.5));
        assert_eq!(parse_number("4500 บาท"), Some(4500.0));
        assert_eq!(parse_number(""), None);
        assert_eq!(normalize_phone("812345678"), "0812345678");
        assert_eq!(normalize_phone("081-234-5678"), "0812345678");
        assert_eq!(normalize_phone("+66 81 234 5678"), "+66812345678");
        assert_eq!(normalize_id("1.1017E+12"), "1101700000000");
        assert_eq!(normalize_id("1-1017-00012-34-5"), "1101700012345");
        assert_eq!(normalize_nationality("พม่า").as_deref(), Some("MM"));
        assert_eq!(normalize_nationality("us").as_deref(), Some("US"));
        assert_eq!(normalize_nationality("Atlantis"), None);
    }

    #[test]
    fn suggests_mapping_from_thai_and_english_headers() {
        let headers: Vec<String> = [
            "ชื่อหอ",
            "เลขห้อง",
            "ชั้น",
            "ค่าเช่า",
            "ชื่อ-นามสกุล",
            "เบอร์โทร",
            "วันที่เข้าพัก",
            "มัดจำ",
            "มิเตอร์ไฟ",
            "มิเตอร์น้ำ",
            "Remark",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let m = suggest_mapping(&headers);
        assert_eq!(m.get("property_name"), Some(&0));
        assert_eq!(m.get("unit_name"), Some(&1));
        assert_eq!(m.get("floor"), Some(&2));
        assert_eq!(m.get("rent_monthly"), Some(&3));
        assert_eq!(m.get("tenant_name"), Some(&4));
        assert_eq!(m.get("tenant_phone"), Some(&5));
        assert_eq!(m.get("start_date"), Some(&6));
        assert_eq!(m.get("deposit"), Some(&7));
        assert_eq!(m.get("electric_reading"), Some(&8));
        assert_eq!(m.get("water_reading"), Some(&9));
        assert_eq!(m.get("note"), Some(&10));
        let en: Vec<String> = ["Room No", "Tenant Name", "Phone", "Monthly Rent"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let m = suggest_mapping(&en);
        assert_eq!(m.get("unit_name"), Some(&0));
        assert_eq!(m.get("tenant_name"), Some(&1));
        assert_eq!(m.get("rent_monthly"), Some(&3));
    }

    #[test]
    fn reads_windows_874_csv() {
        let (bytes, _, _) = encoding_rs::WINDOWS_874.encode("ห้อง,ชื่อ\n101,สมชาย\n");
        let sheets = read_file("x.csv", &bytes).unwrap();
        assert_eq!(
            sheets[0].rows[1],
            vec!["101".to_string(), "สมชาย".to_string()]
        );
        let semi = read_file("x.csv", "a;b\n1;2\n".as_bytes()).unwrap();
        assert_eq!(semi[0].rows[1], vec!["1".to_string(), "2".to_string()]);
    }
}
