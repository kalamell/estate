use std::str::FromStr;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    SqlitePool,
};

pub async fn connect(url: &str) -> anyhow::Result<SqlitePool> {
    use sqlx::Connection;
    let opts = SqliteConnectOptions::from_str(url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);

    // migration ที่สร้างตารางใหม่ (ALTER แบบ 12 ขั้นของ SQLite) ต้องปิด foreign_keys
    // ไม่เช่นนั้น DROP TABLE จะลบข้อมูลลูกตาม ON DELETE CASCADE — และ PRAGMA นี้เปลี่ยนใน transaction ไม่ได้
    // จึงรัน migration บน connection แยกที่ปิดไว้ตั้งแต่ต้น แล้วตรวจความถูกต้องของการอ้างอิง
    let mut conn = sqlx::SqliteConnection::connect_with(&opts.clone().foreign_keys(false)).await?;
    sqlx::migrate!("./migrations").run(&mut conn).await?;
    let broken: Vec<(String,)> = sqlx::query_as(r#"SELECT "table" FROM pragma_foreign_key_check"#)
        .fetch_all(&mut conn)
        .await?;
    if !broken.is_empty() {
        anyhow::bail!("ข้อมูลอ้างอิงไม่ถูกต้องหลัง migration: {broken:?}");
    }
    conn.close().await?;

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(opts.foreign_keys(true))
        .await?;
    Ok(pool)
}

/// แพ็กเกจตั้งต้นเมื่อระบบยังไม่มีแพ็กเกจเลย (แก้ไขได้ในหน้า Super Admin)
pub async fn seed_packages(db: &SqlitePool) -> anyhow::Result<()> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM packages")
        .fetch_one(db)
        .await?;
    if count > 0 {
        return Ok(());
    }
    let packages = [
        (
            "Starter",
            "เริ่มต้นสำหรับหอพักขนาดเล็ก",
            0.0,
            1,
            20,
            1,
            r#"{"ocr":false,"view3d":false,"short_stay":false,"invoices":true,"portal":false,"reports":false}"#,
            true,
        ),
        (
            "Pro",
            "สำหรับอพาร์ทเมนต์และหลายโครงการ",
            990.0,
            5,
            200,
            5,
            r#"{"ocr":true,"view3d":true,"short_stay":true,"invoices":true,"portal":true,"reports":true}"#,
            false,
        ),
        (
            "Enterprise",
            "ไม่จำกัดการใช้งาน พร้อมทีมงานหลายคน",
            2990.0,
            100,
            10000,
            50,
            r#"{"ocr":true,"view3d":true,"short_stay":true,"invoices":true,"portal":true,"reports":true}"#,
            false,
        ),
    ];
    for (i, (name, desc, price, props, units, members, features, is_default)) in
        packages.into_iter().enumerate()
    {
        sqlx::query(
            "INSERT INTO packages (name, description, price_monthly, max_properties, max_units, max_members,
                features, is_default, sort_order) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .bind(name)
        .bind(desc)
        .bind(price)
        .bind(props)
        .bind(units)
        .bind(members)
        .bind(features)
        .bind(is_default)
        .bind(i as i64)
        .execute(db)
        .await?;
    }
    Ok(())
}

/// สร้างผู้ดูแลแพลตฟอร์ม หรือเลื่อนสิทธิ์บัญชีที่มีอยู่ (ไม่เปลี่ยนรหัสผ่านของบัญชีเดิม)
pub async fn ensure_super_admin(
    db: &SqlitePool,
    email: &str,
    password: &str,
) -> anyhow::Result<i64> {
    let email = email.trim().to_lowercase();
    if let Some(id) = sqlx::query_scalar::<_, i64>("SELECT id FROM users WHERE email = ?")
        .bind(&email)
        .fetch_optional(db)
        .await?
    {
        sqlx::query("UPDATE users SET is_super_admin = 1, is_active = 1 WHERE id = ?")
            .bind(id)
            .execute(db)
            .await?;
        return Ok(id);
    }
    let hash = crate::auth::hash_password(password).map_err(|e| anyhow::anyhow!("{e}"))?;
    let id = sqlx::query_scalar(
        "INSERT INTO users (email, name, password_hash, is_super_admin) VALUES (?, 'Super Admin', ?, 1) RETURNING id",
    )
    .bind(&email)
    .bind(hash)
    .fetch_one(db)
    .await?;
    tracing::info!("สร้างบัญชี Super Admin: {email}");
    Ok(id)
}

