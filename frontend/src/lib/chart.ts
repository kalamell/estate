// ตัวช่วยกราฟ (recharts) ที่ใช้ร่วมกันในหน้ารายงาน

/** "2026-01" → "ม.ค. 69", เดือนอื่น → "ก.พ." */
export const monthShort = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  if (!y || !mo) return m
  const d = new Date(y, mo - 1, 1)
  return d.toLocaleDateString('th-TH', { month: 'short' }) + (mo === 1 ? ` ${String((y + 543) % 100).padStart(2, '0')}` : '')
}

/** ตัวเลขแกนแบบย่อ 12.5k / 1.2M */
export const compact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n)

export const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 }
