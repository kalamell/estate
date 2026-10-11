import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarClock, CalendarPlus, Clock, Loader2, MailWarning, ShieldAlert, X, XCircle } from 'lucide-react'
import { useSession } from '@/contexts/session'
import { api } from '@/lib/api'
import { useResendVerification } from '@/lib/account'
import { queryClient } from '@/lib/query'
import { BILLING_PATH, billingNotice } from '@/lib/billing'
import { thDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/hooks/use-document-title'
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
import {
  footerNavFor,
  navBadgeCount,
  navGroupsFor,
  titleFor,
  type NavBadge,
  type NavItem,
} from '@/components/nav'
import { OrgSwitcher } from '@/components/org-switcher'
import { SidebarUserMenu } from '@/components/user-menu'

const BADGE_TITLE: Partial<Record<NavBadge, string>> = {
  pending_requests: 'คำขอจองออนไลน์รอตอบ',
  hk_open_tasks: 'งานแม่บ้านที่ยังไม่เสร็จ',
  open_privacy_requests: 'คำขอใช้สิทธิ์ PDPA ที่ยังไม่ปิด',
  pending_payment_notices: 'แจ้งชำระรอตรวจสลิป',
  parcels_waiting: 'พัสดุรอผู้เช่ามารับ',
  tm30_pending: 'ตม.30 ที่ยังไม่ได้แจ้ง',
}

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
                  n.badge === 'open_privacy_requests' ||
                  n.badge === 'pending_payment_notices' ||
                  n.badge === 'tm30_pending'
                    ? 'rounded-sm bg-warning/20 text-warning'
                    : 'rounded-sm bg-sidebar-accent text-sidebar-foreground'
                }
                title={n.badge ? BADGE_TITLE[n.badge] : undefined}
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
            <NavLinks items={footerNavFor(canManage)} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarUserMenu user={user} isMobile={isMobile} />
      </SidebarFooter>
    </Sidebar>
  )
}

/** แถบแจ้งเตือนเรื่องแพ็กเกจ: ใกล้หมดอายุ / ช่วงผ่อนผัน / อ่านอย่างเดียว / สลิปถูกตีกลับ */
function useBillingNotice() {
  const { readOnly, orgInfo, canManage } = useSession()
  const n = billingNotice(orgInfo, readOnly)
  if (!n) return null
  // พนักงานไม่ต้องเห็นเรื่องสลิป (เจ้าของจัดการเอง)
  if (!canManage && (n.kind === 'rejected' || n.kind === 'review')) return null
  return n
}

function BillingBanner({ n }: { n: NonNullable<ReturnType<typeof useBillingNotice>> }) {
  const { canManage } = useSession()
  const { pathname } = useLocation()

  let tone: 'calm' | 'warn' | 'alert' = 'warn'
  let icon = CalendarClock
  let text: ReactNode
  let cta = 'ต่ออายุแพ็กเกจ'
  switch (n.kind) {
    case 'suspended':
    case 'cancelled':
      tone = 'alert'
      icon = ShieldAlert
      text = (
        <>
          <b className="font-medium">บัญชี{n.kind === 'suspended' ? 'ถูกระงับ' : 'ถูกยกเลิก'}</b> — ข้อมูลยังอยู่ครบ แต่อ่านได้อย่างเดียว
        </>
      )
      break
    case 'expired':
      tone = 'alert'
      icon = ShieldAlert
      text = (
        <>
          <b className="font-medium">แพ็กเกจหมดอายุ{n.endsAt ? ` ${thDateLong(n.endsAt)}` : ''}</b> — อ่านข้อมูลได้อย่างเดียวจนกว่าจะต่ออายุ
        </>
      )
      cta = 'ต่ออายุเพื่อใช้งานต่อ'
      break
    case 'rejected':
      tone = 'alert'
      icon = XCircle
      text = (
        <>
          <b className="font-medium">สลิปค่าบริการไม่ผ่านการตรวจสอบ</b> — {n.reason}
        </>
      )
      cta = 'แนบสลิปใหม่'
      break
    case 'review':
      tone = 'calm'
      icon = Clock
      text = 'ได้รับสลิปค่าบริการแล้ว — รอผู้ให้บริการตรวจสอบ แพ็กเกจจะต่ออายุให้อัตโนมัติ'
      cta = 'ดูสถานะ'
      break
    case 'grace':
      text = (
        <>
          <b className="font-medium">แพ็กเกจหมดอายุแล้ว</b> — ยังใช้งานได้ถึง {thDateLong(n.graceUntil)}
        </>
      )
      cta = n.hasInvoice ? 'ชำระเงิน' : 'ต่ออายุแพ็กเกจ'
      break
    case 'expiring':
      tone = n.daysLeft <= 3 ? 'warn' : 'calm'
      text = (
        <>
          {n.trial ? 'ช่วงทดลองใช้' : 'แพ็กเกจ'}
          {n.daysLeft === 0 ? 'หมดอายุวันนี้' : `จะหมดอายุในอีก ${n.daysLeft} วัน`}
          <span className="opacity-70"> · {thDateLong(n.endsAt)}</span>
        </>
      )
      cta = n.trial ? 'เลือกแพ็กเกจ' : n.hasInvoice ? 'ชำระเงิน' : 'ต่ออายุแพ็กเกจ'
      break
  }
  const Icon = icon
  const onBilling = pathname.startsWith(BILLING_PATH)
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px] lg:px-8',
        tone === 'calm' && 'bg-muted/60 text-foreground',
        tone === 'warn' && 'border-warning/30 bg-warning/10 text-foreground',
        tone === 'alert' && 'border-destructive/20 bg-destructive/[0.06] text-foreground',
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0',
          tone === 'calm' && 'text-muted-foreground',
          tone === 'warn' && 'text-warning',
          tone === 'alert' && 'text-destructive',
        )}
      />
      <span className="min-w-0">{text}</span>
      {canManage ? (
        !onBilling && (
          <Link
            to={n.kind === 'suspended' || n.kind === 'cancelled' ? '/support' : BILLING_PATH + (n.kind === 'rejected' ? '#pay' : '')}
            className="ml-auto inline-flex items-center gap-1 font-medium whitespace-nowrap underline-offset-4 hover:underline"
          >
            {n.kind === 'suspended' || n.kind === 'cancelled' ? 'ติดต่อผู้ให้บริการ' : cta}
            <ArrowRight className="size-3.5" />
          </Link>
        )
      ) : (
        <span className="ml-auto whitespace-nowrap text-muted-foreground">ติดต่อเจ้าของบัญชี</span>
      )}
    </div>
  )
}

