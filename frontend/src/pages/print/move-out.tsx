import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { bahtText } from '@/lib/baht-text'
import { PAY_METHODS, addDays, money, thDateLong } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { DocHeader, PartyBlock, PrintShell, Sheet, Signatures } from './doc'
import { docErrorText as errorText } from '@/lib/docs'

export function StaffMoveOutPrint() {
  const id = Number(useParams().id)
  const { orgInfo, org } = useSession()
  const q = useQuery({ queryKey: ['move-out', id], queryFn: () => api.moveOut(id), meta: { silent: true } })
  const m = q.data?.move_out
  const refund = m?.refund_amount ?? 0
  return (
    <PrintShell
      title={`ใบสรุปคืนเงินประกัน ${m?.doc_no ?? ''}`}
      loading={q.isLoading}
      error={q.error ? errorText(q.error) : null}
    >
      {q.data && m && (
        <Sheet watermark={m.status === 'draft' ? 'ฉบับร่าง' : null}>
          <DocHeader
            issuer={q.data.issuer}
            fallbackName={orgInfo?.org.name ?? org?.name}
            title="ใบสรุปการคืนเงินประกัน"
            meta={[
              ['เลขที่', m.doc_no || 'ฉบับร่าง'],
              ['วันที่ย้ายออก', thDateLong(m.move_out_date)],
              ['กำหนดคืนเงิน', thDateLong(addDays(m.move_out_date, 7))],
            ]}
          />
          <PartyBlock
            label="ผู้เช่า"
            party={{
              name: q.data.tenant?.full_name || m.tenant_name,
              address: q.data.tenant?.address,
              tax_id: q.data.tenant?.tax_id,
              branch_code: q.data.tenant?.tax_id ? q.data.tenant?.branch_code : null,
              phone: q.data.tenant?.phone,
            }}
            details={[
              ['ห้อง', m.unit_name],
              ['โครงการ', m.property_name],
            ]}
          />
          <table className="mt-4 w-full border-collapse">
            <thead>
              <tr className="border-y border-black text-[12px]">
                <th className="py-1.5 text-left font-semibold">รายการ</th>
                <th className="w-36 py-1.5 pr-1 text-right font-semibold">จำนวนเงิน (บาท)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-black/15">
                <td className="py-1.5 font-medium">เงินประกัน / มัดจำที่รับไว้</td>
                <td className="py-1.5 pr-1 text-right tabular-nums">{money(m.deposit_amount)}</td>
              </tr>
              {m.deductions.map((d, i) => (
                <tr key={i} className="border-b border-black/15">
                  <td className="py-1.5 pl-4">หัก {d.label}</td>
                  <td className="py-1.5 pr-1 text-right tabular-nums">−{money(d.amount)}</td>
                </tr>
              ))}
              {m.include_outstanding && m.outstanding_total > 0 && (
                <tr className="border-b border-black/15">
                  <td className="py-1.5 pl-4">หัก ค่าใช้จ่ายค้างชำระตามใบแจ้งหนี้</td>
                  <td className="py-1.5 pr-1 text-right tabular-nums">−{money(m.outstanding_total)}</td>
                </tr>
              )}
              <tr className="border-y-2 border-black">
                <td className="py-2 font-semibold">
                  {refund >= 0 ? 'ยอดเงินคืนผู้เช่าสุทธิ' : 'ผู้เช่าต้องชำระเพิ่ม'}
                </td>
                <td className="py-2 pr-1 text-right text-[15px] font-semibold tabular-nums">{money(Math.abs(refund))}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 border border-black/70 bg-black/[0.03] px-3 py-2">
            <div className="text-[11px] text-black/60">จำนวนเงิน (ตัวอักษร)</div>
            <div className="font-semibold">({bahtText(Math.abs(refund))})</div>
          </div>
          {m.status === 'settled' && (
            <p className="mt-4">
              คืนเงินแล้วเมื่อ {thDateLong(m.settled_at)} โดย {PAY_METHODS[m.refund_method ?? ''] ?? m.refund_method}
            </p>
          )}
          {m.note && <p className="mt-3 whitespace-pre-line text-[12px]">หมายเหตุ: {m.note}</p>}
          <p className="mt-3 text-[12px] text-black/60">
            ผู้ให้เช่าต้องคืนเงินประกันภายใน 7 วันนับจากวันสิ้นสุดสัญญาเช่า พร้อมแสดงรายการหักค่าใช้จ่าย (ถ้ามี)
          </p>
          <Signatures labels={[refund >= 0 ? 'ผู้คืนเงิน (ผู้ให้เช่า)' : 'ผู้รับเงิน (ผู้ให้เช่า)', 'ผู้เช่า']} />
        </Sheet>
      )}
    </PrintShell>
  )
}
