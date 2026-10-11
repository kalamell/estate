// แจ้งที่พักคนต่างด้าว (ตม.30) — /tm30 (เจ้าของ/ผู้ดูแล)
import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Loader2,
  MoreHorizontal,
  Pencil,
  PlaneLanding,
  RotateCcw,
  Scale,
  Stamp,
  UserPen,
} from 'lucide-react'
import { api, type Tenant, type Tm30Missing, type Tm30Report, type Tm30Status } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { sqlUtc } from '@/lib/billing'
import { dateTime } from '@/lib/docs'
import { countryName, genderLabel } from '@/lib/countries'
import { diffDays, thDate, thDateLong, thDayShort, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { AdminOnlyState, EmptyState, Field, ToneBadge } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { CountryCode } from '@/components/country-picker'
import { useCopy } from '@/components/line'
import { ReasonDialog } from '@/components/reason-dialog'
import { TenantDialog } from '@/components/tenant-dialog'
import { PhotoGrid, PhotoPicker } from '@/components/tickets/parts'

/** เว็บไซต์ทางการของสำนักงานตรวจคนเข้าเมืองสำหรับแจ้งที่พักออนไลน์ */
const TM30_SITE = 'https://tm30.immigration.go.th'

type Filter = Tm30Status | 'all'
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'pending', label: 'รอแจ้ง' },
  { v: 'submitted', label: 'แจ้งแล้ว' },
  { v: 'not_required', label: 'ไม่ต้องแจ้ง' },
  { v: 'all', label: 'ทั้งหมด' },
]

const MISSING_LABEL: Record<Tm30Missing, string> = {
  passport_no: 'เลขหนังสือเดินทาง',
  arrival_date: 'วันที่เดินทางเข้า',
  visa_type: 'ประเภทวีซ่า',
  gender: 'เพศ',
  birth_date: 'วันเกิด',
}

/** YYYY-MM-DD → DD/MM/YYYY (ค.ศ.) สำหรับกรอกแบบฟอร์ม */
const dmy = (d: string | null | undefined) => {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-')
  return y && m && day ? `${day}/${m}/${y}` : d
}

