// ศูนย์รวมการเชื่อมต่อ — สถานะบริการภายนอกทั้งหมดขององค์กร และทางลัดไปหน้าตั้งค่าของแต่ละบริการ
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CreditCard,
  ExternalLink,
  Globe,
  Info,
  Mail,
  Network,
  RefreshCw,
  ScanLine,
  type LucideIcon,
} from 'lucide-react'
import { api, type IntegrationsStatus } from '@/lib/api'
import { sqlUtc } from '@/lib/billing'
import { CHANNELS } from '@/lib/channels'
import { timeAgo } from '@/lib/docs'
import { TONE, type Tone } from '@/lib/format'
import { PROVIDER_LABEL } from '@/lib/slips'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminOnlyState } from '@/components/common'
import { InterestDialog, type InterestTopic } from './interest-dialog'

type State = 'connected' | 'off' | 'problem' | 'soon' | 'locked'

const STATE: Record<State, { label: string; tone: Tone }> = {
  connected: { label: 'เชื่อมแล้ว', tone: 'green' },
  off: { label: 'ยังไม่ได้ตั้งค่า', tone: 'grey' },
  problem: { label: 'มีปัญหา', tone: 'mustard' },
  soon: { label: 'เร็ว ๆ นี้', tone: 'primary' },
  locked: { label: 'ไม่รวมในแพ็กเกจ', tone: 'grey' },
}

const CHANNEL_MANAGER: InterestTopic = {
  title: 'Channel Manager',
  prefix: 'สนใจเชื่อม Channel Manager',
  description:
    'เมื่อเชื่อมผ่าน Channel Manager ราคา ห้องว่าง และการจองจาก OTA จะซิงก์อัตโนมัติ บอกเราว่าใช้หรือสนใจเจ้าไหน เพื่อจัดลำดับการพัฒนา',
  options: ['Channex', 'SiteMinder', 'อื่น ๆ / ยังไม่แน่ใจ'],
}

const PAYMENT_GATEWAY: InterestTopic = {
  title: 'Payment Gateway',
  prefix: 'สนใจรับชำระผ่าน Payment Gateway',
  description:
    'ให้ผู้เช่าจ่ายด้วยบัตรหรือโมบายแบงก์กิ้ง แล้วระบบบันทึกรับเงินและออกใบเสร็จเองโดยไม่ต้องตรวจสลิป บอกเราว่าใช้หรือสนใจเจ้าไหน',
  options: ['Omise', '2C2P', 'GB Prime Pay', 'อื่น ๆ / ยังไม่แน่ใจ'],
}

interface Item {
  key: string
  name: string
  mark: ReactNode
  state: State
  /** คำอธิบาย 1 บรรทัด */
  desc: string
  /** ตัวเลข/สถานะสำคัญ */
  facts?: { label: string; value: ReactNode }[]
  /** บรรทัดเตือนเมื่อมีปัญหา */
  issue?: string
  action?: { label: string; to: string } | { label: string; onClick: () => void }
  extra?: ReactNode
}

const n = (v: number) => v.toLocaleString('th-TH')
const ago = (s: string | null) => (s ? timeAgo(sqlUtc(s)) : 'ยังไม่เคย')

export default function IntegrationsPage() {
  const { canManage, features } = useSession()
  const [topic, setTopic] = useState<InterestTopic | null>(null)
  const q = useQuery({ queryKey: ['integrations'], queryFn: api.integrations, enabled: canManage })

  if (!canManage) return <AdminOnlyState />

  const d = q.data
  const groups = d ? buildGroups(d, features.short_stay, setTopic) : null
  // อีเมลตั้งค่าที่ระดับแพลตฟอร์ม องค์กรแก้เองไม่ได้ — ไม่นับในสรุป
  const all = groups?.flatMap((g) => g.items).filter((i) => i.key !== 'email') ?? []
  const count = (s: State) => all.filter((i) => i.state === s).length

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">ศูนย์รวมการเชื่อมต่อ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            สถานะบริการภายนอกที่องค์กรนี้ใช้ กด “ตั้งค่า” เพื่อไปยังหน้าที่ใช้เชื่อมบริการนั้น
          </p>
        </div>
        {groups && (
          <div className="flex flex-wrap items-center gap-2 text-xs sm:ml-auto">
            <SummaryChip tone="green" label="เชื่อมแล้ว" value={count('connected')} />
            {count('problem') > 0 && <SummaryChip tone="mustard" label="มีปัญหา" value={count('problem')} />}
            <SummaryChip tone="grey" label="ยังไม่ได้ตั้งค่า" value={count('off')} />
            <Button variant="ghost" size="icon-sm" onClick={() => void q.refetch()} aria-label="โหลดสถานะใหม่" title="โหลดสถานะใหม่">
              <RefreshCw className={cn(q.isFetching && 'animate-spin')} />
            </Button>
          </div>
        )}
      </div>

      {q.isLoading || !groups ? (
        <div className="space-y-8">
          {Array.from({ length: 3 }, (_, g) => (
            <div key={g} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-48 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.title} aria-labelledby={`int-${g.key}`} className="space-y-3">
            <div>
              <h3 id={`int-${g.key}`} className="text-base font-semibold">
                {g.title}
              </h3>
              <p className="text-sm text-muted-foreground">{g.desc}</p>
            </div>
            {g.note}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map((it) => (
                <IntegrationCard key={it.key} item={it} />
              ))}
            </div>
          </section>
        ))
      )}

      <InterestDialog topic={topic} onClose={() => setTopic(null)} />
    </div>
  )
}

