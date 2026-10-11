import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, Loader2, PlaneLanding } from 'lucide-react'
import { api, type Gender, type Tenant, type TenantInput } from '@/lib/api'
import type { Lang } from '@/lib/i18n'
import { GENDERS, VISA_TYPES, isForeign } from '@/lib/countries'
import { invalidate } from '@/lib/query'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/common'
import { CountryPicker } from '@/components/country-picker'
import { cn } from '@/lib/utils'

type FormState = Required<
  Pick<TenantInput, 'full_name' | 'phone' | 'email' | 'id_card' | 'note' | 'tax_id' | 'address' | 'branch_code'>
> & { id?: number }

/** ข้อมูลคนต่างชาติ (ใช้แจ้ง ตม.30) */
interface Foreign {
  nationality: string
  gender: Gender
  birth_date: string
  arrival_date: string
  visa_type: string
  visa_expiry: string
}

const foreignOf = (t?: Tenant | null): Foreign => ({
  nationality: isForeign(t?.nationality) ? (t?.nationality ?? '').toUpperCase() : '',
  gender: (t?.gender ?? '') as Gender,
  birth_date: t?.birth_date?.slice(0, 10) ?? '',
  arrival_date: t?.arrival_date?.slice(0, 10) ?? '',
  visa_type: t?.visa_type ?? '',
  visa_expiry: t?.visa_expiry?.slice(0, 10) ?? '',
})

const EMPTY: FormState = {
  full_name: '',
  phone: '',
  email: '',
  id_card: '',
  note: '',
  tax_id: '',
  address: '',
  branch_code: '',
}

const toInput = (t: Tenant): FormState => ({
  id: t.id,
  full_name: t.full_name,
  phone: t.phone ?? '',
  email: t.email ?? '',
  id_card: t.id_card ?? '',
  note: t.note ?? '',
  tax_id: t.tax_id ?? '',
  address: t.address ?? '',
  branch_code: t.branch_code ?? '',
})

