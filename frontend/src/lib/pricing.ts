// ราคาตามฤดูกาล — ข้อความอธิบายกฎ + ปุ่มลัด
import type { RateRule, RateRuleInput } from './api'
import { TH_MONTHS_SHORT, TH_WEEKDAYS, baht, today } from './format'

export const ADJUSTMENTS = {
  fixed: 'ตั้งราคา',
  percent: 'ปรับ %',
  amount: 'ปรับ บาท',
} as const

/** "2027-04-12" → "12 เม.ย. 70" */
export const shortDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return `${day} ${TH_MONTHS_SHORT[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}`
}

const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${unit === '%' ? Math.abs(n) + '%' : baht(Math.abs(n))}`

export function adjustmentText(r: Pick<RateRule, 'adjustment' | 'value'>) {
  if (r.adjustment === 'fixed') return `${baht(r.value)}/คืน`
  if (r.adjustment === 'percent') return signed(r.value, '%')
  return `${signed(r.value, '฿')}/คืน`
}

export function weekdaysText(days: number[]) {
  if (!days?.length || days.length === 7) return 'ทุกวัน'
  const sorted = [...days].sort((a, b) => a - b)
  // ช่วงติดกัน เช่น ศ–ส
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (consecutive && sorted.length >= 2) return `${TH_WEEKDAYS[sorted[0]]}–${TH_WEEKDAYS[sorted[sorted.length - 1]]}`
  return sorted.map((d) => TH_WEEKDAYS[d]).join(' ')
}

export function rangeText(r: Pick<RateRule, 'start_date' | 'end_date'>) {
  if (r.start_date && r.end_date) return `${shortDate(r.start_date)} – ${shortDate(r.end_date)}`
  if (r.start_date) return `ตั้งแต่ ${shortDate(r.start_date)}`
  if (r.end_date) return `ถึง ${shortDate(r.end_date)}`
  return 'ทุกช่วงวันที่'
}

/** คำอธิบายสั้นของกฎ */
export function describeRule(r: RateRule) {
  if (r.rule_type === 'length') return `พัก ${r.min_nights ?? '?'} คืนขึ้นไป ลด ${r.value}%`
  const hasDays = r.weekdays?.length > 0 && r.weekdays.length < 7
  const hasRange = !!(r.start_date || r.end_date)
  const when = [hasRange && rangeText(r), hasDays && `ทุก ${weekdaysText(r.weekdays)}`].filter(Boolean)
  return [...(when.length ? when : ['ทุกวัน']), adjustmentText(r)].join(' · ')
}

/** กฎหมดอายุแล้ว (วันสุดท้ายผ่านไปแล้ว) */
export const isExpired = (r: Pick<RateRule, 'end_date'>) => !!r.end_date && r.end_date < today()

export interface Preset {
  key: string
  label: string
  rule: Omit<RateRuleInput, 'property_id'>
}

/** ปุ่มลัด — ใช้ปีของครั้งถัดไปที่จะมาถึง */
export function presets(t = today()): Preset[] {
  const y = Number(t.slice(0, 4))
  const songkranYear = t <= `${y}-04-16` ? y : y + 1
  const nyYear = t <= `${y}-01-02` ? y - 1 : y
  const base = { unit_id: null, active: true, min_nights: null, start_date: null, end_date: null, weekdays: [] as number[] }
  return [
    {
      key: 'weekend',
      label: 'สุดสัปดาห์ (ศ–ส) +20%',
      rule: { ...base, name: 'สุดสัปดาห์', rule_type: 'night', weekdays: [5, 6], adjustment: 'percent', value: 20, priority: 10 },
    },
    {
      key: 'songkran',
      label: 'สงกรานต์ 12–16 เม.ย. +30%',
      rule: {
        ...base,
        name: `สงกรานต์ ${songkranYear + 543}`,
        rule_type: 'night',
        start_date: `${songkranYear}-04-12`,
        end_date: `${songkranYear}-04-16`,
        adjustment: 'percent',
        value: 30,
        priority: 20,
      },
    },
    {
      key: 'newyear',
      label: 'ปีใหม่ 30 ธ.ค.–2 ม.ค. +40%',
      rule: {
        ...base,
        name: `ปีใหม่ ${nyYear + 1 + 543}`,
        rule_type: 'night',
        start_date: `${nyYear}-12-30`,
        end_date: `${nyYear + 1}-01-02`,
        adjustment: 'percent',
        value: 40,
        priority: 30,
      },
    },
    {
      key: 'week',
      label: 'พัก 7 คืนขึ้นไป ลด 10%',
      rule: { ...base, name: 'พัก 7 คืนขึ้นไป', rule_type: 'length', adjustment: 'percent', value: 10, min_nights: 7, priority: 0 },
    },
    {
      key: 'month',
      label: 'พัก 28 คืนขึ้นไป ลด 25%',
      rule: { ...base, name: 'พัก 28 คืนขึ้นไป', rule_type: 'length', adjustment: 'percent', value: 25, min_nights: 28, priority: 0 },
    },
  ]
}

/** ราคาแบบย่อสำหรับช่องปฏิทินเล็ก: 1,200 → "1,200" · 12,500 → "12.5k" */
export const compactBaht = (n: number) =>
  n >= 10_000
    ? `${(n / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 })}k`
    : n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
