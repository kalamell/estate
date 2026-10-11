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

export const UNIT_STATUS: Record<
  UnitStatus,
  { label: string; badge: string; tile: string; dot: string }
> = {
  vacant: {
    label: 'ว่าง',
    badge:
      'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
    tile: 'from-emerald-400 to-emerald-500',
    dot: 'bg-emerald-500',
  },
  reserved: {
    label: 'จองแล้ว',
    badge:
      'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
    tile: 'from-amber-400 to-amber-500',
    dot: 'bg-amber-500',
  },
  occupied: {
    label: 'มีผู้เช่า',
    badge:
      'bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30',
    tile: 'from-indigo-500 to-violet-500',
    dot: 'bg-indigo-500',
  },
  maintenance: {
    label: 'ปิดปรับปรุง',
    badge:
      'bg-slate-200 text-slate-600 ring-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:ring-slate-500/30',
    tile: 'from-slate-400 to-slate-500',
    dot: 'bg-slate-400',
  },
}

export const BOOKING_STATUS: Record<BookingStatus, { label: string; badge: string }> = {
  reserved: {
    label: 'จองแล้ว',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  active: {
    label: 'กำลังเข้าพัก',
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
  completed: {
    label: 'สิ้นสุดแล้ว',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
  },
  cancelled: {
    label: 'ยกเลิก',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  },
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
  trial: {
    label: 'ทดลองใช้',
    dot: 'bg-sky-500',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
  active: {
    label: 'ใช้งานอยู่',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  suspended: {
    label: 'ถูกระงับ',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  cancelled: {
    label: 'ยกเลิกแล้ว',
    dot: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  },
}

/** อักษรแรกของชื่อ (ข้ามสระหน้า เ แ โ ใ ไ ของภาษาไทย) */
export const initials = (name: string) => {
  const s = name.trim().replace(/^[เแโใไ]/, '')
  return s.slice(0, 1).toUpperCase() || '?'
}
