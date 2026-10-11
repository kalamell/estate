import type { ReactNode } from 'react'
import { Box, Gauge, MapPinned, ReceiptText } from 'lucide-react'
import { Logo } from '@/components/common'

const FEATURES = [
  { icon: MapPinned, title: 'โครงการบนแผนที่', text: 'หอพัก อพาร์ทเมนต์ คอนโด บ้านเช่า และ Airbnb ในที่เดียว' },
  { icon: Box, title: 'ผังห้องแบบ 3D', text: 'เห็นสถานะทุกห้องทั้งอาคาร คลิกเพื่อจัดการได้ทันที' },
  { icon: Gauge, title: 'จดมิเตอร์ด้วยกล้อง', text: 'ถ่ายรูปหน้าปัด ระบบอ่านตัวเลขให้อัตโนมัติ' },
  { icon: ReceiptText, title: 'ออกบิล + PromptPay', text: 'คำนวณค่าเช่า ค่าน้ำ ค่าไฟ พร้อม QR รับชำระ' },
]

const YEAR = new Date().getFullYear()

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-indigo-600/40 blur-3xl" />
          <div className="absolute -right-24 bottom-[-10rem] size-[30rem] rounded-full bg-violet-600/35 blur-3xl" />
          <svg className="absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0V32" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        <Logo className="relative" />
        <div className="relative mt-auto max-w-lg">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">
            บริหารห้องเช่า
            <br />
            <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
              ง่าย ครบ จบในที่เดียว
            </span>
          </h2>
          <p className="mt-4 text-slate-300">
            ตั้งแต่จองห้อง เก็บมัดจำ จดมิเตอร์ ไปจนถึงออกบิลและรับชำระ สำหรับเจ้าของและทีมงานทุกขนาด
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <f.icon className="size-5 text-indigo-200" />
                </div>
                <div>
                  <div className="text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-slate-400">{f.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative mt-12 text-xs text-slate-500">© {YEAR} Estate</p>
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
