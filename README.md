# Estate — ระบบบริหารห้องเช่า

ระบบบริหารอสังหาริมทรัพย์ให้เช่าแบบ **SaaS** ทั้งหอพัก อพาร์ทเมนต์ คอนโด บ้านเช่า และห้องพักรายวัน/Airbnb
Backend เขียนด้วย **Rust (Axum + SQLite)** หน้าเว็บใช้ **React + shadcn/ui** ใช้ได้ทั้ง PC และมือถือ

### SaaS
- 👤 สมัครสมาชิก / เข้าสู่ระบบ — 1 บัญชีสร้างได้หลายองค์กร และ 1 องค์กรมีได้หลายโครงการ
- 🔒 ข้อมูลแต่ละองค์กรแยกขาดจากกัน มีบทบาทเจ้าของ / แอดมิน / พนักงาน
- 📦 แพ็กเกจกำหนดจำนวนโครงการ ห้อง ผู้ใช้ และฟีเจอร์ (OCR, 3D, ห้องรายวัน, ออกบิล)
- 🛡️ หลังบ้าน **Super Admin** สำหรับเจ้าของแพลตฟอร์ม: สร้าง/แก้แพ็กเกจ, กำหนดแพ็กเกจ/สถานะ/วันหมดอายุให้องค์กร, จัดการผู้ใช้, ดู MRR
- ⏳ สมัครใหม่ได้ทดลองใช้ 14 วัน (แพ็กเกจที่ตั้งเป็นค่าเริ่มต้น) บัญชีที่ถูกระงับ/หมดอายุจะอ่านได้อย่างเดียว

### เอกสารการเงินตามกฎหมาย
- 🧾 ใบแจ้งหนี้ / ใบเสร็จรับเงิน / ใบกำกับภาษี เลขที่เรียงต่อเนื่องตามปี พ.ศ. (INV / RC / DS) ไม่ข้ามเลข
- ข้อมูลผู้ออก (ชื่อนิติบุคคล เลขผู้เสียภาษี สาขา) และผู้จ่าย ถูกบันทึกลงใบเสร็จ ณ วันที่ออก — แก้ย้อนหลังไม่ได้
- VAT เลือกได้ทีละรายการ, หักภาษี ณ ที่จ่าย, จำนวนเงินตัวอักษร (บาทถ้วน), พิมพ์ A4 ต้นฉบับ + สำเนา
- ยกเลิกเอกสารได้พร้อมเหตุผล (เอกสารยังเก็บไว้) — ควรให้นักบัญชีตรวจการตั้งค่า VAT ก่อนใช้งานจริง

### สื่อสารกับผู้เช่า
- 🔗 พอร์ทัลผู้เช่าผ่านลิงก์ลับ (ส่งทาง LINE): ดูบิล/ใบเสร็จ สแกนจ่าย แจ้งซ่อมพร้อมรูป อ่านประกาศ
- 🛠️ แจ้งซ่อม & ติดต่อ: มอบหมายผู้รับผิดชอบ ติดตามสถานะ บันทึกภายใน
- 📣 ประกาศถึงผู้เช่า และช่องทางให้ลูกค้าติดต่อผู้ให้บริการแพลตฟอร์ม

### การเงินเพิ่มเติม
- ค่าบริการรายเดือนเพิ่มเติมต่อห้อง (อินเทอร์เน็ต ที่จอดรถ) และค่าปรับชำระล่าช้า
- 🚪 ย้ายออก & คืนเงินประกัน: หักค่าเสียหาย/บิลค้างจากเงินประกัน ออกเอกสารคืนเงิน แจ้งกำหนดคืนภายใน 7 วัน
- 📈 รายงาน: รายรับ อัตราเข้าพักย้อนหลัง อายุหนี้ ลูกหนี้ค้างมากสุด ส่งออก CSV (เปิดใน Excel ได้)

