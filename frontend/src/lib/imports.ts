// นำเข้าข้อมูลจาก Excel/CSV — ค่าเริ่มต้นและตัวช่วยของวิซาร์ด
import type { DateOrder, ImportDescribe, ImportField, ImportMapping, ImportOptions, ImportSpec } from './api'

export const MAX_FILE_MB = 10
export const ACCEPT_EXT = ['.xlsx', '.xls', '.ods', '.csv']

/** ลำดับกลุ่มช่องข้อมูล (ตามฝั่งเซิร์ฟเวอร์) */
export const FIELD_GROUPS = ['ห้อง', 'ผู้เช่า', 'สัญญา', 'มิเตอร์', 'อื่น ๆ']

export const DEFAULT_OPTIONS: ImportOptions = {
  property_id: null,
  create_properties: true,
  property_kind: 'dormitory',
  update_units: true,
  date_order: 'dmy',
  deposit_paid: true,
}

export const DATE_ORDERS: { v: DateOrder; label: string; example: string }[] = [
  { v: 'dmy', label: 'วัน/เดือน/ปี', example: '31/01/2567' },
  { v: 'mdy', label: 'เดือน/วัน/ปี', example: '01/31/2024' },
  { v: 'ymd', label: 'ปี-เดือน-วัน', example: '2024-01-31' },
]

/** ใช้โครงการเดียวทุกแถว หรืออ่านชื่อโครงการจากคอลัมน์ในไฟล์ */
export type PropertyMode = 'one' | 'column'

export interface MappingState {
  mapping: ImportMapping
  options: ImportOptions
  propertyMode: PropertyMode
}

/** ค่าเริ่มต้นของขั้นจับคู่จากผลอ่านไฟล์ (การจับคู่ที่จำไว้/ระบบเดา + ตัวเลือกที่บันทึกไว้) */
export function initMapping(d: ImportDescribe): MappingState {
  const mapping: ImportMapping = {}
  for (const [k, c] of Object.entries(d.mapping)) {
    if (c != null && c < d.columns.length && d.fields.some((f) => f.key === k)) mapping[k] = c
  }
  const options: ImportOptions = { ...DEFAULT_OPTIONS, ...d.options }
  if (options.property_id != null && !d.properties.some((p) => p.id === options.property_id)) options.property_id = null
  let propertyMode: PropertyMode
  if (options.property_id != null) propertyMode = 'one'
  else if (mapping.property_name != null || !d.properties.length) propertyMode = 'column'
  else propertyMode = 'one'
  if (propertyMode === 'one' && options.property_id == null && d.properties.length === 1)
    options.property_id = d.properties[0].id
  return { mapping, options, propertyMode }
}

/** ข้อมูลที่ส่งให้เซิร์ฟเวอร์ (ตรวจ/นำเข้า) */
export function buildSpec(d: ImportDescribe, s: MappingState): ImportSpec {
  const mapping = { ...s.mapping }
  const options = { ...s.options }
  if (s.propertyMode === 'one') delete mapping.property_name
  else options.property_id = null
  return { sheet: d.sheet, header_row: d.header_row, mapping, options }
}

/** ตั้งช่องข้อมูลให้คอลัมน์ — ช่องเดียวใช้ได้คอลัมน์เดียว (เลือกซ้ำ = ย้ายมาคอลัมน์นี้) */
export function assignField(mapping: ImportMapping, column: number, key: string | null): ImportMapping {
  const next: ImportMapping = {}
  for (const [k, c] of Object.entries(mapping)) if (c !== column && k !== key) next[k] = c
  if (key) next[key] = column
  return next
}

/** คอลัมน์ → ช่องข้อมูล */
export function fieldByColumn(mapping: ImportMapping): Map<number, string> {
  const m = new Map<number, string>()
  for (const [k, c] of Object.entries(mapping)) if (c != null) m.set(c, k)
  return m
}

export function groupFields(fields: ImportField[]) {
  const groups = [...FIELD_GROUPS, ...new Set(fields.map((f) => f.group).filter((g) => !FIELD_GROUPS.includes(g)))]
  return groups
    .map((g) => ({ group: g, fields: fields.filter((f) => f.group === g) }))
    .filter((g) => g.fields.length)
}

/** ค่าตัวอย่าง (ไม่ซ้ำ ไม่ว่าง) ของคอลัมน์ */
export function sampleValues(sample: string[][], column: number, n = 3): string[] {
  const out: string[] = []
  for (const row of sample) {
    const v = (row[column] ?? '').trim()
    if (v && !out.includes(v)) out.push(v)
    if (out.length >= n) break
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ปีแบบเดียวกับฝั่งเซิร์ฟเวอร์: พ.ศ. → ค.ศ., ปี 2 หลัก ≥ 40 = พ.ศ. 25xx */
function fixYear(y: number) {
  if (y > 2400) return y - 543
  if (y >= 40 && y < 100) return 2500 + y - 543
  if (y < 100) return 2000 + y
  return y
}

/** อ่านวันที่แบบตัวเลขตามลำดับที่เลือก (ใช้แสดงตัวอย่างเท่านั้น) — คืน YYYY-MM-DD หรือ null */
export function previewDate(raw: string, order: DateOrder): string | null {
  const t = raw.trim()
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    // เลขวันที่ของ Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const m = t.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/)
  if (!m) return null
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let y: number, mo: number, d: number
  if (m[1].length === 4 || order === 'ymd') [y, mo, d] = [a, b, c]
  else if (order === 'mdy') [mo, d, y] = [a, b, c]
  else [d, mo, y] = [a, b, c]
  y = fixYear(y)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}
