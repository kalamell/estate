import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Sparkles, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { BOOKING_STATUS, UNIT_STATUS } from '@/lib/format'
import type { BookingStatus, UnitStatus } from '@/lib/api'

/** Label + control ที่ผูก id กัน */
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
  children,
  className,
  compact,
}: {
  label: string
  compact?: boolean
  value: ReactNode
  sub?: ReactNode
  icon?: LucideIcon
  tone?: 'default' | 'success' | 'danger' | 'brand'
  children?: ReactNode
  className?: string
}) {
  const toneCls = {
    default: '',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-rose-600 dark:text-rose-400',
    brand: 'text-primary',
  }[tone]
  return (
    <Card className={cn('gap-0 py-4', compact ? 'px-3 sm:px-5' : 'px-5', className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="size-4" />}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'mt-1 font-bold tracking-tight tabular-nums',
          compact ? 'text-base sm:text-2xl' : 'text-2xl sm:text-3xl',
          toneCls,
        )}
      >
        {value}
      </div>
      {children}
      {sub && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  )
}

export function StatCardSkeleton() {
  return (
    <Card className="gap-3 px-5 py-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </Card>
  )
}

export function UnitStatusBadge({ status, className }: { status: UnitStatus; className?: string }) {
  const s = UNIT_STATUS[status] ?? UNIT_STATUS.maintenance
  return (
    <Badge variant="outline" className={cn('border-0 ring-1', s.badge, className)}>
      {s.label}
    </Badge>
  )
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const s = BOOKING_STATUS[status]
  return (
    <Badge variant="outline" className={cn('border-0', s?.badge)}>
      {s?.label ?? status}
    </Badge>
  )
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const paid = status === 'paid'
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-0',
        paid
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
      )}
    >
      {paid ? 'ชำระแล้ว' : 'รอชำระ'}
    </Badge>
  )
}

/** การ์ดชวนอัปเกรดเมื่อฟีเจอร์ไม่อยู่ในแพ็กเกจ */
export function UpsellCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="relative overflow-hidden border-primary/20">
      <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-brand opacity-15 blur-3xl" />
      <EmptyState
        icon={Lock}
        title={title}
        description={description}
        action={
          <Button asChild className="bg-brand text-white">
            <Link to="/settings?tab=package">
              <Sparkles /> ดูแพ็กเกจที่รองรับ
            </Link>
          </Button>
        }
      />
    </Card>
  )
}

export function UpsellHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        {children}{' '}
        <Link to="/settings?tab=package" className="font-medium text-primary hover:underline">
          อัปเกรดแพ็กเกจ
        </Link>
      </div>
    </div>
  )
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img src="/icon.svg" alt="" className="size-9 rounded-xl shadow-md shadow-indigo-500/30" />
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">Estate</div>
        {subtitle && <div className="text-xs opacity-70">บริหารห้องเช่าครบวงจร</div>}
      </div>
    </div>
  )
}

export function FullScreenLoader() {
  return (
    <div className="grid min-h-svh place-items-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <img src="/icon.svg" alt="" className="size-12 animate-pulse rounded-2xl" />
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      </div>
    </div>
  )
}
