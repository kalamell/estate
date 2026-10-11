import type { ReactNode } from 'react'
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
      <aside className="hidden flex-col bg-[#1c1b19] p-12 text-[#faf9f6] lg:flex">
        <Logo />
        <div className="mt-auto max-w-md">
          <h2 className="text-3xl leading-snug font-semibold tracking-tight">
            ระบบบริหารห้องเช่า
            <br />
            ที่บัญชีตรวจสอบได้
          </h2>
          <p className="mt-4 text-[15px] text-[#d9d5cc]">
            สำหรับเจ้าของหอพัก อพาร์ทเมนต์ และบ้านเช่า ที่ต้องการเอกสารถูกต้องและงานประจำที่เป็นระเบียบ
          </p>
          <ul className="mt-10 space-y-3 border-t border-[#2e2c28] pt-8">
            {FEATURES.map((f) => (
              <li key={f} className="flex gap-3 text-sm text-[#8c877d]">
                <span className="mt-2 h-px w-4 shrink-0 bg-[#8fb59b]" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-16 text-xs text-[#8c877d]">© {YEAR} Estate</p>
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
