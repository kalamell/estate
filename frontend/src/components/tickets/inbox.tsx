// กล่องคำร้องแบบสองฝั่ง (รายการ | รายละเอียด) — ใช้ร่วมกันระหว่าง แจ้งซ่อม, ติดต่อผู้ให้บริการ, และ admin console
import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Building2, DoorOpen, Inbox, MessageSquare, User } from 'lucide-react'
import type { Ticket, TicketDetail, TicketPatch, TicketPriority, TicketStatus } from '@/lib/api'
import { api } from '@/lib/api'
import { invalidate, queryClient } from '@/lib/query'
import { cn } from '@/lib/utils'
import { dateTime, timeAgo } from '@/lib/docs'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common'
import { ACTIVE_STATUSES, PRIORITY, TICKET_STATUS } from './labels'
import {
  MessageThread,
  PhotoGrid,
  PriorityBadge,
  ReplyBox,
  TicketStatusBadge,
} from './parts'

export interface InboxConfig {
  /** query key หลัก เช่น 'tickets' */
  key: string
  list: (f: { property_id?: string; category?: string }) => Promise<Ticket[]>
  get: (id: number) => Promise<TicketDetail>
  reply: (id: number, fd: FormData) => Promise<unknown>
  patch?: (id: number, b: TicketPatch) => Promise<unknown>
  categories: Record<string, string>
  self: 'staff' | 'platform'
  allowInternal?: boolean
  assignable?: boolean
  showOrg?: boolean
  propertyFilter?: boolean
  emptyText: string
  toolbar?: ReactNode
  readOnly?: boolean
}

const ALL = 'all'
type StatusTab = 'active' | TicketStatus | 'all'
const TABS: { v: StatusTab; label: string }[] = [
  { v: 'active', label: 'ค้างอยู่' },
  { v: 'open', label: TICKET_STATUS.open.label },
  { v: 'in_progress', label: TICKET_STATUS.in_progress.label },
  { v: 'waiting', label: TICKET_STATUS.waiting.label },
  { v: 'resolved', label: TICKET_STATUS.resolved.label },
  { v: 'closed', label: TICKET_STATUS.closed.label },
  { v: 'all', label: 'ทั้งหมด' },
]

const matches = (t: Ticket, tab: StatusTab) =>
  tab === 'all' ? true : tab === 'active' ? ACTIVE_STATUSES.includes(t.status) : t.status === tab

