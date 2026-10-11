import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Ban,
  Camera,
  Check,
  CalendarDays,
  ImagePlus,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { api, type ChecklistItem, type HkTask, type Member } from '@/lib/api'
import { HK_KINDS, HK_TASK_STATUS, checklistProgress } from '@/lib/housekeeping'
import { dateTime } from '@/lib/docs'
import { cn } from '@/lib/utils'
import { invalidate } from '@/lib/query'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Field, ToneBadge } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { PhotoGrid } from '@/components/tickets/parts'
import { DueLabel } from './task-card'
import { putTask, refreshAround, usePatchTask, useTaskActions } from './use-task'

const NONE = 'none'

export function TaskSheet({
  task,
  members,
  onClose,
}: {
  task: HkTask | null
  members: Member[]
  onClose: () => void
}) {
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md" aria-describedby={undefined}>
        {task && <TaskDetail key={task.id} task={task} members={members} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function TaskDetail({ task, members, onClose }: { task: HkTask; members: Member[]; onClose: () => void }) {
  const { readOnly, canManage } = useSession()
  const confirm = useConfirm()
  const patch = usePatchTask()
  const { setStatus } = useTaskActions()
  const [newItem, setNewItem] = useState('')
  const [notes, setNotes] = useState(task.notes ?? '')
  const camRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)
  const prog = checklistProgress(task)
  const open = task.status === 'pending' || task.status === 'in_progress'
  const editable = !readOnly

  const saveChecklist = (checklist: ChecklistItem[]) => patch.mutate({ id: task.id, patch: { checklist } })
  const toggle = (i: number) =>
    saveChecklist(task.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)))
  const addItem = () => {
    const label = newItem.trim()
    if (!label) return
    saveChecklist([...task.checklist, { label, done: false }])
    setNewItem('')
  }
  const removeItem = (i: number) => saveChecklist(task.checklist.filter((_, j) => j !== i))

  const upload = useMutation({
    mutationFn: (files: File[]) => {
      const fd = new FormData()
      for (const f of files) fd.append('photos', f)
      return api.uploadHkPhotos(task.id, fd)
    },
    onSuccess: async (saved) => {
      putTask(() => saved, saved.id)
      toast.success('อัปโหลดรูปแล้ว')
      await invalidate('hk-tasks')
    },
  })
  const addFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length) upload.mutate(files)
  }

  const remove = useMutation({
    mutationFn: () => api.deleteHkTask(task.id),
    onSuccess: async () => {
      toast.success('ลบงานแล้ว')
      onClose()
      await Promise.all([invalidate('hk-tasks'), refreshAround()])
    },
  })

  const notesDirty = notes !== (task.notes ?? '')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="gap-1 border-b px-4 py-4 pr-12 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="text-lg tabular-nums">ห้อง {task.unit_name}</SheetTitle>
          <ToneBadge tone={HK_TASK_STATUS[task.status].tone}>{HK_TASK_STATUS[task.status].label}</ToneBadge>
        </div>
        <SheetDescription className="text-sm">
          {HK_KINDS[task.kind] ?? task.kind} · {task.property_name}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <DueLabel task={task} />
          </span>
          {task.guest_name && <span className="text-muted-foreground">แขก: {task.guest_name}</span>}
          {task.booking_id && (
            <Link
              to={`/bookings?highlight=${task.booking_id}`}
              className="font-medium text-primary hover:underline"
              onClick={onClose}
            >
              ดูการจอง #{task.booking_id}
            </Link>
          )}
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 px-4 py-5 sm:px-6">
          {/* รายการตรวจ */}
          <section className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold">รายการตรวจ</h3>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {prog.done}/{prog.total}
              </span>
            </div>
            {prog.total > 0 && <Progress value={(prog.done / prog.total) * 100} className="h-1.5" />}
            <ul className="divide-y rounded-md border">
              {task.checklist.map((c, i) => (
                <li key={i} className="group flex items-stretch">
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => toggle(i)}
                    aria-pressed={c.done}
                    className="flex min-h-12 flex-1 items-center gap-3 px-3 py-2 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/60 disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-sm border-2 transition-colors',
                        c.done ? 'border-success bg-success text-white' : 'border-input bg-card',
                      )}
                      aria-hidden
                    >
                      {c.done && <Check className="size-4" strokeWidth={3} />}
                    </span>
                    <span className={cn('text-[15px]', c.done && 'text-muted-foreground line-through')}>{c.label}</span>
                  </button>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="grid w-10 shrink-0 place-items-center text-muted-foreground opacity-60 hover:text-destructive hover:opacity-100"
                      aria-label={`ลบรายการ ${c.label}`}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              ))}
              {task.checklist.length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">ยังไม่มีรายการตรวจ</li>
              )}
            </ul>
            {editable && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  addItem()
                }}
              >
                <Input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder="เพิ่มรายการ เช่น เติมน้ำดื่ม"
                  aria-label="รายการตรวจใหม่"
                  className="h-10"
                />
                <Button type="submit" variant="secondary" className="h-10" disabled={!newItem.trim()}>
                  <Plus /> เพิ่ม
                </Button>
              </form>
            )}
          </section>

          {/* รูปถ่าย */}
          <section className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold">รูปถ่าย</h3>
              <span className="text-sm text-muted-foreground tabular-nums">{task.photos.length}</span>
            </div>
            <PhotoGrid photos={task.photos} />
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={upload.isPending}
                  onClick={() => camRef.current?.click()}
                >
                  {upload.isPending ? <Loader2 className="animate-spin" /> : <Camera />} ถ่ายรูป
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={upload.isPending}
                  onClick={() => pickRef.current?.click()}
                >
                  <ImagePlus /> เลือกรูป
                </Button>
                <input
                  ref={camRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <input
                  ref={pickRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>
            )}
          </section>

          {/* รายละเอียด */}
          <section className="grid grid-cols-2 gap-4">
            <Field label="ผู้รับผิดชอบ" htmlFor="hk-assignee" className="col-span-2 sm:col-span-1">
              <Select
                value={task.assignee_user_id ? String(task.assignee_user_id) : NONE}
                disabled={!editable}
                onValueChange={(v) => {
                  const id = v === NONE ? null : Number(v)
                  patch.mutate({
                    id: task.id,
                    patch: { assignee_user_id: id },
                    optimistic: { assignee_name: members.find((m) => m.user_id === id)?.name ?? null },
                  })
                }}
              >
                <SelectTrigger id="hk-assignee" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>ยังไม่มอบหมาย</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={String(m.user_id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="กำหนดเสร็จ" htmlFor="hk-due" className="col-span-2 sm:col-span-1">
              <Input
                id="hk-due"
                type="date"
                className="h-10"
                value={task.due_date}
                disabled={!editable}
                onChange={(e) => e.target.value && patch.mutate({ id: task.id, patch: { due_date: e.target.value } })}
              />
            </Field>
            <Field label="หมายเหตุ" htmlFor="hk-notes" className="col-span-2">
              <Textarea
                id="hk-notes"
                rows={3}
                value={notes}
                disabled={!editable}
                placeholder="เช่น ผ้าเช็ดตัวไม่พอ แจ้งซ่อมก๊อกน้ำ"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notesDirty && patch.mutate({ id: task.id, patch: { notes } })}
              />
            </Field>
          </section>

          {(task.started_at || task.completed_at) && (
            <dl className="grid grid-cols-2 gap-3 text-xs">
              {task.started_at && (
                <div>
                  <dt className="text-muted-foreground">เริ่มงาน</dt>
                  <dd className="mt-0.5 tabular-nums">{dateTime(task.started_at)}</dd>
                </div>
              )}
              {task.completed_at && (
                <div>
                  <dt className="text-muted-foreground">เสร็จเมื่อ</dt>
                  <dd className="mt-0.5 tabular-nums">{dateTime(task.completed_at)}</dd>
                </div>
              )}
            </dl>
          )}

          {canManage && editable && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: `ลบงานห้อง ${task.unit_name}?`,
                    description: 'ลบงานนี้ถาวร รวมถึงรูปถ่ายและรายการตรวจ',
                    confirmText: 'ลบงาน',
                    destructive: true,
                  })
                )
                  remove.mutate()
              }}
            >
              <Trash2 /> ลบงาน
            </Button>
          )}
        </div>
      </div>

      {editable && (
        <div className="flex shrink-0 gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          {open ? (
            <>
              <Button
                variant="ghost"
                className="h-11 text-muted-foreground"
                onClick={() => void setStatus(task, 'cancelled')}
              >
                <Ban /> ยกเลิกงาน
              </Button>
              {task.status === 'pending' ? (
                <Button className="h-11 flex-1" onClick={() => void setStatus(task, 'in_progress')}>
                  <Play /> เริ่มงาน
                </Button>
              ) : (
                <Button className="h-11 flex-1" onClick={() => void setStatus(task, 'done')}>
                  <Check /> เสร็จ
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" className="h-11 flex-1" onClick={() => void setStatus(task, 'pending')}>
              <RotateCcw /> เปิดงานอีกครั้ง
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
