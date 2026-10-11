// งานแม่บ้าน — ใช้บนมือถือเป็นหลัก (แม่บ้าน/พนักงานทำความสะอาด)
import { useMemo, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, LogIn, LogOut, Plus, Sparkles } from 'lucide-react'
import { api, type HkMovement, type HkTask, type HkTaskStatus, type HousekeepingStatus } from '@/lib/api'
import { HK_STATUS, HK_STATUS_ORDER, HK_TASK_STATUS } from '@/lib/housekeeping'
import { channelOf } from '@/lib/channels'
import { TONE, addDays, thDayShort, today } from '@/lib/format'
import { readLS, writeLS } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/common'
import { HkIndicator } from '@/components/housekeeping-indicator'
import { CreateTaskDialog } from './create-task-dialog'
import { TaskCard } from './task-card'
import { TaskSheet } from './task-sheet'
import { useTaskActions } from './use-task'

const ALL = 'all'
const LS_PROPERTY = 'estate.hkProperty'
type Column = Exclude<HkTaskStatus, 'cancelled'>
const COLUMNS: Column[] = ['pending', 'in_progress', 'done']

export default function HousekeepingPage() {
  const { readOnly } = useSession()
  const t = today()
  const [date, setDate] = useState(t)
  const [property, setPropertyState] = useState(() => readLS(LS_PROPERTY) || ALL)
  const [segment, setSegment] = useState<Column | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const propertyId =
    property !== ALL && properties.data?.some((p) => String(p.id) === property) ? Number(property) : null
  const setProperty = (v: string) => {
    setPropertyState(v)
    writeLS(LS_PROPERTY, v)
  }

  const todayQ = useQuery({
    queryKey: ['hk-today', { property_id: propertyId }],
    queryFn: () => api.hkToday(propertyId),
    refetchInterval: 60_000,
  })
  const tasks = useQuery({
    queryKey: ['hk-tasks', { date, property_id: propertyId }],
    queryFn: () => api.hkTasks({ date, property_id: propertyId }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  const members = useQuery({ queryKey: ['members'], queryFn: api.members, meta: { silent: true } })
  const units = useQuery({ queryKey: ['units', 'all'], queryFn: () => api.units() })

  const hkByUnit = useMemo(
    () => new Map((units.data ?? []).map((u) => [u.id, u.housekeeping_status])),
    [units.data],
  )

  const board = useMemo(() => {
    const cols: Record<Column, HkTask[]> = { pending: [], in_progress: [], done: [] }
    for (const task of tasks.data ?? []) if (task.status !== 'cancelled') cols[task.status].push(task)
    const byDue = (a: HkTask, b: HkTask) =>
      a.due_date.localeCompare(b.due_date) || a.unit_name.localeCompare(b.unit_name, 'th', { numeric: true })
    cols.pending.sort(byDue)
    cols.in_progress.sort(byDue)
    cols.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return cols
  }, [tasks.data])

  const seg: Column = segment ?? (board.pending.length || !board.in_progress.length ? 'pending' : 'in_progress')
  const openTask = tasks.data?.find((x) => x.id === openId) ?? null
  const { setStatus, patch } = useTaskActions()
  const busyId = patch.isPending ? patch.variables?.id : null

  const unitsInScope = useMemo(
    () => (units.data ?? []).filter((u) => propertyId == null || u.property_id === propertyId),
    [units.data, propertyId],
  )
  const summary = todayQ.data?.summary

  const card = (task: HkTask) => (
    <TaskCard
      key={task.id}
      task={task}
      readOnly={readOnly}
      busy={busyId === task.id}
      onOpen={() => setOpenId(task.id)}
      onStart={() => void setStatus(task, 'in_progress')}
      onDone={() => void setStatus(task, 'done')}
    />
  )

  return (
    <div className="space-y-5">
      {/* แถบควบคุม */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-r-none sm:size-9"
            aria-label="วันก่อนหน้า"
            onClick={() => setDate((d) => addDays(d, -1))}
          >
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="วันที่"
            className="-mx-px h-10 w-[9.5rem] rounded-none bg-card tabular-nums sm:h-9"
          />
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-l-none sm:size-9"
            aria-label="วันถัดไป"
            onClick={() => setDate((d) => addDays(d, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        {date !== t && (
          <Button variant="ghost" className="h-10 sm:h-9" onClick={() => setDate(t)}>
            วันนี้
          </Button>
        )}
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
        <Button className="h-10 sm:ml-auto sm:h-9" onClick={() => setCreateOpen(true)} disabled={readOnly}>
          <Plus /> สร้างงาน
        </Button>
      </div>

      {/* สรุปสถานะห้อง */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {HK_STATUS_ORDER.map((k) => (
          <SummaryChip key={k} status={k} count={summary?.[k]} />
        ))}
      </div>

      {/* วันนี้ */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          วันนี้ <span className="font-normal text-muted-foreground">· {thDayShort(t)}</span>
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <MovementList
            icon={LogOut}
            title="เช็คเอาท์วันนี้"
            loading={todayQ.isLoading}
            items={todayQ.data?.checkouts ?? []}
            empty="ไม่มีเช็คเอาท์วันนี้"
          />
          <MovementList
            icon={LogIn}
            title="เช็คอินวันนี้"
            loading={todayQ.isLoading}
            items={todayQ.data?.checkins ?? []}
            empty="ไม่มีเช็คอินวันนี้"
            warn={(m) => {
              const s = hkByUnit.get(m.unit_id)
              return s && s !== 'clean' ? s : null
            }}
          />
        </div>
      </section>

      {/* กระดานงาน */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">งาน</h2>
          {date !== t && <span className="text-xs text-muted-foreground">ครบกำหนดถึง {thDayShort(date)}</span>}
        </div>

        {/* มือถือ: ตัวกรองแบบแบ่งส่วน */}
        <Tabs value={seg} onValueChange={(v) => setSegment(v as Column)} className="md:hidden">
          <TabsList className="grid h-11 w-full grid-cols-3">
            {COLUMNS.map((c) => (
              <TabsTrigger key={c} value={c} className="gap-1.5 px-1 text-[13px]">
                {HK_TASK_STATUS[c].label}
                <span className="rounded-sm bg-muted px-1 text-xs tabular-nums">{board[c].length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {tasks.isLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-36 rounded-md" />
            ))}
          </div>
        ) : !tasks.data?.length ? (
          <Card>
            <EmptyState
              icon={Sparkles}
              title="ไม่มีงานแม่บ้าน"
              description="งานทำความสะอาดหลังเช็คเอาท์จะถูกสร้างอัตโนมัติ หรือกด “สร้างงาน” เพื่อเพิ่มเอง"
              action={
                !readOnly && (
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus /> สร้างงาน
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className={cn('transition-opacity', tasks.isPlaceholderData && 'opacity-60')}>
            {/* มือถือ */}
            <div className="space-y-2.5 md:hidden">
              {board[seg].length ? (
                board[seg].map(card)
              ) : (
                <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                  ไม่มีงาน{HK_TASK_STATUS[seg].label}
                </p>
              )}
            </div>
            {/* เดสก์ท็อป */}
            <div className="hidden gap-4 md:grid md:grid-cols-3">
              {COLUMNS.map((c) => (
                <div key={c} className="min-w-0 rounded-md bg-muted/50 p-2">
                  <div className="flex items-center gap-2 px-1.5 pt-1 pb-2.5">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        c === 'pending' ? 'bg-warning' : c === 'in_progress' ? 'bg-info' : 'bg-success',
                      )}
                    />
                    <span className="text-sm font-medium">{HK_TASK_STATUS[c].label}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{board[c].length}</span>
                  </div>
                  <div className="space-y-2">
                    {board[c].length ? (
                      board[c].map(card)
                    ) : (
                      <p className="py-6 text-center text-xs text-muted-foreground">ไม่มีงาน</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <TaskSheet task={openTask} members={members.data ?? []} onClose={() => setOpenId(null)} />
      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        units={unitsInScope}
        properties={properties.data ?? []}
        members={members.data ?? []}
        defaultDate={date < t ? t : date}
      />
    </div>
  )
}

function SummaryChip({ status, count }: { status: HousekeepingStatus; count: number | undefined }) {
  const s = HK_STATUS[status]
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-md px-3 py-2 sm:flex-row sm:items-center sm:gap-2 sm:py-1.5',
        TONE[s.tone],
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium sm:text-sm">
        <HkIndicator status={status} size="xs" className="hidden sm:inline-grid" />
        <span className="truncate">{status === 'dirty' ? 'รอทำความสะอาด' : s.short}</span>
      </span>
      <span className="text-lg leading-tight font-semibold tabular-nums sm:text-sm">
        {count ?? <Skeleton className="inline-block h-4 w-5 align-middle" />}
      </span>
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  const ch = channelOf(source)
  const label = source === 'lease' || source === 'direct' ? 'จองตรง' : ch.label
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span
        className={cn('size-2 rounded-full', !ch.color && 'bg-primary')}
        style={ch.color ? { backgroundColor: ch.color } : undefined}
      />
      {label}
    </Badge>
  )
}

function MovementList({
  icon: Icon,
  title,
  items,
  empty,
  loading,
  warn,
}: {
  icon: typeof LogIn
  title: string
  items: HkMovement[]
  empty: string
  loading: boolean
  warn?: (m: HkMovement) => HousekeepingStatus | null
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{loading ? '' : items.length}</span>
      </div>
      {loading ? (
        <div className="space-y-2 p-3">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {items.map((m) => {
            const w = warn?.(m)
            return (
              <Row key={`${m.booking_id}-${m.unit_id}`}>
                <div className="w-14 shrink-0 font-semibold tabular-nums">{m.unit_name}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{m.guest_name}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.property_name}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <SourceBadge source={m.source} />
                  {w && (
                    <Badge variant="outline" className={cn('gap-1', TONE.mustard)}>
                      <AlertTriangle className="size-3" />
                      {w === 'dirty' ? 'ห้องยังไม่สะอาด' : 'กำลังทำความสะอาด'}
                    </Badge>
                  )}
                </div>
              </Row>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <li className="flex items-center gap-3 px-3 py-2.5">{children}</li>
}
