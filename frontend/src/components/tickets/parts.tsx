import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Lock, Send, X } from 'lucide-react'
import type { TicketMessage, TicketPriority, TicketStatus } from '@/lib/api'
import { cn } from '@/lib/utils'
import { dateTime } from '@/lib/docs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToneBadge } from '@/components/common'
import { PRIORITY, TICKET_STATUS } from './labels'

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const s = TICKET_STATUS[status] ?? TICKET_STATUS.open
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  if (priority === 'normal' || priority === 'low') return null
  const p = PRIORITY[priority]
  return <ToneBadge tone={p.tone}>{p.label}</ToneBadge>
}

/** รูปย่อ + lightbox */
export function PhotoGrid({ photos, className }: { photos: string[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!photos?.length) return null
  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {photos.map((p, i) => (
          <button
            key={p + i}
            type="button"
            onClick={() => setOpen(i)}
            className="size-20 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            aria-label={`ดูรูปที่ ${i + 1}`}
          >
            <img src={p} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ))}
      </div>
      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[calc(100%-1rem)] gap-3 p-3 sm:max-w-3xl">
          <DialogTitle className="sr-only">รูปภาพ</DialogTitle>
          {open != null && (
            <img src={photos[open]} alt="" className="max-h-[75svh] w-full rounded-sm object-contain" />
          )}
          {photos.length > 1 && (
            <div className="flex justify-center gap-2">
              {photos.map((p, i) => (
                <button
                  key={p + i}
                  type="button"
                  onClick={() => setOpen(i)}
                  className={cn('size-12 overflow-hidden rounded-sm border', i === open && 'ring-2 ring-primary')}
                  aria-label={`รูปที่ ${i + 1}`}
                >
                  <img src={p} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** เลือกรูป/ถ่ายรูป พร้อมพรีวิว */
export function PhotoPicker({
  files,
  onChange,
  max = 6,
  large,
}: {
  files: File[]
  onChange: (f: File[]) => void
  max?: number
  large?: boolean
}) {
  const pickRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  const add = (list: FileList | null) => {
    if (!list) return
    const imgs = Array.from(list).filter((f) => f.type.startsWith('image/'))
    onChange([...files, ...imgs].slice(0, max))
  }
  const size = large ? 'h-11' : 'h-8'
  return (
    <div className="grid gap-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urls.map((u, i) => (
            <div key={u} className="relative size-16 overflow-hidden rounded-md border">
              <img src={u} alt="" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-sm bg-[#1c1b19]/80 text-white"
                aria-label="ลบรูป"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {files.length < max && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className={size} onClick={() => camRef.current?.click()}>
            <Camera /> ถ่ายรูป
          </Button>
          <Button type="button" variant="outline" size="sm" className={size} onClick={() => pickRef.current?.click()}>
            <ImagePlus /> เลือกรูป
          </Button>
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              add(e.target.files)
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
              add(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}
    </div>
  )
}

/** เธรดข้อความ — ข้อความของฝั่งตัวเองชิดขวา */
export function MessageThread({
  messages,
  self,
}: {
  messages: TicketMessage[]
  self: TicketMessage['author_type']
}) {
  if (!messages.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีการตอบกลับ</p>
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const mine = m.author_type === self
        return (
          <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-md border px-3 py-2 text-sm',
                m.internal
                  ? 'border-dashed border-warning/60 bg-warning/10'
                  : mine
                    ? 'border-primary/20 bg-primary/5'
                    : 'bg-card',
              )}
            >
              <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{m.author_name}</span>
                {m.internal && (
                  <span className="inline-flex items-center gap-1 text-warning-foreground">
                    <Lock className="size-3" /> บันทึกภายใน
                  </span>
                )}
                <span>{dateTime(m.created_at)}</span>
              </div>
              {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
              <PhotoGrid photos={m.photos} className="mt-2" />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** กล่องตอบกลับ — ส่ง FormData (body, internal, photos) */
export function ReplyBox({
  onSend,
  pending,
  allowInternal,
  disabled,
  large,
  placeholder = 'พิมพ์ข้อความตอบกลับ…',
}: {
  onSend: (fd: FormData) => Promise<unknown>
  pending?: boolean
  allowInternal?: boolean
  disabled?: boolean
  large?: boolean
  placeholder?: string
}) {
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [internal, setInternal] = useState(false)
  const can = !disabled && !pending && (body.trim() || files.length)
  const submit = async () => {
    if (!can) return
    const fd = new FormData()
    fd.set('body', body.trim())
    if (allowInternal) fd.set('internal', internal ? '1' : '0')
    for (const f of files) fd.append('photos', f)
    try {
      await onSend(fd)
      setBody('')
      setFiles([])
    } catch {
      /* แจ้งเตือนโดยตัวจัดการกลาง */
    }
  }
  return (
    <form
      className={cn('grid gap-2 rounded-md border bg-card p-2', internal && 'border-dashed border-warning/60 bg-warning/5')}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={internal ? 'บันทึกภายใน — ผู้เช่าไม่เห็นข้อความนี้' : placeholder}
        rows={large ? 3 : 2}
        className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        disabled={disabled}
        aria-label="ข้อความ"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      />
      <div className="flex flex-wrap items-end gap-2">
        <PhotoPicker files={files} onChange={setFiles} large={large} />
        {allowInternal && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={internal} onCheckedChange={setInternal} />
            บันทึกภายใน (ผู้เช่าไม่เห็น)
          </label>
        )}
        <Button type="submit" size={large ? 'lg' : 'sm'} className={cn('ml-auto', large && 'h-11')} disabled={!can}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          ส่ง
        </Button>
      </div>
    </form>
  )
}
