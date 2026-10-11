//! ตรวจสลิปโอนเงิน
//!
//! 1. อ่าน QR บนสลิป (มาตรฐานสลิปของธนาคารไทย: รหัสธนาคารผู้โอน + เลขอ้างอิงธุรกรรม) — ทำในเครื่อง ไม่มีค่าใช้จ่าย
//! 2. กันสลิปซ้ำด้วยเลขอ้างอิงธุรกรรม (ข้ามบิลและข้ามองค์กร)
//! 3. (ไม่บังคับ) ส่ง payload ไปตรวจกับผู้ให้บริการตรวจสลิป เพื่อยืนยันยอดเงิน ผู้โอน ผู้รับ
//!
//! QR บนสลิปไม่มียอดเงิน — ถ้าไม่ได้ต่อผู้ให้บริการ ระบบยืนยันได้แค่ว่า "เป็นสลิปจริงที่ยังไม่เคยใช้"
//! ส่วนยอดเงินต้องให้ทีมงานดูจากรูป

use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use crate::{billing::round2, error::AppResult};

pub const PROVIDERS: &[&str] = &["none", "easyslip", "slipok"];

// ---------- QR ----------

/// อ่านข้อความจาก QR ทุกตัวในรูป (ลองรูปย่อด้วยถ้ารูปใหญ่มาก)
pub fn decode_qr(bytes: &[u8]) -> Vec<String> {
    let Ok(img) = image::load_from_memory(bytes) else {
        return Vec::new();
    };
    let mut candidates = vec![img.to_luma8()];
    if img.width().max(img.height()) > 1600 {
        candidates.push(img.thumbnail(1200, 1200).to_luma8());
    }
    for grey in candidates {
        let (w, h) = grey.dimensions();
        let mut prepared =
            rqrr::PreparedImage::prepare_from_greyscale(w as usize, h as usize, |x, y| {
                grey.get_pixel(x as u32, y as u32).0[0]
            });
        let found: Vec<String> = prepared
            .detect_grids()
            .into_iter()
            .filter_map(|g| g.decode().ok().map(|(_, text)| text))
            .collect();
        if !found.is_empty() {
            return found;
        }
    }
    Vec::new()
}

fn tlv(s: &str) -> Option<Vec<(&str, &str)>> {
    let mut out = Vec::new();
    let mut rest = s;
    while !rest.is_empty() {
        let tag = rest.get(0..2)?;
        let len: usize = rest.get(2..4)?.parse().ok()?;
        let value = rest.get(4..4 + len)?;
        out.push((tag, value));
        rest = &rest[4 + len..];
    }
    Some(out)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SlipRef {
    pub bank_code: String,
    pub trans_ref: String,
}

/// แยกข้อมูลจาก QR สลิป (แท็ก 00 → 00 API ID, 01 รหัสธนาคาร, 02 เลขอ้างอิง; 51 ประเทศ; 91 CRC)
pub fn parse_payload(payload: &str) -> Option<SlipRef> {
    let top = tlv(payload.trim())?;
    let inner = top.iter().find(|(t, _)| *t == "00")?.1;
    let country_ok = top.iter().any(|(t, v)| *t == "51" && *v == "TH");
    let fields = tlv(inner)?;
    let get = |tag: &str| fields.iter().find(|(t, _)| *t == tag).map(|(_, v)| *v);
    let trans_ref = get("02")?;
    if !country_ok || trans_ref.len() < 8 || get("00").is_none() {
        return None;
    }
    Some(SlipRef {
        bank_code: get("01").unwrap_or_default().to_string(),
        trans_ref: trans_ref.to_string(),
    })
}

pub fn bank_name(code: &str) -> &'static str {
    match code {
        "002" => "กรุงเทพ",
        "004" => "กสิกรไทย",
        "006" => "กรุงไทย",
        "011" => "ทหารไทยธนชาต",
        "014" => "ไทยพาณิชย์",
        "022" => "ซีไอเอ็มบี ไทย",
        "024" => "ยูโอบี",
        "025" => "กรุงศรีอยุธยา",
        "030" => "ออมสิน",
        "033" => "อาคารสงเคราะห์",
        "034" => "ธ.ก.ส.",
        "066" => "อิสลามแห่งประเทศไทย",
        "067" => "ทิสโก้",
        "069" => "เกียรตินาคินภัทร",
        "070" => "ไอซีบีซี (ไทย)",
        "071" => "ไทยเครดิต",
        "073" => "แลนด์ แอนด์ เฮ้าส์",
        _ => "",
    }
}