const verifyDismissKey = (userId: number) => `estate.verifyBanner.${userId}`

/** แถบเตือนให้ยืนยันอีเมล — ปิดได้ (จำไว้เฉพาะเซสชันของแท็บนี้) */
function VerifyBanner({ compact }: { compact: boolean }) {
  const { user } = useSession()
  const resend = useResendVerification(user.email)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(verifyDismissKey(user.id)) === '1'
    } catch {
      return false
    }
  })
  const pending = user.email_verified === false && !dismissed
  // ยืนยันจากอีกแท็บแล้วกลับมา → ดึงสถานะใหม่
  useEffect(() => {
    if (!pending) return
    const onFocus = () => void queryClient.invalidateQueries({ queryKey: ['me'] })
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [pending])
  if (!pending) return null
  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(verifyDismissKey(user.id), '1')
    } catch {
      /* ignore */
    }
  }
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-x-3 bg-muted/40 pr-2 pl-4 text-foreground lg:pl-8',
        compact ? 'py-1 text-xs' : 'py-1.5 text-[13px]',
      )}
    >
      <MailWarning className={cn('shrink-0 text-muted-foreground', compact ? 'size-3.5' : 'size-4')} />
      <span className="min-w-0 flex-1">
        ยืนยันอีเมล <b className="font-medium break-words">{user.email}</b> เพื่อรับใบแจ้งหนี้และกู้คืนรหัสผ่าน
      </span>
      <button
        type="button"
        onClick={() => resend.mutate()}
        disabled={resend.isPending || resend.isSuccess}
        className="inline-flex shrink-0 items-center gap-1 font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
      >
        {resend.isPending && <Loader2 className="size-3.5 animate-spin" />}
        {resend.isSuccess ? 'ส่งแล้ว' : 'ส่งลิงก์อีกครั้ง'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="ซ่อนแถบนี้"
        title="ซ่อนจนกว่าจะเปิดแอปใหม่"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/** แถบแจ้งเตือนใต้ header — รวมเรื่องแพ็กเกจและยืนยันอีเมลไว้ในกล่องเดียว (แถวรองบางลงเมื่อมีสองเรื่อง) */
function ShellNotices() {
  const billing = useBillingNotice()
  return (
    <div className="divide-y border-b empty:hidden">
      {billing && <BillingBanner n={billing} />}
      <VerifyBanner compact={!!billing} />
    </div>
  )
}

function Header() {
  const { pathname } = useLocation()
  const { openBooking } = useBookingDialog()
  const { readOnly } = useSession()
  const title = titleFor(pathname)
  useDocumentTitle(title === 'Estate' ? 'Estate' : `${title} · Estate`)
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 lg:px-8">
      <SidebarTrigger className="-ml-1" aria-label="เมนู" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      <h1 className="truncate text-[17px] font-semibold tracking-tight">{title}</h1>
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

/** จำสถานะย่อ/ขยายเมนูซ้ายไว้ (คอมโพเนนต์ sidebar เขียน cookie นี้ทุกครั้งที่สลับ) */
function sidebarDefaultOpen() {
  try {
    return !document.cookie.split('; ').includes('sidebar_state=false')
  } catch {
    return true
  }
}

export function AppShell() {
  const { orgId } = useSession()
  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen()}>
      <BookingDialogProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <Header />
          <ShellNotices />
          {/* ไม่จำกัดความกว้าง: ย่อเมนูซ้ายแล้วเนื้อหาขยายเต็มพื้นที่ */}
          <main className="w-full flex-1 p-4 pb-24 sm:pb-8 lg:p-8">
            <Outlet key={orgId ?? 'none'} />
          </main>
        </SidebarInset>
      </BookingDialogProvider>
    </SidebarProvider>
  )
}
