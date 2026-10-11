import { BarChart3, Box, Gauge, ReceiptText, Smartphone, Star, type LucideIcon } from 'lucide-react'
import type { Features } from './api'

export const FEATURE_LABELS: Record<keyof Features, { label: string; icon: LucideIcon }> = {
  ocr: { label: 'อ่านมิเตอร์อัตโนมัติ (OCR)', icon: Gauge },
  view3d: { label: 'มุมมอง 3D อาคารและห้อง', icon: Box },
  short_stay: { label: 'ห้องพักรายวัน / Airbnb', icon: Star },
  invoices: { label: 'ใบแจ้งหนี้ ใบเสร็จ + PromptPay QR', icon: ReceiptText },
  portal: { label: 'พอร์ทัลผู้เช่า (ดูบิล แจ้งซ่อมผ่านมือถือ)', icon: Smartphone },
  reports: { label: 'รายงานรายได้ ค้างชำระ และส่งออก CSV', icon: BarChart3 },
}
