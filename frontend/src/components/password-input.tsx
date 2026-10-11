import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/** ช่องรหัสผ่านพร้อมปุ่มแสดง/ซ่อน */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className={cn('pr-10', className)} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        aria-pressed={show}
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/** คะแนนความแข็งแรงของรหัสผ่าน 0–4 (0 = สั้นกว่า 8 ตัว) */
function passwordScore(pw: string): number {
  if (pw.length < 8) return 0
  let s = 1
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  else if (/\d/.test(pw) && /[A-Za-z]/.test(pw) && pw.length >= 10) s++
  return Math.min(s, 4)
}

const LEVELS = [
  { label: 'อย่างน้อย 8 ตัวอักษร', cls: 'bg-destructive', text: 'text-destructive' },
  { label: 'พอใช้', cls: 'bg-warning', text: 'text-warning-foreground' },
  { label: 'ปานกลาง', cls: 'bg-warning', text: 'text-warning-foreground' },
  { label: 'ดี', cls: 'bg-success', text: 'text-success' },
  { label: 'แข็งแรง', cls: 'bg-success', text: 'text-success' },
]

/** แถบบอกความแข็งแรง + คำแนะนำสั้น ๆ */
export function PasswordStrength({ value, id }: { value: string; id?: string }) {
  const score = passwordScore(value)
  const level = LEVELS[score]
  return (
    <div id={id} className="grid gap-1.5" aria-live="polite">
      <div className="grid grid-cols-4 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn('h-1 rounded-full bg-muted transition-colors', value && score >= i && level.cls, value && score === 0 && i === 1 && 'bg-destructive')}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value ? (
          <>
            <span className={cn('font-medium', level.text)}>{score === 0 ? 'สั้นเกินไป' : level.label}</span>
            {score < 3 && ' · ยาว 12 ตัวขึ้นไป ผสมตัวพิมพ์ใหญ่ ตัวเลข หรือสัญลักษณ์จะปลอดภัยกว่า'}
          </>
        ) : (
          'อย่างน้อย 8 ตัวอักษร'
        )}
      </p>
    </div>
  )
}
