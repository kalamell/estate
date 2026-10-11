import type { TicketPriority, TicketStatus } from '@/lib/api'
import type { Tone } from '@/lib/format'

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone }> = {
  open: { label: 'ใหม่', tone: 'ink' },
  in_progress: { label: 'กำลังดำเนินการ', tone: 'primary' },
  waiting: { label: 'รอข้อมูล/อะไหล่', tone: 'mustard' },
  resolved: { label: 'แก้ไขแล้ว', tone: 'green' },
  closed: { label: 'ปิดแล้ว', tone: 'grey' },
}

export const ACTIVE_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting']

export const PRIORITY: Record<TicketPriority, { label: string; tone: Tone }> = {
  low: { label: 'ต่ำ', tone: 'grey' },
  normal: { label: 'ปกติ', tone: 'grey' },
  high: { label: 'สูง', tone: 'mustard' },
  urgent: { label: 'ด่วนมาก', tone: 'red' },
}

export const ORG_CATEGORIES: Record<string, string> = {
  electric: 'ไฟฟ้า',
  plumbing: 'ประปา',
  aircon: 'แอร์',
  furniture: 'เฟอร์นิเจอร์/อุปกรณ์',
  internet: 'อินเทอร์เน็ต',
  cleaning: 'ความสะอาด',
  noise: 'เสียงรบกวน/ร้องเรียน',
  billing: 'สอบถามค่าใช้จ่าย',
  move_out: 'แจ้งย้ายออก',
  other: 'อื่นๆ',
}

export const SUPPORT_CATEGORIES: Record<string, string> = {
  bug: 'แจ้งปัญหาการใช้งาน',
  question: 'สอบถาม',
  billing: 'ค่าบริการ/แพ็กเกจ',
  feature: 'เสนอฟีเจอร์',
  other: 'อื่นๆ',
}
