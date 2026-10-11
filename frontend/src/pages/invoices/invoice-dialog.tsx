import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Banknote, CheckCircle2, Loader2, Printer } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { baht, num, thDate, thDateLong, thPeriod } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { InvoiceStatusBadge } from '@/components/common'
import { PromptPayQR } from '@/components/promptpay-qr'

export function InvoiceDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { readOnly } = useSession()
  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.invoice(id!),
    enabled: id != null,
  })
  const pay = useMutation({
    mutationFn: (method: 'cash' | 'promptpay') => api.payInvoice(id!, method),
    onSuccess: async () => {
      toast.success('บันทึกการชำระเงินแล้ว')
      await invalidate('invoice', 'invoices', 'dashboard')
    },
  })
  const inv = data?.invoice
  const unpaid = inv?.status === 'unpaid'
  const remaining = inv ? Math.max(0, inv.total - (data?.paid_amount ?? 0)) : 0

  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="print-area max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {isLoading || !inv ? (
          <div className="space-y-3">
            <DialogTitle className="sr-only">ใบแจ้งหนี้</DialogTitle>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 pr-6">
              <div>
                <div className="text-xs text-muted-foreground">ใบแจ้งหนี้ #{inv.id}</div>
                <DialogTitle className="text-lg">{inv.property_name}</DialogTitle>
                <DialogDescription>
                  ห้อง {inv.unit_name}
                  {inv.tenant_name ? ` · ${inv.tenant_name}` : ''}
                </DialogDescription>
              </div>
              <div className="ml-auto">
                <InvoiceStatusBadge status={inv.status} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">รอบบิล</div>
                <div className="font-medium">{thPeriod(inv.period)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">ครบกำหนด</div>
                <div className="font-medium">{thDateLong(inv.due_date)}</div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-2 text-left font-medium">รายการ</th>
                  <th className="text-right font-medium">จำนวน</th>
                  <th className="hidden text-right font-medium sm:table-cell">ราคา/หน่วย</th>
                  <th className="text-right font-medium">รวม</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-2 pr-2">
                      {it.label}
                      <div className="text-xs text-muted-foreground sm:hidden">{baht(it.unit_price)}/หน่วย</div>
                    </td>
                    <td className="text-right tabular-nums">{num(it.qty)}</td>
                    <td className="hidden text-right tabular-nums sm:table-cell">{baht(it.unit_price)}</td>
                    <td className="text-right tabular-nums">{baht(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="pt-3 font-semibold sm:hidden">
                    ยอดรวม
                  </td>
                  <td colSpan={3} className="hidden pt-3 font-semibold sm:table-cell">
                    ยอดรวม
                  </td>
                  <td className="pt-3 text-right text-lg font-bold text-primary tabular-nums">{baht(inv.total)}</td>
                </tr>
                {data.paid_amount > 0 && unpaid && (
                  <tr className="text-muted-foreground">
                    <td colSpan={3} className="pt-1 text-xs">
                      ชำระแล้ว {baht(data.paid_amount)} · คงเหลือ
                    </td>
                    <td className="pt-1 text-right tabular-nums">{baht(remaining)}</td>
                  </tr>
                )}
              </tfoot>
            </table>

            {unpaid && data.promptpay_payload && (
              <PromptPayQR payload={data.promptpay_payload} amount={baht(remaining || inv.total)} className="my-1" />
            )}
            {inv.status === 'paid' && (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />
                ชำระเรียบร้อย{inv.paid_at ? ` · ${thDate(inv.paid_at)}` : ''}
              </div>
            )}

            <div className="no-print flex flex-wrap gap-2 pt-2">
              <Button variant="ghost" onClick={() => window.print()}>
                <Printer /> พิมพ์
              </Button>
              {unpaid && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={readOnly || pay.isPending} onClick={() => pay.mutate('cash')}>
                    <Banknote /> รับเงินสด
                  </Button>
                  <Button disabled={readOnly || pay.isPending} onClick={() => pay.mutate('promptpay')}>
                    {pay.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    ยืนยันรับโอนแล้ว
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
