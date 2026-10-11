// พอร์ทัลผู้เช่า (สาธารณะ ไม่ต้องล็อกอิน) — /p/:token
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  Home,
  Loader2,
  Megaphone,
  Phone,
  Pin,
  Plus,
  Printer,
  Receipt,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { ApiError, api, type PortalHome } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { baht, num, thDate, thDateLong, thPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Field, InvoiceStatusBadge, LogoMark, ToneBadge } from '@/components/common'
import { PromptPayQR } from '@/components/promptpay-qr'
import { ORG_CATEGORIES } from '@/components/tickets/labels'
import { MessageThread, PhotoGrid, PhotoPicker, ReplyBox, TicketStatusBadge } from '@/components/tickets/parts'
import { timeAgo } from '@/lib/docs'
import { addFriendUrl } from '@/lib/line'
import { useForcedColorTheme } from '@/components/theme-provider'
import { LineIcon } from '@/components/line'

type Tab = 'home' | 'bills' | 'repair'
const TABS: { v: Tab; label: string; icon: LucideIcon }[] = [
  { v: 'home', label: 'หน้าหลัก', icon: Home },
  { v: 'bills', label: 'บิล & ใบเสร็จ', icon: FileText },
  { v: 'repair', label: 'แจ้งซ่อม', icon: Wrench },
]

const silent = { meta: { silent: true }, retry: false } as const

/** ค่า ?tab= ที่รองรับ (รวมลิงก์จากข้อความ LINE: receipts, tickets) */
const TAB_ALIAS: Record<string, Tab> = {
  home: 'home',
  bills: 'bills',
  receipts: 'bills',
  repair: 'repair',
  tickets: 'repair',
}