function TenantForm({
  onOpenChange,
  tenant,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  tenant?: Tenant | null
  onSaved?: (t: Tenant) => void
}) {
  const [form, setForm] = useState<FormState>(() => (tenant ? toInput(tenant) : EMPTY))
  const [showTax, setShowTax] = useState(() => !!(tenant?.tax_id || tenant?.address || tenant?.branch_code))
  const wasForeign = isForeign(tenant?.nationality)
  const [foreign, setForeign] = useState(wasForeign)
  const [fx, setFx] = useState<Foreign>(() => foreignOf(tenant))
  const setF = <K extends keyof Foreign>(k: K, v: Foreign[K]) => setFx((f) => ({ ...f, [k]: v }))
  // ภาษาที่ใช้ติดต่อ — ผู้เช่าใหม่ชาวต่างชาติเริ่มที่ภาษาอังกฤษ (จนกว่าจะเลือกเอง)
  const [langPick, setLangPick] = useState<Lang | null>(tenant?.lang ?? null)
  const lang: Lang = langPick ?? (foreign ? 'en' : 'th')
  // PDPA: ถามความยินยอมเฉพาะเมื่อยังไม่มี
  const askConsent = !tenant?.consent_at
  const [consent, setConsent] = useState(false)
  const taxDigits = form.tax_id.replace(/\D/g, '')
  const taxInvalid = form.tax_id.trim() !== '' && taxDigits.length !== 13
  // เลขบัตรอาจถูกปิดบัง (•••1234) สำหรับผู้ใช้ที่ไม่ใช่ผู้ดูแล → ส่งเฉพาะเมื่อแก้ไขจริง
  const idCardChanged = !tenant || form.id_card !== (tenant.id_card ?? '')
  const idCardMasked = !!tenant?.id_card && tenant.id_card.includes('•')

  const save = useMutation({
    mutationFn: () => {
      const { id_card, ...rest } = form
      const body: TenantInput & { id?: number } = { ...rest, tax_id: taxDigits }
      if (idCardChanged) body.id_card = id_card
      if (askConsent) body.consent_obtained = consent
      body.lang = lang
      // ข้อมูลคนต่างชาติ: ส่งทั้งชุดเมื่อเป็นชาวต่างชาติ ('' = ล้างวันที่), ปิดสวิตช์ = กลับเป็นไทย
      if (foreign) Object.assign(body, { ...fx, visa_type: fx.visa_type.trim() })
      else if (wasForeign) body.nationality = ''
      return api.saveTenant(body)
    },
    onSuccess: async (t) => {
      toast.success('บันทึกผู้เช่าแล้ว')
      await invalidate('tenants')
      onSaved?.(t)
      onOpenChange(false)
    },
  })
  const set = (k: keyof Omit<FormState, 'id'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (taxInvalid) {
          setShowTax(true)
          return toast.error('เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก')
        }
        if (idCardChanged && form.id_card.includes('•')) return toast.error('กรุณาพิมพ์เลขบัตรประชาชนใหม่ทั้งหมด')
        if (foreign && !fx.nationality) return toast.error('กรุณาเลือกสัญชาติ')
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{form.id ? 'แก้ไขผู้เช่า' : 'เพิ่มผู้เช่า'}</DialogTitle>
        <DialogDescription>ข้อมูลติดต่อของผู้เช่าหรือแขกผู้เข้าพัก</DialogDescription>
      </DialogHeader>
      <Field label="ชื่อ-นามสกุล" htmlFor="t-name">
        <Input id="t-name" value={form.full_name} onChange={set('full_name')} required autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="เบอร์โทร" htmlFor="t-phone">
          <Input id="t-phone" value={form.phone} onChange={set('phone')} inputMode="tel" />
        </Field>
        <Field label="อีเมล" htmlFor="t-email">
          <Input id="t-email" type="email" value={form.email} onChange={set('email')} />
        </Field>
      </div>
      <Field
        label="เลขบัตรประชาชน / เลขหนังสือเดินทาง"
        htmlFor="t-id"
        hint={
          idCardMasked && !idCardChanged
            ? 'แสดงบางส่วนเพื่อคุ้มครองข้อมูล — พิมพ์ใหม่ทั้งหมดหากต้องการแก้ไข'
            : foreign
              ? 'ชาวต่างชาติใช้เลขหนังสือเดินทาง (ใช้แจ้ง ตม.30)'
              : undefined
        }
      >
        <Input
          id="t-id"
          value={form.id_card}
          onChange={set('id_card')}
          onFocus={(e) => {
            // ค่าที่ถูกปิดบังแก้ไขบางส่วนไม่ได้ → เลือกทั้งหมดให้พิมพ์ทับ
            if (idCardMasked && !idCardChanged) e.currentTarget.select()
          }}
        />
      </Field>
      <Field
        label="ภาษาที่ใช้ติดต่อ"
        htmlFor="t-lang"
        hint="ข้อความ LINE พอร์ทัลผู้เช่า และเอกสารที่ผู้เช่าเปิดดูจะใช้ภาษานี้ — ผู้เช่าเปลี่ยนเองได้ในพอร์ทัล"
      >
        <Select value={lang} onValueChange={(v) => setLangPick(v as Lang)}>
          <SelectTrigger id="t-lang" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="th">ไทย</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="rounded-md border">
        <label className="flex items-center gap-3 px-3 py-2.5">
          <Switch checked={foreign} onCheckedChange={setForeign} aria-describedby="t-foreign-hint" />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">ผู้เช่าชาวต่างชาติ</span>
            <span id="t-foreign-hint" className="text-xs text-muted-foreground">
              ข้อมูลสำหรับแจ้งที่พักคนต่างด้าว (ตม.30)
            </span>
          </span>
          <PlaneLanding className="ml-auto size-4 text-muted-foreground" />
        </label>
        {foreign && (
          <div className="grid gap-4 border-t p-3">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <Field label="สัญชาติ" htmlFor="t-nat">
                <CountryPicker
                  id="t-nat"
                  value={fx.nationality}
                  onChange={(v) => setF('nationality', v)}
                  invalid={!fx.nationality}
                />
              </Field>
              <Field label="เพศ" htmlFor="t-gender">
                <Select value={fx.gender || 'none'} onValueChange={(v) => setF('gender', (v === 'none' ? '' : v) as Gender)}>
                  <SelectTrigger id="t-gender" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g.v || 'none'} value={g.v || 'none'}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="วันเกิด" htmlFor="t-birth">
                <Input id="t-birth" type="date" value={fx.birth_date} onChange={(e) => setF('birth_date', e.target.value)} />
              </Field>
              <Field label="วันที่เดินทางเข้าประเทศ" htmlFor="t-arrival">
                <Input
                  id="t-arrival"
                  type="date"
                  value={fx.arrival_date}
                  onChange={(e) => setF('arrival_date', e.target.value)}
                />
              </Field>
              <Field label="ประเภทวีซ่า" htmlFor="t-visa">
                <Input
                  id="t-visa"
                  list="t-visa-types"
                  value={fx.visa_type}
                  onChange={(e) => setF('visa_type', e.target.value)}
                  placeholder="เช่น Non-B"
                />
                <datalist id="t-visa-types">
                  {VISA_TYPES.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </Field>
              <Field label="วีซ่าครบกำหนด" htmlFor="t-visa-exp">
                <Input
                  id="t-visa-exp"
                  type="date"
                  value={fx.visa_expiry}
                  onChange={(e) => setF('visa_expiry', e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
      </div>
      <div className="rounded-md border">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium"
          aria-expanded={showTax}
          onClick={() => setShowTax((v) => !v)}
        >
          สำหรับออกใบเสร็จ/ใบกำกับภาษีในนามนิติบุคคล
          <ChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', showTax && 'rotate-180')} />
        </button>
        {showTax && (
          <div className="grid gap-4 border-t p-3">
            <Field label="ที่อยู่ (ตามที่จะพิมพ์บนเอกสาร)" htmlFor="t-addr">
              <Textarea id="t-addr" rows={2} value={form.address} onChange={set('address')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field
                label="เลขประจำตัวผู้เสียภาษี"
                htmlFor="t-tax"
                hint={taxInvalid ? <span className="text-destructive">ต้องเป็นตัวเลข 13 หลัก</span> : undefined}
              >
                <Input
                  id="t-tax"
                  inputMode="numeric"
                  value={form.tax_id}
                  onChange={set('tax_id')}
                  aria-invalid={taxInvalid || undefined}
                  className="tabular-nums"
                />
              </Field>
              <Field label="สาขา" htmlFor="t-branch" hint="00000 = สนญ.">
                <Input
                  id="t-branch"
                  inputMode="numeric"
                  maxLength={5}
                  value={form.branch_code}
                  onChange={set('branch_code')}
                  placeholder="00000"
                  className="tabular-nums"
                />
              </Field>
            </div>
          </div>
        )}
      </div>
      <Field label="หมายเหตุ" htmlFor="t-note">
        <Textarea id="t-note" rows={2} value={form.note} onChange={set('note')} />
      </Field>
      {askConsent && (
        <label className="flex items-start gap-3 rounded-md border bg-muted/30 p-3 text-sm">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            className="mt-0.5"
            aria-describedby="t-consent-hint"
          />
          <span className="grid gap-0.5">
            <span className="font-medium">ได้รับความยินยอมจากผู้เช่าแล้ว</span>
            <span id="t-consent-hint" className="text-xs text-muted-foreground">
              ผู้เช่ารับทราบประกาศความเป็นส่วนตัวและยินยอมให้เก็บข้อมูลเพื่อการเช่า (เช่น ลงนามในสัญญา)
              — หากยังไม่ได้รับ ผู้เช่าจะถูกขอความยินยอมเมื่อเปิดพอร์ทัลครั้งแรก
            </span>
          </span>
        </label>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          บันทึก
        </Button>
      </DialogFooter>
    </form>
  )
}

export function TenantDialog(props: React.ComponentProps<typeof TenantForm>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <TenantForm {...props} />
      </DialogContent>
    </Dialog>
  )
}
