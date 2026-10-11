import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  DoorOpen,
  FileUp,
  Loader2,
  RefreshCw,
  Upload,
  Users,
} from 'lucide-react'
import { api, type ImportCommitResult, type ImportDescribe, type ImportRowPlan, type ImportSummary } from '@/lib/api'
import { buildSpec, type MappingState } from '@/lib/imports'
import { invalidate } from '@/lib/query'
import { cn } from '@/lib/utils'
import { thDate, type Tone } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ToneBadge } from '@/components/common'

const ROW_STATUS: Record<ImportRowPlan['status'], { label: string; tone: Tone }> = {
  ok: { label: 'พร้อม', tone: 'green' },
  warning: { label: 'มีข้อสังเกต', tone: 'mustard' },
  error: { label: 'ข้าม', tone: 'red' },
}
const UNIT_ACTION: Record<string, { label: string; tone: Tone }> = {
  create: { label: 'ห้องใหม่', tone: 'primary' },
  update: { label: 'อัปเดต', tone: 'ink' },
  existing: { label: 'มีอยู่แล้ว', tone: 'grey' },
}
const TENANT_ACTION: Record<string, { label: string; tone: Tone }> = {
  create: { label: 'ผู้เช่าใหม่', tone: 'primary' },
  existing: { label: 'มีอยู่แล้ว', tone: 'grey' },
}
const PAGE = 200

type Filter = 'all' | 'issues'

