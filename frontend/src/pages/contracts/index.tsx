// สัญญาเช่าอิเล็กทรอนิกส์ — รายการสัญญา + แม่แบบ (/contracts)
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronRight, FilePlus2, FileSignature, FileText, Files, Search, X } from 'lucide-react'
import { api, type Contract, type ContractStatus } from '@/lib/api'
import { sqlUtc } from '@/lib/billing'
import { CONTRACT_STATUS } from '@/lib/contracts'
import { timeAgo } from '@/lib/docs'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/common'
import { LineIcon } from '@/components/line'
import { ContractStatusBadge, CreateContractDialog } from './parts'
import { TemplatesTab } from './templates-tab'

type Filter = ContractStatus | 'all' | 'action'
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'all', label: 'ทั้งหมด' },
  { v: 'action', label: 'รอดำเนินการ' },
  { v: 'draft', label: 'ร่าง' },
  { v: 'sent', label: 'รอผู้เช่าลงนาม' },
  { v: 'completed', label: 'ลงนามครบ' },
  { v: 'void', label: 'ยกเลิก' },
]

/** สัญญาที่ผู้ให้เช่าต้องทำอะไรต่อ: ร่างที่ยังไม่ส่ง หรือผู้เช่าลงนามแล้วรอผู้ให้เช่า */
const needsAction = (c: Contract) =>
  c.status === 'draft' || ((c.status === 'sent' || c.status === 'tenant_signed') && !c.landlord_signed_at)

const matches = (c: Contract, f: Filter) =>
  f === 'all' ? true : f === 'action' ? needsAction(c) : f === 'sent' ? c.status === 'sent' || c.status === 'tenant_signed' : c.status === f

export default function ContractsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'templates' ? 'templates' : 'contracts'
  return (
    <div className="space-y-5">
      <div className="border-b">
        <Tabs value={tab} onValueChange={(v) => setParams(v === 'templates' ? { tab: 'templates' } : {}, { replace: true })}>
          <TabsList variant="line" className="h-10">
            <TabsTrigger value="contracts" className="flex-none px-3">
              <FileSignature /> สัญญา
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex-none px-3">
              <Files /> แม่แบบสัญญา
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === 'templates' ? <TemplatesTab /> : <ContractList />}
    </div>
  )
}

function ContractList() {
  const { canManage, readOnly } = useSession()
  const [params, setParams] = useSearchParams()
  const bookingId = Number(params.get('booking')) || null
  const [status, setStatus] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const list = useQuery({
    queryKey: ['contracts', { booking_id: bookingId }],
    queryFn: () => api.contracts({ booking_id: bookingId }),
    placeholderData: keepPreviousData,
  })
  const all = useMemo(() => list.data ?? [], [list.data])

  // มาจากหน้าการจอง (?booking=) และยังไม่มีสัญญา → เปิดกล่องสร้างให้เลย (ครั้งเดียว)
  const [autoDismissed, setAutoDismissed] = useState(false)
  const autoOpen =
    !!bookingId &&
    !autoDismissed &&
    canManage &&
    !readOnly &&
    list.isSuccess &&
    !list.isPlaceholderData &&
    !all.some((c) => c.status !== 'void')

  const term = q.trim().toLowerCase()
  const rows = all.filter(
    (c) =>
      matches(c, status) &&
      (!term ||
        [c.doc_no, c.title, c.tenant_name, c.unit_name, c.property_name].some((v) => v?.toLowerCase().includes(term))),
  )
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.v, all.filter((c) => matches(c, f.v)).length])),
    [all],
  ) as Record<Filter, number>
  const bookingLabel = bookingId && all[0] ? `ห้อง ${all[0].unit_name} · ${all[0].tenant_name ?? ''}` : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ชื่อผู้เช่า ห้อง หรือเลขที่สัญญา"
            className="h-10 bg-card pr-9 pl-9 sm:h-9"
            aria-label="ค้นหาสัญญา"
            inputMode="search"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
              aria-label="ล้างคำค้น"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {canManage && (
          <Button className="h-10 sm:ml-auto sm:h-9" onClick={() => setCreateOpen(true)} disabled={readOnly}>
            <FilePlus2 /> สร้างสัญญา
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border bg-muted/50 p-1" role="radiogroup" aria-label="กรองสถานะ">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              role="radio"
              aria-checked={status === f.v}
              onClick={() => setStatus(f.v)}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs whitespace-nowrap transition-colors',
                status === f.v
                  ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
              {counts[f.v] > 0 && f.v !== 'all' && (
                <span
                  className={cn(
                    'tabular-nums',
                    f.v === 'action' ? 'rounded-sm bg-warning/20 px-1 font-semibold text-warning-foreground' : 'opacity-70',
                  )}
                >
                  {counts[f.v]}
                </span>
              )}
            </button>
          ))}
        </div>
        {bookingId && (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card pr-1 pl-2.5 text-xs">
            การจอง #{bookingId}
            {bookingLabel && <span className="text-muted-foreground">· {bookingLabel}</span>}
            <button
              type="button"
              className="grid size-6 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
              onClick={() => setParams({}, { replace: true })}
              aria-label="ดูสัญญาทั้งหมด"
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={term ? Search : FileText}
            title={term ? 'ไม่พบสัญญาที่ค้นหา' : all.length ? 'ไม่มีสัญญาในสถานะนี้' : 'ยังไม่มีสัญญา'}
            description={
              all.length
                ? undefined
                : 'สร้างสัญญาจากการจอง แก้ไขเนื้อหา แล้วส่งให้ผู้เช่าลงนามในพอร์ทัลได้ทันที'
            }
            action={
              !all.length &&
              canManage && (
                <Button variant="outline" onClick={() => setCreateOpen(true)} disabled={readOnly}>
                  <FilePlus2 /> สร้างสัญญา
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map((c) => (
              <li key={c.id}>
                <ContractRow c={c} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CreateContractDialog
        open={createOpen || autoOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o) setAutoDismissed(true)
        }}
        bookingId={bookingId}
      />
    </div>
  )
}

function ContractRow({ c }: { c: Contract }) {
  const s = CONTRACT_STATUS[c.status]
  const when =
    c.status === 'draft'
      ? `สร้าง ${timeAgo(sqlUtc(c.created_at))}`
      : c.landlord_signed_at && c.tenant_signed_at
        ? `ลงนามครบ ${timeAgo(sqlUtc(c.tenant_signed_at > c.landlord_signed_at ? c.tenant_signed_at : c.landlord_signed_at))}`
        : c.tenant_signed_at
          ? `ผู้เช่าลงนาม ${timeAgo(sqlUtc(c.tenant_signed_at))}`
          : c.sent_at
            ? `ส่ง ${timeAgo(sqlUtc(c.sent_at))}`
            : ''
  const waitingLandlord = (c.status === 'tenant_signed' || c.status === 'sent') && !c.landlord_signed_at
  return (
    <Link to={`/contracts/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground',
          c.status === 'completed' && 'border-success/30 bg-success/10 text-success',
        )}
      >
        <FileSignature className="size-5" />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-semibold tabular-nums">ห้อง {c.unit_name}</span>
          <span className="truncate">{c.tenant_name ?? '—'}</span>
          {c.tenant_line_linked && <LineIcon className="size-3.5 shrink-0 self-center" />}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{c.doc_no}</span> · {c.title} · {c.property_name}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <ContractStatusBadge status={c.status} />
          {waitingLandlord && c.status === 'tenant_signed' && (
            <span className="font-medium text-warning-foreground">รอคุณลงนาม</span>
          )}
          <span>{when}</span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-label={s.label} />
    </Link>
  )
}
