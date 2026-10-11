import { memo, useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, ChevronDown, LogIn, LogOut } from 'lucide-react'
import type { CalendarEvent, CalendarUnit } from '@/lib/api'
import { TH_MONTHS, TH_WEEKDAYS, diffDays, thDayShort, thRange, today, weekdayOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EventDetails, EventSwatch } from './event-details'
import { eventLook, indexDays, type DayInfo } from './lib'

const MAX_CHIPS = 3
const MAX_FREE = 30

interface Props {
  /** วันที่ 1 ของเดือนที่แสดง (YYYY-MM-01) */
  month: string
  /** วันแรกของตาราง (วันอาทิตย์ก่อน/ตรงกับวันที่ 1) */
  from: string
  /** จำนวนช่องในตาราง (35 หรือ 42) */
  days: number
  units: CalendarUnit[]
  events: CalendarEvent[]
  /** มือถือ: ช่องแบบย่อ (จุด/แถบ) */
  compact?: boolean
  readOnly?: boolean
  /** สร้างการจองเริ่มวันที่ date (ระบุห้องได้) */
  onBook: (date: string, unit?: CalendarUnit) => void
}

/** "2026-10-11" → "อา. 11 ตุลาคม 2569" */
const thDayLong = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return `${TH_WEEKDAYS[weekdayOf(d)]}. ${day} ${TH_MONTHS[m - 1]} ${y + 543}`
}

