import { useQuery } from '@tanstack/react-query'
import { Building, CalendarClock, Check, DoorOpen, Info, LifeBuoy, ShieldAlert, Users, X, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, type BillingOverview, type Features, type OrgInfo } from '@/lib/api'
import { CYCLE_LABEL, CYCLE_UNIT } from '@/lib/billing'
import { FEATURE_LABELS } from '@/lib/features'
import { ORG_STATUS, baht, thDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ToneBadge } from '@/components/common'
import { PayCard } from './pay-card'
import { Plans } from './plans'
import { History } from './history'

export default function BillingPage() {
  const { canManage } = useSession()
  return canManage ? <OwnerBilling /> : <StaffBilling />
}

function OwnerBilling() {
  const { orgInfo } = useSession()
  const q = useQuery({ queryKey: ['billing'], queryFn: api.billing })
  const b = q.data
  if (!b)
    return (
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    )
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <CurrentPlan b={b} />
        <UsageCard info={orgInfo} />
      </div>
      {b.open_invoice && <PayCard pay={b.open_invoice} />}
      <Plans b={b} usage={orgInfo?.usage} />
      <History invoices={b.invoices} />
    </div>
  )
}

function DaysLeft({ days, grace }: { days: number | null; grace: boolean }) {
  if (days == null) return <span className="text-muted-foreground">ไม่มีวันหมดอายุ</span>
  if (grace) return <span className="font-medium text-warning-foreground">อยู่ในช่วงผ่อนผัน</span>
  if (days < 0) return <span className="font-medium text-destructive">หมดอายุแล้ว {Math.abs(days)} วัน</span>
  return (
    <span className={cn('font-medium tabular-nums', days <= 7 && 'text-warning-foreground')}>
      {days === 0 ? 'หมดอายุวันนี้' : `เหลือ ${days.toLocaleString('th-TH')} วัน`}
    </span>
  )
}

