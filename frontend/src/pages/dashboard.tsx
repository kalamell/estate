import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  BanknoteArrowUp,
  BedDouble,
  BrushCleaning,
  CalendarClock,
  HandCoins,
  Inbox,
  Package,
  PiggyBank,
  PlaneLanding,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { api, type UnitStatus } from '@/lib/api'
import { KINDS, UNIT_STATUS, baht, thDate } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, StatCard, StatCardSkeleton } from '@/components/common'
import { cn } from '@/lib/utils'
import { ImportCta } from '@/components/import-cta'
import { LeafletMap } from '@/components/leaflet-map'
import { LineIcon } from '@/components/line'
import { useSession } from '@/contexts/session'

export default function DashboardPage() {
  const { features, canManage } = useSession()
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard })
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const d = dash.data
  const openPdpa = canManage ? (d?.open_privacy_requests ?? 0) : 0
  const notices = d?.pending_payment_notices ?? 0
  const parcels = d?.parcels_waiting ?? 0
  const tm30 = canManage ? (d?.tm30_pending ?? 0) : 0
  const today_ = [notices, parcels, tm30].filter((n) => n > 0).length
  // จำนวนที่เกินกำหนดแจ้ง (ดึงเฉพาะเมื่อมีรายการรอแจ้ง)
  const tm30q = useQuery({
    queryKey: ['tm30', 'pending'],
    queryFn: () => api.tm30({ status: 'pending' }),
    enabled: tm30 > 0,
    meta: { silent: true },
  })
  const tm30Overdue = tm30q.data?.summary.overdue ?? 0

  return (
    <div className="space-y-6">
      {canManage && d?.total_units === 0 && <ImportCta />}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!d ? (
          Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="อัตราการเข้าพัก"
              icon={TrendingUp}
              value={`${Math.round(d.occupancy_rate * 100)}%`}
              sub={`${d.units_by_status.occupied ?? 0} จาก ${d.total_units} ห้อง`}
            >
              <Progress value={d.occupancy_rate * 100} className="mt-3 h-1.5" />
            </StatCard>
            <StatCard
              label="รายรับเดือนนี้"
              icon={Wallet}
              tone="success"
              value={baht(d.revenue_month)}
              sub="จากการชำระเงินที่บันทึก"
            />
            <StatCard
              label="ค้างชำระ"
              icon={HandCoins}
              tone="danger"
              value={baht(d.outstanding)}
              sub={`${d.outstanding_count} บิล`}
            />
            <StatCard
              label="เงินมัดจำที่ถืออยู่"
              icon={PiggyBank}
              value={baht(d.deposits_held)}
              sub="ต้องคืนเมื่อสิ้นสุดสัญญา"
            />
          </>
        )}
      </div>

      {today_ > 0 && (
        <div className={cn('grid gap-4 sm:grid-cols-2', today_ >= 3 && 'lg:grid-cols-3')}>
          {notices > 0 && (
            <AttentionRow
              to="/payment-notices"
              icon={BanknoteArrowUp}
              tone="warning"
              title="แจ้งชำระรอตรวจสลิป"
              loading={false}
              count={notices}
              detail={`${notices} รายการ · ตรวจสลิปแล้วยืนยันเพื่อออกใบเสร็จ`}
              empty=""
            />
          )}
          {parcels > 0 && (
            <AttentionRow
              to="/parcels"
              icon={Package}
              tone="info"
              title="พัสดุรอผู้เช่ามารับ"
              loading={false}
              count={parcels}
              detail={`${parcels} ชิ้น`}
              empty=""
            />
          )}
          {tm30 > 0 && (
            <AttentionRow
              to="/tm30"
              icon={PlaneLanding}
              tone="warning"
              title="ตม.30 รอแจ้ง"
              loading={false}
              count={tm30}
              detail={
                tm30Overdue > 0
                  ? `${tm30} รายการ · เกินกำหนด ${tm30Overdue} รายการ`
                  : `${tm30} รายการ · ต้องแจ้ง ตม. ภายใน 24 ชม. หลังเข้าพัก`
              }
              empty=""
            />
          )}
        </div>
      )}

      {openPdpa > 0 && (
        <AttentionRow
          to="/privacy-requests"
          icon={ShieldCheck}
          tone="warning"
          title="คำขอใช้สิทธิ์ตาม PDPA รอดำเนินการ"
          loading={false}
          count={openPdpa}
          detail={`${openPdpa} คำขอ · ต้องตอบผู้เช่าภายใน 30 วันนับจากวันที่ยื่น`}
          empty=""
        />
      )}

      <div className={cn('grid gap-4 sm:grid-cols-2', features.short_stay ? 'lg:grid-cols-3' : 'xl:grid-cols-4')}>
        <AttentionRow
          to="/invoices?status=overdue"
          icon={AlertTriangle}
          tone="warning"
          title="บิลเกินกำหนด"
          loading={!d}
          count={d?.overdue_count ?? 0}
          detail={d ? `${d.overdue_count} ใบ · ${baht(d.overdue_amount)}` : ''}
          empty="ไม่มีบิลเกินกำหนด"
        />
        <AttentionRow
          to="/tickets"
          icon={Wrench}
          tone="info"
          title="งานแจ้งซ่อมค้าง"
          loading={!d}
          count={d?.open_tickets ?? 0}
          detail={d ? `${d.open_tickets} รายการที่ยังไม่ปิด` : ''}
          empty="ไม่มีงานค้าง"
        />
        {features.short_stay && (
          <AttentionRow
            to="/bookings?tab=requests"
            icon={Inbox}
            tone="warning"
            title="คำขอจองรอตอบ"
            loading={!d}
            count={d?.pending_requests ?? 0}
            detail={d ? `${d.pending_requests ?? 0} คำขอรอยืนยัน` : ''}
            empty="ไม่มีคำขอรอตอบ"
          />
        )}
        <AttentionRow
          to="/housekeeping"
          icon={BrushCleaning}
          tone="warning"
          title="งานแม่บ้าน"
          loading={!d}
          count={(d?.housekeeping?.dirty ?? 0) + (d?.housekeeping?.in_progress ?? 0) + (d?.housekeeping?.open_tasks ?? 0)}
          detail={
            d?.housekeeping
              ? `รอทำความสะอาด ${d.housekeeping.dirty} · กำลังทำ ${d.housekeeping.in_progress}`
              : ''
          }
          empty="ทุกห้องสะอาด ไม่มีงานค้าง"
        />
        <LineCard span={features.short_stay} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="gap-0 overflow-hidden py-0 lg:col-span-2">
          <div className="flex items-center px-5 pt-5 pb-3">
            <h2 className="font-semibold">ทำเลโครงการ</h2>
            <Link
              to="/properties"
              className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              จัดการ <ArrowRight className="size-4" />
            </Link>
          </div>
          <LeafletMap properties={properties.data ?? []} className="h-80" />
        </Card>

        <Card className="gap-5">
          <CardHeader>
            <CardTitle>สถานะห้องทั้งหมด</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              {(Object.keys(UNIT_STATUS) as UnitStatus[]).map((k) => (
                <div key={k} className="flex items-center gap-3">
                  <span className={`size-2.5 rounded-sm ${UNIT_STATUS[k].dot}`} />
                  <span className="text-sm">{UNIT_STATUS[k].label}</span>
                  <span className="ml-auto font-semibold tabular-nums">
                    {d ? (d.units_by_status[k] ?? 0) : <Skeleton className="h-4 w-6" />}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <CalendarClock className="size-4 text-muted-foreground" />
                เช็คอินใน 14 วัน
              </h3>
              {!d ? (
                <div className="space-y-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : d.upcoming_checkins.length ? (
                <div className="space-y-2">
                  {d.upcoming_checkins.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 rounded-md border p-2.5"
                    >
                      <div className="w-14 shrink-0 border-r pr-2 text-center text-xs font-medium tabular-nums">
                        {thDate(c.start_date)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{c.tenant_name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.property_name} · {c.unit_name}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">ไม่มีรายการ</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>อัตราเข้าพักรายโครงการ</CardTitle>
        </CardHeader>
        <CardContent>
          {!d ? (
            <div className="space-y-4">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : d.properties.length ? (
            <div className="space-y-5">
              {d.properties.map((p) => {
                const pct = p.units ? (p.occupied / p.units) * 100 : 0
                return (
                  <div key={p.id}>
                    <div className="mb-1.5 flex items-baseline text-sm">
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{KINDS[p.kind]}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">
                        {p.occupied}/{p.units}
                        <span className="ml-2 font-medium text-foreground">{Math.round(pct)}%</span>
                      </span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={BedDouble}
              title="ยังไม่มีโครงการ"
              description="เพิ่มโครงการแรกเพื่อเริ่มต้นใช้งาน"
              action={
                <Link to="/properties" className="text-sm font-medium text-primary hover:underline">
                  ไปที่โครงการ →
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AttentionRow({
  to,
  icon: Icon,
  tone,
  title,
  count,
  detail,
  empty,
  loading,
}: {
  to: string
  icon: LucideIcon
  tone: 'warning' | 'info'
  title: string
  count: number
  detail: string
  empty: string
  loading: boolean
}) {
  const active = count > 0
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center gap-4 rounded-lg border border-l-4 bg-card px-4 py-3.5 transition-colors hover:bg-muted/50',
        active ? (tone === 'warning' ? 'border-l-warning' : 'border-l-info') : 'border-l-border',
      )}
    >
      <Icon
        className={cn(
          'size-5 shrink-0',
          active ? (tone === 'warning' ? 'text-warning' : 'text-info') : 'text-muted-foreground',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm text-muted-foreground tabular-nums">
          {loading ? <Skeleton className="mt-1 h-4 w-32" /> : active ? detail : empty}
        </div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

/** การ์ดสรุป LINE OA: ผู้เช่าที่เชื่อมแล้ว / ทั้งหมด */
function LineCard({ span }: { span: boolean }) {
  const { line, lineReady, canManage } = useSession()
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: api.tenants, meta: { silent: true } })
  const total = tenants.data?.length ?? 0
  const linked = tenants.data ? tenants.data.filter((t) => t.line_linked).length : (line?.linked_tenants ?? 0)
  const pct = total ? Math.round((linked / total) * 100) : 0
  return (
    <Link
      to={lineReady ? '/tenants' : canManage ? '/settings?tab=line' : '/tenants'}
      className={cn(
        'group flex items-center gap-4 rounded-lg border border-l-4 bg-card px-4 py-3.5 transition-colors hover:bg-muted/50',
        span && 'sm:col-span-2',
        lineReady ? 'border-l-success' : 'border-l-border',
      )}
    >
      <LineIcon className={cn('size-5', !lineReady && 'opacity-60 grayscale')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          LINE OA
          {lineReady && line?.basic_id && <span className="truncate text-xs font-normal text-muted-foreground">{line.basic_id}</span>}
        </div>
        {lineReady ? (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground tabular-nums">
            <span className="whitespace-nowrap">
              เชื่อมแล้ว <span className="font-medium text-foreground">{linked}</span> / {total} ผู้เช่า
            </span>
            <Progress value={pct} className="h-1 max-w-24 flex-1" aria-label="สัดส่วนผู้เช่าที่เชื่อม LINE" />
          </div>
        ) : (
          <div className="truncate text-sm text-muted-foreground">
            {canManage ? 'ยังไม่ได้ตั้งค่า — ตั้งค่าเพื่อส่งบิลทาง LINE' : 'ยังไม่ได้ตั้งค่า LINE OA'}
          </div>
        )}
      </div>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
