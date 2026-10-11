import type { Parcel } from '@/lib/api'
import { PARCEL_STATUS, isStale, waitingDays } from '@/lib/parcels'
import { cn } from '@/lib/utils'
import { ToneBadge } from '@/components/common'

/** รหัสรับพัสดุตัวใหญ่ (อ่านง่ายจากระยะไกล) */
export function PickupCode({ code, hint, className }: { code: string; hint?: string; className?: string }) {
  return (
    <div className={cn('grid justify-items-center gap-1.5 rounded-lg border bg-muted/40 px-4 py-4', className)}>
      <div className="text-xs text-muted-foreground">รหัสรับพัสดุ</div>
      <div className="font-mono text-4xl font-semibold tracking-[0.3em] tabular-nums" aria-label={`รหัส ${code.split('').join(' ')}`}>
        {code}
      </div>
      {hint && <div className="text-center text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function ParcelStatusBadge({ parcel }: { parcel: Pick<Parcel, 'status' | 'received_at'> }) {
  const st = PARCEL_STATUS[parcel.status] ?? PARCEL_STATUS.waiting
  if (parcel.status === 'waiting' && isStale(parcel.received_at))
    return <ToneBadge tone="red">รอรับ {waitingDays(parcel.received_at)} วัน</ToneBadge>
  return <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
}
