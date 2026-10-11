import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Ban,
  Check,
  CircleDollarSign,
  Clock,
  ExternalLink,
  FilePlus2,
  FileText,
  ImageOff,
  Inbox,
  KeyRound,
  Loader2,
  Printer,
  ReceiptText,
  Save,
  ScanLine,
  Settings2,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  api,
  type BillingCycle,
  type PlatformSettings,
  type PlatformSlipSettings,
  type SubInvoiceStatus,
} from '@/lib/api'
import { CYCLE_LABEL, SUB_KIND, SUB_STATUS, sqlUtc, subPrintHref } from '@/lib/billing'
import { dateTime } from '@/lib/docs'
import { invalidate } from '@/lib/query'
import { baht, branchLabel, thDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Field, StatCard, StatCardSkeleton } from '@/components/common'
import { ReasonDialog } from '@/components/reason-dialog'
import { SlipCheck, SubStatusBadge, SumRow } from '@/components/billing'
import { SubInvoiceTable } from '@/pages/billing/history'

type Filter = SubInvoiceStatus | 'all'
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'review', label: 'รอตรวจสลิป' },
  { v: 'pending', label: SUB_STATUS.pending.label },
  { v: 'paid', label: SUB_STATUS.paid.label },
  { v: 'void', label: SUB_STATUS.void.label },
  { v: 'all', label: 'ทั้งหมด' },
]
const ALL_ORGS = 'all'

export default function AdminBilling() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'settings' ? 'settings' : 'invoices'
  const [issueOpen, setIssueOpen] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">ค่าบริการ & การชำระเงิน</h1>
          <p className="text-sm text-muted-foreground">ตรวจสลิป ยืนยันการชำระ และออกใบแจ้งหนี้ค่าแพ็กเกจให้ลูกค้า</p>
        </div>
        <Button className="ml-auto" onClick={() => setIssueOpen(true)}>
          <FilePlus2 /> ออกใบแจ้งหนี้
        </Button>
      </div>
      <div className="border-b">
        <Tabs value={tab} onValueChange={(v) => setParams(v === 'settings' ? { tab: v } : {}, { replace: true })}>
          <TabsList variant="line" className="h-10">
            <TabsTrigger value="invoices" className="flex-none px-3">
              <FileText /> ใบแจ้งหนี้
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-none px-3">
              <Settings2 /> ตั้งค่าผู้ให้บริการ
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === 'invoices' ? <InvoicesTab onOpen={setOpenId} /> : <SettingsTab />}
      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} onIssued={setOpenId} />
      <ReviewDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

// ===================== ใบแจ้งหนี้ =====================

function InvoicesTab({ onOpen }: { onOpen: (id: number) => void }) {
  const [status, setStatus] = useState<Filter>('review')
  const [orgId, setOrgId] = useState(ALL_ORGS)
  const filter = { status: status === 'all' ? ('' as const) : status, org_id: orgId === ALL_ORGS ? ('' as const) : Number(orgId) }
  const q = useQuery({ queryKey: ['admin', 'billing', filter], queryFn: () => api.admin.billing(filter) })
  const orgs = useQuery({ queryKey: ['admin', 'orgs'], queryFn: api.admin.orgs })
  const s = q.data?.summary

  return (
    <div className="space-y-5">
      {!s ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="รอตรวจสลิป" icon={Inbox} tone={s.review ? 'warning' : 'default'} value={s.review.toLocaleString('th-TH')} compact />
          <StatCard
            label="รอชำระ"
            icon={Clock}
            value={s.pending.toLocaleString('th-TH')}
            sub={s.overdue > 0 ? <span className="text-destructive">เกินกำหนด {s.overdue} ใบ</span> : 'ไม่มีใบเกินกำหนด'}
            compact
          />
          <StatCard label="รายรับเดือนนี้" icon={CircleDollarSign} tone="success" value={baht(s.revenue_month)} compact />
          <StatCard label="รายรับปีนี้" icon={TrendingUp} value={baht(s.revenue_year)} compact />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1" role="tablist" aria-label="สถานะใบแจ้งหนี้">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              role="tab"
              aria-selected={status === f.v}
              onClick={() => setStatus(f.v)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors',
                status === f.v ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {f.label}
              {f.v === 'review' && !!s?.review && <span className="tabular-nums opacity-70">{s.review}</span>}
              {f.v === 'pending' && !!s?.pending && <span className="tabular-nums opacity-70">{s.pending}</span>}
            </button>
          ))}
        </div>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger size="sm" className="w-full bg-card sm:ml-auto sm:w-60" aria-label="กรององค์กร">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ORGS}>ทุกองค์กร</SelectItem>
            {orgs.data?.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden py-0">
        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !q.data?.invoices.length ? (
          <EmptyState
            icon={status === 'review' ? Check : FileText}
            title={status === 'review' ? 'ไม่มีสลิปรอตรวจ' : 'ไม่มีใบแจ้งหนี้'}
            description={status === 'review' ? 'สลิปที่ลูกค้าแนบจะแสดงที่นี่' : undefined}
          />
        ) : (
          <SubInvoiceTable invoices={q.data.invoices} admin showOrg onOpen={(i) => onOpen(i.id)} />
        )}
      </Card>
    </div>
  )
}