function CurrentPlan({ b }: { b: BillingOverview }) {
  const sub = b.subscription
  const st = ORG_STATUS[sub.status]
  const pkg = b.packages.find((p) => p.id === sub.package_id)
  const s = b.summary
  const open = b.open_invoice?.invoice
  return (
    <Card>
      <CardHeader>
        <CardDescription>แพ็กเกจปัจจุบัน</CardDescription>
        <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
          {sub.package_name}
          <Badge variant="outline" className={`text-xs ${st?.badge}`}>
            {st?.label ?? sub.status}
          </Badge>
          {sub.price > 0 && <ToneBadge tone="grey" className="text-xs">{CYCLE_LABEL[sub.cycle]}</ToneBadge>}
        </CardTitle>
        {pkg?.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight tabular-nums">
            {sub.price > 0 ? baht(sub.price) : 'ฟรี'}
          </span>
          {sub.price > 0 && <span className="text-sm text-muted-foreground">/ {CYCLE_UNIT[sub.cycle]}</span>}
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border text-sm">
          <div className="bg-card px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">ใช้งานได้ถึง</dt>
            <dd className="mt-0.5 font-medium">{sub.ends_at ? thDateLong(sub.ends_at) : '—'}</dd>
          </div>
          <div className="bg-card px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">สถานะรอบบริการ</dt>
            <dd className="mt-0.5">
              <DaysLeft days={s.days_left} grace={s.in_grace} />
            </dd>
          </div>
        </dl>

        {s.in_grace && !sub.read_only && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              แพ็กเกจหมดอายุแล้ว แต่ยังใช้งานได้ตามปกติถึง{' '}
              <span className="font-medium text-foreground">{thDateLong(s.grace_until)}</span> — ชำระก่อนวันนั้นเพื่อไม่ให้บัญชีเป็นแบบอ่านอย่างเดียว
            </span>
          </p>
        )}
        {sub.read_only && (
          <Alert className="border-warning/40 bg-warning/10">
            <ShieldAlert className="text-warning" />
            <AlertTitle>บัญชีอยู่ในโหมดอ่านอย่างเดียว</AlertTitle>
            <AlertDescription>
              {sub.status === 'suspended' ? (
                <span>
                  บัญชีถูกระงับโดยผู้ให้บริการ —{' '}
                  <Link to="/support" className="font-medium underline underline-offset-4">
                    ติดต่อผู้ให้บริการ
                  </Link>
                </span>
              ) : (
                'ข้อมูลทั้งหมดยังอยู่ครบ ชำระค่าบริการเพื่อกลับมาแก้ไขและออกเอกสารได้ตามปกติ'
              )}
            </AlertDescription>
          </Alert>
        )}

        {pkg && <FeatureChips features={pkg.features} />}

        {open && (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href="#pay">ไปที่ใบแจ้งหนี้ {open.doc_no}</a>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function FeatureChips({ features }: { features: Features }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {(Object.keys(FEATURE_LABELS) as (keyof Features)[]).map((k) => {
        const on = features[k]
        const F = FEATURE_LABELS[k]
        return (
          <li
            key={k}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs',
              on ? 'bg-card' : 'border-dashed text-muted-foreground',
            )}
          >
            {on ? <Check className="size-3 text-success" /> : <X className="size-3" />}
            <span className={cn(!on && 'line-through decoration-muted-foreground/40')}>{F.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Usage({ icon: Icon, label, used, max }: { icon: LucideIcon; label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0
  const full = used >= max
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="size-4 text-muted-foreground" />
        <span>{label}</span>
        <span className={cn('ml-auto tabular-nums', full && 'font-semibold text-destructive')}>
          {used.toLocaleString('th-TH')} / {max.toLocaleString('th-TH')}
        </span>
      </div>
      <Progress
        value={pct}
        className={cn('h-2', full ? '[&>div]:bg-destructive' : pct >= 80 ? '[&>div]:bg-warning' : '[&>div]:bg-primary')}
        aria-label={label}
      />
    </div>
  )
}

function UsageCard({ info }: { info: OrgInfo | undefined }) {
  if (!info) return <Skeleton className="h-64 rounded-lg" />
  const { usage, package: pkg } = info
  return (
    <Card>
      <CardHeader>
        <CardTitle>การใช้งาน</CardTitle>
        <CardDescription>เทียบกับขีดจำกัดของแพ็กเกจ</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Usage icon={Building} label="โครงการ" used={usage.properties} max={pkg.max_properties} />
        <Usage icon={DoorOpen} label="ห้องพัก" used={usage.units} max={pkg.max_units} />
        <Usage icon={Users} label="สมาชิก" used={usage.members} max={pkg.max_members} />
      </CardContent>
    </Card>
  )
}

/** พนักงานดูแพ็กเกจและการใช้งานได้ แต่การชำระเงินเป็นของเจ้าของ/ผู้ดูแล */
function StaffBilling() {
  const { orgInfo } = useSession()
  if (!orgInfo)
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    )
  const { package: pkg, org, billing } = orgInfo
  const st = ORG_STATUS[org.status]
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardDescription>แพ็กเกจปัจจุบัน</CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
              {pkg.name}
              <Badge variant="outline" className={`text-xs ${st?.badge}`}>
                {st?.label ?? org.status}
              </Badge>
            </CardTitle>
            {pkg.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border text-sm">
              <div className="bg-card px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">ใช้งานได้ถึง</dt>
                <dd className="mt-0.5 font-medium">{org.ends_at ? thDateLong(org.ends_at) : '—'}</dd>
              </div>
              <div className="bg-card px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">สถานะรอบบริการ</dt>
                <dd className="mt-0.5">
                  <DaysLeft days={billing?.days_left ?? null} grace={!!billing?.in_grace} />
                </dd>
              </div>
            </dl>
            <FeatureChips features={pkg.features} />
          </CardContent>
        </Card>
        <UsageCard info={orgInfo} />
      </div>
      <Alert>
        <Info />
        <AlertTitle>การต่ออายุและชำระค่าบริการ</AlertTitle>
        <AlertDescription>
          จัดการโดยเจ้าของหรือผู้ดูแลองค์กร — ติดต่อเจ้าของบัญชีหากต้องการต่ออายุหรือเปลี่ยนแพ็กเกจ
          <Button asChild variant="link" className="h-auto p-0">
            <Link to="/support">
              <LifeBuoy /> หรือติดต่อผู้ให้บริการ
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}