### บริหารห้องเช่า

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
cd frontend && npm install && npm run build && cd ..   # สร้างหน้าเว็บ (frontend/dist)
cargo run --release                                     # เปิด http://localhost:3000
```

ระหว่างพัฒนาหน้าเว็บ: รัน `cargo run` ไว้ แล้ว `cd frontend && npm run dev` (Vite proxy `/api` ไปที่ :3000)

ครั้งแรกระบบจะสร้างข้อมูลตัวอย่างให้ — **ปิดด้วย `SEED_DEMO=0` ก่อนใช้งานจริง**

| บัญชีตัวอย่าง | รหัสผ่าน | สิทธิ์ |
|---|---|---|
| `admin@estate.local` | `admin1234` | Super Admin (หลังบ้านแพลตฟอร์ม) |
| `demo@estate.local` | `demo1234` | เจ้าขององค์กร "สุขใจ พร็อพเพอร์ตี้" (แพ็กเกจ Pro) |

ใช้งานจริงให้ตั้ง Super Admin ของคุณเองผ่าน `SUPER_ADMIN_EMAIL` และ `SUPER_ADMIN_PASSWORD`

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `DATABASE_URL` | `sqlite://estate.db?mode=rwc` | ไฟล์ฐานข้อมูล |
| `BIND` | `0.0.0.0:3000` | address ที่รับการเชื่อมต่อ |
| `UPLOAD_DIR` | `uploads` | โฟลเดอร์เก็บรูปมิเตอร์ |
| `STATIC_DIR` | `frontend/dist` | โฟลเดอร์หน้าเว็บที่ build แล้ว |
| `SEED_DEMO` | `1` | สร้างข้อมูลตัวอย่างเมื่อ DB ว่าง |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | – | สร้างหรือเลื่อนสิทธิ์บัญชีนี้เป็น Super Admin ตอนเริ่มระบบ |
| `COOKIE_SECURE` | `0` | ตั้งเป็น `1` เมื่อให้บริการผ่าน HTTPS |
| `TZ` | ระบบ | ตั้ง `Asia/Bangkok` บนเซิร์ฟเวอร์ เพื่อให้วันครบกำหนด/ค่าปรับคิดตามเวลาไทย |

> การใช้กล้องมือถือจดมิเตอร์ต้องเปิดผ่าน HTTPS (หรือ localhost) — ตอนติดตั้งจริงให้วางหลัง reverse proxy เช่น Caddy

## ทดสอบ

```bash
cargo test   # unit test (บิล, PromptPay) + integration test (แยกข้อมูลองค์กร, สิทธิ์, แพ็กเกจ, การระงับบัญชี)
```

## โครงสร้าง

```
src/
  auth.rs         # session cookie, บทบาท, บริบทองค์กร (OrgCtx), ตรวจขีดจำกัดแพ็กเกจ
  lib.rs          # estate::serve() — ใช้ได้ทั้งเว็บเซิร์ฟเวอร์และฝังในแอป Tauri
  main.rs         # ไบนารีเว็บเซิร์ฟเวอร์
  db.rs           # เชื่อมต่อ SQLite, migration, ข้อมูลตัวอย่าง
  billing.rs      # คำนวณบิล (มี unit test)
  promptpay.rs    # สร้าง payload PromptPay QR (EMVCo + CRC16, มี unit test)
  routes/         # REST API แยกตามโมดูล
migrations/       # โครงสร้างฐานข้อมูล
frontend/         # React + Vite + TypeScript + Tailwind + shadcn/ui
tests/saas.rs     # integration test ระบบ SaaS
docs/RESEARCH.md  # การวิเคราะห์และ roadmap
```

## REST API

ทุก endpoint ของข้อมูลธุรกิจต้องล็อกอิน (cookie) และส่ง header `X-Org-Id` — ข้อผิดพลาดจากแพ็กเกจตอบ `402` พร้อม `code`: `limit_reached`, `feature_unavailable`, `subscription_inactive`

| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` · `/api/auth/logout` | สมัคร / เข้าสู่ระบบ / ออก |
| GET | `/api/auth/me` | ผู้ใช้ปัจจุบัน + องค์กรที่เป็นสมาชิก |
| POST | `/api/orgs` | สร้างองค์กรใหม่ |
| GET/PUT | `/api/org` | ข้อมูลองค์กร แพ็กเกจ และการใช้งานเทียบขีดจำกัด |
| GET/POST | `/api/org/members` · PUT/DELETE `/api/org/members/:user_id` | สมาชิกในองค์กร |
| GET | `/api/admin/stats` | (Super Admin) ภาพรวมแพลตฟอร์ม |
| GET/POST | `/api/admin/packages` · PUT/DELETE `/api/admin/packages/:id` | (Super Admin) แพ็กเกจ |
| GET | `/api/admin/orgs` · PUT `/api/admin/orgs/:id` | (Super Admin) กำหนดแพ็กเกจ / สถานะ / วันหมดอายุ |
| GET | `/api/admin/users` · PUT `/api/admin/users/:id` | (Super Admin) ผู้ใช้ |
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
