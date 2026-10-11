import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/common'

const FEATURES = [
  'โครงการ ห้องพัก การจอง และเงินมัดจำ ในที่เดียว',
  'จดมิเตอร์ ออกใบแจ้งหนี้ และรับชำระผ่าน PromptPay',
  'ใบเสร็จรับเงิน / ใบกำกับภาษี พร้อมพิมพ์ A4',
  'พอร์ทัลผู้เช่า แจ้งซ่อม และรายงานค้างชำระ',
]

const YEAR = new Date().getFullYear()

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1fr]">
      <aside className="hidden flex-col bg-sidebar p-12 text-sidebar-accent-foreground lg:flex">
        <Logo markClassName="bg-sidebar-mark text-sidebar-mark-foreground" />
        <div className="mt-auto max-w-md">
          <h2 className="text-3xl leading-snug font-semibold tracking-tight">
            ระบบบริหารห้องเช่า
            <br />
            ที่บัญชีตรวจสอบได้
          </h2>
          <p className="mt-4 text-[15px] text-sidebar-foreground">
            สำหรับเจ้าของหอพัก อพาร์ทเมนต์ และบ้านเช่า ที่ต้องการเอกสารถูกต้องและงานประจำที่เป็นระเบียบ
          </p>
          <ul className="mt-10 space-y-3 border-t border-sidebar-border pt-8">
            {FEATURES.map((f) => (
              <li key={f} className="flex gap-3 text-sm text-sidebar-muted">
                <span className="mt-2 h-px w-4 shrink-0 bg-sidebar-primary" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-16 text-xs text-sidebar-muted">© {YEAR} Estate</p>
      </aside>
      <main className="flex flex-col items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
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
