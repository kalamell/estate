import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/common'

// สิ่งที่ระบบทำจริง — เขียนเป็นข้อเท็จจริงสั้นๆ ไม่ใช่สโลแกน
const FACTS = [
  'จดมิเตอร์น้ำไฟ แล้วออกบิลค่าเช่าทั้งโครงการได้ในรอบเดียว',
  'บิลมี QR พร้อมเพย์ ผู้เช่าส่งสลิปและแจ้งซ่อมผ่าน LINE ได้',
  'ใบเสร็จและใบกำกับภาษีเลขที่เรียงต่อเนื่อง ไม่ข้ามเลข พิมพ์ขนาด A4',
  'ห้องรายวันซิงก์ปฏิทินกับ Airbnb, Booking.com และ Agoda',
]

const YEAR = new Date().getFullYear()

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1fr]">
      <aside className="hidden flex-col bg-sidebar p-12 text-sidebar-accent-foreground lg:flex">
        <Logo subtitle={false} markClassName="bg-sidebar-mark text-sidebar-mark-foreground" />
        <div className="mt-auto max-w-md">
          <h2 className="text-3xl leading-snug font-semibold tracking-tight">
            ระบบงานหลังบ้าน
            <br />
            สำหรับหอพักและห้องเช่า
          </h2>
          <p className="mt-4 text-[15px] text-sidebar-foreground">
            ใช้กับหอพัก อพาร์ทเมนต์ คอนโดปล่อยเช่า บ้านเช่า และห้องพักรายวัน
          </p>
          <ul className="mt-10 space-y-3 border-t border-sidebar-border pt-8">
            {FACTS.map((f) => (
              <li key={f} className="flex gap-3 text-sm text-sidebar-muted">
                <span className="mt-2 h-px w-4 shrink-0 bg-sidebar-primary" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-16 text-xs text-sidebar-muted">© {YEAR} Estate</p>
      </aside>
      <main className="relative flex flex-col items-center justify-center bg-background px-4 pt-16 pb-10 sm:px-8">
        <Link
          to="/"
          className="absolute top-5 left-4 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:left-8"
        >
          <ArrowLeft className="size-3.5" /> กลับหน้าแรก
        </Link>
        <div className="w-full max-w-sm">
          <Logo subtitle={false} className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}

/** กล่องแจ้งผลบนหน้า auth (ส่งลิงก์แล้ว / ลิงก์หมดอายุ / ยืนยันสำเร็จ) */
export function AuthNotice({
  icon: Icon,
  tone = 'info',
  title,
  children,
}: {
  icon: LucideIcon
  tone?: 'info' | 'success' | 'error'
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border p-4 text-sm',
        tone === 'info' && 'bg-card',
        tone === 'success' && 'border-success/25 bg-success/[0.06]',
        tone === 'error' && 'border-destructive/25 bg-destructive/[0.04]',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-5 shrink-0',
          tone === 'info' && 'text-primary',
          tone === 'success' && 'text-success',
          tone === 'error' && 'text-destructive',
        )}
      />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{title}</p>
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  )
}
