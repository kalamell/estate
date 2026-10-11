import { NavLink, Outlet, Link } from 'react-router-dom'
import { ArrowLeft, Building2, LayoutDashboard, Package, ShieldCheck, Users } from 'lucide-react'
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
]

export default function AdminLayout() {
  const { user, orgs } = useSession()
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b bg-slate-950 text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 left-1/3 h-48 w-96 rounded-full bg-amber-500/25 blur-3xl" />
          <div className="absolute -top-24 right-0 h-48 w-80 rounded-full bg-rose-500/20 blur-3xl" />
        </div>
        <div className="relative mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 lg:px-8">
          {orgs.length > 0 && (
            <Button asChild variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="กลับไปที่แอป">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
          )}
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 shadow-lg shadow-rose-500/30">
            <ShieldCheck className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2 font-semibold">
              Estate Console
              <Badge className="border-0 bg-gradient-to-r from-amber-400 to-rose-500 text-[10px] text-white">
                Super Admin
              </Badge>
            </div>
            <div className="text-xs text-slate-400">จัดการแพ็กเกจ ลูกค้า และผู้ใช้ทั้งระบบ</div>
          </div>
          <div className="ml-auto">
            <CompactUserMenu user={user} showSettings={orgs.length > 0} />
          </div>
        </div>
        <nav className="relative mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 lg:px-8" aria-label="เมนูผู้ดูแลระบบ">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'border-amber-400 font-medium text-white'
                    : 'border-transparent text-slate-400 hover:text-white',
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
