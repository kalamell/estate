# ติดตั้ง Estate บนเซิร์ฟเวอร์จริง

ใช้ Docker + Caddy (HTTPS อัตโนมัติ) + สำรองข้อมูลรายวัน — ทั้งหมดอยู่ใน `docker-compose.yml`

## สิ่งที่ต้องมี

1. **VPS** Linux (Ubuntu 22.04/24.04) แรม 1–2 GB ขึ้นไป — เช่น DigitalOcean, Vultr, Linode, AWS Lightsail หรือผู้ให้บริการในไทย
2. **โดเมน** แล้วตั้ง DNS แบบ `A record` ชี้มาที่ IP ของ VPS (เช่น `estate.example.com`)
3. เปิดพอร์ต **80** และ **443** ใน firewall

## ขั้นตอน

```bash
# 1) ติดตั้ง Docker
curl -fsSL https://get.docker.com | sh

# 2) ดึงโค้ด
git clone -b claude/bold-goodall-vjib5e https://github.com/kalamell/estate.git
cd estate

# 3) ตั้งค่า
cp .env.example .env
nano .env        # แก้ DOMAIN, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, APP_SECRET_KEY (openssl rand -hex 32)

# 4) เริ่มระบบ (ครั้งแรกใช้เวลา build 5–15 นาที)
docker compose up -d --build

# 5) ตรวจสถานะ
docker compose ps
docker compose logs -f app
```

เปิด `https://<DOMAIN>` แล้วเข้าสู่ระบบด้วยบัญชี Super Admin ที่ตั้งไว้ — **เปลี่ยนรหัสผ่านทันที** และลบ `SUPER_ADMIN_PASSWORD` ออกจาก `.env` ได้หลังสร้างบัญชีแล้ว

## อัปเดตเวอร์ชัน

```bash
git pull
docker compose up -d --build
```

ระบบปรับโครงสร้างฐานข้อมูลให้อัตโนมัติตอนเริ่ม (ข้อมูลเดิมไม่หาย) — ควรสำรองข้อมูลก่อนอัปเดตทุกครั้ง: `docker compose exec backup sh /backup.sh`

## สำรองและกู้คืนข้อมูล

- ระบบสำรองอัตโนมัติทุกวัน 03:00 ไว้ที่โฟลเดอร์ `./backups/<วันเวลา>/` (ฐานข้อมูล + ไฟล์อัปโหลด + กุญแจเข้ารหัส) เก็บย้อนหลัง `BACKUP_KEEP_DAYS` วัน
- **ควรคัดลอก `./backups` ออกไปเก็บนอกเซิร์ฟเวอร์** เป็นประจำ (เช่น rclone ไป Google Drive / S3)
- กู้คืน:

```bash
docker compose stop app
docker run --rm -v estate_data:/data -v "$PWD/backups/<วันเวลา>":/b alpine sh -c \
  "cp /b/estate.db /data/estate.db && rm -f /data/estate.db-wal /data/estate.db-shm && \
   tar -xzf /b/uploads.tar.gz -C /data && cp /b/secret.key /data/secret.key 2>/dev/null; chown -R 10001 /data"
docker compose start app
```

> ⚠️ **กุญแจเข้ารหัส** (`APP_SECRET_KEY` หรือไฟล์ `secret.key`) ใช้ถอดรหัส token ของ LINE — ถ้าหาย ต้องใส่ค่า LINE OA ใหม่

## หลังติดตั้ง

- **LINE OA**: Webhook URL จะเป็น `https://<DOMAIN>/api/line/webhook/<key>` (ดูได้ในหน้า ตั้งค่า → LINE OA)
- **ปฏิทิน iCal**: ลิงก์ส่งออกจะขึ้นต้นด้วย `https://<DOMAIN>/ical/...`
- **หน้าจองออนไลน์**: `https://<DOMAIN>/stay/<ชื่อลิงก์>`

## ความปลอดภัยที่ตั้งไว้แล้ว

| รายการ | รายละเอียด |
|---|---|
| HTTPS | Caddy ออกใบรับรอง Let's Encrypt และต่ออายุให้อัตโนมัติ, HSTS |
| Cookie | `Secure` + `HttpOnly` + `SameSite=Lax` |
| รหัสผ่าน | Argon2, จำกัดการลองเข้าสู่ระบบต่อ IP และต่ออีเมล |
| ข้อมูลลับ | token/secret ของ LINE เข้ารหัส AES-256-GCM ในฐานข้อมูล |
| ไฟล์อัปโหลด | เปิดได้เฉพาะทีมงานในองค์กร / ผู้เช่าเจ้าของเรื่อง / แขกเจ้าของคำขอ |
| หน้าสาธารณะ | จำกัดจำนวนคำขอ, กัน SSRF ของลิงก์ปฏิทิน |
| ตรวจสอบย้อนหลัง | audit log ของการรับเงิน ยกเลิกเอกสาร ลบข้อมูล เปลี่ยนสิทธิ์ ฯลฯ |
| คอนเทนเนอร์ | รันด้วยผู้ใช้ที่ไม่ใช่ root |

## ตัวแปรที่ใช้ได้

| ตัวแปร | ค่าเริ่มต้นใน Docker | ความหมาย |
|---|---|---|
| `DOMAIN` | – | โดเมนของระบบ |
| `PUBLIC_URL` | `https://${DOMAIN}` | ใช้สร้างลิงก์ในข้อความ LINE / iCal |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | – | สร้าง/เลื่อนสิทธิ์ผู้ดูแลแพลตฟอร์ม |
| `APP_SECRET_KEY` | ไฟล์ `/data/secret.key` | กุญแจเข้ารหัสข้อมูลลับ |
| `TRUST_PROXY` | `1` | อ่าน IP จริงจาก Caddy (ใช้ทำ rate limit / audit log) |
| `COOKIE_SECURE` | `1` | ส่ง cookie เฉพาะ HTTPS |
| `SEED_DEMO` | `0` | อย่าเปิดในระบบจริง |
| `TZ` | `Asia/Bangkok` | เวลาที่ใช้คำนวณวันครบกำหนด ค่าปรับ การเตือน |
