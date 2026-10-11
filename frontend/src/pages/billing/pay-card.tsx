import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Clock, ImagePlus, Landmark, Loader2, Printer, ReceiptText, Upload, XCircle } from 'lucide-react'
import { api, type SubPayment } from '@/lib/api'
import { CYCLE_LABEL, SUB_KIND, isOverdue, sqlUtc, subPrintHref } from '@/lib/billing'
import { dateTime } from '@/lib/docs'
import { invalidate } from '@/lib/query'
import { baht, thDateLong } from '@/lib/format'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Field } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { PromptPayQR } from '@/components/promptpay-qr'
import { PhotoGrid } from '@/components/tickets/parts'
import { SlipCheck, SubStatusBadge, SumRow } from '@/components/billing'

/** ใบแจ้งหนี้ที่ยังเปิดอยู่: QR พร้อมเพย์ + แนบสลิป */
export function PayCard({ pay }: { pay: SubPayment }) {
  const inv = pay.invoice
  const confirm = useConfirm()
  const pending = inv.status === 'pending'
  const cancel = useMutation({
    mutationFn: () => api.cancelBillingInvoice(inv.id),
    onSuccess: async () => {
      toast.success(`ยกเลิกใบแจ้งหนี้ ${inv.doc_no} แล้ว`)
      await invalidate('billing', 'org-info')
    },
  })

  return (
    <Card id="pay" className="scroll-mt-20 gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            {pending ? 'ใบแจ้งหนี้ที่ต้องชำระ' : 'แจ้งชำระแล้ว'}
            <SubStatusBadge invoice={inv} />
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{inv.doc_no}</span> · {SUB_KIND[inv.kind]} · ครบกำหนด {thDateLong(inv.due_date)}
          </p>
        </div>
        <div className="flex gap-1 sm:ml-auto">
          <Button asChild variant="ghost" size="sm">
            <a href={subPrintHref(inv.id, 'invoice')} target="_blank" rel="noreferrer">
              <Printer /> ใบแจ้งหนี้
            </a>
          </Button>
          {pending && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={cancel.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: `ยกเลิกใบแจ้งหนี้ ${inv.doc_no}?`,
                    description: 'ใช้เมื่อสั่งผิดแพ็กเกจหรือยังไม่ต้องการชำระ — สั่งซื้อใหม่ได้ทุกเมื่อ',
                    confirmText: 'ยกเลิกใบแจ้งหนี้',
                    destructive: true,
                  })
                )
                  cancel.mutate()
              }}
            >
              <XCircle /> ยกเลิก
            </Button>
          )}
        </div>
      </div>

      {pending && inv.reject_reason && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 bg-destructive/5 px-5">
          <XCircle />
          <AlertTitle>สลิปไม่ผ่านการตรวจสอบ</AlertTitle>
          <AlertDescription>
            <p className="font-medium text-foreground">“{inv.reject_reason}”</p>
            <p>ตรวจสอบยอดเงินและบัญชีปลายทาง แล้วแนบสลิปใหม่ด้านล่าง</p>
          </AlertDescription>
        </Alert>
      )}
      {inv.status === 'review' && (
        <div className="flex items-start gap-3 border-b bg-warning/10 px-5 py-3 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">ได้รับสลิปแล้ว — รอผู้ให้บริการตรวจสอบ</div>
            <div className="text-muted-foreground">
              ส่งเมื่อ {inv.slip_at ? dateTime(sqlUtc(inv.slip_at)) : '—'} · แพ็กเกจจะต่ออายุให้อัตโนมัติเมื่อยืนยัน
            </div>
            <SlipCheck invoice={inv} withMessage className="mt-1.5" />
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="border-b bg-muted/40 px-5 py-5 md:border-r md:border-b-0">
          {pay.promptpay_payload ? (
            <>
              <PromptPayQR payload={pay.promptpay_payload} amount={baht(inv.total)} className="w-60" />
              <p className="mx-auto mt-3 max-w-60 text-center text-xs text-muted-foreground">
                บันทึกภาพ QR แล้วเปิดในแอปธนาคาร · ยอดเงินถูกกรอกให้อัตโนมัติ
              </p>
            </>
          ) : (
            <div className="mx-auto grid w-60 place-items-center gap-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Landmark className="size-6" />
              โอนเข้าบัญชีตามรายละเอียดด้านข้าง
            </div>
          )}
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <div className="text-xs text-muted-foreground">ยอดชำระ</div>
            <div className="text-3xl font-bold tracking-tight tabular-nums">{baht(inv.total)}</div>
            <div className="text-xs text-muted-foreground">({pay.baht_text})</div>
          </div>
          <div className="space-y-1.5 text-sm">
            <SumRow label={`แพ็กเกจ ${inv.package_name} · ${CYCLE_LABEL[inv.cycle]}`} value={baht(inv.price)} muted />
            {inv.credit > 0 && <SumRow label="ส่วนลดจากแพ็กเกจเดิม" value={`−${baht(inv.credit)}`} muted />}
            {inv.vat_amount > 0 && (
              <SumRow label={`รวมภาษีมูลค่าเพิ่ม ${inv.issuer.vat_rate}%`} value={baht(inv.vat_amount)} muted />
            )}
            <SumRow
              label="รอบบริการ"
              value={`${thDateLong(inv.period_start)} – ${thDateLong(inv.period_end)}`}
              muted
            />
            {isOverdue(inv) && (
              <p className="text-xs text-warning-foreground">เลยกำหนดชำระแล้ว — ชำระได้ตามปกติ</p>
            )}
          </div>
          {pay.bank_info && (
            <div className="rounded-md border px-3 py-2.5 text-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Landmark className="size-3.5" /> หรือโอนเข้าบัญชี
              </div>
              <div className="whitespace-pre-line">{pay.bank_info}</div>
            </div>
          )}
          <Separator />
          {pending ? (
            <SlipUpload key={inv.id + (inv.reject_reason ?? '')} id={inv.id} retry={!!inv.reject_reason} />
          ) : (
            inv.slip_url && (
              <div className="flex items-center gap-3">
                <PhotoGrid photos={[inv.slip_url]} className="[&>button]:size-16" />
                <div className="text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 font-medium text-foreground">
                    <ReceiptText className="size-3.5" /> สลิปที่ส่งแล้ว
                  </div>
                  {inv.payment_ref ? `อ้างอิง ${inv.payment_ref}` : 'แตะรูปเพื่อขยาย'}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </Card>
  )
}

function SlipUpload({ id, retry }: { id: number; retry: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('photo', file!)
      if (note.trim()) fd.append('note', note.trim())
      return api.uploadBillingSlip(id, fd)
    },
    onSuccess: async (r) => {
      // ตรวจกับธนาคารผ่านและยอดตรง → ผู้ให้บริการอาจตั้งให้ยืนยันอัตโนมัติ
      if (r.invoice.status === 'paid') toast.success('ตรวจสลิปผ่าน — ต่ออายุแพ็กเกจเรียบร้อยแล้ว')
      else toast.success('ส่งสลิปแล้ว — รอผู้ให้บริการตรวจสอบ')
      setFile(null)
      setNote('')
      await invalidate('billing', 'org-info', 'me')
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ReceiptText className="size-4 text-muted-foreground" />
        {retry ? 'แนบสลิปใหม่' : 'โอนแล้ว? แนบสลิปการโอน'}
      </div>
      {preview && (
        <img src={preview} alt="ตัวอย่างสลิป" className="max-h-64 w-full rounded-md border bg-muted object-contain" />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      {file ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            upload.mutate()
          }}
        >
          <Field label="เลขอ้างอิงการโอน (ถ้ามี)" htmlFor="slip-note">
            <Input
              id="slip-note"
              value={note}
              maxLength={100}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เลขที่รายการจากสลิป"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setFile(null)} disabled={upload.isPending}>
              เลือกใหม่
            </Button>
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              ส่งสลิป
            </Button>
          </div>
        </form>
      ) : (
        <Button variant={retry ? 'default' : 'outline'} className="w-full sm:w-auto" onClick={() => inputRef.current?.click()}>
          <ImagePlus /> เลือกรูปสลิป
        </Button>
      )}
    </div>
  )
}
