// สัญญาเช่าอิเล็กทรอนิกส์ — หน้าพิมพ์ A4 (เจ้าหน้าที่ /print/contract/:id, ผู้เช่า /p/:token/print/contract/:id)
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, withUploadAccess, type Contract, type Issuer, type PortalContract } from '@/lib/api'
import { isClauseHeading, paragraphs, shortUA, stampOf } from '@/lib/contracts'
import { docErrorText as errorText, orgLegalOf } from '@/lib/docs'
import { isLang, useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { LangProvider } from '@/components/lang'
import { PrintShell, Sheet } from './doc'

type ContractDoc = PortalContract & Partial<Pick<Contract, 'tenant_signed_ip' | 'tenant_signed_ua'>>

/** เนื้อหาสัญญาเป็นย่อหน้า — ย่อหน้าแรกเป็นหัวเรื่อง บรรทัด "ข้อ n" เป็นหัวข้อ */
export function ContractBody({ body, className }: { body: string; className?: string }) {
  const paras = paragraphs(body)
  return (
    <div className={cn('space-y-3', className)}>
      {paras.map((p, i) => {
        const lines = p.split('\n')
        if (i === 0 && lines.length <= 3 && lines[0].length <= 80)
          return (
            <div key={i} className="pb-1 text-center">
              <div className="text-[1.3em] leading-snug font-semibold">{lines[0]}</div>
              {lines.slice(1).map((l, j) => (
                <div key={j} className="text-[0.95em] opacity-80">
                  {l}
                </div>
              ))}
            </div>
          )
        return (
          <p key={i} className="print-avoid break-words">
            {lines.map((l, j) => (
              <span key={j} className={cn('block', j === 0 && isClauseHeading(l) && lines.length > 1 && 'font-semibold')}>
                {l || ' '}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function SignBlock({
  role,
  name,
  signature,
  signedAt,
}: {
  role: string
  name: string | null | undefined
  signature: string | null
  signedAt: string | null
}) {
  const { t, lang } = useI18n()
  return (
    <div className="text-center">
      <div className="flex h-20 items-end justify-center border-b border-dotted border-black">
        {signature ? (
          <img src={signature} alt={t('ลายมือชื่อ', 'Signature')} className="max-h-[76px] max-w-[230px] object-contain" />
        ) : (
          <span className="pb-2 text-[12px] text-black/40">{t('ยังไม่ได้ลงนาม', 'Not signed yet')}</span>
        )}
      </div>
      <div className="mt-1.5">( {name || '.................................'} )</div>
      <div className="font-medium">{role}</div>
      <div className="mt-1 text-[11px] text-black/65">
        {signedAt ? `${t('ลงนามเมื่อ', 'Signed')} ${stampOf(signedAt, lang)}` : t('วันที่ ......../......../............', 'Date ......../......../............')}
      </div>
    </div>
  )
}

export function ContractDocument({
  c,
  landlordName,
  issuer,
  uploadAccess,
}: {
  c: ContractDoc
  landlordName: string
  issuer?: Partial<Issuer> | null
  /** โทเคนพอร์ทัลสำหรับเปิดรูปลายเซ็น */
  uploadAccess?: { t?: string }
}) {
  const { t, lang } = useI18n()
  const img = (u: string | null) => (u && uploadAccess ? withUploadAccess(u, uploadAccess) : u)
  const watermark =
    c.status === 'void' ? t('ยกเลิก', 'VOID') : c.status === 'draft' ? t('ฉบับร่าง', 'DRAFT') : null
  const signedBy = (at: string | null, name: string | null) =>
    at ? `${stampOf(at, lang)}${name ? ` · ${name}` : ''}` : '—'
  const docNo = <span className="font-mono">{c.doc_no}</span>
  const hash = c.content_hash ? (
    <span className="font-mono text-[11px] break-all">{c.content_hash}</span>
  ) : (
    <span className="text-black/50">{t('ยังไม่ได้ส่ง (ร่าง)', 'Not sent yet (draft)')}</span>
  )
  const ip = <span className="font-mono">{c.tenant_signed_ip || '—'}</span>
  const evidence: [string, React.ReactNode][] = [
    [t('เลขที่สัญญา', 'Contract no.'), docNo],
    [t('รหัสตรวจสอบเนื้อหา (SHA-256)', 'Content hash (SHA-256)'), hash],
    [t('ส่งให้ผู้เช่าเมื่อ', 'Sent to tenant'), stampOf(c.sent_at, lang)],
    [t('ผู้เช่าลงนามเมื่อ', 'Tenant signed'), signedBy(c.tenant_signed_at, c.tenant_signed_name)],
  ]
  if (c.tenant_signed_at && c.tenant_signed_ip !== undefined)
    evidence.push([t('IP ผู้เช่า', 'Tenant IP'), ip], [t('อุปกรณ์ผู้เช่า', 'Tenant device'), shortUA(c.tenant_signed_ua)])
  evidence.push([t('ผู้ให้เช่าลงนามเมื่อ', 'Landlord signed'), signedBy(c.landlord_signed_at, c.landlord_signed_name)])

  return (
    <Sheet watermark={watermark}>
      <header className="flex items-baseline justify-between gap-4 border-b border-black/40 pb-2 text-[11px] text-black/70">
        <div className="min-w-0">
          <span className="font-semibold text-black">{issuer?.legal_name || landlordName}</span>
          {issuer?.tax_id && (
            <span>
              {' '}
              · {t('เลขประจำตัวผู้เสียภาษี', 'Tax ID')} {issuer.tax_id}
            </span>
          )}
        </div>
        <div className="shrink-0 tabular-nums">
          {t('เลขที่', 'No.')} {c.doc_no}
        </div>
      </header>

      <ContractBody body={c.body} className="mt-6 text-[13.5px] leading-[1.85]" />

      {c.status === 'void' && (
        <div className="mt-6 border-2 border-black px-3 py-2 font-semibold">
          {t('สัญญานี้ถูกยกเลิก', 'This contract has been cancelled')}
          {c.void_reason ? ` — ${t('เหตุผล', 'Reason')}: ${c.void_reason}` : ''}
        </div>
      )}

      <div className="print-avoid mt-12 grid grid-cols-2 gap-10 px-2 sm:gap-16 sm:px-6">
        <SignBlock
          role={t('ผู้ให้เช่า', 'Landlord')}
          name={c.landlord_signed_name || landlordName}
          signature={img(c.landlord_signature_url)}
          signedAt={c.landlord_signed_at}
        />
        <SignBlock
          role={t('ผู้เช่า', 'Tenant')}
          name={c.tenant_signed_name || c.tenant_name}
          signature={img(c.tenant_signature_url)}
          signedAt={c.tenant_signed_at}
        />
      </div>

      <section className="print-avoid mt-10 border border-black/70">
        <h2 className="border-b border-black/70 bg-black/[0.04] px-3 py-1.5 text-[12px] font-semibold">
          {t('หลักฐานการลงนามอิเล็กทรอนิกส์', 'Electronic signature record')}
        </h2>
        <table className="w-full text-left text-[12px]">
          <tbody>
            {evidence.map(([k, v]) => (
              <tr key={k} className="border-b border-black/10 last:border-0">
                <td className="w-[38%] px-3 py-1 align-top text-black/65">{k}</td>
                <td className="px-3 py-1 align-top">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-black/20 px-3 py-1.5 text-[10.5px] leading-snug text-black/60">
          {t(
            'ลงนามด้วยลายมือชื่ออิเล็กทรอนิกส์ตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 — รหัสตรวจสอบคำนวณจากชื่อและเนื้อหาสัญญา ณ เวลาที่ส่ง หากเนื้อหาถูกแก้ไขรหัสจะไม่ตรงกัน',
            'Signed electronically under the Thai Electronic Transactions Act B.E. 2544 (2001). The content hash is computed from the contract title and text when it was sent; any change to the text produces a different hash.',
          )}
        </p>
      </section>
    </Sheet>
  )
}

export function StaffContractPrint() {
  const id = Number(useParams().id)
  const { orgInfo, org } = useSession()
  const q = useQuery({ queryKey: ['contract', id], queryFn: () => api.contract(id), meta: { silent: true } })
  const issuer = orgInfo ? orgLegalOf(orgInfo) : null
  const name = issuer?.legal_name || orgInfo?.org.name || org?.name || ''
  return (
    <PrintShell
      title={`สัญญา ${q.data?.doc_no ?? ''}`}
      loading={q.isLoading}
      error={q.error ? errorText(q.error) : null}
    >
      {q.data && <ContractDocument c={q.data} landlordName={name} issuer={issuer} />}
    </PrintShell>
  )
}

export function PortalContractPrint() {
  const { token = '', id } = useParams()
  const q = useQuery({
    queryKey: ['portal', token, 'contract', Number(id)],
    queryFn: () => api.portal.contract(token, Number(id)),
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
        title={`${lang === 'en' ? 'Contract' : 'สัญญา'} ${q.data?.contract.doc_no ?? ''}`}
        loading={q.isLoading || home.isLoading}
        error={q.error ? errorText(q.error, lang) : null}
      >
        {q.data && (
          <ContractDocument
            c={q.data.contract}
            landlordName={q.data.org.name || home.data?.org.name || ''}
            uploadAccess={{ t: token }}
          />
        )}
      </PrintShell>
    </LangProvider>
  )
}
