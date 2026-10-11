// สัญญาเช่าอิเล็กทรอนิกส์: ป้ายสถานะ ประเภทแม่แบบ และตัวช่วยที่ใช้ร่วมกัน
import type { ContractKind, ContractStatus } from './api'
import type { Tone } from './format'
import { sqlUtc } from './billing'

export const CONTRACT_STATUS: Record<ContractStatus, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: 'grey' },
  sent: { label: 'รอผู้เช่าลงนาม', tone: 'mustard' },
  tenant_signed: { label: 'ผู้เช่าลงนามแล้ว', tone: 'ink' },
  completed: { label: 'ลงนามครบแล้ว', tone: 'green' },
  void: { label: 'ยกเลิก', tone: 'red' },
}

/** สถานะจากมุมของผู้เช่า (พอร์ทัล) */
export const TENANT_CONTRACT_STATUS: Record<ContractStatus, { th: string; en: string; tone: Tone }> = {
  draft: { th: 'ร่าง', en: 'Draft', tone: 'grey' },
  sent: { th: 'รอคุณลงนาม', en: 'Awaiting your signature', tone: 'mustard' },
  tenant_signed: { th: 'ลงนามแล้ว รอผู้ให้เช่า', en: 'Signed · awaiting landlord', tone: 'ink' },
  completed: { th: 'ลงนามครบแล้ว', en: 'Fully signed', tone: 'green' },
  void: { th: 'ยกเลิกแล้ว', en: 'Cancelled', tone: 'grey' },
}

export const CONTRACT_KINDS: Record<ContractKind, string> = {
  lease: 'สัญญาเช่ารายเดือน',
  short_stay: 'เข้าพักรายวัน',
  other: 'อื่น ๆ',
}

/** ข้อความเตือนบนแม่แบบตั้งต้น */
export const LAWYER_NOTE = 'ร่างตัวอย่าง ควรให้ทนายตรวจก่อนใช้งานจริง'

/** ตัวแปร {{key}} ที่ยังเหลืออยู่ในข้อความ (ไม่ซ้ำ ตามลำดับที่พบ) */
export function placeholdersIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** แบ่งเนื้อหาเป็นย่อหน้า (บรรทัดว่างคั่น) */
export const paragraphs = (body: string) =>
  body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\n+|\s+$/g, ''))
    .filter(Boolean)

/** บรรทัดหัวข้อ เช่น "ข้อ 1 ทรัพย์ที่เช่า" หรือ "1. Premises" */
export const isClauseHeading = (line: string) => /^(ข้อ\s*\d+(\s|$)|\d+\.\s)/.test(line.trim()) && line.length <= 80

/** ย่อ User-Agent ให้อ่านง่าย เช่น "Chrome 126 · Android 14" */
export function shortUA(ua: string | null | undefined): string {
  if (!ua) return '—'
  const os =
    /iPhone|iPad|iPod/.test(ua)
      ? `iOS ${(/OS (\d+)[._](\d+)/.exec(ua) ?? []).slice(1, 3).join('.')}`.trim()
      : /Android/.test(ua)
        ? `Android ${(/Android (\d+(?:\.\d+)?)/.exec(ua) ?? [])[1] ?? ''}`.trim()
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : ''
  const BROWSERS: [RegExp, string][] = [
    [/Line\/(\d+)/, 'LINE'],
    [/EdgA?\/(\d+)/, 'Edge'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
    [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
    [/Version\/(\d+(?:\.\d+)?).*Safari/, 'Safari'],
  ]
  let browser = ''
  for (const [re, name] of BROWSERS) {
    const m = re.exec(ua)
    if (m) {
      browser = name === 'LINE' ? 'LINE' : `${name} ${m[1]}`
      break
    }
  }
  const out = [browser, os].filter(Boolean).join(' · ')
  return out || (ua.length > 60 ? `${ua.slice(0, 60)}…` : ua)
}

/** เวลาประทับแบบเต็ม (มีวินาทีและเขตเวลา) จากเวลา SQLite (UTC) */
export function stampOf(sql: string | null | undefined, lang: 'th' | 'en') {
  if (!sql) return '—'
  const d = new Date(sqlUtc(sql))
  if (Number.isNaN(d.getTime())) return sql
  const off = -d.getTimezoneOffset() / 60
  const tz = `UTC${off >= 0 ? '+' : '−'}${Math.abs(off)}`
  const s = d.toLocaleString(lang === 'en' ? 'en-GB' : 'th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return `${s}${lang === 'en' ? '' : ' น.'} (${tz})`
}

