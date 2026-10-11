import type { CSSProperties } from 'react'
import type { CalendarEvent } from '@/lib/api'
import { channelFill } from '@/lib/channels'
import { BOOKING_REQUEST_STATUS, BOOKING_STATUS } from '@/lib/format'

export const EVENT_TYPE_LABEL: Record<CalendarEvent['type'], string> = {
  booking: 'การจอง',
  block: 'ปิดจากช่องทางภายนอก',
  request: 'คำขอจองออนไลน์',
}

/** คลาส + สไตล์ของแถบเหตุการณ์ตามช่องทาง/ประเภท */
export function eventLook(ev: CalendarEvent): { className: string; style?: CSSProperties } {
  const conflict = ev.conflict ? ' ring-2 ring-destructive ring-offset-1 ring-offset-card' : ''
  if (ev.type === 'request')
    return {
      className: 'border border-dashed border-warning bg-warning/10 text-warning-foreground' + conflict,
    }
  const fill = channelFill(ev.source)
  if (!fill) return { className: 'bg-primary text-primary-foreground' + conflict }
  return { className: 'text-white' + conflict, style: { backgroundColor: fill } }
}

export function eventStatusLabel(ev: CalendarEvent) {
  if (ev.type === 'request') return BOOKING_REQUEST_STATUS[ev.status]?.label ?? ev.status
  if (ev.type === 'block') return 'ไม่ว่าง'
  return BOOKING_STATUS[ev.status as keyof typeof BOOKING_STATUS]?.label ?? ev.status
}

/** ลิงก์ไปแท็บ "ปฏิทิน & ช่องทางขาย" ของห้อง */
export const unitChannelsHref = (propertyId: number | undefined, unitId: number) =>
  `/units?${propertyId ? `property=${propertyId}&` : ''}unit=${unitId}&tab=channels`

/** จัดเหตุการณ์ที่ซ้อนกันให้อยู่คนละเลน — คืน lane ของแต่ละ event และจำนวนเลน */
export function assignLanes(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
  const laneEnds: string[] = []
  const lanes = new Map<string, number>()
  for (const ev of sorted) {
    let lane = laneEnds.findIndex((end) => end <= ev.start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(ev.end)
    } else laneEnds[lane] = ev.end
    lanes.set(ev.id, lane)
  }
  return { lanes, count: Math.max(1, laneEnds.length) }
}
