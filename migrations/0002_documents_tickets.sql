-- หมายเหตุ: migration รันบน connection ที่ปิด foreign_keys (ดู db::connect)
-- ไม่เช่นนั้น DROP TABLE invoices จะลบ payments ตาม ON DELETE CASCADE

-- ===== ข้อมูลผู้ออกเอกสารและภาษี =====
ALTER TABLE organizations ADD COLUMN legal_name     TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN tax_id         TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN branch_code    TEXT NOT NULL DEFAULT '00000'; -- 00000 = สำนักงานใหญ่
ALTER TABLE organizations ADD COLUMN address        TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN phone          TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN vat_registered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN vat_rate       REAL NOT NULL DEFAULT 7;
ALTER TABLE organizations ADD COLUMN receipt_note   TEXT NOT NULL DEFAULT '';

-- ผู้เช่าที่เป็นนิติบุคคล + ลิงก์พอร์ทัล
ALTER TABLE tenants ADD COLUMN tax_id       TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN address      TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN branch_code  TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN portal_token TEXT;
CREATE UNIQUE INDEX idx_tenants_portal ON tenants(portal_token);

-- ค่าปรับชำระล่าช้ารายโครงการ
ALTER TABLE properties ADD COLUMN late_fee_type       TEXT NOT NULL DEFAULT 'none'; -- none / flat / per_day
ALTER TABLE properties ADD COLUMN late_fee_amount     REAL NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN late_fee_grace_days INTEGER NOT NULL DEFAULT 0;

-- ค่าบริการรายเดือนเพิ่มเติมต่อห้อง: [{label, amount, vatable}]
ALTER TABLE units ADD COLUMN extra_charges TEXT NOT NULL DEFAULT '[]';

-- ใบแจ้งหนี้: เลขที่เอกสาร ภาษี และการยกเลิก
ALTER TABLE invoices ADD COLUMN doc_no      TEXT;
ALTER TABLE invoices ADD COLUMN kind        TEXT NOT NULL DEFAULT 'monthly'; -- monthly / manual / move_out
ALTER TABLE invoices ADD COLUMN subtotal    REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN vat_amount  REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN void_reason TEXT;
UPDATE invoices SET subtotal = total;

-- ใบแจ้งหนี้แบบสร้างเองอาจมีหลายใบต่อเดือน: เปลี่ยน UNIQUE(unit_id, period) เป็นเฉพาะบิลรายเดือนที่ยังไม่ยกเลิก
CREATE TABLE invoices_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id     INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    booking_id  INTEGER REFERENCES bookings(id),
    period      TEXT NOT NULL,
    issue_date  TEXT NOT NULL,
    due_date    TEXT NOT NULL,
    items       TEXT NOT NULL,
    total       REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','void')),
    paid_at     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    doc_no      TEXT,
    kind        TEXT NOT NULL DEFAULT 'monthly',
    subtotal    REAL NOT NULL DEFAULT 0,
    vat_amount  REAL NOT NULL DEFAULT 0,
    void_reason TEXT
);
INSERT INTO invoices_new SELECT id, unit_id, booking_id, period, issue_date, due_date, items, total, status,
    paid_at, created_at, doc_no, kind, subtotal, vat_amount, void_reason FROM invoices;
DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;
CREATE UNIQUE INDEX idx_invoices_monthly ON invoices(unit_id, period) WHERE kind = 'monthly' AND status != 'void';
CREATE INDEX idx_invoices_unit ON invoices(unit_id, status);

-- เลขที่เอกสารเรียงต่อเนื่องรายองค์กร/ประเภท/ปี (ห้ามข้ามเลข)
CREATE TABLE doc_sequences (
    org_id   INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,   -- INV / RC / DS
    year     INTEGER NOT NULL, -- พ.ศ.
    last_no  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (org_id, doc_type, year)
);

-- ใบเสร็จรับเงิน / ใบกำกับภาษี — เก็บสำเนาข้อมูลผู้ออกและผู้จ่าย ณ วันที่ออก (แก้ไขย้อนหลังไม่ได้)
CREATE TABLE receipts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id         INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    doc_no         TEXT NOT NULL,
    is_tax_invoice INTEGER NOT NULL DEFAULT 0,
    invoice_id     INTEGER REFERENCES invoices(id),
    tenant_id      INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
    payment_id     INTEGER REFERENCES payments(id),
    issue_date     TEXT NOT NULL,
    issuer         TEXT NOT NULL, -- JSON snapshot
    payer          TEXT NOT NULL, -- JSON snapshot
    unit_name      TEXT NOT NULL DEFAULT '',
    property_name  TEXT NOT NULL DEFAULT '',
    items          TEXT NOT NULL,
    subtotal       REAL NOT NULL,
    vat_amount     REAL NOT NULL DEFAULT 0,
    total          REAL NOT NULL,
    wht_amount     REAL NOT NULL DEFAULT 0,
    net_received   REAL NOT NULL,
    method         TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
    void_reason    TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (org_id, doc_no)
);
CREATE INDEX idx_receipts_invoice ON receipts(invoice_id);

ALTER TABLE payments ADD COLUMN wht_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN late_fee   REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN voided     INTEGER NOT NULL DEFAULT 0;

-- ===== แจ้งซ่อม / ติดต่อ (scope org = ผู้เช่า→หอพัก, platform = ลูกค้า→ผู้ให้บริการ) =====
CREATE TABLE tickets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id           INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    scope            TEXT NOT NULL CHECK (scope IN ('org','platform')),
    property_id      INTEGER REFERENCES properties(id) ON DELETE SET NULL,
    unit_id          INTEGER REFERENCES units(id) ON DELETE SET NULL,
    tenant_id        INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
    source           TEXT NOT NULL CHECK (source IN ('tenant','staff','org')),
    reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reporter_name    TEXT NOT NULL,
    category         TEXT NOT NULL,
    priority         TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    title            TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','resolved','closed')),
    assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    photos           TEXT NOT NULL DEFAULT '[]',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tickets_org ON tickets(org_id, scope, status);

CREATE TABLE ticket_messages (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id      INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_type    TEXT NOT NULL CHECK (author_type IN ('staff','tenant','platform')),
    author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_name    TEXT NOT NULL,
    body           TEXT NOT NULL,
    internal       INTEGER NOT NULL DEFAULT 0, -- บันทึกภายใน ผู้เช่าไม่เห็น
    photos         TEXT NOT NULL DEFAULT '[]',
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ticket_messages ON ticket_messages(ticket_id);

CREATE TABLE announcements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id      INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== ย้ายออก & คืนเงินประกัน =====
CREATE TABLE move_outs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id              INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id          INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    doc_no              TEXT,
    move_out_date       TEXT NOT NULL,
    deposit_amount      REAL NOT NULL,
    deductions          TEXT NOT NULL DEFAULT '[]', -- [{label, amount}]
    include_outstanding INTEGER NOT NULL DEFAULT 1,
    note                TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','settled')),
    refund_method       TEXT,
    settled_at          TEXT,
    outstanding_settled REAL NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ฟีเจอร์ใหม่ในแพ็กเกจ
UPDATE packages SET features = json_set(features,
    '$.portal', json(CASE WHEN json_extract(features, '$.ocr') THEN 'true' ELSE 'false' END),
    '$.reports', json(CASE WHEN json_extract(features, '$.ocr') THEN 'true' ELSE 'false' END));
