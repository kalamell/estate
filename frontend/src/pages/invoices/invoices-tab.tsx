import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, FilePlus2, Loader2, Plus, ReceiptText, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { baht, thDate, thPeriod, thisPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, InvoiceStatusBadge, StatCard } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { LineIcon } from '@/components/line'
import { InvoiceDialog } from './invoice-dialog'
import { SendLineButton, useLinkedTenantNames } from './send-line'
import { ManualInvoiceDialog } from './manual-invoice-dialog'
import { ALL, PeriodFilter, PropertyFilter } from './filters'

const STATUSES: Record<string, string> = {
  unpaid: 'รอชำระ',
  overdue: 'เกินกำหนด',
  paid: 'ชำระแล้ว',
  void: 'ยกเลิก',
}

export function InvoicesTab({ initialStatus }: { initialStatus?: string }) {
  const { readOnly, lineReady } = useSession()
  const confirm = useConfirm()
  const linkedNames = useLinkedTenantNames()
  const [lineResult, setLineResult] = useState<{ sent: number; skipped: string[] } | null>(null)
  const initial = initialStatus && STATUSES[initialStatus] ? initialStatus : ALL
  const [propertyId, setPropertyId] = useState(ALL)
  // ดูบิลเกินกำหนด → แสดงทุกรอบบิล
  const [period, setPeriod] = useState(initial === 'overdue' ? '' : thisPeriod())
  const [status, setStatus] = useState(initial)
  const [skipped, setSkipped] = useState<string[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [manualOpen, setManualOpen] = useState(false)

  const filter = {
    property_id: propertyId === ALL ? '' : propertyId,
    period,
    status: status === ALL ? '' : status,
  }
  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices', filter],
    queryFn: () => api.invoices(filter),
  })

  const totals = useMemo(() => {
    const t = { total: 0, paid: 0, unpaid: 0, overdue: 0, overdueCount: 0 }
    for (const i of invoices ?? []) {
      if (i.status === 'void') continue
      t.total += i.total
      if (i.status === 'paid') t.paid += i.total
      else {
        const due = Math.max(0, i.total - (i.paid_amount || 0))
        t.paid += i.paid_amount || 0
        t.unpaid += due
        if (i.overdue_days > 0) {
          t.overdue += due
          t.overdueCount++
        }
      }
    }
    return t
  }, [invoices])

  const generate = useMutation({
    mutationFn: () => api.generateInvoices(Number(propertyId), period),
    onSuccess: async (r) => {
      toast.success(`ออกใบแจ้งหนี้ใหม่ ${r.created.length} ใบ` + (r.skipped.length ? ` · ข้าม ${r.skipped.length}` : ''))
      setSkipped(r.skipped)
      await invalidate('invoices', 'dashboard')
    },
  })

  const sendAll = useMutation({
    mutationFn: () => api.sendInvoicesLine(Number(propertyId), period),
    onSuccess: (r) => {
      setLineResult(r)
      toast.success(`ส่งแล้ว ${r.sent} · ข้าม ${r.skipped.length}`)
    },
  })
  const askSendAll = async () => {
    if (propertyId === ALL) return toast.error('เลือกโครงการก่อน')
    if (!period) return toast.error('เลือกรอบบิลก่อน')
    if (
      await confirm({
        title: `ส่งบิลรอบ ${thPeriod(period)} ทาง LINE?`,
        description: 'ส่งใบแจ้งหนี้ที่ยังไม่ชำระของรอบนี้ให้ผู้เช่าที่เชื่อม LINE แล้ว ผู้เช่าที่ยังไม่เชื่อมจะถูกข้าม',
        confirmText: 'ส่งทาง LINE',
      })
    )
      sendAll.mutate()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <PropertyFilter id="i-prop" value={propertyId} onChange={setPropertyId} />
        <PeriodFilter id="i-period" value={period} onChange={setPeriod} />
        <Field label="สถานะ" htmlFor="i-status" className="flex-1 sm:w-40 sm:flex-none">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="i-status" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทั้งหมด</SelectItem>
              {Object.entries(STATUSES).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {lineReady && (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={readOnly || sendAll.isPending}
              onClick={() => void askSendAll()}
              title={propertyId === ALL || !period ? 'เลือกโครงการและรอบบิลก่อน' : undefined}
            >
              {sendAll.isPending ? <Loader2 className="animate-spin" /> : <LineIcon />}
              ส่งบิลรอบนี้ทาง LINE
            </Button>
          )}
          <Button variant="outline" className="flex-1 sm:flex-none" disabled={readOnly} onClick={() => setManualOpen(true)}>
            <Plus /> สร้างใบแจ้งหนี้
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            disabled={readOnly || generate.isPending}
            onClick={() => {
              if (propertyId === ALL) return toast.error('เลือกโครงการก่อน')
              if (!period) return toast.error('เลือกรอบบิลก่อน')
              generate.mutate()
            }}
          >
            {generate.isPending ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
            ออกบิลประจำเดือน
          </Button>
        </div>
      </div>

      {skipped.length > 0 && (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertTriangle className="text-warning" />
          <AlertTitle>ห้องที่ข้าม</AlertTitle>
          <AlertDescription>
            <ul className="ml-4 list-disc">
              {skipped.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {lineResult && (
        <Alert className={lineResult.skipped.length ? 'border-warning/40 bg-warning/10' : 'border-success/30 bg-success/5'}>
          <Send className={lineResult.skipped.length ? 'text-warning' : 'text-success'} />
          <AlertTitle className="flex items-center gap-2">
            ส่งบิลทาง LINE แล้ว {lineResult.sent} ใบ · ข้าม {lineResult.skipped.length}
            <button
              type="button"
              className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground"
              onClick={() => setLineResult(null)}
            >
              ปิด
            </button>
          </AlertTitle>
          {lineResult.skipped.length > 0 && (
            <AlertDescription>
              <details>
                <summary className="cursor-pointer select-none">ดูเหตุผลที่ข้าม ({lineResult.skipped.length})</summary>
                <ul className="mt-1 ml-4 list-disc">
                  {lineResult.skipped.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            </AlertDescription>
          )}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="ยอดรวม" value={baht(totals.total)} compact />
        <StatCard label="รับชำระแล้ว" tone="success" value={baht(totals.paid)} compact />
        <StatCard label="ค้างชำระ" value={baht(totals.unpaid)} compact />
        <StatCard
          label="เกินกำหนด"
          tone={totals.overdue > 0 ? 'warning' : 'default'}
          value={baht(totals.overdue)}
          sub={`${totals.overdueCount} ใบ`}
          compact
        />
      </div>

      <Card className="overflow-hidden py-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !invoices?.length ? (
          <EmptyState
            icon={ReceiptText}
            title={period ? `ไม่มีใบแจ้งหนี้ในรอบ ${thPeriod(period)}` : 'ไม่มีใบแจ้งหนี้'}
            description='เลือกโครงการแล้วกด "ออกบิลประจำเดือน" หรือ "สร้างใบแจ้งหนี้"'
          />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="hidden pl-4 sm:table-cell">เลขที่</TableHead>
                <TableHead className="pl-4 sm:pl-2">ห้อง</TableHead>
                <TableHead className="hidden sm:table-cell">ผู้เช่า</TableHead>
                <TableHead className="hidden md:table-cell">รอบ</TableHead>
                <TableHead className="hidden sm:table-cell">ครบกำหนด</TableHead>
                <TableHead className="text-right">ยอด</TableHead>
                <TableHead className={lineReady ? 'sm:pr-2 pr-4' : 'pr-4'}>สถานะ</TableHead>
                {lineReady && <TableHead className="hidden w-10 pr-4 sm:table-cell"><span className="sr-only">ส่งทาง LINE</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((i) => {
                const isVoid = i.status === 'void'
                const overdue = i.status === 'unpaid' && i.overdue_days > 0
                return (
                  <TableRow
                    key={i.id}
                    className={cn('cursor-pointer', overdue && 'bg-warning/5', isVoid && 'text-muted-foreground')}
                    tabIndex={0}
                    onClick={() => setOpenId(i.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpenId(i.id)}
                  >
                    <TableCell className={cn('hidden pl-4 font-mono text-xs sm:table-cell', isVoid && 'line-through')}>
                      {i.doc_no || `#${i.id}`}
                    </TableCell>
                    <TableCell className="pl-4 sm:pl-2">
                      <div className={cn('font-medium', isVoid && 'line-through')}>{i.unit_name}</div>
                      <div className="text-xs text-muted-foreground">{i.property_name}</div>
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {i.doc_no} · ครบ {thDate(i.due_date)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{i.tenant_name || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell">{thPeriod(i.period)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{thDate(i.due_date)}</TableCell>
                    <TableCell className={cn('text-right font-medium tabular-nums', isVoid && 'line-through')}>
                      {baht(i.total)}
                      {i.status === 'unpaid' && i.paid_amount > 0 && (
                        <div className="text-xs font-normal text-muted-foreground">
                          ค้าง {baht(i.total - i.paid_amount)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={lineReady ? 'pr-4 sm:pr-2' : 'pr-4'}>
                      <InvoiceStatusBadge status={i.status} overdueDays={i.overdue_days} />
                    </TableCell>
                    {lineReady && (
                      <TableCell className="hidden pr-4 text-right sm:table-cell" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <SendLineButton
                          kind="invoice"
                          id={i.id}
                          reason={
                            isVoid
                              ? 'ใบแจ้งหนี้ถูกยกเลิก'
                              : !i.tenant_name
                                ? 'ไม่มีผู้เช่า'
                                : linkedNames && !linkedNames.has(i.tenant_name)
                                  ? 'ผู้เช่ายังไม่ได้เชื่อม LINE'
                                  : null
                          }
                        />
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <InvoiceDialog id={openId} onClose={() => setOpenId(null)} />
      <ManualInvoiceDialog open={manualOpen} onOpenChange={setManualOpen} onCreated={(inv) => setOpenId(inv.id)} />
    </div>
  )
}
