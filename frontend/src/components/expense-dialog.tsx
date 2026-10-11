// บันทึก/แก้ไขรายจ่าย — ออกแบบให้กรอกเร็วบนมือถือ (ยอดเงินตัวใหญ่ ถ่ายรูปใบเสร็จได้ทันที)
import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Save, Wrench, X } from 'lucide-react'
import { api, type Expense, type ExpenseMethod } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { EXPENSE_METHODS } from '@/lib/expenses'
import { today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/common'
import { PhotoPicker } from '@/components/tickets/parts'

/** ค่าตั้งต้นเมื่อเปิดจากที่อื่น เช่น จากงานแจ้งซ่อม */
export interface ExpenseDefaults {
  ticket_id?: number | null
  ticket_title?: string | null
  property_id?: number | null
  unit_id?: number | null
  category_id?: number | null
  /** เลือกหมวดตามชื่อ (เช่น ซ่อมบำรุง) เมื่อไม่ระบุ category_id */
  category_name?: string
}

type Where = 'property' | 'shared'
const NONE = 'none'

export function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  defaults,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** มีค่า = แก้ไข */
  expense?: Expense | null
  defaults?: ExpenseDefaults
  onSaved?: (e: Expense) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-lg">
        {open && (
          <ExpenseForm
            expense={expense ?? null}
            defaults={defaults}
            onDone={(e) => {
              onOpenChange(false)
              if (e) onSaved?.(e)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ExpenseForm({
  expense,
  defaults,
  onDone,
}: {
  expense: Expense | null
  defaults?: ExpenseDefaults
  onDone: (e?: Expense) => void
}) {
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: api.expenseCategories })
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const units = useQuery({ queryKey: ['units', 'all'], queryFn: () => api.units() })
  const tickets = useQuery({ queryKey: ['tickets', 'list', {}], queryFn: () => api.tickets({}), meta: { silent: true } })

  const init = expense ?? defaults ?? {}
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [categoryId, setCategoryId] = useState<number | null>(init.category_id ?? null)
  const [date, setDate] = useState(expense?.expense_date ?? today())
  const [where, setWhere] = useState<Where>(expense && !expense.property_id ? 'shared' : 'property')
  const [propertyId, setPropertyId] = useState<number | null>(init.property_id ?? null)
  const [unitId, setUnitId] = useState<number | null>(init.unit_id ?? null)
  const [vendor, setVendor] = useState(expense?.vendor ?? '')
  const [note, setNote] = useState(expense?.note ?? '')
  const [method, setMethod] = useState<ExpenseMethod>(expense?.method ?? 'transfer')
  const [photos, setPhotos] = useState<File[]>([])
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const [ticketId, setTicketId] = useState<number | null>(init.ticket_id ?? null)

  // โครงการเดียว → เลือกให้เลย
  const props_ = properties.data ?? []
  const effectiveProperty = propertyId ?? (props_.length === 1 ? props_[0].id : null)

  const cats = useMemo(
    () => (categories.data ?? []).filter((c) => c.is_active || c.id === expense?.category_id),
    [categories.data, expense?.category_id],
  )
  const effectiveCategory =
    categoryId ??
    (defaults?.category_name
      ? (cats.find((c) => c.name === defaults.category_name) ?? cats.find((c) => c.name.includes('ซ่อม')))?.id
      : undefined) ??
    null
  const propUnits = useMemo(
    () =>
      (units.data ?? [])
        .filter((u) => u.property_id === effectiveProperty)
        .sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true })),
    [units.data, effectiveProperty],
  )
  const ticketOptions = useMemo(() => {
    const list = [...(tickets.data ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 60)
    if (ticketId && !list.some((t) => t.id === ticketId))
      list.unshift({
        id: ticketId,
        title: expense?.ticket_title ?? defaults?.ticket_title ?? `#${ticketId}`,
      } as (typeof list)[number])
    return list
  }, [tickets.data, ticketId, expense?.ticket_title, defaults?.ticket_title])
  const linkedTitle =
    ticketOptions.find((t) => t.id === ticketId)?.title ?? defaults?.ticket_title ?? expense?.ticket_title

  const pickTicket = (id: number | null) => {
    setTicketId(id)
    const t = tickets.data?.find((x) => x.id === id)
    // ใช้ห้อง/โครงการของงานซ่อม ถ้ายังไม่ได้เลือก
    if (t?.property_id && !propertyId) {
      setWhere('property')
      setPropertyId(t.property_id)
      setUnitId(t.unit_id)
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.set('amount', amount.replace(/[,\s฿]/g, ''))
      fd.set('category_id', String(effectiveCategory))
      fd.set('expense_date', date)
      if (where === 'property') {
        if (unitId) fd.set('unit_id', String(unitId))
        else if (effectiveProperty) fd.set('property_id', String(effectiveProperty))
      }
      fd.set('vendor', vendor.trim())
      fd.set('note', note.trim())
      fd.set('method', method)
      if (ticketId) fd.set('ticket_id', String(ticketId))
      if (photos[0]) fd.set('photo', photos[0])
      else if (expense && removeReceipt) fd.set('remove_receipt', '1')
      return expense ? api.updateExpense(expense.id, fd) : api.createExpense(fd)
    },
    onSuccess: async (e) => {
      toast.success(expense ? 'บันทึกการแก้ไขแล้ว' : 'บันทึกรายจ่ายแล้ว')
      onDone(e)
      await invalidate('expenses', 'dashboard', 'profit', 'expense-categories')
    },
  })

  const parsed = Number(amount.replace(/[,\s฿]/g, ''))
  const existingReceipt = expense?.receipt_url && !removeReceipt && !photos.length ? expense.receipt_url : null

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!(parsed > 0)) return toast.error('กรุณาระบุจำนวนเงิน')
        if (!effectiveCategory) return toast.error('กรุณาเลือกหมวดรายจ่าย')
        if (where === 'property' && !effectiveProperty) return toast.error('กรุณาเลือกโครงการ หรือเลือก “ส่วนกลาง”')
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{expense ? 'แก้ไขรายจ่าย' : 'บันทึกรายจ่าย'}</DialogTitle>
        <DialogDescription>
          {expense ? 'แนบรูปใหม่เพื่อแทนใบเสร็จเดิม' : 'ค่าซ่อม ค่าไฟส่วนกลาง เงินเดือน ฯลฯ — ถ่ายรูปใบเสร็จแนบไว้ได้'}
        </DialogDescription>
      </DialogHeader>

      <Field label="จำนวนเงิน (บาท)" htmlFor="ex-amount">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-2xl text-muted-foreground">
            ฿
          </span>
          <Input
            id="ex-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            autoFocus={!expense}
            className="h-14 pl-9 text-3xl font-semibold tracking-tight tabular-nums md:text-3xl"
            aria-invalid={(amount !== '' && !(parsed > 0)) || undefined}
          />
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label="หมวด" htmlFor="ex-cat">
          <Select value={effectiveCategory ? String(effectiveCategory) : ''} onValueChange={(v) => v && setCategoryId(Number(v))}>
            <SelectTrigger id="ex-cat" className="h-10 w-full">
              <SelectValue placeholder={categories.isLoading ? 'กำลังโหลด…' : 'เลือกหมวดรายจ่าย'} />
            </SelectTrigger>
            <SelectContent>
              {cats.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="วันที่จ่าย" htmlFor="ex-date">
          <Input id="ex-date" type="date" className="h-10" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>

      <Field label="ค่าใช้จ่ายของ">
        <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/50 p-1" role="radiogroup" aria-label="ค่าใช้จ่ายของ">
          {(
            [
              ['property', 'โครงการ / ห้อง'],
              ['shared', 'ส่วนกลาง'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={where === v}
              onClick={() => setWhere(v)}
              className={cn(
                'h-9 truncate rounded-sm px-2 text-sm transition-colors',
                where === v ? 'bg-card font-medium shadow-xs ring-1 ring-border' : 'text-muted-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {where === 'property' ? (
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <Select
              value={effectiveProperty ? String(effectiveProperty) : ''}
              onValueChange={(v) => {
                if (!v || Number(v) === effectiveProperty) return
                setPropertyId(Number(v))
                setUnitId(null)
              }}
            >
              <SelectTrigger className="h-10 w-full" aria-label="โครงการ">
                <SelectValue placeholder="เลือกโครงการ" />
              </SelectTrigger>
              <SelectContent>
                {props_.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={unitId ? String(unitId) : NONE}
              onValueChange={(v) => v && setUnitId(v === NONE ? null : Number(v))}
              disabled={!effectiveProperty}
            >
              <SelectTrigger className="h-10 w-full" aria-label="ห้อง (ไม่บังคับ)">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>ทั้งโครงการ</SelectItem>
                {propUnits.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    ห้อง {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            ไม่ผูกกับโครงการ — แสดงแยกในรายงานกำไรและหักจากกำไรรวม
          </p>
        )}
      </Field>

      <Field label="วิธีจ่าย">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="วิธีจ่าย">
          {(Object.keys(EXPENSE_METHODS) as ExpenseMethod[]).map((m) => (
            <Chip key={m} active={method === m} onClick={() => setMethod(m)}>
              {EXPENSE_METHODS[m]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="จ่ายให้ (ร้าน / ผู้รับเงิน)" htmlFor="ex-vendor">
        <Input
          id="ex-vendor"
          className="h-10"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="เช่น ร้านวัสดุ, การไฟฟ้าส่วนภูมิภาค"
        />
      </Field>

      <Field label="รายละเอียด" htmlFor="ex-note">
        <Textarea
          id="ex-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น เปลี่ยนก๊อกน้ำ ห้องน้ำชั้น 2"
        />
      </Field>

      <Field label="รูปใบเสร็จ">
        {existingReceipt ? (
          <div className="flex items-center gap-3">
            <a
              href={existingReceipt}
              target="_blank"
              rel="noreferrer"
              className="size-16 overflow-hidden rounded-md border bg-muted"
              aria-label="เปิดรูปใบเสร็จ"
            >
              <img src={existingReceipt} alt="" className="size-full object-cover" />
            </a>
            <div className="grid gap-1.5">
              <PhotoPicker files={photos} onChange={setPhotos} max={1} />
              <Button type="button" variant="ghost" size="sm" className="justify-start text-destructive" onClick={() => setRemoveReceipt(true)}>
                <X /> ลบรูปใบเสร็จ
              </Button>
            </div>
          </div>
        ) : (
          <>
            <PhotoPicker files={photos} onChange={setPhotos} max={1} large />
            {expense?.receipt_url && removeReceipt && !photos.length && (
              <p className="text-xs text-muted-foreground">
                จะลบรูปใบเสร็จเดิม ·{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => setRemoveReceipt(false)}>
                  เลิกทำ
                </button>
              </p>
            )}
          </>
        )}
      </Field>

      <Field label="งานแจ้งซ่อมที่เกี่ยวข้อง (ถ้ามี)" htmlFor="ex-ticket">
        {defaults?.ticket_id && ticketId === defaults.ticket_id ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
            <Wrench className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              #{ticketId} {linkedTitle}
            </span>
          </div>
        ) : (
          <Select value={ticketId ? String(ticketId) : NONE} onValueChange={(v) => v && pickTicket(v === NONE ? null : Number(v))}>
            <SelectTrigger id="ex-ticket" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>ไม่ผูกกับงานแจ้งซ่อม</SelectItem>
              {ticketOptions.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  #{t.id} {t.title}
                  {t.unit_name ? ` · ห้อง ${t.unit_name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          ยกเลิก
        </Button>
        <Button type="submit" className="h-11 sm:h-9" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {expense ? 'บันทึกการแก้ไข' : 'บันทึกรายจ่าย'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'h-9 rounded-md border px-3.5 text-sm whitespace-nowrap transition-colors',
        active
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
