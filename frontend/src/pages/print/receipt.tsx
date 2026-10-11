import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type Receipt } from '@/lib/api'
import { bahtText } from '@/lib/baht-text'
import { PAY_METHODS, vatRateOf, thDateLong } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { DocHeader, ItemsTable, PartyBlock, PrintShell, Sheet, Signatures, Totals, VoidNote } from './doc'
import { docErrorText as errorText } from '@/lib/docs'

const METHOD_ORDER = ['cash', 'transfer', 'promptpay', 'deposit']

function ReceiptSheet({ r, copy, fallbackName }: { r: Receipt; copy: string; fallbackName?: string }) {
  const isVoid = r.status === 'void'
  const rows: { label: string; value: number; strong?: boolean; negative?: boolean }[] = [
    { label: 'รวมเงิน', value: r.subtotal },
  ]
  if (r.vat_amount > 0)
    rows.push({ label: `ภาษีมูลค่าเพิ่ม ${vatRateOf(r.items, r.vat_amount)}%`, value: r.vat_amount })
  rows.push({ label: 'จำนวนเงินรวมทั้งสิ้น', value: r.total, strong: true })
  if (r.wht_amount > 0) {
    rows.push({ label: 'หัก ภาษีเงินได้ ณ ที่จ่าย', value: r.wht_amount, negative: true })
    rows.push({ label: 'รับเงินสุทธิ', value: r.net_received, strong: true })
  }
  return (
    <Sheet watermark={isVoid ? 'ยกเลิก' : null}>
      <DocHeader
        issuer={r.issuer}
        fallbackName={fallbackName}
        title={r.is_tax_invoice ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี' : 'ใบเสร็จรับเงิน / Receipt'}
        copyLabel={copy}
        meta={[
          ['เลขที่', r.doc_no],
          ['วันที่', thDateLong(r.issue_date)],
          ...(r.invoice_doc_no ? ([['อ้างอิงใบแจ้งหนี้', r.invoice_doc_no]] as [string, string][]) : []),
        ]}
      />
      <PartyBlock
        label="ได้รับเงินจาก"
        party={{
          name: r.payer?.name,
          address: r.payer?.address,
          tax_id: r.payer?.tax_id,
          branch_code: r.payer?.tax_id ? r.payer?.branch_code : null,
        }}
        details={[
          ['ห้อง', r.unit_name],
          ['โครงการ', r.property_name],
        ]}
      />
      <ItemsTable items={r.items} />
      <Totals amountText={r.amount_text || bahtText(r.total)} rows={rows} />
      <div className="print-avoid mt-4 flex flex-wrap gap-x-6 gap-y-1">
        <span className="text-black/70">ชำระโดย</span>
        {METHOD_ORDER.map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <span className="grid size-3.5 place-items-center border border-black text-[10px] leading-none">
              {r.method === m ? '✓' : ''}
            </span>
            {PAY_METHODS[m]}
          </span>
        ))}
        {!METHOD_ORDER.includes(r.method) && <span>{r.method}</span>}
      </div>
      {isVoid && <VoidNote reason={r.void_reason} />}
      <Signatures labels={['ผู้รับเงิน', 'ผู้จ่ายเงิน']} />
    </Sheet>
  )
}

export function ReceiptDocument({ receipt, fallbackName }: { receipt: Receipt; fallbackName?: string }) {
  return (
    <>
      <ReceiptSheet r={receipt} copy="ต้นฉบับ" fallbackName={fallbackName} />
      <ReceiptSheet r={receipt} copy="สำเนา" fallbackName={fallbackName} />
    </>
  )
}

export function StaffReceiptPrint() {
  const id = Number(useParams().id)
  const { orgInfo, org } = useSession()
  const q = useQuery({ queryKey: ['receipt', id], queryFn: () => api.receipt(id), meta: { silent: true } })
  return (
    <PrintShell
      title={`ใบเสร็จ ${q.data?.receipt.doc_no ?? ''}`}
      loading={q.isLoading}
      error={q.error ? errorText(q.error) : null}
    >
      {q.data && <ReceiptDocument receipt={q.data.receipt} fallbackName={orgInfo?.org.name ?? org?.name} />}
    </PrintShell>
  )
}

export function PortalReceiptPrint() {
  const { token = '', id } = useParams()
  const q = useQuery({
    queryKey: ['portal', token, 'receipt', Number(id)],
    queryFn: () => api.portal.receipt(token, Number(id)),
    meta: { silent: true },
    retry: false,
  })
  const home = useQuery({
    queryKey: ['portal', token],
    queryFn: () => api.portal.home(token),
    meta: { silent: true },
    retry: false,
  })
  return (
    <PrintShell
      title={`ใบเสร็จ ${q.data?.receipt.doc_no ?? ''}`}
      loading={q.isLoading}
      error={q.error ? errorText(q.error) : null}
    >
      {q.data && <ReceiptDocument receipt={q.data.receipt} fallbackName={home.data?.org.name} />}
    </PrintShell>
  )
}
