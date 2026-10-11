// ใบแจ้งหนี้ค่าบริการ / ใบเสร็จรับเงิน(/ใบกำกับภาษี) ของแพลตฟอร์ม — ใช้ข้อมูลผู้ออก/ผู้ชำระที่บันทึกไว้ตอนออกเอกสาร
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type LineItem, type SubPayment } from '@/lib/api'
import { CYCLE_LABEL, SUB_KIND, sqlUtc } from '@/lib/billing'
import { bahtText } from '@/lib/baht-text'
import { docErrorText as errorText } from '@/lib/docs'
import { baht, thDateLong } from '@/lib/format'
import { QrSvg } from '@/components/qr'
import { DocHeader, ItemsTable, PartyBlock, PrintShell, Sheet, Signatures, Totals, VoidNote } from './doc'

type DocType = 'invoice' | 'receipt'

function itemsOf(inv: SubPayment['invoice']): LineItem[] {
  const items: LineItem[] = [
    {
      label: `ค่าบริการระบบ Estate แพ็กเกจ ${inv.package_name} (${CYCLE_LABEL[inv.cycle]}) ${thDateLong(inv.period_start)} – ${thDateLong(inv.period_end)}`,
      qty: 1,
      unit_price: inv.price,
      amount: inv.price,
      vatable: inv.issuer.vat_registered,
    },
  ]
  if (inv.credit > 0)
    items.push({
      label: 'ส่วนลดจากแพ็กเกจเดิม (มูลค่าวันที่เหลือของรอบก่อน)',
      qty: 1,
      unit_price: -inv.credit,
      amount: -inv.credit,
      vatable: inv.issuer.vat_registered,
    })
  return items
}

function totalsOf(inv: SubPayment['invoice']) {
  const rows: { label: string; value: number; strong?: boolean }[] = []
  if (inv.vat_amount > 0) {
    rows.push({ label: 'มูลค่าก่อนภาษีมูลค่าเพิ่ม', value: inv.subtotal })
    rows.push({ label: `ภาษีมูลค่าเพิ่ม ${inv.issuer.vat_rate}%`, value: inv.vat_amount })
  } else {
    rows.push({ label: 'รวมเงิน', value: inv.subtotal })
  }
  rows.push({ label: 'จำนวนเงินรวมทั้งสิ้น', value: inv.total, strong: true })
  return rows
}

