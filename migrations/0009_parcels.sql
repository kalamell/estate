-- รับ-จ่ายพัสดุแทนผู้เช่า: บันทึกพัสดุ → แจ้ง LINE พร้อมรหัสรับ → ผู้เช่ามารับ ลงชื่อ/ถ่ายรูป

CREATE TABLE parcels (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id           INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id      INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_id          INTEGER REFERENCES units(id) ON DELETE SET NULL,
    tenant_id        INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
    recipient_name   TEXT NOT NULL DEFAULT '',  -- ชื่อบนกล่อง
    carrier          TEXT NOT NULL DEFAULT '',
    tracking_no      TEXT NOT NULL DEFAULT '',
    kind             TEXT NOT NULL DEFAULT 'parcel' CHECK (kind IN ('parcel','letter','food','large','other')),
    note             TEXT NOT NULL DEFAULT '',
    photo_url        TEXT,
    pickup_code      TEXT NOT NULL,             -- รหัส 4 หลักให้ผู้เช่าแสดงตอนรับ
    status           TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','picked_up','returned')),
    received_at      TEXT NOT NULL DEFAULT (datetime('now')),
    received_by      INTEGER REFERENCES users(id),
    notified_at      TEXT,
    picked_up_at     TEXT,
    picked_up_by     TEXT,                      -- ชื่อผู้มารับ (อาจรับแทน)
    pickup_photo_url TEXT,
    signature_url    TEXT,
    handed_by        INTEGER REFERENCES users(id),
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_parcels_org ON parcels(org_id, status);
CREATE INDEX idx_parcels_tenant ON parcels(tenant_id, status);

ALTER TABLE organizations ADD COLUMN line_auto_parcel INTEGER NOT NULL DEFAULT 1;
