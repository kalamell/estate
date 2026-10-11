// ภาพตัวอย่างหน้าจอในส่วนหัวของหน้าแนะนำระบบ — วาดด้วย HTML/CSS จากโทนสีของธีม (ไม่ใช้รูปภาพ)
// ตัวเลขในตัวอย่างคำนวณให้ตรงกัน: A-203 ค่าเช่า 3,500 + ไฟ 112 หน่วย × 7 = 784 + น้ำ 21 หน่วย × 18 = 378 → 4,662
import { QrCode } from 'lucide-react'
import { TONE, type Tone } from '@/lib/format'
import { cn } from '@/lib/utils'

const ROWS: { unit: string; tenant: string; amount: string; status: string; tone: Tone }[] = [
  { unit: 'A-101', tenant: 'มานพ ศรีสุข', amount: '4,870', status: 'ชำระแล้ว', tone: 'green' },
  { unit: 'A-102', tenant: 'ศิริพร แก้วดี', amount: '5,120', status: 'ชำระแล้ว', tone: 'green' },
  { unit: 'A-203', tenant: 'ธนา บุญมา', amount: '4,662', status: 'รอชำระ', tone: 'ink' },
  { unit: 'B-104', tenant: 'Laura Weber', amount: '6,300', status: 'เกินกำหนด 3 วัน', tone: 'mustard' },
  { unit: 'B-205', tenant: 'วิภา จันทร์เพ็ญ', amount: '4,980', status: 'รอตรวจสลิป', tone: 'grey' },
]

export function ProductPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-xl sm:pb-[14.5rem] lg:max-w-none">
      <div aria-hidden className="overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* แถบหัวหน้าจอ */}
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
          <span className="grid size-5 place-items-center rounded-sm bg-primary text-[10px] font-bold text-primary-foreground">
            E
          </span>
          <span className="text-xs font-medium">บิล & เอกสาร</span>
          <span className="ml-auto text-xs text-muted-foreground">รอบบิล ต.ค. 2569</span>
        </div>
        {/* ตัวเลขสรุป */}
        <div className="grid grid-cols-3 divide-x border-b text-center">
          {[
            { label: 'ออกบิลแล้ว', value: '48 ห้อง' },
            { label: 'รับชำระแล้ว', value: '฿182,450' },
            { label: 'ค้างชำระ', value: '3 ห้อง', warn: true },
          ].map((s) => (
            <div key={s.label} className="px-2 py-3">
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
              <div className={cn('mt-0.5 text-sm font-semibold tabular-nums sm:text-base', s.warn && 'text-warning-foreground')}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
        {/* รายการบิล */}
        <ul className="divide-y text-[13px]">
          {ROWS.map((r) => (
            <li key={r.unit} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-12 shrink-0 font-medium tabular-nums">{r.unit}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.tenant}</span>
              <span className="shrink-0 tabular-nums">฿{r.amount}</span>
              <span
                className={cn(
                  'hidden w-28 shrink-0 justify-center rounded-sm px-1.5 py-0.5 text-center text-[11px] font-medium sm:inline-flex',
                  TONE[r.tone],
                )}
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ข้อความ LINE ที่ผู้เช่าได้รับ */}
      <div
        aria-hidden
        className="relative mx-auto mt-3 w-[88%] max-w-xs rounded-lg border bg-card p-3 shadow-md sm:absolute sm:right-6 sm:bottom-0 sm:mx-0 sm:mt-0 sm:w-64"
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-sm bg-[#06C755] px-1 font-semibold text-white">LINE</span>
          หอพักสุขใจ
        </div>
        <div className="rounded-md bg-muted/70 p-2.5 text-[12px] leading-relaxed">
          <div className="font-medium">บิลค่าเช่า ต.ค. 2569 · ห้อง A-203</div>
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-muted-foreground tabular-nums">
            <span>ค่าเช่า</span>
            <span>3,500</span>
            <span>ค่าไฟ 112 หน่วย</span>
            <span>784</span>
            <span>ค่าน้ำ 21 หน่วย</span>
            <span>378</span>
          </div>
          <div className="mt-1.5 flex justify-between border-t pt-1.5 font-semibold tabular-nums">
            <span>ยอดชำระ</span>
            <span>฿4,662</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">ชำระภายใน 5 พ.ย. 2569</div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 rounded-md border py-1.5 text-[12px] font-medium text-primary">
          <QrCode className="size-3.5" /> ดูบิล / สแกนจ่าย
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs text-muted-foreground sm:absolute sm:bottom-24 sm:left-1 sm:mt-0 sm:w-[38%] sm:text-left">
        ตัวอย่างหน้าจอ: รายการบิลประจำเดือนในระบบ และบิลที่ผู้เช่าได้รับทาง LINE
      </figcaption>
    </figure>
  )
}
