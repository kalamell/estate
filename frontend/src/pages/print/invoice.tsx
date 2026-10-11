import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type InvoiceDetail } from '@/lib/api'
import { docErrorText as errorText } from '@/lib/docs'
import { bahtText, bahtTextEn } from '@/lib/baht-text'
import { baht, vatRateOf } from '@/lib/format'
import { isLang, useI18n } from '@/lib/i18n'
import { LangProvider } from '@/components/lang'
import { useSession } from '@/contexts/session'
import { QrSvg } from '@/components/qr'
import { DocHeader, ItemsTable, PartyBlock, PrintShell, Sheet, Totals, VoidNote } from './doc'

export function InvoiceDocument({
  data,
  fallbackName,
  note,
}: {
  data: InvoiceDetail
  fallbackName?: string
  note?: string | null
}) {
  const { t, en, dateLong, period } = useI18n()
  const inv = data.invoice
  const isVoid = inv.status === 'void'
  const remaining = Math.max(0, inv.total - (data.paid_amount ?? 0))
  const rows = [{ label: t('รวมเงิน', 'Subtotal'), value: inv.subtotal ?? inv.total }]
  if (inv.vat_amount > 0)
    rows.push({
      label: `${t('ภาษีมูลค่าเพิ่ม', 'VAT')} ${vatRateOf(inv.items, inv.vat_amount)}%`,
      value: inv.vat_amount,
    })
  const footerNote = note ?? data.issuer?.receipt_note
  return (
    <Sheet watermark={isVoid ? t('ยกเลิก', 'VOID') : null}>
      <DocHeader
        issuer={data.issuer}
        fallbackName={fallbackName}
        title={en ? 'ใบแจ้งหนี้' : 'ใบแจ้งหนี้ / Invoice'}
        subtitle={en ? 'Invoice' : undefined}
        meta={[
          [t('เลขที่', 'No.'), inv.doc_no || `#${inv.id}`],
          [t('วันที่', 'Date'), dateLong(inv.issue_date)],
          [t('ครบกำหนด', 'Due date'), dateLong(inv.due_date)],
        ]}
      />
      <PartyBlock
        label={t('ลูกค้า / ผู้เช่า', 'Customer / Tenant')}
        party={{
          name: data.tenant?.full_name || inv.tenant_name,
          address: data.tenant?.address,
          tax_id: data.tenant?.tax_id,
          branch_code: data.tenant?.tax_id ? data.tenant?.branch_code : null,
          phone: data.tenant?.phone,
        }}
        details={[
          [t('ห้อง', 'Room'), inv.unit_name],
          [t('โครงการ', 'Property'), data.property?.name || inv.property_name],
          [t('รอบบิล', 'Period'), period(inv.period)],
        ]}
      />
      <ItemsTable items={inv.items} />
      <Totals
        amountText={en ? bahtTextEn(inv.total) : bahtText(inv.total)}
        rows={[...rows, { label: t('จำนวนเงินรวมทั้งสิ้น', 'Total'), value: inv.total, strong: true }]}
      />
      {isVoid && <VoidNote reason={inv.void_reason} />}
      {inv.status === 'paid' && (
        <div className="mt-4 inline-block border-2 border-black px-3 py-1 font-semibold">
          {t('ชำระแล้ว', 'Paid')}
          {inv.paid_at ? ` ${t('เมื่อ', 'on')} ${dateLong(inv.paid_at)}` : ''}
        </div>
      )}
      {inv.status === 'unpaid' && inv.late_fee > 0 && (
        <p className="mt-3 text-[12px]">
          {t(
            `หมายเหตุ: เกินกำหนดชำระ ${inv.overdue_days} วัน มีค่าปรับชำระล่าช้า ${baht(inv.late_fee)} (ยังไม่รวมในยอดข้างต้น)`,
            `Note: ${inv.overdue_days} days overdue — late fee ${baht(inv.late_fee)} (not included above)`,
          )}
        </p>
      )}
      <div className="print-avoid mt-6 grid grid-cols-[1fr_auto] gap-6 border-t border-black/30 pt-4">
        <div className="text-[12px]">
          {footerNote && <div className="whitespace-pre-line">{footerNote}</div>}
          <div className={footerNote ? 'mt-2 text-black/60' : 'text-black/60'}>
            {t(
              `กรุณาชำระภายในวันที่ ${dateLong(inv.due_date)} · เอกสารนี้ไม่ใช่ใบเสร็จรับเงิน`,
              `Please pay by ${dateLong(inv.due_date)} · This document is not a receipt`,
            )}
          </div>
        </div>
        {inv.status === 'unpaid' && data.promptpay_payload && (
          <div className="w-36 text-center">
            <QrSvg value={data.promptpay_payload} label="QR PromptPay" />
            <div className="mt-1 text-[11px]">{t('สแกนจ่ายพร้อมเพย์', 'Scan to pay (PromptPay)')}</div>
            <div className="font-semibold tabular-nums">{baht(remaining)}</div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

export function StaffInvoicePrint() {
  const id = Number(useParams().id)
  const { orgInfo, org } = useSession()
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.invoice(id), meta: { silent: true } })
  return (
    <PrintShell
      title={`ใบแจ้งหนี้ ${q.data?.invoice.doc_no ?? ''}`}
      loading={q.isLoading}
      error={q.error ? errorText(q.error) : null}
    >
      {q.data && (
        <InvoiceDocument
          data={q.data}
          fallbackName={orgInfo?.org.name ?? org?.name}
          note={q.data.issuer?.receipt_note ?? orgInfo?.org.receipt_note}
        />
      )}
    </PrintShell>
  )
}

export function PortalInvoicePrint() {
  const { token = '', id } = useParams()
  const q = useQuery({
    queryKey: ['portal', token, 'invoice', Number(id)],
    queryFn: () => api.portal.invoice(token, Number(id)),
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
        title={`${lang === 'en' ? 'Invoice' : 'ใบแจ้งหนี้'} ${q.data?.invoice.doc_no ?? ''}`}
        loading={q.isLoading || home.isLoading}
        error={q.error ? errorText(q.error, lang) : null}
      >
        {q.data && <InvoiceDocument data={q.data} fallbackName={home.data?.org.name} />}
      </PrintShell>
    </LangProvider>
  )
}
