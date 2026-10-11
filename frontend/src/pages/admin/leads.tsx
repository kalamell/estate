// ผู้สนใจจากฟอร์มติดต่อบนหน้าแนะนำระบบ (และฟอร์มแสดงความสนใจในแอป) — Super Admin ติดตามและบันทึกผล
import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, Inbox, Loader2, Mail, Phone, Save } from 'lucide-react'
import { api, type Lead, type LeadStatus } from '@/lib/api'
import { sqlUtc } from '@/lib/billing'
import { dateTime, timeAgo } from '@/lib/docs'
import { invalidate } from '@/lib/query'
import { TONE, type Tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/common'

const LEAD_STATUS: Record<LeadStatus, { label: string; tone: Tone }> = {
  new: { label: 'ใหม่', tone: 'mustard' },
  contacted: { label: 'ติดต่อแล้ว', tone: 'ink' },
  won: { label: 'เป็นลูกค้า', tone: 'green' },
  lost: { label: 'ไม่สำเร็จ', tone: 'grey' },
}
const STATUSES = Object.keys(LEAD_STATUS) as LeadStatus[]
type Filter = LeadStatus | 'all'
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'new', label: 'ใหม่' },
  { v: 'contacted', label: 'ติดต่อแล้ว' },
  { v: 'won', label: 'เป็นลูกค้า' },
  { v: 'lost', label: 'ไม่สำเร็จ' },
  { v: 'all', label: 'ทั้งหมด' },
]

export default function AdminLeads() {
  const [status, setStatus] = useState<Filter>('new')
  const q = useQuery({
    queryKey: ['admin', 'leads', status],
    queryFn: () => api.admin.leads({ status: status === 'all' ? '' : status }),
    placeholderData: keepPreviousData,
  })
  const leads = q.data?.leads ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">ผู้สนใจ</h1>
        <p className="text-sm text-muted-foreground">
          ข้อมูลจากฟอร์มติดต่อบนหน้าแนะนำระบบ และฟอร์มแสดงความสนใจในแอป — ทุกคนกดยินยอมให้ติดต่อกลับแล้ว
        </p>
      </div>

      <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1" role="tablist" aria-label="สถานะผู้สนใจ">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            role="tab"
            aria-selected={status === f.v}
            onClick={() => setStatus(f.v)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors',
              status === f.v ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {f.label}
            {f.v === 'new' && !!q.data?.new && <span className="tabular-nums opacity-70">{q.data.new}</span>}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : !leads.length ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={status === 'new' ? 'ไม่มีผู้สนใจรายใหม่' : 'ไม่มีรายการในสถานะนี้'}
            description="ผู้ที่ส่งฟอร์มติดต่อจากหน้าแรกจะแสดงที่นี่ และระบบส่งอีเมลแจ้ง Super Admin ทุกคน"
          />
        </Card>
      ) : (
        <div className={cn('grid gap-4 lg:grid-cols-2', q.isPlaceholderData && 'opacity-60')}>
          {leads.map((l) => (
            <LeadCard key={l.id} lead={l} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeadCard({ lead }: { lead: Lead }) {
  const [note, setNote] = useState(lead.note)
  const [savedNote, setSavedNote] = useState(lead.note)
  // ข้อมูลใหม่จากเซิร์ฟเวอร์ (เช่น อีกแท็บแก้ไว้) → ใช้ค่านั้นถ้ายังไม่ได้พิมพ์อะไรค้างไว้
  if (lead.note !== savedNote) {
    setSavedNote(lead.note)
    if (note === savedNote) setNote(lead.note)
  }
  const dirty = note.trim() !== lead.note

  const update = useMutation({
    mutationFn: (b: { status?: LeadStatus; note?: string }) => api.admin.updateLead(lead.id, b),
    onSuccess: async (_r, b) => {
      toast.success(b.status ? `เปลี่ยนเป็น “${LEAD_STATUS[b.status].label}” แล้ว` : 'บันทึกโน้ตแล้ว')
      await invalidate('admin')
    },
  })
  const created = sqlUtc(lead.created_at)
  const s = LEAD_STATUS[lead.status] ?? LEAD_STATUS.new

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-base font-semibold">{lead.name}</h2>
            <span className={cn('rounded-sm px-1.5 py-0.5 text-[11px] font-medium', TONE[s.tone])}>{s.label}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <time dateTime={created} title={dateTime(created)}>
              {timeAgo(created)}
            </time>
            {' · '}#{lead.id}
          </p>
        </div>
        <Select
          value={lead.status}
          onValueChange={(v) => update.mutate({ status: v as LeadStatus })}
          disabled={update.isPending}
        >
          <SelectTrigger size="sm" className="w-36 shrink-0 bg-card" aria-label={`สถานะของ ${lead.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {STATUSES.map((v) => (
              <SelectItem key={v} value={v}>
                {LEAD_STATUS[v].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {lead.business && (
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-4 text-muted-foreground" />
            {lead.business}
            {lead.units != null && (
              <span className="text-muted-foreground">· {lead.units.toLocaleString('th-TH')} ห้อง</span>
            )}
          </span>
        )}
        {!lead.business && lead.units != null && (
          <span className="text-muted-foreground">{lead.units.toLocaleString('th-TH')} ห้อง</span>
        )}
        {lead.phone && (
          <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <Phone className="size-4" />
            {lead.phone}
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="inline-flex min-w-0 items-center gap-1.5 break-all text-primary hover:underline">
            <Mail className="size-4 shrink-0" />
            {lead.email}
          </a>
        )}
      </div>

      {lead.message && (
        <p className="rounded-md bg-muted/60 px-3 py-2.5 text-sm whitespace-pre-wrap">{lead.message}</p>
      )}

      <div className="grid gap-2">
        <label htmlFor={`lead-note-${lead.id}`} className="text-xs font-medium text-muted-foreground">
          โน้ตภายใน
        </label>
        <Textarea
          id={`lead-note-${lead.id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น โทรแล้ว นัดเดโมวันศุกร์ / ใช้โปรแกรมเดิมอยู่ หมดสัญญาเดือน ม.ค."
          className="min-h-16 bg-card"
        />
        {dirty && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNote(lead.note)} disabled={update.isPending}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={() => update.mutate({ note: note.trim() })} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" /> : <Save />} บันทึกโน้ต
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
