// พอร์ทัลผู้เช่า: แจ้งชำระพร้อมแนบสลิป + สถานะการแจ้งชำระของบิล
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock, ImagePlus, Loader2, Printer, Upload, XCircle } from 'lucide-react'
import { api, type PortalNotice, type PortalSlipResult } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { sqlUtc } from '@/lib/billing'
import { dateTime } from '@/lib/docs'
import { baht } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, ToneBadge } from '@/components/common'
import { LineIcon } from '@/components/line'

/** ป้ายสถานะการแจ้งชำระในรายการบิล */
export function NoticeBadge({ notice }: { notice: PortalNotice | null }) {
  if (!notice) return null
  if (notice.status === 'pending') return <ToneBadge tone="ink">รอตรวจสลิป</ToneBadge>
  if (notice.status === 'rejected') return <ToneBadge tone="red">สลิปไม่ผ่าน</ToneBadge>
  return null
}

const at = (s: string) => dateTime(sqlUtc(s))

/**
 * ส่วนแจ้งชำระในหน้าบิล:
 * - ยังไม่แจ้ง / ถูกตีกลับ → ปุ่มแนบสลิป
 * - รอตรวจ → แสดงสถานะ
 */
export function PayWithSlip({
  token,
  invoiceId,
  amountDue,
  notice,
  lineLinked,
  autoStart,
}: {
  token: string
  invoiceId: number
  amountDue: number
  notice: PortalNotice | null
  lineLinked: boolean
  autoStart?: boolean
}) {
  const [step, setStep] = useState<'idle' | 'form'>(autoStart && notice?.status !== 'pending' ? 'form' : 'idle')
  const [result, setResult] = useState<PortalSlipResult | null>(null)

  if (result) return <SlipResult token={token} r={result} />
  if (step === 'form')
    return (
      <SlipForm
        token={token}
        invoiceId={invoiceId}
        amountDue={amountDue}
        onCancel={() => setStep('idle')}
        onDone={setResult}
      />
    )

  return (
    <div className="grid gap-3">
      {notice?.status === 'pending' ? (
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 px-3 py-3 text-sm">
          <Clock className="mt-0.5 size-5 shrink-0 text-info" />
          <div>
            <div className="font-medium">แจ้งชำระแล้ว รอเจ้าหน้าที่ตรวจสอบ</div>
            <div className="text-xs text-muted-foreground">
              ยอด {baht(notice.amount)} · ส่งเมื่อ {at(notice.created_at)}
            </div>
          </div>
        </div>
      ) : (
        <>
          {notice?.status === 'rejected' && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm">
              <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <div className="font-medium">สลิปที่ส่งไม่ผ่านการตรวจสอบ</div>
                {notice.reject_reason && <div className="text-muted-foreground">เหตุผล: {notice.reject_reason}</div>}
                <div className="mt-0.5 text-xs text-muted-foreground">ตรวจสอบแล้วแนบสลิปใหม่อีกครั้งได้เลย</div>
              </div>
            </div>
          )}
          <Button className="h-12 w-full text-base" onClick={() => setStep('form')}>
            <Upload /> {notice?.status === 'rejected' ? 'แนบสลิปใหม่' : 'แจ้งชำระ / แนบสลิป'}
          </Button>
        </>
      )}
      {lineLinked && (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <LineIcon className="size-3.5" /> หรือส่งรูปสลิปในแชต LINE ได้เลย
        </p>
      )}
    </div>
  )
}

