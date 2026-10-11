import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarCheck, Check, Clock, Inbox, Loader2, Mail, Phone, ReceiptText, Users, X } from 'lucide-react'
import { api, type BookingRequest } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { BOOKING_REQUEST_STATUS, baht, thRange } from '@/lib/format'
import { dateTime, timeAgo } from '@/lib/docs'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ToneBadge } from '@/components/common'
import { ReasonDialog } from '@/components/reason-dialog'
import { PhotoGrid } from '@/components/tickets/parts'

const ALL = 'all'

export function RequestsTab({ focusId }: { focusId?: number | null }) {
  const { readOnly } = useSession()
  const [status, setStatus] = useState('pending')
  const filter = status === ALL ? {} : { status }
  const list = useQuery({
    queryKey: ['booking-requests', filter],
    queryFn: () => api.bookingRequests(filter),
  })
  const [approving, setApproving] = useState<BookingRequest | null>(null)
  const [rejecting, setRejecting] = useState<BookingRequest | null>(null)

  const reject = useMutation({
    mutationFn: (v: { r: BookingRequest; reason: string }) => api.rejectRequest(v.r.id, v.reason),
    onSuccess: async () => {
      toast.success('ปฏิเสธคำขอแล้ว — ผู้จองจะเห็นเหตุผลในหน้าสถานะ')
      setRejecting(null)
      await invalidate('booking-requests', 'calendar', 'dashboard')
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48 bg-card" aria-label="กรองสถานะคำขอ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(BOOKING_REQUEST_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
            <SelectItem value={ALL}>ทั้งหมด</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          คำขอจากหน้าจองออนไลน์ — ตรวจสลิปมัดจำแล้วอนุมัติเพื่อสร้างการจองและปิดวันในปฏิทิน
        </p>
      </div>

      {list.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : !list.data?.length ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={status === 'pending' ? 'ไม่มีคำขอรอตอบ' : 'ไม่มีรายการ'}
            description="เปิดหน้าจองออนไลน์ได้ที่ โครงการ → แก้ไข → หน้าจองออนไลน์"
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              focused={r.id === focusId}
              readOnly={readOnly}
              onApprove={() => setApproving(r)}
              onReject={() => setRejecting(r)}
            />
          ))}
        </div>
      )}

      <ApproveDialog request={approving} onClose={() => setApproving(null)} />
      <ReasonDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="ปฏิเสธคำขอจอง?"
        description={
          rejecting
            ? `${rejecting.guest_name} · ห้อง ${rejecting.unit_name} · ${thRange(rejecting.check_in, rejecting.check_out)}`
            : undefined
        }
        confirmText="ปฏิเสธคำขอ"
        pending={reject.isPending}
        onConfirm={(reason) => rejecting && reject.mutate({ r: rejecting, reason })}
      />
    </div>
  )
}

