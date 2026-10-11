import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { CalendarEvent, CalendarUnit } from '@/lib/api'
import { TH_MONTHS, TH_WEEKDAYS, UNIT_STATUS, addDays, baht, diffDays, today, weekdayOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EventDetails, EventTooltip } from './event-details'
import { assignLanes, eventLook } from './lib'

const LABEL_W = 168
const LANE_H = 28
const ROW_PAD = 8

interface Props {
  from: string
  days: number
  dayWidth: number
  units: CalendarUnit[]
  events: CalendarEvent[]
  readOnly?: boolean
  /** เลือกช่วงวันว่าง (end = วันเช็คเอาท์) */
  onSelectRange: (unit: CalendarUnit, start: string, end: string) => void
}

interface Group {
  key: string
  name: string
  floors: { floor: number; units: CalendarUnit[] }[]
}

function groupUnits(units: CalendarUnit[]): Group[] {
  const byProp = new Map<number, Group>()
  for (const u of units) {
    let g = byProp.get(u.property_id)
    if (!g) {
      g = { key: String(u.property_id), name: u.property_name, floors: [] }
      byProp.set(u.property_id, g)
    }
    let f = g.floors.find((x) => x.floor === u.floor)
    if (!f) g.floors.push((f = { floor: u.floor, units: [] }))
    f.units.push(u)
  }
  const groups = [...byProp.values()]
  for (const g of groups) {
    g.floors.sort((a, b) => a.floor - b.floor)
    for (const f of g.floors) f.units.sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }))
  }
  return groups
}

