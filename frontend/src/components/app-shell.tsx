import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { CalendarPlus, ShieldAlert } from 'lucide-react'
import { useSession } from '@/contexts/session'
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Logo } from '@/components/common'
import { BookingDialogProvider, useBookingDialog } from '@/components/booking-dialog'
import { NAV, SETTINGS_NAV, titleFor, type NavItem } from '@/components/nav'
import { OrgSwitcher } from '@/components/org-switcher'
import { SidebarUserMenu } from '@/components/user-menu'

function NavLinks({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenu>
      {items.map((n) => {
        const active = n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)
        return (
          <SidebarMenuItem key={n.to}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={n.label}
              className="h-10 gap-3 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-[18px] data-[active=true]:[&>svg]:text-sidebar-primary"
            >
              <NavLink to={n.to} end={n.to === '/'} onClick={() => setOpenMobile(false)}>
                <n.icon />
                <span>{n.label}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

function AppSidebar() {
  const { user } = useSession()
  const { isMobile } = useSidebar()
  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <SidebarHeader className="gap-3 p-3">
        <Logo className="px-2 pt-2 pb-1 text-white" />
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">เมนูหลัก</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavLinks items={NAV} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <NavLinks items={[SETTINGS_NAV]} />
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-300/50 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 lg:px-8 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      <ShieldAlert className="size-4 shrink-0" />
      <span className="font-medium">บัญชีถูกระงับ/หมดอายุ — อ่านได้อย่างเดียว</span>
      <span className="text-amber-800/80 dark:text-amber-200/70">
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
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:px-8">
      <SidebarTrigger className="-ml-1" aria-label="เมนู" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      <h1 className="truncate text-lg font-semibold tracking-tight">{titleFor(pathname)}</h1>
      <div className="ml-auto flex items-center gap-2">
        <Button onClick={() => openBooking()} disabled={readOnly} className="bg-brand text-white shadow-md shadow-indigo-500/25 hover:opacity-95">
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
