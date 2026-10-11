// พอร์ทัลผู้เช่า (สาธารณะ ไม่ต้องล็อกอิน) — /p/:token
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Home,
  Loader2,
  Megaphone,
  Package,
  Phone,
  Pin,
  Plus,
  Printer,
  Receipt,
  Send,
  ShieldCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { ApiError, api, withUploadAccess, type PortalHome, type PrivacyRequestKind } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { baht, num } from '@/lib/format'
import { ORG_CATEGORIES_EN, PRIVACY_KINDS_EN, pick, useI18n, type I18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Field, InvoiceStatusBadge, LogoMark, ToneBadge } from '@/components/common'
import { PromptPayQR } from '@/components/promptpay-qr'
import { ORG_CATEGORIES } from '@/components/tickets/labels'
import { MessageThread, PhotoGrid, PhotoPicker, ReplyBox, TicketStatusBadge } from '@/components/tickets/parts'
import { addFriendUrl } from '@/lib/line'
import { useForcedColorTheme } from '@/components/theme-provider'
import { LineIcon } from '@/components/line'
import { NoticeText } from '@/components/privacy'
import { LangProvider, LangSwitch } from '@/components/lang'
import { PRIVACY_KINDS } from '@/lib/privacy'
import { NoticeBadge, PayWithSlip } from './slip'
import { ParcelsHomeCard, ParcelsTab } from './parcels'
import { portalLang, useSetPortalLang } from './lang'
import { ContractsHomeCard, ContractsSection } from './contracts'

type Tab = 'home' | 'bills' | 'parcels' | 'repair' | 'privacy'
type TabDef = { v: Tab; label: string; short: string; icon: LucideIcon }
/** short = ป้ายบนแถบเมนูด้านล่าง (มือถือ) */
const tabsFor = ({ t }: I18n, privacy: boolean): TabDef[] => [
  { v: 'home', label: t('หน้าหลัก', 'Home'), short: t('หน้าหลัก', 'Home'), icon: Home },
  { v: 'bills', label: t('บิล & ใบเสร็จ', 'Bills & receipts'), short: t('บิล', 'Bills'), icon: FileText },
  { v: 'parcels', label: t('พัสดุ', 'Parcels'), short: t('พัสดุ', 'Parcels'), icon: Package },
  { v: 'repair', label: t('แจ้งซ่อม', 'Repairs'), short: t('แจ้งซ่อม', 'Repairs'), icon: Wrench },
  ...(privacy
    ? [{ v: 'privacy' as Tab, label: t('ความเป็นส่วนตัว', 'Privacy'), short: t('ส่วนตัว', 'Privacy'), icon: ShieldCheck }]
    : []),
]

/** การแจ้งชำระล่าสุดของบิล */
const noticeFor = (d: PortalHome, invoiceId: number) =>
  d.payment_notices?.find((n) => n.invoice_id === invoiceId) ?? null

const silent = { meta: { silent: true }, retry: false } as const

/** ค่า ?tab= ที่รองรับ (รวมลิงก์จากข้อความ LINE: receipts, tickets) */
const TAB_ALIAS: Record<string, Tab> = {
  home: 'home',
  bills: 'bills',
  receipts: 'bills',
  parcels: 'parcels',
  parcel: 'parcels',
  repair: 'repair',
  tickets: 'repair',
  privacy: 'privacy',
  contracts: 'home',
  contract: 'home',
}

export default function PortalPage() {
  const { token = '' } = useParams()
  const home = useQuery({
    queryKey: ['portal', token],
    queryFn: () => api.portal.home(token),
    ...silent,
    // กลับมาจากแอป LINE หลังเชื่อมบัญชี → โหลดสถานะใหม่
    refetchOnWindowFocus: true,
  })
  return (
    <LangProvider lang={portalLang(home.data)}>
      <Portal token={token} home={home} />
    </LangProvider>
  )
}

