import { FileText, Printer, ReceiptText } from 'lucide-react'
import type { SubInvoice } from '@/lib/api'
import { CYCLE_LABEL, SUB_KIND, sqlUtc, subPrintHref } from '@/lib/billing'
import { baht, thDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, SectionTitle } from '@/components/common'
import { SlipCheck, SubStatusBadge } from '@/components/billing'

/** ประวัติใบแจ้งหนี้ค่าบริการ + ลิงก์พิมพ์ใบแจ้งหนี้/ใบเสร็จ (ใช้ร่วมกับ admin console ได้) */
export function SubInvoiceTable({
  invoices,
  admin = false,
  showOrg = false,
  onOpen,
}: {
  invoices: SubInvoice[]
  admin?: boolean
  showOrg?: boolean
  onOpen?: (inv: SubInvoice) => void
}) {
  return (
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow>
          <TableHead className="pl-4">เลขที่</TableHead>
          {showOrg && <TableHead>องค์กร</TableHead>}
          <TableHead>รายการ</TableHead>
          <TableHead className="hidden md:table-cell">รอบบริการ</TableHead>
          <TableHead className="text-right">ยอดชำระ</TableHead>
          <TableHead>สถานะ</TableHead>
          <TableHead className="pr-4" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((i) => {
          const isVoid = i.status === 'void'
          return (
            <TableRow
              key={i.id}
              className={cn(isVoid && 'text-muted-foreground', onOpen && 'cursor-pointer', i.status === 'review' && admin && 'bg-warning/5')}
              onClick={onOpen ? () => onOpen(i) : undefined}
            >
              <TableCell className="pl-4">
                <div className={cn('font-mono text-xs', isVoid && 'line-through')}>{i.doc_no}</div>
                <div className="text-[11px] text-muted-foreground">
                  {thDate(sqlUtc(i.created_at))}
                  {i.receipt_no && <> · ใบเสร็จ {i.receipt_no}</>}
                </div>
              </TableCell>
              {showOrg && (
                <TableCell>
                  <div className="max-w-48 truncate font-medium">{i.org_name}</div>
                  <div className="text-[11px] text-muted-foreground">#{i.org_id}</div>
                </TableCell>
              )}
              <TableCell>
                <div className="font-medium whitespace-nowrap">
                  {i.package_name} · {CYCLE_LABEL[i.cycle]}
                </div>
                <div className="text-xs text-muted-foreground">{SUB_KIND[i.kind]}</div>
              </TableCell>
              <TableCell className="hidden text-xs whitespace-nowrap md:table-cell">
                {thDate(i.period_start)} – {thDate(i.period_end)}
              </TableCell>
              <TableCell className={cn('text-right font-medium whitespace-nowrap tabular-nums', isVoid && 'line-through')}>
                {baht(i.total)}
                {i.credit > 0 && (
                  <div className="text-[11px] font-normal text-muted-foreground">ส่วนลด {baht(i.credit)}</div>
                )}
              </TableCell>
              <TableCell>
                <SubStatusBadge invoice={i} />
                {admin && i.status === 'review' && <SlipCheck invoice={i} className="mt-1" />}
                {isVoid && i.void_reason && (
                  <div className="mt-0.5 max-w-40 truncate text-[11px]" title={i.void_reason}>
                    {i.void_reason}
                  </div>
                )}
              </TableCell>
              <TableCell className="pr-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <Button asChild size="icon-sm" variant="ghost" aria-label={`พิมพ์ใบแจ้งหนี้ ${i.doc_no}`} title="ใบแจ้งหนี้">
                  <a href={subPrintHref(i.id, 'invoice', admin)} target="_blank" rel="noreferrer">
                    <Printer />
                  </a>
                </Button>
                {i.status === 'paid' && (
                  <Button asChild size="icon-sm" variant="ghost" aria-label={`พิมพ์ใบเสร็จ ${i.receipt_no}`} title="ใบเสร็จรับเงิน">
                    <a href={subPrintHref(i.id, 'receipt', admin)} target="_blank" rel="noreferrer">
                      <ReceiptText />
                    </a>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function History({ invoices }: { invoices: SubInvoice[] }) {
  return (
    <section className="space-y-4">
      <SectionTitle>ประวัติใบแจ้งหนี้ & ใบเสร็จ</SectionTitle>
      <Card className="overflow-hidden py-0">
        {invoices.length ? (
          <SubInvoiceTable invoices={invoices} />
        ) : (
          <EmptyState icon={FileText} title="ยังไม่มีใบแจ้งหนี้" description="ใบแจ้งหนี้และใบเสร็จค่าบริการจะแสดงที่นี่" />
        )}
      </Card>
    </section>
  )
}
