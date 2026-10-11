// ตัวช่วยหน้ารายจ่าย: วิธีจ่าย ช่วงเวลา และกำหนดสร้างรายจ่ายประจำครั้งถัดไป
import type { Expense, ExpenseMethod, RecurringExpense } from './api'
import { addMonths, thisPeriod, today } from './format'

export const EXPENSE_METHODS: Record<ExpenseMethod, string> = {
  transfer: 'โอน',
  cash: 'เงินสด',
  card: 'บัตร',
  other: 'อื่น ๆ',
}

/** หมวดที่ใช้กับค่าซ่อม (ชื่อค่าเริ่มต้นจากเซิร์ฟเวอร์) */
export const REPAIR_CATEGORY = 'ซ่อมบำรุง'

export type RangePreset = 'this_month' | 'last_month' | 'last_3' | 'this_year' | 'custom'

export const RANGE_PRESETS: Record<RangePreset, string> = {
  this_month: 'เดือนนี้',
  last_month: 'เดือนก่อน',
  last_3: '3 เดือน',
  this_year: 'ปีนี้',
  custom: 'กำหนดเอง',
}

/** วันสุดท้ายของเดือน 'YYYY-MM' → YYYY-MM-DD */
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 0).getDate()
  return `${ym}-${String(d).padStart(2, '0')}`
}

/** ช่วงวันที่ (YYYY-MM-DD) ของแต่ละตัวเลือก */
export function presetRange(p: Exclude<RangePreset, 'custom'>): { from: string; to: string } {
  const cur = thisPeriod()
  switch (p) {
    case 'this_month':
      return { from: `${cur}-01`, to: monthEnd(cur) }
    case 'last_month': {
      const prev = addMonths(cur, -1)
      return { from: `${prev}-01`, to: monthEnd(prev) }
    }
    case 'last_3':
      return { from: `${addMonths(cur, -2)}-01`, to: monthEnd(cur) }
    case 'this_year':
      return { from: `${cur.slice(0, 4)}-01-01`, to: `${cur.slice(0, 4)}-12-31` }
  }
}

/**
 * วันที่จะสร้างรายการครั้งถัดไป (YYYY-MM-DD)
 * — เซิร์ฟเวอร์สร้างเมื่อถึงวันที่กำหนด เดือนละครั้ง (ตรวจทุกชั่วโมง)
 */
export function nextRun(r: Pick<RecurringExpense, 'day_of_month' | 'last_generated' | 'is_active'>) {
  if (!r.is_active) return null
  const cur = thisPeriod()
  const day = String(r.day_of_month).padStart(2, '0')
  const doneThisMonth = !!r.last_generated && r.last_generated >= cur
  const month = doneThisMonth ? addMonths(cur, 1) : cur
  const date = `${month}-${day}`
  // ถึงกำหนดแล้วแต่ยังไม่ได้สร้าง → กำลังจะสร้างเร็ว ๆ นี้
  return { date, due: !doneThisMonth && date <= today() }
}

/** โครงการ · ห้อง หรือ "ส่วนกลาง" */
export function placeOf(e: Pick<Expense, 'property_name' | 'unit_name'>) {
  if (!e.property_name) return 'ส่วนกลาง'
  return e.unit_name ? `${e.property_name} · ห้อง ${e.unit_name}` : e.property_name
}
