-- ภาษาของผู้เช่า (ข้อความ LINE และพอร์ทัล) และผู้เข้าพักที่จองออนไลน์
ALTER TABLE tenants ADD COLUMN lang TEXT NOT NULL DEFAULT 'th' CHECK (lang IN ('th','en'));
ALTER TABLE booking_requests ADD COLUMN lang TEXT NOT NULL DEFAULT 'th' CHECK (lang IN ('th','en'));
UPDATE tenants SET lang = 'en' WHERE nationality NOT IN ('', 'TH');