function Portal({ token, home }: { token: string; home: UseQueryResult<PortalHome> }) {
  const i18n = useI18n()
  const { t } = i18n
  const setLang = useSetPortalLang(token)
  const [params, setParams] = useSearchParams()
  // deep link: ?invoice=<id> → แท็บบิล, ?ticket=<id> → แท็บแจ้งซ่อม
  const tab: Tab = params.get('invoice')
    ? 'bills'
    : params.get('ticket')
      ? 'repair'
      : (TAB_ALIAS[params.get('tab') ?? ''] ?? 'home')
  const setTab = (v: Tab) => setParams(v === 'home' ? {} : { tab: v })
  // พอร์ทัลใช้ธีมขององค์กรเสมอ (ไม่ใช้ค่าที่ผู้ใช้เลือกเอง)
  useForcedColorTheme(home.data ? (home.data.org.theme ?? 'ink') : undefined)

  if (home.isLoading)
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    )
  if (home.error || !home.data) return <PortalError error={home.error} retry={() => home.refetch()} />

  const d = home.data
  // PDPA: ต้องยอมรับประกาศความเป็นส่วนตัวก่อนเข้าใช้งานครั้งแรก
  if (d.privacy && !d.privacy.consented)
    return <ConsentGate token={token} d={d} langSwitch={<LangSwitch value={i18n.lang} onChange={(l) => setLang.mutate(l)} />} />

  const TABS = tabsFor(i18n, !!d.privacy)
  const current: Tab = tab === 'privacy' && !d.privacy ? 'home' : tab
  const waitingParcels = (d.parcels ?? []).filter((p) => p.status === 'waiting').length
  return (
    <div className="min-h-svh bg-background pb-24 sm:pb-10">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <LogoMark />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-semibold">{d.org.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {d.unit ? t(`ห้อง ${d.unit.name}`, `Room ${d.unit.name}`) : t('ผู้เช่า', 'Tenant')}
              {d.property ? ` · ${d.property.name}` : ''}
            </div>
          </div>
          <LangSwitch value={i18n.lang} onChange={(l) => setLang.mutate(l)} />
          {d.org.phone && (
            <Button
              asChild
              variant="outline"
              size="icon"
              className="size-10 shrink-0"
              aria-label={t('โทรหาผู้ดูแล', 'Call the manager')}
            >
              <a href={`tel:${d.org.phone}`}>
                <Phone />
              </a>
            </Button>
          )}
        </div>
        <nav className="mx-auto hidden max-w-lg gap-0.5 overflow-x-auto px-4 sm:flex" aria-label={t('เมนู', 'Menu')}>
          {TABS.map((x) => (
            <button
              key={x.v}
              onClick={() => setTab(x.v)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm whitespace-nowrap',
                current === x.v ? 'border-primary font-medium' : 'border-transparent text-muted-foreground',
              )}
            >
              <x.icon className="size-4" /> {x.label}
              {x.v === 'parcels' && waitingParcels > 0 && <TabCount n={waitingParcels} />}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4">
        {current === 'home' && (
          <HomeTab
            token={token}
            d={d}
            goBills={() => setTab('bills')}
            goParcels={() => setTab('parcels')}
            payInvoice={(id) => setParams({ tab: 'bills', invoice: String(id), pay: '1' })}
          />
        )}
        {current === 'bills' && <BillsTab token={token} d={d} focusReceipts={params.get('tab') === 'receipts'} />}
        {current === 'parcels' && <ParcelsTab token={token} d={d} />}
        {current === 'repair' && <RepairTab token={token} />}
        {current === 'privacy' && d.privacy && <PrivacyTab token={token} d={d} privacy={d.privacy} />}
      </main>

      <nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-20 grid border-t bg-card pb-[env(safe-area-inset-bottom)] sm:hidden',
          TABS.length === 5 ? 'grid-cols-5' : 'grid-cols-4',
        )}
        aria-label={t('เมนู', 'Menu')}
      >
        {TABS.map((x) => (
          <button
            key={x.v}
            onClick={() => setTab(x.v)}
            className={cn(
              'relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-xs leading-tight',
              current === x.v ? 'font-medium text-primary' : 'text-muted-foreground',
            )}
            aria-current={current === x.v ? 'page' : undefined}
            aria-label={x.label}
          >
            <span className="relative">
              <x.icon className="size-5" />
              {x.v === 'parcels' && waitingParcels > 0 && (
                <span className="absolute -top-1.5 -right-2.5">
                  <TabCount n={waitingParcels} />
                </span>
              )}
            </span>
            <span className="max-w-full truncate">{x.short}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function TabCount({ n }: { n: number }) {
  return (
    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] leading-none font-semibold text-warning-foreground tabular-nums">
      {n}
    </span>
  )
}

function PortalError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n()
  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 401 || error.status === 403)
  return (
    <div className="grid min-h-svh place-items-center bg-background p-6">
      <div className="max-w-sm text-center">
        <LogoMark className="mx-auto size-10 text-lg" />
        <h1 className="mt-5 text-lg font-semibold">
          {notFound ? t('ลิงก์ไม่ถูกต้องหรือหมดอายุ', 'This link is invalid or has expired') : t('เชื่อมต่อไม่สำเร็จ', 'Could not connect')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {notFound
            ? t('กรุณาติดต่อผู้ดูแลหอพัก/อาคารเพื่อขอลิงก์ใหม่', 'Please ask your building manager for a new link')
            : t('ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง', 'Check your internet connection and try again')}
        </p>
        {!notFound && (
          <Button className="mt-5 h-11" onClick={retry}>
            {t('ลองใหม่', 'Try again')}
          </Button>
        )}
      </div>
    </div>
  )
}

function SectionHead({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 pt-2 text-sm font-semibold">
      <Icon className="size-4 text-muted-foreground" />
      {children}
    </h2>
  )
}

function HomeTab({
  token,
  d,
  goBills,
  goParcels,
  payInvoice,
}: {
  token: string
  d: PortalHome
  goBills: () => void
  goParcels: () => void
  payInvoice: (id: number) => void
}) {
  const { t, date, dateLong, period } = useI18n()
  const unpaid = useMemo(
    () => d.invoices.filter((i) => i.status === 'unpaid').sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [d.invoices],
  )
  const due = unpaid.reduce((s, i) => s + Math.max(0, i.total - (i.paid_amount || 0)), 0)
  const oldest = unpaid[0]
  const detail = useQuery({
    queryKey: ['portal', token, 'invoice', oldest?.id],
    queryFn: () => api.portal.invoice(token, oldest!.id),
    enabled: !!oldest,
    ...silent,
  })
  const oldestDue = oldest ? Math.max(0, oldest.total - (oldest.paid_amount || 0)) : 0
  const oldestNotice = oldest ? noticeFor(d, oldest.id) : null
  const anns = [...d.announcements].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at),
  )

  return (
    <>
      <div>
        <p className="text-sm text-muted-foreground">{t('สวัสดี', 'Hello')}</p>
        <h1 className="text-xl font-semibold">{t(`คุณ${d.tenant.full_name}`, d.tenant.full_name)}</h1>
      </div>

      <ContractsHomeCard token={token} d={d} />

      <ParcelsHomeCard d={d} onOpen={goParcels} />

      <PortalLineCard token={token} line={d.line} />

      <Card className={cn('gap-0 overflow-hidden py-0', oldest && oldest.overdue_days > 0 && 'border-warning/50')}>
        <div className="p-5">
          <div className="text-sm text-muted-foreground">{t('ยอดค้างชำระ', 'Amount due')}</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{baht(due)}</div>
          {oldest ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {t(
                `${unpaid.length} บิล · ครบกำหนดเร็วสุด ${date(oldest.due_date)}`,
                `${unpaid.length} bill${unpaid.length === 1 ? '' : 's'} · next due ${date(oldest.due_date)}`,
              )}
              {oldest.overdue_days > 0 && (
                <ToneBadge tone="mustard">
                  {t(`เกินกำหนด ${oldest.overdue_days} วัน`, `${oldest.overdue_days} days overdue`)}
                </ToneBadge>
              )}
            </div>
          ) : (
            <div className="mt-1 text-sm text-success">
              {t('ไม่มียอดค้าง ขอบคุณที่ชำระตรงเวลา', 'Nothing due — thank you for paying on time')}
            </div>
          )}
        </div>
        {oldest && (
          <div className="border-t bg-muted/40 p-5">
            <div className="mb-3 text-center text-sm font-medium">
              {t('สแกนจ่าย', 'Scan to pay')} {oldest.doc_no} · {period(oldest.period)}
            </div>
            {detail.isLoading ? (
              <Skeleton className="mx-auto aspect-square w-56" />
            ) : detail.data?.promptpay_payload ? (
              <PromptPayQR payload={detail.data.promptpay_payload} amount={baht(oldestDue)} className="w-64" />
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                {t('ติดต่อผู้ดูแลเพื่อชำระเงิน', 'Contact the manager to pay')}
              </p>
            )}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t(
                'บันทึกภาพ QR แล้วเปิดในแอปธนาคาร · โอนแล้วแนบสลิปเพื่อแจ้งชำระ',
                'Save the QR image and open it in your banking app · after paying, attach the slip',
              )}
            </p>
            <div className="mt-4 grid gap-2">
              {oldestNotice?.status === 'pending' ? (
                <div className="flex items-center justify-center gap-2 rounded-md border bg-card px-3 py-2.5 text-sm">
                  <ToneBadge tone="ink">{t('รอตรวจสลิป', 'Slip pending')}</ToneBadge>
                  <span className="text-muted-foreground">
                    {t('แจ้งชำระแล้ว รอเจ้าหน้าที่ตรวจสอบ', 'Payment sent, waiting for staff to check')}
                  </span>
                </div>
              ) : (
                <>
                  {oldestNotice?.status === 'rejected' && (
                    <p className="text-center text-sm text-destructive">
                      {t('สลิปที่ส่งไม่ผ่าน', 'Your slip was not accepted')}
                      {oldestNotice.reject_reason ? `: ${oldestNotice.reject_reason}` : ''}
                    </p>
                  )}
                  <Button className="h-12 w-full text-base" onClick={() => payInvoice(oldest.id)}>
                    {oldestNotice?.status === 'rejected'
                      ? t('แนบสลิปใหม่', 'Attach a new slip')
                      : t('แจ้งชำระ / แนบสลิป', 'I have paid / attach slip')}
                  </Button>
                </>
              )}
              <Button variant="outline" className="h-11 w-full" onClick={goBills}>
                {t('ดูบิลทั้งหมด', 'All bills')} <ChevronRight />
              </Button>
            </div>
            {d.line?.linked && oldestNotice?.status !== 'pending' && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <LineIcon className="size-3.5" /> {t('หรือส่งรูปสลิปในแชต LINE ได้เลย', 'Or just send the slip photo in LINE chat')}
              </p>
            )}
          </div>
        )}
      </Card>

      {anns.length > 0 && (
        <>
          <SectionHead icon={Megaphone}>{t('ประกาศ', 'Announcements')}</SectionHead>
          <div className="space-y-3">
            {anns.map((a) => (
              <Card key={a.id} className="gap-1 px-4 py-3">
                <div className="flex items-start gap-2">
                  {a.pinned && <Pin className="mt-1 size-3.5 shrink-0 text-primary" />}
                  <h3 className="flex-1 font-medium">{a.title}</h3>
                  <span className="shrink-0 text-xs text-muted-foreground">{date(a.created_at)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{a.body}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {d.booking && (
        <>
          <SectionHead icon={CalendarDays}>{t('สัญญาเช่า', 'Your lease')}</SectionHead>
          <Card className="gap-0 py-0">
            <dl className="divide-y text-sm">
              <Row
                label={t('ห้อง', 'Room')}
                value={d.unit ? t(`${d.unit.name} · ชั้น ${d.unit.floor}`, `${d.unit.name} · floor ${d.unit.floor}`) : '—'}
              />
              <Row label={t('เริ่ม', 'Start')} value={dateLong(d.booking.start_date)} />
              <Row
                label={t('สิ้นสุด', 'End')}
                value={d.booking.end_date ? dateLong(d.booking.end_date) : t('ไม่กำหนด', 'Open-ended')}
              />
              <Row
                label={d.booking.kind === 'lease' ? t('ค่าเช่า/เดือน', 'Rent / month') : t('ราคา/คืน', 'Rate / night')}
                value={baht(d.booking.price)}
              />
              <Row label={t('เงินประกัน', 'Deposit')} value={baht(d.booking.deposit_amount)} />
            </dl>
          </Card>
        </>
      )}

      <ContractsSection token={token} d={d} />
      {d.property?.address && <p className="px-1 text-xs text-muted-foreground">{d.property.address}</p>}
    </>
  )
}

const categoryLabel = (i: I18n, k: string) => pick(i, ORG_CATEGORIES[k] ?? k, ORG_CATEGORIES_EN, k)

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto text-right font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function BillsTab({ token, d, focusReceipts }: { token: string; d: PortalHome; focusReceipts?: boolean }) {
  const { t, date, period } = useI18n()
  const [params, setParams] = useSearchParams()
  const openId = Number(params.get('invoice')) || null
  const setOpenId = (id: number | null) =>
    setParams(id ? { tab: 'bills', invoice: String(id) } : { tab: 'bills' }, { replace: true })
  const receiptsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusReceipts) receiptsRef.current?.scrollIntoView({ block: 'start' })
  }, [focusReceipts])
  const invoices = [...d.invoices].sort((a, b) => b.due_date.localeCompare(a.due_date))
  const receipts = [...d.receipts].sort((a, b) => b.issue_date.localeCompare(a.issue_date))
  return (
    <>
      <SectionHead icon={FileText}>{t('ใบแจ้งหนี้', 'Invoices')}</SectionHead>
      {!invoices.length ? (
        <Card>
          <EmptyState icon={FileText} title={t('ยังไม่มีใบแจ้งหนี้', 'No invoices yet')} />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {invoices.map((i) => {
              const notice = i.status === 'unpaid' ? noticeFor(d, i.id) : null
              return (
                <li key={i.id}>
                  <button
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                    onClick={() => setOpenId(i.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={cn('font-medium', i.status === 'void' && 'line-through')}>
                        {period(i.period)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {i.doc_no} · {t('ครบ', 'due')} {date(i.due_date)}
                      </div>
                    </div>
                    <div className="grid justify-items-end gap-1 text-right">
                      <div className="font-medium tabular-nums">{baht(i.total)}</div>
                      {notice && notice.status !== 'approved' ? (
                        <NoticeBadge notice={notice} />
                      ) : (
                        <InvoiceStatusBadge status={i.status} overdueDays={i.overdue_days} />
                      )}
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                  {i.status === 'unpaid' && notice?.status !== 'pending' && (
                    <div className="-mt-1 px-4 pb-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 w-full"
                        onClick={() => setParams({ tab: 'bills', invoice: String(i.id), pay: '1' }, { replace: true })}
                      >
                        {notice?.status === 'rejected'
                          ? t('สลิปไม่ผ่าน — แนบสลิปใหม่', 'Slip rejected — attach a new one')
                          : t('แจ้งชำระ / แนบสลิป', 'I have paid / attach slip')}
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <div ref={receiptsRef} className="scroll-mt-4">
        <SectionHead icon={Receipt}>{t('ใบเสร็จรับเงิน', 'Receipts')}</SectionHead>
      </div>
      {!receipts.length ? (
        <Card>
          <EmptyState icon={Receipt} title={t('ยังไม่มีใบเสร็จ', 'No receipts yet')} />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {receipts.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/p/${token}/print/receipt/${r.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className={cn('font-mono text-sm', r.status === 'void' && 'line-through')}>{r.doc_no}</div>
                    <div className="text-xs text-muted-foreground">{date(r.issue_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium tabular-nums">{baht(r.total)}</div>
                    {r.status === 'void' && <ToneBadge tone="grey">{t('ยกเลิก', 'Void')}</ToneBadge>}
                  </div>
                  <Printer className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <PortalInvoiceDialog
        token={token}
        id={openId}
        d={d}
        autoPay={params.get('pay') === '1'}
        onClose={() => setOpenId(null)}
      />
    </>
  )
}

function PortalInvoiceDialog({
  token,
  id,
  d,
  autoPay,
  onClose,
}: {
  token: string
  id: number | null
  d: PortalHome
  autoPay: boolean
  onClose: () => void
}) {
  const { t, dateLong, period } = useI18n()
  const q = useQuery({
    queryKey: ['portal', token, 'invoice', id],
    queryFn: () => api.portal.invoice(token, id!),
    enabled: id != null,
    ...silent,
  })
  const inv = q.data?.invoice
  const remaining = inv ? Math.max(0, inv.total - (q.data?.paid_amount ?? 0)) : 0
  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-md">
        {!inv ? (
          <div className="space-y-3">
            <DialogTitle className="sr-only">{t('ใบแจ้งหนี้', 'Invoice')}</DialogTitle>
            {q.error ? (
              <p className="text-sm text-muted-foreground">{t('โหลดไม่สำเร็จ', 'Could not load')}</p>
            ) : (
              <Skeleton className="h-48" />
            )}
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('ใบแจ้งหนี้', 'Invoice')} {period(inv.period)}
              </DialogTitle>
              <DialogDescription>
                {inv.doc_no} · {t('ครบกำหนด', 'due')} {dateLong(inv.due_date)}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-1.5">
              <InvoiceStatusBadge status={inv.status} overdueDays={inv.overdue_days} />
              {inv.status === 'unpaid' && <NoticeBadge notice={noticeFor(d, inv.id)} />}
            </div>
            <div className="divide-y rounded-md border text-sm">
              {inv.items.map((it, i) => (
                <div key={i} className="flex gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    {it.label}
                    {it.qty !== 1 && (
                      <div className="text-xs text-muted-foreground">
                        {num(it.qty)} × {baht(it.unit_price)}
                      </div>
                    )}
                  </div>
                  <div className="tabular-nums">{baht(it.amount)}</div>
                </div>
              ))}
              {inv.vat_amount > 0 && (
                <div className="flex px-3 py-2 text-muted-foreground">
                  {t('ภาษีมูลค่าเพิ่ม', 'VAT')} <span className="ml-auto tabular-nums">{baht(inv.vat_amount)}</span>
                </div>
              )}
              <div className="flex px-3 py-2.5 font-semibold">
                {t('ยอดรวม', 'Total')} <span className="ml-auto tabular-nums">{baht(inv.total)}</span>
              </div>
            </div>
            {inv.status === 'unpaid' && inv.late_fee > 0 && (
              <p className="text-sm text-warning-foreground">
                {t('มีค่าปรับชำระล่าช้า', 'Late fee')} {baht(inv.late_fee)}
              </p>
            )}
            {inv.status === 'unpaid' && q.data?.promptpay_payload && (
              <PromptPayQR payload={q.data.promptpay_payload} amount={baht(remaining)} className="w-60" />
            )}
            {inv.status === 'unpaid' && (
              <div className="border-t pt-4">
                <PayWithSlip
                  key={inv.id}
                  token={token}
                  invoiceId={inv.id}
                  amountDue={Math.round((remaining + (inv.late_fee || 0)) * 100) / 100}
                  notice={noticeFor(d, inv.id)}
                  lineLinked={!!d.line?.linked}
                  autoStart={autoPay}
                />
              </div>
            )}
            <Button asChild variant="outline" className="h-11">
              <Link to={`/p/${token}/print/invoice/${inv.id}`}>
                <Printer /> {t('ดู / พิมพ์ใบแจ้งหนี้', 'View / print invoice')}
              </Link>
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RepairTab({ token }: { token: string }) {
  const i18n = useI18n()
  const { t } = i18n
  const [creating, setCreating] = useState(false)
  const [params, setParams] = useSearchParams()
  const openId = Number(params.get('ticket')) || null
  const setOpenId = (id: number | null) =>
    setParams(id ? { tab: 'repair', ticket: String(id) } : { tab: 'repair' }, { replace: true })
  const tickets = useQuery({
    queryKey: ['portal', token, 'tickets'],
    queryFn: () => api.portal.tickets(token),
    ...silent,
  })

  if (creating) return <NewRequest token={token} onDone={() => setCreating(false)} />
  if (openId) return <TicketView token={token} id={openId} onBack={() => setOpenId(null)} />

  const list = [...(tickets.data ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return (
    <>
      <Button className="h-12 w-full text-base" onClick={() => setCreating(true)}>
        <Plus /> {t('แจ้งซ่อม / ติดต่อผู้ดูแล', 'Report a problem / contact us')}
      </Button>
      <SectionHead icon={Wrench}>{t('รายการที่แจ้ง', 'Your requests')}</SectionHead>
      {tickets.isLoading ? (
        <Skeleton className="h-32" />
      ) : !list.length ? (
        <Card>
          <EmptyState
            icon={Wrench}
            title={t('ยังไม่มีรายการ', 'No requests yet')}
            description={t(
              'แจ้งปัญหาในห้องพร้อมแนบรูป ผู้ดูแลจะตอบกลับที่นี่',
              'Report a problem with photos — the manager will reply here',
            )}
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {list.map((x) => (
              <li key={x.id}>
                <button
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                  onClick={() => setOpenId(x.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{x.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {categoryLabel(i18n, x.category)} · {i18n.timeAgo(x.updated_at)}
                    </div>
                  </div>
                  <TicketStatusBadge status={x.status} />
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function NewRequest({ token, onDone }: { token: string; onDone: () => void }) {
  const i18n = useI18n()
  const { t } = i18n
  const [category, setCategory] = useState('electric')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const create = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.set('category', category)
      fd.set('title', title.trim())
      fd.set('description', desc.trim())
      for (const f of files) fd.append('photos', f)
      return api.portal.createTicket(token, fd)
    },
    meta: { silent: true },
    onSuccess: async () => {
      toast.success(t('ส่งเรื่องแล้ว ผู้ดูแลจะติดต่อกลับ', 'Sent — the manager will get back to you'))
      await queryClient.invalidateQueries({ queryKey: ['portal', token, 'tickets'] })
      onDone()
    },
    onError: (e) => toast.error((e as Error).message || t('ส่งไม่สำเร็จ', 'Could not send')),
  })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim()) create.mutate()
      }}
    >
      <button type="button" onClick={onDone} className="flex h-10 items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> {t('กลับ', 'Back')}
      </button>
      <h1 className="text-lg font-semibold">{t('แจ้งซ่อม / ติดต่อผู้ดูแล', 'Report a problem / contact us')}</h1>
      <Field label={t('เรื่อง', 'Topic')} htmlFor="pt-cat">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="pt-cat" className="h-11 w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(ORG_CATEGORIES).map((k) => (
              <SelectItem key={k} value={k} className="py-2.5">
                {categoryLabel(i18n, k)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t('หัวข้อ', 'Subject')} htmlFor="pt-title">
        <Input
          id="pt-title"
          className="h-11 bg-card"
          placeholder={t('เช่น แอร์ไม่เย็น น้ำรั่วใต้ซิงก์', 'e.g. air-con not cooling, leak under the sink')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </Field>
      <Field label={t('รายละเอียด', 'Details')} htmlFor="pt-desc">
        <Textarea
          id="pt-desc"
          rows={4}
          className="bg-card"
          placeholder={t(
            'อธิบายอาการ และช่วงเวลาที่สะดวกให้เข้าซ่อม',
            'Describe the problem and when it is convenient for us to come in',
          )}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </Field>
      <Field label={t('รูปภาพ (ถ้ามี)', 'Photos (optional)')}>
        <PhotoPicker files={files} onChange={setFiles} large />
      </Field>
      <Button type="submit" className="h-12 w-full text-base" disabled={!title.trim() || create.isPending}>
        {create.isPending && <Loader2 className="animate-spin" />}
        {t('ส่งเรื่อง', 'Send')}
      </Button>
    </form>
  )
}

function TicketView({ token, id, onBack }: { token: string; id: number; onBack: () => void }) {
  const i18n = useI18n()
  const { t } = i18n
  const q = useQuery({
    queryKey: ['portal', token, 'ticket', id],
    queryFn: () => api.portal.ticket(token, id),
    ...silent,
  })
  const reply = useMutation({
    mutationFn: (fd: FormData) => api.portal.reply(token, id, fd),
    meta: { silent: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portal', token] })
    },
    onError: (e) => toast.error((e as Error).message || t('ส่งไม่สำเร็จ', 'Could not send')),
  })
  const tk = q.data?.ticket
  // ไฟล์แนบต้องแนบโทเคนพอร์ทัลจึงจะเปิดได้
  const messages = useMemo(
    () =>
      (q.data?.messages ?? []).map((m) => ({ ...m, photos: m.photos.map((u) => withUploadAccess(u, { t: token })) })),
    [q.data?.messages, token],
  )
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex h-10 items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> {t('รายการทั้งหมด', 'All requests')}
      </button>
      {!tk ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <div>
            <div className="text-xs text-muted-foreground">
              {categoryLabel(i18n, tk.category)} · {i18n.date(tk.created_at)}
            </div>
            <div className="flex items-start gap-2">
              <h1 className="flex-1 text-lg font-semibold">{tk.title}</h1>
              <TicketStatusBadge status={tk.status} />
            </div>
          </div>
          <Card className="gap-2 px-4 py-3 text-sm">
            <p className="whitespace-pre-wrap">{tk.description || '—'}</p>
            <PhotoGrid photos={tk.photos.map((u) => withUploadAccess(u, { t: token }))} />
          </Card>
          <MessageThread messages={messages} self="tenant" />
          {tk.status !== 'closed' && (
            <ReplyBox onSend={(fd) => reply.mutateAsync(fd)} pending={reply.isPending} large />
          )}
        </>
      )}
    </div>
  )
}

/** การ์ดชวนเชื่อม LINE (แสดงเมื่อองค์กรเปิดใช้ LINE OA) */
function PortalLineCard({ token, line }: { token: string; line: PortalHome['line'] }) {
  const { t } = useI18n()
  const link = useMutation({
    mutationFn: () => api.portal.lineLink(token),
    meta: { silent: true },
    onSuccess: (r) => {
      window.location.href = r.link_url
    },
    onError: (e) => toast.error((e as Error).message || t('สร้างลิงก์เชื่อมบัญชีไม่สำเร็จ', 'Could not create the link')),
  })
  if (!line?.enabled) return null
  if (line.linked)
    return (
      <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-3 text-sm">
        <LineIcon className="size-5" />
        <span className="min-w-0 flex-1 truncate">
          {t('เชื่อม LINE แล้ว', 'LINE connected')}
          {line.display_name ? ` (${line.display_name})` : ''}
        </span>
        <CheckCircle2 className="size-4 shrink-0 text-success" />
      </div>
    )
  const friend = addFriendUrl(line)
  return (
    <Card className="gap-4 px-5 py-5">
      <div className="flex items-start gap-3">
        <LineIcon className="size-9" />
        <div className="min-w-0">
          <h2 className="font-semibold">{t('รับบิลและแจ้งเตือนทาง LINE', 'Get bills and alerts on LINE')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t(
              'ไม่พลาดบิลใหม่ ใบเสร็จ และการตอบเรื่องแจ้งซ่อม — ส่งตรงถึงแชทของคุณ',
              'New bills, receipts and replies to your requests — straight to your chat',
            )}
          </p>
        </div>
      </div>
      <ol className="grid gap-2 text-sm">
        <li className="flex gap-2.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold">1</span>
          <span>
            {t('กด', 'Tap')} <b>{t('แอดเพื่อน', 'Add friend')}</b>{' '}
            {t(`แล้วเพิ่ม ${line.basic_id || 'LINE OA'} เป็นเพื่อน`, `and add ${line.basic_id || 'our LINE OA'}`)}
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold">2</span>
          <span>
            {t('กลับมาที่หน้านี้ กด', 'Come back here, tap')} <b>{t('เชื่อมบัญชี', 'Connect')}</b>{' '}
            {t('แล้วกด “ส่ง” ข้อความในแชท', 'then tap “Send” in the chat')}
          </span>
        </li>
      </ol>
      <div className="grid grid-cols-2 gap-2">
        {friend ? (
          <Button asChild variant="outline" className="h-12">
            <a href={friend} target="_blank" rel="noreferrer">
              1. {t('แอดเพื่อน', 'Add friend')}
            </a>
          </Button>
        ) : (
          <Button variant="outline" className="h-12" disabled>
            1. {t('แอดเพื่อน', 'Add friend')}
          </Button>
        )}
        <Button className="h-12" disabled={link.isPending} onClick={() => link.mutate()}>
          {link.isPending && <Loader2 className="animate-spin" />}
          2. {t('เชื่อมบัญชี', 'Connect')}
        </Button>
      </div>
    </Card>
  )
}

// ===================== PDPA =====================

/** หน้ายอมรับประกาศความเป็นส่วนตัว (เข้าใช้งานครั้งแรก) */
function ConsentGate({ token, d, langSwitch }: { token: string; d: PortalHome; langSwitch?: React.ReactNode }) {
  const { t } = useI18n()
  const privacy = d.privacy!
  const [checked, setChecked] = useState(false)
  const accept = useMutation({
    mutationFn: () => api.portal.consent(token),
    meta: { silent: true },
    onSuccess: ({ consent_at }) => {
      queryClient.setQueryData<PortalHome>(['portal', token], (old) =>
        old?.privacy ? { ...old, privacy: { ...old.privacy, consented: true, consent_at } } : old,
      )
      window.scrollTo({ top: 0 })
    },
    onError: (e) => toast.error((e as Error).message || t('บันทึกไม่สำเร็จ กรุณาลองใหม่', 'Could not save — please try again')),
  })
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <LogoMark />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-semibold">{d.org.name}</div>
            <div className="truncate text-xs text-muted-foreground">{t('พอร์ทัลผู้เช่า', 'Tenant portal')}</div>
          </div>
          {langSwitch}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col p-4">
        <Card className="flex-1 gap-0 py-0 sm:flex-none">
          <div className="space-y-1 border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <h1 className="text-lg font-semibold">{t('ประกาศความเป็นส่วนตัว', 'Privacy notice')}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                `สวัสดีคุณ ${d.tenant.full_name} กรุณาอ่านและยอมรับก่อนเข้าใช้งานพอร์ทัล`,
                `Hello ${d.tenant.full_name}, please read and accept before using the portal`,
              )}
            </p>
          </div>
          <div
            className="max-h-[48svh] min-h-40 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
            tabIndex={0}
            aria-label={t('เนื้อหาประกาศความเป็นส่วนตัว', 'Privacy notice text')}
          >
            <NoticeText text={privacy.notice} />
            {privacy.dpo_contact && (
              <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t('ผู้ติดต่อเรื่องข้อมูลส่วนบุคคล', 'Data protection contact')}: </span>
                {privacy.dpo_contact}
              </p>
            )}
          </div>
          <div className="space-y-4 border-t px-5 py-4">
            <label className="flex items-start gap-3 text-sm leading-relaxed">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => setChecked(v === true)}
                className="mt-0.5 size-5"
              />
              <span>
                {t(
                  `ข้าพเจ้าได้อ่านและเข้าใจประกาศความเป็นส่วนตัว และยินยอมให้ ${d.org.name} เก็บและใช้ข้อมูลส่วนบุคคลของข้าพเจ้าตามที่ระบุไว้`,
                  `I have read and understood the privacy notice and allow ${d.org.name} to collect and use my personal data as described`,
                )}
              </span>
            </label>
            <Button
              className="h-12 w-full text-base"
              disabled={!checked || accept.isPending}
              onClick={() => accept.mutate()}
            >
              {accept.isPending && <Loader2 className="animate-spin" />}
              {t('ยอมรับและเข้าใช้งาน', 'Accept and continue')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t(
                'หากมีข้อสงสัยหรือไม่ประสงค์ให้ความยินยอม กรุณาติดต่อผู้ดูแล',
                'If you have questions or do not wish to consent, please contact the manager',
              )}
              {d.org.phone && (
                <>
                  {' '}
                  <a href={`tel:${d.org.phone}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {d.org.phone}
                  </a>
                </>
              )}
            </p>
          </div>
        </Card>
      </main>
    </div>
  )
}

const KIND_OPTIONS = Object.entries(PRIVACY_KINDS) as [PrivacyRequestKind, (typeof PRIVACY_KINDS)[PrivacyRequestKind]][]

function PrivacyTab({
  token,
  d,
  privacy,
}: {
  token: string
  d: PortalHome
  privacy: NonNullable<PortalHome['privacy']>
}) {
  const { t, dateLong } = useI18n()
  const [showNotice, setShowNotice] = useState(false)
  const download = useMutation({
    mutationFn: () => api.portal.exportData(token),
    meta: { silent: true },
    onSuccess: () => toast.success(t('ดาวน์โหลดข้อมูลแล้ว', 'Downloaded')),
    onError: (e) => toast.error((e as Error).message || t('ดาวน์โหลดไม่สำเร็จ', 'Download failed')),
  })
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">{t('ความเป็นส่วนตัว', 'Privacy')}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t(
            'ข้อมูลส่วนบุคคลของคุณและสิทธิตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล',
            'Your personal data and your rights under the Thai Personal Data Protection Act (PDPA)',
          )}
        </p>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">{t('ให้ความยินยอมแล้ว', 'Consent given')}</div>
            {privacy.consent_at && (
              <div className="text-xs text-muted-foreground">
                {t('เมื่อ', 'on')} {dateLong(privacy.consent_at)}
              </div>
            )}
          </div>
        </div>
        <div className="border-t">
          <button
            type="button"
            className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
            aria-expanded={showNotice}
            onClick={() => setShowNotice((v) => !v)}
          >
            <FileText className="size-4 text-muted-foreground" />
            {t('ประกาศความเป็นส่วนตัว', 'Privacy notice')}
            <ChevronRight className={cn('ml-auto size-4 text-muted-foreground transition-transform', showNotice && 'rotate-90')} />
          </button>
          {showNotice && (
            <div className="max-h-[60svh] overflow-y-auto border-t bg-muted/30 px-4 py-4">
              <NoticeText text={privacy.notice} />
            </div>
          )}
        </div>
      </Card>

      <SectionHead icon={UserRound}>{t('ผู้ติดต่อเรื่องข้อมูลส่วนบุคคล', 'Data protection contact')}</SectionHead>
      <Card className="gap-1 px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap">{privacy.dpo_contact || d.org.name}</p>
        {d.org.phone && (
          <a href={`tel:${d.org.phone}`} className="inline-flex w-fit items-center gap-1.5 text-primary hover:underline">
            <Phone className="size-3.5" /> {d.org.phone}
          </a>
        )}
      </Card>

      <SectionHead icon={Download}>{t('ข้อมูลของฉัน', 'My data')}</SectionHead>
      <Card className="gap-3 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'ดาวน์โหลดข้อมูลส่วนบุคคล สัญญา บิล และใบเสร็จของคุณเป็นไฟล์ JSON',
            'Download your personal data, lease, bills and receipts as a JSON file',
          )}
        </p>
        <Button variant="outline" className="h-11" onClick={() => download.mutate()} disabled={download.isPending}>
          {download.isPending ? <Loader2 className="animate-spin" /> : <Download />}
          {t('ดาวน์โหลดข้อมูลของฉัน', 'Download my data')}
        </Button>
      </Card>

      <SectionHead icon={Send}>{t('ยื่นคำขอใช้สิทธิ์', 'Make a request')}</SectionHead>
      <PrivacyRequestForm token={token} />
    </>
  )
}

function PrivacyRequestForm({ token }: { token: string }) {
  const i18n = useI18n()
  const { t } = i18n
  const kindOf = (k: PrivacyRequestKind) => (i18n.en ? PRIVACY_KINDS_EN[k] : PRIVACY_KINDS[k])
  const [kind, setKind] = useState<PrivacyRequestKind>('access')
  const [note, setNote] = useState('')
  const [sent, setSent] = useState<PrivacyRequestKind | null>(null)
  const submit = useMutation({
    mutationFn: () => api.portal.privacyRequest(token, { kind, note: note.trim() }),
    meta: { silent: true },
    onSuccess: () => {
      setSent(kind)
      setNote('')
    },
    onError: (e) => toast.error((e as Error).message || t('ส่งคำขอไม่สำเร็จ', 'Could not send the request')),
  })

  if (sent)
    return (
      <Card className="items-center gap-3 px-5 py-6 text-center">
        <CheckCircle2 className="size-8 text-success" />
        <div>
          <div className="font-semibold">{t('ส่งคำขอแล้ว', 'Request sent')}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {kindOf(sent).label} —{' '}
            {t('ผู้ดูแลจะพิจารณาและแจ้งผลภายใน 30 วัน', 'the manager will respond within 30 days')}
          </p>
        </div>
        <Button variant="outline" className="h-11" onClick={() => setSent(null)}>
          {t('ส่งคำขออื่น', 'Send another request')}
        </Button>
      </Card>
    )

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit.mutate()
      }}
    >
      <Field label={t('ประเภทคำขอ', 'Request type')} htmlFor="pv-kind" hint={kindOf(kind).hint}>
        <Select value={kind} onValueChange={(v) => setKind(v as PrivacyRequestKind)}>
          <SelectTrigger id="pv-kind" className="h-11 w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map(([k]) => (
              <SelectItem key={k} value={k} className="py-2.5">
                {kindOf(k).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t('รายละเอียด', 'Details')} htmlFor="pv-note">
        <Textarea
          id="pv-note"
          rows={3}
          className="bg-card"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            kind === 'correction'
              ? t('ระบุข้อมูลที่ต้องการแก้ไข และข้อมูลที่ถูกต้อง', 'What should be corrected, and the correct details')
              : t('รายละเอียดเพิ่มเติม (ถ้ามี)', 'More details (optional)')
          }
          required={kind === 'correction'}
        />
      </Field>
      {kind === 'deletion' && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t(
            'ผู้ให้เช่าอาจต้องเก็บใบแจ้งหนี้และใบเสร็จไว้ตามกฎหมายภาษีและบัญชี แม้ข้อมูลส่วนบุคคลอื่นจะถูกลบแล้ว และจะลบไม่ได้ระหว่างที่ยังมีสัญญาเช่าอยู่',
            'The landlord may need to keep invoices and receipts under tax and accounting law even after other personal data is deleted, and data cannot be deleted while a lease is active.',
          )}
        </p>
      )}
      <Button type="submit" className="h-12 w-full text-base" disabled={submit.isPending}>
        {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        {t('ส่งคำขอ', 'Send request')}
      </Button>
    </form>
  )
}
