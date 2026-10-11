-- ผู้สนใจที่กรอกฟอร์มติดต่อจากหน้าแนะนำระบบ (landing page)
CREATE TABLE leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    email      TEXT NOT NULL DEFAULT '',
    business   TEXT NOT NULL DEFAULT '',   -- ชื่อหอ/กิจการ
    units      INTEGER,                    -- จำนวนห้องโดยประมาณ
    message    TEXT NOT NULL DEFAULT '',
    source     TEXT NOT NULL DEFAULT 'landing',
    status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','won','lost')),
    note       TEXT NOT NULL DEFAULT '',
    ip         TEXT,
    consent_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_leads_status ON leads(status, id);
