// ส่วนประกอบกราฟที่ใช้ร่วมกัน (คำอธิบายสี + กล่อง tooltip + แท่งตามหมวด)
import { PieChart } from 'lucide-react'
import { baht } from '@/lib/format'
import { EmptyState } from '@/components/common'

export function LegendKey({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      {line ? (
        <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />
      ) : (
        <span className="size-2.5 rounded-[2px]" style={{ background: color }} />
      )}
      {label}
    </span>
  )
}

export function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color && <span className="size-2 rounded-[2px]" style={{ background: r.color }} />}
          <span className="text-muted-foreground">{r.label}</span>
          <span className="ml-auto font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/** รายการแท่งแนวนอนแบบเรียบ (หมวด → ยอด) */
export function CategoryBars({
  items,
  total,
  limit,
}: {
  items: { category: string; amount: number }[]
  total: number
  limit?: number
}) {
  if (!items.length) return <EmptyState icon={PieChart} title="ยังไม่มีรายจ่าย" className="py-6" />
  const sorted = [...items].sort((a, b) => b.amount - a.amount)
  const shown = limit && sorted.length > limit ? sorted.slice(0, limit) : sorted
  const rest = sorted.slice(shown.length).reduce((s, c) => s + c.amount, 0)
  const list = rest > 0 ? [...shown, { category: `อื่น ๆ อีก ${sorted.length - shown.length} หมวด`, amount: rest }] : shown
  const max = Math.max(1, ...list.map((c) => c.amount))
  return (
    <ul className="space-y-3">
      {list.map((c) => (
        <li key={c.category} className="grid gap-1 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate">{c.category}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {total ? `${Math.round((c.amount / total) * 100)}%` : ''}
            </span>
            <span className="w-24 text-right font-medium tabular-nums">{baht(c.amount)}</span>
          </div>
          <div className="h-2 rounded-[2px] bg-muted">
            <div className="h-full rounded-[2px] bg-chart-2" style={{ width: `${(c.amount / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
