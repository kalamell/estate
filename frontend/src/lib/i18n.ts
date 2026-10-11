// ภาษาของหน้าที่ผู้เช่า/แขกเห็น (ไทย / อังกฤษ) — หน้าเจ้าหน้าที่เป็นภาษาไทยเสมอ
//
// ใช้แบบคู่ข้อความ: const { t } = useI18n(); t('ยอดค้างชำระ', 'Amount due')
// ไม่มี provider = ภาษาไทย (คอมโพเนนต์ที่ใช้ร่วมกับหน้าเจ้าหน้าที่จึงแสดงเหมือนเดิม)
import { createContext, useCallback, useContext, useState } from 'react'
import type { ParcelKind, PrivacyRequestKind, TicketStatus } from './api'
import { sqlUtc } from './billing'
import { dateTime as thDateTime, timeAgo as thTimeAgo } from './docs'
import { TH_MONTHS, TH_WEEKDAYS, thDate, thDateLong, thDayShort, thPeriod, weekdayOf } from './format'
import { readLS, writeLS } from './storage'

export type Lang = 'th' | 'en'
export const LANGS: Lang[] = ['th', 'en']
export const isLang = (v: unknown): v is Lang => v === 'th' || v === 'en'

export const LangContext = createContext<Lang>('th')

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const EN_MONTHS_SHORT = EN_MONTHS.map((m) => m.slice(0, 3))
const EN_WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const EN_WEEKDAYS_3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** YYYY-MM-DD (วันที่ล้วน) → [ปี, เดือน, วัน] — ไม่ผ่าน Date เพื่อกันวันเลื่อนตามเขตเวลา */
const ymd = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** วันที่+เวลา (ISO หรือ SQLite UTC) → Date */
const toDate = (s: string) => new Date(sqlUtc(s))

const enDate = (d: string, long = false) => {
  const p = ymd(d)
  const months = long ? EN_MONTHS : EN_MONTHS_SHORT
  if (p) return `${p[2]} ${months[p[1] - 1]} ${p[0]}`
  const dt = toDate(d)
  if (Number.isNaN(dt.getTime())) return d
  return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`
}

const pad = (n: number) => String(n).padStart(2, '0')

export interface I18n {
  lang: Lang
  en: boolean
  /** เลือกข้อความตามภาษา */
  t: (th: string, en: string) => string
  /** 16 ต.ค. 69 / 16 Oct 2026 */
  date: (d: string | null | undefined) => string
  /** 16 ตุลาคม 2569 / 16 October 2026 */
  dateLong: (d: string | null | undefined) => string
  /** "2026-10" → ต.ค. 2569 / Oct 2026 */
  period: (p: string) => string
  /** ส. 11 ต.ค. / Sat 11 Oct */
  dayShort: (d: string) => string
  /** 11 ต.ค. 14:05 / 11 Oct, 14:05 */
  dateTime: (iso: string) => string
  /** วันที่+เวลาจาก SQLite (UTC) */
  at: (sql: string | null | undefined) => string
  timeAgo: (iso: string) => string
  months: string[]
  weekdays: string[]
  /** ปีที่แสดง (พ.ศ. / ค.ศ.) */
  year: (y: number) => number
}

export function makeI18n(lang: Lang): I18n {
  const en = lang === 'en'
  if (!en)
    return {
      lang,
      en,
      t: (th) => th,
      date: thDate,
      dateLong: thDateLong,
      period: thPeriod,
      dayShort: thDayShort,
      dateTime: thDateTime,
      at: (s) => (s ? thDateTime(sqlUtc(s)) : '—'),
      timeAgo: thTimeAgo,
      months: TH_MONTHS,
      weekdays: TH_WEEKDAYS,
      year: (y) => y + 543,
    }
  const dateTime = (iso: string) => {
    const d = toDate(iso)
    if (Number.isNaN(d.getTime())) return iso
    return `${d.getDate()} ${EN_MONTHS_SHORT[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return {
    lang,
    en,
    t: (_th, e) => e,
    date: (d) => (d ? enDate(d) : '—'),
    dateLong: (d) => (d ? enDate(d, true) : '—'),
    period: (p) => {
      const [y, m] = p.split('-').map(Number)
      return y && m ? `${EN_MONTHS_SHORT[m - 1]} ${y}` : p
    },
    dayShort: (d) => {
      const p = ymd(d.slice(0, 10))
      return p ? `${EN_WEEKDAYS_3[weekdayOf(d)]} ${p[2]} ${EN_MONTHS_SHORT[p[1] - 1]}` : d
    },
    dateTime,
    at: (s) => (s ? dateTime(s) : '—'),
    timeAgo: (iso) => {
      const d = toDate(iso)
      const diff = (Date.now() - d.getTime()) / 1000
      if (diff < 60) return 'just now'
      if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
      if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
      if (diff < 86400 * 7) {
        const n = Math.floor(diff / 86400)
        return `${n} day${n === 1 ? '' : 's'} ago`
      }
      return enDate(iso)
    },
    months: EN_MONTHS,
    weekdays: EN_WEEKDAYS,
    year: (y) => y,
  }
}

const CACHE: Record<Lang, I18n> = { th: makeI18n('th'), en: makeI18n('en') }

/** ข้อความ + รูปแบบวันที่ตามภาษาของหน้า */
export function useI18n(): I18n {
  return CACHE[useContext(LangContext)]
}

// ---------- ภาษาของหน้าจองออนไลน์ (เก็บในเครื่อง) ----------

const LANG_KEY = 'estate.lang'

/** ภาษาที่เลือกไว้ในเครื่อง หรือตามภาษาของเบราว์เซอร์ (en* → อังกฤษ) */
export function detectLang(): Lang {
  const saved = readLS(LANG_KEY)
  if (isLang(saved)) return saved
  try {
    const nav = navigator.languages?.[0] || navigator.language || ''
    return /^en\b/i.test(nav) ? 'en' : 'th'
  } catch {
    return 'th'
  }
}

/** ภาษาของหน้าสาธารณะที่ไม่มีบัญชีผู้ใช้ (จำไว้ใน localStorage) */
export function useLocalLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(detectLang)
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    writeLS(LANG_KEY, l)
  }, [])
  return [lang, setLang]
}

