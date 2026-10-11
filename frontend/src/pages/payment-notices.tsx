// แจ้งชำระจากผู้เช่า (พอร์ทัล / ส่งสลิปใน LINE) — /payment-notices
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bot,
  Check,
  ChevronRight,
  ExternalLink,
  Inbox,
  Loader2,
  Printer,
  ReceiptText,
  ScanLine,
  Settings2,
  X,
} from 'lucide-react'
import { api, type NoticeStatus, type PaymentNotice } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { baht, thPeriod, today } from '@/lib/format'
import { dateTime, printHref, timeAgo } from '@/lib/docs'
import { sqlUtc } from '@/lib/billing'
import { NOTICE_CHANNEL, NOTICE_STATUS, isAutoApproved } from '@/lib/slips'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, Field, ToneBadge } from '@/components/common'
import { ReasonDialog } from '@/components/reason-dialog'
import { SlipCheckDetails, SlipResultBadge } from '@/components/slip-check'

type Filter = NoticeStatus | 'all'
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'pending', label: 'รอตรวจสอบ' },
  { v: 'approved', label: 'ยืนยันแล้ว' },
  { v: 'rejected', label: 'ไม่ผ่าน' },
  { v: 'all', label: 'ทั้งหมด' },
]

const at = (s: string) => dateTime(sqlUtc(s))

