import { NavLink, Outlet, Link } from 'react-router-dom'
import { ArrowLeft, Building2, Inbox, LayoutDashboard, Package, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CompactUserMenu } from '@/components/user-menu'

const TABS = [
  { to: '/admin', label: 'ภาพรวม', icon: LayoutDashboard, end: true },
  { to: '/admin/packages', label: 'แพ็กเกจ', icon: Package },
  { to: '/admin/orgs', label: 'องค์กรลูกค้า', icon: Building2 },
  { to: '/admin/users', label: 'ผู้ใช้', icon: Users },
  { to: '/admin/support', label: 'คำร้องจากลูกค้า', icon: Inbox },
]

export default function AdminLayout() {
  const { user, orgs } = useSession()
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b border-[#2e2c28] bg-[#1c1b19] text-[#faf9f6]">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 lg:px-8">
          {orgs.length > 0 && (
            <Button asChild variant="ghost" size="icon" className="text-[#d9d5cc] hover:bg-[#2a2926] hover:text-white" aria-label="กลับไปที่แอป">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
          )}
          <div className="grid size-8 place-items-center rounded-md border border-[#2e2c28] bg-[#2a2926] text-[#8fb59b]">
            <ShieldCheck className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2 font-semibold">
              Estate Console
              <Badge variant="outline" className="border-[#8fb59b]/40 text-[10px] font-medium text-[#8fb59b]">
                Super Admin
              </Badge>
            </div>
            <div className="text-xs text-[#8c877d]">จัดการแพ็กเกจ ลูกค้า และผู้ใช้ทั้งระบบ</div>
          </div>
          <div className="ml-auto">
            <CompactUserMenu user={user} showSettings={orgs.length > 0} />
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 lg:px-8" aria-label="เมนูผู้ดูแลระบบ">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'border-[#8fb59b] font-medium text-[#faf9f6]'
                    : 'border-transparent text-[#8c877d] hover:text-[#d9d5cc]',
                )
              }
            >
              <t.icon className="size-4" />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
