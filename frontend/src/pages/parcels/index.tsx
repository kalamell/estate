// พัสดุ — รับแทนผู้เช่า แจ้ง LINE พร้อมรหัสรับ และส่งมอบพร้อมลายเซ็น (/parcels)
import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarCheck, HandHelping, Inbox, Package, PackagePlus, Search, X } from 'lucide-react'
import { api, type Parcel, type ParcelStatus } from '@/lib/api'
import { sqlUtc } from '@/lib/billing'
import { timeAgo } from '@/lib/docs'
import { KIND_ICON, PARCEL_KINDS } from '@/lib/parcels'
import { readLS, writeLS } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common'
import { LineIcon } from '@/components/line'
import { ReceiveDialog } from './receive-dialog'
import { HandoverDialog, ParcelDetailDialog } from './parcel-dialogs'
import { ParcelStatusBadge } from './parts'

type Filter = ParcelStatus | 'all'
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'waiting', label: 'รอรับ' },
  { v: 'picked_up', label: 'รับแล้ว' },
  { v: 'returned', label: 'ตีกลับ' },
  { v: 'all', label: 'ทั้งหมด' },
]
const ALL = 'all'
const LS_PROPERTY = 'estate.parcelProperty'

export default function ParcelsPage() {
  const { readOnly } = useSession()
  const [status, setStatus] = useState<Filter>('waiting')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [property, setPropertyState] = useState(() => readLS(LS_PROPERTY) || ALL)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [detail, setDetail] = useState<Parcel | null>(null)
  const [handover, setHandover] = useState<Parcel | null>(null)

  // หน่วงการค้นหาเล็กน้อย
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const units = useQuery({ queryKey: ['units', 'all'], queryFn: () => api.units() })
  const propertyId =
    property !== ALL && properties.data?.some((p) => String(p.id) === property) ? Number(property) : null
  const setProperty = (v: string) => {
    setPropertyState(v)
    writeLS(LS_PROPERTY, v)
  }
  // ค้นด้วยรหัสรับ 4 หลัก → ดูทุกสถานะ
  const isCode = /^\d{4}$/.test(term)
  const list = useQuery({
    queryKey: ['parcels', { status, property_id: propertyId, q: term }],
    queryFn: () =>
      api.parcels({ status: status === 'all' || isCode ? '' : status, property_id: propertyId, q: term }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  const rows = list.data?.parcels ?? []
  const summary = list.data?.summary
  const current = (p: Parcel | null) => (p ? (rows.find((r) => r.id === p.id) ?? p) : null)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ชื่อ ห้อง เลขพัสดุ หรือรหัสรับ 4 หลัก"
            className="h-10 bg-card pr-9 pl-9 sm:h-9"
            aria-label="ค้นหาพัสดุ"
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
        <Select value={propertyId ? String(propertyId) : ALL} onValueChange={setProperty}>
          <SelectTrigger className="h-10 min-w-0 flex-1 bg-card sm:h-9 sm:w-52 sm:flex-none" aria-label="เลือกโครงการ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกโครงการ</SelectItem>
            {properties.data?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="h-10 sm:ml-auto sm:h-9" onClick={() => setReceiveOpen(true)} disabled={readOnly}>
          <PackagePlus /> รับพัสดุ
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
        <SummaryTile icon={Package} label="รอรับ" value={summary?.waiting} tone={summary?.waiting ? 'warning' : undefined} />
        <SummaryTile icon={CalendarCheck} label="รับเข้าวันนี้" value={summary?.received_today} />
        <SummaryTile
          icon={AlertTriangle}
          label="ค้างเกิน 3 วัน"
          value={summary?.waiting_over_3_days}
          tone={summary?.waiting_over_3_days ? 'danger' : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border bg-muted/50 p-1" role="radiogroup" aria-label="กรองสถานะ">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              role="radio"
              aria-checked={status === f.v}
              onClick={() => setStatus(f.v)}
              className={cn(
                'h-7 rounded-sm px-2.5 text-xs whitespace-nowrap transition-colors',
                status === f.v
                  ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {isCode && <span className="text-xs text-muted-foreground">ค้นหารหัสรับ {term} ในทุกสถานะ</span>}
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
            icon={term ? Search : Inbox}
            title={term ? 'ไม่พบพัสดุที่ค้นหา' : status === 'waiting' ? 'ไม่มีพัสดุรอรับ' : 'ไม่มีรายการ'}
            description={
              term
                ? 'ลองค้นด้วยเลขห้อง ชื่อ หรือเลขพัสดุ'
                : 'กด “รับพัสดุ” เมื่อมีพัสดุมาส่ง ระบบจะแจ้งผู้เช่าทาง LINE พร้อมรหัสรับ'
            }
            action={
              !term && (
                <Button variant="outline" onClick={() => setReceiveOpen(true)} disabled={readOnly}>
                  <PackagePlus /> รับพัสดุ
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map((p) => (
              <li key={p.id}>
                <ParcelRow
                  p={p}
                  readOnly={readOnly}
                  onOpen={() => setDetail(p)}
                  onHandover={() => setHandover(p)}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ReceiveDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        units={units.data ?? []}
        properties={properties.data ?? []}
        defaultPropertyId={propertyId}
      />
      <ParcelDetailDialog
        parcel={current(detail)}
        onClose={() => setDetail(null)}
        onHandover={(p) => {
          setDetail(null)
          setHandover(p)
        }}
      />
      <HandoverDialog parcel={handover} onClose={() => setHandover(null)} />
    </div>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Package
  label: string
  value: number | undefined
  tone?: 'warning' | 'danger'
}) {
  return (
    <Card className="gap-1 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'text-xl font-semibold tabular-nums',
          tone === 'warning' && 'text-warning-foreground',
          tone === 'danger' && 'text-destructive',
        )}
      >
        {value ?? <Skeleton className="h-7 w-8" />}
      </div>
    </Card>
  )
}

function ParcelRow({
  p,
  readOnly,
  onOpen,
  onHandover,
}: {
  p: Parcel
  readOnly: boolean
  onOpen: () => void
  onHandover: () => void
}) {
  const Icon = KIND_ICON[p.kind] ?? KIND_ICON.parcel
  const who = p.tenant_name || p.recipient_name || 'ไม่ระบุชื่อ'
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {p.photo_url ? (
          <span className="size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
            <img src={p.photo_url} alt="" loading="lazy" className="size-full object-cover" />
          </span>
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground">
            <Icon className="size-5" />
          </span>
        )}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            {p.unit_name && <span className="shrink-0 font-semibold tabular-nums">ห้อง {p.unit_name}</span>}
            <span className="truncate">{who}</span>
            {p.tenant_line_linked && <LineIcon className="size-3.5 shrink-0 self-center" />}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {[PARCEL_KINDS[p.kind], p.carrier, p.tracking_no].filter(Boolean).join(' · ')}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <ParcelStatusBadge parcel={p} />
            <span>
              {p.status === 'waiting'
                ? `รับไว้ ${timeAgo(sqlUtc(p.received_at))}`
                : p.picked_up_at
                  ? `${p.status === 'returned' ? 'ตีกลับ' : 'ส่งมอบ'} ${timeAgo(sqlUtc(p.picked_up_at))}`
                  : ''}
            </span>
            {!p.unit_name && <span className="truncate">{p.property_name}</span>}
          </span>
        </span>
      </button>
      {p.status === 'waiting' && (
        <Button
          size="sm"
          variant="outline"
          className="h-9 shrink-0"
          onClick={onHandover}
          disabled={readOnly}
          aria-label="ส่งมอบ"
        >
          <HandHelping /> <span className="hidden sm:inline">ส่งมอบ</span>
        </Button>
      )}
    </div>
  )
}
