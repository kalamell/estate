-- นำเข้าข้อมูลจาก Excel/CSV แบบจับคู่คอลัมน์เอง

CREATE TABLE imports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    filename   TEXT NOT NULL,
    sheets     TEXT NOT NULL,               -- JSON: [{name, rows: [[...]]}]
    status     TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','committed')),
    result     TEXT,                        -- JSON สรุปผลเมื่อนำเข้าแล้ว
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_imports_org ON imports(org_id, id);

-- จำการจับคู่คอลัมน์ของไฟล์รูปแบบเดิม (ตามหัวตาราง)
CREATE TABLE import_mappings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    signature  TEXT NOT NULL,
    mapping    TEXT NOT NULL,               -- JSON: {field_key: column_index}
    options    TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (org_id, signature)
);
