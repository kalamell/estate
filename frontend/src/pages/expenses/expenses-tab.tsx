import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BanknoteArrowDown, Download, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { api, type Expense, type ExpenseFilter } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { baht, thDate } from '@/lib/format'
import { EXPENSE_METHODS, RANGE_PRESETS, placeOf, presetRange, type RangePreset } from '@/lib/expenses'
import { readLS, writeLS } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, StatCard } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { CategoryBars } from '@/components/chart-parts'
import { ExpenseDialog } from '@/components/expense-dialog'
import { CategoryChip, ReceiptThumb, RecurringBadge, TicketLink } from './parts'

const ALL = 'all'
const SHARED = 'shared'
const LS_PRESET = 'estate.expenseRange'

export function ExpensesTab() {
  const { readOnly } = useSession()
  const confirm = useConfirm()
  const [preset, setPresetState] = useState<RangePreset>(() => {
    const v = readLS(LS_PRESET) as RangePreset | null
    return v && v in RANGE_PRESETS ? v : 'this_month'
  })
  const [custom, setCustom] = useState(() => presetRange('this_month'))
  const [property, setProperty] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [editing, setEditing] = useState<Expense | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const setPreset = (v: RangePreset) => {
    setPresetState(v)
    writeLS(LS_PRESET, v)
  }
  const range = preset === 'custom' ? custom : presetRange(preset)
  const filter: ExpenseFilter = {
    from: range.from,
    to: range.to,
    property_id: property !== ALL && property !== SHARED ? property : '',
    scope: property === SHARED ? 'shared' : '',
    category_id: category === ALL ? '' : category,
    q: term,
  }

  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: api.expenseCategories })
  const list = useQuery({
    queryKey: ['expenses', filter],
    queryFn: () => api.expenses(filter),
    placeholderData: keepPreviousData,
  })
  const rows = list.data?.expenses ?? []
  const withReceipt = rows.filter((e) => e.receipt_url).length

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteExpense(id),
    onSuccess: async () => {
      toast.success('ลบรายจ่ายแล้ว')
      await invalidate('expenses', 'dashboard', 'profit', 'expense-categories')
    },
  })
  const askDelete = async (e: Expense) => {
    if (
      await confirm({
        title: `ลบรายจ่าย ${baht(e.amount)}?`,
        description: `${e.category_name} · ${thDate(e.expense_date)}${e.vendor ? ` · ${e.vendor}` : ''} — การลบจะถูกบันทึกในประวัติการใช้งาน`,
        confirmText: 'ลบรายจ่าย',
        destructive: true,
      })
    )
      remove.mutate(e.id)
  }

  const actions = (e: Expense) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="ตัวเลือก" disabled={readOnly} onClick={(ev) => ev.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setEditing(e)}>
          <Pencil /> แก้ไข
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => void askDelete(e)}>
          <Trash2 /> ลบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const rangeLabel =
    preset === 'custom' ? `${thDate(range.from)} – ${thDate(range.to)}` : RANGE_PRESETS[preset]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="ช่วงเวลา" htmlFor="ex-range" className="w-[calc(50%-0.375rem)] sm:w-36">
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger id="ex-range" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGE_PRESETS) as RangePreset[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {RANGE_PRESETS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="โครงการ" htmlFor="ex-prop" className="w-[calc(50%-0.375rem)] sm:w-48">
          <Select value={property} onValueChange={setProperty}>
            <SelectTrigger id="ex-prop" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกโครงการ</SelectItem>
              <SelectItem value={SHARED}>ส่วนกลาง</SelectItem>
              {properties.data?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {preset === 'custom' && (
          <div className="flex w-full gap-3 sm:w-auto">
            <Field label="ตั้งแต่วันที่" htmlFor="ex-from" className="flex-1">
              <Input
                id="ex-from"
                type="date"
                className="bg-card"
                value={custom.from}
                max={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
            </Field>
            <Field label="ถึงวันที่" htmlFor="ex-to" className="flex-1">
              <Input
                id="ex-to"
                type="date"
                className="bg-card"
                value={custom.to}
                min={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </Field>
          </div>
        )}
        <Field label="หมวด" htmlFor="ex-cat-f" className="w-full sm:w-52">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="ex-cat-f" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกหมวด</SelectItem>
              {categories.data?.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                  {!c.is_active && ' (ปิดใช้)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาผู้รับเงิน / รายละเอียด"
            className="bg-card pr-9 pl-9"
            aria-label="ค้นหารายจ่าย"
            inputMode="search"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
              aria-label="ล้างคำค้น"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <a href={api.expenseExportUrl(filter)} download>
              <Download /> CSV
            </a>
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => setAddOpen(true)} disabled={readOnly}>
            <Plus /> บันทึกรายจ่าย
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label={`รายจ่ายรวม · ${rangeLabel}`}
          value={list.data ? baht(list.data.total) : <Skeleton className="h-8 w-32" />}
          sub={list.data ? `${rows.length} รายการ · มีใบเสร็จ ${withReceipt}` : undefined}
          className="justify-center"
        />
        <Card className="gap-3 py-4 lg:col-span-2">
          <CardHeader className="px-5">
            <CardTitle className="text-sm">หมวดที่จ่ายมากที่สุด</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            {list.data ? (
              <CategoryBars items={list.data.by_category} total={list.data.total} limit={4} />
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-6" />
                <Skeleton className="h-6" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !rows.length ? (
          <EmptyState
            icon={term ? Search : BanknoteArrowDown}
            title={term ? 'ไม่พบรายจ่ายที่ค้นหา' : 'ยังไม่มีรายจ่ายในช่วงนี้'}
            description="บันทึกค่าซ่อม ค่าไฟส่วนกลาง เงินเดือน ฯลฯ เพื่อดูกำไรต่อโครงการในหน้ารายงาน"
            action={
              !term && (
                <Button variant="outline" onClick={() => setAddOpen(true)} disabled={readOnly}>
                  <Plus /> บันทึกรายจ่าย
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* เดสก์ท็อป: ตาราง */}
            <Table className="hidden md:table">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">วันที่</TableHead>
                  <TableHead>หมวด / ที่</TableHead>
                  <TableHead>รายละเอียด</TableHead>
                  <TableHead className="hidden lg:table-cell">วิธีจ่าย</TableHead>
                  <TableHead className="w-14">ใบเสร็จ</TableHead>
                  <TableHead className="text-right">จำนวนเงิน</TableHead>
                  <TableHead className="w-10 pr-4">
                    <span className="sr-only">ตัวเลือก</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-4 align-top whitespace-nowrap tabular-nums">{thDate(e.expense_date)}</TableCell>
                    <TableCell className="max-w-56 align-top">
                      <CategoryChip name={e.category_name} />
                      <div className={cn('mt-1 truncate text-xs', e.property_name ? 'text-foreground' : 'text-muted-foreground')}>
                        {placeOf(e)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72 align-top whitespace-normal">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{e.vendor || (e.note ? '' : '—')}</span>
                        {e.recurring_id && <RecurringBadge />}
                      </div>
                      {e.note && <div className="line-clamp-2 text-xs text-muted-foreground">{e.note}</div>}
                      {e.ticket_id && <TicketLink id={e.ticket_id} title={e.ticket_title} />}
                      {e.created_by_name && (
                        <div className="text-[11px] text-muted-foreground">บันทึกโดย {e.created_by_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden align-top text-muted-foreground lg:table-cell">
                      {EXPENSE_METHODS[e.method] ?? e.method}
                    </TableCell>
                    <TableCell className="align-top">
                      <ReceiptThumb url={e.receipt_url} />
                    </TableCell>
                    <TableCell className="text-right align-top font-medium tabular-nums">{baht(e.amount)}</TableCell>
                    <TableCell className="pr-4 align-top">{actions(e)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* มือถือ: การ์ด */}
            <ul className="divide-y md:hidden">
              {rows.map((e) => (
                <li key={e.id} className="flex gap-3 px-4 py-3">
                  <ReceiptThumb url={e.receipt_url} className="size-12" />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {e.vendor || e.note || e.category_name}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{baht(e.amount)}</span>
                    </div>
                    {e.vendor && e.note && <div className="truncate text-xs text-muted-foreground">{e.note}</div>}
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <CategoryChip name={e.category_name} />
                      {e.recurring_id && <RecurringBadge />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {thDate(e.expense_date)} · {placeOf(e)} · {EXPENSE_METHODS[e.method] ?? e.method}
                    </div>
                    {e.ticket_id && <TicketLink id={e.ticket_id} title={e.ticket_title} />}
                  </div>
                  <div className="-mr-2 shrink-0 self-center">{actions(e)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <ExpenseDialog open={addOpen} onOpenChange={setAddOpen} />
      <ExpenseDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} expense={editing} />
    </div>
  )
}
