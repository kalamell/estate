import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Ban, MoreHorizontal, Printer, Receipt as ReceiptIcon } from 'lucide-react'
import { api, type Receipt } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { PAY_METHODS, baht, thDate, thisPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, StatCard, ToneBadge } from '@/components/common'
import { ReasonDialog } from '@/components/reason-dialog'
import { ALL, PeriodFilter, PropertyFilter } from './filters'
import { printHref } from '@/lib/docs'

export function ReceiptsTab() {
  const { canManage, readOnly } = useSession()
  const [propertyId, setPropertyId] = useState(ALL)
  const [period, setPeriod] = useState(thisPeriod())
  const [status, setStatus] = useState(ALL)
  const [voiding, setVoiding] = useState<Receipt | null>(null)

  const filter = {
    property_id: propertyId === ALL ? '' : propertyId,
    period,
    status: status === ALL ? '' : status,
  }
  const { data: receipts, isLoading } = useQuery({
    queryKey: ['receipts', filter],
    queryFn: () => api.receipts(filter),
  })
  const totals = useMemo(() => {
    const t = { total: 0, net: 0, wht: 0, vat: 0 }
    for (const r of receipts ?? []) {
      if (r.status === 'void') continue
      t.total += r.total
      t.net += r.net_received
      t.wht += r.wht_amount
      t.vat += r.vat_amount
    }
    return t
  }, [receipts])

  const voidR = useMutation({
    mutationFn: (v: { id: number; reason: string }) => api.voidReceipt(v.id, v.reason),
    onSuccess: async () => {
      toast.success('ยกเลิกใบเสร็จแล้ว')
      setVoiding(null)
      await invalidate('receipts', 'invoices', 'invoice', 'dashboard')
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <PropertyFilter id="r-prop" value={propertyId} onChange={setPropertyId} />
        <PeriodFilter id="r-period" value={period} onChange={setPeriod} />
        <Field label="สถานะ" htmlFor="r-status" className="flex-1 sm:w-36 sm:flex-none">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="r-status" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทั้งหมด</SelectItem>
              <SelectItem value="issued">ออกแล้ว</SelectItem>
              <SelectItem value="void">ยกเลิก</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="ยอดตามใบเสร็จ" value={baht(totals.total)} compact />
        <StatCard label="รับสุทธิ" tone="success" value={baht(totals.net)} compact />
        <StatCard label="ภาษีถูกหัก ณ ที่จ่าย" value={baht(totals.wht)} compact />
        <StatCard label="ภาษีขาย (VAT)" value={baht(totals.vat)} compact />
      </div>

      <Card className="overflow-hidden py-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !receipts?.length ? (
          <EmptyState
            icon={ReceiptIcon}
            title="ยังไม่มีใบเสร็จ"
            description="ใบเสร็จจะถูกออกอัตโนมัติเมื่อบันทึกการรับชำระใบแจ้งหนี้"
          />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-4">เลขที่</TableHead>
                <TableHead className="hidden sm:table-cell">วันที่</TableHead>
                <TableHead>ผู้ชำระ</TableHead>
                <TableHead className="hidden md:table-cell">ช่องทาง</TableHead>
                <TableHead className="text-right">รับสุทธิ</TableHead>
                <TableHead className="hidden sm:table-cell">สถานะ</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((r) => {
                const isVoid = r.status === 'void'
                return (
                  <TableRow key={r.id} className={cn(isVoid && 'text-muted-foreground')}>
                    <TableCell className="pl-4">
                      <div className={cn('font-mono text-xs', isVoid && 'line-through')}>{r.doc_no}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.is_tax_invoice ? 'ใบเสร็จ/ใบกำกับภาษี' : 'ใบเสร็จรับเงิน'}
                        {r.invoice_doc_no ? ` · อ้างอิง ${r.invoice_doc_no}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{thDate(r.issue_date)}</TableCell>
                    <TableCell>
                      <div className={cn('font-medium', isVoid && 'line-through')}>{r.payer?.name || '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.unit_name} · {r.property_name}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{PAY_METHODS[r.method] ?? r.method}</TableCell>
                    <TableCell className={cn('text-right font-medium tabular-nums', isVoid && 'line-through')}>
                      {baht(r.net_received)}
                      {r.wht_amount > 0 && (
                        <div className="text-xs font-normal text-muted-foreground">หัก ณ ที่จ่าย {baht(r.wht_amount)}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {isVoid ? (
                        <ToneBadge tone="grey" className="max-w-40 truncate" >
                          ยกเลิก{r.void_reason ? ` · ${r.void_reason}` : ''}
                        </ToneBadge>
                      ) : (
                        <ToneBadge tone="green">ออกแล้ว</ToneBadge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right whitespace-nowrap">
                      <Button asChild size="icon-sm" variant="ghost" aria-label="พิมพ์ใบเสร็จ">
                        <a href={printHref('receipt', r.id)} target="_blank" rel="noreferrer">
                          <Printer />
                        </a>
                      </Button>
                      {canManage && !isVoid && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-sm" variant="ghost" aria-label="ตัวเลือก" disabled={readOnly}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem variant="destructive" onSelect={() => setVoiding(r)}>
                              <Ban /> ยกเลิกใบเสร็จ
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <ReasonDialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        title={`ยกเลิกใบเสร็จ ${voiding?.doc_no ?? ''}?`}
        description="ใบเสร็จจะยังอยู่ในระบบพร้อมเครื่องหมายยกเลิกและเหตุผล ไม่ถูกลบ"
        confirmText="ยกเลิกใบเสร็จ"
        pending={voidR.isPending}
        onConfirm={(reason) => voiding && voidR.mutate({ id: voiding.id, reason })}
      />
    </div>
  )
}