export function Timeline({ from, days, dayWidth: W, units, events, readOnly, onSelectRange }: Props) {
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(from, i)), [from, days])
  const todayIdx = diffDays(from, today())
  const groups = useMemo(() => groupUnits(units), [units])
  const byUnit = useMemo(() => {
    const m = new Map<number, CalendarEvent[]>()
    for (const ev of events) {
      const list = m.get(ev.unit_id)
      if (list) list.push(ev)
      else m.set(ev.unit_id, [ev])
    }
    return m
  }, [events])
  const months = useMemo(() => {
    const segs: { label: string; span: number }[] = []
    for (const d of dates) {
      const [y, m] = d.split('-').map(Number)
      const label = `${TH_MONTHS[m - 1]} ${y + 543}`
      const last = segs[segs.length - 1]
      if (last?.label === label) last.span++
      else segs.push({ label, span: 1 })
    }
    return segs
  }, [dates])
  const weekend = (i: number) => {
    const w = weekdayOf(dates[i])
    return w === 0 || w === 6
  }

  // ลากเลือกช่วงวันว่าง
  const [sel, setSel] = useState<{ unitId: number; a: number; b: number } | null>(null)
  const idxAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.min(days - 1, Math.max(0, Math.floor((e.clientX - r.left) / W)))
  }

  const width = LABEL_W + days * W

  return (
    <div className="relative max-h-[calc(100svh-15rem)] min-h-80 overflow-auto rounded-md border bg-card select-none">
      <div className="relative" style={{ width }}>
        {/* หัวตาราง */}
        <div className="sticky top-0 z-20 border-b bg-card">
          <div className="flex h-7 border-b">
            <div className="sticky left-0 z-30 shrink-0 border-r bg-card" style={{ width: LABEL_W }} />
            {months.map((m, i) => (
              <div
                key={i}
                className="shrink-0 truncate border-r px-2 text-xs leading-7 font-medium text-muted-foreground"
                style={{ width: m.span * W }}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div className="flex h-11">
            <div
              className="sticky left-0 z-30 flex shrink-0 items-end border-r bg-card px-3 pb-1.5 text-xs text-muted-foreground"
              style={{ width: LABEL_W }}
            >
              ห้อง
            </div>
            {dates.map((d, i) => {
              const isToday = i === todayIdx
              return (
                <div
                  key={d}
                  className={cn(
                    'flex shrink-0 flex-col items-center justify-center gap-0.5 border-r text-center leading-none',
                    weekend(i) && 'bg-muted/70',
                    isToday && 'bg-primary/10',
                  )}
                  style={{ width: W }}
                  aria-label={isToday ? 'วันนี้' : undefined}
                >
                  <span className={cn('text-[10px] text-muted-foreground', isToday && 'font-medium text-primary')}>
                    {TH_WEEKDAYS[weekdayOf(d)]}
                  </span>
                  <span
                    className={cn(
                      'grid size-5 place-items-center rounded-sm text-xs font-medium tabular-nums',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* เนื้อหา */}
        <div className="relative">
          {/* คอลัมน์วัน (พื้นหลัง) */}
          <div className="pointer-events-none absolute inset-y-0 flex" style={{ left: LABEL_W }} aria-hidden>
            {dates.map((d, i) => (
              <div
                key={d}
                className={cn(
                  'h-full shrink-0 border-r border-border/70',
                  weekend(i) && 'bg-muted/50',
                  i === todayIdx && 'bg-primary/[0.07]',
                )}
                style={{ width: W }}
              />
            ))}
          </div>

          {groups.map((g) => (
            <div key={g.key} className="relative">
              <div className="flex h-8 items-center border-b bg-muted/60">
                <span className="sticky left-0 truncate px-3 text-[13px] font-semibold" style={{ maxWidth: LABEL_W + 240 }}>
                  {g.name}
                </span>
              </div>
              {g.floors.map((f) => (
                <div key={f.floor}>
                  <div className="flex h-6 items-center border-b">
                    <span
                      className="sticky left-0 z-10 h-full shrink-0 border-r bg-card px-3 text-[11px] leading-6 text-muted-foreground"
                      style={{ width: LABEL_W }}
                    >
                      ชั้น {f.floor}
                    </span>
                  </div>
                  {f.units.map((u) => {
                    const evs = byUnit.get(u.id) ?? []
                    const { lanes, count } = assignLanes(evs)
                    const h = ROW_PAD + count * LANE_H
                    const s = sel?.unitId === u.id ? sel : null
                    return (
                      <div key={u.id} className="flex border-b" style={{ height: h }}>
                        <div
                          className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-card px-3"
                          style={{ width: LABEL_W }}
                        >
                          <span
                            className={cn('size-2 shrink-0 rounded-full', UNIT_STATUS[u.status]?.dot)}
                            title={UNIT_STATUS[u.status]?.label}
                          />
                          <span className="truncate text-sm font-medium tabular-nums">{u.name}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {u.rate_daily > 0 ? `${baht(u.rate_daily)}/คืน` : `${baht(u.rent_monthly)}/ด.`}
                          </span>
                        </div>
                        <div
                          data-unit-track={u.id}
                          className={cn('relative shrink-0', !readOnly && 'cursor-cell')}
                          style={{ width: days * W }}
                          onPointerDown={(e) => {
                            if (readOnly || e.button !== 0 || e.target !== e.currentTarget) return
                            e.currentTarget.setPointerCapture(e.pointerId)
                            const i = idxAt(e)
                            setSel({ unitId: u.id, a: i, b: i })
                          }}
                          onPointerMove={(e) => {
                            if (!s) return
                            const i = idxAt(e)
                            if (i !== s.b) setSel({ ...s, b: i })
                          }}
                          onPointerUp={() => {
                            if (!s) return
                            setSel(null)
                            const a = Math.min(s.a, s.b)
                            const b = Math.max(s.a, s.b) + 1
                            onSelectRange(u, dates[a], addDays(from, b))
                          }}
                          onPointerCancel={() => setSel(null)}
                        >
                          {s && (
                            <div
                              className="pointer-events-none absolute inset-y-1 z-[1] grid place-items-center rounded-sm border border-primary/50 bg-primary/15 text-[11px] font-medium text-primary"
                              style={{ left: Math.min(s.a, s.b) * W, width: (Math.abs(s.b - s.a) + 1) * W }}
                            >
                              {Math.abs(s.b - s.a) + 1} คืน
                            </div>
                          )}
                          {evs.map((ev) => {
                            const si = diffDays(from, ev.start)
                            const ei = diffDays(from, ev.end)
                            if (ei <= 0 || si >= days) return null
                            const left = si < 0 ? 0 : (si + 0.5) * W + 1
                            const right = ei >= days ? days * W : (ei + 0.5) * W - 1
                            const look = eventLook(ev)
                            const lane = lanes.get(ev.id) ?? 0
                            return (
                              <Popover key={ev.id}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn(
                                          'absolute z-[2] flex items-center gap-1 overflow-hidden rounded-sm px-1.5 text-left text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                                          si < 0 && 'rounded-l-none',
                                          ei >= days && 'rounded-r-none',
                                          look.className,
                                        )}
                                        style={{
                                          ...look.style,
                                          left,
                                          width: Math.max(6, right - left),
                                          top: ROW_PAD / 2 + lane * LANE_H + 2,
                                          height: LANE_H - 4,
                                        }}
                                        aria-label={`${ev.title} ${ev.start} ถึง ${ev.end}`}
                                      >
                                        {ev.conflict && <AlertTriangle className="size-3 shrink-0" />}
                                        {right - left > 36 && <span className="truncate">{ev.title}</span>}
                                      </button>
                                    </PopoverTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-64 text-xs">
                                    <EventTooltip ev={ev} />
                                  </TooltipContent>
                                </Tooltip>
                                <PopoverContent align="start" className="w-72">
                                  <EventDetails ev={ev} unit={u} />
                                </PopoverContent>
                              </Popover>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
