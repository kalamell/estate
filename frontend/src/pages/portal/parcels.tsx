// พอร์ทัลผู้เช่า: พัสดุรอรับ (รหัสรับตัวใหญ่) + ประวัติ 30 วัน
import { ChevronRight, Package, PackageCheck } from 'lucide-react'
import { withUploadAccess, type PortalHome, type PortalParcel } from '@/lib/api'
import { sqlUtc } from '@/lib/billing'
import { dateTime } from '@/lib/docs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ToneBadge } from '@/components/common'
import { LineIcon } from '@/components/line'
import { PhotoGrid } from '@/components/tickets/parts'

const at = (s: string | null) => (s ? dateTime(sqlUtc(s)) : '')

function CodeBox({ code }: { code: string }) {
  return (
    <div className="grid justify-items-center gap-1 rounded-md bg-muted/60 px-3 py-3">
      <div className="text-xs text-muted-foreground">รหัสรับพัสดุ</div>
      <div
        className="font-mono text-4xl font-semibold tracking-[0.3em] tabular-nums"
        aria-label={`รหัสรับพัสดุ ${code.split('').join(' ')}`}
      >
        {code}
      </div>
      <div className="text-xs text-muted-foreground">แสดงรหัสนี้กับเจ้าหน้าที่เมื่อมารับ</div>
    </div>
  )
}

function WaitingCard({ p, token }: { p: PortalParcel; token: string }) {
  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-start gap-3">
        {p.photo_url ? (
          <PhotoGrid photos={[withUploadAccess(p.photo_url, { t: token })]} className="[&>button]:size-14" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Package className="size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium">{p.kind_label}</div>
          <div className="text-sm text-muted-foreground">{[p.carrier, p.tracking_no].filter(Boolean).join(' · ') || '—'}</div>
          <div className="text-xs text-muted-foreground">มาถึง {at(p.received_at)}</div>
        </div>
        <ToneBadge tone="mustard">รอรับ</ToneBadge>
      </div>
      {p.pickup_code && <CodeBox code={p.pickup_code} />}
    </Card>
  )
}

/** การ์ดสรุปบนหน้าหลัก (แสดงเมื่อมีพัสดุรอรับ) */
export function ParcelsHomeCard({ d, onOpen }: { d: PortalHome; onOpen: () => void }) {
  const waiting = (d.parcels ?? []).filter((p) => p.status === 'waiting')
  if (!waiting.length) return null
  const first = waiting[0]
  return (
    <Card className="gap-3 border-warning/50 px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-warning/15 text-warning-foreground">
          <Package className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">มีพัสดุรอรับ {waiting.length} ชิ้น</div>
          <div className="truncate text-sm text-muted-foreground">
            {first.kind_label}
            {first.carrier ? ` · ${first.carrier}` : ''}
          </div>
        </div>
      </div>
      {waiting.length === 1 && first.pickup_code && <CodeBox code={first.pickup_code} />}
      <Button variant="outline" className="h-11 w-full" onClick={onOpen}>
        {waiting.length === 1 ? 'ดูรายละเอียด' : 'ดูรหัสรับทั้งหมด'} <ChevronRight />
      </Button>
    </Card>
  )
}

export function ParcelsTab({ token, d }: { token: string; d: PortalHome }) {
  const all = d.parcels ?? []
  const waiting = all.filter((p) => p.status === 'waiting')
  const done = all.filter((p) => p.status !== 'waiting')
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">พัสดุ</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">พัสดุที่เจ้าหน้าที่รับไว้ให้คุณ</p>
      </div>

      {!waiting.length ? (
        <Card>
          <EmptyState icon={Package} title="ไม่มีพัสดุรอรับ" description="เมื่อมีพัสดุมาถึง รหัสรับจะแสดงที่นี่" />
        </Card>
      ) : (
        <div className="space-y-3">
          {waiting.map((p) => (
            <WaitingCard key={p.id} p={p} token={token} />
          ))}
        </div>
      )}

      {d.line?.linked ? (
        <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <LineIcon className="mt-px size-3.5 shrink-0" />
          เราจะแจ้งทาง LINE พร้อมรหัสรับเมื่อมีพัสดุมาถึง — พิมพ์ “พัสดุ” ในแชตเพื่อดูรายการได้ทุกเมื่อ
        </p>
      ) : d.line?.enabled ? (
        <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <LineIcon className="mt-px size-3.5 shrink-0" />
          เชื่อม LINE ที่หน้าหลักเพื่อรับแจ้งเตือนเมื่อมีพัสดุมาถึง
        </p>
      ) : null}

      {done.length > 0 && (
        <>
          <h2 className="flex items-center gap-2 pt-2 text-sm font-semibold">
            <PackageCheck className="size-4 text-muted-foreground" /> รับแล้ว (30 วันล่าสุด)
          </h2>
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y">
              {done.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.kind_label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[p.carrier, p.tracking_no].filter(Boolean).join(' · ') || `มาถึง ${at(p.received_at)}`}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <ToneBadge tone={p.status === 'returned' ? 'grey' : 'green'}>
                      {p.status === 'returned' ? 'ตีกลับ' : 'รับแล้ว'}
                    </ToneBadge>
                    <div className="mt-1 tabular-nums">{at(p.picked_up_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  )
}