function RequestCard({
  r,
  focused,
  readOnly,
  onApprove,
  onReject,
}: {
  r: BookingRequest
  focused: boolean
  readOnly: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focused])
  const st = BOOKING_REQUEST_STATUS[r.status] ?? BOOKING_REQUEST_STATUS.pending
  const pending = r.status === 'pending'
  return (
    <Card ref={ref} className={cn('gap-0 overflow-hidden py-0', focused && 'ring-2 ring-primary/50')}>
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{r.guest_name}</div>
            <div className="truncate text-xs text-muted-foreground">
              ห้อง {r.unit_name} · {r.property_name}
            </div>
          </div>
          <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
        </div>

        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 text-sm">
          <CalendarCheck className="size-4 text-muted-foreground" />
          <span className="tabular-nums">
            {thRange(r.check_in, r.check_out)} · {r.nights} คืน
          </span>
          <Users className="size-4 text-muted-foreground" />
          <span>{r.guests} คน</span>
          <Phone className="size-4 text-muted-foreground" />
          <a href={`tel:${r.phone}`} className="truncate text-primary tabular-nums hover:underline">
            {r.phone}
          </a>
          {r.email && (
            <>
              <Mail className="size-4 text-muted-foreground" />
              <a href={`mailto:${r.email}`} className="truncate hover:underline">
                {r.email}
              </a>
            </>
          )}
        </div>

        {r.note && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs whitespace-pre-line text-muted-foreground">{r.note}</p>
        )}

        <div className="flex items-end gap-3 rounded-md border px-3 py-2.5">
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">ยอดรวม</span>
              <span className="font-medium tabular-nums">{baht(r.total)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">มัดจำ</span>
              <span className="font-semibold text-primary tabular-nums">{baht(r.deposit_amount)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {r.slip_url ? (
            <>
              <PhotoGrid photos={[r.slip_url]} className="[&>button]:size-16" />
              <div className="text-xs text-muted-foreground">
                <div className="flex items-center gap-1 font-medium text-success">
                  <ReceiptText className="size-3.5" /> ส่งสลิปแล้ว
                </div>
                แตะรูปเพื่อขยาย
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ReceiptText className="size-3.5" /> ยังไม่ได้ส่งสลิป
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>ส่งเมื่อ {timeAgo(r.created_at)}</span>
          {pending && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> หมดอายุ {dateTime(r.expires_at)}
            </span>
          )}
        </div>
        {r.status === 'rejected' && r.reject_reason && (
          <p className="text-xs text-destructive">เหตุผล: {r.reject_reason}</p>
        )}
      </div>

      {pending ? (
        <div className="flex gap-2 border-t bg-muted/40 p-3">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={readOnly}
            onClick={onReject}
          >
            <X /> ปฏิเสธ
          </Button>
          <Button className="ml-auto" disabled={readOnly} onClick={onApprove}>
            <Check /> อนุมัติ
          </Button>
        </div>
      ) : r.booking_id ? (
        <div className="border-t bg-muted/40 p-3">
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to={`/bookings?highlight=${r.booking_id}`}>ดูการจอง</Link>
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

function ApproveDialog({ request, onClose }: { request: BookingRequest | null; onClose: () => void }) {
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {request && <ApproveForm key={request.id} r={request} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ApproveForm({ r, onClose }: { r: BookingRequest; onClose: () => void }) {
  const [paid, setPaid] = useState(!!r.slip_url)
  const approve = useMutation({
    mutationFn: () => api.approveRequest(r.id, paid),
    onSuccess: async (res) => {
      toast.success(`อนุมัติแล้ว — สร้างการจอง #${res.booking_id}`)
      onClose()
      await invalidate('booking-requests', 'bookings', 'calendar', 'dashboard', 'units')
    },
  })
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        approve.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>อนุมัติคำขอจอง</DialogTitle>
        <DialogDescription>
          ระบบจะสร้างผู้เช่า/แขกและการจองรายวัน แล้วปิดวันที่นี้ในปฏิทินทุกช่องทาง
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md border p-3 text-sm">
        <dt className="text-muted-foreground">ผู้จอง</dt>
        <dd className="font-medium">{r.guest_name}</dd>
        <dt className="text-muted-foreground">ห้อง</dt>
        <dd>
          {r.unit_name} · {r.property_name}
        </dd>
        <dt className="text-muted-foreground">ช่วงวัน</dt>
        <dd className="tabular-nums">
          {thRange(r.check_in, r.check_out)} · {r.nights} คืน
        </dd>
        <dt className="text-muted-foreground">ยอดรวม</dt>
        <dd className="tabular-nums">{baht(r.total)}</dd>
        <dt className="text-muted-foreground">มัดจำ</dt>
        <dd className="font-semibold tabular-nums">{baht(r.deposit_amount)}</dd>
      </dl>
      {r.slip_url ? (
        <PhotoGrid photos={[r.slip_url]} />
      ) : (
        <p className="text-xs text-muted-foreground">ผู้จองยังไม่ได้ส่งสลิป</p>
      )}
      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox checked={paid} onCheckedChange={(v) => setPaid(v === true)} />
        ได้รับเงินมัดจำแล้ว
      </label>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={approve.isPending}>
          {approve.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          อนุมัติและสร้างการจอง
        </Button>
      </DialogFooter>
    </form>
  )
}