// ===================== ตรวจสลิป / ยืนยัน =====================

function ReviewDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-4xl">
        {id != null && <ReviewBody key={id} id={id} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ReviewBody({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ['admin', 'billing-invoice', id], queryFn: () => api.admin.billingInvoice(id) })
  const [ref, setRef] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const done = async (msg: string) => {
    toast.success(msg)
    await invalidate('admin')
  }
  const approve = useMutation({
    mutationFn: () => api.admin.approveInvoice(id, (ref ?? inv?.payment_ref ?? '').trim()),
    onSuccess: async (r) => {
      await done(`ยืนยันการชำระแล้ว — ออกใบเสร็จ ${r.invoice.receipt_no} · ใช้งานถึง ${thDateLong(r.invoice.period_end)}`)
      onClose()
    },
  })
  const reject = useMutation({
    mutationFn: (reason: string) => api.admin.rejectInvoice(id, reason),
    onSuccess: async () => {
      setRejecting(false)
      await done('ตีกลับสลิปแล้ว — ลูกค้าจะเห็นเหตุผลและแนบใหม่ได้')
      onClose()
    },
  })
  const voidIt = useMutation({
    mutationFn: (reason: string) => api.admin.voidInvoice(id, reason),
    onSuccess: async () => {
      setVoiding(false)
      await done('ยกเลิกใบแจ้งหนี้แล้ว')
      onClose()
    },
  })

  const inv = q.data?.invoice
  if (!inv)
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <DialogTitle className="sr-only">กำลังโหลด</DialogTitle>
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    )
  const open = inv.status === 'pending' || inv.status === 'review'
  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {inv.org_name}
          <SubStatusBadge invoice={inv} />
        </DialogTitle>
        <DialogDescription>
          <span className="font-mono">{inv.doc_no}</span> · {SUB_KIND[inv.kind]} · ออกเมื่อ {dateTime(sqlUtc(inv.created_at))}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* สลิป */}
        <div className="space-y-2">
          {inv.slip_url ? (
            <a
              href={inv.slip_url}
              target="_blank"
              rel="noreferrer"
              className="group relative block overflow-hidden rounded-md border bg-muted"
              title="เปิดรูปเต็ม"
            >
              <img src={inv.slip_url} alt={`สลิป ${inv.doc_no}`} className="max-h-[60svh] w-full object-contain" />
              <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-sm bg-background/80 opacity-0 transition-opacity group-hover:opacity-100">
                <ExternalLink className="size-3.5" />
              </span>
            </a>
          ) : (
            <div className="grid h-64 place-items-center rounded-md border border-dashed bg-muted/40 text-sm text-muted-foreground">
              <div className="grid place-items-center gap-2">
                <ImageOff className="size-6" />
                ลูกค้ายังไม่ได้แนบสลิป
              </div>
            </div>
          )}
          {inv.slip_at && (
            <p className="text-xs text-muted-foreground">แนบเมื่อ {dateTime(sqlUtc(inv.slip_at))}</p>
          )}
          <SlipCheck invoice={inv} withMessage />
        </div>

        {/* รายละเอียด */}
        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground">ยอดที่ต้องได้รับ</div>
            <div className="text-3xl font-bold tracking-tight tabular-nums">{baht(inv.total)}</div>
            <div className="mt-3 space-y-1.5">
              <SumRow label={`${inv.package_name} · ${CYCLE_LABEL[inv.cycle]}`} value={baht(inv.price)} muted />
              {inv.credit > 0 && <SumRow label="ส่วนลดจากแพ็กเกจเดิม" value={`−${baht(inv.credit)}`} muted />}
              {inv.vat_amount > 0 && (
                <>
                  <SumRow label="มูลค่าก่อนภาษี" value={baht(inv.subtotal)} muted />
                  <SumRow label={`VAT ${inv.issuer.vat_rate}%`} value={baht(inv.vat_amount)} muted />
                </>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">รอบบริการ</dt>
            <dd>
              {thDateLong(inv.period_start)} – {thDateLong(inv.period_end)}
            </dd>
            <dt className="text-muted-foreground">ครบกำหนด</dt>
            <dd>{thDateLong(inv.due_date)}</dd>
            <dt className="text-muted-foreground">ผู้ชำระ</dt>
            <dd>
              {inv.payer.name || inv.org_name}
              {inv.payer.tax_id && (
                <div className="text-xs text-muted-foreground tabular-nums">
                  {inv.payer.tax_id} {branchLabel(inv.payer.branch_code)}
                </div>
              )}
            </dd>
            {inv.paid_at && (
              <>
                <dt className="text-muted-foreground">ชำระเมื่อ</dt>
                <dd>
                  {dateTime(sqlUtc(inv.paid_at))} · <span className="font-mono text-xs">{inv.receipt_no}</span>
                </dd>
              </>
            )}
            {inv.void_reason && (
              <>
                <dt className="text-muted-foreground">เหตุผลยกเลิก</dt>
                <dd>{inv.void_reason}</dd>
              </>
            )}
          </dl>
          {inv.reject_reason && inv.status === 'pending' && (
            <p className="rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">
              ตีกลับครั้งก่อน: {inv.reject_reason}
            </p>
          )}
          {open ? (
            <Field
              label="เลขอ้างอิงการชำระ (ถ้ามี)"
              htmlFor="rv-ref"
              hint={inv.payment_ref ? 'ลูกค้ากรอกมาให้แล้ว — แก้ได้' : 'พิมพ์บนใบเสร็จ'}
            >
              <Input
                id="rv-ref"
                value={ref ?? inv.payment_ref ?? ''}
                onChange={(e) => setRef(e.target.value)}
                placeholder="เช่น เลขที่รายการธนาคาร"
              />
            </Field>
          ) : (
            inv.payment_ref && (
              <p className="text-xs text-muted-foreground">
                อ้างอิงการชำระ <span className="font-mono">{inv.payment_ref}</span>
              </p>
            )
          )}
          {inv.status === 'pending' && !inv.slip_url && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
              ยังไม่มีสลิป — ยืนยันได้เมื่อตรวจพบเงินเข้าบัญชีแล้วเท่านั้น
            </p>
          )}
        </div>
      </div>

      <DialogFooter className="flex-wrap gap-2 sm:justify-between">
        <div className="flex flex-wrap gap-1">
          <Button asChild variant="ghost" size="sm">
            <a href={subPrintHref(inv.id, 'invoice', true)} target="_blank" rel="noreferrer">
              <Printer /> ใบแจ้งหนี้
            </a>
          </Button>
          {inv.status === 'paid' && (
            <Button asChild variant="ghost" size="sm">
              <a href={subPrintHref(inv.id, 'receipt', true)} target="_blank" rel="noreferrer">
                <ReceiptText /> ใบเสร็จ
              </a>
            </Button>
          )}
          {open && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setVoiding(true)}>
              <Ban /> ยกเลิกใบ
            </Button>
          )}
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {inv.status === 'review' && (
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setRejecting(true)}>
                <X /> ตีกลับสลิป
              </Button>
            )}
            <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
              {approve.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              ยืนยันการชำระ
            </Button>
          </div>
        )}
      </DialogFooter>

      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="ตีกลับสลิปนี้?"
        description="ใบแจ้งหนี้จะกลับเป็น “รอชำระ” และลูกค้าจะเห็นเหตุผลนี้เพื่อแนบสลิปใหม่"
        confirmText="ตีกลับสลิป"
        pending={reject.isPending}
        onConfirm={(r) => reject.mutate(r)}
      />
      <ReasonDialog
        open={voiding}
        onOpenChange={setVoiding}
        title={`ยกเลิกใบแจ้งหนี้ ${inv.doc_no}?`}
        description="ใช้เมื่อออกใบผิดหรือลูกค้าไม่ต้องการต่ออายุ — ไม่กระทบวันหมดอายุปัจจุบันขององค์กร"
        confirmText="ยกเลิกใบแจ้งหนี้"
        pending={voidIt.isPending}
        onConfirm={(r) => voidIt.mutate(r)}
      />
    </div>
  )
}