function SubDocument({ data, type, copy }: { data: SubPayment; type: DocType; copy?: string }) {
  const inv = data.invoice
  const isVoid = inv.status === 'void'
  const receipt = type === 'receipt'
  const issuer = {
    legal_name: inv.issuer.name,
    tax_id: inv.issuer.tax_id,
    branch_code: inv.issuer.tax_id ? inv.issuer.branch_code : '',
    address: inv.issuer.address,
    phone: [inv.issuer.phone, inv.issuer.email].filter(Boolean).join(' · '),
  }
  const title = receipt
    ? inv.issuer.vat_registered
      ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี'
      : 'ใบเสร็จรับเงิน / Receipt'
    : 'ใบแจ้งหนี้ค่าบริการ / Invoice'
  const meta: [string, string][] = receipt
    ? [
        ['เลขที่', inv.receipt_no ?? '—'],
        ['วันที่', thDateLong(inv.paid_at ? sqlUtc(inv.paid_at) : null)],
        ['อ้างอิงใบแจ้งหนี้', inv.doc_no],
      ]
    : [
        ['เลขที่', inv.doc_no],
        ['วันที่', thDateLong(sqlUtc(inv.created_at))],
        ['ครบกำหนด', thDateLong(inv.due_date)],
      ]
  return (
    <Sheet watermark={isVoid ? 'ยกเลิก' : null}>
      <DocHeader issuer={issuer} fallbackName="Estate" title={title} copyLabel={copy} meta={meta} />
      <PartyBlock
        label={receipt ? 'ได้รับเงินจาก' : 'ลูกค้า'}
        party={{
          name: inv.payer.name || inv.org_name,
          address: inv.payer.address,
          tax_id: inv.payer.tax_id,
          branch_code: inv.payer.tax_id ? inv.payer.branch_code : null,
          phone: inv.payer.phone,
        }}
        details={[
          ['รหัสลูกค้า', `ORG-${String(inv.org_id).padStart(5, '0')}`],
          ['แพ็กเกจ', `${inv.package_name} · ${CYCLE_LABEL[inv.cycle]}`],
          ['ประเภท', SUB_KIND[inv.kind]],
        ]}
      />
      <ItemsTable items={itemsOf(inv)} />
      <Totals amountText={data.baht_text || bahtText(inv.total)} rows={totalsOf(inv)} />
      {inv.issuer.vat_registered && (
        <p className="mt-2 text-[12px] text-black/70">ราคาค่าบริการรวมภาษีมูลค่าเพิ่มแล้ว</p>
      )}
      {isVoid && <VoidNote reason={inv.void_reason} />}

      {receipt ? (
        <>
          <div className="print-avoid mt-4 flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-black/70">ชำระโดย</span>
            <span>โอนเงิน / พร้อมเพย์</span>
            {inv.payment_ref && (
              <span>
                <span className="text-black/70">อ้างอิง</span> {inv.payment_ref}
              </span>
            )}
          </div>
          <Signatures labels={['ผู้รับเงิน', 'ผู้จ่ายเงิน']} />
        </>
      ) : (
        <>
          {inv.status === 'paid' && (
            <div className="mt-4 inline-block border-2 border-black px-3 py-1 font-semibold">
              ชำระแล้ว{inv.paid_at ? ` เมื่อ ${thDateLong(sqlUtc(inv.paid_at))}` : ''}
              {inv.receipt_no ? ` · ใบเสร็จ ${inv.receipt_no}` : ''}
            </div>
          )}
          <div className="print-avoid mt-6 grid grid-cols-[1fr_auto] gap-6 border-t border-black/30 pt-4">
            <div className="space-y-2 text-[12px]">
              {data.bank_info && (
                <div>
                  <div className="text-black/60">ช่องทางชำระเงิน</div>
                  <div className="whitespace-pre-line">{data.bank_info}</div>
                </div>
              )}
              <div className="text-black/60">
                กรุณาชำระภายในวันที่ {thDateLong(inv.due_date)} แล้วแนบสลิปที่หน้า แพ็กเกจ & การชำระเงิน · เอกสารนี้ไม่ใช่ใบเสร็จรับเงิน
              </div>
            </div>
            {data.promptpay_payload && (inv.status === 'pending' || inv.status === 'review') && (
              <div className="w-36 text-center">
                <QrSvg value={data.promptpay_payload} label="QR พร้อมเพย์" />
                <div className="mt-1 text-[11px]">สแกนจ่ายพร้อมเพย์</div>
                <div className="font-semibold tabular-nums">{baht(inv.total)}</div>
              </div>
            )}
          </div>
        </>
      )}
    </Sheet>
  )
}

function SubscriptionPrint({ admin }: { admin: boolean }) {
  const id = Number(useParams().id)
  const [params] = useSearchParams()
  const type: DocType = params.get('type') === 'receipt' ? 'receipt' : 'invoice'
  const q = useQuery({
    queryKey: admin ? ['admin', 'billing-invoice', id] : ['billing-invoice', id],
    queryFn: () => (admin ? api.admin.billingInvoice(id) : api.billingInvoice(id)),
    meta: { silent: true },
  })
  const inv = q.data?.invoice
  const notPaid = type === 'receipt' && inv && inv.status !== 'paid'
  const docNo = type === 'receipt' ? inv?.receipt_no : inv?.doc_no
  return (
    <PrintShell
      title={`${type === 'receipt' ? 'ใบเสร็จ' : 'ใบแจ้งหนี้'} ${docNo ?? ''}`}
      loading={q.isLoading}
      error={q.error ? errorText(q.error) : notPaid ? 'ใบแจ้งหนี้นี้ยังไม่ได้ชำระ จึงยังไม่มีใบเสร็จรับเงิน' : null}
    >
      {q.data &&
        (type === 'receipt' ? (
          <>
            <SubDocument data={q.data} type="receipt" copy="ต้นฉบับ" />
            <SubDocument data={q.data} type="receipt" copy="สำเนา" />
          </>
        ) : (
          <SubDocument data={q.data} type="invoice" />
        ))}
    </PrintShell>
  )
}

export const OrgSubscriptionPrint = () => <SubscriptionPrint admin={false} />
export const AdminSubscriptionPrint = () => <SubscriptionPrint admin />
