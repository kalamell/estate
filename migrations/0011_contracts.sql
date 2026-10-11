-- สัญญาเช่าอิเล็กทรอนิกส์: แม่แบบ + ตัวแปร → ส่งให้ผู้เช่าลงนามในพอร์ทัล → ผู้ให้เช่าลงนาม → ฉบับสมบูรณ์

CREATE TABLE contract_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'lease' CHECK (kind IN ('lease','short_stay','other')),
    body       TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contract_templates_org ON contract_templates(org_id);

CREATE TABLE contracts (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id                 INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id             INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    tenant_id              INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
    template_id            INTEGER REFERENCES contract_templates(id) ON DELETE SET NULL,
    doc_no                 TEXT NOT NULL,
    title                  TEXT NOT NULL,
    body                   TEXT NOT NULL,           -- ข้อความที่แทนค่าตัวแปรแล้ว (ล็อกเมื่อส่ง)
    content_hash           TEXT,                    -- SHA-256 ของ title + body ณ เวลาส่ง
    status                 TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','sent','tenant_signed','completed','void')),
    sent_at                TEXT,
    tenant_signature_url   TEXT,
    tenant_signed_name     TEXT,
    tenant_signed_at       TEXT,
    tenant_signed_ip       TEXT,
    tenant_signed_ua       TEXT,
    landlord_signature_url TEXT,
    landlord_signed_name   TEXT,
    landlord_signed_at     TEXT,
    landlord_signed_by     INTEGER REFERENCES users(id),
    void_reason            TEXT,
    created_by             INTEGER REFERENCES users(id),
    created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contracts_org ON contracts(org_id, status);
CREATE INDEX idx_contracts_booking ON contracts(booking_id);
CREATE UNIQUE INDEX idx_contracts_doc_no ON contracts(org_id, doc_no);
