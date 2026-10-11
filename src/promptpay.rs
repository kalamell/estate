//! สร้าง payload สำหรับ PromptPay QR ตามมาตรฐาน EMVCo (Thai QR Payment)

const AID_PROMPTPAY: &str = "A000000677010111";

fn tlv(tag: &str, value: &str) -> String {
    format!("{tag}{:02}{value}", value.len())
}

/// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF)
pub fn crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0xFFFF;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

/// `target` เป็นเบอร์มือถือ (10 หลัก), เลขบัตรประชาชน/เลขผู้เสียภาษี (13 หลัก) หรือ e-Wallet ID (15 หลัก)
/// `amount` ถ้าระบุ จะเป็น QR แบบระบุยอด (ใช้ครั้งเดียว)
pub fn payload(target: &str, amount: Option<f64>) -> Option<String> {
    let digits: String = target.chars().filter(|c| c.is_ascii_digit()).collect();
    let account = match digits.len() {
        10 if digits.starts_with('0') => tlv("01", &format!("0066{}", &digits[1..])),
        13 => tlv("02", &digits),
        15 => tlv("03", &digits),
        _ => return None,
    };

    let mut out = String::new();
    out += &tlv("00", "01");
    out += &tlv("01", if amount.is_some() { "12" } else { "11" });
    out += &tlv("29", &(tlv("00", AID_PROMPTPAY) + &account));
    out += &tlv("58", "TH");
    out += &tlv("53", "764");
    if let Some(a) = amount {
        out += &tlv("54", &format!("{a:.2}"));
    }
    out += "6304";
    let crc = crc16(out.as_bytes());
    out += &format!("{crc:04X}");
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc_check_value() {
        assert_eq!(crc16(b"123456789"), 0x29B1);
    }

    #[test]
    fn phone_payload_layout() {
        let p = payload("081-234-5678", Some(1500.0)).unwrap();
        assert!(p.starts_with("000201010212"));
        assert!(p.contains("29370016A000000677010111011300668123456785802TH5303764"));
        assert!(p.contains("54071500.00"));
        let (body, crc) = p.split_at(p.len() - 4);
        assert_eq!(crc, format!("{:04X}", crc16(body.as_bytes())));
    }

    #[test]
    fn rejects_invalid_target() {
        assert!(payload("12345", None).is_none());
    }
}
