import {
  BarChart3,
  Building2,
  CalendarDays,
  DoorOpen,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  MapPinned,
  ReceiptText,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** แสดงตัวเลขจาก dashboard */
  badge?: 'open_tickets' | 'overdue_count'
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'ภาพรวม',
    items: [
      { to: '/', label: 'ภาพรวม', icon: LayoutDashboard },
      { to: '/properties', label: 'โครงการ & แผนที่', icon: MapPinned },
      { to: '/units', label: 'ห้องพัก & 3D', icon: Building2 },
    ],
  },
  {
    label: 'งานประจำ',
    items: [
      { to: '/bookings', label: 'การจอง & มัดจำ', icon: CalendarDays },
      { to: '/meters', label: 'จดมิเตอร์', icon: Gauge },
      { to: '/invoices', label: 'บิล & เอกสาร', icon: ReceiptText, badge: 'overdue_count' },
      { to: '/tickets', label: 'แจ้งซ่อม & ติดต่อ', icon: Wrench, badge: 'open_tickets' },
      { to: '/move-outs', label: 'ย้ายออก & คืนมัดจำ', icon: DoorOpen },
      { to: '/tenants', label: 'ผู้เช่า', icon: Users },
    ],
  },
  {
    label: 'วิเคราะห์',
    items: [{ to: '/reports', label: 'รายงาน', icon: BarChart3 }],
  },
]

export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

export const SUPPORT_NAV: NavItem = { to: '/support', label: 'ติดต่อผู้ให้บริการ', icon: LifeBuoy }
export const SETTINGS_NAV: NavItem = { to: '/settings', label: 'ตั้งค่าองค์กร', icon: Settings }

export function titleFor(pathname: string) {
  const all = [...NAV, SUPPORT_NAV, SETTINGS_NAV]
  return (
    all.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))?.label ?? 'Estate'
  )
}
