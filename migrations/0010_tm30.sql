-- ผู้เช่าชาวต่างชาติ + การแจ้งที่พักคนต่างด้าว (ตม.30) ภายใน 24 ชั่วโมง

ALTER TABLE tenants ADD COLUMN nationality TEXT NOT NULL DEFAULT '';   -- รหัสประเทศ 2 ตัว ('' หรือ TH = คนไทย)
ALTER TABLE tenants ADD COLUMN gender TEXT NOT NULL DEFAULT '';        -- M / F
ALTER TABLE tenants ADD COLUMN birth_date TEXT;
ALTER TABLE tenants ADD COLUMN arrival_date TEXT;                      -- วันที่เดินทางเข้าประเทศไทยครั้งล่าสุด
ALTER TABLE tenants ADD COLUMN visa_type TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN visa_expiry TEXT;                       -- วันครบกำหนดอนุญาตให้อยู่

CREATE TABLE tm30_reports (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    booking_id   INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    check_in     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','not_required')),
    reference_no TEXT NOT NULL DEFAULT '',   -- เลขที่รับแจ้ง/ใบรับแจ้งจาก ตม.
    submitted_at TEXT,
    submitted_by INTEGER REFERENCES users(id),
    proof_url    TEXT,                       -- รูป/ไฟล์ใบรับแจ้ง
    note         TEXT NOT NULL DEFAULT '',
    alerted_at   TEXT,                       -- แจ้งเตือนทีมงานทาง LINE แล้ว
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tm30_org ON tm30_reports(org_id, status);