export default function PortalPage() {
  const { token = '' } = useParams()
  const [params, setParams] = useSearchParams()
  // deep link: ?invoice=<id> → แท็บบิล, ?ticket=<id> → แท็บแจ้งซ่อม
  const tab: Tab = params.get('invoice')
    ? 'bills'
    : params.get('ticket')
      ? 'repair'
      : (TAB_ALIAS[params.get('tab') ?? ''] ?? 'home')
  const setTab = (t: Tab) => setParams(t === 'home' ? {} : { tab: t })
  const home = useQuery({
    queryKey: ['portal', token],
    queryFn: () => api.portal.home(token),
    ...silent,
    // กลับมาจากแอป LINE หลังเชื่อมบัญชี → โหลดสถานะใหม่
    refetchOnWindowFocus: true,
  })
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
  return (
    <div className="min-h-svh bg-background pb-24 sm:pb-10">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <LogoMark />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-semibold">{d.org.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {d.unit ? `ห้อง ${d.unit.name}` : 'ผู้เช่า'}
              {d.property ? ` · ${d.property.name}` : ''}
            </div>
          </div>
          {d.org.phone && (
            <Button asChild variant="outline" size="icon" className="size-10" aria-label="โทรหาผู้ดูแล">
              <a href={`tel:${d.org.phone}`}>
                <Phone />
              </a>
            </Button>
          )}
        </div>
        <nav className="mx-auto hidden max-w-lg gap-1 px-4 sm:flex" aria-label="เมนู">
          {TABS.map((t) => (
            <button
              key={t.v}
              onClick={() => setTab(t.v)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm',
                tab === t.v ? 'border-primary font-medium' : 'border-transparent text-muted-foreground',
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4">
        {tab === 'home' && <HomeTab token={token} d={d} goBills={() => setTab('bills')} />}
        {tab === 'bills' && <BillsTab token={token} d={d} focusReceipts={params.get('tab') === 'receipts'} />}
        {tab === 'repair' && <RepairTab token={token} />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="เมนู"
      >
        {TABS.map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={cn(
              'flex h-16 flex-col items-center justify-center gap-1 text-xs',
              tab === t.v ? 'font-medium text-primary' : 'text-muted-foreground',
            )}
            aria-current={tab === t.v ? 'page' : undefined}
          >
            <t.icon className="size-5" />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function PortalError({ error, retry }: { error: unknown; retry: () => void }) {
  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 401 || error.status === 403)
  return (
    <div className="grid min-h-svh place-items-center bg-background p-6">
      <div className="max-w-sm text-center">
        <LogoMark className="mx-auto size-10 text-lg" />
        <h1 className="mt-5 text-lg font-semibold">
          {notFound ? 'ลิงก์ไม่ถูกต้องหรือหมดอายุ' : 'เชื่อมต่อไม่สำเร็จ'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {notFound
            ? 'กรุณาติดต่อผู้ดูแลหอพัก/อาคารเพื่อขอลิงก์ใหม่'
            : 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง'}
        </p>
        {!notFound && (
          <Button className="mt-5 h-11" onClick={retry}>
            ลองใหม่
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

function HomeTab({ token, d, goBills }: { token: string; d: PortalHome; goBills: () => void }) {
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
  const anns = [...d.announcements].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at),
  )

  return (
    <>
      <div>
        <p className="text-sm text-muted-foreground">สวัสดี</p>
        <h1 className="text-xl font-semibold">คุณ{d.tenant.full_name}</h1>
      </div>

      <PortalLineCard token={token} line={d.line} />

      <Card className={cn('gap-0 overflow-hidden py-0', oldest && oldest.overdue_days > 0 && 'border-warning/50')}>
        <div className="p-5">
          <div className="text-sm text-muted-foreground">ยอดค้างชำระ</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{baht(due)}</div>
          {oldest ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {unpaid.length} บิล · ครบกำหนดเร็วสุด {thDate(oldest.due_date)}
              {oldest.overdue_days > 0 && <ToneBadge tone="mustard">เกินกำหนด {oldest.overdue_days} วัน</ToneBadge>}
            </div>
          ) : (
            <div className="mt-1 text-sm text-success">ไม่มียอดค้าง ขอบคุณที่ชำระตรงเวลา</div>
          )}
        </div>
        {oldest && (
          <div className="border-t bg-muted/40 p-5">
            <div className="mb-3 text-center text-sm font-medium">
              สแกนจ่าย {oldest.doc_no} · {thPeriod(oldest.period)}
            </div>
            {detail.isLoading ? (
              <Skeleton className="mx-auto aspect-square w-56" />
            ) : detail.data?.promptpay_payload ? (
              <PromptPayQR payload={detail.data.promptpay_payload} amount={baht(oldestDue)} className="w-64" />
            ) : (
              <p className="text-center text-sm text-muted-foreground">ติดต่อผู้ดูแลเพื่อชำระเงิน</p>
            )}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              บันทึกภาพ QR แล้วเปิดในแอปธนาคาร · โอนแล้วส่งสลิปให้ผู้ดูแล
            </p>
            <Button variant="outline" className="mt-4 h-11 w-full" onClick={goBills}>
              ดูบิลทั้งหมด <ChevronRight />
            </Button>
          </div>
        )}
      </Card>

      {anns.length > 0 && (
        <>
          <SectionHead icon={Megaphone}>ประกาศ</SectionHead>
          <div className="space-y-3">
            {anns.map((a) => (
              <Card key={a.id} className="gap-1 px-4 py-3">
                <div className="flex items-start gap-2">
                  {a.pinned && <Pin className="mt-1 size-3.5 shrink-0 text-primary" />}
                  <h3 className="flex-1 font-medium">{a.title}</h3>
                  <span className="shrink-0 text-xs text-muted-foreground">{thDate(a.created_at)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{a.body}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {d.booking && (
        <>
          <SectionHead icon={CalendarDays}>สัญญาเช่า</SectionHead>
          <Card className="gap-0 py-0">
            <dl className="divide-y text-sm">
              <Row label="ห้อง" value={d.unit ? `${d.unit.name} · ชั้น ${d.unit.floor}` : '—'} />
              <Row label="เริ่ม" value={thDateLong(d.booking.start_date)} />
              <Row label="สิ้นสุด" value={d.booking.end_date ? thDateLong(d.booking.end_date) : 'ไม่กำหนด'} />
              <Row
                label={d.booking.kind === 'lease' ? 'ค่าเช่า/เดือน' : 'ราคา/คืน'}
                value={baht(d.booking.price)}
              />
              <Row label="เงินประกัน" value={baht(d.booking.deposit_amount)} />
            </dl>
          </Card>
        </>
      )}
      {d.property?.address && <p className="px-1 text-xs text-muted-foreground">{d.property.address}</p>}
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto text-right font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function BillsTab({ token, d, focusReceipts }: { token: string; d: PortalHome; focusReceipts?: boolean }) {
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
      <SectionHead icon={FileText}>ใบแจ้งหนี้</SectionHead>
      {!invoices.length ? (
        <Card>
          <EmptyState icon={FileText} title="ยังไม่มีใบแจ้งหนี้" />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {invoices.map((i) => (
              <li key={i.id}>
                <button
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                  onClick={() => setOpenId(i.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className={cn('font-medium', i.status === 'void' && 'line-through')}>
                      {thPeriod(i.period)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.doc_no} · ครบ {thDate(i.due_date)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium tabular-nums">{baht(i.total)}</div>
                    <InvoiceStatusBadge status={i.status} overdueDays={i.overdue_days} />
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div ref={receiptsRef} className="scroll-mt-4">
        <SectionHead icon={Receipt}>ใบเสร็จรับเงิน</SectionHead>
      </div>
      {!receipts.length ? (
        <Card>
          <EmptyState icon={Receipt} title="ยังไม่มีใบเสร็จ" />
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
                    <div className="text-xs text-muted-foreground">{thDate(r.issue_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium tabular-nums">{baht(r.total)}</div>
                    {r.status === 'void' && <ToneBadge tone="grey">ยกเลิก</ToneBadge>}
                  </div>
                  <Printer className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <PortalInvoiceDialog token={token} id={openId} onClose={() => setOpenId(null)} />
    </>
  )
}

function PortalInvoiceDialog({ token, id, onClose }: { token: string; id: number | null; onClose: () => void }) {
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
            <DialogTitle className="sr-only">ใบแจ้งหนี้</DialogTitle>
            {q.error ? <p className="text-sm text-muted-foreground">โหลดไม่สำเร็จ</p> : <Skeleton className="h-48" />}
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>ใบแจ้งหนี้ {thPeriod(inv.period)}</DialogTitle>
              <DialogDescription>
                {inv.doc_no} · ครบกำหนด {thDateLong(inv.due_date)}
              </DialogDescription>
            </DialogHeader>
            <div className="flex">
              <InvoiceStatusBadge status={inv.status} overdueDays={inv.overdue_days} />
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
                  ภาษีมูลค่าเพิ่ม <span className="ml-auto tabular-nums">{baht(inv.vat_amount)}</span>
                </div>
              )}
              <div className="flex px-3 py-2.5 font-semibold">
                ยอดรวม <span className="ml-auto tabular-nums">{baht(inv.total)}</span>
              </div>
            </div>
            {inv.status === 'unpaid' && inv.late_fee > 0 && (
              <p className="text-sm text-warning-foreground">มีค่าปรับชำระล่าช้า {baht(inv.late_fee)}</p>
            )}
            {inv.status === 'unpaid' && q.data?.promptpay_payload && (
              <PromptPayQR payload={q.data.promptpay_payload} amount={baht(remaining)} className="w-60" />
            )}
            <Button asChild variant="outline" className="h-11">
              <Link to={`/p/${token}/print/invoice/${inv.id}`}>
                <Printer /> ดู / พิมพ์ใบแจ้งหนี้
              </Link>
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RepairTab({ token }: { token: string }) {
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
        <Plus /> แจ้งซ่อม / ติดต่อผู้ดูแล
      </Button>
      <SectionHead icon={Wrench}>รายการที่แจ้ง</SectionHead>
      {tickets.isLoading ? (
        <Skeleton className="h-32" />
      ) : !list.length ? (
        <Card>
          <EmptyState icon={Wrench} title="ยังไม่มีรายการ" description="แจ้งปัญหาในห้องพร้อมแนบรูป ผู้ดูแลจะตอบกลับที่นี่" />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                  onClick={() => setOpenId(t.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {ORG_CATEGORIES[t.category] ?? t.category} · {timeAgo(t.updated_at)}
                    </div>
                  </div>
                  <TicketStatusBadge status={t.status} />
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
      toast.success('ส่งเรื่องแล้ว ผู้ดูแลจะติดต่อกลับ')
      await queryClient.invalidateQueries({ queryKey: ['portal', token, 'tickets'] })
      onDone()
    },
    onError: (e) => toast.error((e as Error).message || 'ส่งไม่สำเร็จ'),
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
        <ArrowLeft className="size-4" /> กลับ
      </button>
      <h1 className="text-lg font-semibold">แจ้งซ่อม / ติดต่อผู้ดูแล</h1>
      <Field label="เรื่อง" htmlFor="pt-cat">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="pt-cat" className="h-11 w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ORG_CATEGORIES).map(([k, v]) => (
              <SelectItem key={k} value={k} className="py-2.5">
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="หัวข้อ" htmlFor="pt-title">
        <Input
          id="pt-title"
          className="h-11 bg-card"
          placeholder="เช่น แอร์ไม่เย็น น้ำรั่วใต้ซิงก์"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </Field>
      <Field label="รายละเอียด" htmlFor="pt-desc">
        <Textarea
          id="pt-desc"
          rows={4}
          className="bg-card"
          placeholder="อธิบายอาการ และช่วงเวลาที่สะดวกให้เข้าซ่อม"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </Field>
      <Field label="รูปภาพ (ถ้ามี)">
        <PhotoPicker files={files} onChange={setFiles} large />
      </Field>
      <Button type="submit" className="h-12 w-full text-base" disabled={!title.trim() || create.isPending}>
        {create.isPending && <Loader2 className="animate-spin" />}
        ส่งเรื่อง
      </Button>
    </form>
  )
}

function TicketView({ token, id, onBack }: { token: string; id: number; onBack: () => void }) {
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
    onError: (e) => toast.error((e as Error).message || 'ส่งไม่สำเร็จ'),
  })
  const t = q.data?.ticket
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex h-10 items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> รายการทั้งหมด
      </button>
      {!t ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <div>
            <div className="text-xs text-muted-foreground">
              {ORG_CATEGORIES[t.category] ?? t.category} · {thDate(t.created_at)}
            </div>
            <div className="flex items-start gap-2">
              <h1 className="flex-1 text-lg font-semibold">{t.title}</h1>
              <TicketStatusBadge status={t.status} />
            </div>
          </div>
          <Card className="gap-2 px-4 py-3 text-sm">
            <p className="whitespace-pre-wrap">{t.description || '—'}</p>
            <PhotoGrid photos={t.photos} />
          </Card>
          <MessageThread messages={q.data?.messages ?? []} self="tenant" />
          {t.status !== 'closed' && (
            <ReplyBox onSend={(fd) => reply.mutateAsync(fd)} pending={reply.isPending} large />
          )}
        </>
      )}
    </div>
  )
}

/** การ์ดชวนเชื่อม LINE (แสดงเมื่อองค์กรเปิดใช้ LINE OA) */
function PortalLineCard({ token, line }: { token: string; line: PortalHome['line'] }) {
  const link = useMutation({
    mutationFn: () => api.portal.lineLink(token),
    meta: { silent: true },
    onSuccess: (r) => {
      window.location.href = r.link_url
    },
    onError: (e) => toast.error((e as Error).message || 'สร้างลิงก์เชื่อมบัญชีไม่สำเร็จ'),
  })
  if (!line?.enabled) return null
  if (line.linked)
    return (
      <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-3 text-sm">
        <LineIcon className="size-5" />
        <span className="min-w-0 flex-1 truncate">
          เชื่อม LINE แล้ว{line.display_name ? ` (${line.display_name})` : ''}
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
          <h2 className="font-semibold">รับบิลและแจ้งเตือนทาง LINE</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            ไม่พลาดบิลใหม่ ใบเสร็จ และการตอบเรื่องแจ้งซ่อม — ส่งตรงถึงแชทของคุณ
          </p>
        </div>
      </div>
      <ol className="grid gap-2 text-sm">
        <li className="flex gap-2.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold">1</span>
          <span>
            กด <b>แอดเพื่อน</b> แล้วเพิ่ม {line.basic_id || 'LINE OA'} เป็นเพื่อน
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold">2</span>
          <span>
            กลับมาที่หน้านี้ กด <b>เชื่อมบัญชี</b> แล้วกด “ส่ง” ข้อความในแชท
          </span>
        </li>
      </ol>
      <div className="grid grid-cols-2 gap-2">
        {friend ? (
          <Button asChild variant="outline" className="h-12">
            <a href={friend} target="_blank" rel="noreferrer">
              1. แอดเพื่อน
            </a>
          </Button>
        ) : (
          <Button variant="outline" className="h-12" disabled>
            1. แอดเพื่อน
          </Button>
        )}
        <Button className="h-12" disabled={link.isPending} onClick={() => link.mutate()}>
          {link.isPending && <Loader2 className="animate-spin" />}
          2. เชื่อมบัญชี
        </Button>
      </div>
    </Card>
  )
}
