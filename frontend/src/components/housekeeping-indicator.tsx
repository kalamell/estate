import { Check, Loader2, Sparkles } from 'lucide-react'
import type { HousekeepingStatus } from '@/lib/api'
import { HK_STATUS } from '@/lib/housekeeping'
import { cn } from '@/lib/utils'

/**
 * ตัวบ่งชี้สถานะทำความสะอาดขนาดเล็ก
 * - สะอาด: ✓ สีเขียว · รอทำความสะอาด: จุดมัสตาร์ด · กำลังทำ: วงหมุนสีน้ำเงิน (นิ่ง ไม่เคลื่อนไหว)
 */
export function HkIndicator({
  status,
  className,
  size = 'sm',
}: {
  status: HousekeepingStatus | undefined | null
  className?: string
  size?: 'xs' | 'sm'
}) {
  if (!status) return null
  const s = HK_STATUS[status]
  const box = size === 'xs' ? 'size-3.5' : 'size-4'
  const icon = size === 'xs' ? 'size-2.5' : 'size-3'
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-full', box, className)}
      title={s.label}
      aria-label={`ความสะอาด: ${s.label}`}
      role="img"
    >
      {status === 'clean' ? (
        <Check className={cn(icon, 'text-success')} strokeWidth={3} />
      ) : status === 'dirty' ? (
        <span className={cn('rounded-full bg-warning', size === 'xs' ? 'size-2' : 'size-2.5')} />
      ) : (
        <Loader2 className={cn(icon, 'text-info')} strokeWidth={3} />
      )}
    </span>
  )
}

/** ชิปสถานะแบบมีข้อความ */
export function HkStatusChip({ status, className }: { status: HousekeepingStatus; className?: string }) {
  const s = HK_STATUS[status]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', s.text, className)}>
      {status === 'dirty' ? <Sparkles className="size-3.5" /> : <HkIndicator status={status} size="xs" />}
      {s.label}
    </span>
  )
}
