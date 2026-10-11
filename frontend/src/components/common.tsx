import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Lock, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { BOOKING_STATUS, TONE, UNIT_STATUS, type Tone } from '@/lib/format'
import type { BookingStatus, Invoice, UnitStatus } from '@/lib/api'

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
      <div className="grid size-11 place-items-center rounded-md border bg-muted text-muted-foreground">
        <Icon className="size-5" />
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
  tone?: 'default' | 'success' | 'danger' | 'warning' | 'brand'
  children?: ReactNode
  className?: string
}) {
  const toneCls = {
    default: '',
    success: 'text-success',
    danger: 'text-destructive',
    warning: 'text-warning-foreground',
    brand: 'text-primary',
  }[tone]
  return (
    <Card className={cn('gap-0 py-4', compact ? 'px-3 sm:px-5' : 'px-5', className)}>
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        {Icon && <Icon className="size-4" />}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'mt-1.5 font-semibold tracking-tight tabular-nums',
          compact ? 'text-base sm:text-xl' : 'text-xl sm:text-2xl',
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
    <Badge variant="outline" className={cn(s.badge, className)}>
      {s.label}
    </Badge>
  )
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const s = BOOKING_STATUS[status]
  return (
    <Badge variant="outline" className={cn(s?.badge)}>
      {s?.label ?? status}
    </Badge>
  )
}

export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn(TONE[tone], className)}>
      {children}
    </Badge>
  )
}

/** สถานะใบแจ้งหนี้ — เกินกำหนดแสดงเป็นสีมัสตาร์ด */
export function InvoiceStatusBadge({
  status,
  overdueDays = 0,
}: {
  status: Invoice['status'] | string
  overdueDays?: number
}) {
  if (status === 'paid') return <ToneBadge tone="green">ชำระแล้ว</ToneBadge>
  if (status === 'void') return <ToneBadge tone="grey">ยกเลิก</ToneBadge>
  if (overdueDays > 0) return <ToneBadge tone="mustard">เกินกำหนด {overdueDays} วัน</ToneBadge>
  return <ToneBadge tone="ink">รอชำระ</ToneBadge>
}

/** หน้าที่จำกัดเฉพาะเจ้าของ/ผู้ดูแลองค์กร */
export function AdminOnlyState() {
  return (
    <Card>
      <EmptyState icon={Lock} title="เฉพาะเจ้าของหรือผู้ดูแลองค์กร" description="ขอให้ผู้ดูแลองค์กรเปิดดูหน้านี้" />
    </Card>
  )
}

/** การ์ดชวนอัปเกรดเมื่อฟีเจอร์ไม่อยู่ในแพ็กเกจ */
export function UpsellCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <EmptyState
        icon={Lock}
        title={title}
        description={description}
        action={
          <Button asChild variant="outline">
            <Link to="/billing">
              ดูแพ็กเกจที่รองรับ <ArrowRight />
            </Link>
          </Button>
        }
      />
    </Card>
  )
}

export function UpsellHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/50 p-3 text-xs text-muted-foreground">
      <Lock className="mt-0.5 size-3.5 shrink-0" />
      <div>
        {children}{' '}
        <Link to="/billing" className="font-medium text-primary hover:underline">
          อัปเกรดแพ็กเกจ
        </Link>
      </div>
    </div>
  )
}

/** โลโก้ monogram สี่เหลี่ยมสีเขียว */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-md bg-primary text-[15px] leading-none font-bold text-primary-foreground',
        className,
      )}
    >
      E
    </span>
  )
}

export function Logo({
  className,
  subtitle = true,
  markClassName,
}: {
  className?: string
  subtitle?: boolean
  markClassName?: string
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LogoMark className={markClassName} />
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">Estate</div>
        {subtitle && <div className="text-xs opacity-70">บริหารห้องเช่าครบวงจร</div>}
      </div>
    </div>
  )
}

/** หัวข้อส่วนของหน้า */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <h2 className="text-base font-semibold">{children}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}

export function FullScreenLoader() {
  return (
    <div className="grid min-h-svh place-items-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-10 animate-pulse text-lg" />
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      </div>
    </div>
  )
}
