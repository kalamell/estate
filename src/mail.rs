//! ส่งอีเมลผ่าน SMTP แบบคิว: บันทึกลงตาราง `email_outbox` แล้วงานเบื้องหลังทยอยส่ง (ลองใหม่สูงสุด 5 ครั้ง)
//! ถ้าไม่ได้ตั้งค่า SMTP ระบบจะเขียนอีเมลลง log แทน (ใช้ตอนพัฒนา — ลิงก์ในอีเมลจะอยู่ใน log)

use std::time::Duration;

use lettre::{
    message::{header::ContentType, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Clone)]
pub struct Mailer {
    transport: Option<AsyncSmtpTransport<Tokio1Executor>>,
    from: Mailbox,
}

impl Default for Mailer {
    fn default() -> Self {
        Self {
            transport: None,
            from: "Estate <no-reply@localhost>".parse().expect("mailbox"),
        }
    }
}

impl Mailer {
    /// อ่านค่าจาก env: SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, SMTP_TLS (starttls/tls/none)
    pub fn from_env() -> anyhow::Result<Self> {
        let from = std::env::var("SMTP_FROM")
            .unwrap_or_else(|_| "Estate <no-reply@localhost>".into())
            .parse()
            .map_err(|e| anyhow::anyhow!("SMTP_FROM ไม่ถูกต้อง: {e}"))?;
        let Ok(host) = std::env::var("SMTP_HOST") else {
            tracing::warn!("ยังไม่ได้ตั้งค่า SMTP_HOST — อีเมลจะถูกเขียนลง log แทนการส่งจริง");
            return Ok(Self {
                transport: None,
                from,
            });
        };
        let tls = std::env::var("SMTP_TLS").unwrap_or_else(|_| "starttls".into());
        let mut builder = match tls.as_str() {
            "tls" => AsyncSmtpTransport::<Tokio1Executor>::relay(&host)?,
            "none" => AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&host),
            _ => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)?,
        };
        if let Some(port) = std::env::var("SMTP_PORT").ok().and_then(|p| p.parse().ok()) {
            builder = builder.port(port);
        }
        if let (Ok(user), Ok(pass)) = (
            std::env::var("SMTP_USERNAME"),
            std::env::var("SMTP_PASSWORD"),
        ) {
            builder = builder.credentials(Credentials::new(user, pass));
        }
        Ok(Self {
            transport: Some(builder.timeout(Some(Duration::from_secs(20))).build()),
            from,
        })
    }

    pub fn configured(&self) -> bool {
        self.transport.is_some()
    }

    async fn send(&self, to: &str, subject: &str, text: &str, html: &str) -> Result<bool, String> {
        let Some(transport) = &self.transport else {
            tracing::info!(to, subject, "อีเมล (ไม่ได้ตั้งค่า SMTP):\n{text}");
            return Ok(false);
        };
        let to: Mailbox = to.parse().map_err(|e| format!("อีเมลผู้รับไม่ถูกต้อง: {e}"))?;
        let message = Message::builder()
            .from(self.from.clone())
            .to(to)
            .subject(subject)
            .multipart(
                MultiPart::alternative()
                    .singlepart(
                        SinglePart::builder()
                            .header(ContentType::TEXT_PLAIN)
                            .body(text.to_string()),
                    )
                    .singlepart(
                        SinglePart::builder()
                            .header(ContentType::TEXT_HTML)
                            .body(html.to_string()),
                    ),
            )
            .map_err(|e| e.to_string())?;
        transport
            .send(message)
            .await
            .map(|_| true)
            .map_err(|e| e.to_string())
    }
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// เนื้อหาอีเมล: หัวเรื่อง ย่อหน้า และปุ่ม (ถ้ามี)
pub struct Email<'a> {
    pub to: &'a str,
    pub kind: &'a str,
    pub subject: String,
    pub heading: String,
    pub paragraphs: Vec<String>,
    pub button: Option<(String, String)>,
    pub footer: String,
}

