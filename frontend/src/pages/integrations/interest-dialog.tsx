// ฟอร์มแจ้งความสนใจบริการที่ยังไม่รองรับ (Channel Manager / Payment Gateway)
// ส่งเข้า POST /api/public/contact เหมือนฟอร์มบนหน้าแนะนำระบบ → ไปอยู่ใน "ผู้สนใจ" ของ Super Admin
import { useId, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/common'

export interface InterestTopic {
  /** หัวข้อ เช่น "Channel Manager" */
  title: string
  /** ขึ้นต้นข้อความที่ส่ง เช่น "สนใจเชื่อม Channel Manager" */
  prefix: string
  description: string
  /** ผู้ให้บริการให้เลือก (ตัวสุดท้ายคือ "อื่น ๆ / ยังไม่แน่ใจ") */
  options: string[]
}

export function InterestDialog({ topic, onClose }: { topic: InterestTopic | null; onClose: () => void }) {
  return (
    <Dialog open={!!topic} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {topic && <InterestForm key={topic.title} topic={topic} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function InterestForm({ topic, onClose }: { topic: InterestTopic; onClose: () => void }) {
  const id = useId()
  const { user, org, orgInfo } = useSession()
  const [choice, setChoice] = useState(topic.options[0])
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(orgInfo?.org.phone ?? '')
  const [note, setNote] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: () =>
      api.contact({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        business: org?.name ?? '',
        units: orgInfo?.usage.units || null,
        message: [`${topic.prefix}: ${choice}`, org ? `องค์กร: ${org.name} (#${org.id})` : '', note.trim()]
          .filter(Boolean)
          .join('\n'),
        consent,
        website: '',
      }),
    meta: { silent: true },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ส่งไม่สำเร็จ กรุณาลองใหม่'),
  })

  if (send.isSuccess)
    return (
      <div className="grid gap-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" /> ได้รับข้อมูลแล้ว
          </DialogTitle>
          <DialogDescription>
            ทีมงานจะติดต่อกลับเมื่อเปิดให้เชื่อม {topic.title} หรือเมื่อต้องการข้อมูลเพิ่มเพื่อเตรียมการเชื่อมต่อ
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>ปิด</Button>
        </DialogFooter>
      </div>
    )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    let err: string | null = null
    if (!name.trim()) err = 'กรุณาระบุชื่อ'
    else if (phone.replace(/\D/g, '').length < 9 && !email.includes('@'))
      err = 'กรุณาระบุเบอร์โทรหรืออีเมลอย่างน้อยหนึ่งช่อง'
    else if (!consent) err = 'กรุณายินยอมให้ติดต่อกลับตามนโยบายความเป็นส่วนตัว'
    setError(err)
    if (!err) send.mutate()
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>แจ้งความสนใจ {topic.title}</DialogTitle>
        <DialogDescription>{topic.description}</DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">ใช้อยู่หรือสนใจเจ้าไหน</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {topic.options.map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={choice === o}
              onClick={() => setChoice(o)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                choice === o ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
              )}
            >
              {o}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ชื่อผู้ติดต่อ" htmlFor={`${id}-name`} className="sm:col-span-2">
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field label="เบอร์โทร" htmlFor={`${id}-phone`}>
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
          />
        </Field>
        <Field label="อีเมล" htmlFor={`${id}-email`}>
          <Input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        </Field>
        <Field label="รายละเอียดเพิ่มเติม (ถ้ามี)" htmlFor={`${id}-note`} className="sm:col-span-2">
          <Textarea
            id={`${id}-note`}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1500}
            placeholder="เช่น มีห้องบน Airbnb 12 ห้อง และ Booking.com 8 ห้อง"
          />
        </Field>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox id={`${id}-consent`} checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
        <Label htmlFor={`${id}-consent`} className="text-sm leading-relaxed font-normal text-muted-foreground">
          <span>
            ยินยอมให้ผู้ให้บริการ Estate ติดต่อกลับเรื่องนี้ตาม
            <a href="/privacy" target="_blank" rel="noreferrer" className="mx-1 font-medium text-primary hover:underline">
              นโยบายความเป็นส่วนตัว
            </a>
          </span>
        </Label>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={send.isPending}>
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} ส่งความสนใจ
        </Button>
      </DialogFooter>
    </form>
  )
}
