import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2, Mail, Phone, Send } from 'lucide-react'
import { api, ApiError, type ContactInput, type PublicSite } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Form = Omit<ContactInput, 'units' | 'consent'> & { units: string }
const EMPTY: Form = { name: '', phone: '', email: '', business: '', units: '', message: '', website: '' }

const digits = (s: string) => s.replace(/\D/g, '').length

/** ตรวจแบบเดียวกับเซิร์ฟเวอร์ — แจ้งก่อนส่งเพื่อไม่ต้องรอคำตอบ */
function validate(f: Form, consent: boolean): string | null {
  if (!f.name.trim()) return 'กรุณาระบุชื่อ'
  if (digits(f.phone) < 9 && !f.email.includes('@')) return 'กรุณาระบุเบอร์โทรหรืออีเมลอย่างน้อยหนึ่งช่อง'
  if (!consent) return 'กรุณายินยอมให้ติดต่อกลับตามนโยบายความเป็นส่วนตัว'
  return null
}

export function ContactSection({ site }: { site: PublicSite | undefined }) {
  const company = site?.company
  return (
    <section id="contact" aria-labelledby="contact-title" className="scroll-mt-20 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <div>
          <h2 id="contact-title" className="text-2xl sm:text-3xl">
            คุยกับทีมงาน
          </h2>
          <p className="mt-3 text-muted-foreground">
            อยากดูระบบกับข้อมูลจริงของหอคุณ ต้องการให้ช่วยย้ายข้อมูลจาก Excel หรือมีหลายโครงการและอยากได้ราคาที่เหมาะ
            กรอกแบบฟอร์มนี้ ทีมงานจะติดต่อกลับในวันและเวลาทำการ
          </p>
          {(company?.phone || company?.email) && (
            <ul className="mt-8 space-y-3 text-sm">
              {company.phone && (
                <li>
                  <a
                    href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}
                    className="inline-flex items-center gap-2.5 hover:text-primary"
                  >
                    <Phone className="size-4 text-muted-foreground" /> {company.phone}
                  </a>
                </li>
              )}
              {company.email && (
                <li>
                  <a href={`mailto:${company.email}`} className="inline-flex items-center gap-2.5 break-all hover:text-primary">
                    <Mail className="size-4 shrink-0 text-muted-foreground" /> {company.email}
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>
        <ContactForm />
      </div>
    </section>
  )
}

function ContactForm() {
  const id = useId()
  const [form, setForm] = useState<Form>(EMPTY)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const send = useMutation({
    mutationFn: () => {
      const units = Number(form.units)
      return api.contact({
        ...form,
        units: Number.isFinite(units) && units > 0 ? Math.round(units) : null,
        consent,
      })
    },
    meta: { silent: true },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ส่งไม่สำเร็จ กรุณาลองใหม่'),
  })

  if (send.isSuccess) {
    const via = form.phone.trim() ? `โทรศัพท์ ${form.phone.trim()}` : `อีเมล ${form.email.trim()}`
    return (
      <div role="status" className="flex flex-col items-start gap-4 rounded-lg border bg-card p-6 sm:p-8">
        <CheckCircle2 className="size-8 text-success" aria-hidden />
        <div>
          <p className="text-lg font-semibold">ได้รับข้อมูลแล้ว</p>
          <p className="mt-1 text-muted-foreground">
            ทีมงานจะติดต่อกลับทาง{via} ระหว่างนี้สมัครใช้งานและลองระบบด้วยแพ็กเกจเริ่มต้นได้
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/register">สมัครใช้งาน</Link>
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setForm(EMPTY)
              setConsent(false)
              send.reset()
            }}
          >
            ส่งข้อความอื่น
          </Button>
        </div>
      </div>
    )
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate(form, consent)
    setError(err)
    if (!err) send.mutate()
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2 sm:p-8">
      <FormField label="ชื่อผู้ติดต่อ" htmlFor={`${id}-name`} required className="sm:col-span-2">
        <Input id={`${id}-name`} autoComplete="name" value={form.name} onChange={set('name')} maxLength={120} />
      </FormField>
      <FormField label="เบอร์โทร" htmlFor={`${id}-phone`}>
        <Input
          id={`${id}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={set('phone')}
          maxLength={30}
        />
      </FormField>
      <FormField label="อีเมล" htmlFor={`${id}-email`}>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          maxLength={200}
        />
      </FormField>
      <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">ใส่เบอร์โทรหรืออีเมลอย่างน้อยหนึ่งช่อง</p>
      <FormField label="ชื่อหอพัก / กิจการ" htmlFor={`${id}-business`}>
        <Input
          id={`${id}-business`}
          autoComplete="organization"
          value={form.business}
          onChange={set('business')}
          maxLength={200}
        />
      </FormField>
      <FormField label="จำนวนห้องโดยประมาณ" htmlFor={`${id}-units`}>
        <Input
          id={`${id}-units`}
          type="number"
          inputMode="numeric"
          min={1}
          max={100000}
          value={form.units}
          onChange={set('units')}
        />
      </FormField>
      <FormField label="อยากให้ช่วยเรื่องอะไร" htmlFor={`${id}-message`} className="sm:col-span-2">
        <Textarea
          id={`${id}-message`}
          rows={4}
          value={form.message}
          onChange={set('message')}
          maxLength={2000}
          placeholder="เช่น มี 2 ตึก 80 ห้อง ใช้ Excel ออกบิลอยู่ อยากให้ผู้เช่าจ่ายผ่าน QR"
        />
      </FormField>
      {/* ช่องดักบอท — ผู้ใช้จริงมองไม่เห็นและไม่ได้กรอก */}
      <div className="sr-only" aria-hidden>
        <label htmlFor={`${id}-website`}>เว็บไซต์</label>
        <input
          id={`${id}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={set('website')}
        />
      </div>
      <div className="flex items-start gap-2.5 sm:col-span-2">
        <Checkbox
          id={`${id}-consent`}
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor={`${id}-consent`} className="text-sm leading-relaxed font-normal text-muted-foreground">
          <span>
            ยินยอมให้ติดต่อกลับเกี่ยวกับบริการ Estate ตาม
            <Link to="/privacy" target="_blank" className="mx-1 font-medium text-primary hover:underline">
              นโยบายความเป็นส่วนตัว
            </Link>
          </span>
        </Label>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive sm:col-span-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={send.isPending} className="w-full sm:w-auto">
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} ส่งข้อมูล
        </Button>
      </div>
    </form>
  )
}

function FormField({
  label,
  htmlFor,
  required,
  className,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  )
}