export default function Tm30Page() {
  const { canManage } = useSession()
  const [status, setStatus] = useState<Filter>('pending')
  const [submitFor, setSubmitFor] = useState<Tm30Report | null>(null)
  const [skipFor, setSkipFor] = useState<Tm30Report | null>(null)
  const [copyFor, setCopyFor] = useState<Tm30Report | null>(null)
  const [editTenantId, setEditTenantId] = useState<number | null>(null)
  const q = useQuery({
    queryKey: ['tm30', status],
    queryFn: () => api.tm30({ status: status === 'all' ? '' : status }),
    enabled: canManage,
  })
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: api.tenants, enabled: canManage, meta: { silent: true } })
  const editTenant: Tenant | null = useMemo(
    () => (editTenantId ? (tenants.data?.find((t) => t.id === editTenantId) ?? null) : null),
    [editTenantId, tenants.data],
  )

  const skip = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.skipTm30(id, reason),
    onSuccess: async () => {
      toast.success('บันทึกว่าไม่ต้องแจ้งแล้ว')
      setSkipFor(null)
      await invalidate('tm30', 'dashboard')
    },
  })

  if (!canManage) return <AdminOnlyState />

  const d = q.data
  // รอแจ้ง: ใกล้/เลยกำหนดก่อน, อื่นๆ: เข้าพักล่าสุดก่อน
  const reports = [...(d?.reports ?? [])].sort((a, b) =>
    a.status === 'pending' && b.status === 'pending'
      ? (a.deadline ?? '').localeCompare(b.deadline ?? '')
      : Number(b.status === 'pending') - Number(a.status === 'pending') || b.check_in.localeCompare(a.check_in),
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button asChild variant="outline" size="sm">
            <a href={api.tm30ExportUrl()} download>
              <Download /> ส่งออก CSV (รอแจ้ง)
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={TM30_SITE} target="_blank" rel="noreferrer">
              เปิดระบบแจ้ง ตม.30 ออนไลน์ <ExternalLink className="opacity-70" />
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Tile label="รอแจ้ง" value={d?.summary.pending} tone={d?.summary.pending ? 'warning' : undefined} />
            <Tile label="เกินกำหนด" value={d?.summary.overdue} tone={d?.summary.overdue ? 'danger' : undefined} />
            <Tile label="ครบกำหนดวันนี้" value={d?.summary.due_today} tone={d?.summary.due_today ? 'warning' : undefined} />
          </div>

          {q.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          ) : !reports.length ? (
            <Card>
              <EmptyState
                icon={PlaneLanding}
                title={status === 'pending' ? 'ไม่มีรายการรอแจ้ง' : 'ไม่มีรายการ'}
                description="ระบบสร้างรายการให้อัตโนมัติเมื่อผู้เช่าที่ระบุสัญชาติต่างชาติมีการจองหรือเข้าพัก — ตั้งสัญชาติได้ที่หน้าผู้เช่า"
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <ReportCard
                  key={r.id}
                  r={r}
                  onSubmit={() => setSubmitFor(r)}
                  onSkip={() => setSkipFor(r)}
                  onCopy={() => setCopyFor(r)}
                  onEditTenant={() => setEditTenantId(r.tenant_id)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <LegalCard />
          <VisaCard items={d?.visa_expiring ?? []} loading={q.isLoading} onEdit={setEditTenantId} />
        </aside>
      </div>

      <SubmitDialog report={submitFor} onClose={() => setSubmitFor(null)} />
      <CopyDialog report={copyFor} onClose={() => setCopyFor(null)} />
      <ReasonDialog
        open={!!skipFor}
        onOpenChange={(o) => !o && setSkipFor(null)}
        title="ไม่ต้องแจ้ง ตม.30"
        description="เช่น ผู้เช่ามีถิ่นที่อยู่ถาวร แจ้งโดยผู้ให้เช่ารายอื่นแล้ว หรือบันทึกสัญชาติผิด"
        confirmText="บันทึก"
        pending={skip.isPending}
        onConfirm={(reason) => skipFor && skip.mutate({ id: skipFor.id, reason })}
      />
      <TenantDialog
        open={!!editTenant}
        onOpenChange={(o) => !o && setEditTenantId(null)}
        tenant={editTenant}
        onSaved={() => void invalidate('tm30', 'dashboard')}
      />
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number | undefined; tone?: 'warning' | 'danger' }) {
  return (
    <Card className="gap-1 px-3 py-2.5">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
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

function DeadlineBadge({ r }: { r: Tm30Report }) {
  if (r.status === 'submitted') return <ToneBadge tone="green">แจ้งแล้ว</ToneBadge>
  if (r.status === 'not_required') return <ToneBadge tone="grey">ไม่ต้องแจ้ง</ToneBadge>
  const t = today()
  if (r.overdue_days > 0) return <ToneBadge tone="red">เกินกำหนด {r.overdue_days} วัน</ToneBadge>
  if (r.deadline === t) return <ToneBadge tone="mustard">ครบกำหนดวันนี้</ToneBadge>
  if (r.check_in > t) return <ToneBadge tone="grey">เข้าพักอีก {diffDays(t, r.check_in)} วัน</ToneBadge>
  return <ToneBadge tone="mustard">ครบกำหนดพรุ่งนี้</ToneBadge>
}

function ReportCard({
  r,
  onSubmit,
  onSkip,
  onCopy,
  onEditTenant,
}: {
  r: Tm30Report
  onSubmit: () => void
  onSkip: () => void
  onCopy: () => void
  onEditTenant: () => void
}) {
  const { readOnly } = useSession()
  const confirm = useConfirm()
  const pending = r.status === 'pending'
  const reopen = useMutation({
    mutationFn: () => api.reopenTm30(r.id),
    onSuccess: async () => {
      toast.success('เปิดรายการเป็นรอแจ้งอีกครั้ง')
      await invalidate('tm30', 'dashboard')
    },
  })

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden py-0',
        pending && r.overdue_days > 0 && 'border-destructive/30',
      )}
    >
      <div className="grid gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{r.full_name}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CountryCode code={r.nationality} /> {countryName(r.nationality)}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              ห้อง {r.unit_name} · {r.property_name}
            </div>
          </div>
          <DeadlineBadge r={r} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="ตัวเลือก" disabled={readOnly}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEditTenant}>
                <UserPen /> แก้ไขข้อมูลผู้เช่า
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onCopy}>
                <ClipboardCopy /> คัดลอกข้อมูลสำหรับกรอก
              </DropdownMenuItem>
              {pending ? (
                <DropdownMenuItem onSelect={onSkip}>
                  <Scale /> ไม่ต้องแจ้ง
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={async () => {
                    if (
                      await confirm({
                        title: 'เปิดรายการเป็นรอแจ้งอีกครั้ง?',
                        description: 'ใช้เมื่อบันทึกผิด — เลขที่รับแจ้งเดิมยังเก็บไว้',
                        confirmText: 'เปิดอีกครั้ง',
                      })
                    )
                      reopen.mutate()
                  }}
                >
                  <RotateCcw /> เปิดอีกครั้ง
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">เข้าพัก</dt>
            <dd className="tabular-nums">{thDayShort(r.check_in)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">ต้องแจ้งภายใน</dt>
            <dd className={cn('tabular-nums', pending && r.overdue_days > 0 && 'font-medium text-destructive')}>
              {r.deadline ? thDayShort(r.deadline) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">หนังสือเดินทาง</dt>
            <dd className="truncate font-mono text-xs leading-5">{r.passport_no || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">วีซ่า</dt>
            <dd className="truncate">
              {r.visa_type || '—'}
              {r.visa_expiry && <span className="block text-xs text-muted-foreground">ถึง {thDate(r.visa_expiry)}</span>}
            </dd>
          </div>
        </dl>

        {pending && r.missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span className="min-w-0 flex-1">
              ข้อมูลยังไม่ครบ: {r.missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}
            </span>
            <Button variant="outline" size="sm" className="h-7 bg-card" onClick={onEditTenant} disabled={readOnly}>
              <Pencil /> เพิ่มข้อมูล
            </Button>
          </div>
        )}

        {r.status === 'submitted' && (
          <div className="flex flex-wrap items-start gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
            <FileCheck2 className="mt-0.5 size-4 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              {r.reference_no ? (
                <div>
                  เลขที่รับแจ้ง <span className="font-mono font-medium">{r.reference_no}</span>
                </div>
              ) : (
                <div>แนบใบรับแจ้งแล้ว</div>
              )}
              <div className="text-xs text-muted-foreground">
                {r.submitted_at ? dateTime(sqlUtc(r.submitted_at)) : ''}
                {r.submitted_by_name ? ` · โดย ${r.submitted_by_name}` : ''}
              </div>
              {r.note && <div className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{r.note}</div>}
            </div>
            {r.proof_url && <PhotoGrid photos={[r.proof_url]} className="[&>button]:size-12" />}
          </div>
        )}
        {r.status === 'not_required' && r.note && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">เหตุผล: </span>
            {r.note}
          </p>
        )}
      </div>

      {pending && (
        <div className="flex flex-wrap gap-2 border-t bg-muted/30 px-4 py-2.5">
          <Button variant="outline" size="sm" className="h-8 bg-card text-xs" onClick={onCopy}>
            <ClipboardCopy /> คัดลอกข้อมูล
          </Button>
          <Button size="sm" className="ml-auto h-8 text-xs" onClick={onSubmit} disabled={readOnly}>
            <Stamp /> บันทึกว่าแจ้งแล้ว
          </Button>
        </div>
      )}
    </Card>
  )
}