/// ใส่ข้อมูลตัวอย่างเมื่อฐานข้อมูลยังว่าง
pub async fn seed_demo(db: &SqlitePool) -> anyhow::Result<()> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM properties")
        .fetch_one(db)
        .await?;
    if count > 0 {
        return Ok(());
    }
    tracing::info!("กำลังสร้างข้อมูลตัวอย่าง");
    tracing::warn!("บัญชีตัวอย่าง: admin@estate.local / admin1234 (Super Admin), demo@estate.local / demo1234 — ปิดด้วย SEED_DEMO=0 ก่อนใช้งานจริง");
    ensure_super_admin(db, "admin@estate.local", "admin1234").await?;
    let owner: i64 = sqlx::query_scalar(
        "INSERT INTO users (email, name, password_hash) VALUES ('demo@estate.local', 'คุณสมศรี เจ้าของหอ', ?) RETURNING id",
    )
    .bind(crate::auth::hash_password("demo1234").map_err(|e| anyhow::anyhow!("{e}"))?)
    .fetch_one(db)
    .await?;
    let org_id: i64 = sqlx::query_scalar(
        "INSERT INTO organizations (name, package_id, status, legal_name, tax_id, address, phone)
         VALUES ('สุขใจ พร็อพเพอร์ตี้', (SELECT id FROM packages WHERE name = 'Pro'), 'active',
                 'บริษัท สุขใจ พร็อพเพอร์ตี้ จำกัด', '0105560000000',
                 '99/1 ซ.พหลโยธิน 24 แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900', '02-000-0000') RETURNING id",
    )
    .fetch_one(db)
    .await?;
    sqlx::query("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')")
        .bind(org_id)
        .bind(owner)
        .execute(db)
        .await?;

    let props = [
        (
            "บ้านสุขใจ เรสซิเดนซ์",
            "dormitory",
            "ซ.พหลโยธิน 24 จตุจักร กรุงเทพฯ",
            13.8137,
            100.5640,
            3500.0,
            0.0,
        ),
        (
            "The Riverside Apartment",
            "apartment",
            "ถ.เจริญกรุง บางคอแหลม กรุงเทพฯ",
            13.6957,
            100.5022,
            7500.0,
            0.0,
        ),
        (
            "Nimman Cozy Stay",
            "short_stay",
            "ถ.นิมมานเหมินท์ เชียงใหม่",
            18.7964,
            98.9680,
            0.0,
            1200.0,
        ),
    ];
    let bed = r##"{"kind":"bed","x":-0.9,"z":-1.8,"w":1.6,"d":2.0,"h":0.5,"color":"#c7d2fe"}"##;
    let desk = r##"{"kind":"desk","x":1.4,"z":-2.4,"w":1.2,"d":0.6,"h":0.75,"color":"#d6b38a"}"##;
    let wardrobe =
        r##"{"kind":"wardrobe","x":1.6,"z":0.6,"w":0.6,"d":1.2,"h":2.0,"color":"#a78b6d"}"##;
    let bath =
        r##"{"kind":"bathroom","x":-1.2,"z":2.0,"w":1.6,"d":2.0,"h":2.4,"color":"#e2e8f0"}"##;
    let layout = format!("[{bed},{desk},{wardrobe},{bath}]");

    for (name, kind, address, lat, lng, rent, daily) in props {
        let pid: i64 = sqlx::query_scalar(
            "INSERT INTO properties (org_id, name, kind, address, lat, lng, promptpay_id) VALUES (?,?,?,?,?,?,?) RETURNING id",
        )
        .bind(org_id)
        .bind(name)
        .bind(kind)
        .bind(address)
        .bind(lat)
        .bind(lng)
        .bind("0812345678")
        .fetch_one(db)
        .await?;

        let floors = if kind == "short_stay" { 1 } else { 3 };
        for floor in 1..=floors {
            for n in 1..=4 {
                sqlx::query(
                    "INSERT INTO units (property_id, name, floor, rent_monthly, rate_daily, deposit, layout)
                     VALUES (?,?,?,?,?,?,?)",
                )
                .bind(pid)
                .bind(format!("{floor}{n:02}"))
                .bind(floor)
                .bind(rent)
                .bind(daily)
                .bind(rent * 2.0)
                .bind(&layout)
                .execute(db)
                .await?;
            }
        }
    }

    for (name, phone) in [
        ("สมชาย ใจดี", "0811111111"),
        ("สุดา รักเรียน", "0822222222"),
        ("John Smith", "0833333333"),
    ] {
        sqlx::query(
            "INSERT INTO tenants (org_id, full_name, phone, portal_token) VALUES (?,?,?,?)",
        )
        .bind(org_id)
        .bind(name)
        .bind(phone)
        .bind(demo_token())
        .execute(db)
        .await?;
    }

    // สัญญาเช่าตัวอย่าง + ค่ามิเตอร์ 2 เดือน
    let today = chrono::Local::now().date_naive();
    let last_month = today - chrono::Duration::days(30);
    for (unit_id, tenant_id) in [(1_i64, 1_i64), (2, 2)] {
        sqlx::query(
            "INSERT INTO bookings (unit_id, tenant_id, kind, start_date, price, deposit_amount, deposit_status, status)
             VALUES (?,?,'lease',?,3500,7000,'paid','active')",
        )
        .bind(unit_id)
        .bind(tenant_id)
        .bind(last_month - chrono::Duration::days(60))
        .execute(db)
        .await?;
        sqlx::query("UPDATE units SET status='occupied' WHERE id=?")
            .bind(unit_id)
            .execute(db)
            .await?;
        for (date, e, w) in [
            (last_month, 1200.0, 50.0),
            (today, 1325.0 + unit_id as f64 * 7.0, 58.0),
        ] {
            for (t, v) in [("electric", e), ("water", w)] {
                sqlx::query("INSERT INTO meter_readings (unit_id, meter_type, reading_date, value) VALUES (?,?,?,?)")
                    .bind(unit_id)
                    .bind(t)
                    .bind(date)
                    .bind(v)
                    .execute(db)
                    .await?;
            }
        }
    }
    sqlx::query(
        "INSERT INTO bookings (unit_id, tenant_id, kind, start_date, end_date, price, deposit_amount, status, source)
         VALUES (25, 3, 'short_stay', ?, ?, 1200, 1000, 'reserved', 'airbnb')",
    )
    .bind(today + chrono::Duration::days(3))
    .bind(today + chrono::Duration::days(6))
    .execute(db)
    .await?;
    sqlx::query("UPDATE units SET status='reserved' WHERE id=25")
        .execute(db)
        .await?;

    // ค่าบริการเสริม ค่าปรับ ประกาศ และงานแจ้งซ่อมตัวอย่าง
    sqlx::query(r#"UPDATE units SET extra_charges = '[{"label":"ค่าอินเทอร์เน็ต","amount":300,"vatable":false}]' WHERE id IN (1, 2)"#)
        .execute(db)
        .await?;
    sqlx::query("UPDATE properties SET late_fee_type = 'per_day', late_fee_amount = 50, late_fee_grace_days = 3 WHERE id = 1")
        .execute(db)
        .await?;
    sqlx::query(
        "INSERT INTO announcements (org_id, property_id, title, body, pinned) VALUES
         (?, 1, 'ปิดน้ำประปาชั่วคราว', 'วันเสาร์นี้ 09:00–12:00 จะปิดน้ำเพื่อล้างถังเก็บน้ำ ขออภัยในความไม่สะดวก', 1)",
    )
    .bind(org_id)
    .execute(db)
    .await?;
    let ticket_id: i64 = sqlx::query_scalar(
        "INSERT INTO tickets (org_id, scope, property_id, unit_id, tenant_id, source, reporter_name, category, priority, title, description)
         VALUES (?, 'org', 1, 1, 1, 'tenant', 'สมชาย ใจดี', 'aircon', 'high', 'แอร์ไม่เย็น มีน้ำหยด', 'เปิดแล้วมีแต่ลม น้ำหยดจากตัวเครื่องตั้งแต่เมื่อวาน')
         RETURNING id",
    )
    .bind(org_id)
    .fetch_one(db)
    .await?;
    sqlx::query(
        "INSERT INTO ticket_messages (ticket_id, author_type, author_name, body) VALUES (?, 'staff', 'คุณสมศรี เจ้าของหอ', 'รับเรื่องแล้วครับ ช่างจะเข้าไปดูพรุ่งนี้ช่วงบ่าย')",
    )
    .bind(ticket_id)
    .execute(db)
    .await?;
    Ok(())
}

fn demo_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}
