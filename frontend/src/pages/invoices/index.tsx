import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, FilePlus2, Loader2, ReceiptText } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { baht, thDate, thPeriod, thisPeriod } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, InvoiceStatusBadge, StatCard, UpsellCard } from '@/components/common'
import { InvoiceDialog } from './invoice-dialog'

const ALL = 'all'

export default function InvoicesPage() {
  const { features, featuresLoaded } = useSession()
  if (featuresLoaded && !features.invoices)
    return (
      <UpsellCard
        title="ระบบออกบิลไม่รวมในแพ็กเกจปัจจุบัน"
        description="อัปเกรดแพ็กเกจเพื่อออกบิลประจำเดือนอัตโนมัติ คำนวณค่าน้ำค่าไฟ และรับชำระผ่าน PromptPay QR"
      />
    )
  return <Invoices />
}

function Invoices() {
  const { readOnly } = useSession()
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const [propertyId, setPropertyId] = useState(ALL)
  const [period, setPeriod] = useState(thisPeriod())
  const [status, setStatus] = useState(ALL)
  const [skipped, setSkipped] = useState<string[]>([])
  const [openId, setOpenId] = useState<number | null>(null)

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
    const t = { total: 0, paid: 0, unpaid: 0 }
    for (const i of invoices ?? []) {
      t.total += i.total
      t[i.status === 'paid' ? 'paid' : 'unpaid'] += i.total
    }
    return t
  }, [invoices])

  const generate = useMutation({
    mutationFn: () => api.generateInvoices(Number(propertyId), period),
    onSuccess: async (r) => {
      toast.success(`ออกบิลใหม่ ${r.created.length} ใบ` + (r.skipped.length ? ` · ข้าม ${r.skipped.length}` : ''))
      setSkipped(r.skipped)
      await invalidate('invoices', 'dashboard')
    },
  })

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="โครงการ" htmlFor="i-prop" className="w-full sm:w-56">
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger id="i-prop" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทุกโครงการ</SelectItem>
                {properties.data?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="รอบบิล" htmlFor="i-period" className="flex-1 sm:w-44 sm:flex-none">
            <Input id="i-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <Field label="สถานะ" htmlFor="i-status" className="flex-1 sm:w-36 sm:flex-none">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="i-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทั้งหมด</SelectItem>
                <SelectItem value="unpaid">รอชำระ</SelectItem>
                <SelectItem value="paid">ชำระแล้ว</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Button
            className="w-full sm:ml-auto sm:w-auto"
            disabled={readOnly || generate.isPending || !period}
            onClick={() => {
              if (propertyId === ALL) return toast.error('เลือกโครงการก่อน')
              generate.mutate()
            }}
          >
            {generate.isPending ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
            ออกบิลประจำเดือน
          </Button>
        </div>
      </Card>

      {skipped.length > 0 && (
        <Alert className="border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle />
          <AlertTitle>ห้องที่ข้าม</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200/80">
            <ul className="ml-4 list-disc">
              {skipped.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="ยอดรวม" value={baht(totals.total)} compact />
        <StatCard label="ชำระแล้ว" tone="success" value={baht(totals.paid)} compact />
        <StatCard label="รอชำระ" tone="danger" value={baht(totals.unpaid)} compact />
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
            title={`ยังไม่มีบิลในรอบ ${thPeriod(period)}`}
            description='เลือกโครงการแล้วกด "ออกบิลประจำเดือน"'
          />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="hidden pl-4 sm:table-cell">#</TableHead>
                <TableHead className="pl-4 sm:pl-2">ห้อง</TableHead>
                <TableHead className="hidden sm:table-cell">ผู้เช่า</TableHead>
                <TableHead className="hidden md:table-cell">รอบ</TableHead>
                <TableHead className="hidden sm:table-cell">ครบกำหนด</TableHead>
                <TableHead className="text-right">ยอด</TableHead>
                <TableHead className="pr-4">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((i) => (
                <TableRow
                  key={i.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => setOpenId(i.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpenId(i.id)}
                >
                  <TableCell className="hidden pl-4 text-muted-foreground sm:table-cell">{i.id}</TableCell>
                  <TableCell className="pl-4 sm:pl-2">
                    <div className="font-medium">{i.unit_name}</div>
                    <div className="text-xs text-muted-foreground">{i.property_name}</div>
                    <div className="text-xs text-muted-foreground sm:hidden">
                      {i.tenant_name || '—'} · ครบ {thDate(i.due_date)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{i.tenant_name || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{thPeriod(i.period)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{thDate(i.due_date)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{baht(i.total)}</TableCell>
                  <TableCell className="pr-4">
                    <InvoiceStatusBadge status={i.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <InvoiceDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
