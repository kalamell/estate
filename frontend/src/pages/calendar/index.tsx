import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { AlertTriangle, Cable, CalendarRange, ChevronLeft, ChevronRight, Inbox, MousePointerClick, X } from 'lucide-react'
import { api, type CalendarUnit, type DayPrice, type EventSource } from '@/lib/api'
import { CHANNELS } from '@/lib/channels'
import { addDays, diffDays, thRange, today } from '@/lib/format'
import { readLS, writeLS } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/common'
import { useBookingDialog } from '@/components/booking-dialog'
import { Agenda } from './agenda'
import { ChannelsSheet } from './channels-sheet'
import { Timeline } from './timeline'

const ALL = 'all'
const LS_WEEKS = 'estate.calendarWeeks'
const LS_PROPERTY = 'estate.calendarProperty'
const DAY_W: Record<number, number> = { 2: 52, 4: 40, 8: 30 }
const LEAD = 3 // แสดงย้อนหลังก่อนวันอ้างอิง 3 วัน

/** รวมผลราคาหลายห้องเป็น Map (ฟังก์ชันคงที่ → React Query memo ผลลัพธ์ให้) */
function combinePrices(results: { data?: { unitId: number; prices: DayPrice[] } }[]) {
  const m = new Map<number, Map<string, DayPrice>>()
  for (const r of results) if (r.data) m.set(r.data.unitId, new Map(r.data.prices.map((p) => [p.date, p])))
  return m
}

const LEGEND: { key: string; label: string; source?: EventSource; request?: boolean }[] = [
  { key: 'direct', label: 'สัญญา / จองตรง', source: 'direct' },
  { key: 'airbnb', label: 'Airbnb', source: 'airbnb' },
  { key: 'booking', label: 'Booking.com', source: 'booking' },
  { key: 'agoda', label: 'Agoda', source: 'agoda' },
  { key: 'other', label: 'VRBO / อื่นๆ', source: 'other' },
  { key: 'request', label: 'คำขอจองออนไลน์', request: true },
]

