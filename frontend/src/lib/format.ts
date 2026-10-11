import type {
  BookingStatus,
  DepositStatus,
  FurnitureKind,
  OrgStatus,
  PropertyKind,
  Role,
  UnitStatus,
} from './api'

export const baht = (n: number | null | undefined) =>
  '฿' +
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** จำนวนเงินที่ติดลบได้ เช่น กำไร: "−฿2,900" */
export const signedBaht = (n: number | null | undefined) => (Number(n) < 0 ? `−${baht(-Number(n))}` : baht(n))

export const num = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

export const thDate = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    : '—'

export const thDateLong = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

/** "2025-03" → "มี.ค. 2568" */
export const thPeriod = (p: string) => {
  const [y, m] = p.split('-').map(Number)
  if (!y || !m) return p
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })
}

const pad = (n: number) => String(n).padStart(2, '0')
/** วันที่ท้องถิ่น YYYY-MM-DD */
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const thisPeriod = () => today().slice(0, 7)

export const KINDS: Record<PropertyKind, string> = {
  dormitory: 'หอพัก',
  apartment: 'อพาร์ทเมนต์',
  condo: 'คอนโด',
  house: 'บ้านเช่า',
  short_stay: 'ห้องพักรายวัน / Airbnb',
}

/** โทนสีสถานะแบบเรียบ (ใช้กับ Badge: variant="outline" + ring-1) */
export const TONE = {
  green: 'border-0 ring-1 bg-success/10 text-success ring-success/25',
  mustard: 'border-0 ring-1 bg-warning/15 text-warning-foreground ring-warning/35',
  ink: 'border-0 ring-1 bg-info/10 text-info ring-info/25',
  grey: 'border-0 ring-1 bg-muted text-muted-foreground ring-border',
  red: 'border-0 ring-1 bg-destructive/10 text-destructive ring-destructive/25',
  primary: 'border-0 ring-1 bg-primary/10 text-primary ring-primary/25',
} as const
export type Tone = keyof typeof TONE

export const UNIT_STATUS: Record<
  UnitStatus,
  { label: string; badge: string; bar: string; dot: string; text: string }
> = {
  vacant: {
    label: 'ว่าง',
    badge: TONE.green,
    bar: 'border-l-st-vacant',
    dot: 'bg-st-vacant',
    text: 'text-success',
  },
  reserved: {
    label: 'จองแล้ว',
    badge: TONE.mustard,
    bar: 'border-l-st-reserved',
    dot: 'bg-st-reserved',
    text: 'text-warning-foreground',
  },
  occupied: {
    label: 'มีผู้เช่า',
    badge: TONE.ink,
    bar: 'border-l-st-occupied',
    dot: 'bg-st-occupied',
    text: 'text-info',
  },
  maintenance: {
    label: 'ปิดปรับปรุง',
    badge: TONE.grey,
    bar: 'border-l-st-maintenance',
    dot: 'bg-st-maintenance',
    text: 'text-muted-foreground',
  },
}

export const BOOKING_STATUS: Record<BookingStatus, { label: string; badge: string }> = {
  reserved: { label: 'จองแล้ว', badge: TONE.mustard },
  active: { label: 'กำลังเข้าพัก', badge: TONE.ink },
  completed: { label: 'สิ้นสุดแล้ว', badge: TONE.grey },
  cancelled: { label: 'ยกเลิก', badge: TONE.red },
}

export const BOOKING_REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'รอตอบ', tone: 'mustard' },
  approved: { label: 'อนุมัติแล้ว', tone: 'green' },
  rejected: { label: 'ปฏิเสธแล้ว', tone: 'red' },
  expired: { label: 'หมดอายุ', tone: 'grey' },
}

export const DEPOSIT_STATUS: Record<DepositStatus, string> = {
  pending: 'รอชำระ',
  paid: 'ชำระแล้ว',
  refunded: 'คืนแล้ว',
  forfeited: 'ริบ',
}

export const BOOKING_SOURCES: Record<string, string> = {
  direct: 'จองตรง',
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  agoda: 'Agoda',
  vrbo: 'VRBO',
  other: 'อื่นๆ',
}

