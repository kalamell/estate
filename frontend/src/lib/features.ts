import { Box, Gauge, ReceiptText, Star, type LucideIcon } from 'lucide-react'
import type { Features } from './api'

export const FEATURE_LABELS: Record<keyof Features, { label: string; icon: LucideIcon }> = {
  ocr: { label: 'อ่านมิเตอร์อัตโนมัติ (OCR)', icon: Gauge },
  view3d: { label: 'มุมมอง 3D อาคารและห้อง', icon: Box },
  short_stay: { label: 'ห้องพักรายวัน / Airbnb', icon: Star },
  invoices: { label: 'ออกบิล + PromptPay QR', icon: ReceiptText },
}
