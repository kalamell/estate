import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, ShieldAlert } from 'lucide-react'
import { useSession } from '@/contexts/session'
import { api } from '@/lib/api'
import { ORG_STATUS, thDateLong } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Logo } from '@/components/common'
import { BookingDialogProvider, useBookingDialog } from '@/components/booking-dialog'
import { SETTINGS_NAV, SUPPORT_NAV, navBadgeCount, navGroupsFor, titleFor, type NavItem } from '@/components/nav'
import { OrgSwitcher } from '@/components/org-switcher'
import { SidebarUserMenu } from '@/components/user-menu'

function NavLinks({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const { orgId } = useSession()
  const needsCounts = items.some((n) => n.badge)
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.dashboard,
    enabled: needsCounts && orgId != null,
    staleTime: 60_000,
    meta: { silent: true },
  })
  return (
    <SidebarMenu>
      {items.map((n) => {
        const active = n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)
        const count = n.badge ? navBadgeCount(dash.data, n.badge) : 0
        return (
          <SidebarMenuItem key={n.to}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={n.label}
              className="relative h-9 gap-3 rounded-sm text-sidebar-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-sidebar-primary before:opacity-0 hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:before:opacity-100 [&>svg]:size-[17px] [&>svg]:text-sidebar-muted data-[active=true]:[&>svg]:text-sidebar-primary"
            >
              <NavLink to={n.to} end={n.to === '/'} onClick={() => setOpenMobile(false)}>
                <n.icon />
                <span>{n.label}</span>
              </NavLink>
            </SidebarMenuButton>
            {count > 0 && (
              <SidebarMenuBadge
                className={
                  n.badge === 'overdue_count' ||
                  n.badge === 'pending_requests' ||
                  n.badge === 'open_privacy_requests'
                    ? 'rounded-sm bg-warning/20 text-warning'
                    : 'rounded-sm bg-sidebar-accent text-sidebar-foreground'
                }
                title={
                  n.badge === 'pending_requests'
                    ? 'คำขอจองออนไลน์รอตอบ'
                    : n.badge === 'hk_open_tasks'
                      ? 'งานแม่บ้านที่ยังไม่เสร็จ'
                      : n.badge === 'open_privacy_requests'
                        ? 'คำขอใช้สิทธิ์ PDPA ที่ยังไม่ปิด'
                        : undefined
                }
              >
                {count}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

function AppSidebar() {
  const { user, canManage } = useSession()
  const { isMobile } = useSidebar()
  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <SidebarHeader className="gap-3 p-3">
        <Logo
          className="px-2 pt-2 pb-1 text-sidebar-accent-foreground"
          markClassName="bg-sidebar-mark text-sidebar-mark-foreground"
        />
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {navGroupsFor(canManage).map((g) => (
          <SidebarGroup key={g.label} className="py-1">
            <SidebarGroupLabel className="text-[11px] tracking-wide text-sidebar-muted">{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavLinks items={g.items} />
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <NavLinks items={[SUPPORT_NAV, SETTINGS_NAV]} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarUserMenu user={user} isMobile={isMobile} />
      </SidebarFooter>
    </Sidebar>
  )
}

function ReadOnlyBanner() {
  const { readOnly, orgInfo } = useSession()
  if (!readOnly) return null
  const status = orgInfo?.org.status
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning-foreground lg:px-8">
      <ShieldAlert className="size-4 shrink-0" />
      <span className="font-medium">บัญชีถูกระงับ/หมดอายุ — อ่านได้อย่างเดียว</span>
      <span className="opacity-80">
        {status && ORG_STATUS[status]?.label}
        {orgInfo?.org.ends_at && ` · สิ้นสุด ${thDateLong(orgInfo.org.ends_at)}`}
      </span>
      <Link to="/settings?tab=package" className="ml-auto font-medium underline underline-offset-4">
        ดูแพ็กเกจ
      </Link>
    </div>
  )
}

function Header() {
  const { pathname } = useLocation()
  const { openBooking } = useBookingDialog()
  const { readOnly } = useSession()
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 lg:px-8">
      <SidebarTrigger className="-ml-1" aria-label="เมนู" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      <h1 className="truncate text-[17px] font-semibold tracking-tight">{titleFor(pathname)}</h1>
      <div className="ml-auto flex items-center gap-2">
        <Button onClick={() => openBooking()} disabled={readOnly}>
          <CalendarPlus />
          <span className="hidden sm:inline">จองห้อง</span>
          <span className="sm:hidden">จอง</span>
        </Button>
      </div>
    </header>
  )
}

export function AppShell() {
  const { orgId } = useSession()
  return (
    <SidebarProvider>
      <BookingDialogProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <Header />
          <ReadOnlyBanner />
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-24 sm:pb-8 lg:p-8">
            <Outlet key={orgId ?? 'none'} />
          </main>
        </SidebarInset>
      </BookingDialogProvider>
    </SidebarProvider>
  )
}
