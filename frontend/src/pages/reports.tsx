import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, Download, Scale, Table2, TrendingUp } from 'lucide-react'
import { api, type ReportSummary } from '@/lib/api'
import { addDays, baht, thDate, thPeriod, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, StatCard, StatCardSkeleton, UpsellCard } from '@/components/common'
import { LegendKey, TooltipBox } from '@/components/chart-parts'
import { compact, monthShort } from '@/lib/chart'
import { ProfitReport } from './profit'

const ALL = 'all'

/** อัตรา 0–1 หรือ 0–100 → เปอร์เซ็นต์ */
const pct = (r: number) => (r <= 1 ? r * 100 : r)

export default function ReportsPage() {
  const { features, featuresLoaded, canManage } = useSession()
  const [params, setParams] = useSearchParams()
  if (featuresLoaded && !features.reports)
    return (
      <UpsellCard
        title="รายงานไม่รวมในแพ็กเกจปัจจุบัน"
        description="อัปเกรดแพ็กเกจเพื่อดูรายรับเทียบยอดออกบิล กำไรต่อโครงการ อัตราเข้าพัก อายุลูกหนี้ และส่งออกข้อมูลเป็น CSV ให้นักบัญชี"
      />
    )
  // กำไร (รวมรายจ่าย) — เฉพาะเจ้าของ/ผู้ดูแล
  if (!canManage) return <Reports />
  const tab = params.get('tab') === 'profit' ? 'profit' : 'overview'
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setParams(v === 'profit' ? { tab: v } : {}, { replace: true })}
      className="gap-5"
    >
      <TabsList variant="line" className="w-full justify-start border-b">
        <TabsTrigger value="overview" className="flex-none px-3">
          <BarChart3 /> รายรับ & การเก็บเงิน
        </TabsTrigger>
        <TabsTrigger value="profit" className="flex-none px-3">
          <Scale /> กำไร
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <Reports />
      </TabsContent>
      <TabsContent value="profit">
        <ProfitReport />
      </TabsContent>
    </Tabs>
  )
}