// ---------- ป้ายภาษาอังกฤษของค่าที่ใช้ร่วมกัน ----------

export const TICKET_STATUS_EN: Record<TicketStatus, string> = {
  open: 'New',
  in_progress: 'In progress',
  waiting: 'Waiting for parts',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const ORG_CATEGORIES_EN: Record<string, string> = {
  electric: 'Electrical',
  plumbing: 'Plumbing',
  aircon: 'Air conditioning',
  furniture: 'Furniture / appliances',
  internet: 'Internet',
  cleaning: 'Cleaning',
  noise: 'Noise / complaint',
  billing: 'Billing question',
  move_out: 'Moving out',
  other: 'Other',
}

export const PRIVACY_KINDS_EN: Record<PrivacyRequestKind, { label: string; hint: string }> = {
  access: { label: 'Access / copy of my data', hint: 'See or receive a copy of the personal data kept about you' },
  correction: { label: 'Correct my data', hint: 'Data is wrong, out of date or incomplete' },
  deletion: { label: 'Delete my data', hint: 'Delete or anonymise your personal data' },
  objection: { label: 'Object to processing', hint: 'Stop using your data for certain purposes' },
  withdraw_consent: { label: 'Withdraw consent', hint: 'Cancel consent you have given' },
}

export const PARCEL_KINDS_EN: Record<ParcelKind, string> = {
  parcel: 'Parcel',
  letter: 'Letter / document',
  food: 'Food / fresh goods',
  large: 'Large item',
  other: 'Other',
}

/** ป้ายตามภาษา: ภาษาอังกฤษถ้ามี ไม่งั้นใช้ภาษาไทย */
export const pick = (i: Pick<I18n, 'en'>, th: string, enMap: Record<string, string>, key: string) =>
  i.en ? (enMap[key] ?? th) : th

