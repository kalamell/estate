-- ===== ปฏิทิน ช่องทางขาย (iCal) และหน้าจองออนไลน์ =====

-- ลิงก์ลับสำหรับส่งออกปฏิทินของห้อง (ให้ Airbnb / Booking.com / Agoda ดึงไป)
ALTER TABLE units ADD COLUMN ical_token TEXT;
CREATE UNIQUE INDEX idx_units_ical_token ON units(ical_token);

-- ปฏิทิน iCal ที่ดึงเข้ามาจากช่องทางอื่น
CREATE TABLE channel_feeds (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id         INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    unit_id        INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    source         TEXT NOT NULL CHECK (source IN ('airbnb','booking','agoda','vrbo','other')),
    name           TEXT NOT NULL DEFAULT '',
    url            TEXT NOT NULL,
    last_synced_at TEXT,
    last_status    TEXT,  -- ok / error
    last_error     TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_channel_feeds_unit ON channel_feeds(unit_id);

-- ช่วงวันที่ไม่ว่างที่ได้จากปฏิทินภายนอก (end_date = วันเช็คเอาท์ ไม่นับเป็นคืนที่พัก)
CREATE TABLE calendar_blocks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id    INTEGER NOT NULL REFERENCES channel_feeds(id) ON DELETE CASCADE,
    unit_id    INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    uid        TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date   TEXT NOT NULL,
    summary    TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (feed_id, uid)
);
CREATE INDEX idx_calendar_blocks_unit ON calendar_blocks(unit_id, start_date);

-- ตั้งค่าหน้าจองออนไลน์รายโครงการ
ALTER TABLE properties ADD COLUMN booking_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN booking_slug    TEXT;
ALTER TABLE properties ADD COLUMN booking_intro   TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN check_in_time   TEXT NOT NULL DEFAULT '14:00';
ALTER TABLE properties ADD COLUMN check_out_time  TEXT NOT NULL DEFAULT '12:00';
ALTER TABLE properties ADD COLUMN min_nights      INTEGER NOT NULL DEFAULT 1;
ALTER TABLE properties ADD COLUMN deposit_percent REAL NOT NULL DEFAULT 30;
CREATE UNIQUE INDEX idx_properties_booking_slug ON properties(booking_slug);

-- คำขอจองจากหน้าเว็บสาธารณะ (กันห้องไว้ชั่วคราวระหว่างรอทีมงานอนุมัติ)
CREATE TABLE booking_requests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id         INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id    INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_id        INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    token          TEXT NOT NULL UNIQUE,
    check_in       TEXT NOT NULL,
    check_out      TEXT NOT NULL,
    nights         INTEGER NOT NULL,
    rate           REAL NOT NULL,
    total          REAL NOT NULL,
    deposit_amount REAL NOT NULL,
    guests         INTEGER NOT NULL DEFAULT 1,
    guest_name     TEXT NOT NULL,
    phone          TEXT NOT NULL,
    email          TEXT NOT NULL DEFAULT '',
    note           TEXT NOT NULL DEFAULT '',
    slip_url       TEXT,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
    reject_reason  TEXT,
    booking_id     INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    expires_at     TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_booking_requests_unit ON booking_requests(unit_id, status);
