// โลโก้ Estate และหน้าโหลดเต็มจอ — แยกจาก common.tsx ให้หน้าแรก (landing) และ App ใช้ได้โดยไม่ดึงโค้ดของแอป
import { cn } from '@/lib/utils'

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