export function ReviewStep({
  describe: d,
  state,
  onBack,
  onDone,
}: {
  describe: ImportDescribe
  state: MappingState
  onBack: () => void
  onDone: (r: ImportCommitResult) => void
}) {
  const { readOnly } = useSession()
  const spec = useMemo(() => buildSpec(d, state), [d, state])
  const preview = useQuery({
    queryKey: ['import-preview', d.id, spec],
    queryFn: () => api.previewImport(d.id, spec),
    staleTime: 0,
    gcTime: 0,
    meta: { silent: true },
  })
  const commit = useMutation({
    mutationFn: () => api.commitImport(d.id, spec),
    onSuccess: async (r) => {
      onDone(r)
      window.scrollTo({ top: 0 })
      await invalidate('units', 'properties', 'tenants', 'dashboard', 'bookings', 'meters', 'import-mappings', 'org-info', 'calendar')
    },
  })
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(PAGE)

  const p = preview.data
  const s = p?.summary
  const rows = p?.rows ?? []
  const issues = rows.filter((r) => r.status !== 'ok')
  const shown = filter === 'issues' ? issues : rows
  const importable = s ? s.rows - s.errors : 0
  const blocked = !!p?.global_errors.length

  if (preview.isError)
    return (
      <div className="space-y-5">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>ตรวจสอบข้อมูลไม่สำเร็จ</AlertTitle>
          <AlertDescription>{preview.error.message}</AlertDescription>
        </Alert>
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft /> กลับไปแก้การจับคู่
          </Button>
          <Button variant="outline" onClick={() => void preview.refetch()}>
            <RefreshCw /> ลองใหม่
          </Button>
        </div>
      </div>
    )

  return (
    <div className="space-y-5">
      {!s ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </div>
      ) : (
        <SummaryTiles s={s} />
      )}

      {blocked && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>ยังนำเข้าไม่ได้</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {p!.global_errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <button type="button" onClick={onBack} className="mt-1 font-medium underline underline-offset-4">
              กลับไปแก้การจับคู่และตัวเลือก
            </button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="font-semibold">ผลการตรวจทีละแถว</div>
          {preview.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <div className="flex gap-1 rounded-md border bg-muted/50 p-1 sm:ml-auto" role="radiogroup" aria-label="กรองแถว">
            {(
              [
                ['all', `ทั้งหมด ${rows.length}`],
                ['issues', `มีปัญหา ${issues.length}`],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                role="radio"
                aria-checked={filter === v}
                onClick={() => {
                  setFilter(v)
                  setLimit(PAGE)
                }}
                className={cn(
                  'h-7 rounded-sm px-2.5 text-xs whitespace-nowrap tabular-nums transition-colors',
                  filter === v
                    ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {!p ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !shown.length ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-success" />
            {filter === 'issues' ? 'ไม่มีแถวที่มีปัญหา' : 'ไม่พบแถวข้อมูล'}
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[3.5rem_6.5rem_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_3.5rem] gap-3 border-b bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground md:grid">
              <span>แถว</span>
              <span>สถานะ</span>
              <span>ห้อง</span>
              <span>ผู้เช่า</span>
              <span>สัญญา</span>
              <span className="text-right">มิเตอร์</span>
            </div>
            <ul className="divide-y">
              {shown.slice(0, limit).map((r) => (
                <RowItem key={r.row} r={r} />
              ))}
            </ul>
            {shown.length > limit && (
              <div className="border-t px-4 py-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE * 5)}>
                  แสดงเพิ่ม ({(shown.length - limit).toLocaleString('th-TH')} แถว)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={onBack} disabled={commit.isPending}>
            <ArrowLeft /> แก้การจับคู่
          </Button>
          <p className="order-last w-full text-xs text-muted-foreground sm:order-none sm:w-auto sm:flex-1 sm:text-right">
            {blocked
              ? 'แก้ข้อผิดพลาดด้านบนก่อนนำเข้า'
              : s && s.errors > 0
                ? `แถวที่มีข้อผิดพลาด ${s.errors} แถวจะถูกข้าม — นำเข้าทั้งหมดในครั้งเดียว`
                : 'นำเข้าทั้งหมดในครั้งเดียว ถ้าล้มเหลวจะไม่มีอะไรเปลี่ยน'}
          </p>
          <Button
            className="ml-auto sm:ml-0"
            onClick={() => commit.mutate()}
            disabled={!s || blocked || importable === 0 || commit.isPending || preview.isFetching || readOnly}
          >
            {commit.isPending ? <Loader2 className="animate-spin" /> : <FileUp />}
            นำเข้า {importable.toLocaleString('th-TH')} แถว
          </Button>
        </div>
      </div>
    </div>
  )
}

function SummaryTiles({ s }: { s: ImportSummary }) {
  const tiles: { label: string; value: number; sub?: string; tone?: 'brand' | 'danger' | 'warning' }[] = [
    { label: 'ห้องใหม่', value: s.units_create, sub: s.units_update ? `อัปเดต ${s.units_update} ห้อง` : undefined, tone: 'brand' },
    { label: 'ผู้เช่าใหม่', value: s.tenants_create, sub: s.tenants_existing ? `มีอยู่แล้ว ${s.tenants_existing}` : undefined, tone: 'brand' },
    { label: 'สัญญา', value: s.leases_create, sub: s.leases_skip ? `ข้าม ${s.leases_skip} (ช่วงซ้ำ)` : undefined },
    { label: 'เลขมิเตอร์', value: s.meters },
    { label: 'โครงการใหม่', value: s.properties_create },
    { label: 'แถวทั้งหมด', value: s.rows, sub: s.warnings ? `มีข้อสังเกต ${s.warnings}` : undefined },
    { label: 'พร้อมนำเข้า', value: s.rows - s.errors },
    { label: 'แถวที่ผิด (ข้าม)', value: s.errors, tone: s.errors ? 'danger' : undefined },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className="gap-0.5 px-3 py-2.5">
          <div className="truncate text-xs text-muted-foreground">{t.label}</div>
          <div
            className={cn(
              'text-xl font-semibold tabular-nums',
              t.tone === 'brand' && t.value > 0 && 'text-primary',
              t.tone === 'danger' && 'text-destructive',
            )}
          >
            {t.value.toLocaleString('th-TH')}
          </div>
          {t.sub && <div className="truncate text-xs text-muted-foreground">{t.sub}</div>}
        </Card>
      ))}
    </div>
  )
}

function Action({ a, map }: { a: string | null; map: Record<string, { label: string; tone: Tone }> }) {
  const x = a ? map[a] : null
  return x ? (
    <ToneBadge tone={x.tone} className="px-1 py-0 text-[10px]">
      {x.label}
    </ToneBadge>
  ) : null
}

/** "2024-06-01 ถึง 2025-05-31" → วันที่แบบไทย */
const thLease = (s: string | null) => (s ?? '').replace(/\d{4}-\d{2}-\d{2}/g, (d) => thDate(d))

function RowItem({ r }: { r: ImportRowPlan }) {
  const st = ROW_STATUS[r.status] ?? ROW_STATUS.ok
  // แถวที่ผิดจะถูกข้ามทั้งแถว — ไม่ต้องแสดงสิ่งที่จะสร้าง
  const skip = r.status === 'error'
  const unit = r.unit ? (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="truncate">
        {r.property && <span className="text-muted-foreground">{r.property} · </span>}
        {r.unit}
      </span>
      {!skip && <Action a={r.unit_action} map={UNIT_ACTION} />}
      {!skip && r.property_action === 'create' && (
        <ToneBadge tone="mustard" className="px-1 py-0 text-[10px]">
          โครงการใหม่
        </ToneBadge>
      )}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  )
  const tenant = r.tenant ? (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="truncate">{r.tenant}</span>
      {!skip && <Action a={r.tenant_action} map={TENANT_ACTION} />}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  )
  const lease =
    r.lease_action === 'create' ? (
      <span className="text-xs">{thLease(r.lease)}</span>
    ) : r.lease_action === 'skip' ? (
      <ToneBadge tone="mustard" className="px-1 py-0 text-[10px]">
        ข้าม (ช่วงซ้ำ)
      </ToneBadge>
    ) : (
      <span className="text-muted-foreground">—</span>
    )
  return (
    <li className={cn('px-4 py-2.5 text-sm', r.status === 'error' && 'bg-destructive/[0.03]')}>
      {/* มือถือ */}
      <div className="grid gap-1 md:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">แถว {r.row}</span>
          <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
          {r.meters > 0 && <span className="ml-auto text-xs text-muted-foreground">มิเตอร์ {r.meters}</span>}
        </div>
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
          <span className="text-xs text-muted-foreground">ห้อง</span>
          {unit}
          <span className="text-xs text-muted-foreground">ผู้เช่า</span>
          {tenant}
          {r.lease_action && (
            <>
              <span className="text-xs text-muted-foreground">สัญญา</span>
              {lease}
            </>
          )}
        </div>
      </div>
      {/* เดสก์ท็อป */}
      <div className="hidden grid-cols-[3.5rem_6.5rem_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_3.5rem] items-center gap-3 md:grid">
        <span className="text-muted-foreground tabular-nums">{r.row}</span>
        <span>
          <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
        </span>
        {unit}
        {tenant}
        <span className="min-w-0">{lease}</span>
        <span className="text-right tabular-nums">{r.meters || <span className="text-muted-foreground">—</span>}</span>
      </div>
      {(r.errors.length > 0 || r.warnings.length > 0) && (
        <ul className="mt-1.5 space-y-0.5 text-xs md:pl-[calc(3.5rem+0.75rem)]">
          {r.errors.map((e) => (
            <li key={e} className="flex gap-1.5 text-destructive">
              <span aria-hidden>•</span>
              {e}
            </li>
          ))}
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-1.5 text-warning-foreground">
              <span aria-hidden>•</span>
              {w}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function ResultView({
  filename,
  result,
  onRestart,
}: {
  filename: string
  result: ImportCommitResult
  onRestart: () => void
}) {
  const s = result.summary
  const items = [
    { label: 'ห้องใหม่', value: s.units_create },
    { label: 'ห้องที่อัปเดต', value: s.units_update },
    { label: 'ผู้เช่าใหม่', value: s.tenants_create },
    { label: 'ผู้เช่าที่มีอยู่แล้ว', value: s.tenants_existing },
    { label: 'สัญญา', value: s.leases_create },
    { label: 'เลขมิเตอร์', value: s.meters },
    { label: 'โครงการใหม่', value: s.properties_create },
    { label: 'แถวที่ข้าม', value: result.skipped.length },
  ]
  return (
    <div className="space-y-6">
      <Card className="items-center gap-3 px-6 py-10 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-success/10 text-success">
          <CircleCheck className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">นำเข้าเรียบร้อย</h2>
          <p className="text-sm text-muted-foreground">
            นำเข้า {s.rows.toLocaleString('th-TH')} แถวจาก <span className="font-medium break-words text-foreground">{filename}</span>
            {s.leases_skip > 0 && ` · ข้ามการสร้างสัญญา ${s.leases_skip} แถว (มีสัญญาช่วงเดียวกันอยู่แล้ว)`}
          </p>
          <p className="text-xs text-muted-foreground">ระบบจำการจับคู่คอลัมน์ไว้แล้ว — ไฟล์รูปแบบเดียวกันครั้งหน้าไม่ต้องจับคู่ใหม่</p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/units">
              <DoorOpen /> ไปที่ห้องพัก
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/tenants">
              <Users /> ไปที่ผู้เช่า
            </Link>
          </Button>
          <Button variant="ghost" onClick={onRestart}>
            <Upload /> นำเข้าไฟล์อื่น
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((t) => (
          <Card key={t.label} className="gap-0.5 px-3 py-2.5">
            <div className="truncate text-xs text-muted-foreground">{t.label}</div>
            <div
              className={cn(
                'text-xl font-semibold tabular-nums',
                t.label === 'แถวที่ข้าม' && t.value > 0 && 'text-destructive',
              )}
            >
              {t.value.toLocaleString('th-TH')}
            </div>
          </Card>
        ))}
      </div>

      {result.skipped.length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b px-4 py-3">
            <div className="font-semibold">แถวที่ข้าม ({result.skipped.length})</div>
            <p className="text-xs text-muted-foreground">แก้ไขในไฟล์แล้วนำเข้าอีกครั้งได้ — แถวที่นำเข้าแล้วจะไม่ถูกสร้างซ้ำ</p>
          </div>
          <ul className="divide-y">
            {result.skipped.map((r) => (
              <li key={r.row} className="flex gap-3 px-4 py-2.5 text-sm">
                <span className="w-14 shrink-0 text-muted-foreground tabular-nums">แถว {r.row}</span>
                <span className="min-w-0 text-destructive">{r.errors.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex justify-center">
        <Button asChild variant="link" className="text-muted-foreground">
          <Link to="/">
            กลับหน้าภาพรวม <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  )
}
