// ผลตรวจสลิป: ชิปสถานะ + รายละเอียดจาก QR / ผู้ให้บริการตรวจสลิป
import { ScanLine } from 'lucide-react'
import type { SlipCheckInfo, SlipResult } from '@/lib/api'
import { SLIP_RESULT, sqlUtc } from '@/lib/billing'
import { PROVIDER_LABEL, bankLabel } from '@/lib/slips'
import { baht } from '@/lib/format'
import { dateTime } from '@/lib/docs'
import { cn } from '@/lib/utils'
import { ToneBadge } from '@/components/common'

/** ชิปผลตรวจสลิป (verified / readable / unreadable / duplicate / mismatch / error) */
export function SlipResultBadge({ result, className }: { result: SlipResult | string | null | undefined; className?: string }) {
  const r = result ? SLIP_RESULT[result as SlipResult] : null
  if (!r) return null
  return (
    <ToneBadge tone={r.tone} className={cn('gap-1', className)}>
      <ScanLine className="size-3" />
      {r.label}
    </ToneBadge>
  )
}

/** ชิป + ข้อความจากการตรวจ (แสดงในแถวเดียว) */
export function SlipResultLine({
  result,
  message,
  className,
}: {
  result: SlipResult | string | null | undefined
  message?: string | null
  className?: string
}) {
  if (!result) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <SlipResultBadge result={result} />
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </div>
  )
}

/** รายละเอียดผลตรวจ: ธนาคาร เลขอ้างอิง ยอดเงิน ผู้โอน/ผู้รับ */
export function SlipCheckDetails({ check, className }: { check: SlipCheckInfo; className?: string }) {
  const rows: [string, string][] = []
  if (check.bank_code) rows.push(['ธนาคารผู้โอน', bankLabel(check.bank_code)])
  if (check.trans_ref) rows.push(['เลขอ้างอิง', check.trans_ref])
  if (check.amount != null) rows.push(['ยอดบนสลิป', baht(check.amount)])
  if (check.expected_amount != null) rows.push(['ยอดที่แจ้ง', baht(check.expected_amount)])
  if (check.sender_name) rows.push(['ผู้โอน', check.sender_name])
  if (check.receiver_name) rows.push(['ผู้รับ', check.receiver_name])
  if (check.transferred_at) rows.push(['เวลาโอน', dateTime(sqlUtc(check.transferred_at))])
  rows.push(['ตรวจโดย', PROVIDER_LABEL[check.provider] ?? check.provider])
  const mismatch = check.result === 'mismatch'
  return (
    <div className={cn('grid gap-2', className)}>
      <SlipResultBadge result={check.result} className="w-fit" />
      {check.message && <p className="text-sm text-muted-foreground">{check.message}</p>}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md border px-3 py-2.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd
              className={cn(
                'min-w-0 text-right break-words tabular-nums',
                k === 'เลขอ้างอิง' && 'font-mono text-xs leading-5',
                mismatch && k === 'ยอดบนสลิป' && 'font-semibold text-warning-foreground',
              )}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
