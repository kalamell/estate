import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, ChevronRight } from 'lucide-react'
import type { CalendarEvent, CalendarUnit } from '@/lib/api'
import { channelOf } from '@/lib/channels'
import { addDays, diffDays, thDayShort, thRange, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EmptyState } from '@/components/common'
import { EventDetails, EventSwatch } from './event-details'
import { eventStatusLabel } from './lib'

const ALL = 'all'

/** มุมมองรายการ (มือถือ) — เหตุการณ์ที่กำลังจะมาถึง จัดกลุ่มตามวันที่ */
export function Agenda({ units, events }: { units: CalendarUnit[]; events: CalendarEvent[] }) {
  const [unitId, setUnitId] = useState(ALL)
  const [open, setOpen] = useState<CalendarEvent | null>(null)
  const t = today()
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units])
  const byProp = useMemo(() => {
    const m = new Map<string, CalendarUnit[]>()
    for (const u of units) {
      const list = m.get(u.property_name)
      if (list) list.push(u)
      else m.set(u.property_name, [u])
    }
    return [...m.entries()]
  }, [units])

  const sections = useMemo(() => {
    const list = events
      .filter((e) => e.end > t && (unitId === ALL || String(e.unit_id) === unitId))
      .sort((a, b) => a.start.localeCompare(b.start))
    const ongoing = list.filter((e) => e.start <= t)
    const upcoming = list.filter((e) => e.start > t)
    const out: { key: string; label: string; items: CalendarEvent[] }[] = []
    if (ongoing.length) out.push({ key: 'now', label: 'กำลังเข้าพัก / ปิดอยู่ตอนนี้', items: ongoing })
    for (const e of upcoming) {
      const last = out[out.length - 1]
      if (last?.key === e.start) last.items.push(e)
      else {
        const label =
          e.start === addDays(t, 1) ? `พรุ่งนี้ · ${thDayShort(e.start)}` : `${thDayShort(e.start)}`
        out.push({ key: e.start, label, items: [e] })
      }
    }
    return out
  }, [events, unitId, t])

  return (
    <div className="space-y-4">
      <Select value={unitId} onValueChange={setUnitId}>
        <SelectTrigger className="w-full bg-card" aria-label="เลือกห้อง">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ALL}>ทุกห้อง</SelectItem>
          {byProp.map(([name, list]) => (
            <SelectGroup key={name}>
              <SelectLabel>{name}</SelectLabel>
              {list.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  ห้อง {u.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {sections.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarRange} title="ไม่มีรายการที่กำลังจะมาถึง" description="การจองและวันที่ถูกปิดจะแสดงที่นี่" />
        </Card>
      ) : (
        sections.map((s) => (
          <section key={s.key} className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">{s.label}</h3>
            <Card className="gap-0 divide-y overflow-hidden py-0">
              {s.items.map((ev) => {
                const u = unitMap.get(ev.unit_id)
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setOpen(ev)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50',
                      ev.conflict && 'bg-destructive/5',
                    )}
                  >
                    <EventSwatch ev={ev} className="h-9 w-1" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {ev.conflict && <AlertTriangle className="size-3.5 shrink-0 text-destructive" />}
                        <span className="truncate text-sm font-medium">{ev.title}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        ห้อง {u?.name ?? ev.unit_id} · {thRange(ev.start, ev.end)} · {diffDays(ev.start, ev.end)} คืน
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {channelOf(ev.source).label} · {eventStatusLabel(ev)}
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </Card>
          </section>
        ))
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="bottom" className="gap-0 rounded-t-lg px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="px-0">
            <SheetTitle>รายละเอียด</SheetTitle>
          </SheetHeader>
          {open && <EventDetails ev={open} unit={unitMap.get(open.unit_id)} onDone={() => setOpen(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}
