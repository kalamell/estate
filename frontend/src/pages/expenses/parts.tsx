import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, Repeat, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ToneBadge } from '@/components/common'

/** ชื่อหมวดแบบชิปเรียบ ๆ */
export function CategoryChip({ name, className }: { name: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('max-w-full truncate font-normal text-muted-foreground', className)}>
      {name}
    </Badge>
  )
}

export function RecurringBadge() {
  return (
    <ToneBadge tone="ink" className="gap-1">
      <Repeat /> ประจำ
    </ToneBadge>
  )
}

export function TicketLink({ id, title }: { id: number; title: string | null }) {
  return (
    <Link
      to={`/tickets?t=${id}`}
      className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <Wrench className="size-3 shrink-0" />
      <span className="truncate">
        #{id} {title}
      </span>
    </Link>
  )
}

/** รูปย่อใบเสร็จ — กดเพื่อดูภาพเต็ม */
export function ReceiptThumb({ url, className }: { url: string | null; className?: string }) {
  const [open, setOpen] = useState(false)
  if (!url)
    return (
      <span
        className={cn('grid size-10 shrink-0 place-items-center rounded-md border border-dashed text-muted-foreground/60', className)}
        title="ไม่มีใบเสร็จ"
      >
        <Receipt className="size-4" />
      </span>
    )
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className={cn(
          'size-10 shrink-0 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
          className,
        )}
        aria-label="ดูรูปใบเสร็จ"
      >
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-1rem)] gap-3 p-3 sm:max-w-2xl">
          <DialogTitle className="sr-only">รูปใบเสร็จ</DialogTitle>
          <img src={url} alt="รูปใบเสร็จ" className="max-h-[80svh] w-full rounded-sm object-contain" />
          <a href={url} target="_blank" rel="noreferrer" className="justify-self-center text-sm text-primary hover:underline">
            เปิดในแท็บใหม่
          </a>
        </DialogContent>
      </Dialog>
    </>
  )
}