export default function PaymentNoticesPage() {
  const { canManage } = useSession()
  const [status, setStatus] = useState<Filter>('pending')
  // เก็บรายการที่เปิดไว้ (ไม่หายจากกล่องเมื่อยืนยันแล้วรายการหลุดจากตัวกรอง)
  const [open, setOpen] = useState<PaymentNotice | null>(null)
  const list = useQuery({
    queryKey: ['payment-notices', status],
    queryFn: () => api.paymentNotices({ status: status === 'all' ? '' : status }),
    refetchInterval: 60_000,
  })
  const slip = useQuery({
    queryKey: ['org-slip'],
    queryFn: api.slipSettings,
    enabled: canManage,
    meta: { silent: true },
  })
  const rows = list.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border bg-muted/50 p-1" role="radiogroup" aria-label="กรองสถานะ">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              role="radio"
              aria-checked={status === f.v}
              onClick={() => setStatus(f.v)}
              className={cn(
                'h-7 rounded-sm px-2.5 text-xs whitespace-nowrap transition-colors',
                status === f.v
                  ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          ผู้เช่าแนบสลิปผ่านพอร์ทัล หรือส่งรูปสลิปในแชต LINE — ระบบตรวจ QR และสลิปซ้ำให้ก่อน
        </p>
        {canManage && (
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/settings?tab=slip">
              <Settings2 /> ตั้งค่าตรวจสลิป
            </Link>
          </Button>
        )}
      </div>

      {canManage && slip.data?.provider === 'none' && status === 'pending' && rows.length > 0 && (
        <Alert>
          <ScanLine />
          <AlertTitle>ตรวจขั้นพื้นฐาน — ยังต้องตรวจยอดเงินเอง</AlertTitle>
          <AlertDescription>
            ระบบอ่าน QR บนสลิปและกันสลิปที่เคยใช้แล้ว แต่ยืนยันยอดเงินกับธนาคารไม่ได้ กรุณาเช็กยอดเข้าบัญชีก่อนกดยืนยัน
          </AlertDescription>
        </Alert>
      )}

      {list.isLoading ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={status === 'pending' ? 'ไม่มีการแจ้งชำระรอตรวจ' : 'ไม่มีรายการ'}
            description="เมื่อผู้เช่าแนบสลิปในพอร์ทัลหรือส่งรูปสลิปในแชต LINE รายการจะแสดงที่นี่"
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map((n) => (
              <li key={n.id}>
                <NoticeRow n={n} onOpen={() => setOpen(n)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-3xl">
          {open && <ReviewForm key={open.id} n={open} onUpdated={setOpen} onClose={() => setOpen(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusBadge({ n }: { n: PaymentNotice }) {
  const st = NOTICE_STATUS[n.status] ?? NOTICE_STATUS.pending
  if (isAutoApproved(n))
    return (
      <ToneBadge tone="green">
        <Bot /> ยืนยันอัตโนมัติ
      </ToneBadge>
    )
  return <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
}

function NoticeRow({ n, onOpen }: { n: PaymentNotice; onOpen: () => void }) {
  const warn = n.status === 'pending' && (n.check?.result === 'duplicate' || n.check?.result === 'mismatch')
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40',
        warn && 'bg-destructive/[0.03]',
      )}
    >
      <span className="size-14 shrink-0 overflow-hidden rounded-md border bg-muted">
        <img src={n.slip_url} alt="" loading="lazy" className="size-full object-cover object-top" />
      </span>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="truncate font-medium">{n.tenant_name ?? 'ไม่ระบุผู้เช่า'}</span>
          <span className="text-xs text-muted-foreground">
            ห้อง {n.unit_name} · {thPeriod(n.period)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <SlipResultBadge result={n.check?.result} />
          <span className="text-xs text-muted-foreground">
            ทาง{NOTICE_CHANNEL[n.channel] ?? n.channel} · {timeAgo(sqlUtc(n.created_at))}
          </span>
        </span>
      </span>
      <span className="grid shrink-0 justify-items-end gap-1">
        <span className="font-semibold tabular-nums">{baht(n.amount)}</span>
        <StatusBadge n={n} />
      </span>
      <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
    </button>
  )
}

type Method = 'transfer' | 'promptpay' | 'cash'
const METHODS: { v: Method; label: string }[] = [
  { v: 'transfer', label: 'โอนเงินเข้าบัญชี' },
  { v: 'promptpay', label: 'พร้อมเพย์' },
  { v: 'cash', label: 'เงินสด' },
]

function ReviewForm({
  n,
  onUpdated,
  onClose,
}: {
  n: PaymentNotice
  onUpdated: (n: PaymentNotice) => void
  onClose: () => void
}) {
  const { readOnly } = useSession()
  const transferred = n.check?.transferred_at?.slice(0, 10)
  const [amount, setAmount] = useState(String(n.check?.amount ?? n.amount))
  const [paidAt, setPaidAt] = useState(transferred && /^\d{4}-\d{2}-\d{2}$/.test(transferred) ? transferred : today())
  const [method, setMethod] = useState<Method>('transfer')
  const [rejectOpen, setRejectOpen] = useState(false)
  const receiptId = n.receipt_id
  const pending = n.status === 'pending'
  const amt = Number(amount.replace(/,/g, ''))
  const amountBad = !Number.isFinite(amt) || amt <= 0

  const approve = useMutation({
    mutationFn: () => api.approveNotice(n.id, { amount: amt, paid_at: paidAt, method }),
    onSuccess: async (r) => {
      onUpdated(r)
      toast.success('ยืนยันการชำระและออกใบเสร็จแล้ว')
      await invalidate('payment-notices', 'dashboard', 'invoices', 'receipts')
    },
  })
  const reject = useMutation({
    mutationFn: (reason: string) => api.rejectNotice(n.id, reason),
    onSuccess: async () => {
      setRejectOpen(false)
      toast.success(n.tenant_id ? 'บันทึกแล้ว — แจ้งผู้เช่าทาง LINE (ถ้าเชื่อมไว้)' : 'บันทึกแล้ว')
      onClose()
      await invalidate('payment-notices', 'dashboard')
    },
  })

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>แจ้งชำระ {baht(n.amount)}</DialogTitle>
        <DialogDescription>
          {n.tenant_name ?? 'ไม่ระบุผู้เช่า'} · ห้อง {n.unit_name} · บิล {thPeriod(n.period)}
          {n.invoice_doc_no ? ` (${n.invoice_doc_no})` : ''}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <a
          href={n.slip_url}
          target="_blank"
          rel="noreferrer"
          className="group relative block overflow-hidden rounded-md border bg-muted"
          title="เปิดรูปเต็ม"
        >
          <img src={n.slip_url} alt="สลิปการโอน" className="max-h-[60svh] w-full object-contain md:max-h-[70svh]" />
          <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-sm bg-card/90 text-muted-foreground opacity-0 shadow-xs transition-opacity group-hover:opacity-100">
            <ExternalLink className="size-3.5" />
          </span>
        </a>

        <div className="grid content-start gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge n={n} />
            <span className="text-xs text-muted-foreground">
              แจ้งทาง{NOTICE_CHANNEL[n.channel] ?? n.channel} · {at(n.created_at)}
            </span>
          </div>

          {n.check ? (
            <SlipCheckDetails check={n.check} />
          ) : (
            <p className="text-sm text-muted-foreground">ยังไม่มีผลตรวจสลิป</p>
          )}

          {n.note && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">หมายเหตุจากผู้เช่า: </span>
              {n.note}
            </div>
          )}

          {n.status === 'rejected' && n.reject_reason && (
            <p className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm">
              <span className="text-muted-foreground">เหตุผลที่ไม่ผ่าน: </span>
              {n.reject_reason}
              {n.reviewed_by_name && (
                <span className="block text-xs text-muted-foreground">
                  โดย {n.reviewed_by_name}
                  {n.reviewed_at ? ` · ${at(n.reviewed_at)}` : ''}
                </span>
              )}
            </p>
          )}

          {receiptId ? (
            <div className="grid gap-3 rounded-md border border-success/30 bg-success/5 p-3">
              <div className="flex items-start gap-2 text-sm">
                <ReceiptText className="mt-0.5 size-4 shrink-0 text-success" />
                <span>
                  {isAutoApproved(n) ? (
                    'ระบบยืนยันอัตโนมัติ (ตรวจกับธนาคารผ่านและยอดตรง)'
                  ) : (
                    <>
                      ยืนยันโดย {n.reviewed_by_name}
                      {n.reviewed_at ? ` · ${at(n.reviewed_at)}` : ''} — บันทึกรับชำระและออกใบเสร็จแล้ว
                    </>
                  )}
                </span>
              </div>
              <Button asChild variant="outline" className="bg-card">
                <a href={printHref('receipt', receiptId)} target="_blank" rel="noreferrer">
                  <Printer /> พิมพ์ใบเสร็จ
                </a>
              </Button>
            </div>
          ) : (
            pending && (
              <form
                className="grid gap-3 border-t pt-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (amountBad) return toast.error('ยอดเงินไม่ถูกต้อง')
                  approve.mutate()
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="ยอดที่รับ (บาท)" htmlFor="pn-amount">
                    <Input
                      id="pn-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      aria-invalid={amountBad || undefined}
                      className="tabular-nums"
                    />
                  </Field>
                  <Field label="วันที่รับเงิน" htmlFor="pn-date">
                    <Input id="pn-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
                  </Field>
                </div>
                <Field label="ช่องทาง" htmlFor="pn-method">
                  <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                    <SelectTrigger id="pn-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => (
                        <SelectItem key={m.v} value={m.v}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {n.check?.result === 'duplicate' && (
                  <p className="text-xs text-destructive">สลิปนี้เคยถูกใช้แจ้งชำระแล้ว — ตรวจสอบให้แน่ใจก่อนยืนยัน</p>
                )}
                {n.check?.result === 'readable' && (
                  <p className="text-xs text-muted-foreground">QR ถูกต้องและไม่ซ้ำ แต่ยังไม่ได้ยืนยันยอด — เช็กยอดเข้าบัญชีก่อน</p>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={readOnly || approve.isPending}
                    onClick={() => setRejectOpen(true)}
                  >
                    <X /> ไม่ผ่าน
                  </Button>
                  <Button type="submit" disabled={readOnly || approve.isPending}>
                    {approve.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                    ยืนยันและออกใบเสร็จ
                  </Button>
                </div>
              </form>
            )
          )}
        </div>
      </div>

      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="แจ้งชำระไม่ผ่าน"
        description="ผู้เช่าจะได้รับข้อความพร้อมเหตุผลทาง LINE (ถ้าเชื่อมไว้) และแนบสลิปใหม่ได้ในพอร์ทัล"
        confirmText="บันทึกว่าไม่ผ่าน"
        pending={reject.isPending}
        onConfirm={(r) => reject.mutate(r)}
      />
    </div>
  )
}
