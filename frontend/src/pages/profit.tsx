// รายงานกำไร: รายรับ (รับชำระจริง) − รายจ่าย ต่อเดือน ต่อโครงการ และตามหมวด — แท็บ "กำไร" ในหน้ารายงาน
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { ArrowRight, Scale, Table2, TrendingUp } from 'lucide-react'
import { ApiError, api, type ProfitReport as Profit } from '@/lib/api'
import { addMonths, baht, signedBaht, thPeriod, thisPeriod } from '@/lib/format'
import { AXIS_TICK, compact, monthShort } from '@/lib/chart'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, StatCard, StatCardSkeleton, UpsellCard } from '@/components/common'
import { CategoryBars, LegendKey, TooltipBox } from '@/components/chart-parts'

const ALL = 'all'
type Preset = 'm3' | 'm6' | 'm12' | 'this_year' | 'last_year' | 'custom'
const PRESETS: Record<Preset, string> = {
  m3: '3 เดือนล่าสุด',
  m6: '6 เดือนล่าสุด',
  m12: '12 เดือนล่าสุด',
  this_year: 'ปีนี้',
  last_year: 'ปีที่แล้ว',
  custom: 'กำหนดเอง',
}

function presetMonths(p: Exclude<Preset, 'custom'>) {
  const cur = thisPeriod()
  const y = Number(cur.slice(0, 4))
  switch (p) {
    case 'm3':
      return { from: addMonths(cur, -2), to: cur }
    case 'm6':
      return { from: addMonths(cur, -5), to: cur }
    case 'm12':
      return { from: addMonths(cur, -11), to: cur }
    case 'this_year':
      return { from: `${y}-01`, to: cur }
    case 'last_year':
      return { from: `${y - 1}-01`, to: `${y - 1}-12` }
  }
}

const INCOME = 'var(--chart-1)'
const EXPENSE = 'var(--chart-2)'
const NET = 'var(--chart-4)'

const marginText = (m: number | null | undefined) => (m == null ? '—' : `${Math.round(m)}%`)

export function ProfitReport() {
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const [propertyId, setPropertyId] = useState(ALL)
  const [preset, setPreset] = useState<Preset>('m12')
  const [custom, setCustom] = useState(() => presetMonths('m6'))
  const range = preset === 'custom' ? custom : presetMonths(preset)
  const filter = { ...range, property_id: propertyId === ALL ? '' : propertyId }
  const valid = !!range.from && !!range.to && range.from <= range.to
  const { data, isLoading, error } = useQuery({
    queryKey: ['profit', filter],
    queryFn: () => api.profitReport(filter),
    enabled: valid,
    meta: { silent: true },
  })

  if (error instanceof ApiError && error.status === 402)
    return (
      <UpsellCard
        title="รายงานกำไรไม่รวมในแพ็กเกจปัจจุบัน"
        description="อัปเกรดแพ็กเกจเพื่อดูกำไรต่อโครงการ รายจ่ายตามหมวด และเปรียบเทียบรายรับกับรายจ่ายรายเดือน"
      />
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="โครงการ" htmlFor="pf-prop" className="w-full sm:w-56">
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger id="pf-prop" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกโครงการ (รวมส่วนกลาง)</SelectItem>
              {properties.data?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ช่วงเวลา" htmlFor="pf-range" className="w-full sm:w-44">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger id="pf-range" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRESETS) as Preset[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {PRESETS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {preset === 'custom' && (
          <div className="flex w-full gap-2 sm:w-auto">
            <Field label="ตั้งแต่เดือน" htmlFor="pf-from" className="flex-1 sm:w-40 sm:flex-none">
              <Input
                id="pf-from"
                type="month"
                className="bg-card"
                value={custom.from}
                max={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
            </Field>
            <Field label="ถึงเดือน" htmlFor="pf-to" className="flex-1 sm:w-40 sm:flex-none">
              <Input
                id="pf-to"
                type="month"
                className="bg-card"
                value={custom.to}
                min={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </Field>
          </div>
        )}
        <Button asChild variant="outline" className="w-full sm:ml-auto sm:w-auto">
          <Link to="/expenses">
            รายการรายจ่าย <ArrowRight />
          </Link>
        </Button>
      </div>

      {!valid ? (
        <Card>
          <EmptyState icon={Scale} title="เลือกช่วงเดือนให้ถูกต้อง" description="เดือนเริ่มต้องไม่หลังเดือนสิ้นสุด" />
        </Card>
      ) : error ? (
        <Card>
          <EmptyState icon={Scale} title="โหลดรายงานไม่สำเร็จ" description={(error as Error).message} />
        </Card>
      ) : isLoading || !data ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <Skeleton className="h-80 rounded-lg" />
        </>
      ) : (
        <ProfitBody data={data} allProperties={propertyId === ALL} />
      )}
    </div>
  )
}

