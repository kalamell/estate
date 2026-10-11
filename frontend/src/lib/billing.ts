// ค่าบริการแพลตฟอร์ม (แพ็กเกจ Estate): ป้ายสถานะ ลิงก์เอกสาร และการคำนวณที่ใช้ร่วมกัน
import type { SlipResult, BillingCycle, BillingOverview, BillingPackage, OrgInfo, SubInvoice, SubInvoiceStatus } from './api'
import { diffDays, today, type Tone } from './format'

export const BILLING_PATH = '/billing'

export const CYCLE_LABEL: Record<BillingCycle, string> = { monthly: 'รายเดือน', yearly: 'รายปี' }
export const CYCLE_UNIT: Record<BillingCycle, string> = { monthly: 'เดือน', yearly: 'ปี' }

export const SUB_STATUS: Record<SubInvoiceStatus, { label: string; tone: Tone }> = {
  pending: { label: 'รอชำระ', tone: 'ink' },
  review: { label: 'รอตรวจสอบ', tone: 'mustard' },
  paid: { label: 'ชำระแล้ว', tone: 'green' },
  void: { label: 'ยกเลิก', tone: 'grey' },
}

export const SUB_KIND: Record<SubInvoice['kind'], string> = {
  renewal: 'ต่ออายุ',
  change: 'เปลี่ยนแพ็กเกจ',
}

/** ใบที่ยังรอชำระและเลยกำหนดแล้ว */
export const isOverdue = (i: Pick<SubInvoice, 'status' | 'due_date'>) =>
  i.status === 'pending' && i.due_date.slice(0, 10) < today()

/** ลิงก์หน้าพิมพ์ใบแจ้งหนี้/ใบเสร็จค่าบริการ — admin ใช้ endpoint ของผู้ดูแลแพลตฟอร์ม */
export const subPrintHref = (id: number, type: 'invoice' | 'receipt', admin = false) =>
  `${admin ? '/admin' : ''}/print/subscription/${id}?type=${type}&autoprint=1`

/** ส่วนต่างของรายปีเทียบกับจ่ายรายเดือน 12 เดือน */
export function yearlySaving(p: Pick<BillingPackage, 'price_monthly' | 'price_yearly'>) {
  const full = p.price_monthly * 12
  const save = Math.max(0, Math.round((full - p.price_yearly) * 100) / 100)
  const months = p.price_monthly > 0 ? Math.round((save / p.price_monthly) * 10) / 10 : 0
  return { save, months, perMonth: p.price_yearly / 12 }
}

export const priceOf = (p: Pick<BillingPackage, 'price_monthly' | 'price_yearly'>, cycle: BillingCycle) =>
  cycle === 'yearly' ? p.price_yearly : p.price_monthly

const addMonthsTo = (d: string, months: number) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, m - 1 + months, 1)
  // วันสิ้นเดือนที่สั้นกว่า (31 ม.ค. + 1 เดือน = 28 ก.พ.) — ตรงกับฝั่งเซิร์ฟเวอร์
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  dt.setDate(Math.min(day, last))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export type CheckoutPlan =
  | { kind: 'free'; daysLost: number }
  | { kind: 'renewal'; start: string; end: string; price: number; continues: boolean }
  | { kind: 'change'; start: string; end: string; price: number; credit: number; total: number; daysLeft: number }

/**
 * ประมาณการผลของการสั่งซื้อ (สูตรเดียวกับเซิร์ฟเวอร์ — ยอดจริงดูในใบแจ้งหนี้)
 * - แพ็กเกจ/รอบเดิม = ต่ออายุต่อจากวันหมดอายุ (ถ้ายังไม่เลยช่วงผ่อนผัน)
 * - อื่นๆ = เริ่มวันนี้ หักมูลค่าวันที่เหลือของแพ็กเกจเดิม
 */
