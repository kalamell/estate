import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, DoorOpen, Loader2, LogOut, Pencil, Printer } from 'lucide-react'
import { api, type MoveOut } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { addDays, baht, thDate, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, ToneBadge } from '@/components/common'
import { printHref } from '@/lib/docs'
import { MoveOutDialog } from './move-out-dialog'

export default function MoveOutsPage() {
  const { readOnly } = useSession()
  const [params, setParams] = useSearchParams()
  const presetBooking = Number(params.get('booking')) || null
  const [open, setOpen] = useState(presetBooking != null)
  const [editing, setEditing] = useState<MoveOut | null>(null)
  const [settling, setSettling] = useState<MoveOut | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ['move-outs'], queryFn: api.moveOuts })

  const closeDialog = (o: boolean) => {
    setOpen(o)
    if (!o) {
      setEditing(null)
      if (presetBooking) setParams({}, { replace: true })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          สรุปการหักเงินประกัน คืนเงิน และพิมพ์ใบสรุปให้ผู้เช่าลงนาม
        </p>
        <Button className="ml-auto" disabled={readOnly} onClick={() => setOpen(true)}>
          <LogOut /> เริ่มย้ายออก
        </Button>
      </div>

      <Card className="overflow-hidden py-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={DoorOpen}
            title="ยังไม่มีรายการย้ายออก"
            description='เริ่มจากปุ่ม "เริ่มย้ายออก" หรือจากหน้าการจองของผู้เช่าที่กำลังเข้าพัก'
          />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-4">ผู้เช่า / ห้อง</TableHead>
                <TableHead className="hidden sm:table-cell">วันที่ย้ายออก</TableHead>
                <TableHead className="hidden text-right md:table-cell">เงินประกัน</TableHead>
                <TableHead className="hidden text-right md:table-cell">หักรวม</TableHead>
                <TableHead className="text-right">คืน / เก็บเพิ่ม</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((m) => {
                const due = addDays(m.move_out_date, 7)
                const late = m.status === 'draft' && due < today()
                return (
                  <TableRow key={m.id}>
                    <TableCell className="pl-4">
                      <div className="font-medium">{m.tenant_name}</div>
                      <div className="text-xs text-muted-foreground">
                        ห้อง {m.unit_name} · {m.property_name}
                        {m.doc_no ? ` · ${m.doc_no}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {thDate(m.move_out_date)}
                      {m.status === 'draft' && (
                        <div className={cn('text-xs', late ? 'text-warning-foreground' : 'text-muted-foreground')}>
                          คืนภายใน {thDate(due)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{baht(m.deposit_amount)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {baht(m.deductions_total + (m.include_outstanding ? m.outstanding_total : 0))}
                    </TableCell>
                    <TableCell className={cn('text-right font-medium tabular-nums', m.refund_amount < 0 && 'text-destructive')}>
                      {m.refund_amount < 0 ? `เก็บเพิ่ม ${baht(-m.refund_amount)}` : baht(m.refund_amount)}
                    </TableCell>
                    <TableCell>
                      {m.status === 'settled' ? (
                        <ToneBadge tone="green">คืนเงินแล้ว</ToneBadge>
                      ) : late ? (
                        <ToneBadge tone="mustard">เลยกำหนดคืน</ToneBadge>
                      ) : (
                        <ToneBadge tone="ink">ฉบับร่าง</ToneBadge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right whitespace-nowrap">
                      {m.status === 'draft' && (
                        <>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="แก้ไข"
                            disabled={readOnly}
                            onClick={() => {
                              setEditing(m)
                              setOpen(true)
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-primary" disabled={readOnly} onClick={() => setSettling(m)}>
                            <CheckCircle2 /> ยืนยันคืนเงิน
                          </Button>
                        </>
                      )}
                      <Button asChild size="icon-sm" variant="ghost" aria-label="พิมพ์ใบสรุป">
                        <a href={printHref('move-out', m.id)} target="_blank" rel="noreferrer">
                          <Printer />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <MoveOutDialog
        open={open}
        onOpenChange={closeDialog}
        bookingId={presetBooking}
        moveOut={editing}
      />
      <SettleDialog moveOut={settling} onClose={() => setSettling(null)} />
    </div>
  )
}

function SettleDialog({ moveOut, onClose }: { moveOut: MoveOut | null; onClose: () => void }) {
  const [method, setMethod] = useState<'transfer' | 'cash'>('transfer')
  const [date, setDate] = useState(today())
  const settle = useMutation({
    mutationFn: () => api.settleMoveOut(moveOut!.id, { refund_method: method, refunded_at: date }),
    onSuccess: async () => {
      toast.success('บันทึกการคืนเงินประกันแล้ว')
      await invalidate('move-outs', 'move-out', 'bookings', 'units', 'dashboard', 'invoices')
      onClose()
    },
  })
  const refund = moveOut?.refund_amount ?? 0
  return (
    <Dialog open={!!moveOut} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ยืนยันการคืนเงินประกัน</DialogTitle>
          <DialogDescription>
            {moveOut?.tenant_name} · ห้อง {moveOut?.unit_name} — หลังยืนยันจะแก้ไขรายการไม่ได้
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/40 p-4 text-center">
          <div className="text-xs text-muted-foreground">{refund >= 0 ? 'ยอดคืนผู้เช่า' : 'ผู้เช่าต้องชำระเพิ่ม'}</div>
          <div className={cn('text-2xl font-semibold tabular-nums', refund < 0 && 'text-destructive')}>
            {baht(Math.abs(refund))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={refund >= 0 ? 'ช่องทางคืนเงิน' : 'ช่องทางรับเงิน'} htmlFor="st-method">
            <Select value={method} onValueChange={(v) => setMethod(v as 'transfer' | 'cash')}>
              <SelectTrigger id="st-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">โอนเงิน</SelectItem>
                <SelectItem value="cash">เงินสด</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="วันที่" htmlFor="st-date">
            <Input id="st-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={() => settle.mutate()} disabled={settle.isPending || !date}>
            {settle.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            ยืนยัน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