/** ปฏิทินรายเดือนแบบตาราง (อาทิตย์–เสาร์) — ช่องละวัน แสดงเข้า/ออก อัตราเข้าพัก และรายการ */
export const MonthGrid = memo(function MonthGrid({
  month,
  from,
  days,
  units,
  events,
  compact,
  readOnly,
  onBook,
}: Props) {
  const info = useMemo(() => indexDays(events, from, days), [events, from, days])
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units])
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const t = today()
  const ym = month.slice(0, 7)
  const total = units.length
  const rows = days / 7

  return (
    <>
      <div className="overflow-hidden rounded-md border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs text-muted-foreground">
          {TH_WEEKDAYS.map((w, i) => (
            <div key={w} className={cn('py-1.5', (i === 0 || i === 6) && 'text-foreground/70')}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label="ปฏิทินรายเดือน">
          {info.map((d, i) => (
            <DayCell
              key={d.date}
              d={d}
              total={total}
              unitMap={unitMap}
              outside={d.date.slice(0, 7) !== ym}
              isToday={d.date === t}
              lastCol={i % 7 === 6}
              lastRow={i >= (rows - 1) * 7}
              compact={compact}
              onOpen={() => setOpenIdx(i)}
            />
          ))}
        </div>
      </div>

      <Sheet open={openIdx != null} onOpenChange={(o) => !o && setOpenIdx(null)}>
        <SheetContent
          side={compact ? 'bottom' : 'right'}
          className={cn(
            'gap-0',
            compact ? 'max-h-[85svh] rounded-t-lg pb-[env(safe-area-inset-bottom)]' : 'w-full sm:max-w-md',
          )}
        >
          {openIdx != null && info[openIdx] && (
            <DayPanel
              d={info[openIdx]}
              units={units}
              unitMap={unitMap}
              readOnly={readOnly}
              onClose={() => setOpenIdx(null)}
              onBook={(date, u) => {
                setOpenIdx(null)
                onBook(date, u)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
})

function DayCell({
  d,
  total,
  unitMap,
  outside,
  isToday,
  lastCol,
  lastRow,
  compact,
  onOpen,
}: {
  d: DayInfo
  total: number
  unitMap: Map<number, CalendarUnit>
  outside: boolean
  isToday: boolean
  lastCol: boolean
  lastRow: boolean
  compact?: boolean
  onOpen: () => void
}) {
  const day = Number(d.date.slice(8))
  const pct = total ? Math.min(100, (d.occupied / total) * 100) : 0
  const label = `${thDayLong(d.date)} · ไม่ว่าง ${d.occupied}/${total} ห้อง · เช็คอิน ${d.arrivals.length} · เช็คเอาท์ ${d.departures.length}`
  const num = (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-sm text-xs font-medium tabular-nums',
        isToday && 'bg-primary text-primary-foreground',
      )}
    >
      {day}
    </span>
  )

  if (compact)
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        className={cn(
          'relative flex h-16 min-w-0 flex-col items-center gap-1 border-border/70 pt-1.5 outline-none focus-visible:z-[1] focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted/60',
          !lastCol && 'border-r',
          !lastRow && 'border-b',
          outside && 'bg-muted/30 text-muted-foreground/60',
          isToday && !outside && 'bg-primary/[0.06]',
        )}
      >
        {num}
        {/* จุด = เช็คอินวันนี้ ตามสีช่องทาง */}
        <span className={cn('flex h-1.5 items-center gap-0.5', outside && 'opacity-50')}>
          {d.arrivals.slice(0, 3).map((ev) => (
            <EventSwatch key={ev.id} ev={ev} className="size-1.5 rounded-full" />
          ))}
          {d.arrivals.length > 3 && <span className="text-[9px] leading-none text-muted-foreground">+</span>}
        </span>
        {d.departures.length > 0 && (
          <span className="text-[9px] leading-none text-muted-foreground tabular-nums">ออก {d.departures.length}</span>
        )}
        <span className="absolute inset-x-1.5 bottom-1 h-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className={cn('block h-full bg-primary/70', outside && 'opacity-40')} style={{ width: `${pct}%` }} />
        </span>
      </button>
    )

  const chips = d.nights.slice(0, MAX_CHIPS)
  const more = d.nights.length - chips.length
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={cn(
        'flex min-h-36 min-w-0 flex-col gap-1 border-border/70 p-1.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:z-[1] focus-visible:ring-[3px] focus-visible:ring-ring/50',
        !lastCol && 'border-r',
        !lastRow && 'border-b',
        outside && 'bg-muted/30',
        isToday && 'bg-primary/[0.06] hover:bg-primary/10',
      )}
    >
      <div className={cn('flex items-center gap-1', outside && 'opacity-55')}>
        {num}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums" title="ห้องที่ไม่ว่างคืนนี้">
          {d.occupied}/{total}
        </span>
      </div>
      <div className={cn('h-1 overflow-hidden rounded-full bg-muted', outside && 'opacity-55')} aria-hidden>
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
      <div
        className={cn(
          'flex h-4 items-center gap-2.5 text-[11px] text-muted-foreground tabular-nums',
          outside && 'opacity-55',
        )}
      >
        {d.arrivals.length > 0 && (
          <span className="inline-flex items-center gap-1" title="เช็คอิน">
            <LogIn className="size-3" />
            เข้า <span className="font-medium text-foreground">{d.arrivals.length}</span>
          </span>
        )}
        {d.departures.length > 0 && (
          <span className="inline-flex items-center gap-1" title="เช็คเอาท์">
            <LogOut className="size-3" />
            ออก <span className="font-medium text-foreground">{d.departures.length}</span>
          </span>
        )}
      </div>
      <div className={cn('grid min-w-0 gap-0.5', outside && 'opacity-55')}>
        {chips.map((ev) => {
          const look = eventLook({ ...ev, conflict: false })
          const u = unitMap.get(ev.unit_id)
          return (
            <span
              key={ev.id}
              className={cn(
                'flex h-5 min-w-0 items-center gap-1 rounded-[3px] px-1.5 text-[11px] leading-none font-medium',
                look.className,
              )}
              style={look.style}
            >
              {ev.conflict && <AlertTriangle className="size-3 shrink-0" />}
              {ev.start === d.date && <LogIn className="size-3 shrink-0 opacity-80" />}
              <span className="shrink-0 tabular-nums">{u?.name ?? ev.unit_id}</span>
              <span className="truncate opacity-90">{ev.title}</span>
            </span>
          )
        })}
        {more > 0 && <span className="px-1 text-[11px] text-muted-foreground tabular-nums">+{more} รายการ</span>}
      </div>
    </button>
  )
}

/** รายการทั้งหมดของวันที่เลือก */
function DayPanel({
  d,
  units,
  unitMap,
  readOnly,
  onClose,
  onBook,
}: {
  d: DayInfo
  units: CalendarUnit[]
  unitMap: Map<number, CalendarUnit>
  readOnly?: boolean
  onClose: () => void
  onBook: (date: string, unit?: CalendarUnit) => void
}) {
  const [leasesOpen, setLeasesOpen] = useState(false)
  const inHouse = d.nights.filter((e) => e.type === 'booking' && e.start < d.date)
  const stays = inHouse.filter((e) => e.source !== 'lease')
  const leases = inHouse.filter((e) => e.source === 'lease')
  const blocks = d.nights.filter((e) => e.type === 'block')
  const requests = d.nights.filter((e) => e.type === 'request')
  const taken = new Set(d.nights.filter((e) => e.type !== 'request').map((e) => e.unit_id))
  const free = units.filter((u) => !taken.has(u.id))
  // ห้องว่างแยกตามโครงการ (ชื่อห้องซ้ำกันได้ข้ามโครงการ)
  const freeGroups: { name: string; units: CalendarUnit[] }[] = []
  for (const u of free.slice(0, MAX_FREE)) {
    const g = freeGroups.find((x) => x.name === u.property_name)
    if (g) g.units.push(u)
    else freeGroups.push({ name: u.property_name, units: [u] })
  }
  const empty = !d.arrivals.length && !d.departures.length && !d.nights.length

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="tabular-nums">{thDayLong(d.date)}</SheetTitle>
        <SheetDescription className="tabular-nums">
          ไม่ว่าง {d.occupied}/{units.length} ห้อง · ว่าง {free.length} ห้อง
          {d.arrivals.length + d.departures.length > 0 &&
            ` · เข้า ${d.arrivals.length} · ออก ${d.departures.length}`}
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {empty && <p className="text-sm text-muted-foreground">ไม่มีการจองหรือวันที่ถูกปิดในวันนี้</p>}
        <Section title="เช็คอิน" items={d.arrivals} unitMap={unitMap} onDone={onClose} />
        <Section title="เช็คเอาท์" items={d.departures} unitMap={unitMap} onDone={onClose} />
        <Section title="เข้าพักอยู่" items={stays} unitMap={unitMap} onDone={onClose} />
        <Section title="ปิดจากช่องทางขาย" items={blocks} unitMap={unitMap} onDone={onClose} />
        <Section title="คำขอจองออนไลน์" items={requests} unitMap={unitMap} onDone={onClose} />
        {leases.length > 0 && (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setLeasesOpen((v) => !v)}
              aria-expanded={leasesOpen}
              className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ผู้เช่าตามสัญญา <span className="tabular-nums">{leases.length}</span> ห้อง
              <ChevronDown className={cn('size-3.5 transition-transform', leasesOpen && 'rotate-180')} />
            </button>
            {leasesOpen && <EventList items={leases} unitMap={unitMap} onDone={onClose} />}
          </section>
        )}
        {!readOnly && free.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              ห้องว่างคืนนี้ <span className="tabular-nums">{free.length}</span> ห้อง
            </h3>
            {freeGroups.map((g) => (
              <div key={g.name} className="space-y-1.5">
                {freeGroups.length > 1 && <p className="truncate text-xs text-muted-foreground">{g.name}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {g.units.map((u) => (
                    <Button
                      key={u.id}
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs tabular-nums"
                      title={`จองห้อง ${u.name} · ${u.property_name}`}
                      aria-label={`จองห้อง ${u.name} ${u.property_name}`}
                      onClick={() => onBook(d.date, u)}
                    >
                      {u.name}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {free.length > MAX_FREE && (
              <p className="text-xs text-muted-foreground tabular-nums">และอีก {free.length - MAX_FREE} ห้อง</p>
            )}
          </section>
        )}
      </div>
      {!readOnly && (
        <SheetFooter className="mt-0 border-t">
          <Button onClick={() => onBook(d.date)}>
            <CalendarPlus /> จองห้อง เข้าพัก {thDayShort(d.date)}
          </Button>
        </SheetFooter>
      )}
    </>
  )
}

function Section({
  title,
  items,
  unitMap,
  onDone,
}: {
  title: string
  items: CalendarEvent[]
  unitMap: Map<number, CalendarUnit>
  onDone: () => void
}) {
  if (!items.length) return null
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">
        {title} <span className="tabular-nums">{items.length}</span>
      </h3>
      <EventList items={items} unitMap={unitMap} onDone={onDone} />
    </section>
  )
}

function EventList({
  items,
  unitMap,
  onDone,
}: {
  items: CalendarEvent[]
  unitMap: Map<number, CalendarUnit>
  onDone: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="divide-y overflow-hidden rounded-md border bg-card">
      {items.map((ev) => {
        const u = unitMap.get(ev.unit_id)
        const expanded = open === ev.id
        return (
          <div key={ev.id}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : ev.id)}
              aria-expanded={expanded}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                ev.conflict && 'bg-destructive/5',
              )}
            >
              <EventSwatch ev={ev} className="h-8 w-1" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {ev.conflict && <AlertTriangle className="size-3.5 shrink-0 text-destructive" />}
                  <span className="truncate text-sm font-medium">{ev.title}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground tabular-nums">
                  ห้อง {u?.name ?? ev.unit_id} · {thRange(ev.start, ev.end)} · {diffDays(ev.start, ev.end)} คืน
                </div>
              </div>
              <ChevronDown
                className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
              />
            </button>
            {expanded && (
              <div className="border-t bg-muted/20 px-3 py-3">
                <EventDetails ev={ev} unit={u} onDone={onDone} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
