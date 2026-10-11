import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarDays, CalendarRange, DoorOpen, FileSignature, Inbox, LogIn, LogOut, Plus, XCircle } from 'lucide-react'
import { api, type Booking, type BookingStatus, type DepositStatus } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { BOOKING_SOURCES, BOOKING_STATUS, DEPOSIT_STATUS, baht, thDate } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BookingStatusBadge, EmptyState } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { useBookingDialog } from '@/components/booking-dialog'
import { cn } from '@/lib/utils'
import { RequestsTab } from './requests-tab'

const ALL = 'all'

export default function BookingsPage() {
  const { features } = useSession()
  const [params, setParams] = useSearchParams()
  const tab = features.short_stay && params.get('tab') === 'requests' ? 'requests' : 'all'
  const pending = useQuery({
    queryKey: ['booking-requests', { status: 'pending' }],
    queryFn: () => api.bookingRequests({ status: 'pending' }),
    enabled: features.short_stay,
    meta: { silent: true },
  })
  const pendingCount = pending.data?.length ?? 0
  const highlight = Number(params.get('highlight')) || null
  const focusRequest = Number(params.get('request')) || null

  return (
    <div className="space-y-5">
      {features.short_stay && (
        <div className="flex flex-wrap items-center gap-3 border-b">
          <Tabs
            value={tab}
            onValueChange={(v) => setParams(v === 'requests' ? { tab: 'requests' } : {}, { replace: true })}
          >
            <TabsList variant="line" className="h-10">
              <TabsTrigger value="all" className="flex-none px-3">
                <CalendarDays /> การจองทั้งหมด
              </TabsTrigger>
              <TabsTrigger value="requests" className="flex-none px-3">
                <Inbox /> คำขอจองออนไลน์
                {pendingCount > 0 && (
                  <span className="rounded-sm bg-warning/20 px-1.5 text-xs font-semibold text-warning-foreground tabular-nums">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button asChild variant="ghost" size="sm" className="mb-1 ml-auto text-muted-foreground">
            <Link to="/calendar">
              <CalendarRange /> ดูปฏิทิน
            </Link>
          </Button>
        </div>
      )}
      {tab === 'requests' ? <RequestsTab focusId={focusRequest} /> : <AllBookings highlight={highlight} />}
    </div>
  )
}

function AllBookings({ highlight }: { highlight: number | null }) {
  const { readOnly } = useSession()
  const { openBooking } = useBookingDialog()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [status, setStatus] = useState<string>(ALL)
  const filter = status === ALL ? {} : { status }
  const { data: bookings, isLoading } = useQuery({
    queryKey: ['bookings', filter],
    queryFn: () => api.bookings(filter),
  })

  const patch = useMutation({
    mutationFn: (v: {
      b: Booking
      patch: { status?: BookingStatus; deposit_status?: DepositStatus }
      msg: string
    }) => api.patchBooking(v.b.id, v.patch),
    onSuccess: async (_d, v) => {
      toast.success(v.msg)
      await invalidate('bookings', 'units', 'dashboard')
    },
  })

  const cancel = async (b: Booking) => {
    if (
      await confirm({
        title: 'ยกเลิกการจองนี้?',
        description: `${b.tenant_name} · ${b.property_name} ห้อง ${b.unit_name}`,
        confirmText: 'ยกเลิกการจอง',
        cancelText: 'ไม่',
        destructive: true,
      })
    )
      patch.mutate({ b, patch: { status: 'cancelled' }, msg: 'ยกเลิกแล้ว' })
  }

  const hlRef = useRef<HTMLTableRowElement>(null)
  const loaded = !!bookings
  useEffect(() => {
    if (highlight && loaded) hlRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlight, loaded])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48 bg-card" aria-label="กรองสถานะ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
            {(Object.keys(BOOKING_STATUS) as BookingStatus[]).map((k) => (
              <SelectItem key={k} value={k}>
                {BOOKING_STATUS[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => openBooking()} disabled={readOnly}>
          <Plus /> <span className="hidden sm:inline">สร้างการจอง / สัญญา</span>
          <span className="sm:hidden">การจอง</span>
        </Button>
      </div>

      <Card className="overflow-hidden py-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !bookings?.length ? (
          <EmptyState
            icon={CalendarDays}
            title="ไม่มีรายการ"
            description="สร้างการจองหรือสัญญาเช่าใหม่ได้จากปุ่มด้านบน"
          />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-4">ผู้เช่า</TableHead>
                <TableHead>ห้อง</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>ช่วงเวลา</TableHead>
                <TableHead className="text-right">ราคา</TableHead>
                <TableHead>มัดจำ</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => (
                <TableRow
                  key={b.id}
                  ref={b.id === highlight ? hlRef : undefined}
                  className={cn(b.id === highlight && 'bg-primary/5 shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/10')}
                >
                  <TableCell className="pl-4 font-medium">{b.tenant_name}</TableCell>
                  <TableCell>
                    <div>{b.unit_name}</div>
                    <div className="text-xs text-muted-foreground">{b.property_name}</div>
                  </TableCell>
                  <TableCell>
                    {b.kind === 'lease' ? 'รายเดือน' : 'รายวัน'}
                    {b.source !== 'direct' && (
                      <span className="block text-xs text-muted-foreground">
                        {BOOKING_SOURCES[b.source] ?? b.source}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {thDate(b.start_date)} – {b.end_date ? thDate(b.end_date) : 'ไม่กำหนด'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {baht(b.price)}
                    <span className="text-muted-foreground">{b.kind === 'lease' ? '/ด.' : '/คืน'}</span>
                  </TableCell>
                  <TableCell>
                    <div className="tabular-nums">{baht(b.deposit_amount)}</div>
                    <Select
                      value={b.deposit_status}
                      disabled={readOnly}
                      onValueChange={(v) =>
                        patch.mutate({
                          b,
                          patch: { deposit_status: v as DepositStatus },
                          msg: 'อัปเดตเงินมัดจำแล้ว',
                        })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="mt-1 h-7 border-dashed px-2 text-xs text-muted-foreground shadow-none"
                        aria-label="สถานะเงินมัดจำ"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(DEPOSIT_STATUS) as DepositStatus[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {DEPOSIT_STATUS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <BookingStatusBadge status={b.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right whitespace-nowrap">
                    {b.status !== 'cancelled' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => navigate(`/contracts?booking=${b.id}`)}
                      >
                        <FileSignature /> สัญญา
                      </Button>
                    )}
                    {b.status === 'reserved' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-primary"
                        disabled={readOnly}
                        onClick={() => patch.mutate({ b, patch: { status: 'active' }, msg: 'เช็คอินแล้ว' })}
                      >
                        <LogIn /> เช็คอิน
                      </Button>
                    )}
                    {b.status === 'active' && b.kind === 'lease' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-primary"
                        disabled={readOnly}
                        onClick={() => navigate(`/move-outs?booking=${b.id}`)}
                      >
                        <DoorOpen /> เริ่มย้ายออก
                      </Button>
                    )}
                    {b.status === 'active' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-primary"
                        disabled={readOnly}
                        onClick={() =>
                          patch.mutate({ b, patch: { status: 'completed' }, msg: 'เช็คเอาท์แล้ว' })
                        }
                      >
                        <LogOut /> เช็คเอาท์
                      </Button>
                    )}
                    {(b.status === 'reserved' || b.status === 'active') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={readOnly}
                        onClick={() => void cancel(b)}
                      >
                        <XCircle /> ยกเลิก
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
