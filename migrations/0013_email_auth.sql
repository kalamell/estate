-- ส่งอีเมล (คิว + ส่งซ้ำเมื่อล้มเหลว) และโทเค็นยืนยันอีเมล / ตั้งรหัสผ่านใหม่

CREATE TABLE email_outbox (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    to_addr    TEXT NOT NULL,
    subject    TEXT NOT NULL,
    body_text  TEXT NOT NULL,
    body_html  TEXT NOT NULL,
    kind       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','logged')),
    attempts   INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at    TEXT
);
CREATE INDEX idx_email_outbox_status ON email_outbox(status, id);

CREATE TABLE auth_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose    TEXT NOT NULL CHECK (purpose IN ('reset','verify')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, purpose);

ALTER TABLE users ADD COLUMN email_verified_at TEXT;
-- ผู้ใช้เดิมถือว่ายืนยันแล้ว
UPDATE users SET email_verified_at = created_at;
