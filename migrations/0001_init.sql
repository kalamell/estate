-- ===== SaaS: ผู้ใช้ แพ็กเกจ องค์กร =====
CREATE TABLE users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    is_super_admin INTEGER NOT NULL DEFAULT 0,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- แพ็กเกจที่เจ้าของแพลตฟอร์มกำหนด
CREATE TABLE packages (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    price_monthly  REAL NOT NULL DEFAULT 0,
    max_properties INTEGER NOT NULL DEFAULT 1,
    max_units      INTEGER NOT NULL DEFAULT 20,
    max_members    INTEGER NOT NULL DEFAULT 1,
    features       TEXT NOT NULL DEFAULT '{}', -- JSON: {ocr, view3d, short_stay, invoices}
    is_active      INTEGER NOT NULL DEFAULT 1,
    is_default     INTEGER NOT NULL DEFAULT 0, -- แพ็กเกจเริ่มต้นสำหรับผู้สมัครใหม่
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- องค์กร (ลูกค้า 1 ราย) มีได้หลายโครงการ
CREATE TABLE organizations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    package_id INTEGER NOT NULL REFERENCES packages(id),
    status     TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','suspended','cancelled')),
    ends_at    TEXT,                      -- วันหมดอายุทดลอง/สมาชิก (NULL = ไม่หมดอายุ)
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE org_members (
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('owner','admin','staff')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (org_id, user_id)
);
CREATE INDEX idx_org_members_user ON org_members(user_id);

-- โครงการ / อาคาร (หอพัก อพาร์ทเมนต์ คอนโด บ้าน ห้องพักรายวัน)
CREATE TABLE properties (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('dormitory','apartment','condo','house','short_stay')),
    address       TEXT NOT NULL DEFAULT '',
    lat           REAL,
    lng           REAL,
    electric_rate REAL NOT NULL DEFAULT 8,   -- บาท/หน่วย
    water_rate    REAL NOT NULL DEFAULT 18,  -- บาท/หน่วย
    promptpay_id  TEXT,                      -- เบอร์โทร / เลขผู้เสียภาษี สำหรับ QR รับเงิน
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ห้อง / ยูนิต
CREATE INDEX idx_properties_org ON properties(org_id);

CREATE TABLE units (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id   INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    floor         INTEGER NOT NULL DEFAULT 1,
    rent_monthly  REAL NOT NULL DEFAULT 0,
    rate_daily    REAL NOT NULL DEFAULT 0,
    deposit       REAL NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant','reserved','occupied','maintenance')),
    width         REAL NOT NULL DEFAULT 4,   -- เมตร (แกน X)
    length        REAL NOT NULL DEFAULT 6,   -- เมตร (แกน Z)
    height        REAL NOT NULL DEFAULT 2.7,
    layout        TEXT NOT NULL DEFAULT '[]', -- JSON: รายการเฟอร์นิเจอร์สำหรับมุมมอง 3D
    note          TEXT NOT NULL DEFAULT '',
    UNIQUE (property_id, name)
);

-- ผู้เช่า / แขก
CREATE TABLE tenants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name  TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    email      TEXT NOT NULL DEFAULT '',
    id_card    TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- สัญญาเช่า (รายเดือน) และการจองรายวัน
CREATE TABLE bookings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id        INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    tenant_id      INTEGER NOT NULL REFERENCES tenants(id),
    kind           TEXT NOT NULL CHECK (kind IN ('lease','short_stay')),
    start_date     TEXT NOT NULL,
    end_date       TEXT,                     -- NULL = สัญญาไม่กำหนดวันสิ้นสุด
    price          REAL NOT NULL,            -- ต่อเดือน (lease) หรือ ต่อคืน (short_stay)
    deposit_amount REAL NOT NULL DEFAULT 0,
    deposit_status TEXT NOT NULL DEFAULT 'pending' CHECK (deposit_status IN ('pending','paid','refunded','forfeited')),
    status         TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','active','completed','cancelled')),
    source         TEXT NOT NULL DEFAULT 'direct', -- direct / airbnb / booking / agoda
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bookings_unit ON bookings(unit_id, start_date);

-- ค่ามิเตอร์ไฟ/น้ำ พร้อมรูปถ่ายและผลอ่าน OCR
CREATE TABLE meter_readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id      INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    meter_type   TEXT NOT NULL CHECK (meter_type IN ('electric','water')),
    reading_date TEXT NOT NULL,
    value        REAL NOT NULL,
    photo_path   TEXT,
    ocr_raw      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_meter_unit ON meter_readings(unit_id, meter_type, reading_date);

-- ใบแจ้งหนี้
CREATE TABLE invoices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id    INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    booking_id INTEGER REFERENCES bookings(id),
    period     TEXT NOT NULL,               -- YYYY-MM
    issue_date TEXT NOT NULL,
    due_date   TEXT NOT NULL,
    items      TEXT NOT NULL,               -- JSON: [{label, qty, unit_price, amount}]
    total      REAL NOT NULL,
    status     TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','void')),
    paid_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (unit_id, period)
);

CREATE TABLE payments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount     REAL NOT NULL,
    method     TEXT NOT NULL DEFAULT 'promptpay', -- promptpay / cash / transfer
    paid_at    TEXT NOT NULL DEFAULT (datetime('now')),
    note       TEXT NOT NULL DEFAULT ''
);