function SlipForm({
  token,
  invoiceId,
  amountDue,
  onCancel,
  onDone,
}: {
  token: string
  invoiceId: number
  amountDue: number
  onCancel: () => void
  onDone: (r: PortalSlipResult) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // เปิดฟอร์มแล้วเลื่อนลงมาให้เห็นทันที (ฟอร์มอยู่ใต้ QR ในกล่องบิล)
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])
  const [file, setFile] = useState<File | null>(null)
  const [amount, setAmount] = useState(amountDue > 0 ? String(Math.round(amountDue * 100) / 100) : '')
  const [note, setNote] = useState('')
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  const amt = Number(amount.replace(/,/g, ''))
  const amountBad = amount.trim() !== '' && (!Number.isFinite(amt) || amt <= 0 || amt > amountDue + 0.005)

  const submit = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('photo', file!)
      if (amount.trim()) fd.set('amount', String(amt))
      if (note.trim()) fd.set('note', note.trim())
      return api.portal.submitSlip(token, invoiceId, fd)
    },
    meta: { silent: true },
    onSuccess: async (r) => {
      onDone(r)
      await queryClient.invalidateQueries({ queryKey: ['portal', token] })
    },
    onError: (e) => toast.error((e as Error).message || 'ส่งสลิปไม่สำเร็จ กรุณาลองใหม่'),
  })

  return (
    <form
      ref={formRef}
      className="grid scroll-mt-4 gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!file) return toast.error('กรุณาเลือกรูปสลิป')
        if (amountBad) return toast.error(`ยอดต้องมากกว่า 0 และไม่เกิน ${baht(amountDue)}`)
        submit.mutate()
      }}
    >
      <div className="text-sm font-medium">แนบสลิปการโอน</div>
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
      {preview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="overflow-hidden rounded-md border bg-muted"
          aria-label="เปลี่ยนรูปสลิป"
        >
          <img src={preview} alt="สลิปที่เลือก" className="max-h-80 w-full object-contain" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="grid h-36 place-items-center rounded-md border border-dashed bg-muted/40 text-sm text-muted-foreground"
        >
          <span className="grid justify-items-center gap-2">
            <ImagePlus className="size-7" />
            เลือกรูปสลิปจากเครื่อง
            <span className="text-xs">ภาพสลิปเต็มใบที่เห็น QR ชัดเจน</span>
          </span>
        </button>
      )}
      <Field
        label="ยอดที่โอน (บาท)"
        htmlFor="sl-amount"
        hint={amountBad ? <span className="text-destructive">ไม่เกิน {baht(amountDue)}</span> : `ยอดค้างชำระ ${baht(amountDue)}`}
      >
        <Input
          id="sl-amount"
          inputMode="decimal"
          className="h-11 bg-card tabular-nums"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={amountBad || undefined}
        />
      </Field>
      <Field label="หมายเหตุ (ถ้ามี)" htmlFor="sl-note">
        <Textarea id="sl-note" rows={2} className="bg-card" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" onClick={onCancel} disabled={submit.isPending}>
          ยกเลิก
        </Button>
        <Button type="submit" className="h-12" disabled={!file || submit.isPending}>
          {submit.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          ส่งสลิป
        </Button>
      </div>
    </form>
  )
}

function SlipResult({ token, r }: { token: string; r: PortalSlipResult }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  if (r.paid)
    return (
      <div
        ref={ref}
        className="grid justify-items-center gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-5 text-center">
        <CheckCircle2 className="size-9 text-success" />
        <div>
          <div className="font-semibold">ชำระเรียบร้อย ขอบคุณครับ/ค่ะ</div>
          <p className="mt-0.5 text-sm text-muted-foreground">ตรวจสลิปกับธนาคารแล้ว ออกใบเสร็จให้เรียบร้อย</p>
        </div>
        {r.receipt_id && (
          <Button asChild className="h-11 w-full">
            <Link to={`/p/${token}/print/receipt/${r.receipt_id}`}>
              <Printer /> ดูใบเสร็จ
            </Link>
          </Button>
        )}
      </div>
    )
  const res = r.check.result
  const warn = res === 'duplicate' || res === 'mismatch'
  return (
    <div ref={ref} className="grid gap-3">
      <div className="grid justify-items-center gap-2 rounded-lg border bg-muted/40 px-4 py-5 text-center">
        <Clock className="size-9 text-info" />
        <div className="font-semibold">ได้รับสลิปแล้ว รอเจ้าหน้าที่ตรวจสอบ</div>
        <p className="text-sm text-muted-foreground">
          ยอด {baht(r.notice.amount)} — เมื่อยืนยันแล้วจะออกใบเสร็จให้ในหน้านี้
        </p>
      </div>
      {(warn || res === 'unreadable') && (
        <div
          className={cn(
            'flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm',
            res === 'duplicate' && 'border-destructive/25 bg-destructive/5',
            res === 'mismatch' && 'border-warning/35 bg-warning/10',
          )}
        >
          <AlertTriangle
            className={cn(
              'mt-0.5 size-4 shrink-0',
              res === 'duplicate' ? 'text-destructive' : res === 'mismatch' ? 'text-warning' : 'text-muted-foreground',
            )}
          />
          <span>
            {res === 'duplicate'
              ? 'สลิปนี้เคยถูกใช้แจ้งชำระแล้ว — หากส่งผิดรูป กรุณาติดต่อเจ้าหน้าที่'
              : res === 'mismatch'
                ? 'ยอดเงินบนสลิปไม่ตรงกับยอดที่แจ้ง — เจ้าหน้าที่จะตรวจสอบอีกครั้ง'
                : 'ระบบอ่าน QR บนสลิปไม่ได้ — เจ้าหน้าที่จะตรวจจากรูปแทน'}
          </span>
        </div>
      )}
    </div>
  )
}
