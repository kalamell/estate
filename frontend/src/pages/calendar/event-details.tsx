import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarCheck, Inbox, Link2 } from 'lucide-react'
import type { CalendarEvent, CalendarUnit } from '@/lib/api'
import { channelOf } from '@/lib/channels'
import { diffDays, thDayShort } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { EVENT_TYPE_LABEL, eventLook, eventStatusLabel, unitChannelsHref } from './lib'

/** จุดสีของช่องทาง/ประเภท */
export function EventSwatch({ ev, className = 'size-2.5' }: { ev: CalendarEvent; className?: string }) {
  const look = eventLook({ ...ev, conflict: false })
  return <span aria-hidden className={`${className} shrink-0 rounded-[3px] ${look.className}`} style={look.style} />
}

/** บรรทัดสั้นๆ สำหรับ tooltip */
export function EventTooltip({ ev }: { ev: CalendarEvent }) {
  const nights = diffDays(ev.start, ev.end)
  return (
    <div className="space-y-0.5">
      <div className="font-medium">{ev.title}</div>
      <div>
        {thDayShort(ev.start)} → {thDayShort(ev.end)} · {nights} คืน
      </div>
      <div className="opacity-80">
        {channelOf(ev.source).label} · {eventStatusLabel(ev)}
        {ev.conflict && ' · ชนกับรายการอื่น'}
      </div>
    </div>
  )
}

/** รายละเอียดเหตุการณ์ (ใช้ใน popover และ sheet บนมือถือ) */
export function EventDetails({
  ev,
  unit,
  onDone,
}: {
  ev: CalendarEvent
  unit?: CalendarUnit
  onDone?: () => void
}) {
  const navigate = useNavigate()
  const nights = diffDays(ev.start, ev.end)
  const ch = channelOf(ev.source)
  const go = (to: string) => {
    onDone?.()
    navigate(to)
  }
  return (
    <div className="grid gap-3 text-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <EventSwatch ev={ev} />
        <span>{ch.label}</span>
        <span aria-hidden>·</span>
        <span>{EVENT_TYPE_LABEL[ev.type]}</span>
      </div>
      <div>
        <div className="font-semibold">{ev.title}</div>
        {unit && (
          <div className="text-xs text-muted-foreground">
            ห้อง {unit.name} · {unit.property_name}
          </div>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="text-muted-foreground">เช็คอิน</dt>
        <dd className="tabular-nums">{thDayShort(ev.start)}</dd>
        <dt className="text-muted-foreground">เช็คเอาท์</dt>
        <dd className="tabular-nums">{thDayShort(ev.end)}</dd>
        <dt className="text-muted-foreground">จำนวน</dt>
        <dd className="tabular-nums">{nights} คืน</dd>
        <dt className="text-muted-foreground">สถานะ</dt>
        <dd>{eventStatusLabel(ev)}</dd>
      </dl>
      {ev.conflict && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          ช่วงวันที่ชนกับรายการอื่นในห้องเดียวกัน — ตรวจสอบเพื่อป้องกันการจองซ้อน
        </div>
      )}
      {ev.type === 'booking' && ev.booking_id != null && (
        <Button size="sm" className="w-full" onClick={() => go(`/bookings?highlight=${ev.booking_id}`)}>
          <CalendarCheck /> ดูการจอง
        </Button>
      )}
      {ev.type === 'block' && (
        <>
          <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
            ปิดโดย {ch.label} (iCal) — แก้ไขได้ที่ระบบของ {ch.label} เท่านั้น
          </p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => go(unitChannelsHref(unit?.property_id, ev.unit_id))}>
            <Link2 /> ตั้งค่าช่องทางขายของห้องนี้
          </Button>
        </>
      )}
      {ev.type === 'request' && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => go(`/bookings?tab=requests${ev.request_id ? `&request=${ev.request_id}` : ''}`)}
        >
          <Inbox /> ดูคำขอจอง <ArrowRight className="ml-auto" />
        </Button>
      )}
    </div>
  )
}
