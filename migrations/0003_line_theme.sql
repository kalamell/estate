-- ===== ธีมสีขององค์กร และการเชื่อมต่อ LINE Official Account (Messaging API) =====
ALTER TABLE organizations ADD COLUMN theme               TEXT NOT NULL DEFAULT 'ink';
ALTER TABLE organizations ADD COLUMN line_enabled        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN line_channel_id     TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN line_basic_id       TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN line_channel_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN line_access_token   TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN line_webhook_key    TEXT;
ALTER TABLE organizations ADD COLUMN line_auto_invoice   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN line_auto_receipt   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN line_auto_ticket    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN line_auto_remind    INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX idx_org_line_webhook ON organizations(line_webhook_key);

-- บัญชี LINE ของผู้เช่า (userId ผูกกับ provider ของ OA นั้น ๆ)
ALTER TABLE tenants ADD COLUMN line_user_id      TEXT;
ALTER TABLE tenants ADD COLUMN line_display_name TEXT;
ALTER TABLE tenants ADD COLUMN line_linked_at    TEXT;
ALTER TABLE tenants ADD COLUMN line_link_code    TEXT;
ALTER TABLE tenants ADD COLUMN line_link_expires TEXT;
CREATE INDEX idx_tenants_line_user ON tenants(org_id, line_user_id);
CREATE UNIQUE INDEX idx_tenants_line_code ON tenants(org_id, line_link_code);

-- บันทึกข้อความที่ส่งออก (ใช้กันส่งซ้ำผ่าน dedupe_key เช่น การเตือนค้างชำระ)
CREATE TABLE line_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id  INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL,
    status     TEXT NOT NULL CHECK (status IN ('sent','failed')),
    error      TEXT,
    dedupe_key TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_line_messages_org ON line_messages(org_id, id);
