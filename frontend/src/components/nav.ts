import {
  BarChart3,
  BrushCleaning,
  Building2,
  CalendarDays,
  CalendarRange,
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
import type { Dashboard } from '@/lib/api'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** แสดงตัวเลขจาก dashboard */
  badge?: NavBadge
}

export type NavBadge = 'open_tickets' | 'overdue_count' | 'pending_requests' | 'hk_open_tasks'

/** ตัวเลขบนเมนูจากข้อมูล dashboard */
export function navBadgeCount(d: Dashboard | undefined, badge: NavBadge): number {
  if (!d) return 0
  if (badge === 'hk_open_tasks') return d.housekeeping?.open_tasks ?? 0
  return d[badge] ?? 0
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
      { to: '/bookings', label: 'การจอง & มัดจำ', icon: CalendarDays, badge: 'pending_requests' },
      { to: '/calendar', label: 'ปฏิทินการจอง', icon: CalendarRange },
      { to: '/housekeeping', label: 'งานแม่บ้าน', icon: BrushCleaning, badge: 'hk_open_tasks' },
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
  if (/^\/properties\/\d+\/pricing/.test(pathname)) return 'ราคาตามฤดูกาล'
  const all = [...NAV, SUPPORT_NAV, SETTINGS_NAV]
  return (
    all.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))?.label ?? 'Estate'
  )
}
