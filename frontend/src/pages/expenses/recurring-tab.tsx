// รายจ่ายประจำ — ระบบสร้างรายการให้อัตโนมัติเดือนละครั้งเมื่อถึงวันที่กำหนด
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarSync, Loader2, MoreHorizontal, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { api, type RecurringExpense } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { baht, thDate, thisPeriod, today } from '@/lib/format'
import { nextRun } from '@/lib/expenses'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Field, StatCard } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { CategoryChip } from './parts'

const SHARED = 'shared'

export function RecurringTab() {
  const { readOnly } = useSession()
  const confirm = useConfirm()
  const list = useQuery({ queryKey: ['expenses', 'recurring'], queryFn: api.recurringExpenses })
  const [editing, setEditing] = useState<RecurringExpense | 'new' | null>(null)
  const rows = list.data ?? []
  const monthly = rows.filter((r) => r.is_active).reduce((s, r) => s + r.amount, 0)

  const toggle = useMutation({
    mutationFn: (r: RecurringExpense) => api.saveRecurringExpense({ ...r, is_active: !r.is_active }),
    onSuccess: () => invalidate('expenses'),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteRecurringExpense(id),
    onSuccess: async () => {
      toast.success('ลบรายจ่ายประจำแล้ว')
      await invalidate('expenses')
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          เช่น อินเทอร์เน็ต เงินเดือนแม่บ้าน ค่าดอกเบี้ย — ระบบบันทึกเป็นรายจ่ายให้อัตโนมัติเดือนละครั้งเมื่อถึงวันที่กำหนด
          แก้ไขยอดของแต่ละเดือนได้ภายหลังในแท็บรายการ
        </p>
        <Button className="w-full sm:ml-auto sm:w-auto" onClick={() => setEditing('new')} disabled={readOnly}>
          <Plus /> เพิ่มรายจ่ายประจำ
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <StatCard label="ต่อเดือน (ที่เปิดอยู่)" value={baht(monthly)} compact />
          <StatCard label="จำนวนรายการ" value={`${rows.filter((r) => r.is_active).length} / ${rows.length}`} compact />
        </div>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : !rows.length ? (
          <EmptyState
            icon={CalendarSync}
            title="ยังไม่มีรายจ่ายประจำ"
            description="ตั้งค่าครั้งเดียว ระบบบันทึกให้ทุกเดือน"
            action={
              <Button variant="outline" onClick={() => setEditing('new')} disabled={readOnly}>
                <Plus /> เพิ่มรายจ่ายประจำ
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const next = nextRun(r)
              return (
                <li key={r.id} className={cn('flex items-center gap-3 px-4 py-3', !r.is_active && 'opacity-60')}>
                  <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted/60 text-center leading-none">
                    <span className="text-[10px] text-muted-foreground">วันที่</span>
                    <span className="text-lg font-semibold tabular-nums">{r.day_of_month}</span>
                  </div>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{r.vendor || r.note || r.category_name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{baht(r.amount)}</span>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <CategoryChip name={r.category_name} />
                      <span className="truncate">{r.property_name ?? 'ส่วนกลาง'}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {!next
                        ? 'ปิดอยู่ — ไม่สร้างรายการ'
                        : next.due
                          ? 'ถึงกำหนดแล้ว — จะบันทึกภายในไม่กี่นาที'
                          : `ครั้งถัดไป ${thDate(next.date)}`}
                      {r.last_generated && ` · บันทึกล่าสุดเดือน ${r.last_generated}`}
                    </div>
                  </div>
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={() => toggle.mutate(r)}
                    disabled={readOnly || toggle.isPending}
                    aria-label={r.is_active ? 'ปิดรายจ่ายประจำ' : 'เปิดรายจ่ายประจำ'}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="ตัวเลือก" disabled={readOnly} className="-mr-2">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(r)}>
                        <Pencil /> แก้ไข
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={async () => {
                          if (
                            await confirm({
                              title: 'ลบรายจ่ายประจำ?',
                              description: 'รายจ่ายที่บันทึกไปแล้วยังอยู่ — แค่หยุดสร้างรายการใหม่',
                              confirmText: 'ลบ',
                              destructive: true,
                            })
                          )
                            remove.mutate(r.id)
                        }}
                      >
                        <Trash2 /> ลบ
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-md">
          {editing && (
            <RecurringForm item={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RecurringForm({ item, onDone }: { item: RecurringExpense | null; onDone: () => void }) {
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: api.expenseCategories })
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const [categoryId, setCategoryId] = useState(item ? String(item.category_id) : '')
  const [property, setProperty] = useState(item?.property_id ? String(item.property_id) : SHARED)
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [day, setDay] = useState(String(item?.day_of_month ?? 1))
  const [vendor, setVendor] = useState(item?.vendor ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [active, setActive] = useState(item?.is_active ?? true)
  const parsed = Number(amount.replace(/[,\s]/g, ''))

  const save = useMutation({
    mutationFn: () =>
      api.saveRecurringExpense({
        id: item?.id,
        category_id: Number(categoryId),
        property_id: property === SHARED ? null : Number(property),
        amount: parsed,
        day_of_month: Number(day),
        vendor: vendor.trim(),
        note: note.trim(),
        is_active: active,
      }),
    onSuccess: async () => {
      toast.success(item ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรายจ่ายประจำแล้ว')
      onDone()
      await invalidate('expenses', 'expense-categories')
    },
  })
  // รายการใหม่: ถ้าวันที่ของเดือนนี้ผ่านไปแล้ว เซิร์ฟเวอร์เริ่มสร้างเดือนหน้า
  const lastGenerated = item
    ? item.last_generated
    : Number(day) <= Number(today().slice(8, 10))
      ? thisPeriod()
      : null
  const preview = nextRun({ day_of_month: Number(day), is_active: active, last_generated: lastGenerated })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!(parsed > 0)) return toast.error('กรุณาระบุจำนวนเงิน')
        if (!categoryId) return toast.error('กรุณาเลือกหมวดรายจ่าย')
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{item ? 'แก้ไขรายจ่ายประจำ' : 'เพิ่มรายจ่ายประจำ'}</DialogTitle>
        <DialogDescription>บันทึกเป็นรายจ่ายอัตโนมัติทุกเดือนในวันที่กำหนด</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <Field label="จำนวนเงินต่อเดือน (บาท)" htmlFor="rc-amount">
          <Input
            id="rc-amount"
            className="h-10 text-lg font-semibold tabular-nums"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0"
          />
        </Field>
        <Field label="ทุกวันที่" htmlFor="rc-day">
          <Select value={day} onValueChange={(v) => v && setDay(v)}>
            <SelectTrigger id="rc-day" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 28 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="หมวด" htmlFor="rc-cat">
        <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)}>
          <SelectTrigger id="rc-cat" className="h-10 w-full">
            <SelectValue placeholder="เลือกหมวดรายจ่าย" />
          </SelectTrigger>
          <SelectContent>
            {categories.data
              ?.filter((c) => c.is_active || String(c.id) === categoryId)
              .map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="ค่าใช้จ่ายของ" htmlFor="rc-prop">
        <Select value={property} onValueChange={(v) => v && setProperty(v)}>
          <SelectTrigger id="rc-prop" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SHARED}>ส่วนกลาง (ทุกโครงการ)</SelectItem>
            {properties.data?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="จ่ายให้" htmlFor="rc-vendor">
        <Input id="rc-vendor" className="h-10" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="เช่น 3BB, แม่บ้านประจำ" />
      </Field>
      <Field label="รายละเอียด" htmlFor="rc-note">
        <Textarea id="rc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={active} onCheckedChange={setActive} />
        เปิดใช้งาน
        <span className="ml-auto text-xs text-muted-foreground">
          {preview ? (preview.due ? 'จะบันทึกเดือนนี้ภายในไม่กี่นาที' : `ครั้งถัดไป ${thDate(preview.date)}`) : 'ไม่สร้างรายการ'}
        </span>
      </label>
      {!item && Number(day) <= Number(today().slice(8, 10)) && (
        <p className="-mt-2 text-xs text-muted-foreground">
          วันที่ {day} ของเดือนนี้ผ่านไปแล้ว — เริ่มบันทึกเดือนหน้า (บันทึกเดือนนี้เองได้ในแท็บรายการ)
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          บันทึก
        </Button>
      </DialogFooter>
    </form>
  )
}
