import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type Receipt } from '@/lib/api'
import { bahtText, bahtTextEn } from '@/lib/baht-text'
import { PAY_METHODS, vatRateOf } from '@/lib/format'
import { isLang, useI18n } from '@/lib/i18n'
import { LangProvider } from '@/components/lang'
import { useSession } from '@/contexts/session'
import { DocHeader, ItemsTable, PartyBlock, PrintShell, Sheet, Signatures, Totals, VoidNote } from './doc'
import { docErrorText as errorText } from '@/lib/docs'

const METHOD_ORDER = ['cash', 'transfer', 'promptpay', 'deposit']
const PAY_METHODS_EN: Record<string, string> = {
  promptpay: 'PromptPay',
  transfer: 'Bank transfer',
  cash: 'Cash',
  deposit: 'Deducted from deposit',
}

function ReceiptSheet({ r, copy, fallbackName }: { r: Receipt; copy: 'original' | 'copy'; fallbackName?: string }) {
  const { t, en, dateLong } = useI18n()
  const isVoid = r.status === 'void'
  const rows: { label: string; value: number; strong?: boolean; negative?: boolean }[] = [
    { label: t('รวมเงิน', 'Subtotal'), value: r.subtotal },
  ]
  if (r.vat_amount > 0)
    rows.push({ label: `${t('ภาษีมูลค่าเพิ่ม', 'VAT')} ${vatRateOf(r.items, r.vat_amount)}%`, value: r.vat_amount })
  rows.push({ label: t('จำนวนเงินรวมทั้งสิ้น', 'Total'), value: r.total, strong: true })
  if (r.wht_amount > 0) {
    rows.push({ label: t('หัก ภาษีเงินได้ ณ ที่จ่าย', 'Less withholding tax'), value: r.wht_amount, negative: true })
    rows.push({ label: t('รับเงินสุทธิ', 'Net received'), value: r.net_received, strong: true })
  }
  // ชื่อเอกสารตามกฎหมายคงภาษาไทยไว้ + คำแปลใต้ชื่อเมื่อเลือกภาษาอังกฤษ
  const title = r.is_tax_invoice ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี' : en ? 'ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน / Receipt'
  return (
    <Sheet watermark={isVoid ? t('ยกเลิก', 'VOID') : null}>
      <DocHeader
        issuer={r.issuer}
        fallbackName={fallbackName}
        title={title}
        subtitle={en ? (r.is_tax_invoice ? 'Receipt / Tax Invoice' : 'Receipt') : undefined}
        copyLabel={copy === 'original' ? t('ต้นฉบับ', 'Original') : t('สำเนา', 'Copy')}
        meta={[
          [t('เลขที่', 'No.'), r.doc_no],
          [t('วันที่', 'Date'), dateLong(r.issue_date)],
          ...(r.invoice_doc_no
            ? ([[t('อ้างอิงใบแจ้งหนี้', 'Invoice ref.'), r.invoice_doc_no]] as [string, string][])
            : []),
        ]}
      />
      <PartyBlock
        label={t('ได้รับเงินจาก', 'Received from')}
        party={{
          name: r.payer?.name,
          address: r.payer?.address,
          tax_id: r.payer?.tax_id,
          branch_code: r.payer?.tax_id ? r.payer?.branch_code : null,
        }}
        details={[
          [t('ห้อง', 'Room'), r.unit_name],
          [t('โครงการ', 'Property'), r.property_name],
        ]}
      />
      <ItemsTable items={r.items} />
      <Totals amountText={en ? bahtTextEn(r.total) : r.amount_text || bahtText(r.total)} rows={rows} />
      <div className="print-avoid mt-4 flex flex-wrap gap-x-6 gap-y-1">
        <span className="text-black/70">{t('ชำระโดย', 'Paid by')}</span>
        {METHOD_ORDER.map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <span className="grid size-3.5 place-items-center border border-black text-[10px] leading-none">
              {r.method === m ? '✓' : ''}
            </span>
            {en ? PAY_METHODS_EN[m] : PAY_METHODS[m]}
          </span>
        ))}
        {!METHOD_ORDER.includes(r.method) && <span>{r.method}</span>}
      </div>
      {isVoid && <VoidNote reason={r.void_reason} />}
      <Signatures labels={[t('ผู้รับเงิน', 'Received by'), t('ผู้จ่ายเงิน', 'Paid by')]} />
    </Sheet>
  )
}

export function ReceiptDocument({ receipt, fallbackName }: { receipt: Receipt; fallbackName?: string }) {
  return (
    <>
      <ReceiptSheet r={receipt} copy="original" fallbackName={fallbackName} />
      <ReceiptSheet r={receipt} copy="copy" fallbackName={fallbackName} />
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
  const lang = isLang(home.data?.tenant.lang) ? home.data.tenant.lang : 'th'
  return (
    <LangProvider lang={lang}>
      <PrintShell
        title={`${lang === 'en' ? 'Receipt' : 'ใบเสร็จ'} ${q.data?.receipt.doc_no ?? ''}`}
        loading={q.isLoading || home.isLoading}
        error={q.error ? errorText(q.error, lang) : null}
      >
        {q.data && <ReceiptDocument receipt={q.data.receipt} fallbackName={home.data?.org.name} />}
      </PrintShell>
    </LangProvider>
  )
}
