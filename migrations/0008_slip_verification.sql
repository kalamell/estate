-- ตรวจสลิปอัตโนมัติ + ผู้เช่าแจ้งชำระ (พอร์ทัล / ส่งรูปสลิปใน LINE)

-- ผู้ให้บริการตรวจสลิปกับธนาคาร (ไม่บังคับ): none / easyslip / slipok
ALTER TABLE organizations ADD COLUMN slip_provider TEXT NOT NULL DEFAULT 'none';
ALTER TABLE organizations ADD COLUMN slip_api_key TEXT NOT NULL DEFAULT '';   -- เข้ารหัส
ALTER TABLE organizations ADD COLUMN slip_branch_id TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN slip_auto_approve INTEGER NOT NULL DEFAULT 0;

ALTER TABLE platform_settings ADD COLUMN slip_provider TEXT NOT NULL DEFAULT 'none';
ALTER TABLE platform_settings ADD COLUMN slip_api_key TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_settings ADD COLUMN slip_branch_id TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_settings ADD COLUMN slip_auto_approve INTEGER NOT NULL DEFAULT 0;

-- ผลตรวจสลิปทุกใบ (ใช้กันสลิปซ้ำข้ามบิล/ข้ามองค์กรด้วยเลขอ้างอิงธุรกรรม)
CREATE TABLE slip_checks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source          TEXT NOT NULL CHECK (source IN ('payment','booking','subscription')),
    source_id       INTEGER NOT NULL,
    slip_url        TEXT NOT NULL,
    payload         TEXT,
    bank_code       TEXT,
    trans_ref       TEXT,
    expected_amount REAL,
    amount          REAL,
    sender_name     TEXT,
    receiver_name   TEXT,
    transferred_at  TEXT,
    provider        TEXT NOT NULL DEFAULT 'none',
    result          TEXT NOT NULL
                    CHECK (result IN ('verified','readable','unreadable','duplicate','mismatch','error')),
    message         TEXT NOT NULL DEFAULT '',
    duplicate_of    INTEGER REFERENCES slip_checks(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_slip_checks_source ON slip_checks(source, source_id);
CREATE INDEX idx_slip_checks_ref ON slip_checks(trans_ref);

-- ผู้เช่าแจ้งชำระพร้อมสลิป รอทีมงานยืนยัน (หรือยืนยันอัตโนมัติเมื่อตรวจกับธนาคารผ่าน)
CREATE TABLE payment_notices (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id    INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    tenant_id     INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
    amount        REAL NOT NULL,
    slip_url      TEXT NOT NULL,
    note          TEXT NOT NULL DEFAULT '',
    channel       TEXT NOT NULL CHECK (channel IN ('portal','line')),
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    reject_reason TEXT,
    receipt_id    INTEGER REFERENCES receipts(id) ON DELETE SET NULL,
    reviewed_by   INTEGER REFERENCES users(id),
    reviewed_at   TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payment_notices_org ON payment_notices(org_id, status);
CREATE UNIQUE INDEX idx_payment_notices_open ON payment_notices(invoice_id) WHERE status = 'pending';
