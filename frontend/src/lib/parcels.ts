// พัสดุ: ป้ายประเภท สถานะ และขนส่งที่ใช้บ่อย
import { Mail, Package, PackageOpen, Soup, Truck, type LucideIcon } from 'lucide-react'
import type { ParcelKind, ParcelStatus } from './api'
import type { Tone } from './format'
import { sqlUtc } from './billing'
import { diffDays, today } from './format'

export const PARCEL_KINDS: Record<ParcelKind, string> = {
  parcel: 'พัสดุ',
  letter: 'จดหมาย/เอกสาร',
  food: 'อาหาร/ของสด',
  large: 'ขนาดใหญ่',
  other: 'อื่น ๆ',
}

export const KIND_ICON: Record<ParcelKind, LucideIcon> = {
  parcel: Package,
  letter: Mail,
  food: Soup,
  large: Truck,
  other: PackageOpen,
}

export const PARCEL_STATUS: Record<ParcelStatus, { label: string; tone: Tone }> = {
  waiting: { label: 'รอรับ', tone: 'mustard' },
  picked_up: { label: 'รับแล้ว', tone: 'green' },
  returned: { label: 'ตีกลับ', tone: 'grey' },
}

/** ขนส่งที่พบบ่อย (ปุ่มเลือกเร็ว) — "อื่นๆ" ให้พิมพ์เอง */
export const CARRIERS = [
  'ไปรษณีย์ไทย',
  'Kerry',
  'Flash',
  'J&T',
  'Shopee Express',
  'Lazada',
  'DHL',
  'Grab/Lineman',
] as const

/** เวลาท้องถิ่นของ YYYY-MM-DD HH:MM:SS (UTC จาก SQLite) */
export const localDate = (s: string) => {
  const d = new Date(sqlUtc(s))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** จำนวนวันที่พัสดุรอรับ (นับตามวันที่ปฏิทิน) */
export const waitingDays = (receivedAt: string) => Math.max(0, diffDays(localDate(receivedAt), today()))

/** รอรับเกิน 3 วัน (72 ชั่วโมง — ตรงกับสรุปของเซิร์ฟเวอร์) */
export const isStale = (receivedAt: string, now = Date.now()) =>
  now - new Date(sqlUtc(receivedAt)).getTime() > 72 * 3600_000
