// ตัวช่วยเกี่ยวกับ LINE OA
import type { LineSettings } from './api'

export const LINE_KIND_LABEL: Record<string, string> = {
  invoice: 'บิลใหม่',
  receipt: 'ใบเสร็จ',
  ticket_reply: 'ตอบเรื่องแจ้งซ่อม',
  reminder: 'เตือนชำระ',
  portal_link: 'ลิงก์พอร์ทัล',
  reply: 'ตอบกลับในแชท',
  welcome: 'ข้อความต้อนรับ',
  linked: 'เชื่อมบัญชีสำเร็จ',
}

/** ค่าเริ่มต้นเมื่อ backend ยังไม่ส่ง org.line มา */
export const EMPTY_LINE: LineSettings = {
  enabled: false,
  channel_id: '',
  basic_id: '',
  has_secret: false,
  has_token: false,
  webhook_url: '',
  auto_invoice: true,
  auto_receipt: true,
  auto_ticket_reply: true,
  auto_remind: true,
  linked_tenants: 0,
  add_friend_url: null,
}

export type LineStatus = 'connected' | 'disabled' | 'unconfigured'

export function lineStatus(line: LineSettings | null | undefined): LineStatus {
  if (!line || !line.has_secret || !line.has_token) return 'unconfigured'
  return line.enabled ? 'connected' : 'disabled'
}

/** ลิงก์แอดเพื่อน: ใช้ค่าจาก backend หรือสร้างจาก Basic ID */
export function addFriendUrl(line: Pick<LineSettings, 'add_friend_url' | 'basic_id'> | null | undefined) {
  if (!line) return null
  if (line.add_friend_url) return line.add_friend_url
  const id = line.basic_id?.trim()
  return id ? `https://line.me/R/ti/p/${id.startsWith('@') ? id : `@${id}`}` : null
}

/** เวลาที่เหลือก่อนหมดอายุ เช่น "อีก 25 นาที" */
export function expiresIn(iso: string, now = Date.now()) {
  const ms = new Date(iso).getTime() - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'หมดอายุแล้ว'
  const min = Math.ceil(ms / 60000)
  if (min < 60) return `อีก ${min} นาที`
  const h = Math.floor(min / 60)
  if (h < 48) return `อีก ${h} ชั่วโมง`
  return `อีก ${Math.floor(h / 24)} วัน`
}
