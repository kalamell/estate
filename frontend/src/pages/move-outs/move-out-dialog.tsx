import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Info, Loader2, Plus, X } from 'lucide-react'
import { api, type Booking, type Deduction, type MoveOut } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { addDays, baht, thDateLong, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/common'

const PRESETS = ['ทำความสะอาด', 'ซ่อมแซม', 'กุญแจหาย', 'ค่าไฟ/น้ำงวดสุดท้าย']

export function MoveOutDialog({
  open,
  onOpenChange,
  bookingId,
  moveOut,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** เริ่มจากการจองนี้ */
  bookingId?: number | null
  /** แก้ไขฉบับร่าง */
  moveOut?: MoveOut | null
  onSaved?: (m: MoveOut) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        {open && (
          <MoveOutForm
            initialBookingId={moveOut?.booking_id ?? bookingId ?? null}
            moveOut={moveOut ?? null}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MoveOutForm({
  initialBookingId,
  moveOut,
  onClose,
  onSaved,
}: {
  initialBookingId: number | null
  moveOut: MoveOut | null
  onClose: () => void
  onSaved?: (m: MoveOut) => void
}) {
  const editing = !!moveOut
  const active = useQuery({
    queryKey: ['bookings', { status: 'active' }],
    queryFn: () => api.bookings({ status: 'active' }),
    enabled: !editing,
  })
  const [bookingId, setBookingId] = useState<number | null>(initialBookingId)
  const booking: Booking | undefined = active.data?.find((b) => b.id === bookingId)
  const [date, setDate] = useState(moveOut?.move_out_date?.slice(0, 10) ?? today())
  const [deductions, setDeductions] = useState<Deduction[]>(moveOut?.deductions ?? [])
  const [includeOutstanding, setIncludeOutstanding] = useState(moveOut?.include_outstanding ?? true)
  const [note, setNote] = useState(moveOut?.note ?? '')

  // ยอดค้างโดยประมาณจากใบแจ้งหนี้ที่ยังไม่ชำระของการจองนี้ (เซิร์ฟเวอร์คำนวณยอดจริง)
  const unpaid = useQuery({
    queryKey: ['invoices', { status: 'unpaid', booking: bookingId }],
    queryFn: () => api.invoices({ status: 'unpaid' }),
    enabled: !editing && bookingId != null,
    select: (list) => list.filter((i) => i.booking_id === bookingId),
  })
  const outstanding = editing
    ? moveOut!.outstanding_total
    : (unpaid.data ?? []).reduce((s, i) => s + Math.max(0, i.total - (i.paid_amount || 0)), 0)
  const deposit = editing ? moveOut!.deposit_amount : (booking?.deposit_amount ?? 0)

  const deductionsTotal = useMemo(
    () => deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    [deductions],
  )
  const refund = deposit - deductionsTotal - (includeOutstanding ? outstanding : 0)
  const dueDate = date ? addDays(date, 7) : ''

  const update = (i: number, p: Partial<Deduction>) =>
    setDeductions((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)))

  const save = useMutation({
    mutationFn: () => {
      const body = {
        booking_id: bookingId!,
        move_out_date: date,
        deductions: deductions
          .filter((d) => d.label.trim() && Number(d.amount) > 0)
          .map((d) => ({ label: d.label.trim(), amount: Number(d.amount) })),
        include_outstanding: includeOutstanding,
        note: note.trim(),
      }
      return editing ? api.updateMoveOut(moveOut!.id, body) : api.createMoveOut(body)
    },
    onSuccess: async (m) => {
      toast.success(editing ? 'บันทึกการแก้ไขแล้ว' : 'สร้างรายการย้ายออก (ฉบับร่าง) แล้ว')
      await invalidate('move-outs', 'move-out', 'bookings')
      onSaved?.(m)
      onClose()
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!bookingId) return toast.error('เลือกการจองที่จะย้ายออก')
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{editing ? 'แก้ไขการย้ายออก' : 'เริ่มย้ายออก & คืนมัดจำ'}</DialogTitle>
        <DialogDescription>
          {editing
            ? `${moveOut!.tenant_name} · ห้อง ${moveOut!.unit_name} · ${moveOut!.property_name}`
            : 'สรุปค่าใช้จ่ายที่หักจากเงินประกัน และยอดคืนผู้เช่า'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <Field label="สัญญา / การจอง" htmlFor="mo-booking" className="sm:col-span-2">
            <Select value={bookingId ? String(bookingId) : ''} onValueChange={(v) => setBookingId(Number(v))}>
              <SelectTrigger id="mo-booking" className="w-full">
                <SelectValue placeholder={active.isLoading ? 'กำลังโหลด…' : 'เลือกผู้เช่าที่กำลังเข้าพัก'} />
              </SelectTrigger>
              <SelectContent>
                {active.data?.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.tenant_name} · ห้อง {b.unit_name} · {b.property_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="วันที่ย้ายออก" htmlFor="mo-date">
          <Input id="mo-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="เงินประกันที่รับไว้">
          <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium tabular-nums">
            {baht(deposit)}
          </div>
        </Field>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">รายการหัก</div>
        {deductions.length > 0 && (
          <div className="mb-2 divide-y rounded-md border">
            {deductions.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2 px-3 py-2">
                <Input
                  className="h-8"
                  value={d.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="รายการ"
                  aria-label="รายการหัก"
                />
                <Input
                  className="h-8 text-right tabular-nums"
                  type="number"
                  min={0}
                  step="0.01"
                  value={d.amount}
                  onChange={(e) => update(i, { amount: e.target.value === '' ? 0 : Number(e.target.value) })}
                  aria-label="จำนวนเงิน"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeductions((ds) => ds.filter((_, j) => j !== i))}
                  aria-label="ลบรายการ"
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {PRESETS.filter((p) => !deductions.some((d) => d.label === p)).map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDeductions((ds) => [...ds, { label: p, amount: 0 }])}
            >
              + {p}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setDeductions((ds) => [...ds, { label: '', amount: 0 }])}
          >
            <Plus /> อื่นๆ
          </Button>
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm">
        <Switch checked={includeOutstanding} onCheckedChange={setIncludeOutstanding} />
        <span>
          หักค่าใช้จ่ายค้างชำระตามใบแจ้งหนี้
          <span className="block text-xs text-muted-foreground">
            {editing ? 'ยอดค้าง' : 'ยอดค้างโดยประมาณ'} {baht(outstanding)}
            {!editing && unpaid.data ? ` จาก ${unpaid.data.length} ใบ` : ''}
          </span>
        </span>
      </label>

      <dl className="grid gap-1 rounded-md border bg-muted/40 p-3 text-sm tabular-nums">
        <div className="flex">
          <dt className="text-muted-foreground">เงินประกัน</dt>
          <dd className="ml-auto">{baht(deposit)}</dd>
        </div>
        <div className="flex">
          <dt className="text-muted-foreground">หัก รายการหัก</dt>
          <dd className="ml-auto">−{baht(deductionsTotal)}</dd>
        </div>
        {includeOutstanding && (
          <div className="flex">
            <dt className="text-muted-foreground">หัก ค้างชำระ</dt>
            <dd className="ml-auto">−{baht(outstanding)}</dd>
          </div>
        )}
        <div className={cn('mt-1 flex border-t pt-2 font-semibold', refund < 0 && 'text-destructive')}>
          <dt>{refund >= 0 ? 'คืนผู้เช่า' : 'ผู้เช่าต้องชำระเพิ่ม'}</dt>
          <dd className="ml-auto text-base">{baht(Math.abs(refund))}</dd>
        </div>
      </dl>

      {dueDate && (
        <p className="flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            กฎหมายกำหนดคืนเงินประกันภายใน 7 วันนับจากวันสิ้นสุดสัญญา — ครบกำหนด{' '}
            <span className="font-medium text-foreground">{thDateLong(dueDate)}</span>
          </span>
        </p>
      )}

      <Field label="หมายเหตุ" htmlFor="mo-note">
        <Textarea id="mo-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={save.isPending || !bookingId}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {editing ? 'บันทึก' : 'บันทึกฉบับร่าง'}
        </Button>
      </DialogFooter>
    </form>
  )
}