export default function CalendarPage() {
  const { features, readOnly } = useSession()
  const { openBooking } = useBookingDialog()
  const isMobile = useIsMobile()
  const [anchor, setAnchor] = useState(today)
  const [weeks, setWeeksState] = useState<number>(() => {
    const v = Number(readLS(LS_WEEKS))
    return v === 2 || v === 8 ? v : 4
  })
  const [property, setPropertyState] = useState(() => readLS(LS_PROPERTY) || ALL)
  const [conflictsOnly, setConflictsOnly] = useState(false)
  const [channelsOpen, setChannelsOpen] = useState(false)

  const setWeeks = (w: number) => {
    setWeeksState(w)
    writeLS(LS_WEEKS, String(w))
  }
  const setProperty = (p: string) => {
    setPropertyState(p)
    writeLS(LS_PROPERTY, p)
  }

  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const propertyId =
    property !== ALL && properties.data?.some((p) => String(p.id) === property) ? Number(property) : null

  // เดสก์ท็อป: ย้อนหลัง 3 วัน … +N สัปดาห์ / มือถือ: วันนี้ … +8 สัปดาห์
  const from = isMobile ? today() : addDays(anchor, -LEAD)
  const days = isMobile ? 56 : weeks * 7 + LEAD
  const to = addDays(from, days)

  const cal = useQuery({
    queryKey: ['calendar', { from, to, property_id: propertyId }],
    queryFn: () => api.calendar({ from, to, property_id: propertyId }),
    placeholderData: keepPreviousData,
  })

  const units = useMemo(() => cal.data?.units ?? [], [cal.data])
  const events = useMemo(() => cal.data?.events ?? [], [cal.data])
  const unitProperty = useMemo(() => new Map(units.map((u) => [u.id, u.property_id])), [units])

  const stats = (() => {
    // อัตราการจองในช่วง: คืนที่ไม่ว่าง (การจอง + ปิดจากช่องทาง) ÷ (ห้อง × วัน)
    const nights = new Set<string>()
    for (const ev of events) {
      if (ev.type === 'request' || ev.status === 'cancelled') continue
      const s = Math.max(0, diffDays(from, ev.start))
      const e = Math.min(days, diffDays(from, ev.end))
      for (let i = s; i < e; i++) nights.add(`${ev.unit_id}:${i}`)
    }
    const capacity = units.length * days
    const conflictUnits = new Set(events.filter((e) => e.conflict).map((e) => e.unit_id))
    return {
      booked: nights.size,
      capacity,
      rate: capacity ? nights.size / capacity : 0,
      conflicts: events.filter((e) => e.conflict).length,
      conflictUnits,
      requests: events.filter((e) => e.type === 'request').length,
    }
  })()

  const shownUnits = conflictsOnly ? units.filter((u) => stats.conflictUnits.has(u.id)) : units

  // สถานะทำความสะอาด (ใช้เมื่อ /api/calendar ไม่ได้ส่งมาด้วย)
  const allUnits = useQuery({ queryKey: ['units', 'all'], queryFn: () => api.units(), meta: { silent: true } })
  const hkStatus = useMemo(
    () => new Map((allUnits.data ?? []).map((u) => [u.id, u.housekeeping_status])),
    [allUnits.data],
  )

  // ราคาต่อคืนตามกฎ — เฉพาะห้องรายวัน เมื่อแสดงไม่เกิน 4 สัปดาห์ (จำกัดจำนวนห้องเพื่อไม่ให้หนักเกินไป)
  const priceUnits =
    features.short_stay && !isMobile && weeks <= 4
      ? shownUnits.filter((u) => u.rate_daily > 0).slice(0, 40)
      : []
  const prices = useQueries({
    queries: priceUnits.map((u) => ({
      queryKey: ['unit-prices', u.id, from, to, 'calendar'],
      queryFn: async () => ({ unitId: u.id, prices: (await api.unitPrices(u.id, from, to)).prices }),
      staleTime: 5 * 60_000,
      meta: { silent: true },
    })),
    combine: combinePrices,
  })

  const selectRange = (u: CalendarUnit, start: string, end: string) =>
    openBooking(undefined, {
      unit_id: u.id,
      start_date: start,
      end_date: end,
      kind: u.rate_daily > 0 ? 'short_stay' : 'lease',
    })

  return (
    <div className="space-y-4">
      {/* แถบควบคุม */}
      <div className="flex flex-wrap items-center gap-2">
        {!isMobile && (
          <>
            <div className="flex items-center">
              <Button
                variant="outline"
                size="icon"
                className="rounded-r-none"
                aria-label="ก่อนหน้า"
                onClick={() => setAnchor((a) => addDays(a, -weeks * 7))}
              >
                <ChevronLeft />
              </Button>
              <Button variant="outline" className="-mx-px rounded-none" onClick={() => setAnchor(today())}>
                วันนี้
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-l-none"
                aria-label="ถัดไป"
                onClick={() => setAnchor((a) => addDays(a, weeks * 7))}
              >
                <ChevronRight />
              </Button>
            </div>
            <span className="px-1 text-sm font-medium tabular-nums">{thRange(from, addDays(to, -1))}</span>
          </>
        )}
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {!isMobile && (
            <Tabs value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
              <TabsList aria-label="ช่วงเวลา">
                <TabsTrigger value="2">2 สัปดาห์</TabsTrigger>
                <TabsTrigger value="4">4 สัปดาห์</TabsTrigger>
                <TabsTrigger value="8">8 สัปดาห์</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <Select value={propertyId ? String(propertyId) : ALL} onValueChange={setProperty}>
            <SelectTrigger className="min-w-0 flex-1 bg-card sm:w-52 sm:flex-none" aria-label="เลือกโครงการ">
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
          {features.short_stay && (
            <Button variant="outline" onClick={() => setChannelsOpen(true)}>
              <Cable /> <span className="hidden sm:inline">เชื่อมช่องทางขาย</span>
              <span className="sm:hidden">ช่องทางขาย</span>
            </Button>
          )}
        </div>
      </div>

      {/* สรุป */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip>
          <span className="text-muted-foreground">{isMobile ? 'จองแล้ว 8 สัปดาห์ข้างหน้า' : 'อัตราการจองช่วงนี้'}</span>
          <span className="font-semibold tabular-nums">{Math.round(stats.rate * 100)}%</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {stats.booked}/{stats.capacity} คืน
          </span>
        </Chip>
        <Chip
          as="button"
          onClick={() => setConflictsOnly((v) => !v)}
          disabled={!stats.conflicts && !conflictsOnly}
          aria-pressed={conflictsOnly}
          className={cn(
            stats.conflicts > 0 && 'border-destructive/40 text-destructive hover:bg-destructive/5',
            conflictsOnly && 'bg-destructive/10',
          )}
        >
          <AlertTriangle className={cn('size-3.5', !stats.conflicts && 'text-muted-foreground')} />
          {stats.conflicts > 0 ? (
            <>
              ชนกัน <span className="font-semibold tabular-nums">{stats.conflicts}</span> รายการ
              {conflictsOnly ? <X className="size-3.5" /> : <span className="text-xs opacity-80">· กรอง</span>}
            </>
          ) : (
            <span className="text-muted-foreground">ไม่มีการจองซ้อน</span>
          )}
        </Chip>
        {stats.requests > 0 && (
          <Chip as="link" to="/bookings?tab=requests" className="border-warning/50 hover:bg-warning/10">
            <Inbox className="size-3.5 text-warning" />
            คำขอจองออนไลน์ <span className="font-semibold tabular-nums">{stats.requests}</span>
          </Chip>
        )}
        {!isMobile && (
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {LEGEND.filter((l) => features.short_stay || l.key === 'direct').map((l) => (
              <span key={l.key} className="inline-flex items-center gap-1.5">
                {l.request ? (
                  <span className="h-2.5 w-3.5 rounded-[3px] border border-dashed border-warning bg-warning/10" />
                ) : CHANNELS[l.source!].color ? (
                  <span
                    className="h-2.5 w-3.5 rounded-[3px]"
                    style={{ backgroundColor: `color-mix(in srgb, ${CHANNELS[l.source!].color} 85%, transparent)` }}
                  />
                ) : (
                  <span className="h-2.5 w-3.5 rounded-[3px] bg-primary" />
                )}
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {cal.isLoading ? (
        <Skeleton className="h-[480px] rounded-md" />
      ) : !units.length ? (
        <Card>
          <EmptyState
            icon={CalendarRange}
            title="ยังไม่มีห้องพัก"
            description="เพิ่มห้องในโครงการก่อน แล้วการจองจะแสดงบนปฏิทินนี้"
            action={
              <Button asChild variant="outline">
                <Link to="/units">ไปที่ห้องพัก</Link>
              </Button>
            }
          />
        </Card>
      ) : isMobile ? (
        <Agenda units={units} events={events} />
      ) : (
        <>
          <div className={cn('transition-opacity', cal.isPlaceholderData && 'opacity-60')}>
            <Timeline
              from={from}
              days={days}
              dayWidth={DAY_W[weeks] ?? 40}
              units={shownUnits}
              events={events}
              readOnly={readOnly}
              hkStatus={hkStatus}
              prices={prices}
              onSelectRange={selectRange}
            />
          </div>
          {!readOnly && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MousePointerClick className="size-3.5" />
              คลิกหรือลากบนช่องว่างของห้องเพื่อสร้างการจอง · คลิกแถบเพื่อดูรายละเอียด
            </p>
          )}
        </>
      )}

      {features.short_stay && (
        <ChannelsSheet
          open={channelsOpen}
          onOpenChange={setChannelsOpen}
          propertyId={propertyId}
          unitProperty={unitProperty}
        />
      )}
    </div>
  )
}

type ChipProps = { className?: string; children: React.ReactNode } & (
  | { as?: 'span' }
  | ({ as: 'button' } & React.ButtonHTMLAttributes<HTMLButtonElement>)
  | { as: 'link'; to: string }
)

function Chip(props: ChipProps) {
  const cls = cn(
    'inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-sm transition-colors',
    props.className,
  )
  if (props.as === 'button') {
    const { as: _as, className: _c, children, ...rest } = props
    return (
      <button type="button" {...rest} className={cn(cls, 'disabled:cursor-default')}>
        {children}
      </button>
    )
  }
  if (props.as === 'link')
    return (
      <Link to={props.to} className={cls}>
        {props.children}
      </Link>
    )
  return <span className={cls}>{props.children}</span>
}