function buildGroups(d: IntegrationsStatus, shortStay: boolean, ask: (t: InterestTopic) => void) {
  const ch = (...sources: string[]) => {
    const rows = d.channels.filter((c) => sources.includes(c.source))
    const feeds = rows.reduce((a, r) => a + r.feeds, 0)
    const errors = rows.reduce((a, r) => a + r.errors, 0)
    const last = rows.map((r) => r.last_synced_at).filter((v): v is string => !!v).sort().at(-1) ?? null
    return { feeds, errors, last }
  }
  const exportFact = {
    label: 'ลิงก์ส่งออกของระบบ',
    value: d.ical_export.short_stay_units
      ? `${n(d.ical_export.exported_units)}/${n(d.ical_export.short_stay_units)} ห้อง`
      : 'ยังไม่มีห้องรายวัน',
  }
  const ota = (key: string, sources: string[], name: string, mark: ReactNode, where: string): Item => {
    const c = ch(...sources)
    if (!shortStay)
      return {
        key,
        name,
        mark,
        state: 'locked',
        desc: `ซิงก์วันที่ไม่ว่างกับ ${name} ผ่าน iCal — ใช้ได้ในแพ็กเกจที่มีห้องพักรายวัน`,
        action: { label: 'ดูแพ็กเกจ', to: '/billing' },
      }
    return {
      key,
      name,
      mark,
      state: c.feeds === 0 ? 'off' : c.errors > 0 ? 'problem' : 'connected',
      desc: `ดึงปฏิทินจาก ${where} ทุก 30 นาที และส่งวันที่ไม่ว่างกลับผ่านลิงก์ iCal`,
      facts: [
        { label: 'ห้องที่เชื่อมปฏิทิน', value: `${n(c.feeds)} ห้อง` },
        { label: 'ซิงก์ล่าสุด', value: c.feeds ? ago(c.last) : '–' },
        exportFact,
      ],
      issue: c.errors > 0 ? `ดึงปฏิทินไม่สำเร็จ ${n(c.errors)} ลิงก์ — ตรวจลิงก์ในหน้าช่องทางขาย` : undefined,
      action: { label: 'ตั้งค่า', to: '/calendar?channels=1' },
    }
  }

  const bp = d.booking_pages
  const pp = d.promptpay
  const slipProvider = d.slip.provider !== 'none' && !!d.slip.provider
  const line = d.line

  const groups: { key: string; title: string; desc: string; note?: ReactNode; items: Item[] }[] = [
    {
      key: 'sales',
      title: 'ช่องทางขายห้องพัก',
      desc: 'ปฏิทินห้องรายวันกับ OTA และหน้าจองตรงของโครงการ',
      note: (
        <div className="flex gap-3 rounded-md border bg-muted/40 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Airbnb และ Booking.com เปิด API แบบสองทาง (ราคา/ห้องว่าง/การจอง) ให้เฉพาะพาร์ทเนอร์ที่ได้รับอนุมัติ
            ตอนนี้ระบบซิงก์ห้องว่างผ่าน iCal (อัปเดตทุก 30 นาที) ถ้าต้องการซิงก์ราคาและรับการจองอัตโนมัติ
            ต้องเชื่อมผ่าน Channel Manager (เช่น Channex, SiteMinder)
          </p>
        </div>
      ),
      items: [
        ota('airbnb', ['airbnb'], 'Airbnb', <TextMark text="Ab" color={CHANNELS.airbnb.color} />, 'Airbnb'),
        ota('booking', ['booking'], 'Booking.com', <TextMark text="B." color={CHANNELS.booking.color} />, 'Booking.com Extranet'),
        ota('agoda', ['agoda'], 'Agoda', <TextMark text="Ag" color={CHANNELS.agoda.color} />, 'Agoda YCS'),
        ota('ical', ['vrbo', 'other'], 'VRBO และช่องทางอื่น', <TextMark text="iCal" color={CHANNELS.other.color} small />, 'ช่องทางที่ให้ลิงก์ iCal'),
        shortStay
          ? {
              key: 'direct',
              name: 'หน้าจองตรง',
              mark: <IconMark icon={Globe} />,
              state: bp.length ? 'connected' : 'off',
              desc: 'หน้าเว็บให้แขกเลือกวันและจองกับคุณโดยตรง โอนมัดจำผ่านพร้อมเพย์ ไม่มีค่าคอมมิชชัน',
              facts: [{ label: 'เปิดใช้', value: bp.length ? `${n(bp.length)} โครงการ` : 'ยังไม่เปิด' }],
              extra: bp.length ? (
                <ul className="space-y-1 text-xs">
                  {bp.slice(0, 3).map((p) => (
                    <li key={p.property_id} className="flex min-w-0 items-center gap-1.5">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
                      >
                        <span className="truncate">{p.name}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : undefined,
              action: { label: 'ตั้งค่า', to: bp.length ? `/properties?edit=${bp[0].property_id}` : '/properties' },
            }
          : {
              key: 'direct',
              name: 'หน้าจองตรง',
              mark: <IconMark icon={Globe} />,
              state: 'locked',
              desc: 'หน้าเว็บให้แขกจองห้องรายวันกับคุณโดยตรง — ใช้ได้ในแพ็กเกจที่มีห้องพักรายวัน',
              action: { label: 'ดูแพ็กเกจ', to: '/billing' },
            },
        {
          key: 'channel-manager',
          name: 'Channel Manager',
          mark: <IconMark icon={Network} muted />,
          state: 'soon',
          desc: 'ซิงก์ราคา ห้องว่าง และรับการจองจาก OTA อัตโนมัติผ่าน Channex หรือ SiteMinder',
          action: { label: 'แจ้งความสนใจ', onClick: () => ask(CHANNEL_MANAGER) },
        },
      ],
    },
    {
      key: 'payments',
      title: 'การรับเงิน',
      desc: 'QR บนบิล และการตรวจสลิปที่ผู้เช่าส่งมา',
      items: [
        {
          key: 'promptpay',
          name: 'พร้อมเพย์',
          mark: <TextMark text="PP" color="#1B3C73" />,
          state: pp.properties === 0 || pp.configured === 0 ? 'off' : pp.configured < pp.properties ? 'problem' : 'connected',
          desc: 'ใส่เลขพร้อมเพย์ของแต่ละโครงการ บิลทุกใบจะมี QR ระบุยอดให้ผู้เช่าสแกนจ่าย',
          facts: [{ label: 'โครงการที่ตั้งเลขแล้ว', value: `${n(pp.configured)}/${n(pp.properties)}` }],
          issue:
            pp.configured > 0 && pp.configured < pp.properties
              ? `บิลของ ${n(pp.properties - pp.configured)} โครงการยังไม่มี QR พร้อมเพย์`
              : undefined,
          action: { label: 'ตั้งค่า', to: '/properties' },
        },
        {
          key: 'slip',
          name: 'ตรวจสลิป (EasySlip / SlipOK)',
          mark: <IconMark icon={ScanLine} />,
          state: !slipProvider ? 'off' : d.slip.has_key ? 'connected' : 'problem',
          desc: slipProvider
            ? 'ยืนยันยอดเงิน ผู้โอน และผู้รับกับธนาคาร ก่อนบันทึกรับเงิน'
            : 'ตอนนี้ระบบตรวจ QR บนสลิปและสลิปซ้ำได้ แต่ยอดเงินต้องให้ทีมงานดูจากรูป',
          facts: slipProvider
            ? [
                { label: 'ผู้ให้บริการ', value: PROVIDER_LABEL[d.slip.provider] ?? d.slip.provider },
                { label: 'ยืนยันรับเงินอัตโนมัติ', value: d.slip.auto_approve ? 'เปิด' : 'ปิด' },
              ]
            : undefined,
          issue: slipProvider && !d.slip.has_key ? 'เลือกผู้ให้บริการแล้วแต่ยังไม่ได้ใส่ API key' : undefined,
          action: { label: 'ตั้งค่า', to: '/settings?tab=slip' },
        },
        {
          key: 'gateway',
          name: 'Payment Gateway',
          mark: <IconMark icon={CreditCard} muted />,
          state: 'soon',
          desc: 'รับชำระด้วยบัตรหรือโมบายแบงก์กิ้งผ่าน Omise, 2C2P หรือ GB Prime Pay แล้วออกใบเสร็จอัตโนมัติ',
          action: { label: 'แจ้งความสนใจ', onClick: () => ask(PAYMENT_GATEWAY) },
        },
      ],
    },
    {
      key: 'comms',
      title: 'การสื่อสาร',
      desc: 'ช่องทางที่ระบบใช้ส่งบิล ใบเสร็จ และการแจ้งเตือน',
      items: [
        {
          key: 'line',
          name: 'LINE Official Account',
          mark: <TextMark text="L" color="#06C755" />,
          state: !line.enabled ? 'off' : line.ready ? 'connected' : 'problem',
          desc: 'ส่งบิล ใบเสร็จ และการแจ้งเตือนให้ผู้เช่าทาง LINE และตอบเมื่อผู้เช่าพิมพ์ถาม',
          facts: line.enabled
            ? [
                ...(line.basic_id ? [{ label: 'บัญชี', value: line.basic_id }] : []),
                { label: 'ผู้เช่าที่เชื่อมแล้ว', value: `${n(line.linked_tenants)} คน` },
                { label: 'ทีมงานที่เชื่อมแล้ว', value: `${n(line.linked_staff)} คน` },
                { label: 'ส่งอัตโนมัติ', value: `เปิด ${n(line.auto_on)} จาก ${n(line.auto_total)} เรื่อง` },
              ]
            : undefined,
          issue: line.enabled && !line.ready ? 'เปิดใช้แล้วแต่ยังไม่มี Channel access token — ระบบยังส่งข้อความไม่ได้' : undefined,
          action: { label: 'ตั้งค่า', to: '/settings?tab=line' },
        },
        {
          key: 'email',
          name: 'อีเมล',
          mark: <IconMark icon={Mail} />,
          state: d.email.platform_smtp ? 'connected' : 'off',
          desc: d.email.platform_smtp
            ? 'ระบบส่งอีเมลลืมรหัสผ่าน ยืนยันอีเมล และใบแจ้งหนี้ค่าแพ็กเกจได้ ผู้ให้บริการแพลตฟอร์มเป็นผู้ตั้งค่า'
            : 'ผู้ให้บริการแพลตฟอร์มยังไม่ได้ตั้งค่าเซิร์ฟเวอร์อีเมล (SMTP) อีเมลลืมรหัสผ่านและใบแจ้งหนี้จะยังไม่ถูกส่ง',
          facts: [{ label: 'เซิร์ฟเวอร์อีเมลของแพลตฟอร์ม', value: d.email.platform_smtp ? 'พร้อมส่ง' : 'ยังไม่ได้ตั้งค่า' }],
        },
      ],
    },
  ]
  return groups
}

function IntegrationCard({ item }: { item: Item }) {
  const s = STATE[item.state]
  return (
    <Card className={cn('gap-4 p-5', item.state === 'soon' && 'border-dashed bg-transparent shadow-none')}>
      <div className="flex items-start gap-3">
        {item.mark}
        <div className="min-w-0 flex-1">
          <h4 className="font-medium leading-snug">{item.name}</h4>
          <span className={cn('mt-1 inline-flex rounded-sm px-1.5 py-0.5 text-[11px] font-medium', TONE[s.tone])}>
            {s.label}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{item.desc}</p>
      {item.facts && (
        <dl className="grid gap-1.5 text-sm">
          {item.facts.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="text-right font-medium tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {item.extra}
      {item.issue && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning-foreground">{item.issue}</p>}
      {item.action && (
        <div className="mt-auto pt-1">
          {'to' in item.action ? (
            <Button asChild variant={item.state === 'off' || item.state === 'problem' ? 'default' : 'outline'} size="sm">
              <Link to={item.action.to}>
                {item.action.label} <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={item.action.onClick}>
              {item.action.label}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

/** ตราแบบตัวอักษร (ไม่ใช้โลโก้จริงของแบรนด์) */
function TextMark({ text, color, small }: { text: string; color: string | null; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-md font-bold text-white',
        small ? 'text-[11px]' : 'text-sm',
      )}
      style={{ backgroundColor: color ? `color-mix(in srgb, ${color} 88%, black)` : 'var(--primary)' }}
    >
      {text}
    </span>
  )
}

function IconMark({ icon: Icon, muted }: { icon: LucideIcon; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-md border',
        muted ? 'border-dashed text-muted-foreground' : 'bg-muted text-primary',
      )}
    >
      <Icon className="size-5" />
    </span>
  )
}

function SummaryChip({ tone, label, value }: { tone: Tone; label: string; value: number }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-medium', TONE[tone])}>
      {label} <span className="tabular-nums">{value}</span>
    </span>
  )
}