function Reports() {
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const [propertyId, setPropertyId] = useState(ALL)
  const [months, setMonths] = useState('12')
  const filter = { months: Number(months), property_id: propertyId === ALL ? '' : propertyId }
  const { data, isLoading } = useQuery({
    queryKey: ['reports', filter],
    queryFn: () => api.reportSummary(filter),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="โครงการ" htmlFor="rp-prop" className="w-full sm:w-56">
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger id="rp-prop" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกโครงการ</SelectItem>
              {properties.data?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ช่วงเวลา" htmlFor="rp-months" className="w-40">
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger id="rp-months" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 เดือน</SelectItem>
              <SelectItem value="12">12 เดือน</SelectItem>
              <SelectItem value="24">24 เดือน</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {isLoading || !data ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <Skeleton className="h-80 rounded-lg" />
        </>
      ) : (
        <ReportBody data={data} />
      )}

      <ExportCard />
    </div>
  )
}

function ReportBody({ data }: { data: ReportSummary }) {
  const [asTable, setAsTable] = useState(false)
  const rows = useMemo(() => {
    const billed = new Map(data.billed.map((b) => [b.month, b.amount]))
    const occ = new Map(data.occupancy.map((o) => [o.month, pct(o.rate)]))
    const all = new Set([...data.revenue.map((r) => r.month), ...billed.keys(), ...occ.keys()])
    const rev = new Map(data.revenue.map((r) => [r.month, r.amount]))
    return [...all].sort().map((m) => ({
      month: m,
      label: monthShort(m),
      revenue: rev.get(m) ?? 0,
      billed: billed.get(m) ?? 0,
      occupancy: occ.get(m) ?? null,
    }))
  }, [data])

  const last = rows[rows.length - 1]
  const sumRev = rows.reduce((s, r) => s + r.revenue, 0)
  const sumBilled = rows.reduce((s, r) => s + r.billed, 0)
  const a = data.aging
  const agingTotal = a.current + a.d1_30 + a.d31_60 + a.d61_90 + a.d90_plus
  const overdue = agingTotal - a.current

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="รายรับเดือนล่าสุด"
          value={baht(last?.revenue)}
          sub={last ? `${thPeriod(last.month)} · ออกบิล ${baht(last.billed)}` : '—'}
        />
        <StatCard
          label="อัตราการเก็บเงิน"
          value={sumBilled ? `${Math.round((sumRev / sumBilled) * 100)}%` : '—'}
          sub={`รับ ${baht(sumRev)} จากที่ออกบิล ${baht(sumBilled)}`}
        />
        <StatCard
          label="อัตราเข้าพักล่าสุด"
          value={last?.occupancy != null ? `${Math.round(last.occupancy)}%` : '—'}
        />
        <StatCard
          label="ยอดค้างชำระรวม"
          tone={overdue > 0 ? 'warning' : 'default'}
          value={baht(agingTotal)}
          sub={`เกินกำหนด ${baht(overdue)}`}
        />
      </div>

      <Card className="gap-4">
        <CardHeader className="flex flex-row flex-wrap items-start gap-3">
          <div>
            <CardTitle>รายรับเทียบยอดออกบิล</CardTitle>
            <CardDescription>ยอดรับชำระจริงเทียบกับยอดตามใบแจ้งหนี้รายเดือน</CardDescription>
          </div>
          <div className="ml-auto flex items-center gap-4 text-xs">
            <LegendKey color="var(--chart-1)" label="รายรับ" />
            <LegendKey color="var(--chart-2)" label="ออกบิล" />
            <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
              {asTable ? <TrendingUp /> : <Table2 />}
              {asTable ? 'ดูกราฟ' : 'ดูตาราง'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!rows.length ? (
            <EmptyState icon={TrendingUp} title="ยังไม่มีข้อมูลในช่วงนี้" />
          ) : asTable ? (
            <MonthlyTable rows={rows} />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <YAxis
                    width={44}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={compact}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={MoneyTooltip} />
                  <Bar dataKey="revenue" name="รายรับ" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="billed" name="ออกบิล" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>อัตราการเข้าพัก</CardTitle>
            <CardDescription>สัดส่วนห้องที่มีผู้เช่า ณ สิ้นเดือน</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <YAxis
                    width={40}
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  <Tooltip cursor={{ stroke: 'var(--border)' }} content={PercentTooltip} />
                  <Line
                    type="monotone"
                    dataKey="occupancy"
                    name="อัตราเข้าพัก"
                    stroke="var(--chart-4)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle>อายุลูกหนี้</CardTitle>
            <CardDescription>ยอดค้างชำระแยกตามจำนวนวันที่เลยกำหนด</CardDescription>
          </CardHeader>
          <CardContent>
            <AgingTable aging={data.aging} total={agingTotal} />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="pb-4">
          <CardTitle>ผู้ค้างชำระสูงสุด</CardTitle>
        </CardHeader>
        {!data.top_debtors.length ? (
          <EmptyState icon={TrendingUp} title="ไม่มียอดค้างชำระ" className="py-8" />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-6">ผู้เช่า</TableHead>
                <TableHead>ห้อง</TableHead>
                <TableHead className="hidden sm:table-cell">ค้างตั้งแต่</TableHead>
                <TableHead className="pr-6 text-right">ยอดค้าง</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.top_debtors.map((d, i) => {
                const days = Math.max(0, Math.round((Date.parse(today()) - Date.parse(d.oldest_due)) / 86_400_000))
                return (
                  <TableRow key={i}>
                    <TableCell className="pl-6 font-medium">{d.tenant_name}</TableCell>
                    <TableCell>
                      {d.unit_name}
                      <span className="block text-xs text-muted-foreground">{d.property_name}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {thDate(d.oldest_due)}
                      {days > 0 && <span className="ml-2 text-xs text-warning-foreground">{days} วัน</span>}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular-nums">{baht(d.amount)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  )
}

type Row = { month: string; revenue: number; billed: number; occupancy: number | null }

function MoneyTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload as Row
  return (
    <TooltipBox
      title={thPeriod(r.month)}
      rows={[
        { label: 'รายรับ', value: baht(r.revenue), color: 'var(--chart-1)' },
        { label: 'ออกบิล', value: baht(r.billed), color: 'var(--chart-2)' },
        { label: 'เก็บได้', value: r.billed ? `${Math.round((r.revenue / r.billed) * 100)}%` : '—' },
      ]}
    />
  )
}

function PercentTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload as Row
  return (
    <TooltipBox
      title={thPeriod(r.month)}
      rows={[{ label: 'อัตราเข้าพัก', value: r.occupancy != null ? `${Math.round(r.occupancy)}%` : '—' }]}
    />
  )
}

function MonthlyTable({ rows }: { rows: Row[] }) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 bg-muted">
          <TableRow>
            <TableHead className="pl-4">เดือน</TableHead>
            <TableHead className="text-right">ออกบิล</TableHead>
            <TableHead className="text-right">รายรับ</TableHead>
            <TableHead className="pr-4 text-right">อัตราเข้าพัก</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...rows].reverse().map((r) => (
            <TableRow key={r.month}>
              <TableCell className="pl-4">{thPeriod(r.month)}</TableCell>
              <TableCell className="text-right tabular-nums">{baht(r.billed)}</TableCell>
              <TableCell className="text-right tabular-nums">{baht(r.revenue)}</TableCell>
              <TableCell className="pr-4 text-right tabular-nums">
                {r.occupancy != null ? `${Math.round(r.occupancy)}%` : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function AgingTable({ aging, total }: { aging: ReportSummary['aging']; total: number }) {
  const buckets: { label: string; value: number; overdue: boolean }[] = [
    { label: 'ยังไม่ถึงกำหนด', value: aging.current, overdue: false },
    { label: 'เลยกำหนด 1–30 วัน', value: aging.d1_30, overdue: true },
    { label: '31–60 วัน', value: aging.d31_60, overdue: true },
    { label: '61–90 วัน', value: aging.d61_90, overdue: true },
    { label: 'มากกว่า 90 วัน', value: aging.d90_plus, overdue: true },
  ]
  const max = Math.max(1, ...buckets.map((b) => b.value))
  return (
    <div className="space-y-3">
      {buckets.map((b) => (
        <div key={b.label} className="grid grid-cols-[8.5rem_1fr_6.5rem] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{b.label}</span>
          <div className="h-2.5 rounded-[2px] bg-muted">
            <div
              className={cn('h-full rounded-[2px]', b.overdue ? 'bg-chart-3' : 'bg-chart-5')}
              style={{ width: `${(b.value / max) * 100}%` }}
            />
          </div>
          <span className="text-right font-medium tabular-nums">{baht(b.value)}</span>
        </div>
      ))}
      <div className="grid grid-cols-[8.5rem_1fr_6.5rem] gap-3 border-t pt-3 text-sm font-semibold">
        <span>รวม</span>
        <span />
        <span className="text-right tabular-nums">{baht(total)}</span>
      </div>
    </div>
  )
}

function ExportCard() {
  const [from, setFrom] = useState(() => addDays(today(), -30))
  const [to, setTo] = useState(today())
  const types = [
    { t: 'invoices' as const, label: 'ใบแจ้งหนี้' },
    { t: 'receipts' as const, label: 'ใบเสร็จรับเงิน' },
    { t: 'payments' as const, label: 'รายการรับชำระ' },
  ]
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>ส่งออกข้อมูล (CSV)</CardTitle>
        <CardDescription>สำหรับส่งนักบัญชีหรือเปิดใน Excel / Google Sheets</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <Field label="ตั้งแต่วันที่" htmlFor="ex-from">
          <Input id="ex-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="ถึงวันที่" htmlFor="ex-to">
          <Input id="ex-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {types.map(({ t, label }) => (
            <Button key={t} asChild variant="outline">
              <a href={api.reportExportUrl(t, from, to)} download>
                <Download /> {label}
              </a>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
