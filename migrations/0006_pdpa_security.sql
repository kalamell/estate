-- ===== PDPA, บันทึกการใช้งาน (audit log) และสิทธิ์เข้าถึงไฟล์อัปโหลด =====

ALTER TABLE organizations ADD COLUMN privacy_notice  TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN dpo_contact     TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN retention_years INTEGER NOT NULL DEFAULT 5;

ALTER TABLE tenants ADD COLUMN consent_at      TEXT;
ALTER TABLE tenants ADD COLUMN consent_source  TEXT;  -- portal / staff / online_booking
ALTER TABLE tenants ADD COLUMN anonymized_at   TEXT;

ALTER TABLE booking_requests ADD COLUMN consent_at TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;

-- คำขอของเจ้าของข้อมูล (สิทธิ์เข้าถึง แก้ไข ลบ คัดค้าน ถอนความยินยอม)
CREATE TABLE privacy_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id      INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id   INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('access','correction','deletion','objection','withdraw_consent')),
    note        TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','rejected')),
    response    TEXT NOT NULL DEFAULT '',
    due_date    TEXT NOT NULL,
    resolved_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_privacy_requests_org ON privacy_requests(org_id, status);

CREATE TABLE audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id     INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL DEFAULT '',
    entity_id  INTEGER,
    detail     TEXT,
    ip         TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_logs_org ON audit_logs(org_id, id);

-- เจ้าของไฟล์อัปโหลด (ใช้ตรวจสิทธิ์ก่อนส่งไฟล์)
CREATE TABLE uploads (
    name       TEXT PRIMARY KEY,
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- เติมข้อมูลไฟล์เดิมจากตารางที่อ้างถึง
INSERT OR IGNORE INTO uploads (name, org_id)
    SELECT substr(m.photo_path, 10), p.org_id FROM meter_readings m
    JOIN units u ON u.id = m.unit_id JOIN properties p ON p.id = u.property_id
    WHERE m.photo_path LIKE '/uploads/%';
INSERT OR IGNORE INTO uploads (name, org_id)
    SELECT substr(j.value, 10), t.org_id FROM tickets t, json_each(t.photos) j WHERE j.value LIKE '/uploads/%';
INSERT OR IGNORE INTO uploads (name, org_id)
    SELECT substr(j.value, 10), t.org_id FROM ticket_messages m JOIN tickets t ON t.id = m.ticket_id, json_each(m.photos) j
    WHERE j.value LIKE '/uploads/%';
INSERT OR IGNORE INTO uploads (name, org_id)
    SELECT substr(r.slip_url, 10), r.org_id FROM booking_requests r WHERE r.slip_url LIKE '/uploads/%';
INSERT OR IGNORE INTO uploads (name, org_id)
    SELECT substr(j.value, 10), h.org_id FROM housekeeping_tasks h, json_each(h.photos) j WHERE j.value LIKE '/uploads/%';
