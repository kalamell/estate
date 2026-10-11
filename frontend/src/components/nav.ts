import {
  Building2,
  CalendarDays,
  Gauge,
  LayoutDashboard,
  MapPinned,
  ReceiptText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV: NavItem[] = [
  { to: '/', label: 'ภาพรวม', icon: LayoutDashboard },
  { to: '/properties', label: 'โครงการ & แผนที่', icon: MapPinned },
  { to: '/units', label: 'ห้องพัก & 3D', icon: Building2 },
  { to: '/bookings', label: 'การจอง & มัดจำ', icon: CalendarDays },
  { to: '/meters', label: 'จดมิเตอร์', icon: Gauge },
  { to: '/invoices', label: 'บิล & ชำระเงิน', icon: ReceiptText },
  { to: '/tenants', label: 'ผู้เช่า', icon: Users },
]

export const SETTINGS_NAV: NavItem = { to: '/settings', label: 'ตั้งค่าองค์กร', icon: Settings }

export function titleFor(pathname: string) {
  const all = [...NAV, SETTINGS_NAV]
  return (
    all.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))?.label ?? 'Estate'
  )
}
