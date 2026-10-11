import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, MousePointerClick } from 'lucide-react'
import { api, type ImportDescribe } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/common'

export function SheetStep({
  describe: d,
  onLoaded,
  onBack,
  onNext,
}: {
  describe: ImportDescribe
  onLoaded: (d: ImportDescribe) => void
  onBack: () => void
  onNext: () => void
}) {
  const inspect = useMutation({
    mutationFn: (b: { sheet: number; header_row?: number }) => api.inspectImport(d.id, b),
    onSuccess: onLoaded,
  })
  const sheetRows = d.sheets.find((s) => s.index === d.sheet)?.rows ?? 0
  const width = Math.max(d.columns.length, ...d.preview_rows.map((r) => r.length))
  const letters = Array.from({ length: width }, (_, i) => d.columns[i]?.letter ?? String(i + 1))
  const busy = inspect.isPending
  const setHeader = (i: number) => {
    if (i !== d.header_row && !busy) inspect.mutate({ sheet: d.sheet, header_row: i })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[18rem_12rem_1fr] lg:items-end">
        {d.sheets.length > 1 && (
          <Field label="ชีต" htmlFor="imp-sheet">
            <Select
              value={String(d.sheet)}
              onValueChange={(v) => inspect.mutate({ sheet: Number(v) })}
              disabled={busy}
            >
              <SelectTrigger id="imp-sheet" className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {d.sheets.map((s) => (
                  <SelectItem key={s.index} value={String(s.index)}>
                    {s.name}
                    <span className="text-xs text-muted-foreground">{s.rows} แถว</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="แถวหัวตาราง" htmlFor="imp-header">
          <Select value={String(d.header_row)} onValueChange={(v) => setHeader(Number(v))} disabled={busy}>
            <SelectTrigger id="imp-header" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: Math.min(Math.max(sheetRows, 1), 30) }, (_, i) => (
                <SelectItem key={i} value={String(i)}>
                  แถวที่ {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2 lg:col-span-1">
          {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <MousePointerClick className="size-4 shrink-0" />}
          คลิกแถวในตารางด้านล่างเพื่อตั้งเป็นหัวตาราง (แถวที่มีชื่อคอลัมน์)
        </p>
      </div>

      <Card className={cn('gap-0 overflow-hidden py-0 transition-opacity', busy && 'opacity-60')}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 w-14 border-r bg-muted px-2 py-1.5 text-center font-medium">แถว</th>
                {letters.map((l, i) => (
                  <th key={i} className="min-w-24 border-r px-3 py-1.5 text-left font-medium last:border-r-0">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.preview_rows.map((row, i) => {
                const isHeader = i === d.header_row
                const above = i < d.header_row
                return (
                  <tr
                    key={i}
                    onClick={() => setHeader(i)}
                    className={cn(
                      'cursor-pointer border-t transition-colors',
                      isHeader ? 'bg-primary/[0.07] font-medium' : 'hover:bg-muted/40',
                      above && 'text-muted-foreground/60',
                    )}
                    aria-selected={isHeader}
                  >
                    <td
                      className={cn(
                        'sticky left-0 z-10 border-r px-2 py-2 text-center text-xs tabular-nums',
                        isHeader ? 'bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))] text-primary' : 'bg-card text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </td>
                    {letters.map((_, c) => (
                      <td
                        key={c}
                        className={cn(
                          'max-w-56 truncate border-r px-3 py-2 last:border-r-0',
                          isHeader && 'text-foreground',
                          above && 'line-through decoration-muted-foreground/40',
                        )}
                        title={row[c] ?? ''}
                      >
                        {row[c] ?? ''}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-primary/30" /> หัวตาราง
          </span>
          {d.header_row > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground/60 line-through">abc</span> ข้าม (อยู่เหนือหัวตาราง)
            </span>
          )}
          <span>แสดงเฉพาะแถวบนสุด — ข้อมูลทั้งหมด {d.row_count.toLocaleString('th-TH')} แถว</span>
        </div>
      </Card>

      {d.too_many_rows && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>ไฟล์มีมากกว่า 5,000 แถว — แบ่งเป็นหลายไฟล์ก่อนนำเข้า</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">ชื่อคอลัมน์ที่พบ ({d.columns.length})</div>
        <div className="flex flex-wrap gap-1.5">
          {d.columns.map((c) => (
            <Badge key={c.index} variant="outline" className="max-w-full gap-1.5 bg-card font-normal">
              <span className="font-mono text-[10px] text-muted-foreground">{c.letter}</span>
              <span className="truncate">{c.header}</span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-5">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> ย้อนกลับ
        </Button>
        <Button onClick={onNext} disabled={busy || !d.row_count}>
          ถัดไป: จับคู่คอลัมน์ <ArrowRight />
        </Button>
      </div>
    </div>
  )
}