export function TicketInbox({ config }: { config: InboxConfig }) {
  const [params, setParams] = useSearchParams()
  const selected = Number(params.get('t')) || null
  const [tab, setTab] = useState<StatusTab>('active')
  const [propertyId, setPropertyId] = useState(ALL)
  const [category, setCategory] = useState(ALL)

  const filter = {
    property_id: propertyId === ALL ? undefined : propertyId,
    category: category === ALL ? undefined : category,
  }
  const list = useQuery({ queryKey: [config.key, 'list', filter], queryFn: () => config.list(filter) })
  const properties = useQuery({
    queryKey: ['properties'],
    queryFn: api.properties,
    enabled: !!config.propertyFilter,
  })

  const counts = useMemo(() => {
    const c = {} as Record<StatusTab, number>
    for (const t of TABS) c[t.v] = (list.data ?? []).filter((x) => matches(x, t.v)).length
    return c
  }, [list.data])
  const shown = useMemo(
    () =>
      (list.data ?? [])
        .filter((t) => matches(t, tab))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [list.data, tab],
  )

  const select = (id: number | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('t', String(id))
    else p.delete('t')
    setParams(p, { replace: id == null ? true : !!selected })
  }

  return (
    <div className="grid gap-4 lg:h-[calc(100svh-11rem)] lg:min-h-[32rem] lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {/* รายการ */}
      <Card className={cn('min-h-0 gap-0 overflow-hidden py-0', selected && 'hidden lg:flex')}>
        <div className="space-y-2 border-b p-3">
          {config.toolbar && <div className="flex [&>*]:flex-1">{config.toolbar}</div>}
          <div className="flex flex-wrap gap-2">
            {config.propertyFilter && (
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="กรองโครงการ">
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
            )}
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="กรองหมวดหมู่">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทุกหมวด</SelectItem>
                {Object.entries(config.categories).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="สถานะ">
            {TABS.map((t) => (
              <button
                key={t.v}
                role="tab"
                aria-selected={tab === t.v}
                onClick={() => setTab(t.v)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-xs transition-colors',
                  tab === t.v ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {t.label}
                <span className="tabular-nums opacity-70">{counts[t.v] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : !shown.length ? (
            <EmptyState icon={Inbox} title={config.emptyText} className="py-16" />
          ) : (
            <ul className="divide-y">
              {shown.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => select(t.id)}
                    className={cn(
                      'relative block w-full px-4 py-3 text-left transition-colors hover:bg-muted/60',
                      selected === t.id && 'bg-muted before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(t.updated_at)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {config.categories[t.category] ?? t.category}
                      {config.showOrg && t.org_name ? ` · ${t.org_name}` : ''}
                      {t.unit_name ? ` · ห้อง ${t.unit_name}` : ''}
                      {t.property_name ? ` · ${t.property_name}` : ''}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <TicketStatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                      {t.message_count > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MessageSquare className="size-3" /> {t.message_count}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* รายละเอียด */}
      <Card className={cn('min-h-0 gap-0 overflow-hidden py-0', !selected && 'hidden lg:flex')}>
        {selected ? (
          <TicketPane key={selected} id={selected} config={config} onBack={() => select(null)} />
        ) : (
          <EmptyState icon={MessageSquare} title="เลือกรายการเพื่อดูรายละเอียด" className="m-auto" />
        )}
      </Card>
    </div>
  )
}

function TicketPane({ id, config, onBack }: { id: number; config: InboxConfig; onBack: () => void }) {
  const detail = useQuery({ queryKey: [config.key, 'detail', id], queryFn: () => config.get(id) })
  const members = useQuery({ queryKey: ['members'], queryFn: api.members, enabled: !!config.assignable })

  const refresh = () => Promise.all([invalidate(config.key, 'dashboard')])
  const patch = useMutation({
    mutationFn: (b: TicketPatch) => config.patch!(id, b),
    onSuccess: async () => {
      await refresh()
    },
  })
  const reply = useMutation({
    mutationFn: (fd: FormData) => config.reply(id, fd),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [config.key] })
    },
  })

  const t = detail.data?.ticket
  if (detail.isLoading || !t)
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    )

  const canEdit = !!config.patch && !config.readOnly
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-4">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon-sm" className="-ml-1 lg:hidden" onClick={onBack} aria-label="กลับไปที่รายการ">
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">
              #{t.id} · {config.categories[t.category] ?? t.category} · {dateTime(t.created_at)}
            </div>
            <h2 className="text-base leading-snug font-semibold">{t.title}</h2>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <PriorityBadge priority={t.priority} />
            <TicketStatusBadge status={t.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {config.showOrg && t.org_name && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3.5" /> {t.org_name}
            </span>
          )}
          {(t.unit_name || t.property_name) && (
            <span className="inline-flex items-center gap-1">
              <DoorOpen className="size-3.5" />
              {t.unit_name ? `ห้อง ${t.unit_name}` : ''} {t.property_name ?? ''}
            </span>
          )}
          {(t.tenant_name || t.reporter_name) && (
            <span className="inline-flex items-center gap-1">
              <User className="size-3.5" />
              {t.tenant_name || t.reporter_name}
              {t.source === 'tenant' ? ' (ผู้เช่าแจ้ง)' : ''}
            </span>
          )}
        </div>
        {canEdit && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Select value={t.status} onValueChange={(v) => patch.mutate({ status: v as TicketStatus })}>
              <SelectTrigger size="sm" className="w-full" aria-label="สถานะ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TICKET_STATUS) as TicketStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {TICKET_STATUS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={t.priority} onValueChange={(v) => patch.mutate({ priority: v as TicketPriority })}>
              <SelectTrigger size="sm" className="w-full" aria-label="ความเร่งด่วน">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY) as TicketPriority[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    ความเร่งด่วน: {PRIORITY[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.assignable && (
              <Select
                value={t.assignee_user_id ? String(t.assignee_user_id) : 'none'}
                onValueChange={(v) => patch.mutate({ assignee_user_id: v === 'none' ? null : Number(v) })}
              >
                <SelectTrigger size="sm" className="col-span-2 w-full sm:col-span-1" aria-label="ผู้รับผิดชอบ">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ยังไม่มอบหมาย</SelectItem>
                  {members.data?.map((m) => (
                    <SelectItem key={m.user_id} value={String(m.user_id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                  {t.assignee_user_id && !members.data?.some((m) => m.user_id === t.assignee_user_id) && (
                    <SelectItem value={String(t.assignee_user_id)}>{t.assignee_name ?? 'ผู้รับผิดชอบ'}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        {!canEdit && t.assignee_name && (
          <div className="text-xs text-muted-foreground">ผู้รับผิดชอบ: {t.assignee_name}</div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/30 p-4">
        <div className="rounded-md border bg-card p-3 text-sm">
          <div className="mb-1 text-xs text-muted-foreground">รายละเอียด</div>
          <p className="whitespace-pre-wrap">{t.description || '—'}</p>
          <PhotoGrid photos={t.photos} className="mt-2" />
        </div>
        <MessageThread messages={detail.data?.messages ?? []} self={config.self} />
      </div>

      <div className="border-t p-3">
        <ReplyBox
          onSend={(fd) => reply.mutateAsync(fd)}
          pending={reply.isPending}
          allowInternal={config.allowInternal}
          disabled={config.readOnly}
        />
      </div>
    </div>
  )
}
