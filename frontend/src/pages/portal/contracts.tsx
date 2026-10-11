// พอร์ทัลผู้เช่า: การ์ดสัญญารอลงนาม + รายการสัญญา
import { Link } from 'react-router-dom'
import { ChevronRight, FileSignature, PenLine } from 'lucide-react'
import type { ContractStatus, PortalHome } from '@/lib/api'
import { TENANT_CONTRACT_STATUS } from '@/lib/contracts'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ToneBadge } from '@/components/common'

export function TenantContractBadge({ status }: { status: ContractStatus }) {
  const { en } = useI18n()
  const s = TENANT_CONTRACT_STATUS[status] ?? TENANT_CONTRACT_STATUS.sent
  return <ToneBadge tone={s.tone}>{en ? s.en : s.th}</ToneBadge>
}

/** การ์ดบนหน้าหลักเมื่อมีสัญญารอลงนาม */
export function ContractsHomeCard({ token, d }: { token: string; d: PortalHome }) {
  const { t } = useI18n()
  const waiting = (d.contracts ?? []).filter((c) => c.status === 'sent')
  if (!waiting.length) return null
  const first = waiting[0]
  return (
    <Card className="gap-3 border-warning/50 px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-warning/15 text-warning-foreground">
          <FileSignature className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {waiting.length > 1
              ? t(`มีสัญญารอลงนาม ${waiting.length} ฉบับ`, `${waiting.length} contracts to sign`)
              : t('สัญญารอให้คุณลงนาม', 'A contract is waiting for your signature')}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {first.title} · {first.doc_no}
          </div>
        </div>
      </div>
      <Button asChild className="h-12 w-full text-base">
        <Link to={`/p/${token}/contract/${first.id}`}>
          <PenLine /> {t('อ่านและลงนาม', 'Read and sign')}
        </Link>
      </Button>
    </Card>
  )
}

/** รายการสัญญาทั้งหมดที่ส่งให้ผู้เช่าแล้ว */
export function ContractsSection({ token, d }: { token: string; d: PortalHome }) {
  const { t, date } = useI18n()
  const list = d.contracts ?? []
  if (!list.length) return null
  return (
    <>
      <h2 className="flex items-center gap-2 pt-2 text-sm font-semibold">
        <FileSignature className="size-4 text-muted-foreground" />
        {t('เอกสารสัญญา', 'Contracts')}
      </h2>
      <Card className="gap-0 overflow-hidden py-0">
        <ul className="divide-y">
          {list.map((c) => (
            <li key={c.id}>
              <Link
                to={`/p/${token}/contract/${c.id}`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className={c.status === 'void' ? 'font-medium line-through' : 'font-medium'}>{c.title}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{c.doc_no}</span>
                    {c.tenant_signed_at
                      ? ` · ${t('ลงนาม', 'signed')} ${date(c.tenant_signed_at.slice(0, 10))}`
                      : c.sent_at
                        ? ` · ${t('ส่งเมื่อ', 'sent')} ${date(c.sent_at.slice(0, 10))}`
                        : ''}
                  </div>
                </div>
                <TenantContractBadge status={c.status} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
