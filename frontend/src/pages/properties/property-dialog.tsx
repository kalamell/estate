import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Crosshair, ExternalLink, Globe, Loader2 } from 'lucide-react'
import { api, type LateFeeType, type Property, type PropertyInput, type PropertyKind } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { KINDS } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, UpsellHint } from '@/components/common'
import { CopyField } from '@/components/copy-field'
import { QrSvg } from '@/components/qr'
import { LeafletMap } from '@/components/leaflet-map'

type Form = Omit<
  PropertyInput,
  | 'lat'
  | 'lng'
  | 'electric_rate'
  | 'water_rate'
  | 'late_fee_amount'
  | 'late_fee_grace_days'
  | 'booking_enabled'
  | 'booking_slug'
  | 'booking_intro'
  | 'check_in_time'
  | 'check_out_time'
  | 'min_nights'
  | 'deposit_percent'
> & {
  booking_enabled: boolean
  booking_slug: string
  booking_intro: string
  check_in_time: string
  check_out_time: string
  min_nights: string
  deposit_percent: string
  id?: number
  lat: string
  lng: string
  electric_rate: string
  water_rate: string
  late_fee_amount: string
  late_fee_grace_days: string
}

const LATE_FEE_TYPES: Record<LateFeeType, string> = {
  none: 'ไม่คิดค่าปรับ',
  flat: 'เหมาจ่ายครั้งเดียว',
  per_day: 'คิดรายวัน',
}

const EMPTY: Form = {
  name: '',
  kind: 'dormitory',
  address: '',
  lat: '',
  lng: '',
  electric_rate: '8',
  water_rate: '18',
  promptpay_id: '',
  late_fee_type: 'none',
  late_fee_amount: '0',
  late_fee_grace_days: '0',
  booking_enabled: false,
  booking_slug: '',
  booking_intro: '',
  check_in_time: '14:00',
  check_out_time: '12:00',
  min_nights: '1',
  deposit_percent: '30',
}

const SLUG_RE = /^[a-z0-9-]{3,40}$/
const stayUrl = (slug: string) => `${window.location.origin}/stay/${slug}`

const toForm = (p: Property): Form => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  address: p.address,
  lat: p.lat == null ? '' : String(p.lat),
  lng: p.lng == null ? '' : String(p.lng),
  electric_rate: String(p.electric_rate),
  water_rate: String(p.water_rate),
  promptpay_id: p.promptpay_id ?? '',
  late_fee_type: p.late_fee_type ?? 'none',
  late_fee_amount: String(p.late_fee_amount ?? 0),
  late_fee_grace_days: String(p.late_fee_grace_days ?? 0),
  booking_enabled: !!p.booking_enabled,
  booking_slug: p.booking_slug ?? '',
  booking_intro: p.booking_intro ?? '',
  check_in_time: p.check_in_time || '14:00',
  check_out_time: p.check_out_time || '12:00',
  min_nights: String(p.min_nights ?? 1),
  deposit_percent: String(p.deposit_percent ?? 30),
})

