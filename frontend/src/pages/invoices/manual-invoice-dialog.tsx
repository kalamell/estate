import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Plus, X } from 'lucide-react'
import { api, type Invoice, type LineItemInput } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { addDays, baht, thisPeriod, today } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Field } from '@/components/common'

const PRESETS = ['ค่าซ่อมแซม', 'ค่าทำความสะอาด', 'ค่าปรับ', 'ค่าเช่าเพิ่มเติม']
const blank = (label = ''): LineItemInput => ({ label, qty: 1, unit_price: 0, vatable: false })

export function ManualInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated?: (inv: Invoice) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        {open && <ManualForm onOpenChange={onOpenChange} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  )
}

function ManualForm({
  onOpenChange,
  onCreated,
}: {
  onOpenChange: (o: boolean) => void
  onCreated?: (inv: Invoice) => void
}) {
  const { orgInfo } = useSession()
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const [propertyId, setPropertyId] = useState<string>('')
  const pid = propertyId || (properties.data?.[0] ? String(properties.data[0].id) : '')
  const units = useQuery({
    queryKey: ['units', Number(pid)],
    queryFn: () => api.units(Number(pid)),
    enabled: !!pid,
  })
  const [unitId, setUnitId] = useState('')
  const [dueDate, setDueDate] = useState(addDays(today(), 7))
  const [period, setPeriod] = useState(thisPeriod())
  const [items, setItems] = useState<LineItemInput[]>([blank()])

  const vatOn = !!orgInfo?.org.vat_registered
  const vatRate = orgInfo?.org.vat_rate ?? 7
  const totals = useMemo(() => {
    let sub = 0
    let vatBase = 0
    for (const it of items) {
      const a = (Number(it.qty) || 0) * (Number(it.unit_price) || 0)
      sub += a
      if (it.vatable) vatBase += a
    }
    const vat = vatOn ? Math.round(vatBase * vatRate) / 100 : 0
    return { sub, vat, total: sub + vat }
  }, [items, vatOn, vatRate])

  const update = (i: number, patch: Partial<LineItemInput>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const valid = items.filter((i) => i.label.trim() && Number(i.qty) > 0)
  const create = useMutation({
    mutationFn: () =>
      api.createInvoice({
        unit_id: Number(unitId),
        due_date: dueDate,
        ...(period ? { period } : {}),
        items: valid.map((i) => ({
          label: i.label.trim(),
          qty: Number(i.qty),
          unit_price: Number(i.unit_price),
          vatable: i.vatable,
        })),
      }),
    onSuccess: async (inv) => {
      toast.success(`สร้างใบแจ้งหนี้ ${inv.doc_no ?? ''} แล้ว`)
      await invalidate('invoices', 'dashboard')
      onOpenChange(false)
      onCreated?.(inv)
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!unitId) return toast.error('เลือกห้องก่อน')
        if (!valid.length) return toast.error('เพิ่มอย่างน้อย 1 รายการ')
        create.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>สร้างใบแจ้งหนี้</DialogTitle>
        <DialogDescription>สำหรับค่าใช้จ่ายนอกรอบบิล เช่น ค่าซ่อม ค่าทำความสะอาด หรือค่าบริการเพิ่มเติม</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="โครงการ" htmlFor="m-prop">
          <Select
            value={pid}
            onValueChange={(v) => {
              setPropertyId(v)
              setUnitId('')
            }}
          >
            <SelectTrigger id="m-prop" className="w-full">
              <SelectValue placeholder="เลือกโครงการ" />
            </SelectTrigger>
            <SelectContent>
              {properties.data?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ห้อง" htmlFor="m-unit">
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger id="m-unit" className="w-full">
              <SelectValue placeholder="เลือกห้อง" />
            </SelectTrigger>
            <SelectContent>
              {units.data?.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name} <span className="text-muted-foreground">· ชั้น {u.floor}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ครบกำหนดชำระ" htmlFor="m-due">
          <Input id="m-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </Field>
        <Field label="รอบบิล (ถ้ามี)" htmlFor="m-period">
          <Input id="m-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">รายการ</div>
        <div className="divide-y rounded-md border">
          <div className="hidden grid-cols-[1fr_4.5rem_7rem_3rem_2rem] gap-2 bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground sm:grid">
            <span>รายการ</span>
            <span className="text-right">จำนวน</span>
            <span className="text-right">ราคาต่อหน่วย</span>
            <span className="text-center">VAT</span>
            <span />
          </div>
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_4rem_6rem_2rem] items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_4.5rem_7rem_3rem_2rem]"
            >
              <Input
                className="col-span-4 h-8 sm:col-span-1"
                value={it.label}
                placeholder="ชื่อรายการ"
                aria-label="ชื่อรายการ"
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <Input
                className="h-8 text-right tabular-nums"
                type="number"
                min={0}
                step="any"
                value={it.qty}
                aria-label="จำนวน"
                onChange={(e) => update(i, { qty: e.target.value === '' ? 0 : Number(e.target.value) })}
              />
              <Input
                className="h-8 text-right tabular-nums"
                type="number"
                min={0}
                step="0.01"
                value={it.unit_price}
                aria-label="ราคาต่อหน่วย"
                onChange={(e) => update(i, { unit_price: e.target.value === '' ? 0 : Number(e.target.value) })}
              />
              <label className="flex items-center justify-center">
                <Checkbox
                  checked={it.vatable}
                  onCheckedChange={(v) => update(i, { vatable: v === true })}
                  aria-label="คิด VAT"
                />
              </label>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : [blank()]))}
                aria-label="ลบรายการ"
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setItems((xs) => [...xs, blank()])}>
            <Plus /> เพิ่มรายการ
          </Button>
          {PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() =>
                setItems((xs) => (xs.length === 1 && !xs[0].label ? [blank(p)] : [...xs, blank(p)]))
              }
            >
              + {p}
            </Button>
          ))}
        </div>
      </div>

      <dl className="ml-auto grid w-full max-w-xs gap-1 text-sm tabular-nums">
        <div className="flex">
          <dt className="text-muted-foreground">รวม</dt>
          <dd className="ml-auto">{baht(totals.sub)}</dd>
        </div>
        {vatOn && (
          <div className="flex">
            <dt className="text-muted-foreground">VAT {vatRate}% (ประมาณ)</dt>
            <dd className="ml-auto">{baht(totals.vat)}</dd>
          </div>
        )}
        <div className="flex border-t pt-1 font-semibold">
          <dt>ยอดรวมทั้งสิ้น</dt>
          <dd className="ml-auto">{baht(totals.total)}</dd>
        </div>
      </dl>
      {!vatOn && items.some((i) => i.vatable) && (
        <p className="text-xs text-muted-foreground">
          องค์กรยังไม่ได้ตั้งค่าจดทะเบียน VAT — ระบบจะไม่คิดภาษี (ตั้งค่าได้ที่ ตั้งค่าองค์กร → ข้อมูลผู้ออกเอกสาร & ภาษี)
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && <Loader2 className="animate-spin" />}
          สร้างใบแจ้งหนี้
        </Button>
      </DialogFooter>
    </form>
  )
}