function LegalCard() {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="size-4 text-muted-foreground" /> ตม.30 คืออะไร
        </CardTitle>
        <CardDescription>การแจ้งที่พักของคนต่างด้าว</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm leading-relaxed">
        <p>
          ตาม พ.ร.บ.คนเข้าเมือง พ.ศ. 2522 มาตรา 38 เจ้าบ้าน เจ้าของ หรือผู้ครอบครองที่พักที่มีคนต่างด้าวเข้าพัก
          ต้องแจ้งเจ้าพนักงานตรวจคนเข้าเมืองภายใน <b>24 ชั่วโมง</b> นับแต่คนต่างด้าวเข้าพัก
        </p>
        <p>การแจ้งล่าช้าหรือไม่แจ้งอาจถูกปรับ — ระบบนับกำหนดแจ้งถึงสิ้นวันถัดจากวันเข้าพัก</p>
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          ข้อมูลทั่วไป ควรตรวจสอบกับ ตม. ในพื้นที่ — การยื่นแจ้งทำในระบบของสำนักงานตรวจคนเข้าเมือง
          ระบบนี้ช่วยรวบรวมข้อมูลและเก็บหลักฐานการแจ้ง
        </p>
        <Button asChild variant="outline" size="sm" className="w-fit">
          <a href={TM30_SITE} target="_blank" rel="noreferrer">
            เว็บไซต์ทางการ tm30.immigration.go.th <ExternalLink className="opacity-70" />
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

function VisaCard({
  items,
  loading,
  onEdit,
}: {
  items: { tenant_id: number; full_name: string; nationality: string; visa_expiry: string }[]
  loading: boolean
  onEdit: (id: number) => void
}) {
  const t = today()
  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">วีซ่าใกล้หมดอายุ</CardTitle>
        <CardDescription>ผู้เช่าที่ยังพักอยู่ วีซ่าหมดภายใน 30 วัน</CardDescription>
      </CardHeader>
      {loading ? (
        <div className="p-4">
          <Skeleton className="h-10" />
        </div>
      ) : !items.length ? (
        <p className="px-6 py-5 text-sm text-muted-foreground">ไม่มีรายการ</p>
      ) : (
        <ul className="divide-y">
          {items.map((v) => {
            const days = diffDays(t, v.visa_expiry)
            return (
              <li key={v.tenant_id}>
                <button
                  type="button"
                  onClick={() => onEdit(v.tenant_id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40"
                >
                  <CountryCode code={v.nationality} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{v.full_name}</span>
                    <span className="text-xs text-muted-foreground">ถึง {thDateLong(v.visa_expiry)}</span>
                  </span>
                  <ToneBadge tone={days < 0 ? 'red' : days <= 7 ? 'mustard' : 'grey'}>
                    {days < 0 ? `หมดแล้ว ${-days} วัน` : days === 0 ? 'หมดวันนี้' : `อีก ${days} วัน`}
                  </ToneBadge>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ===================== คัดลอกข้อมูล =====================

function fieldsOf(r: Tm30Report): [string, string][] {
  return [
    ['ชื่อ-นามสกุล', r.full_name],
    ['สัญชาติ', `${countryName(r.nationality)} (${r.nationality})`],
    ['เลขหนังสือเดินทาง', r.passport_no],
    ['เพศ', r.gender ? genderLabel(r.gender) : ''],
    ['วันเกิด', dmy(r.birth_date)],
    ['วันที่เดินทางเข้าประเทศ', dmy(r.arrival_date)],
    ['ประเภทวีซ่า', r.visa_type],
    ['วีซ่าครบกำหนด', dmy(r.visa_expiry)],
    ['วันที่เข้าพัก', dmy(r.check_in)],
    ['วันที่ออก (ถ้ามี)', dmy(r.check_out)],
    ['ที่พัก', `${r.property_name} ห้อง ${r.unit_name}`],
    ['ที่อยู่ที่พัก', r.property_address],
    ['โทรศัพท์', r.phone],
  ]
}

function CopyDialog({ report, onClose }: { report: Tm30Report | null; onClose: () => void }) {
  const { copied, copy } = useCopy()
  const fields = report ? fieldsOf(report) : []
  const all = fields.map(([k, v]) => `${k}: ${v || '-'}`).join('\n')
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ข้อมูลสำหรับกรอกแบบแจ้ง</DialogTitle>
          <DialogDescription>กดคัดลอกทีละช่องไปวางในระบบแจ้งของ ตม. — วันที่เป็นรูปแบบ วว/ดด/ปปปป (ค.ศ.)</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {fields.map(([k, v]) => (
            <li key={k} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-32 shrink-0 text-xs text-muted-foreground sm:w-40">{k}</span>
              <span className={cn('min-w-0 flex-1 break-words', !v && 'text-warning-foreground')}>{v || 'ยังไม่มีข้อมูล'}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`คัดลอก${k}`}
                disabled={!v}
                onClick={() => copy(v, k)}
              >
                {copied === k ? <Check className="text-success" /> : <Copy />}
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => copy(all, '__all')}>
            {copied === '__all' ? <Check /> : <ClipboardCopy />}
            คัดลอกทั้งหมด
          </Button>
          <Button asChild>
            <a href={TM30_SITE} target="_blank" rel="noreferrer">
              เปิดระบบแจ้ง ตม.30 ออนไลน์ <ExternalLink className="opacity-70" />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===================== บันทึกว่าแจ้งแล้ว =====================

function SubmitDialog({ report, onClose }: { report: Tm30Report | null; onClose: () => void }) {
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-md">
        {report && <SubmitForm key={report.id} r={report} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function SubmitForm({ r, onClose }: { r: Tm30Report; onClose: () => void }) {
  const [ref, setRef] = useState(r.reference_no ?? '')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const submit = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.set('reference_no', ref.trim())
      fd.set('note', note.trim())
      if (photos[0]) fd.set('photo', photos[0])
      return api.submitTm30(r.id, fd)
    },
    onSuccess: async () => {
      toast.success('บันทึกการแจ้ง ตม.30 แล้ว')
      onClose()
      await invalidate('tm30', 'dashboard')
    },
  })
  const missing = !ref.trim() && !photos.length
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (missing) return toast.error('กรุณาระบุเลขที่รับแจ้ง หรือแนบรูปใบรับแจ้ง')
        submit.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>บันทึกว่าแจ้งแล้ว</DialogTitle>
        <DialogDescription>
          {r.full_name} · ห้อง {r.unit_name} · เข้าพัก {thDateLong(r.check_in)}
        </DialogDescription>
      </DialogHeader>
      <Field label="เลขที่รับแจ้ง" htmlFor="tm-ref" hint="ระบุเลขที่ หรือแนบรูปใบรับแจ้งอย่างใดอย่างหนึ่ง">
        <Input id="tm-ref" value={ref} onChange={(e) => setRef(e.target.value)} className="font-mono" autoFocus />
      </Field>
      <Field label="รูปใบรับแจ้ง (ใบ ตม.30 ส่วนที่ได้รับคืน / ภาพหน้าจอ)">
        <PhotoPicker files={photos} onChange={setPhotos} max={1} />
      </Field>
      <Field label="หมายเหตุ" htmlFor="tm-note">
        <Textarea id="tm-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={submit.isPending || missing}>
          {submit.isPending ? <Loader2 className="animate-spin" /> : <Stamp />}
          บันทึก
        </Button>
      </DialogFooter>
    </form>
  )
}
