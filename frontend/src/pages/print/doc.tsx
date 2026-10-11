// ชิ้นส่วนเอกสารพิมพ์ A4 (ขาว-ดำ ไม่มี chrome ของแอป)
import { useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import type { Issuer, LineItem } from '@/lib/api'
import { branchLabel, money, num } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const PRINT_CSS = `
@page { size: A4; margin: 14mm; }
@media print {
  html, body { background: #fff !important; color: #000 !important; }
  .print-root { background: #fff !important; padding: 0 !important; }
  .print-sheet { width: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; }
  .print-sheet + .print-sheet { break-before: page; }
  .print-avoid { break-inside: avoid; }
}
`

/** โครงหน้าพิมพ์ + แถบเครื่องมือ (ซ่อนตอนพิมพ์) */
export function PrintShell({
  title,
  loading,
  error,
  children,
}: {
  title: string
  loading?: boolean
  error?: string | null
  children?: ReactNode
}) {
  const [params] = useSearchParams()
  const { t } = useI18n()
  const printed = useRef(false)
  const auto = params.get('autoprint') === '1'

  useEffect(() => {
    const prev = document.title
    document.title = title
    return () => {
      document.title = prev
    }
  }, [title])

  useEffect(() => {
    if (!auto || loading || error || printed.current) return
    printed.current = true
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [auto, loading, error])

  return (
    <div className="print-root min-h-svh bg-[#e6e2da] pb-10 text-black">
      <style>{PRINT_CSS}</style>
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-[#d9d5cc] bg-[#faf9f6] px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-[#1c1b19] hover:bg-[#f2f0eb]"
          onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}
        >
          <ArrowLeft /> {t('กลับ', 'Back')}
        </Button>
        <span className="truncate text-sm text-[#6b675f]">{title}</span>
        <Button
          size="sm"
          className="ml-auto bg-[#1c1b19] text-white hover:bg-[#1c1b19]/90"
          onClick={() => window.print()}
          disabled={loading || !!error}
        >
          <Printer /> {t('พิมพ์ / บันทึก PDF', 'Print / Save PDF')}
        </Button>
      </div>
      {loading ? (
        <div className="grid place-items-center py-24 text-[#6b675f]">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="mx-auto mt-16 max-w-md rounded-md border border-[#d9d5cc] bg-white p-6 text-center text-sm text-[#1c1b19]">
          {error}
        </div>
      ) : (
        children
      )}
    </div>
  )
}

/** แผ่น A4 */
export function Sheet({
  children,
  watermark,
}: {
  children: ReactNode
  watermark?: string | null
}) {
  return (
    <section className="print-sheet relative mx-auto mt-6 w-[210mm] max-w-[calc(100%-1rem)] overflow-hidden border border-[#d9d5cc] bg-white px-4 py-6 text-[13px] leading-relaxed text-black sm:min-h-[297mm] sm:px-[14mm] sm:py-[14mm]">
      {watermark && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center select-none"
        >
          <span className="-rotate-[30deg] border-[6px] border-black/15 px-10 text-[120px] leading-none font-bold text-black/15">
            {watermark}
          </span>
        </div>
      )}
      <div className="relative">{children}</div>
    </section>
  )
}

export function DocHeader({
  issuer,
  fallbackName,
  title,
  subtitle,
  copyLabel,
  meta,
}: {
  issuer: Partial<Issuer> | null | undefined
  fallbackName?: string
  title: string
  /** ชื่อเอกสารภาษาอังกฤษใต้ชื่อภาษาไทย */
  subtitle?: string
  copyLabel?: string
  meta: [string, ReactNode][]
}) {
  const { t, en } = useI18n()
  const branch = branchLabelOf(issuer?.branch_code, en)
  return (
    <header className="grid grid-cols-[1fr_auto] gap-6 border-b-2 border-black pb-4">
      <div className="min-w-0">
        <div className="text-[17px] leading-snug font-semibold">{issuer?.legal_name || fallbackName || '—'}</div>
        {issuer?.address && <div className="whitespace-pre-line">{issuer.address}</div>}
        {issuer?.phone && <div>{t('โทร', 'Tel.')} {issuer.phone}</div>}
        {issuer?.tax_id && (
          <div>
            {t('เลขประจำตัวผู้เสียภาษี', 'Tax ID')} <span className="tabular-nums">{issuer.tax_id}</span>
            {branch && <> · {branch}</>}
          </div>
        )}
      </div>
      <div className="text-right">
        {copyLabel && (
          <div className="mb-1 inline-block border border-black px-2 py-0.5 text-[11px] font-semibold">{copyLabel}</div>
        )}
        <div className="text-[19px] leading-tight font-semibold">{title}</div>
        {subtitle && <div className="text-[13px] font-medium text-black/70">{subtitle}</div>}
        <table className="mt-2 ml-auto text-left">
          <tbody>
            {meta.map(([k, v]) => (
              <tr key={k}>
                <td className="pr-3 text-black/70">{k}</td>
                <td className="text-right font-medium tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </header>
  )
}

export interface PartyInfo {
  name?: string | null
  address?: string | null
  tax_id?: string | null
  branch_code?: string | null
  phone?: string | null
}

export function PartyBlock({
  label,
  party,
  details,
}: {
  label: string
  party: PartyInfo | null
  details: [string, ReactNode][]
}) {
  const { t, en } = useI18n()
  const branch = branchLabelOf(party?.branch_code, en)
  return (
    <div className="mt-4 grid grid-cols-[1.4fr_1fr] border border-black/70">
      <div className="border-r border-black/70 p-3">
        <div className="text-[11px] text-black/60">{label}</div>
        <div className="font-semibold">{party?.name || '—'}</div>
        {party?.address && <div className="whitespace-pre-line">{party.address}</div>}
        {party?.phone && <div>{t('โทร', 'Tel.')} {party.phone}</div>}
        {party?.tax_id && (
          <div>
            {t('เลขประจำตัวผู้เสียภาษี', 'Tax ID')} <span className="tabular-nums">{party.tax_id}</span>
            {branch && <> · {branch}</>}
          </div>
        )}
      </div>
      <table className="m-3 self-start text-left">
        <tbody>
          {details.map(([k, v]) => (
            <tr key={k}>
              <td className="pr-3 align-top text-black/60">{k}</td>
              <td className="font-medium">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ItemsTable({ items }: { items: LineItem[] }) {
  const { t } = useI18n()
  return (
    <table className="mt-4 w-full border-collapse text-left">
      <thead>
        <tr className="border-y border-black text-[12px]">
          <th className="w-12 py-1.5 text-center font-semibold">{t('ลำดับ', 'No.')}</th>
          <th className="py-1.5 font-semibold">{t('รายการ', 'Description')}</th>
          <th className="w-20 py-1.5 text-right font-semibold">{t('จำนวน', 'Qty')}</th>
          <th className="w-28 py-1.5 text-right font-semibold">{t('ราคาต่อหน่วย', 'Unit price')}</th>
          <th className="w-28 py-1.5 pr-1 text-right font-semibold">{t('จำนวนเงิน', 'Amount')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i} className="border-b border-black/15 align-top">
            <td className="py-1.5 text-center tabular-nums">{i + 1}</td>
            <td className="py-1.5">{it.label}</td>
            <td className="py-1.5 text-right tabular-nums">{num(it.qty)}</td>
            <td className="py-1.5 text-right tabular-nums">{money(it.unit_price)}</td>
            <td className="py-1.5 pr-1 text-right tabular-nums">{money(it.amount)}</td>
          </tr>
        ))}
        {/* เว้นบรรทัดให้ตารางดูเต็ม */}
        {Array.from({ length: Math.max(0, 6 - items.length) }, (_, i) => (
          <tr key={`pad${i}`} className="border-b border-black/10">
            <td className="py-1.5">&nbsp;</td>
            <td />
            <td />
            <td />
            <td />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Totals({
  amountText,
  rows,
}: {
  amountText: string
  rows: { label: string; value: number; strong?: boolean; negative?: boolean }[]
}) {
  const { t } = useI18n()
  return (
    <div className="print-avoid mt-3 grid grid-cols-[1fr_auto] items-start gap-6">
      <div className="border border-black/70 bg-black/[0.03] px-3 py-2">
        <div className="text-[11px] text-black/60">{t('จำนวนเงิน (ตัวอักษร)', 'Amount in words')}</div>
        <div className="font-semibold">({amountText})</div>
      </div>
      <table className="min-w-64">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={cn(r.strong && 'border-y-2 border-black')}>
              <td className={cn('py-1 pr-6', r.strong ? 'font-semibold' : 'text-black/75')}>{r.label}</td>
              <td className={cn('py-1 pr-1 text-right tabular-nums', r.strong && 'text-[15px] font-semibold')}>
                {r.negative ? '−' : ''}
                {money(r.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Signatures({ labels }: { labels: string[] }) {
  const { t } = useI18n()
  return (
    <div className="print-avoid mt-14 grid grid-cols-2 gap-16 px-6 text-center">
      {labels.map((l) => (
        <div key={l}>
          <div className="border-b border-dotted border-black pb-8" />
          <div className="mt-1.5">{l}</div>
          <div className="mt-3 text-black/70">{t('วันที่', 'Date')} ......../......../............</div>
        </div>
      ))}
    </div>
  )
}

export function VoidNote({ reason }: { reason?: string | null }) {
  const { t } = useI18n()
  return (
    <div className="mt-4 border-2 border-black px-3 py-2 font-semibold">
      {t('เอกสารนี้ถูกยกเลิก', 'This document has been cancelled')}
      {reason ? ` — ${t('เหตุผล', 'Reason')}: ${reason}` : ''}
    </div>
  )
}


/** "00000" → สำนักงานใหญ่ / Head office */
const branchLabelOf = (code: string | null | undefined, en: boolean) =>
  !en ? branchLabel(code) : !code ? '' : code === '00000' ? 'Head office' : `Branch ${code}`