// ---------- ผู้ให้บริการตรวจสลิป ----------

#[derive(Debug, Clone)]
pub struct Provider {
    pub kind: String,
    pub api_key: String,
    pub branch_id: String,
}

impl Provider {
    pub fn configured(&self) -> bool {
        self.kind != "none" && !self.api_key.is_empty()
    }
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct Verified {
    pub amount: Option<f64>,
    pub trans_ref: Option<String>,
    pub sender: Option<String>,
    pub receiver: Option<String>,
    pub date: Option<String>,
}

fn s(v: &Value) -> Option<String> {
    v.as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn name_of(party: &Value) -> Option<String> {
    s(&party["account"]["name"]["th"])
        .or_else(|| s(&party["account"]["name"]["en"]))
        .or_else(|| s(&party["displayName"]))
        .or_else(|| s(&party["name"]))
}

/// อ่านคำตอบของผู้ให้บริการแบบยืดหยุ่น (รูปแบบของแต่ละรายต่างกันเล็กน้อย)
fn parse_verified(body: &Value) -> Verified {
    let d = &body["data"];
    let amount = d["amount"]["amount"]
        .as_f64()
        .or_else(|| d["amount"].as_f64());
    let date = s(&d["date"]).or_else(|| {
        s(&d["transDate"]).map(|day| match s(&d["transTime"]) {
            Some(t) => format!("{day} {t}"),
            None => day,
        })
    });
    Verified {
        amount,
        trans_ref: s(&d["transRef"]),
        sender: name_of(&d["sender"]),
        receiver: name_of(&d["receiver"]),
        date,
    }
}

/// ตรวจ payload กับผู้ให้บริการ — คืนข้อความผิดพลาดที่อ่านเข้าใจได้
/// รูปแบบ API อ้างอิงเอกสารสาธารณะของผู้ให้บริการ ควรทดสอบกับบัญชีจริงก่อนเปิดยืนยันอัตโนมัติ
pub async fn verify(
    http: &reqwest::Client,
    base_override: Option<&str>,
    p: &Provider,
    payload: &str,
) -> Result<Verified, String> {
    let req = match p.kind.as_str() {
        "easyslip" => {
            let base = base_override.unwrap_or("https://developer.easyslip.com");
            http.get(format!("{base}/api/v1/verify"))
                .query(&[("payload", payload)])
                .bearer_auth(&p.api_key)
        }
        "slipok" => {
            let base = base_override.unwrap_or("https://api.slipok.com");
            http.post(format!(
                "{base}/api/line/apikey/{}",
                urlencoding::encode(&p.branch_id)
            ))
            .header("x-authorization", &p.api_key)
            .json(&serde_json::json!({ "data": payload, "log": true }))
        }
        _ => return Err("ยังไม่ได้ตั้งค่าผู้ให้บริการตรวจสลิป".into()),
    };
    let res = req
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("เชื่อมต่อผู้ให้บริการตรวจสลิปไม่ได้: {e}"))?;
    let status = res.status();
    let body: Value = res.json().await.unwrap_or(Value::Null);
    let ok =
        status.is_success() && body["success"].as_bool() != Some(false) && body["data"].is_object();
    if !ok {
        let msg = s(&body["message"])
            .or_else(|| s(&body["data"]["message"]))
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(format!("ผู้ให้บริการตรวจสลิปตอบกลับ: {msg}"));
    }
    Ok(parse_verified(&body))
}

// ---------- ตรวจและบันทึกผล ----------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct SlipCheck {
    pub id: i64,
    pub source: String,
    pub source_id: i64,
    pub bank_code: Option<String>,
    pub trans_ref: Option<String>,
    pub expected_amount: Option<f64>,
    pub amount: Option<f64>,
    pub sender_name: Option<String>,
    pub receiver_name: Option<String>,
    pub transferred_at: Option<String>,
    pub provider: String,
    pub result: String,
    pub message: String,
    pub duplicate_of: Option<i64>,
    pub created_at: String,
}

impl SlipCheck {
    /// ผ่านการตรวจกับธนาคาร ยอดตรง ไม่ซ้ำ — ใช้ตัดสินยืนยันอัตโนมัติ
    pub fn verified(&self) -> bool {
        self.result == "verified"
    }
}

