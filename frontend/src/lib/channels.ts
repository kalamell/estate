// ช่องทางขาย (OTA) — ชื่อ สี และคำแนะนำการเชื่อมปฏิทิน iCal
// สีแบรนด์ใช้เฉพาะเป็น "สัญญาณ" ของช่องทาง (จุด/แถบในปฏิทิน) และแสดงแบบหม่น 85%
import type { ChannelSource, EventSource } from './api'

export interface ChannelMeta {
  label: string
  /** สีของช่องทาง (null = ใช้สี primary ของธีม) */
  color: string | null
  /** ขั้นตอนนำลิงก์ปฏิทินของเราไปใส่ในช่องทางนี้ */
  exportSteps?: string
  /** ที่หาลิงก์ iCal (export) ของช่องทางนี้ */
  importHelp?: string
}

export const CHANNELS: Record<EventSource, ChannelMeta> = {
  lease: { label: 'สัญญาเช่า', color: null },
  direct: { label: 'จองตรง', color: null },
  airbnb: {
    label: 'Airbnb',
    color: '#E0565B',
    exportSteps: 'ปฏิทิน → ความพร้อมให้บริการ → เชื่อมต่อปฏิทิน → นำเข้าปฏิทิน → วางลิงก์',
    importHelp: 'ปฏิทิน → ความพร้อมให้บริการ → เชื่อมต่อปฏิทิน → ส่งออกปฏิทิน → คัดลอกลิงก์ .ics',
  },
  booking: {
    label: 'Booking.com',
    color: '#2D5BA8',
    exportSteps: 'Extranet → อัตราและความพร้อม → ซิงก์ปฏิทิน → นำเข้าปฏิทิน → วางลิงก์',
    importHelp: 'Extranet → อัตราและความพร้อม → ซิงก์ปฏิทิน → ส่งออกปฏิทิน → คัดลอกลิงก์',
  },
  agoda: {
    label: 'Agoda',
    color: '#6A4FB0',
    exportSteps: 'YCS → ปฏิทิน → iCal → นำเข้า → วางลิงก์',
    importHelp: 'YCS → ปฏิทิน → iCal → ส่งออก → คัดลอกลิงก์',
  },
  vrbo: {
    label: 'VRBO',
    color: '#8C877D',
    exportSteps: 'ปฏิทิน → นำเข้าและส่งออก → นำเข้าปฏิทิน → วางลิงก์',
    importHelp: 'ปฏิทิน → นำเข้าและส่งออก → ส่งออกปฏิทิน → คัดลอกลิงก์',
  },
  other: {
    label: 'อื่นๆ',
    color: '#8C877D',
    exportSteps: 'มองหาเมนู "นำเข้าปฏิทิน" หรือ "iCal import" แล้ววางลิงก์',
    importHelp: 'มองหาเมนู "ส่งออกปฏิทิน" / "iCal export" แล้วคัดลอกลิงก์ที่ลงท้ายด้วย .ics',
  },
}

export const CHANNEL_SOURCES: ChannelSource[] = ['airbnb', 'booking', 'agoda', 'vrbo', 'other']

export const channelOf = (source: string): ChannelMeta =>
  CHANNELS[source as EventSource] ?? { label: source, color: CHANNELS.other.color }

/** สีพื้นของช่องทาง (หม่น 85%) — null = ใช้ primary */
export const channelFill = (source: string) => {
  const c = channelOf(source).color
  return c ? `color-mix(in srgb, ${c} 85%, transparent)` : null
}

/** สรุปผลซิงก์เป็นข้อความ */
export const syncSummary = (r: { imported: number; removed: number; conflicts: string[] }) =>
  `นำเข้า ${r.imported} · ลบ ${r.removed}${r.conflicts.length ? ` · ชนกัน ${r.conflicts.length}` : ''}`
