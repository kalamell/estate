import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { TH_MONTHS, TH_WEEKDAYS, addDays, addMonths, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface DateRange {
  start?: string
  /** วันเช็คเอาท์ (ไม่นับเป็นคืน) */
  end?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

const compactPrice = (n: number) =>
  n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

/**
 * ปฏิทินเลือกช่วงวัน 2 เดือน (เช็คอิน → เช็คเอาท์)
 * - ปิดวันที่ผ่านมาแล้ว
 * - isBusy(d) = คืนวันที่ d ไม่ว่าง → เช็คอินไม่ได้ และช่วงที่เลือกต้องไม่คร่อมคืนที่ไม่ว่าง
 *   (วันที่ไม่ว่างยังเลือกเป็นวันเช็คเอาท์ได้)
 */
export function RangeCalendar({
  value,
  onChange,
  month,
  onMonthChange,
  isBusy,
  priceFor,
  className,
}: {
  value: DateRange
  onChange: (r: DateRange) => void
  /** เดือนแรกที่แสดง "YYYY-MM" */
  month: string
  onMonthChange: (ym: string) => void
  isBusy?: (d: string) => boolean
  priceFor?: (d: string) => number | null
  className?: string
}) {
  const t = today()
  const choosingEnd = !!value.start && !value.end
  // วันสุดท้ายที่เลือกเป็นเช็คเอาท์ได้ = คืนแรกที่ไม่ว่างหลังวันเช็คอิน
  const limit = useMemo(() => {
    if (!choosingEnd || !isBusy || !value.start) return null
    let d = value.start
    for (let i = 0; i < 365; i++) {
      d = addDays(d, 1)
      if (isBusy(d)) return d
    }
    return null
  }, [choosingEnd, isBusy, value.start])

  const disabled = (d: string) => {
    if (d < t) return true
    if (choosingEnd && value.start && d > value.start) return limit != null && d > limit
    return !!isBusy?.(d)
  }

  const pick = (d: string) => {
    if (choosingEnd && value.start && d > value.start) onChange({ start: value.start, end: d })
    else onChange({ start: d, end: undefined })
  }

  const canPrev = month > t.slice(0, 7)

  return (
    <div className={cn('relative', className)}>
      <div className="absolute inset-x-0 top-0 flex justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canPrev}
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="เดือนก่อนหน้า"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label="เดือนถัดไป"
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
        {[month, addMonths(month, 1)].map((ym) => (
          <Month
            key={ym}
            ym={ym}
            value={value}
            today={t}
            disabled={disabled}
            isBusy={isBusy}
            priceFor={priceFor}
            onPick={pick}
          />
        ))}
      </div>
    </div>
  )
}

function Month({
  ym,
  value,
  today: t,
  disabled,
  isBusy,
  priceFor,
  onPick,
}: {
  ym: string
  value: DateRange
  today: string
  disabled: (d: string) => boolean
  isBusy?: (d: string) => boolean
  priceFor?: (d: string) => number | null
  onPick: (d: string) => void
}) {
  const [y, m] = ym.split('-').map(Number)
  const first = new Date(y, m - 1, 1).getDay()
  const count = new Date(y, m, 0).getDate()
  const cells: (string | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: count }, (_, i) => `${ym}-${pad(i + 1)}`),
  ]
  return (
    <div>
      <div className="mb-2 h-8 text-center text-sm leading-8 font-semibold">
        {TH_MONTHS[m - 1]} {y + 543}
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {TH_WEEKDAYS.map((w) => (
          <div key={w} className="pb-1.5">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const off = disabled(d)
          const busy = d >= t && !!isBusy?.(d)
          const isStart = d === value.start
          const isEnd = d === value.end
          const inRange = !!value.start && !!value.end && d > value.start && d < value.end
          const price = !off && !busy ? priceFor?.(d) : null
          return (
            <div
              key={d}
              className={cn(
                'relative',
                inRange && 'bg-primary/10',
                isStart && value.end && 'rounded-l-md bg-primary/10',
                isEnd && 'rounded-r-md bg-primary/10',
              )}
            >
              <button
                type="button"
                disabled={off}
                onClick={() => onPick(d)}
                aria-pressed={isStart || isEnd}
                aria-label={`${d}${busy ? ' ไม่ว่าง' : ''}`}
                className={cn(
                  'flex h-12 w-full flex-col items-center justify-center rounded-md text-sm tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  !off && 'hover:bg-muted',
                  off && 'cursor-not-allowed text-muted-foreground/45',
                  busy && 'line-through decoration-muted-foreground/60',
                  d === t && !isStart && !isEnd && 'font-semibold text-primary',
                  (isStart || isEnd) && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                )}
              >
                <span className="leading-none">{Number(d.slice(8))}</span>
                {price != null && (
                  <span
                    className={cn(
                      'mt-1 text-[10px] leading-none',
                      isStart || isEnd ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {compactPrice(price)}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