export function planCheckout(b: BillingOverview, pkg: BillingPackage, cycle: BillingCycle): CheckoutPlan {
  const t = today()
  const sub = b.subscription
  const ends = sub.ends_at?.slice(0, 10) ?? null
  const price = priceOf(pkg, cycle)
  const months = cycle === 'yearly' ? 12 : 1
  if (price <= 0) return { kind: 'free', daysLost: ends && sub.status === 'active' ? Math.max(0, diffDays(t, ends)) : 0 }
  if (pkg.id === sub.package_id && cycle === sub.cycle) {
    const continues = !!ends && diffDays(ends, t) <= b.platform.grace_days
    const start = continues ? ends! : t
    return { kind: 'renewal', start, end: addMonthsTo(start, months), price, continues }
  }
  let credit = 0
  let daysLeft = 0
  if (ends && sub.status === 'active' && ends > t) {
    daysLeft = diffDays(t, ends)
    const days = sub.cycle === 'yearly' ? 365 : 30
    credit = Math.min(sub.price, Math.round(((sub.price * daysLeft) / days) * 100) / 100)
  }
  credit = Math.min(credit, price)
  return {
    kind: 'change',
    start: t,
    end: addMonthsTo(t, months),
    price,
    credit,
    total: Math.round((price - credit) * 100) / 100,
    daysLeft,
  }
}

/** แพ็กเกจรองรับการใช้งานปัจจุบันหรือไม่ — คืนรายการที่เกิน */
export function overLimits(
  pkg: Pick<BillingPackage, 'max_properties' | 'max_units' | 'max_members'>,
  usage: OrgInfo['usage'] | undefined,
) {
  if (!usage) return []
  const out: string[] = []
  if (usage.properties > pkg.max_properties) out.push(`โครงการ ${usage.properties}/${pkg.max_properties}`)
  if (usage.units > pkg.max_units) out.push(`ห้อง ${usage.units}/${pkg.max_units}`)
  if (usage.members > pkg.max_members) out.push(`สมาชิก ${usage.members}/${pkg.max_members}`)
  return out
}

/** สิ่งที่แถบแจ้งเตือนในแอปควรบอก (null = ไม่ต้องแสดง) */
export type BillingNotice =
  | { kind: 'suspended' | 'cancelled' }
  | { kind: 'expired'; endsAt: string | null }
  | { kind: 'rejected'; reason: string; invoiceId: number }
  | { kind: 'review' }
  | { kind: 'grace'; graceUntil: string | null; hasInvoice: boolean }
  | { kind: 'expiring'; daysLeft: number; endsAt: string; trial: boolean; hasInvoice: boolean }

export function billingNotice(info: OrgInfo | undefined, readOnly: boolean): BillingNotice | null {
  if (!info) return null
  const { org, billing } = info
  if (org.status === 'suspended' || org.status === 'cancelled') return { kind: org.status }
  if (readOnly) return { kind: 'expired', endsAt: org.ends_at }
  const open = billing?.open_invoice
  if (open?.status === 'pending' && open.reject_reason)
    return { kind: 'rejected', reason: open.reject_reason, invoiceId: open.id }
  const daysLeft = billing?.days_left
  const near = billing?.in_grace || (daysLeft != null && daysLeft <= 7)
  if (!near) return null
  if (open?.status === 'review') return { kind: 'review' }
  if (billing?.in_grace) return { kind: 'grace', graceUntil: billing.grace_until, hasInvoice: !!open }
  return {
    kind: 'expiring',
    daysLeft: Math.max(0, daysLeft ?? 0),
    endsAt: org.ends_at ?? '',
    trial: org.status === 'trial',
    hasInvoice: !!open,
  }
}

/** เวลาจาก SQLite (`YYYY-MM-DD HH:MM:SS` เป็น UTC) → ISO ที่ new Date() อ่านถูกเขตเวลา */
export const sqlUtc = (s: string) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') + 'Z' : s)

/** ผลตรวจสลิปอัตโนมัติ */
export const SLIP_RESULT: Record<SlipResult, { label: string; tone: Tone }> = {
  verified: { label: 'ตรวจกับธนาคารแล้ว', tone: 'green' },
  readable: { label: 'QR ถูกต้อง ยังไม่ยืนยันยอด', tone: 'ink' },
  unreadable: { label: 'ไม่พบ QR', tone: 'grey' },
  duplicate: { label: 'สลิปซ้ำ', tone: 'red' },
  mismatch: { label: 'ยอดไม่ตรง', tone: 'mustard' },
  error: { label: 'ตรวจไม่สำเร็จ', tone: 'mustard' },
}
