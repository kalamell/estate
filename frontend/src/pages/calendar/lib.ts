import type { CSSProperties } from 'react'
import type { CalendarEvent } from '@/lib/api'
import { channelFill } from '@/lib/channels'
import { BOOKING_REQUEST_STATUS, BOOKING_STATUS, TH_MONTHS, addDays, addMonths, diffDays } from '@/lib/format'

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

// ----- มุมมองรายเดือน -----

/** "2026-10-11" → "2026-10-01" */
export const monthStartOf = (d: string) => `${d.slice(0, 7)}-01`

/** วันที่ 1 ของเดือนที่ห่างไป n เดือน */
export const shiftMonth = (d: string, n: number) => `${addMonths(d.slice(0, 7), n)}-01`

/** "2026-10-01" → "ตุลาคม 2569" */
export const thMonthLabel = (d: string) => {
  const [y, m] = d.split('-').map(Number)
  return `${TH_MONTHS[m - 1]} ${y + 543}`
}

/** สรุปของแต่ละวัน (คืนของวันนั้น = d → d+1) */
export interface DayInfo {
  date: string
  /** การจองที่เช็คอินวันนี้ */
  arrivals: CalendarEvent[]
  /** การจองที่เช็คเอาท์วันนี้ */
  departures: CalendarEvent[]
  /** ทุกรายการที่ครอบคืนนี้ (การจอง / ปิดจากช่องทาง / คำขอจอง) เรียงตามความสำคัญ */
  nights: CalendarEvent[]
  /** จำนวนห้องที่ไม่ว่างคืนนี้ (การจอง + ปิดจากช่องทาง) */
  occupied: number
}

/** ลำดับแสดงบนช่องวัน: เข้าวันนี้ → รายวัน/OTA → คำขอจอง → สัญญาเช่ารายเดือน */
const nightRank = (ev: CalendarEvent, d: string) =>
  ev.start === d ? 0 : ev.type === 'request' ? 2 : ev.source === 'lease' ? 3 : 1

/** จัดเหตุการณ์ลงแต่ละวันในช่วง [from, from + days) — ผ่านข้อมูลรอบเดียว */
export function indexDays(events: CalendarEvent[], from: string, days: number): DayInfo[] {
  const out: DayInfo[] = Array.from({ length: days }, (_, i) => ({
    date: addDays(from, i),
    arrivals: [],
    departures: [],
    nights: [],
    occupied: 0,
  }))
  const occ: Set<number>[] = Array.from({ length: days }, () => new Set())
  for (const ev of events) {
    const s = diffDays(from, ev.start)
    const e = diffDays(from, ev.end)
    if (ev.type === 'booking') {
      if (s >= 0 && s < days) out[s].arrivals.push(ev)
      if (e >= 0 && e < days) out[e].departures.push(ev)
    }
    for (let i = Math.max(0, s); i < Math.min(days, e); i++) {
      out[i].nights.push(ev)
      if (ev.type !== 'request') occ[i].add(ev.unit_id)
    }
  }
  for (let i = 0; i < days; i++) {
    const d = out[i].date
    out[i].occupied = occ[i].size
    out[i].nights.sort((a, b) => nightRank(a, d) - nightRank(b, d) || a.start.localeCompare(b.start))
  }
  return out
}
