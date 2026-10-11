-- เก็บค่าแพ็กเกจจากองค์กรลูกค้า (ใบแจ้งหนี้ของแพลตฟอร์ม → โอนพร้อมเพย์ → แนบสลิป → ผู้ดูแลยืนยัน → ต่ออายุ)

-- ข้อมูลผู้ให้บริการแพลตฟอร์ม (แถวเดียว id = 1) ใช้ออกใบแจ้งหนี้/ใบเสร็จค่าบริการ
CREATE TABLE platform_settings (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    company_name   TEXT NOT NULL DEFAULT '',
    tax_id         TEXT NOT NULL DEFAULT '',
    branch_code    TEXT NOT NULL DEFAULT '00000',
    address        TEXT NOT NULL DEFAULT '',
    phone          TEXT NOT NULL DEFAULT '',
    email          TEXT NOT NULL DEFAULT '',
    vat_registered INTEGER NOT NULL DEFAULT 0,
    vat_rate       REAL NOT NULL DEFAULT 7,
    promptpay_id   TEXT NOT NULL DEFAULT '',
    bank_info      TEXT NOT NULL DEFAULT '',   -- เลขบัญชีสำหรับโอน (แสดงคู่กับ QR)
    remind_days    INTEGER NOT NULL DEFAULT 7, -- ออกใบแจ้งหนี้ต่ออายุล่วงหน้ากี่วัน
    grace_days     INTEGER NOT NULL DEFAULT 3, -- หมดอายุแล้วยังใช้งานได้ต่ออีกกี่วัน
    yearly_months  INTEGER NOT NULL DEFAULT 10 -- ราคารายปี = ราคารายเดือน × จำนวนเดือนนี้ (ถ้าแพ็กเกจไม่กำหนดเอง)
);
INSERT INTO platform_settings (id) VALUES (1);

ALTER TABLE packages ADD COLUMN price_yearly REAL NOT NULL DEFAULT 0; -- 0 = คำนวณจาก yearly_months

ALTER TABLE organizations ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly','yearly'));

CREATE TABLE platform_doc_sequences (
    doc_type TEXT NOT NULL,
    year     INTEGER NOT NULL,
    last_no  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (doc_type, year)
);

CREATE TABLE subscription_invoices (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    doc_no        TEXT NOT NULL UNIQUE,
    kind          TEXT NOT NULL CHECK (kind IN ('renewal','change')),
    package_id    INTEGER NOT NULL REFERENCES packages(id),
    package_name  TEXT NOT NULL,
    cycle         TEXT NOT NULL CHECK (cycle IN ('monthly','yearly')),
    period_start  TEXT NOT NULL,
    period_end    TEXT NOT NULL,
    price         REAL NOT NULL,
    credit        REAL NOT NULL DEFAULT 0,  -- ส่วนลดจากวันที่เหลือของแพ็กเกจเดิม
    subtotal      REAL NOT NULL,
    vat_amount    REAL NOT NULL DEFAULT 0,
    total         REAL NOT NULL,
    due_date      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','review','paid','void')),
    slip_url      TEXT,
    slip_at       TEXT,
    reject_reason TEXT,
    paid_at       TEXT,
    payment_ref   TEXT,
    approved_by   INTEGER REFERENCES users(id),
    receipt_no    TEXT UNIQUE,
    issuer        TEXT NOT NULL DEFAULT '{}', -- สำเนาข้อมูลผู้ให้บริการ ณ วันที่ออก
    payer         TEXT NOT NULL DEFAULT '{}', -- สำเนาข้อมูลองค์กรลูกค้า ณ วันที่ออก
    void_reason   TEXT,
    created_by    INTEGER REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sub_invoices_org ON subscription_invoices(org_id, status);
-- ใบที่ยังเปิดอยู่ได้ทีละใบต่อองค์กร
CREATE UNIQUE INDEX idx_sub_invoices_open ON subscription_invoices(org_id)
    WHERE status IN ('pending','review');

-- องค์กรที่ใช้แพ็กเกจฟรีไม่ต้องมีวันหมดอายุ
UPDATE organizations SET status = 'active', ends_at = NULL
WHERE status = 'trial' AND package_id IN (SELECT id FROM packages WHERE price_monthly = 0);