function PropertyForm({
  onOpenChange,
  property,
  others,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  property: Property | null
  others: Property[]
}) {
  const { features } = useSession()
  const [form, setForm] = useState<Form>(() => (property ? toForm(property) : EMPTY))
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: () => {
      const n = (s: string) => (s.trim() === '' ? null : Number(s))
      return api.saveProperty({
        id: form.id,
        name: form.name.trim(),
        kind: form.kind,
        address: form.address,
        lat: n(form.lat),
        lng: n(form.lng),
        electric_rate: Number(form.electric_rate || 0),
        water_rate: Number(form.water_rate || 0),
        promptpay_id: form.promptpay_id?.trim() || null,
        late_fee_type: form.late_fee_type,
        late_fee_amount: form.late_fee_type === 'none' ? 0 : Number(form.late_fee_amount || 0),
        late_fee_grace_days: Math.max(0, Math.round(Number(form.late_fee_grace_days || 0))),
        booking_enabled: form.booking_enabled,
        booking_slug: form.booking_slug.trim() || null,
        booking_intro: form.booking_intro,
        check_in_time: form.check_in_time || '14:00',
        check_out_time: form.check_out_time || '12:00',
        min_nights: Math.max(1, Math.round(Number(form.min_nights || 1))),
        deposit_percent: Math.min(100, Math.max(0, Number(form.deposit_percent || 0))),
      })
    },
    onSuccess: async () => {
      toast.success('บันทึกโครงการแล้ว')
      await invalidate('properties', 'dashboard', 'org-info')
      onOpenChange(false)
    },
  })

  const locateMe = () => {
    if (!navigator.geolocation) return toast.error('ไม่สามารถอ่านตำแหน่งได้')
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        })),
      () => toast.error('ไม่สามารถอ่านตำแหน่งได้'),
    )
  }

  const kinds = (Object.keys(KINDS) as PropertyKind[]).filter(
    (k) => k !== 'short_stay' || features.short_stay || form.kind === 'short_stay',
  )
  const lat = form.lat === '' ? null : Number(form.lat)
  const lng = form.lng === '' ? null : Number(form.lng)

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const slug = form.booking_slug.trim()
        if ((form.booking_enabled || slug) && !SLUG_RE.test(slug))
          return toast.error('ลิงก์หน้าจองใช้ได้เฉพาะ a-z 0-9 และ - ยาว 3–40 ตัวอักษร')
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{form.id ? 'แก้ไขโครงการ' : 'เพิ่มโครงการ'}</DialogTitle>
        <DialogDescription>ข้อมูลโครงการ อัตราค่าน้ำค่าไฟ และบัญชี PromptPay สำหรับรับชำระ</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ชื่อโครงการ" htmlFor="p-name">
          <Input id="p-name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <Field label="ประเภท" htmlFor="p-kind">
          <Select value={form.kind} onValueChange={(v) => set('kind', v as PropertyKind)}>
            <SelectTrigger id="p-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {KINDS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ที่อยู่" htmlFor="p-address" className="sm:col-span-2">
          <Input id="p-address" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-2">
        <div className="overflow-hidden rounded-lg border">
          <LeafletMap
            properties={others}
            className="h-56"
            scrollWheelZoom
            picked={{ lat, lng }}
            onPick={(la, ln) => setForm((f) => ({ ...f, lat: String(la), lng: String(ln) }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ละติจูด" htmlFor="p-lat">
            <Input id="p-lat" type="number" step="any" value={form.lat} onChange={(e) => set('lat', e.target.value)} />
          </Field>
          <Field label="ลองจิจูด" htmlFor="p-lng">
            <Input id="p-lng" type="number" step="any" value={form.lng} onChange={(e) => set('lng', e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          คลิกบนแผนที่เพื่อเลือกพิกัด (ลากหมุดเพื่อปรับ) หรือ{' '}
          <button type="button" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" onClick={locateMe}>
            <Crosshair className="size-3" /> ใช้ตำแหน่งปัจจุบัน
          </button>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ค่าไฟ (฿/หน่วย)" htmlFor="p-e">
          <Input id="p-e" type="number" step="0.01" min={0} value={form.electric_rate} onChange={(e) => set('electric_rate', e.target.value)} />
        </Field>
        <Field label="ค่าน้ำ (฿/หน่วย)" htmlFor="p-w">
          <Input id="p-w" type="number" step="0.01" min={0} value={form.water_rate} onChange={(e) => set('water_rate', e.target.value)} />
        </Field>
        <Field label="PromptPay (เบอร์มือถือ / เลขผู้เสียภาษี)" htmlFor="p-pp" className="sm:col-span-2">
          <Input id="p-pp" inputMode="numeric" value={form.promptpay_id ?? ''} onChange={(e) => set('promptpay_id', e.target.value)} />
        </Field>
      </div>
      <fieldset className="grid gap-3 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">ค่าปรับชำระล่าช้า</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="รูปแบบ" htmlFor="p-lf-type">
            <Select value={form.late_fee_type} onValueChange={(v) => set('late_fee_type', v as LateFeeType)}>
              <SelectTrigger id="p-lf-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LATE_FEE_TYPES) as LateFeeType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {LATE_FEE_TYPES[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.late_fee_type !== 'none' && (
            <>
              <Field label={form.late_fee_type === 'per_day' ? 'บาท / วัน' : 'จำนวนเงิน (บาท)'} htmlFor="p-lf-amt">
                <Input
                  id="p-lf-amt"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.late_fee_amount}
                  onChange={(e) => set('late_fee_amount', e.target.value)}
                />
              </Field>
              <Field label="ผ่อนผัน (วัน)" htmlFor="p-lf-grace">
                <Input
                  id="p-lf-grace"
                  type="number"
                  min={0}
                  step={1}
                  value={form.late_fee_grace_days}
                  onChange={(e) => set('late_fee_grace_days', e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
        {form.late_fee_type !== 'none' && (
          <p className="text-xs text-muted-foreground">
            เริ่มคิดค่าปรับหลังวันครบกำหนด {Number(form.late_fee_grace_days || 0)} วัน · ค่าปรับเป็นทางเลือกตอนรับชำระ
            ไม่ถูกบวกในใบแจ้งหนี้อัตโนมัติ
          </p>
        )}
      </fieldset>

      {features.short_stay ? (
        <BookingPageSection form={form} set={set} saved={property} />
      ) : (
        <UpsellHint>หน้าจองออนไลน์ (ให้แขกจองและชำระมัดจำเอง) ใช้ได้ในแพ็กเกจที่มีฟีเจอร์ห้องพักรายวัน</UpsellHint>
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

function BookingPageSection({
  form,
  set,
  saved,
}: {
  form: Form
  set: <K extends keyof Form>(k: K, v: Form[K]) => void
  saved: Property | null
}) {
  const slug = form.booking_slug.trim()
  const valid = SLUG_RE.test(slug)
  // แสดงลิงก์เมื่อบันทึกแล้วและเปิดใช้งาน (ลิงก์ที่ยังไม่บันทึกยังเปิดไม่ได้)
  const live = !!saved?.booking_enabled && !!saved.booking_slug && saved.booking_slug === slug && form.booking_enabled
  const url = valid ? stayUrl(slug) : ''
  return (
    <fieldset className="grid gap-4 rounded-md border p-4">
      <legend className="px-1 text-sm font-medium">หน้าจองออนไลน์</legend>
      <label className="flex items-start gap-3">
        <Switch
          className="mt-0.5"
          checked={form.booking_enabled}
          onCheckedChange={(v) => set('booking_enabled', v)}
          aria-label="เปิดหน้าจองออนไลน์"
        />
        <span className="text-sm">
          เปิดให้แขกจองห้องรายวันผ่านลิงก์
          <span className="block text-xs text-muted-foreground">
            แขกเลือกวัน ส่งคำขอ และโอนมัดจำผ่าน PromptPay — คุณอนุมัติที่หน้า การจอง → คำขอจองออนไลน์
          </span>
        </span>
      </label>
      {form.booking_enabled && (
        <>
          <Field
            label="ลิงก์หน้าจอง"
            htmlFor="p-slug"
            hint={!slug || valid ? 'ใช้ได้เฉพาะ a-z 0-9 และ - (3–40 ตัว)' : undefined}
          >
            <div className="flex">
              <span className="hidden items-center rounded-l-md border border-r-0 bg-muted px-2.5 font-mono text-xs text-muted-foreground sm:flex">
                {window.location.host}/stay/
              </span>
              <Input
                id="p-slug"
                className="font-mono text-sm sm:rounded-l-none"
                value={form.booking_slug}
                placeholder="baan-suan"
                maxLength={40}
                aria-invalid={!!slug && !valid}
                onChange={(e) => set('booking_slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              />
            </div>
            {slug && !valid && (
              <p className="text-xs text-destructive">ใช้ได้เฉพาะ a-z 0-9 และ - ยาว 3–40 ตัวอักษร</p>
            )}
          </Field>
          <Field label="ข้อความแนะนำ" htmlFor="p-intro">
            <Textarea
              id="p-intro"
              rows={3}
              value={form.booking_intro}
              placeholder="เช่น ห้องพักใกล้ถนนนิมมานฯ เดินถึงร้านกาแฟ 5 นาที มีที่จอดรถ Wi-Fi ฟรี"
              onChange={(e) => set('booking_intro', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="เช็คอิน" htmlFor="p-cin">
              <Input id="p-cin" type="time" value={form.check_in_time} onChange={(e) => set('check_in_time', e.target.value)} />
            </Field>
            <Field label="เช็คเอาท์" htmlFor="p-cout">
              <Input id="p-cout" type="time" value={form.check_out_time} onChange={(e) => set('check_out_time', e.target.value)} />
            </Field>
            <Field label="ขั้นต่ำ (คืน)" htmlFor="p-minn">
              <Input
                id="p-minn"
                type="number"
                min={1}
                step={1}
                value={form.min_nights}
                onChange={(e) => set('min_nights', e.target.value)}
              />
            </Field>
            <Field label="มัดจำ (% ของยอด)" htmlFor="p-dep">
              <Input
                id="p-dep"
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.deposit_percent}
                onChange={(e) => set('deposit_percent', e.target.value)}
              />
            </Field>
          </div>
          {valid && (
            <div className="flex flex-col gap-4 rounded-md bg-muted/50 p-3 sm:flex-row sm:items-center">
              <div className="mx-auto w-28 shrink-0 rounded-sm border bg-white p-1.5 sm:mx-0">
                <QrSvg value={url} label="QR code หน้าจองออนไลน์" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Globe className="size-3.5 text-muted-foreground" />
                  ลิงก์สาธารณะ
                  {!live && <span className="font-normal text-muted-foreground">— ใช้งานได้หลังบันทึก</span>}
                </div>
                <CopyField value={url} label="ลิงก์หน้าจอง" className="[&_input]:bg-card" />
                <Button asChild variant="outline" size="sm" className={live ? undefined : 'pointer-events-none opacity-50'}>
                  <a href={url} target="_blank" rel="noreferrer" aria-disabled={!live} tabIndex={live ? undefined : -1}>
                    <ExternalLink /> เปิดดู
                  </a>
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </fieldset>
  )
}

export function PropertyDialog(props: React.ComponentProps<typeof PropertyForm>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <PropertyForm {...props} />
      </DialogContent>
    </Dialog>
  )
}
