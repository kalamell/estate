// คำขอใช้สิทธิ์ตาม PDPA + ข้อมูลที่ครบระยะเวลาเก็บรักษา — /privacy-requests (เจ้าของ/ผู้ดูแล)
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Archive,
  CalendarClock,
  Check,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  RotateCcw,
  Settings2,
  ShieldCheck,
  UserX,
  X,
} from 'lucide-react'
import { api, type PrivacyRequest, type PrivacyRequestStatus, type RetentionDue } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { num, thDate, thDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { AdminOnlyState, EmptyState, Field, ToneBadge } from '@/components/common'
import { AnonymizeDialog, type AnonymizeTarget } from '@/components/privacy'
import { PRIVACY_KINDS, PRIVACY_STATUS, dueInfo, useExportTenant } from '@/lib/privacy'

type Tab = 'requests' | 'retention'
type StatusFilter = PrivacyRequestStatus | 'all'

const FILTERS: { v: StatusFilter; label: string }[] = [
  { v: 'open', label: 'รอดำเนินการ' },
  { v: 'done', label: 'ดำเนินการแล้ว' },
  { v: 'rejected', label: 'ปฏิเสธ' },
  { v: 'all', label: 'ทั้งหมด' },
]

export default function PrivacyRequestsPage() {
  const { canManage } = useSession()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'retention' ? 'retention' : 'requests'
  const open = useQuery({
    queryKey: ['privacy-requests', 'open'],
    queryFn: () => api.privacyRequests({ status: 'open' }),
    enabled: canManage,
    meta: { silent: true },
  })
  const retention = useQuery({
    queryKey: ['privacy-retention'],
    queryFn: api.privacyRetention,
    enabled: canManage,
  })

  if (!canManage) return <AdminOnlyState />

  const openCount = open.data?.length ?? 0
  const retentionCount = retention.data?.length ?? 0
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 border-b">
        <Tabs value={tab} onValueChange={(v) => setParams(v === 'retention' ? { tab: v } : {}, { replace: true })}>
          <TabsList variant="line" className="h-10">
            <TabsTrigger value="requests" className="flex-none px-3">
              <Inbox /> คำขอ
              {openCount > 0 && <Count tone="warning">{openCount}</Count>}
            </TabsTrigger>
            <TabsTrigger value="retention" className="flex-none px-3">
              <Archive /> ครบระยะเวลาเก็บข้อมูล
              {retentionCount > 0 && <Count>{retentionCount}</Count>}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button asChild variant="ghost" size="sm" className="mb-1 ml-auto text-muted-foreground">
          <Link to="/settings?tab=privacy">
            <Settings2 /> ตั้งค่า PDPA
          </Link>
        </Button>
      </div>
      {tab === 'requests' ? <RequestsTab /> : <RetentionTab q={retention} />}
    </div>
  )
}

