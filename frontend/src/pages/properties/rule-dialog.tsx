import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { api, type RateAdjustment, type RateRuleInput, type RateRuleType, type Unit } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { TH_WEEKDAYS } from '@/lib/format'
import { ADJUSTMENTS } from '@/lib/pricing'
import { cn } from '@/lib/utils'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field } from '@/components/common'

/** ค่าเริ่มต้นของฟอร์ม: กฎเดิม (แก้ไข) หรือ draft ใหม่ (เช่น จากปุ่มลัด) */
export type RuleDraft = Partial<RateRuleInput> & { id?: number }

interface Form {
  name: string
  scope: 'all' | 'unit'
  unit_id: string
  rule_type: RateRuleType
  start_date: string
  end_date: string
  weekdays: number[]
  adjustment: RateAdjustment
  value: string
  min_nights: string
  priority: string
  active: boolean
}

const formOf = (d: RuleDraft): Form => ({
  name: d.name ?? '',
  scope: d.unit_id ? 'unit' : 'all',
  unit_id: d.unit_id ? String(d.unit_id) : '',
  rule_type: d.rule_type ?? 'night',
  start_date: d.start_date ?? '',
  end_date: d.end_date ?? '',
  weekdays: d.weekdays ?? [],
  adjustment: d.adjustment ?? 'percent',
  value: d.value != null ? String(d.value) : '',
  min_nights: d.min_nights != null ? String(d.min_nights) : '7',
  priority: d.priority != null ? String(d.priority) : '10',
  active: d.active ?? true,
})