impl Email<'_> {
    fn text(&self) -> String {
        let mut out = format!("{}\n\n", self.heading);
        for p in &self.paragraphs {
            out.push_str(p);
            out.push_str("\n\n");
        }
        if let Some((label, url)) = &self.button {
            out.push_str(&format!("{label}: {url}\n\n"));
        }
        out.push_str(&self.footer);
        out
    }

    fn html(&self) -> String {
        let paragraphs: String = self
            .paragraphs
            .iter()
            .map(|p| {
                format!(
                    "<p style=\"margin:0 0 14px;line-height:1.65;color:#3a3833\">{}</p>",
                    escape(p).replace('\n', "<br>")
                )
            })
            .collect();
        let button = self
            .button
            .as_ref()
            .map(|(label, url)| {
                format!(
                    "<p style=\"margin:22px 0\"><a href=\"{u}\" style=\"display:inline-block;background:#1F5135;color:#ffffff;\
                     text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600\">{l}</a></p>\
                     <p style=\"margin:0 0 14px;font-size:12px;color:#8c877d;word-break:break-all\">{u}</p>",
                    u = escape(url),
                    l = escape(label)
                )
            })
            .unwrap_or_default();
        format!(
            "<!doctype html><html><body style=\"margin:0;background:#f4f1ea;font-family:'Sarabun','Noto Sans Thai',Arial,sans-serif\">\
             <div style=\"max-width:560px;margin:0 auto;padding:28px 16px\">\
             <div style=\"background:#ffffff;border:1px solid #e4dfd3;border-radius:8px;padding:28px\">\
             <div style=\"font-size:12px;letter-spacing:.04em;color:#8c877d;margin-bottom:10px\">ESTATE</div>\
             <h1 style=\"font-size:20px;margin:0 0 16px;color:#1c1b19\">{h}</h1>{paragraphs}{button}</div>\
             <p style=\"font-size:12px;color:#8c877d;line-height:1.6;margin:16px 4px\">{f}</p></div></body></html>",
            h = escape(&self.heading),
            f = escape(&self.footer)
        )
    }
}

/// เข้าคิวส่งอีเมล (ส่งจริงโดยงานเบื้องหลัง)
pub async fn queue(db: &SqlitePool, email: Email<'_>) -> AppResult<i64> {
    Ok(sqlx::query_scalar(
        "INSERT INTO email_outbox (to_addr, subject, body_text, body_html, kind) VALUES (?,?,?,?,?) RETURNING id",
    )
    .bind(email.to)
    .bind(&email.subject)
    .bind(email.text())
    .bind(email.html())
    .bind(email.kind)
    .fetch_one(db)
    .await?)
}

/// ส่งอีเมลที่ค้างในคิว คืนจำนวนที่ส่ง/บันทึกแล้ว
pub async fn flush(db: &SqlitePool, mailer: &Mailer) -> AppResult<usize> {
    let rows: Vec<(i64, String, String, String, String)> = sqlx::query_as(
        "SELECT id, to_addr, subject, body_text, body_html FROM email_outbox
         WHERE status = 'queued' AND attempts < 5 ORDER BY id LIMIT 20",
    )
    .fetch_all(db)
    .await?;
    let mut done = 0;
    for (id, to, subject, text, html) in rows {
        match mailer.send(&to, &subject, &text, &html).await {
            Ok(sent) => {
                sqlx::query(
                    "UPDATE email_outbox SET status = ?, attempts = attempts + 1, sent_at = datetime('now') WHERE id = ?",
                )
                .bind(if sent { "sent" } else { "logged" })
                .bind(id)
                .execute(db)
                .await?;
                done += 1;
            }
            Err(e) => {
                tracing::warn!(id, error = %e, "ส่งอีเมลไม่สำเร็จ");
                sqlx::query(
                    "UPDATE email_outbox SET attempts = attempts + 1, last_error = ?,
                        status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'queued' END
                     WHERE id = ?",
                )
                .bind(e.chars().take(500).collect::<String>())
                .bind(id)
                .execute(db)
                .await?;
            }
        }
    }
    Ok(done)
}

pub fn spawn_sender(db: SqlitePool, mailer: std::sync::Arc<Mailer>) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(5));
        loop {
            tick.tick().await;
            if let Err(e) = flush(&db, &mailer).await {
                tracing::warn!(error = %e, "งานส่งอีเมลล้มเหลว");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_text_and_escaped_html() {
        let e = Email {
            to: "a@b.c",
            kind: "test",
            subject: "s".into(),
            heading: "ตั้งรหัสผ่านใหม่".into(),
            paragraphs: vec!["สวัสดี <script>".into()],
            button: Some(("ตั้งรหัสผ่าน".into(), "https://x.test/r?token=abc&x=1".into())),
            footer: "f".into(),
        };
        assert!(e.text().contains("https://x.test/r?token=abc&x=1"));
        let html = e.html();
        assert!(html.contains("&lt;script&gt;"));
        assert!(html.contains("token=abc&amp;x=1"));
    }
}