function Count({ children, tone }: { children: React.ReactNode; tone?: 'warning' }) {
  return (
    <span
      className={cn(
        'rounded-sm px-1.5 text-xs font-semibold tabular-nums',
        tone === 'warning' ? 'bg-warning/20 text-warning-foreground' : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

// ===================== คำขอ =====================

function RequestsTab() {
  const [status, setStatus] = useState<StatusFilter>('open')
  const [openReq, setOpenReq] = useState<PrivacyRequest | null>(null)
  const list = useQuery({
    queryKey: ['privacy-requests', status],
    queryFn: () => api.privacyRequests({ status: status === 'all' ? '' : status }),
  })
  const rows = [...(list.data ?? [])].sort((a, b) =>
    a.status === 'open' && b.status === 'open'
      ? a.due_date.localeCompare(b.due_date)
      : b.created_at.localeCompare(a.created_at),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border bg-muted/50 p-1" role="radiogroup" aria-label="กรองสถานะคำขอ">
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
        <p className="text-xs text-muted-foreground">ผู้เช่ายื่นคำขอผ่านพอร์ทัล — กฎหมายกำหนดให้ตอบภายใน 30 วัน</p>
      </div>

      {list.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title={status === 'open' ? 'ไม่มีคำขอรอดำเนินการ' : 'ไม่มีรายการ'}
            description="คำขอเข้าถึง แก้ไข ลบ คัดค้าน หรือถอนความยินยอมจากผู้เช่าจะแสดงที่นี่"
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_9rem_7rem_1rem] gap-4 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>ผู้เช่า</span>
            <span>ประเภทคำขอ</span>
            <span>ยื่นเมื่อ</span>
            <span>กำหนดตอบ</span>
            <span>สถานะ</span>
            <span />
          </div>
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <RequestRow r={r} onOpen={() => setOpenReq(r)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RequestDialog request={openReq} onClose={() => setOpenReq(null)} />
    </div>
  )
}

function DueBadge({ r }: { r: PrivacyRequest }) {
  if (r.status !== 'open')
    return <span className="text-xs text-muted-foreground">{r.resolved_at ? `ปิด ${thDate(r.resolved_at)}` : '—'}</span>
  const d = dueInfo(r.due_date)
  return (
    <ToneBadge tone={d.overdue ? 'red' : d.days <= 7 ? 'mustard' : 'grey'} className="tabular-nums">
      <CalendarClock /> {d.label}
    </ToneBadge>
  )
}

function RequestRow({ r, onOpen }: { r: PrivacyRequest; onOpen: () => void }) {
  const st = PRIVACY_STATUS[r.status] ?? PRIVACY_STATUS.open
  const overdue = r.status === 'open' && dueInfo(r.due_date).overdue
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'grid w-full gap-x-4 gap-y-1.5 px-4 py-3 text-left text-sm hover:bg-muted/40 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_9rem_7rem_1rem] md:items-center',
        overdue && 'bg-destructive/[0.03]',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{r.tenant_name}</span>
        {r.note && <span className="block truncate text-xs text-muted-foreground">{r.note}</span>}
      </span>
      <span className="min-w-0 truncate">{PRIVACY_KINDS[r.kind]?.label ?? r.kind}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        <span className="md:hidden">ยื่น </span>
        {thDate(r.created_at)}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <DueBadge r={r} />
        <span className="md:hidden">
          <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
        </span>
      </span>
      <span className="hidden md:block">
        <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
      </span>
      <ChevronRight className="hidden size-4 text-muted-foreground md:block" />
    </button>
  )
}

function RequestDialog({ request, onClose }: { request: PrivacyRequest | null; onClose: () => void }) {
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {request && <RequestForm key={request.id} r={request} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function RequestForm({ r, onClose }: { r: PrivacyRequest; onClose: () => void }) {
  const { readOnly } = useSession()
  const [response, setResponse] = useState(r.response ?? '')
  const [anon, setAnon] = useState<AnonymizeTarget | null>(null)
  const exportTenant = useExportTenant()
  const kind = PRIVACY_KINDS[r.kind]
  const st = PRIVACY_STATUS[r.status] ?? PRIVACY_STATUS.open

  const update = useMutation({
    mutationFn: (status: PrivacyRequestStatus) => api.patchPrivacyRequest(r.id, { status, response: response.trim() }),
    onSuccess: async (_x, status) => {
      toast.success(
        status === 'done' ? 'บันทึกว่าดำเนินการแล้ว' : status === 'rejected' ? 'ปฏิเสธคำขอแล้ว' : 'บันทึกแล้ว',
      )
      await invalidate('privacy-requests', 'dashboard')
      onClose()
    },
  })
  const needResponse = !response.trim()

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{kind?.label ?? r.kind}</DialogTitle>
        <DialogDescription>
          {r.tenant_name} · ยื่นเมื่อ {thDateLong(r.created_at)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
        <DueBadge r={r} />
        {r.status === 'open' && (
          <span className="text-xs text-muted-foreground">ตอบภายใน {thDateLong(r.due_date)}</span>
        )}
      </div>

      <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
        <div className="text-xs text-muted-foreground">{kind?.hint}</div>
        <p className="mt-1 whitespace-pre-wrap">{r.note || <span className="text-muted-foreground">ไม่มีรายละเอียดเพิ่มเติม</span>}</p>
      </div>

      {/* ทางลัดตามประเภทคำขอ */}
      {(r.kind === 'access' || r.kind === 'deletion' || r.kind === 'correction') && (
        <div className="flex flex-wrap gap-2">
          {r.kind === 'access' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportTenant.mutate(r.tenant_id)}
              disabled={exportTenant.isPending}
            >
              {exportTenant.isPending ? <Loader2 className="animate-spin" /> : <Download />}
              ส่งออกข้อมูล (JSON)
            </Button>
          )}
          {r.kind === 'deletion' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setAnon({ id: r.tenant_id, name: r.tenant_name })}
              disabled={readOnly}
            >
              <UserX /> ลบข้อมูลส่วนบุคคล
            </Button>
          )}
          {r.kind === 'correction' && (
            <Button asChild type="button" variant="outline" size="sm">
              <Link to={`/tenants?q=${encodeURIComponent(r.tenant_name)}`}>แก้ไขข้อมูลผู้เช่า</Link>
            </Button>
          )}
        </div>
      )}

      <Field
        label="คำตอบถึงผู้เช่า"
        htmlFor="pr-response"
        hint="สรุปสิ่งที่ดำเนินการ หรือเหตุผลที่ปฏิเสธ (เช่น ต้องเก็บเอกสารภาษีตามกฎหมาย)"
      >
        <Textarea
          id="pr-response"
          rows={4}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          disabled={readOnly}
        />
      </Field>

      <DialogFooter className="gap-2 sm:justify-between">
        {r.status !== 'open' ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => update.mutate('open')}
            disabled={readOnly || update.isPending}
          >
            <RotateCcw /> เปิดคำขออีกครั้ง
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => update.mutate('rejected')}
            disabled={readOnly || update.isPending || needResponse}
            title={needResponse ? 'กรุณาระบุเหตุผล' : undefined}
          >
            {update.isPending && update.variables === 'rejected' ? <Loader2 className="animate-spin" /> : <X />}
            ปฏิเสธ
          </Button>
          <Button
            type="button"
            onClick={() => update.mutate('done')}
            disabled={readOnly || update.isPending || needResponse}
            title={needResponse ? 'กรุณาระบุคำตอบ' : undefined}
          >
            {update.isPending && update.variables === 'done' ? <Loader2 className="animate-spin" /> : <Check />}
            ดำเนินการแล้ว
          </Button>
        </div>
      </DialogFooter>

      <AnonymizeDialog target={anon} onClose={() => setAnon(null)} />
    </div>
  )
}

// ===================== ครบระยะเวลาเก็บข้อมูล =====================

function RetentionTab({ q }: { q: UseQueryResult<RetentionDue[]> }) {
  const { orgInfo, readOnly } = useSession()
  const [anon, setAnon] = useState<AnonymizeTarget | null>(null)
  const exportTenant = useExportTenant()
  const years = orgInfo?.org.retention_years
  const rows = q.data ?? []

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ผู้เช่าที่ไม่มีกิจกรรมเกิน {years ? `${years} ปี` : 'ระยะเวลาที่กำหนด'} — ควรลบข้อมูลส่วนบุคคลเมื่อหมดความจำเป็น
        (ใบแจ้งหนี้และใบเสร็จยังเก็บไว้ตามกฎหมาย){' '}
        <Link to="/settings?tab=privacy" className="font-medium text-primary hover:underline">
          ปรับระยะเวลา
        </Link>
      </p>

      {q.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !rows.length ? (
        <Card>
          <EmptyState icon={Archive} title="ไม่มีข้อมูลที่ครบระยะเวลาเก็บรักษา" description="ระบบตรวจสอบจากกิจกรรมล่าสุดของผู้เช่าแต่ละราย" />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.tenant_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.tenant_name}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    กิจกรรมล่าสุด {thDate(r.last_activity)} · ผ่านมา {num(r.years)} ปี
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => exportTenant.mutate(r.tenant_id)}
                    disabled={exportTenant.isPending && exportTenant.variables === r.tenant_id}
                  >
                    {exportTenant.isPending && exportTenant.variables === r.tenant_id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    <span className="hidden sm:inline">ส่งออก</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    disabled={readOnly}
                    onClick={() => setAnon({ id: r.tenant_id, name: r.tenant_name })}
                  >
                    <UserX /> ลบข้อมูล
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <AnonymizeDialog target={anon} onClose={() => setAnon(null)} />
    </div>
  )
}