/** [ชื่อ, กว้าง, ลึก, สูง] (เมตร) */
export const FURNITURE: Record<FurnitureKind, [string, number, number, number]> = {
  bed: ['เตียง', 1.6, 2.0, 0.5],
  desk: ['โต๊ะทำงาน', 1.2, 0.6, 0.75],
  wardrobe: ['ตู้เสื้อผ้า', 0.6, 1.2, 2.0],
  sofa: ['โซฟา', 1.8, 0.8, 0.8],
  fridge: ['ตู้เย็น', 0.6, 0.6, 1.5],
  tv: ['ทีวี', 1.2, 0.3, 1.0],
  bathroom: ['ห้องน้ำ', 1.6, 2.0, 2.4],
  kitchen: ['เคาน์เตอร์ครัว', 2.0, 0.6, 0.9],
}

export const ROLES: Record<Role, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแล',
  staff: 'พนักงาน',
}

export const ORG_STATUS: Record<OrgStatus, { label: string; badge: string; dot: string }> = {
  trial: { label: 'ทดลองใช้', dot: 'bg-info', badge: TONE.ink },
  active: { label: 'ใช้งานอยู่', dot: 'bg-success', badge: TONE.green },
  suspended: { label: 'ถูกระงับ', dot: 'bg-warning', badge: TONE.mustard },
  cancelled: { label: 'ยกเลิกแล้ว', dot: 'bg-destructive', badge: TONE.red },
}

/** อักษรแรกของชื่อ (ข้ามสระหน้า เ แ โ ใ ไ ของภาษาไทย) */
export const initials = (name: string) => {
  const s = name.trim().replace(/^[เแโใไ]/, '')
  return s.slice(0, 1).toUpperCase() || '?'
}

/** จำนวนเงินทศนิยม 2 ตำแหน่ง (ใช้ในเอกสาร) */
export const money = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** วันที่ + n วัน (YYYY-MM-DD) */
export const addDays = (d: string, n: number) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, day || 1)
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export const PAY_METHODS: Record<string, string> = {
  promptpay: 'พร้อมเพย์',
  transfer: 'โอนเงินเข้าบัญชี',
  cash: 'เงินสด',
  deposit: 'หักจากเงินมัดจำ',
}

export const INVOICE_KINDS: Record<string, string> = {
  monthly: 'รายเดือน',
  manual: 'ออกเอง',
  move_out: 'ย้ายออก',
}

/** "00000" → สำนักงานใหญ่, อื่นๆ → สาขาที่ xxxxx */
export const branchLabel = (code: string | null | undefined) =>
  !code ? '' : code === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${code}`

/** ดึงอัตรา VAT จากยอดภาษี/ฐานภาษี (ปัดเป็นจำนวนเต็มหรือทศนิยม 2 ตำแหน่ง) */
export const vatRateOf = (
  items: { amount: number; vatable: boolean }[],
  vat: number,
  fallback = 7,
) => {
  const base = items.filter((i) => i.vatable).reduce((s, i) => s + i.amount, 0)
  if (!base || !vat) return fallback
  const r = Math.round((vat / base) * 10000) / 100
  return Number.isFinite(r) ? r : fallback
}

const utcOf = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, day || 1)
}
/** จำนวนวันจาก a ถึง b (YYYY-MM-DD) — b ไม่นับรวม */
export const diffDays = (a: string, b: string) => Math.round((utcOf(b) - utcOf(a)) / 86_400_000)

/** 0 = อาทิตย์ … 6 = เสาร์ */
export const weekdayOf = (d: string) => new Date(utcOf(d)).getUTCDay()

export const TH_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
export const TH_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]
export const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** "2026-10-11" → "ส. 11 ต.ค." */
export const thDayShort = (d: string) => {
  const [, m, day] = d.slice(0, 10).split('-').map(Number)
  return `${TH_WEEKDAYS[weekdayOf(d)]}. ${day} ${TH_MONTHS_SHORT[(m || 1) - 1]}`
}

/** ช่วงวันที่สั้นๆ "11–14 ต.ค." หรือ "30 ต.ค. – 2 พ.ย." */
export const thRange = (a: string, b: string) => {
  const [ya, ma, da] = a.slice(0, 10).split('-').map(Number)
  const [yb, mb, db] = b.slice(0, 10).split('-').map(Number)
  if (ya === yb && ma === mb) return `${da}–${db} ${TH_MONTHS_SHORT[ma - 1]}`
  return `${da} ${TH_MONTHS_SHORT[ma - 1]} – ${db} ${TH_MONTHS_SHORT[mb - 1]}${ya !== yb ? ` ${yb + 543}` : ''}`
}

/** "YYYY-MM" + n เดือน → "YYYY-MM" */
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
