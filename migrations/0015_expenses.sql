-- รายจ่าย และรายจ่ายประจำ — ใช้คำนวณกำไรต่อโครงการ

CREATE TABLE expense_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (org_id, name)
);

CREATE TABLE recurring_expenses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id         INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id    INTEGER REFERENCES properties(id) ON DELETE CASCADE, -- NULL = ส่วนกลาง
    category_id    INTEGER NOT NULL REFERENCES expense_categories(id),
    amount         REAL NOT NULL,
    vendor         TEXT NOT NULL DEFAULT '',
    note           TEXT NOT NULL DEFAULT '',
    day_of_month   INTEGER NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
    is_active      INTEGER NOT NULL DEFAULT 1,
    last_generated TEXT,          -- YYYY-MM ที่สร้างรายการล่าสุด
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id  INTEGER REFERENCES properties(id) ON DELETE CASCADE, -- NULL = ส่วนกลาง (ไม่แยกโครงการ)
    unit_id      INTEGER REFERENCES units(id) ON DELETE SET NULL,
    category_id  INTEGER NOT NULL REFERENCES expense_categories(id),
    expense_date TEXT NOT NULL,
    amount       REAL NOT NULL CHECK (amount > 0),
    vendor       TEXT NOT NULL DEFAULT '',
    note         TEXT NOT NULL DEFAULT '',
    method       TEXT NOT NULL DEFAULT 'transfer' CHECK (method IN ('cash','transfer','card','other')),
    receipt_url  TEXT,
    ticket_id    INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
    recurring_id INTEGER REFERENCES recurring_expenses(id) ON DELETE SET NULL,
    created_by   INTEGER REFERENCES users(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expenses_org_date ON expenses(org_id, expense_date);
CREATE UNIQUE INDEX idx_expenses_recurring_month ON expenses(recurring_id, substr(expense_date, 1, 7))
    WHERE recurring_id IS NOT NULL;
