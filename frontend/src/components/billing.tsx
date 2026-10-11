// ชิ้นส่วน UI ค่าบริการแพลตฟอร์มที่ใช้ร่วมกันระหว่างหน้าองค์กรและ admin console
import { ScanLine } from 'lucide-react'
import type { SubInvoice } from '@/lib/api'
import { SLIP_RESULT, SUB_STATUS, isOverdue } from '@/lib/billing'
import { cn } from '@/lib/utils'
import { ToneBadge } from '@/components/common'

/** ชิปสถานะใบแจ้งหนี้ค่าบริการ: รอชำระ / รอตรวจสอบ / ชำระแล้ว / ยกเลิก (+ เกินกำหนด, สลิปไม่ผ่าน) */
export function SubStatusBadge({
  invoice,
  className,
}: {
  invoice: Pick<SubInvoice, 'status' | 'due_date' | 'reject_reason'>
  className?: string
}) {
  const st = SUB_STATUS[invoice.status] ?? SUB_STATUS.pending
  if (invoice.status === 'pending' && invoice.reject_reason)
    return (
      <ToneBadge tone="red" className={className}>
        สลิปไม่ผ่าน
      </ToneBadge>
    )
  if (isOverdue(invoice))
    return (
      <ToneBadge tone="mustard" className={className}>
        เกินกำหนด
      </ToneBadge>
    )
  return (
    <ToneBadge tone={st.tone} className={className}>
      {st.label}
    </ToneBadge>
  )
}

/** แถวสรุปยอด (ป้าย — จำนวนเงิน) */
export function SumRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? 'text-muted-foreground' : undefined}>{label}</span>
      <span className={strong ? 'text-base font-semibold tabular-nums' : 'tabular-nums'}>{value}</span>
    </div>
  )
}

/** ชิปผลตรวจสลิปอัตโนมัติ (+ ข้อความจากผู้ให้บริการตรวจสลิปเมื่อ withMessage) */
export function SlipCheck({
  invoice,
  withMessage,
  className,
}: {
  invoice: Pick<SubInvoice, 'slip_result' | 'slip_message'>
  withMessage?: boolean
  className?: string
}) {
  const r = invoice.slip_result ? SLIP_RESULT[invoice.slip_result] : null
  if (!r) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <ToneBadge tone={r.tone} className="gap-1">
        <ScanLine className="size-3" />
        {r.label}
      </ToneBadge>
      {withMessage && invoice.slip_message && (
        <span className="text-xs text-muted-foreground">{invoice.slip_message}</span>
      )}
    </div>
  )
}
