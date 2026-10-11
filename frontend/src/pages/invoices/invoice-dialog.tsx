import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Ban, CheckCircle2, HandCoins, Loader2, Printer, Receipt as ReceiptIcon } from 'lucide-react'
import { api, type InvoiceDetail, type PayMethod, type Receipt } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { printHref } from '@/lib/docs'
import {
  INVOICE_KINDS,
  PAY_METHODS,
  baht,
  num,
  thDate,
  thDateLong,
  thPeriod,
  today,
} from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Field, InvoiceStatusBadge, ToneBadge } from '@/components/common'
import { PromptPayQR } from '@/components/promptpay-qr'
import { ReasonDialog } from '@/components/reason-dialog'
import { LineIcon } from '@/components/line'
import { SendLineButton } from './send-line'

type Mode = 'view' | 'pay' | 'paid'

export function InvoiceDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        {id != null && <InvoiceBody key={id} id={id} />}
      </DialogContent>
    </Dialog>
  )
}

function InvoiceBody({ id }: { id: number }) {
  const { readOnly, canManage, line, lineReady } = useSession()
  const [mode, setMode] = useState<Mode>('view')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [voidOpen, setVoidOpen] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['invoice', id], queryFn: () => api.invoice(id) })

  const voidInv = useMutation({
    mutationFn: (reason: string) => api.voidInvoice(id, reason),
    onSuccess: async () => {
      toast.success('ยกเลิกใบแจ้งหนี้แล้ว')
      setVoidOpen(false)
      await invalidate('invoice', 'invoices', 'dashboard')
    },
  })

  if (isLoading || !data)
    return (
      <div className="space-y-3">
        <DialogTitle className="sr-only">ใบแจ้งหนี้</DialogTitle>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-40" />
      </div>
    )

  const inv = data.invoice
  if (mode === 'pay') return <PayForm data={data} onCancel={() => setMode('view')} onPaid={(r) => {
          setReceipt(r)
          setMode('paid')
        }} />
  if (mode === 'paid')
    return (
      <div className="grid gap-5 py-2 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <div>
          <DialogTitle className="text-lg">บันทึกการรับชำระแล้ว</DialogTitle>
          <DialogDescription className="mt-1">
            {receipt ? (
              <>
                ออก{receipt.is_tax_invoice ? 'ใบเสร็จรับเงิน/ใบกำกับภาษี' : 'ใบเสร็จรับเงิน'} เลขที่{' '}
                <span className="font-mono">{receipt.doc_no}</span> · รับสุทธิ {baht(receipt.net_received)}
              </>
            ) : (
              inv.doc_no
            )}
          </DialogDescription>
        </div>
        {lineReady && line?.auto_receipt && (
          <p className="mx-auto flex max-w-sm items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-left text-sm text-muted-foreground">
            <LineIcon className="mt-0.5" />
            ระบบส่งใบเสร็จทาง LINE ให้ผู้เช่าแล้ว (ถ้าเชื่อมบัญชีไว้)
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="ghost" onClick={() => setMode('view')}>
            กลับไปที่ใบแจ้งหนี้
          </Button>
          {receipt && lineReady && !line?.auto_receipt && (
            <SendLineButton kind="receipt" id={receipt.id} withLabel className="w-full sm:w-auto" />
          )}
          {receipt && (
            <Button asChild>
              <a href={printHref('receipt', receipt.id)} target="_blank" rel="noreferrer">
                <Printer /> พิมพ์ใบเสร็จ
              </a>
            </Button>
          )}
        </div>
      </div>
    )

  const unpaid = inv.status === 'unpaid'
  const isVoid = inv.status === 'void'
  const remaining = Math.max(0, inv.total - (data.paid_amount ?? 0))

  return (
    <>
      <div className="flex items-start gap-3 pr-6">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">
            {inv.doc_no || `#${inv.id}`} · {INVOICE_KINDS[inv.kind] ?? inv.kind}
          </div>
          <DialogTitle className={isVoid ? 'text-lg line-through' : 'text-lg'}>
            ห้อง {inv.unit_name} · {inv.property_name}
          </DialogTitle>
          <DialogDescription>{inv.tenant_name || 'ไม่ระบุผู้เช่า'}</DialogDescription>
        </div>
        <div className="ml-auto shrink-0">
          <InvoiceStatusBadge status={inv.status} overdueDays={inv.overdue_days} />
        </div>
      </div>

      {isVoid && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span className="font-medium text-destructive">ยกเลิกแล้ว</span>
          {inv.void_reason && <span className="text-muted-foreground"> — {inv.void_reason}</span>}
        </div>
      )}

      <dl className="grid grid-cols-3 gap-3 border-y py-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">รอบบิล</dt>
          <dd className="font-medium">{thPeriod(inv.period)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">วันที่ออก</dt>
          <dd className="font-medium">{thDate(inv.issue_date)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">ครบกำหนด</dt>
          <dd className="font-medium">{thDate(inv.due_date)}</dd>
        </div>
      </dl>

      <ItemsTable data={data} remaining={remaining} />

      {unpaid && inv.late_fee > 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          เกินกำหนด {inv.overdue_days} วัน · ค่าปรับล่าช้า ณ วันนี้ {baht(inv.late_fee)} (เลือกเก็บได้ตอนรับชำระ)
        </p>
      )}

      {unpaid && data.promptpay_payload && (
        <PromptPayQR payload={data.promptpay_payload} amount={baht(remaining || inv.total)} className="my-1" />
      )}

      {data.receipts?.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">ใบเสร็จที่ออกแล้ว</h3>
          <div className="divide-y rounded-md border">
            {data.receipts.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <ReceiptIcon className="size-4 text-muted-foreground" />
                <span className={r.status === 'void' ? 'font-mono line-through' : 'font-mono'}>{r.doc_no}</span>
                <span className="text-xs text-muted-foreground">{thDate(r.issue_date)}</span>
                {r.status === 'void' && <ToneBadge tone="grey">ยกเลิก</ToneBadge>}
                <span className="ml-auto tabular-nums">{baht(r.net_received ?? r.total)}</span>
                <Button asChild size="icon-sm" variant="ghost" aria-label="พิมพ์ใบเสร็จ">
                  <a href={printHref('receipt', r.id)} target="_blank" rel="noreferrer">
                    <Printer />
                  </a>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {inv.status === 'paid' && (
        <div className="flex items-center justify-center gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
          <CheckCircle2 className="size-4" />
          ชำระเรียบร้อย{inv.paid_at ? ` · ${thDateLong(inv.paid_at)}` : ''}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild variant="outline">
          <a href={printHref('invoice', inv.id)} target="_blank" rel="noreferrer">
            <Printer /> พิมพ์ใบแจ้งหนี้
          </a>
        </Button>
        {canManage && !isVoid && inv.status !== 'paid' && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={readOnly}
            onClick={() => setVoidOpen(true)}
          >
            <Ban /> ยกเลิก
          </Button>
        )}
        {lineReady && !isVoid && <SendLineButton kind="invoice" id={inv.id} withLabel />}
        {unpaid && (
          <Button className="ml-auto" disabled={readOnly} onClick={() => setMode('pay')}>
            <HandCoins /> รับชำระ
          </Button>
        )}
      </div>

      <ReasonDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`ยกเลิกใบแจ้งหนี้ ${inv.doc_no}?`}
        description="เอกสารจะยังแสดงในระบบพร้อมขีดฆ่าและเหตุผล ไม่ถูกลบ"
        confirmText="ยกเลิกใบแจ้งหนี้"
        pending={voidInv.isPending}
        onConfirm={(r) => voidInv.mutate(r)}
      />
    </>
  )
}

function ItemsTable({ data, remaining }: { data: InvoiceDetail; remaining: number }) {
  const inv = data.invoice
  const hasVat = inv.vat_amount > 0
  return (
    <table className="w-full text-sm">
      <thead className="border-b text-xs text-muted-foreground">
        <tr>
          <th className="py-2 text-left font-medium">รายการ</th>
          <th className="text-right font-medium">จำนวน</th>
          <th className="hidden text-right font-medium sm:table-cell">ราคา/หน่วย</th>
          <th className="text-right font-medium">จำนวนเงิน</th>
        </tr>
      </thead>
      <tbody>
        {inv.items.map((it, i) => (
          <tr key={i} className="border-b border-border/60">
            <td className="py-2 pr-2">
              {it.label}
              {hasVat && it.vatable && <span className="ml-1 text-[10px] text-muted-foreground">VAT</span>}
              <div className="text-xs text-muted-foreground sm:hidden">{baht(it.unit_price)}/หน่วย</div>
            </td>
            <td className="text-right tabular-nums">{num(it.qty)}</td>
            <td className="hidden text-right tabular-nums sm:table-cell">{baht(it.unit_price)}</td>
            <td className="text-right tabular-nums">{baht(it.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="text-sm">
        {hasVat && (
          <>
            <SumRow label="รวมก่อนภาษี" value={baht(inv.subtotal)} />
            <SumRow label="ภาษีมูลค่าเพิ่ม" value={baht(inv.vat_amount)} />
          </>
        )}
        <SumRow label="ยอดรวม" value={baht(inv.total)} strong />
        {data.paid_amount > 0 && inv.status === 'unpaid' && (
          <>
            <SumRow label="ชำระแล้ว" value={baht(data.paid_amount)} />
            <SumRow label="คงเหลือ" value={baht(remaining)} strong />
          </>
        )}
      </tfoot>
    </table>
  )
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr>
      <td colSpan={2} className={strong ? 'pt-2 font-semibold sm:hidden' : 'pt-1.5 text-muted-foreground sm:hidden'}>
        {label}
      </td>
      <td colSpan={3} className={strong ? 'hidden pt-2 font-semibold sm:table-cell' : 'hidden pt-1.5 text-muted-foreground sm:table-cell'}>
        {label}
      </td>
      <td className={strong ? 'pt-2 text-right text-base font-semibold tabular-nums' : 'pt-1.5 text-right tabular-nums'}>
        {value}
      </td>
    </tr>
  )
}

/** ฐานคำนวณหัก ณ ที่จ่าย: รายการค่าเช่า (ถ้ามี) ไม่เช่นนั้นใช้ยอดก่อนภาษี */
function whtBase(data: InvoiceDetail) {
  const rent = data.invoice.items.filter((i) => i.label.includes('ค่าเช่า')).reduce((s, i) => s + i.amount, 0)
  return rent > 0 ? rent : data.invoice.subtotal
}

const round2 = (n: number) => Math.round(n * 100) / 100

function PayForm({
  data,
  onCancel,
  onPaid,
}: {
  data: InvoiceDetail
  onCancel: () => void
  onPaid: (r: Receipt) => void
}) {
  const inv = data.invoice
  const remaining = round2(Math.max(0, inv.total - (data.paid_amount ?? 0)))
  const isCompany = !!data.tenant?.tax_id
  const [method, setMethod] = useState<PayMethod>(data.promptpay_payload ? 'promptpay' : 'transfer')
  const [paidAt, setPaidAt] = useState(today())
  const [amount, setAmount] = useState(String(remaining))
  const [lateFee, setLateFee] = useState(inv.late_fee > 0)
  const [withWht, setWithWht] = useState(isCompany)
  const [wht, setWht] = useState('')
  const [note, setNote] = useState('')

  const amt = Number(amount) || 0
  const fee = lateFee ? inv.late_fee : 0
  const whtAmt = withWht ? Number(wht) || 0 : 0
  const gross = round2(amt + fee)
  const net = round2(gross - whtAmt)
  const invalid = amt <= 0 || amt > remaining + 0.001 || whtAmt < 0 || whtAmt > gross

  const pay = useMutation({
    mutationFn: () =>
      api.payInvoice(inv.id, {
        method,
        paid_at: paidAt,
        ...(Math.abs(amt - remaining) > 0.001 ? { amount: amt } : {}),
        ...(inv.late_fee > 0 ? { include_late_fee: lateFee } : {}),
        ...(whtAmt > 0 ? { wht_amount: whtAmt } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: async (r) => {
      toast.success('บันทึกการรับชำระแล้ว')
      await invalidate('invoice', 'invoices', 'receipts', 'dashboard')
      onPaid(r.receipt)
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid) pay.mutate()
      }}
    >
      <div>
        <DialogTitle>รับชำระ {inv.doc_no}</DialogTitle>
        <DialogDescription>
          ห้อง {inv.unit_name} · {inv.tenant_name || '—'} · ยอดค้าง {baht(remaining)}
        </DialogDescription>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ช่องทาง" htmlFor="pay-method">
          <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
            <SelectTrigger id="pay-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAY_METHODS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="วันที่รับเงิน" htmlFor="pay-date">
          <Input id="pay-date" type="date" value={paidAt} max={today()} onChange={(e) => setPaidAt(e.target.value)} required />
        </Field>
        <Field
          label="ยอดชำระสำหรับใบแจ้งหนี้นี้"
          htmlFor="pay-amt"
          className="sm:col-span-2"
          hint={amt < remaining - 0.001 ? 'ชำระบางส่วน — ยอดที่เหลือยังค้างในใบแจ้งหนี้' : undefined}
        >
          <Input
            id="pay-amt"
            type="number"
            min={0}
            max={remaining}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tabular-nums"
            required
          />
        </Field>
      </div>

      {inv.late_fee > 0 && (
        <label className="flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm">
          <Checkbox checked={lateFee} onCheckedChange={(v) => setLateFee(v === true)} />
          <span>เก็บค่าปรับชำระล่าช้า ({inv.overdue_days} วัน)</span>
          <span className="ml-auto font-medium tabular-nums">{baht(inv.late_fee)}</span>
        </label>
      )}

      <div className="rounded-md border">
        <label className="flex items-center gap-3 px-3 py-2.5 text-sm">
          <Checkbox checked={withWht} onCheckedChange={(v) => setWithWht(v === true)} />
          <span>หักภาษี ณ ที่จ่าย</span>
          {isCompany && <span className="text-xs text-muted-foreground">(ผู้เช่านิติบุคคล)</span>}
        </label>
        {withWht && (
          <div className="flex items-end gap-2 border-t p-3">
            <Field label="จำนวนภาษีที่ถูกหัก" htmlFor="pay-wht" hint="ปกติ 5% ของค่าเช่า" className="flex-1">
              <Input
                id="pay-wht"
                type="number"
                min={0}
                step="0.01"
                value={wht}
                onChange={(e) => setWht(e.target.value)}
                className="tabular-nums"
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              className="mb-5"
              onClick={() => setWht(String(round2(whtBase(data) * 0.05)))}
            >
              คำนวณ 5%
            </Button>
          </div>
        )}
      </div>

      <Field label="หมายเหตุ (ถ้ามี)" htmlFor="pay-note">
        <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <dl className="grid gap-1 rounded-md bg-muted/60 p-3 text-sm tabular-nums">
        <div className="flex">
          <dt className="text-muted-foreground">ยอดชำระ</dt>
          <dd className="ml-auto">{baht(amt)}</dd>
        </div>
        {fee > 0 && (
          <div className="flex">
            <dt className="text-muted-foreground">ค่าปรับล่าช้า</dt>
            <dd className="ml-auto">{baht(fee)}</dd>
          </div>
        )}
        {whtAmt > 0 && (
          <div className="flex">
            <dt className="text-muted-foreground">หัก ภาษี ณ ที่จ่าย</dt>
            <dd className="ml-auto">−{baht(whtAmt)}</dd>
          </div>
        )}
        <div className="mt-1 flex border-t pt-2 font-semibold">
          <dt>รับสุทธิ</dt>
          <dd className="ml-auto text-base">{baht(net)}</dd>
        </div>
      </dl>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          ย้อนกลับ
        </Button>
        <Button type="submit" disabled={invalid || pay.isPending}>
          {pay.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          ยืนยันรับชำระและออกใบเสร็จ
        </Button>
      </div>
    </form>
  )
}
