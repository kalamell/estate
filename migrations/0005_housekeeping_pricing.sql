-- ===== งานแม่บ้าน และราคาตามฤดูกาล =====

ALTER TABLE units ADD COLUMN housekeeping_status TEXT NOT NULL DEFAULT 'clean'; -- clean / dirty / in_progress

CREATE TABLE housekeeping_tasks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id           INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    unit_id          INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    booking_id       INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    kind             TEXT NOT NULL CHECK (kind IN ('checkout_clean','stayover','deep_clean','inspection','maintenance')),
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')),
    due_date         TEXT NOT NULL,
    assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes            TEXT NOT NULL DEFAULT '',
    checklist        TEXT NOT NULL DEFAULT '[]', -- [{label, done}]
    photos           TEXT NOT NULL DEFAULT '[]',
    started_at       TEXT,
    completed_at     TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_hk_tasks_org ON housekeeping_tasks(org_id, status, due_date);
-- งานอัตโนมัติหลังเช็คเอาท์สร้างได้ครั้งเดียวต่อการจอง
CREATE UNIQUE INDEX idx_hk_tasks_booking ON housekeeping_tasks(booking_id, kind) WHERE booking_id IS NOT NULL;

-- พนักงานเชื่อม LINE กับ OA ขององค์กรเพื่อรับแจ้งงาน
ALTER TABLE org_members ADD COLUMN line_user_id      TEXT;
ALTER TABLE org_members ADD COLUMN line_link_code    TEXT;
ALTER TABLE org_members ADD COLUMN line_link_expires TEXT;
ALTER TABLE organizations ADD COLUMN line_auto_housekeeping INTEGER NOT NULL DEFAULT 1;

-- กฎราคา: night = ปรับราคารายคืนตามช่วงวันที่/วันในสัปดาห์, length = ส่วนลดเมื่อพักครบจำนวนคืน
CREATE TABLE rate_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id      INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_id     INTEGER REFERENCES units(id) ON DELETE CASCADE, -- NULL = ทุกห้องในโครงการ
    name        TEXT NOT NULL,
    rule_type   TEXT NOT NULL CHECK (rule_type IN ('night','length')),
    start_date  TEXT,
    end_date    TEXT,          -- รวมวันสุดท้าย
    weekdays    TEXT NOT NULL DEFAULT '[]', -- [0..6] 0 = อาทิตย์, ว่าง = ทุกวัน
    adjustment  TEXT NOT NULL DEFAULT 'percent' CHECK (adjustment IN ('fixed','percent','amount')),
    value       REAL NOT NULL,
    min_nights  INTEGER,
    priority    INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rate_rules_property ON rate_rules(property_id);
