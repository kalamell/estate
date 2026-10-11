import { Camera, Check, ListChecks, Play, User } from 'lucide-react'
import type { HkTask } from '@/lib/api'
import { HK_KINDS, checklistProgress, isOpenTask } from '@/lib/housekeeping'
import { diffDays, initials, thDayShort, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/** วันครบกำหนด — เลยกำหนดแสดงสีเตือน */
export function DueLabel({ task, className }: { task: HkTask; className?: string }) {
  const t = today()
  const late = isOpenTask(task) ? diffDays(task.due_date, t) : 0
  return (
    <span
      className={cn(
        'tabular-nums',
        late > 0 ? 'font-medium text-warning-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {task.due_date === t ? 'วันนี้' : thDayShort(task.due_date)}
      {late > 0 && ` · เลยกำหนด ${late} วัน`}
    </span>
  )
}

export function AssigneeAvatar({ name, className }: { name: string | null; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
        name ? 'bg-secondary text-secondary-foreground ring-1 ring-border' : 'border border-dashed text-muted-foreground',
        className,
      )}
      title={name ?? 'ยังไม่มอบหมาย'}
      aria-hidden
    >
      {name ? initials(name) : <User className="size-3" />}
    </span>
  )
}

export function TaskCard({
  task,
  onOpen,
  onStart,
  onDone,
  busy,
  readOnly,
}: {
  task: HkTask
  onOpen: () => void
  onStart: () => void
  onDone: () => void
  busy?: boolean
  readOnly?: boolean
}) {
  const prog = checklistProgress(task)
  const late = isOpenTask(task) && task.due_date < today()
  return (
    <div
      className={cn(
        'rounded-md border border-l-4 bg-card transition-colors',
        task.status === 'pending' && (late ? 'border-l-warning' : 'border-l-border'),
        task.status === 'in_progress' && 'border-l-info',
        task.status === 'done' && 'border-l-success',
        task.status === 'cancelled' && 'border-l-border opacity-70',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-t-md px-3 pt-3 pb-2 text-left outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tabular-nums">ห้อง {task.unit_name}</span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{task.property_name}</span>
        </div>
        <div className="mt-0.5 text-sm">{HK_KINDS[task.kind] ?? task.kind}</div>
        {task.guest_name && (
          <div className="truncate text-xs text-muted-foreground">แขก: {task.guest_name}</div>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs">
          <DueLabel task={task} />
          <span className="ml-auto flex items-center gap-3 text-muted-foreground">
            {prog.total > 0 && (
              <span
                className={cn('inline-flex items-center gap-1 tabular-nums', prog.complete && 'text-success')}
                title="รายการตรวจ"
              >
                <ListChecks className="size-3.5" />
                {prog.done}/{prog.total}
              </span>
            )}
            {task.photos.length > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums" title="รูปถ่าย">
                <Camera className="size-3.5" />
                {task.photos.length}
              </span>
            )}
            <AssigneeAvatar name={task.assignee_name} />
          </span>
        </div>
      </button>
      {!readOnly && (task.status === 'pending' || task.status === 'in_progress') && (
        <div className="flex gap-2 border-t px-3 py-2">
          {task.status === 'pending' ? (
            <Button size="sm" variant="secondary" className="h-9 flex-1 sm:h-8" disabled={busy} onClick={onStart}>
              <Play /> เริ่มงาน
            </Button>
          ) : (
            <Button size="sm" className="h-9 flex-1 sm:h-8" disabled={busy} onClick={onDone}>
              <Check /> เสร็จ
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
