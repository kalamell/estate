import { Building, Check, DoorOpen, Users, X, type LucideIcon } from 'lucide-react'
import { FEATURE_LABELS } from '@/lib/features'
import type { Features } from '@/lib/api'
import { ORG_STATUS, baht, thDateLong, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

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
        className={cn('h-2', full ? '[&>div]:bg-destructive' : pct >= 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-brand')}
        aria-label={label}
      />
    </div>
  )
}

export function PackageTab() {
  const { orgInfo } = useSession()
  if (!orgInfo)
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  const { package: pkg, usage, org } = orgInfo
  const st = ORG_STATUS[org.status]
  const expired = !!org.ends_at && org.ends_at.slice(0, 10) < today()

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-brand opacity-15 blur-3xl" />
        <CardHeader>
          <CardDescription>แพ็กเกจปัจจุบัน</CardDescription>
          <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
            {pkg.name}
            <Badge variant="outline" className={`border-0 text-xs ${st?.badge}`}>{st?.label ?? org.status}</Badge>
            {expired && (
              <Badge variant="outline" className="border-0 bg-rose-100 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                หมดอายุ
              </Badge>
            )}
          </CardTitle>
          {pkg.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight tabular-nums">{baht(pkg.price_monthly)}</span>
            <span className="text-sm text-muted-foreground">/ เดือน</span>
          </div>
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <span className="text-muted-foreground">วันสิ้นสุด: </span>
            <span className="font-medium">{org.ends_at ? thDateLong(org.ends_at) : 'ไม่กำหนด'}</span>
          </div>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-medium">ฟีเจอร์ในแพ็กเกจ</h3>
            <ul className="space-y-2.5">
              {(Object.keys(FEATURE_LABELS) as (keyof Features)[]).map((k) => {
                const on = pkg.features[k]
                const F = FEATURE_LABELS[k]
                return (
                  <li key={k} className={cn('flex items-center gap-3 text-sm', !on && 'text-muted-foreground')}>
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-full',
                        on ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {on ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                    </span>
                    <F.icon className="size-4" />
                    <span className={cn(!on && 'line-through decoration-muted-foreground/40')}>{F.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">ต้องการเปลี่ยนแพ็กเกจ? ติดต่อผู้ดูแลระบบ Estate</p>
        </CardContent>
      </Card>

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
    </div>
  )
}