// ===================== ออกใบแจ้งหนี้ =====================

function IssueDialog({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onIssued: (id: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && <IssueForm onOpenChange={onOpenChange} onIssued={onIssued} />}</DialogContent>
    </Dialog>
  )
}

function IssueForm({ onOpenChange, onIssued }: { onOpenChange: (o: boolean) => void; onIssued: (id: number) => void }) {
  const orgs = useQuery({ queryKey: ['admin', 'orgs'], queryFn: api.admin.orgs })
  const packages = useQuery({ queryKey: ['admin', 'packages'], queryFn: api.admin.packages })
  const settings = useQuery({ queryKey: ['admin', 'billing', 'settings'], queryFn: () => api.admin.billing({ status: 'review' }) })
  const [orgId, setOrgId] = useState('')
  const [pkgId, setPkgId] = useState('')
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const org = orgs.data?.find((o) => String(o.id) === orgId)
  const pkg = packages.data?.find((p) => String(p.id) === pkgId)
  const months = settings.data?.settings.yearly_months ?? 10
  const price = pkg ? (cycle === 'yearly' ? pkg.price_yearly || pkg.price_monthly * months : pkg.price_monthly) : 0

  const issue = useMutation({
    mutationFn: () => api.admin.issueInvoice({ org_id: Number(orgId), package_id: Number(pkgId), cycle }),
    onSuccess: async (r) => {
      toast.success(`ออกใบแจ้งหนี้ ${r.invoice.doc_no} ให้ ${r.invoice.org_name} แล้ว`)
      await invalidate('admin')
      onOpenChange(false)
      onIssued(r.invoice.id)
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!orgId || !pkgId) return toast.error('เลือกองค์กรและแพ็กเกจก่อน')
        issue.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>ออกใบแจ้งหนี้ค่าบริการ</DialogTitle>
        <DialogDescription>
          แพ็กเกจและรอบเดิม = ต่ออายุต่อจากวันหมดอายุ · อื่นๆ = เปลี่ยนแพ็กเกจ เริ่มวันที่ยืนยันชำระ พร้อมส่วนลดวันที่เหลือ
        </DialogDescription>
      </DialogHeader>
      <Field label="องค์กร" htmlFor="is-org">
        <Select
          value={orgId}
          onValueChange={(v) => {
            setOrgId(v)
            const o = orgs.data?.find((x) => String(x.id) === v)
            if (o) setPkgId(String(o.package_id))
          }}
        >
          <SelectTrigger id="is-org" className="w-full">
            <SelectValue placeholder="เลือกองค์กร" />
          </SelectTrigger>
          <SelectContent>
            {orgs.data?.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.name} <span className="text-muted-foreground">· {o.package_name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="แพ็กเกจ" htmlFor="is-pkg">
          <Select value={pkgId} onValueChange={setPkgId}>
            <SelectTrigger id="is-pkg" className="w-full">
              <SelectValue placeholder="เลือกแพ็กเกจ" />
            </SelectTrigger>
            <SelectContent>
              {packages.data
                ?.filter((p) => p.price_monthly > 0 && (p.is_active || String(p.id) === pkgId))
                .map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} <span className="text-muted-foreground">· {baht(p.price_monthly)}/เดือน</span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="รอบ" htmlFor="is-cycle">
          <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
            <SelectTrigger id="is-cycle" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">{CYCLE_LABEL.monthly}</SelectItem>
              <SelectItem value="yearly">{CYCLE_LABEL.yearly}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {pkg && (
        <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
          <SumRow label="ราคาแพ็กเกจ (รวม VAT)" value={baht(price)} strong />
          <p className="text-xs text-muted-foreground">
            ยอดจริงอาจลดลงจากส่วนลดวันที่เหลือของแพ็กเกจเดิม
            {org && org.package_id === pkg.id ? ' (ถ้าเป็นการเปลี่ยนรอบบิล)' : ''}
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">ใบที่ยังรอชำระขององค์กรนี้จะถูกยกเลิกและแทนที่ด้วยใบใหม่</p>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={issue.isPending || !orgId || !pkgId}>
          {issue.isPending ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
          ออกใบแจ้งหนี้
        </Button>
      </DialogFooter>
    </form>
  )
}

// ===================== ตั้งค่าผู้ให้บริการ =====================

function SettingsTab() {
  const q = useQuery({ queryKey: ['admin', 'billing', 'settings'], queryFn: () => api.admin.billing({ status: 'review' }) })
  if (!q.data)
    return (
      <div className="grid max-w-3xl gap-6">
        <Skeleton className="h-96 rounded-lg" />
      </div>
    )
  return (
    <div className="grid max-w-3xl gap-6">
      <PlatformForm initial={q.data.settings} />
      {q.data.slip && <SlipForm initial={q.data.slip} />}
    </div>
  )
}

const digitsOf = (v: string) => v.replace(/\D/g, '')

/** รูปแบบพร้อมเพย์ที่เซิร์ฟเวอร์รับ: มือถือ 10 หลัก (ขึ้นต้น 0), บัตร/ผู้เสียภาษี 13 หลัก, e-Wallet 15 หลัก */
function promptPayKind(v: string) {
  const d = digitsOf(v)
  if (!d) return null
  if (d.length === 10 && d.startsWith('0')) return 'เบอร์มือถือ'
  if (d.length === 13) return 'เลขบัตรประชาชน / เลขผู้เสียภาษี'
  if (d.length === 15) return 'e-Wallet ID'
  return false
}

function PlatformForm({ initial }: { initial: PlatformSettings }) {
  const [f, setF] = useState<PlatformSettings>(initial)
  const set = <K extends keyof PlatformSettings>(k: K, v: PlatformSettings[K]) => setF((x) => ({ ...x, [k]: v }))
  const num = (k: 'vat_rate' | 'remind_days' | 'grace_days' | 'yearly_months') => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, e.target.value === '' ? 0 : Number(e.target.value))

  const tax = digitsOf(f.tax_id)
  const taxBad = f.tax_id.trim() !== '' && tax.length !== 13
  const branchBad = f.branch_code !== '' && !/^\d{5}$/.test(f.branch_code)
  const pp = promptPayKind(f.promptpay_id)
  const vatBad = f.vat_rate < 0 || f.vat_rate > 30
  const daysBad = (n: number) => !Number.isInteger(n) || n < 0 || n > 60
  const monthsBad = !Number.isInteger(f.yearly_months) || f.yearly_months < 1 || f.yearly_months > 12
  const errors = useMemo(() => {
    const e: string[] = []
    if (taxBad) e.push('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก')
    if (branchBad) e.push('รหัสสาขาต้องเป็นตัวเลข 5 หลัก')
    if (pp === false) e.push('รูปแบบพร้อมเพย์ไม่ถูกต้อง')
    if (vatBad) e.push('อัตรา VAT ต้องอยู่ระหว่าง 0–30')
    if (daysBad(f.remind_days) || daysBad(f.grace_days)) e.push('จำนวนวันต้องอยู่ระหว่าง 0–60')
    if (monthsBad) e.push('จำนวนเดือนของราคารายปีต้องอยู่ระหว่าง 1–12')
    if (f.vat_registered && !tax) e.push('ผู้จดทะเบียน VAT ต้องมีเลขประจำตัวผู้เสียภาษีเพื่อออกใบกำกับภาษี')
    return e
  }, [taxBad, branchBad, pp, vatBad, f.remind_days, f.grace_days, monthsBad, f.vat_registered, tax])

  const save = useMutation({
    mutationFn: () =>
      api.admin.updateBillingSettings({
        ...f,
        tax_id: tax,
        promptpay_id: digitsOf(f.promptpay_id),
        branch_code: f.branch_code || '00000',
      }),
    onSuccess: async (r) => {
      setF(r)
      toast.success('บันทึกข้อมูลผู้ให้บริการแล้ว')
      await invalidate('admin')
    },
  })

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (errors.length) return toast.error(errors[0])
        save.mutate()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>ผู้ออกเอกสาร</CardTitle>
          <CardDescription>แสดงบนหัวใบแจ้งหนี้และใบเสร็จค่าบริการ — บันทึกลงเอกสารตอนออก (แก้ภายหลังไม่กระทบใบเดิม)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อบริษัท / ผู้ให้บริการ" htmlFor="pf-name" className="sm:col-span-2">
            <Input id="pf-name" value={f.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="บริษัท เอสเตท จำกัด" />
          </Field>
          <Field
            label="เลขประจำตัวผู้เสียภาษี"
            htmlFor="pf-tax"
            hint={taxBad ? <span className="text-destructive">ต้องเป็นตัวเลข 13 หลัก ({tax.length}/13)</span> : '13 หลัก'}
          >
            <Input
              id="pf-tax"
              inputMode="numeric"
              maxLength={17}
              value={f.tax_id}
              onChange={(e) => set('tax_id', e.target.value)}
              aria-invalid={taxBad || undefined}
              className="tabular-nums"
            />
          </Field>
          <Field
            label="สาขา"
            htmlFor="pf-branch"
            hint={branchBad ? <span className="text-destructive">ตัวเลข 5 หลัก</span> : branchLabel(f.branch_code || '00000')}
          >
            <Input
              id="pf-branch"
              inputMode="numeric"
              maxLength={5}
              value={f.branch_code}
              onChange={(e) => set('branch_code', digitsOf(e.target.value))}
              aria-invalid={branchBad || undefined}
              className="tabular-nums"
            />
          </Field>
          <Field label="ที่อยู่" htmlFor="pf-addr" className="sm:col-span-2">
            <Textarea id="pf-addr" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="โทรศัพท์" htmlFor="pf-phone">
            <Input id="pf-phone" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="อีเมล" htmlFor="pf-email">
            <Input id="pf-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ภาษีมูลค่าเพิ่ม</CardTitle>
          <CardDescription>ราคาแพ็กเกจเป็นราคารวม VAT — เมื่อจด VAT ระบบแยกภาษีออกจากยอดรวม และออก “ใบเสร็จรับเงิน / ใบกำกับภาษี”</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-5">
          <label className="flex h-9 items-center gap-3">
            <Switch checked={f.vat_registered} onCheckedChange={(v) => set('vat_registered', v)} />
            <span className="text-sm font-medium">จดทะเบียนภาษีมูลค่าเพิ่ม</span>
          </label>
          {f.vat_registered && (
            <Field label="อัตรา VAT (%)" htmlFor="pf-vat" className="w-32" hint={vatBad ? <span className="text-destructive">0–30</span> : undefined}>
              <Input id="pf-vat" type="number" min={0} max={30} step="0.01" value={f.vat_rate} onChange={num('vat_rate')} />
            </Field>
          )}
          {f.vat_registered && !tax && (
            <p className="flex basis-full items-center gap-1.5 text-xs text-warning-foreground">
              <AlertTriangle className="size-3.5 text-warning" /> กรอกเลขประจำตัวผู้เสียภาษีด้านบนเพื่อออกใบกำกับภาษี
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ช่องทางรับชำระ</CardTitle>
          <CardDescription>QR พร้อมเพย์สร้างพร้อมยอดเงินในทุกใบแจ้งหนี้ · ข้อมูลบัญชีแสดงเป็นทางเลือกสำหรับการโอน</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="พร้อมเพย์"
            htmlFor="pf-pp"
            hint={
              pp === false ? (
                <span className="text-destructive">มือถือ 10 หลัก (ขึ้นต้น 0) · บัตร/ผู้เสียภาษี 13 หลัก · e-Wallet 15 หลัก</span>
              ) : pp ? (
                <span className="text-success">✓ {pp}</span>
              ) : (
                'ว่าง = ไม่แสดง QR'
              )
            }
          >
            <Input
              id="pf-pp"
              inputMode="numeric"
              value={f.promptpay_id}
              onChange={(e) => set('promptpay_id', e.target.value)}
              aria-invalid={pp === false || undefined}
              placeholder="08x-xxx-xxxx"
              className="tabular-nums"
            />
          </Field>
          <Field label="บัญชีธนาคาร" htmlFor="pf-bank" className="sm:row-span-2" hint="เช่น ธนาคาร · เลขบัญชี · ชื่อบัญชี (หลายบรรทัดได้)">
            <Textarea id="pf-bank" rows={4} value={f.bank_info} onChange={(e) => set('bank_info', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>รอบบิลและการต่ออายุ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field
            label="ออกใบต่ออายุล่วงหน้า (วัน)"
            htmlFor="pf-remind"
            hint={daysBad(f.remind_days) ? <span className="text-destructive">0–60 วัน</span> : 'ก่อนวันหมดอายุ'}
          >
            <Input id="pf-remind" type="number" min={0} max={60} value={f.remind_days} onChange={num('remind_days')} />
          </Field>
          <Field
            label="ช่วงผ่อนผัน (วัน)"
            htmlFor="pf-grace"
            hint={daysBad(f.grace_days) ? <span className="text-destructive">0–60 วัน</span> : 'ใช้งานต่อได้หลังหมดอายุ'}
          >
            <Input id="pf-grace" type="number" min={0} max={60} value={f.grace_days} onChange={num('grace_days')} />
          </Field>
          <Field
            label="ราคารายปี = รายเดือน ×"
            htmlFor="pf-months"
            hint={monthsBad ? <span className="text-destructive">1–12 เดือน</span> : `จ่ายรายปีประหยัด ${Math.max(0, 12 - f.yearly_months)} เดือน`}
          >
            <Input id="pf-months" type="number" min={1} max={12} value={f.yearly_months} onChange={num('yearly_months')} />
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            ราคารายปีอัตโนมัติใช้กับแพ็กเกจที่ไม่ได้กำหนดราคารายปีเอง (ตั้งได้ที่หน้าแพ็กเกจ)
          </p>
        </CardContent>
        <CardFooter className="justify-between gap-3 border-t pt-6">
          <span className="text-xs text-destructive">{errors[0] ?? ''}</span>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            บันทึก
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

const PROVIDERS: { v: PlatformSlipSettings['provider']; label: string }[] = [
  { v: 'none', label: 'ไม่ใช้ (อ่าน QR บนสลิปอย่างเดียว)' },
  { v: 'easyslip', label: 'EasySlip' },
  { v: 'slipok', label: 'SlipOK' },
]

function SlipForm({ initial }: { initial: PlatformSlipSettings }) {
  const [provider, setProvider] = useState(initial.provider)
  const [key, setKey] = useState('')
  const [branch, setBranch] = useState(initial.branch_id)
  const [auto, setAuto] = useState(initial.auto_approve)
  const [hasKey, setHasKey] = useState(initial.has_key)
  const external = provider !== 'none'
  const needsKey = external && !hasKey && !key.trim()
  const needsBranch = provider === 'slipok' && !branch.trim()

  const save = useMutation({
    mutationFn: () =>
      api.admin.updateSlipSettings({ provider, api_key: key.trim(), branch_id: branch.trim(), auto_approve: external && auto }),
    onSuccess: async (r) => {
      setKey('')
      setHasKey(r.has_key)
      setAuto(r.auto_approve)
      toast.success('บันทึกการตรวจสลิปอัตโนมัติแล้ว')
      await invalidate('admin')
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (needsBranch) return toast.error('SlipOK ต้องระบุ Branch ID')
        save.mutate()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="size-4 text-muted-foreground" /> ตรวจสลิปอัตโนมัติ
          </CardTitle>
          <CardDescription>
            ตรวจสลิปค่าแพ็กเกจทันทีที่ลูกค้าแนบ: อ่าน QR บนสลิป ตรวจสลิปซ้ำ และ (ถ้าเชื่อมผู้ให้บริการ) ยืนยันยอดกับธนาคาร
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="ผู้ให้บริการตรวจสลิป" htmlFor="sl-provider">
            <Select value={provider} onValueChange={(v) => setProvider(v as PlatformSlipSettings['provider'])}>
              <SelectTrigger id="sl-provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.v} value={p.v}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {external && (
            <Field
              label="API key"
              htmlFor="sl-key"
              hint={
                hasKey ? (
                  <span className="text-success">✓ ตั้งค่าแล้ว — ปล่อยว่างเพื่อใช้คีย์เดิม</span>
                ) : (
                  <span className={needsKey ? 'text-warning-foreground' : undefined}>ยังไม่ได้ตั้งค่า</span>
                )
              }
            >
              <div className="relative">
                <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="sl-key"
                  type="password"
                  autoComplete="new-password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={hasKey ? '••••••••••••' : 'วาง API key'}
                  className="pl-9"
                />
              </div>
            </Field>
          )}
          {provider === 'slipok' && (
            <Field
              label="Branch ID"
              htmlFor="sl-branch"
              hint={needsBranch ? <span className="text-destructive">จำเป็นสำหรับ SlipOK</span> : undefined}
            >
              <Input id="sl-branch" value={branch} onChange={(e) => setBranch(e.target.value)} aria-invalid={needsBranch || undefined} />
            </Field>
          )}
          {external && (
            <label className="flex items-start gap-3 rounded-md border p-3 sm:col-span-2">
              <Switch checked={auto} onCheckedChange={setAuto} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">ยืนยันอัตโนมัติเมื่อตรวจกับธนาคารผ่านและยอดตรง</span>
                <span className="text-xs text-muted-foreground">
                  ออกใบเสร็จและต่ออายุให้ทันที — สลิปที่ไม่ผ่านยังรอตรวจด้วยตนเองตามปกติ
                </span>
              </span>
            </label>
          )}
          {!external && (
            <Alert className="sm:col-span-2">
              <ScanLine />
              <AlertTitle>ตรวจขั้นพื้นฐาน</AlertTitle>
              <AlertDescription>อ่าน QR บนสลิปและเตือนสลิปซ้ำ — ยังต้องตรวจยอดเงินเข้าบัญชีด้วยตนเองก่อนยืนยัน</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="justify-end border-t pt-6">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            บันทึก
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