function ProfitBody({ data, allProperties }: { data: Profit; allProperties: boolean }) {
  const [asTable, setAsTable] = useState(false)
  const rows = useMemo(() => data.months.map((m) => ({ ...m, label: monthShort(m.month) })), [data.months])
  const t = data.totals
  const span = data.from === data.to ? thPeriod(data.from) : `${thPeriod(data.from)} – ${thPeriod(data.to)}`
  const hasNegative = rows.some((r) => r.net < 0)
  const empty = !t.income && !t.expense

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="รายรับ" value={baht(t.income)} sub={`รับชำระจริง · ${span}`} />
        <StatCard
          label="รายจ่าย"
          value={baht(t.expense)}
          sub={allProperties && data.shared_expense ? `รวมส่วนกลาง ${baht(data.shared_expense)}` : span}
        />
        <StatCard
          label="กำไรสุทธิ"
          tone={t.net < 0 ? 'danger' : t.net > 0 ? 'success' : 'default'}
          value={signedBaht(t.net)}
          sub="รายรับ − รายจ่าย"
        />
        <StatCard
          label="อัตรากำไร (margin)"
          tone={t.margin != null && t.margin < 0 ? 'danger' : 'default'}
          value={marginText(t.margin)}
          sub={t.margin == null ? 'ยังไม่มีรายรับในช่วงนี้' : 'กำไรสุทธิ ÷ รายรับ'}
        />
      </div>

      <Card className="gap-4">
        <CardHeader className="flex flex-row flex-wrap items-start gap-3">
          <div>
            <CardTitle>รายรับเทียบรายจ่าย</CardTitle>
            <CardDescription>รายเดือน · เส้นคือกำไรสุทธิ</CardDescription>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <LegendKey color={INCOME} label="รายรับ" />
            <LegendKey color={EXPENSE} label="รายจ่าย" />
            <LegendKey color={NET} label="กำไรสุทธิ" line />
            <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
              {asTable ? <TrendingUp /> : <Table2 />}
              {asTable ? 'ดูกราฟ' : 'ดูตาราง'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {empty ? (
            <EmptyState
              icon={TrendingUp}
              title="ยังไม่มีรายรับหรือรายจ่ายในช่วงนี้"
              description="บันทึกรายจ่ายและรับชำระบิลเพื่อดูกำไร"
            />
          ) : asTable ? (
            <MonthlyTable rows={rows} />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                  <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={compact} tick={AXIS_TICK} />
                  {hasNegative && <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />}
                  <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={ProfitTooltip} />
                  <Bar dataKey="income" name="รายรับ" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="expense" name="รายจ่าย" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Line
                    type="monotone"
                    dataKey="net"
                    name="กำไรสุทธิ"
                    stroke={NET}
                    strokeWidth={2}
                    dot={{ r: 3, fill: NET, stroke: 'var(--card)', strokeWidth: 2 }}
                    activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="gap-0 overflow-hidden pb-0 lg:col-span-3">
          <CardHeader className="pb-4">
            <CardTitle>กำไรต่อโครงการ</CardTitle>
            <CardDescription>
              {allProperties
                ? 'ค่าใช้จ่ายส่วนกลางแสดงแยก และหักในยอดรวม'
                : 'เฉพาะโครงการที่เลือก — ไม่รวมค่าใช้จ่ายส่วนกลาง'}
            </CardDescription>
          </CardHeader>
          <PropertyTable data={data} showShared={allProperties} />
        </Card>

        <Card className="gap-4 lg:col-span-2">
          <CardHeader className="flex flex-row items-start gap-3">
            <div>
              <CardTitle>รายจ่ายตามหมวด</CardTitle>
              <CardDescription>{span}</CardDescription>
            </div>
            <Link to="/expenses" className="ml-auto text-sm text-primary hover:underline">
              ดูรายการ
            </Link>
          </CardHeader>
          <CardContent>
            <CategoryBars items={data.categories} total={t.expense} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

type MonthRow = Profit['months'][number] & { label: string }

function ProfitTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload as MonthRow
  return (
    <TooltipBox
      title={thPeriod(r.month)}
      rows={[
        { label: 'รายรับ', value: baht(r.income), color: INCOME },
        { label: 'รายจ่าย', value: baht(r.expense), color: EXPENSE },
        { label: 'กำไรสุทธิ', value: signedBaht(r.net), color: NET },
      ]}
    />
  )
}

function MonthlyTable({ rows }: { rows: MonthRow[] }) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 bg-muted">
          <TableRow>
            <TableHead className="pl-4">เดือน</TableHead>
            <TableHead className="text-right">รายรับ</TableHead>
            <TableHead className="text-right">รายจ่าย</TableHead>
            <TableHead className="pr-4 text-right">กำไรสุทธิ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...rows].reverse().map((r) => (
            <TableRow key={r.month}>
              <TableCell className="pl-4">{thPeriod(r.month)}</TableCell>
              <TableCell className="text-right tabular-nums">{baht(r.income)}</TableCell>
              <TableCell className="text-right tabular-nums">{baht(r.expense)}</TableCell>
              <TableCell className={cn('pr-4 text-right font-medium tabular-nums', r.net < 0 && 'text-destructive')}>
                {signedBaht(r.net)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function PropertyTable({ data, showShared }: { data: Profit; showShared: boolean }) {
  const t = data.totals
  if (!data.properties.length && !data.shared_expense)
    return <EmptyState icon={Scale} title="ยังไม่มีโครงการ" className="py-8" />
  return (
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow>
          <TableHead className="pl-6">โครงการ</TableHead>
          <TableHead className="hidden text-right sm:table-cell">รายรับ</TableHead>
          <TableHead className="hidden text-right sm:table-cell">รายจ่าย</TableHead>
          <TableHead className="text-right">กำไร</TableHead>
          <TableHead className="pr-6 text-right">Margin</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.properties.map((p) => (
          <TableRow key={p.property_id}>
            <TableCell className="pl-6">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground tabular-nums sm:hidden">
                รับ {baht(p.income)} · จ่าย {baht(p.expense)}
              </div>
            </TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">{baht(p.income)}</TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">{baht(p.expense)}</TableCell>
            <TableCell className={cn('text-right font-medium tabular-nums', p.net < 0 && 'text-destructive')}>
              {signedBaht(p.net)}
            </TableCell>
            <TableCell className={cn('pr-6 text-right tabular-nums', p.margin != null && p.margin < 0 && 'text-destructive')}>
              {marginText(p.margin)}
            </TableCell>
          </TableRow>
        ))}
        {showShared && (
          <TableRow className="bg-muted/30">
            <TableCell className="pl-6">
              <div className="text-muted-foreground">ค่าใช้จ่ายส่วนกลาง</div>
              <div className="text-xs text-muted-foreground tabular-nums sm:hidden">จ่าย {baht(data.shared_expense)}</div>
            </TableCell>
            <TableCell className="hidden text-right text-muted-foreground sm:table-cell">—</TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">{baht(data.shared_expense)}</TableCell>
            <TableCell className={cn('text-right tabular-nums', data.shared_expense > 0 && 'text-destructive')}>
              {signedBaht(-data.shared_expense)}
            </TableCell>
            <TableCell className="pr-6 text-right text-muted-foreground">—</TableCell>
          </TableRow>
        )}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="pl-6 font-semibold">
            รวม
            <div className="text-xs font-normal text-muted-foreground tabular-nums sm:hidden">
              รับ {baht(t.income)} · จ่าย {baht(t.expense)}
            </div>
          </TableCell>
          <TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">{baht(t.income)}</TableCell>
          <TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">{baht(t.expense)}</TableCell>
          <TableCell className={cn('text-right font-semibold tabular-nums', t.net < 0 && 'text-destructive')}>
            {signedBaht(t.net)}
          </TableCell>
          <TableCell className="pr-6 text-right font-semibold tabular-nums">{marginText(t.margin)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
