import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Crosshair, Loader2 } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/common'
import { LeafletMap } from '@/components/leaflet-map'

type Form = Omit<
  PropertyInput,
  'lat' | 'lng' | 'electric_rate' | 'water_rate' | 'late_fee_amount' | 'late_fee_grace_days'
> & {
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
}

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

export function PropertyDialog(props: React.ComponentProps<typeof PropertyForm>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <PropertyForm {...props} />
      </DialogContent>
    </Dialog>
  )
}
