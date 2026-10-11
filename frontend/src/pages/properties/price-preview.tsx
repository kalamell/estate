import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api, type DayPrice, type Unit } from '@/lib/api'
import { TH_MONTHS_SHORT, TH_WEEKDAYS, addDays, baht, thRange, today, weekdayOf } from '@/lib/format'
import { compactBaht } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const DAYS = 42

/** ปฏิทินย่อ 6 สัปดาห์ แสดงราคาต่อคืนจริงหลังใช้กฎ */
export function PricePreview({ units }: { units: Unit[] }) {
  const t = today()
  const [unitId, setUnitId] = useState<number | null>(null)
  const unit = units.find((u) => u.id === unitId) ?? units.find((u) => u.rate_daily > 0) ?? units[0] ?? null
  // เริ่มที่วันอาทิตย์ของสัปดาห์นี้
  const [from, setFrom] = useState(() => addDays(t, -weekdayOf(t)))
  const to = addDays(from, DAYS)

  const q = useQuery({
    queryKey: ['unit-prices', unit?.id, from, to],
    queryFn: () => api.unitPrices(unit!.id, from, to),
    enabled: !!unit,
    placeholderData: keepPreviousData,
  })
  const byDate = useMemo(() => new Map((q.data?.prices ?? []).map((p) => [p.date, p])), [q.data])
  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(from, i)), [from])
  const changed = (p: DayPrice | undefined) => !!p && (p.rules.length > 0 || (!!unit && p.price !== unit.rate_daily))
  const range = useMemo(() => {
    const ps = (q.data?.prices ?? []).map((p) => p.price)
    return ps.length ? { min: Math.min(...ps), max: Math.max(...ps) } : null
  }, [q.data])

  if (!units.length) return <p className="text-sm text-muted-foreground">ยังไม่มีห้องในโครงการนี้</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={unit ? String(unit.id) : ''} onValueChange={(v) => setUnitId(Number(v))}>
          <SelectTrigger size="sm" className="w-36" aria-label="เลือกห้อง">
            <SelectValue placeholder="เลือกห้อง" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {units.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                ห้อง {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {unit && (
          <span className="text-xs text-muted-foreground tabular-nums">ราคาปกติ {baht(unit.rate_daily)}/คืน</span>
        )}
        <div className="ml-auto flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="6 สัปดาห์ก่อนหน้า"
            onClick={() => setFrom((f) => addDays(f, -DAYS))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="6 สัปดาห์ถัดไป"
            onClick={() => setFrom((f) => addDays(f, DAYS))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="text-xs font-medium text-muted-foreground tabular-nums">{thRange(from, addDays(to, -1))}</div>

      <div className={cn('transition-opacity', q.isPlaceholderData && 'opacity-60')}>
        <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
          {TH_WEEKDAYS.map((w) => (
            <div key={w} className="pb-1">
              {w}
            </div>
          ))}
        </div>
        {q.isLoading ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {dates.map((d) => {
              const p = byDate.get(d)
              const hi = changed(p)
              const up = !!p && !!unit && p.price > unit.rate_daily
              const day = Number(d.slice(8))
              const cell = (
                <div
                  className={cn(
                    'flex h-12 flex-col items-center justify-center rounded-sm border text-center leading-none tabular-nums',
                    d < t && 'opacity-45',
                    hi ? (up ? 'border-warning/40 bg-warning/10' : 'border-success/30 bg-success/10') : 'bg-card',
                    d === t && 'ring-1 ring-foreground/40',
                  )}
                >
                  <span className="text-[10px] text-muted-foreground">
                    {day === 1 || d === from ? `${day} ${TH_MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}` : day}
                  </span>
                  <span
                    className={cn(
                      'mt-1 text-[11px] font-medium sm:text-xs',
                      hi && (up ? 'text-warning-foreground' : 'text-success'),
                    )}
                  >
                    {p ? compactBaht(p.price) : '—'}
                  </span>
                </div>
              )
              return p && p.rules.length ? (
                <Tooltip key={d}>
                  <TooltipTrigger asChild>
                    <div tabIndex={0} className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                      {cell}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div className="font-medium tabular-nums">{baht(p.price)}/คืน</div>
                    <div className="opacity-80">{p.rules.join(' · ')}</div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div key={d}>{cell}</div>
              )
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-warning/40 bg-warning/10" /> สูงกว่าปกติ
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-success/30 bg-success/10" /> ต่ำกว่าปกติ
        </span>
        {range && (
          <span className="ml-auto tabular-nums">
            {baht(range.min)} – {baht(range.max)}
          </span>
        )}
      </div>
    </div>
  )
}