pub struct CheckInput<'a> {
    pub org_id: i64,
    pub source: &'a str,
    pub source_id: i64,
    pub slip_url: &'a str,
    pub expected: Option<f64>,
}

const CHECK_SELECT: &str = "SELECT id, source, source_id, bank_code, trans_ref, expected_amount, amount,
        sender_name, receiver_name, transferred_at, provider, result, message, duplicate_of, created_at
    FROM slip_checks";

pub async fn latest(db: &SqlitePool, source: &str, source_id: i64) -> AppResult<Option<SlipCheck>> {
    Ok(sqlx::query_as(&format!(
        "{CHECK_SELECT} WHERE source = ? AND source_id = ? ORDER BY id DESC LIMIT 1"
    ))
    .bind(source)
    .bind(source_id)
    .fetch_optional(db)
    .await?)
}

/// ตรวจสลิปจากไฟล์ที่อัปโหลดแล้ว บันทึกผล และคืนผลตรวจ (ไม่ล้มเหลวเพราะสลิปไม่ผ่าน — ผลอยู่ใน `result`)
pub async fn check(
    state: &crate::AppState,
    provider: Option<&Provider>,
    input: CheckInput<'_>,
) -> AppResult<SlipCheck> {
    let file = input.slip_url.trim_start_matches("/uploads/");
    let bytes = tokio::fs::read(state.upload_dir.join(file))
        .await
        .unwrap_or_default();
    let payloads = tokio::task::spawn_blocking(move || decode_qr(&bytes))
        .await
        .unwrap_or_default();
    let found = payloads
        .iter()
        .find_map(|p| parse_payload(p).map(|r| (p.clone(), r)));

    let mut result = "unreadable";
    let mut message = String::from("ไม่พบ QR ของสลิปในรูป — ตรวจยอดและชื่อบัญชีจากรูปด้วยตนเอง");
    let mut verified = Verified::default();
    let mut duplicate_of = None;
    let mut used_provider = "none";

    if let Some((payload, r)) = &found {
        let dup: Option<(i64, String)> = sqlx::query_as(
            "SELECT id, created_at FROM slip_checks
             WHERE trans_ref = ? AND result != 'duplicate' AND NOT (source = ? AND source_id = ?)
             ORDER BY id LIMIT 1",
        )
        .bind(&r.trans_ref)
        .bind(input.source)
        .bind(input.source_id)
        .fetch_optional(&state.db)
        .await?;
        if let Some((id, at)) = dup {
            result = "duplicate";
            duplicate_of = Some(id);
            message = format!(
                "สลิปนี้เคยถูกใช้แล้ว (เลขอ้างอิง {} เมื่อ {at}) — อาจเป็นการใช้สลิปซ้ำ",
                r.trans_ref
            );
        } else if let Some(p) = provider.filter(|p| p.configured()) {
            used_provider = if p.kind == "slipok" {
                "slipok"
            } else {
                "easyslip"
            };
            match verify(&state.http, state.slip_api_base.as_deref(), p, payload).await {
                Ok(v) => {
                    verified = v;
                    match (verified.amount, input.expected) {
                        (Some(got), Some(want)) if (round2(got) - round2(want)).abs() > 0.005 => {
                            result = "mismatch";
                            message =
                                format!("ยอดในสลิป {got:.2} บาท ไม่ตรงกับยอดที่ต้องชำระ {want:.2} บาท");
                        }
                        (Some(_), _) => {
                            result = "verified";
                            message = "ตรวจกับธนาคารแล้ว ยอดเงินถูกต้อง".into();
                        }
                        (None, _) => {
                            result = "readable";
                            message = "ผู้ให้บริการไม่ส่งยอดเงินกลับมา — ตรวจยอดจากรูป".into();
                        }
                    }
                }
                Err(e) => {
                    result = "error";
                    message = e;
                }
            }
        } else {
            result = "readable";
            let bank = bank_name(&r.bank_code);
            message = format!(
                "สลิปมี QR ถูกต้อง{} ยังไม่เคยใช้ — ยังไม่ได้ยืนยันยอดกับธนาคาร ตรวจยอดจากรูป",
                if bank.is_empty() {
                    String::new()
                } else {
                    format!(" (โอนจาก{bank})")
                }
            );
        }
    }

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO slip_checks (org_id, source, source_id, slip_url, payload, bank_code, trans_ref,
            expected_amount, amount, sender_name, receiver_name, transferred_at, provider, result, message,
            duplicate_of)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    )
    .bind(input.org_id)
    .bind(input.source)
    .bind(input.source_id)
    .bind(input.slip_url)
    .bind(found.as_ref().map(|(p, _)| p))
    .bind(found.as_ref().map(|(_, r)| &r.bank_code))
    .bind(found.as_ref().map(|(_, r)| &r.trans_ref))
    .bind(input.expected)
    .bind(verified.amount)
    .bind(&verified.sender)
    .bind(&verified.receiver)
    .bind(&verified.date)
    .bind(used_provider)
    .bind(result)
    .bind(&message)
    .bind(duplicate_of)
    .fetch_one(&state.db)
    .await?;
    Ok(sqlx::query_as(&format!("{CHECK_SELECT} WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db)
        .await?)
}

/// ตั้งค่าผู้ให้บริการขององค์กร (คีย์ถอดรหัสแล้ว)
pub async fn org_provider(db: &SqlitePool, org_id: i64) -> AppResult<(Provider, bool)> {
    let (kind, key, branch, auto): (String, String, String, bool) = sqlx::query_as(
        "SELECT slip_provider, slip_api_key, slip_branch_id, slip_auto_approve FROM organizations WHERE id = ?",
    )
    .bind(org_id)
    .fetch_one(db)
    .await?;
    Ok((
        Provider {
            kind,
            api_key: crate::crypto::decrypt(&key),
            branch_id: branch,
        },
        auto,
    ))
}

pub async fn platform_provider(db: &SqlitePool) -> AppResult<(Provider, bool)> {
    let (kind, key, branch, auto): (String, String, String, bool) = sqlx::query_as(
        "SELECT slip_provider, slip_api_key, slip_branch_id, slip_auto_approve FROM platform_settings WHERE id = 1",
    )
    .fetch_one(db)
    .await?;
    Ok((
        Provider {
            kind,
            api_key: crate::crypto::decrypt(&key),
            branch_id: branch,
        },
        auto,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// สร้าง payload แบบสลิปจริงสำหรับทดสอบ
    pub fn sample(bank: &str, trans_ref: &str) -> String {
        let t = |tag: &str, v: &str| format!("{tag}{:02}{v}", v.len());
        let inner = t("00", "000001") + &t("01", bank) + &t("02", trans_ref);
        let body = t("00", &inner) + &t("51", "TH") + "9104";
        let crc = crate::promptpay::crc16(body.as_bytes());
        format!("{body}{crc:04X}")
    }

    #[test]
    fn parses_bank_slip_qr() {
        let p = sample("004", "014242082547BPM04988");
        assert_eq!(
            parse_payload(&p),
            Some(SlipRef {
                bank_code: "004".into(),
                trans_ref: "014242082547BPM04988".into()
            })
        );
        // QR พร้อมเพย์สำหรับจ่ายเงินไม่ใช่สลิป
        let pp = crate::promptpay::payload("0812345678", Some(100.0)).unwrap();
        assert_eq!(parse_payload(&pp), None);
        assert_eq!(parse_payload("hello"), None);
    }

    #[test]
    fn reads_provider_responses() {
        let easy = serde_json::json!({"status": 200, "data": {
            "transRef": "ABC", "date": "2026-10-01T10:00:00+07:00",
            "amount": {"amount": 4500, "local": {"amount": 0}},
            "sender": {"account": {"name": {"th": "นาย ก"}}},
            "receiver": {"account": {"name": {"th": "หอ ข"}}}}});
        let v = parse_verified(&easy);
        assert_eq!(v.amount, Some(4500.0));
        assert_eq!(v.sender.as_deref(), Some("นาย ก"));
        let ok = serde_json::json!({"success": true, "data": {
            "transRef": "ABC", "transDate": "20261001", "transTime": "10:00:00", "amount": 4500.5,
            "sender": {"displayName": "นาย ก"}, "receiver": {"displayName": "หอ ข"}}});
        let v = parse_verified(&ok);
        assert_eq!(v.amount, Some(4500.5));
        assert_eq!(v.date.as_deref(), Some("20261001 10:00:00"));
        assert_eq!(v.receiver.as_deref(), Some("หอ ข"));
    }
}
