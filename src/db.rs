use std::str::FromStr;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    SqlitePool,
};

pub async fn connect(url: &str) -> anyhow::Result<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(opts)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
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
            "INSERT INTO properties (name, kind, address, lat, lng, promptpay_id) VALUES (?,?,?,?,?,?) RETURNING id",
        )
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
        sqlx::query("INSERT INTO tenants (full_name, phone) VALUES (?,?)")
            .bind(name)
            .bind(phone)
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
    Ok(())
}
