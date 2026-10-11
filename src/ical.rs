//! iCalendar (RFC 5545) แบบเท่าที่จำเป็นสำหรับซิงก์ช่วงวันที่ไม่ว่างกับ Airbnb / Booking.com / Agoda

use chrono::{Duration, NaiveDate, Utc};

#[derive(Debug, Clone, PartialEq)]
pub struct Event {
    pub uid: String,
    /// วันเช็คอิน
    pub start: NaiveDate,
    /// วันเช็คเอาท์ (ไม่นับเป็นคืนที่พัก)
    pub end: NaiveDate,
    pub summary: String,
}

/// รวมบรรทัดที่ถูกพับ (บรรทัดถัดไปขึ้นต้นด้วยช่องว่างหรือแท็บ)
fn unfold(input: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in input.split('\n') {
        let line = raw.trim_end_matches('\r');
        if let Some(rest) = line.strip_prefix([' ', '\t']) {
            if let Some(last) = lines.last_mut() {
                last.push_str(rest);
                continue;
            }
        }
        lines.push(line.to_string());
    }
    lines
}

/// รองรับ `20250101`, `20250101T140000`, `20250101T140000Z` (ใช้เฉพาะส่วนวันที่)
fn parse_date(value: &str) -> Option<NaiveDate> {
    let digits: String = value.chars().take(8).collect();
    NaiveDate::parse_from_str(&digits, "%Y%m%d").ok()
}

fn unescape(v: &str) -> String {
    v.replace("\\n", " ")
        .replace("\\N", " ")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
}

/// (UID, DTSTART, DTEND, SUMMARY) ระหว่างอ่าน VEVENT
type Partial = (Option<String>, Option<NaiveDate>, Option<NaiveDate>, String);

pub fn parse(input: &str) -> Vec<Event> {
    let mut events = Vec::new();
    let mut current: Option<Partial> = None;
    for line in unfold(input) {
        let upper = line.to_ascii_uppercase();
        if upper == "BEGIN:VEVENT" {
            current = Some((None, None, None, String::new()));
            continue;
        }
        if upper == "END:VEVENT" {
            if let Some((uid, Some(start), end, summary)) = current.take() {
                // ไม่มี DTEND = 1 คืน; DTEND ไม่หลัง DTSTART ให้ถือเป็น 1 คืน
                let end = end
                    .filter(|e| *e > start)
                    .unwrap_or(start + Duration::days(1));
                let uid = uid.unwrap_or_else(|| format!("{start}-{end}"));
                events.push(Event {
                    uid,
                    start,
                    end,
                    summary,
                });
            }
            continue;
        }
        let Some(ev) = current.as_mut() else { continue };
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let name = key
            .split(';')
            .next()
            .unwrap_or_default()
            .to_ascii_uppercase();
        match name.as_str() {
            "UID" => ev.0 = Some(value.trim().to_string()),
            "DTSTART" => ev.1 = parse_date(value.trim()),
            "DTEND" => ev.2 = parse_date(value.trim()),
            "SUMMARY" => ev.3 = unescape(value.trim()),
            _ => {}
        }
    }
    events
}

/// พับบรรทัดยาวเกิน 75 octets ตามมาตรฐาน (ตัดตามขอบตัวอักษร UTF-8)
fn fold(line: &str) -> String {
    let mut out = String::new();
    let mut count = 0;
    for ch in line.chars() {
        let len = ch.len_utf8();
        if count + len > 74 {
            out.push_str("\r\n ");
            count = 1;
        }
        out.push(ch);
        count += len;
    }
    out
}

pub fn generate(name: &str, events: &[Event]) -> String {
    let stamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let mut lines = vec![
        "BEGIN:VCALENDAR".to_string(),
        "VERSION:2.0".to_string(),
        "PRODID:-//Estate//Rental Calendar//TH".to_string(),
        "CALSCALE:GREGORIAN".to_string(),
        "METHOD:PUBLISH".to_string(),
        format!("X-WR-CALNAME:{}", name.replace([',', ';'], " ")),
    ];
    for e in events {
        lines.extend([
            "BEGIN:VEVENT".to_string(),
            format!("UID:{}", e.uid),
            format!("DTSTAMP:{stamp}"),
            format!("DTSTART;VALUE=DATE:{}", e.start.format("%Y%m%d")),
            format!("DTEND;VALUE=DATE:{}", e.end.format("%Y%m%d")),
            format!(
                "SUMMARY:{}",
                e.summary.replace(',', "\\,").replace(';', "\\;")
            ),
            "END:VEVENT".to_string(),
        ]);
    }
    lines.push("END:VCALENDAR".to_string());
    lines
        .iter()
        .map(|l| fold(l))
        .collect::<Vec<_>>()
        .join("\r\n")
        + "\r\n"
}

#[cfg(test)]
mod tests {
    use super::*;

    const AIRBNB: &str = "BEGIN:VCALENDAR\r\nPRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN\r\nVERSION:2.0\r\n\
BEGIN:VEVENT\r\nDTEND;VALUE=DATE:20251105\r\nDTSTART;VALUE=DATE:20251102\r\nUID:1418fb94e984-aaaa@airbnb.com\r\n\
SUMMARY:Reserved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTEND;VALUE=DATE:20251120\r\nDTSTART;VALUE=DATE:20251118\r\n\
UID:1418fb94e984-bbbb@ai\r\n rbnb.com\r\nSUMMARY:Airbnb (Not available)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn parses_airbnb_feed_with_folded_lines() {
        let events = parse(AIRBNB);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].start, d("2025-11-02"));
        assert_eq!(events[0].end, d("2025-11-05"));
        assert_eq!(events[0].summary, "Reserved");
        assert_eq!(events[1].uid, "1418fb94e984-bbbb@airbnb.com");
    }

    #[test]
    fn handles_datetime_and_missing_end() {
        let feed =
            "BEGIN:VEVENT\nDTSTART:20250101T140000Z\nSUMMARY:CLOSED - Not available\nEND:VEVENT\n";
        let events = parse(feed);
        assert_eq!(events[0].start, d("2025-01-01"));
        assert_eq!(events[0].end, d("2025-01-02"));
        assert_eq!(events[0].uid, "2025-01-01-2025-01-02");
    }

    #[test]
    fn round_trips_generated_calendar() {
        let events = vec![Event {
            uid: "booking-1@estate".into(),
            start: d("2025-03-01"),
            end: d("2025-03-04"),
            summary: "Reserved".into(),
        }];
        let text = generate("ห้อง 101, หอ", &events);
        assert!(text.contains("DTSTART;VALUE=DATE:20250301\r\n"));
        assert!(text.lines().all(|l| l.len() <= 76));
        assert_eq!(parse(&text), events);
    }
}
