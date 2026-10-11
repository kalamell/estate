# Estate — ระบบบริหารห้องเช่า

ระบบบริหารอสังหาริมทรัพย์ให้เช่า ทั้งหอพัก อพาร์ทเมนต์ คอนโด บ้านเช่า และห้องพักรายวัน/Airbnb เขียนด้วย **Rust (Axum + SQLite)** พร้อม UI บนเว็บที่ใช้ได้ทั้ง PC และมือถือ

- 🗺️ ดูโครงการทั้งหมดบนแผนที่ ปักหมุดหรือใช้ GPS เพื่อตั้งพิกัด
- 🏢 ผังห้องรายชั้น และ **มุมมอง 3D ทั้งอาคาร** (สีบอกสถานะ คลิกเพื่อเปิดห้อง)
- 🛏️ **มุมมอง 3D ภายในห้อง** ปรับขนาดห้องและจัดวางเฟอร์นิเจอร์ได้
- 📅 สัญญารายเดือน / จองรายวัน กันจองซ้ำ จัดการเงินมัดจำ (รับ / คืน / ริบ)
- 📷 **ถ่ายรูปมิเตอร์ไฟ/น้ำ → อ่านตัวเลขอัตโนมัติ (OCR)** → ตรวจสอบ → บันทึกพร้อมรูปหลักฐาน
- 🧾 ออกบิลรายเดือนอัตโนมัติ (ค่าเช่า + ค่าไฟ + ค่าน้ำ) พร้อม **QR PromptPay** และพิมพ์บิลได้
- 📊 Dashboard: อัตราเข้าพัก รายรับ ยอดค้าง เงินมัดจำ เช็คอินที่ใกล้ถึง

ดูการวิเคราะห์ เว็บ vs แอปเดสก์ท็อป และ roadmap ได้ที่ [docs/RESEARCH.md](docs/RESEARCH.md)

## เริ่มใช้งาน

```bash
cargo run --release
# เปิด http://localhost:3000
```

ครั้งแรกระบบจะสร้างข้อมูลตัวอย่างให้ (3 โครงการ, ผู้เช่า, สัญญา, ค่ามิเตอร์) — ปิดได้ด้วย `SEED_DEMO=0`

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `DATABASE_URL` | `sqlite://estate.db?mode=rwc` | ไฟล์ฐานข้อมูล |
| `BIND` | `0.0.0.0:3000` | address ที่รับการเชื่อมต่อ |
| `UPLOAD_DIR` | `uploads` | โฟลเดอร์เก็บรูปมิเตอร์ |
| `STATIC_DIR` | `static` | โฟลเดอร์หน้าเว็บ |
| `SEED_DEMO` | `1` | สร้างข้อมูลตัวอย่างเมื่อ DB ว่าง |

> การใช้กล้องมือถือจดมิเตอร์ต้องเปิดผ่าน HTTPS (หรือ localhost) — ตอนติดตั้งจริงให้วางหลัง reverse proxy เช่น Caddy

## ทดสอบ

```bash
cargo test
```

## โครงสร้าง

```
src/
  lib.rs          # estate::serve() — ใช้ได้ทั้งเว็บเซิร์ฟเวอร์และฝังในแอป Tauri
  main.rs         # ไบนารีเว็บเซิร์ฟเวอร์
  db.rs           # เชื่อมต่อ SQLite, migration, ข้อมูลตัวอย่าง
  billing.rs      # คำนวณบิล (มี unit test)
  promptpay.rs    # สร้าง payload PromptPay QR (EMVCo + CRC16, มี unit test)
  routes/         # REST API แยกตามโมดูล
migrations/       # โครงสร้างฐานข้อมูล
static/           # UI: index.html, app.js (Alpine), three-view.js (3D), style.css
docs/RESEARCH.md  # การวิเคราะห์และ roadmap
```

## REST API

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/api/dashboard` | สรุปภาพรวม |
| GET/POST | `/api/properties` | โครงการ |
| GET/PUT/DELETE | `/api/properties/:id` | |
| GET/POST | `/api/units?property_id=` | ห้อง (รวม layout 3D) |
| GET/PUT/DELETE | `/api/units/:id` | |
| GET/POST | `/api/tenants` · PUT/DELETE `/api/tenants/:id` | ผู้เช่า |
| GET/POST | `/api/bookings?unit_id=&property_id=&status=` | การจอง (ตรวจช่วงวันทับซ้อน) |
| PATCH | `/api/bookings/:id` | เปลี่ยนสถานะ / สถานะมัดจำ |
| GET | `/api/meter-readings?unit_id=&meter_type=` | ประวัติมิเตอร์ |
| POST | `/api/meter-readings` | multipart: `unit_id, meter_type, reading_date, value, photo, ocr_raw, allow_decrease` |
| GET | `/api/invoices?property_id=&period=&status=` | บิล |
| POST | `/api/invoices/generate` | `{property_id, period: "YYYY-MM"}` ออกบิลทุกห้องที่มีสัญญา |
| GET | `/api/invoices/:id` | บิล + PromptPay payload |
| POST | `/api/invoices/:id/pay` | `{amount?, method?}` บันทึกรับเงิน |