export function RuleDialog({
  draft,
  propertyId,
  units,
  onClose,
}: {
  draft: RuleDraft | null
  propertyId: number
  units: Unit[]
  onClose: () => void
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {draft && <RuleForm draft={draft} propertyId={propertyId} units={units} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function RuleForm({
  draft,
  propertyId,
  units,
  onClose,
}: {
  draft: RuleDraft
  propertyId: number
  units: Unit[]
  onClose: () => void
}) {
  const [f, setF] = useState<Form>(() => formOf(draft))
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const night = f.rule_type === 'night'

  const save = useMutation({
    mutationFn: (body: RateRuleInput) =>
      draft.id ? api.updateRateRule(draft.id, body) : api.createRateRule(body),
    onSuccess: async () => {
      toast.success(draft.id ? 'บันทึกกฎราคาแล้ว' : 'เพิ่มกฎราคาแล้ว')
      onClose()
      await invalidate('rate-rules', 'unit-prices')
    },
  })

  const submit = () => {
    const name = f.name.trim()
    if (!name) return toast.error('กรุณาตั้งชื่อกฎ')
    if (f.scope === 'unit' && !f.unit_id) return toast.error('กรุณาเลือกห้อง')
    const value = Number(f.value)
    if (f.value.trim() === '' || !Number.isFinite(value)) return toast.error('กรุณากรอกค่าปรับราคา')
    const unit_id = f.scope === 'unit' ? Number(f.unit_id) : null
    const priority = Math.round(Number(f.priority) || 0)
    let body: RateRuleInput
    if (night) {
      if (f.adjustment === 'fixed' && value <= 0) return toast.error('ราคาต้องมากกว่า 0')
      if (f.adjustment === 'percent' && value <= -100) return toast.error('ลดได้ไม่เกิน 100%')
      if (f.start_date && f.end_date && f.end_date < f.start_date)
        return toast.error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม')
      body = {
        property_id: propertyId,
        unit_id,
        name,
        rule_type: 'night',
        start_date: f.start_date || null,
        end_date: f.end_date || null,
        weekdays: [...f.weekdays].sort((a, b) => a - b),
        adjustment: f.adjustment,
        value,
        min_nights: null,
        priority,
        active: f.active,
      }
    } else {
      const min = Math.round(Number(f.min_nights))
      if (!(min >= 2)) return toast.error('จำนวนคืนขั้นต่ำต้องตั้งแต่ 2 คืน')
      if (value <= 0 || value > 100) return toast.error('ส่วนลดต้องอยู่ระหว่าง 1–100%')
      body = {
        property_id: propertyId,
        unit_id,
        name,
        rule_type: 'length',
        start_date: null,
        end_date: null,
        weekdays: [],
        adjustment: 'percent',
        value,
        min_nights: min,
        priority,
        active: f.active,
      }
    }
    save.mutate(body)
  }

  const toggleDay = (d: number) =>
    set('weekdays', f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d])

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{draft.id ? 'แก้ไขกฎราคา' : 'เพิ่มกฎราคา'}</DialogTitle>
        <DialogDescription>
          ปรับราคาต่อคืนตามช่วงวันที่/วันในสัปดาห์ หรือให้ส่วนลดเมื่อพักหลายคืน
        </DialogDescription>
      </DialogHeader>

      <Tabs value={f.rule_type} onValueChange={(v) => set('rule_type', v as RateRuleType)}>
        <TabsList className="grid h-10 w-full grid-cols-2">
          <TabsTrigger value="night">ราคาตามวัน</TabsTrigger>
          <TabsTrigger value="length">ส่วนลดพักหลายคืน</TabsTrigger>
        </TabsList>
      </Tabs>

      <Field label="ชื่อกฎ" htmlFor="rr-name">
        <Input
          id="rr-name"
          value={f.name}
          placeholder={night ? 'เช่น สุดสัปดาห์, ไฮซีซั่น' : 'เช่น พักรายสัปดาห์'}
          onChange={(e) => set('name', e.target.value)}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ใช้กับ" htmlFor="rr-scope">
          <Select value={f.scope} onValueChange={(v) => set('scope', v as Form['scope'])}>
            <SelectTrigger id="rr-scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกห้อง</SelectItem>
              <SelectItem value="unit">ห้องเดียว</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {f.scope === 'unit' && (
          <Field label="ห้อง" htmlFor="rr-unit">
            <Select value={f.unit_id} onValueChange={(v) => set('unit_id', v)}>
              <SelectTrigger id="rr-unit" className="w-full">
                <SelectValue placeholder="เลือกห้อง" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {units.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    ห้อง {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {night ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="ตั้งแต่ (ไม่บังคับ)" htmlFor="rr-start">
              <Input id="rr-start" type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </Field>
            <Field label="ถึง (รวมวันนี้)" htmlFor="rr-end">
              <Input
                id="rr-end"
                type="date"
                value={f.end_date}
                min={f.start_date || undefined}
                onChange={(e) => set('end_date', e.target.value)}
              />
            </Field>
          </div>
          <Field label="วันในสัปดาห์ (ไม่เลือก = ทุกวัน)">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="วันในสัปดาห์">
              {TH_WEEKDAYS.map((w, i) => {
                const on = f.weekdays.includes(i)
                return (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(i)}
                    className={cn(
                      'h-9 min-w-10 rounded-md border px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                    )}
                  >
                    {w}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field
            label="การปรับราคา"
            hint={
              f.adjustment === 'fixed'
                ? 'ราคาต่อคืนแทนราคาปกติของห้อง'
                : f.adjustment === 'percent'
                  ? 'เช่น 20 = แพงขึ้น 20%, -15 = ลด 15%'
                  : 'เช่น 300 = บวก 300 บาท/คืน, -200 = ลด 200 บาท/คืน'
            }
          >
            <div className="flex flex-wrap gap-2">
              <Tabs value={f.adjustment} onValueChange={(v) => set('adjustment', v as RateAdjustment)}>
                <TabsList className="h-9">
                  {(Object.keys(ADJUSTMENTS) as RateAdjustment[]).map((k) => (
                    <TabsTrigger key={k} value={k} className="px-3">
                      {ADJUSTMENTS[k]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="relative min-w-28 flex-1">
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  min={f.adjustment === 'fixed' ? 0 : undefined}
                  value={f.value}
                  onChange={(e) => set('value', e.target.value)}
                  aria-label="ค่าปรับราคา"
                  className="pr-12 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted-foreground">
                  {f.adjustment === 'percent' ? '%' : 'บาท'}
                </span>
              </div>
            </div>
          </Field>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Field label="พักตั้งแต่ (คืน)" htmlFor="rr-min">
            <Input
              id="rr-min"
              type="number"
              min={2}
              inputMode="numeric"
              value={f.min_nights}
              onChange={(e) => set('min_nights', e.target.value)}
            />
          </Field>
          <Field label="ส่วนลด (%)" htmlFor="rr-disc">
            <Input
              id="rr-disc"
              type="number"
              min={1}
              max={100}
              step="any"
              inputMode="decimal"
              value={f.value}
              onChange={(e) => set('value', e.target.value)}
            />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 items-end gap-4">
        <Field label="ลำดับความสำคัญ" htmlFor="rr-pri" hint="ตัวเลขมากกว่าคำนวณทีหลัง (ทับกฎอื่น)">
          <Input
            id="rr-pri"
            type="number"
            inputMode="numeric"
            value={f.priority}
            onChange={(e) => set('priority', e.target.value)}
          />
        </Field>
        <label className="flex h-9 items-center gap-2.5 self-start pt-6 text-sm">
          <Switch checked={f.active} onCheckedChange={(v) => set('active', v)} />
          เปิดใช้งาน
        </label>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          บันทึก
        </Button>
      </DialogFooter>
    </form>
  )
}
