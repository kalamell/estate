// แปลงจำนวนเงินเป็นตัวอักษรภาษาไทย (เทียบเท่า BAHTTEXT)
// 4644 → "สี่พันหกร้อยสี่สิบสี่บาทถ้วน", 1056.5 → "หนึ่งพันห้าสิบหกบาทห้าสิบสตางค์"

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/** อ่านเลข 0–999,999 (hasHigher = มีหลักล้านนำหน้า ใช้ตัดสิน "เอ็ด") */
function readGroup(n: number, hasHigher: boolean): string {
  if (n === 0) return ''
  const s = String(n)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i])
    const pos = s.length - 1 - i
    if (d === 0) continue
    if (pos === 1 && d === 1) out += 'สิบ'
    else if (pos === 1 && d === 2) out += 'ยี่สิบ'
    else if (pos === 0 && d === 1 && (s.length > 1 || hasHigher)) out += 'เอ็ด'
    else out += DIGITS[d] + PLACES[pos]
  }
  return out
}

function readInt(n: number): string {
  if (n >= 1_000_000) {
    const hi = Math.floor(n / 1_000_000)
    const lo = n % 1_000_000
    return readInt(hi) + 'ล้าน' + readGroup(lo, true)
  }
  return readGroup(n, false)
}

export function bahtText(value: number): string {
  if (!Number.isFinite(value)) return ''
  const neg = value < 0
  const satangTotal = Math.round(Math.abs(value) * 100)
  const baht = Math.floor(satangTotal / 100)
  const satang = satangTotal % 100
  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน'
  let out = baht > 0 ? readInt(baht) + 'บาท' : ''
  out += satang === 0 ? 'ถ้วน' : readGroup(satang, false) + 'สตางค์'
  return (neg ? 'ลบ' : '') + out
}

// ---------- ภาษาอังกฤษ (ใช้ในเอกสารที่ผู้เช่าเลือกภาษาอังกฤษ) ----------
// 4644 → "Four Thousand Six Hundred Forty-Four Baht Only"

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const SCALES = ['', 'Thousand', 'Million', 'Billion']

function under1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  const parts: string[] = []
  if (h) parts.push(`${ONES[h]} Hundred`)
  if (r >= 20) parts.push(TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ''))
  else if (r) parts.push(ONES[r])
  return parts.join(' ')
}

function wordsEn(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  for (let i = 0; n > 0 && i < SCALES.length; i++) {
    const chunk = n % 1000
    if (chunk) parts.unshift(under1000(chunk) + (SCALES[i] ? ` ${SCALES[i]}` : ''))
    n = Math.floor(n / 1000)
  }
  return parts.join(' ')
}

export function bahtTextEn(value: number): string {
  if (!Number.isFinite(value)) return ''
  const neg = value < 0
  const satangTotal = Math.round(Math.abs(value) * 100)
  const baht = Math.floor(satangTotal / 100)
  const satang = satangTotal % 100
  let out = `${wordsEn(baht)} Baht`
  out += satang ? ` and ${wordsEn(satang)} Satang` : ' Only'
  return (neg ? 'Minus ' : '') + out
}
