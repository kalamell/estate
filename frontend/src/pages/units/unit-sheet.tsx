import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarPlus, CalendarRange, Droplets, Loader2, Move3d, Plus, Save, Trash2, X, Zap } from 'lucide-react'
import { api, type ExtraCharge, type FurnitureKind, type HousekeepingStatus, type Unit, type UnitStatus } from '@/lib/api'
import { HK_STATUS, HK_STATUS_ORDER } from '@/lib/housekeeping'
import { cn } from '@/lib/utils'
import { HkIndicator } from '@/components/housekeeping-indicator'
import { invalidate } from '@/lib/query'
import { FURNITURE, UNIT_STATUS, baht, num, thDate } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { BookingStatusBadge, Field, UnitStatusBadge } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { useBookingDialog } from '@/components/booking-dialog'
import { RoomView } from './three-canvas'
import { UnitChannels } from './unit-channels'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const withoutHk = (u: Unit): Unit => {
  const copy = { ...u }
  delete copy.housekeeping_status
  return copy
}

export function UnitSheet({
  unit,
  onClose,
  initialTab,
}: {
  unit: Unit | null
  onClose: () => void
  /** แท็บที่เปิดก่อน เช่น "channels" */
  initialTab?: string | null
}) {
  return (
    <Sheet open={!!unit} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-2xl" aria-describedby={undefined}>
        {unit && <UnitEditor key={unit.id} unit={unit} onClose={onClose} initialTab={initialTab} />}
      </SheetContent>
    </Sheet>
  )
}

const TABS = ['room3d', 'info', 'channels', 'history']

function UnitEditor({
  unit,
  onClose,
  initialTab,
}: {
  unit: Unit
  onClose: () => void
  initialTab?: string | null
}) {
  const { features, canManage, readOnly } = useSession()
  const confirm = useConfirm()
  const { openBooking } = useBookingDialog()
  const [draft, setDraft] = useState<Unit>(() => ({
    ...unit,
    layout: [...(unit.layout || [])],
    extra_charges: [...(unit.extra_charges || [])],
  }))
  const [tabState, setTab] = useState(() =>
    initialTab && TABS.includes(initialTab) ? initialTab : features.view3d ? 'room3d' : 'info',
  )
  const tab = !features.view3d && tabState === 'room3d' ? 'info' : tabState
  const [newKind, setNewKind] = useState<FurnitureKind>('bed')

  const set = <K extends keyof Unit>(k: K, v: Unit[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const numIn = (k: 'width' | 'length' | 'height' | 'floor' | 'rent_monthly' | 'rate_daily' | 'deposit') =>
    (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value === '' ? 0 : Number(e.target.value))

  const room = useMemo(
    () => ({
      width: draft.width,
      length: draft.length,
      height: draft.height,
      status: draft.status,
      layout: draft.layout,
    }),
    [draft.width, draft.length, draft.height, draft.status, draft.layout],
  )

  const save = useMutation({
    mutationFn: () =>
      api.updateUnit({
        // สถานะทำความสะอาดเปลี่ยนผ่าน PATCH /housekeeping เท่านั้น — ไม่ส่งค่าเก่าทับ
        ...withoutHk(draft),
        extra_charges: draft.extra_charges
          .filter((c) => c.label.trim())
          .map((c) => ({ ...c, label: c.label.trim(), amount: Number(c.amount) || 0 })),
      }),
    onSuccess: async (saved) => {
      setDraft({
        ...saved,
        layout: [...(saved.layout || [])],
        extra_charges: [...(saved.extra_charges || [])],
      })
      toast.success('บันทึกห้องแล้ว')
      await invalidate('units', 'dashboard')
    },
  })
  const remove = useMutation({
    mutationFn: () => api.deleteUnit(unit.id),
    onSuccess: async () => {
      toast.success('ลบห้องแล้ว')
      onClose()
      await invalidate('units', 'dashboard', 'org-info')
    },
  })

  const addFurniture = () => {
    const [, w, d, h] = FURNITURE[newKind]
    set('layout', [...draft.layout, { kind: newKind, x: 0, z: 0, w, d, h }])
  }
  const moveFurniture = (i: number, axis: 'x' | 'z', v: number) =>
    set(
      'layout',
      draft.layout.map((f, j) => (j === i ? { ...f, [axis]: v } : f)),
    )
  const removeFurniture = (i: number) => set('layout', draft.layout.filter((_, j) => j !== i))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="flex-row items-center gap-3 border-b px-6 py-4 pr-12">
        <SheetTitle className="text-lg">ห้อง {draft.name}</SheetTitle>
        <UnitStatusBadge status={draft.status} />
        <SheetDescription className="sr-only">รายละเอียดและการตั้งค่าห้อง {draft.name}</SheetDescription>
      </SheetHeader>
      <HousekeepingBar unit={unit} />

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <div className="border-b px-6 pt-3 pb-2">
          <TabsList variant="line" className="w-full justify-start overflow-x-auto">
            {features.view3d && (
              <TabsTrigger value="room3d" className="flex-none">
                <Move3d /> ห้อง 3D
              </TabsTrigger>
            )}
            <TabsTrigger value="info" className="flex-none">
              ข้อมูลห้อง
            </TabsTrigger>
            <TabsTrigger value="channels" className="flex-none">
              <CalendarRange /> ปฏิทิน & ช่องทางขาย
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-none">
              ประวัติ
            </TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-6">
            {features.view3d && (
              <TabsContent value="room3d" className="space-y-5">
                <div className="relative h-72 overflow-hidden rounded-md border bg-muted sm:h-80">
                  <RoomView room={room} />
                  <div className="pointer-events-none absolute bottom-2 left-2 rounded-sm border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                    ลากเพื่อหมุน · เลื่อนเพื่อซูม
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="กว้าง (ม.)" htmlFor="u-w">
                    <Input id="u-w" type="number" step="0.1" min={1} value={draft.width} onChange={numIn('width')} />
                  </Field>
                  <Field label="ยาว (ม.)" htmlFor="u-l">
                    <Input id="u-l" type="number" step="0.1" min={1} value={draft.length} onChange={numIn('length')} />
                  </Field>
                  <Field label="สูง (ม.)" htmlFor="u-h">
                    <Input id="u-h" type="number" step="0.1" min={1} value={draft.height} onChange={numIn('height')} />
                  </Field>
                </div>
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">เฟอร์นิเจอร์</span>
                    <div className="ml-auto flex gap-2">
                      <Select value={newKind} onValueChange={(v) => setNewKind(v as FurnitureKind)}>
                        <SelectTrigger size="sm" className="w-40" aria-label="ประเภทเฟอร์นิเจอร์">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FURNITURE) as FurnitureKind[]).map((k) => (
                            <SelectItem key={k} value={k}>
                              {FURNITURE[k][0]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="secondary" onClick={addFurniture}>
                        <Plus /> เพิ่ม
                      </Button>
                    </div>
                  </div>
                  {draft.layout.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      ยังไม่มีเฟอร์นิเจอร์
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {draft.layout.map((f, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm sm:grid-cols-[7rem_1fr_1fr_auto]"
                        >
                          <span className="font-medium">
                            {FURNITURE[f.kind as FurnitureKind]?.[0] ?? f.kind}
                          </span>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive sm:order-last"
                            onClick={() => removeFurniture(i)}
                            aria-label="ลบเฟอร์นิเจอร์"
                          >
                            <X />
                          </Button>
                          {(['x', 'z'] as const).map((axis) => {
                            const half = (axis === 'x' ? draft.width : draft.length) / 2
                            return (
                              <label key={axis} className="col-span-2 flex items-center gap-2 sm:col-span-1">
                                <span className="w-3 text-xs text-muted-foreground uppercase">{axis}</span>
                                <Slider
                                  min={-half}
                                  max={half}
                                  step={0.1}
                                  value={[clamp(f[axis], -half, half)]}
                                  onValueChange={([v]) => moveFurniture(i, axis, v)}
                                  aria-label={`ตำแหน่ง ${axis.toUpperCase()}`}
                                />
                              </label>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            <TabsContent value="info">
              <div className="grid grid-cols-2 gap-4">
                <Field label="หมายเลขห้อง" htmlFor="u-name">
                  <Input id="u-name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="ชั้น" htmlFor="u-floor">
                  <Input id="u-floor" type="number" value={draft.floor} onChange={numIn('floor')} />
                </Field>
                <Field label="ค่าเช่ารายเดือน" htmlFor="u-rent">
                  <Input id="u-rent" type="number" min={0} value={draft.rent_monthly} onChange={numIn('rent_monthly')} />
                </Field>
                <Field label="ราคารายวัน" htmlFor="u-daily">
                  <Input id="u-daily" type="number" min={0} value={draft.rate_daily} onChange={numIn('rate_daily')} />
                </Field>
                <Field label="เงินมัดจำ" htmlFor="u-dep">
                  <Input id="u-dep" type="number" min={0} value={draft.deposit} onChange={numIn('deposit')} />
                </Field>
                <Field label="สถานะ" htmlFor="u-status">
                  <Select value={draft.status} onValueChange={(v) => set('status', v as UnitStatus)}>
                    <SelectTrigger id="u-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(UNIT_STATUS) as UnitStatus[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          <span className={`size-2 rounded-full ${UNIT_STATUS[k].dot}`} />
                          {UNIT_STATUS[k].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="หมายเหตุ" htmlFor="u-note" className="col-span-2">
                  <Textarea id="u-note" rows={3} value={draft.note} onChange={(e) => set('note', e.target.value)} />
                </Field>
              </div>
              <ExtraChargesEditor
                value={draft.extra_charges}
                onChange={(v) => set('extra_charges', v)}
              />
            </TabsContent>

            <TabsContent value="channels">
              <UnitChannels unit={unit} />
            </TabsContent>

            <TabsContent value="history">
              <UnitHistory unitId={unit.id} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-background p-4">
        {canManage && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={readOnly || remove.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: `ลบห้อง ${unit.name}?`,
                  description: 'ข้อมูลการจองและค่ามิเตอร์ของห้องนี้อาจถูกลบด้วย',
                  confirmText: 'ลบห้อง',
                  destructive: true,
                })
              )
                remove.mutate()
            }}
          >
            <Trash2 /> ลบห้อง
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {unit.status === 'vacant' && (
            <Button variant="secondary" disabled={readOnly} onClick={() => openBooking(unit)}>
              <CalendarPlus /> จองห้องนี้
            </Button>
          )}
          <Button onClick={() => save.mutate()} disabled={readOnly || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            บันทึก
          </Button>
        </div>
      </div>
    </div>
  )
}

function UnitHistory({ unitId }: { unitId: number }) {
  const bookings = useQuery({
    queryKey: ['bookings', { unit_id: unitId }],
    queryFn: () => api.bookings({ unit_id: unitId }),
  })
  const meters = useQuery({
    queryKey: ['meters', { unit_id: unitId }],
    queryFn: () => api.meters({ unit_id: unitId }),
  })
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-medium">การจอง</h3>
        {bookings.isLoading ? (
          <Skeleton className="h-20" />
        ) : bookings.data?.length ? (
          <div className="divide-y rounded-lg border">
            {bookings.data.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="font-medium">{b.tenant_name}</span>
                <span className="text-xs text-muted-foreground">
                  {b.kind === 'lease' ? 'รายเดือน' : 'รายวัน'} · {baht(b.price)}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {thDate(b.start_date)} – {b.end_date ? thDate(b.end_date) : '…'}
                </span>
                <BookingStatusBadge status={b.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">ไม่มี</p>
        )}
      </section>
      <section>
        <h3 className="mb-2 font-medium">ค่ามิเตอร์</h3>
        {meters.isLoading ? (
          <Skeleton className="h-20" />
        ) : meters.data?.length ? (
          <div className="divide-y rounded-lg border">
            {meters.data.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                {m.meter_type === 'electric' ? (
                  <span className="flex items-center gap-1.5">
                    <Zap className="size-4 text-warning" /> ไฟฟ้า
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Droplets className="size-4 text-info" /> น้ำ
                  </span>
                )}
                <span className="ml-auto font-medium tabular-nums">{num(m.value)}</span>
                <span className="w-20 text-right text-muted-foreground">{thDate(m.reading_date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">ไม่มี</p>
        )}
      </section>
    </div>
  )
}

const CHARGE_PRESETS = ['อินเทอร์เน็ต', 'ที่จอดรถ', 'ค่าส่วนกลาง', 'ค่าเฟอร์นิเจอร์']

function ExtraChargesEditor({
  value,
  onChange,
}: {
  value: ExtraCharge[]
  onChange: (v: ExtraCharge[]) => void
}) {
  const update = (i: number, patch: Partial<ExtraCharge>) =>
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const add = (label = '') => onChange([...value, { label, amount: 0, vatable: false }])
  const total = value.reduce((s, c) => s + (Number(c.amount) || 0), 0)
  return (
    <section className="mt-8 border-t pt-6">
      <div className="flex items-baseline gap-3">
        <h3 className="text-sm font-semibold">ค่าบริการรายเดือนเพิ่มเติม</h3>
        {value.length > 0 && (
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">รวม {baht(total)}/เดือน</span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        เพิ่มเข้าใบแจ้งหนี้รายเดือนอัตโนมัติ เช่น อินเทอร์เน็ต 300 ที่จอดรถ 500 — ติ๊ก "VAT" สำหรับรายการที่ต้องคิดภาษี
      </p>
      {value.length > 0 && (
        <div className="mt-3 divide-y rounded-md border">
          <div className="hidden grid-cols-[1fr_7rem_3.5rem_2rem] gap-2 bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground sm:grid">
            <span>รายการ</span>
            <span className="text-right">บาท/เดือน</span>
            <span className="text-center">VAT</span>
            <span />
          </div>
          {value.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_auto_2rem] items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_7rem_3.5rem_2rem]">
              <Input
                value={c.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="ชื่อรายการ"
                aria-label="ชื่อรายการ"
                className="h-8"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={c.amount}
                onChange={(e) => update(i, { amount: e.target.value === '' ? 0 : Number(e.target.value) })}
                aria-label="จำนวนเงินต่อเดือน"
                className="h-8 text-right tabular-nums"
              />
              <label className="flex items-center justify-center gap-1.5 text-xs">
                <Checkbox
                  checked={c.vatable}
                  onCheckedChange={(v) => update(i, { vatable: v === true })}
                  aria-label="คิด VAT"
                />
                <span className="sm:hidden">VAT</span>
              </label>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label="ลบรายการ"
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => add()}>
          <Plus /> เพิ่มรายการ
        </Button>
        {CHARGE_PRESETS.filter((p) => !value.some((c) => c.label === p)).map((p) => (
          <Button key={p} type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => add(p)}>
            + {p}
          </Button>
        ))}
      </div>
    </section>
  )
}

/** สถานะทำความสะอาดของห้อง — เปลี่ยนเองได้ (PATCH ทันที) */
function HousekeepingBar({ unit }: { unit: Unit }) {
  const { readOnly } = useSession()
  const [status, setStatus] = useState<HousekeepingStatus | undefined>(unit.housekeeping_status)
  const set = useMutation({
    mutationFn: (s: HousekeepingStatus) => api.setHousekeeping(unit.id, s),
    onMutate: (s) => {
      const prev = status
      setStatus(s)
      return { prev }
    },
    onError: (_e, _s, ctx) => setStatus(ctx?.prev),
    onSuccess: async (u) => {
      setStatus(u.housekeeping_status)
      toast.success(`ห้อง ${u.name}: ${HK_STATUS[u.housekeeping_status ?? 'clean'].label}`)
      await invalidate('units', 'hk-today', 'dashboard', 'calendar')
    },
  })
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-6 py-2.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <HkIndicator status={status} size="xs" />
        ความสะอาด
      </span>
      <div role="radiogroup" aria-label="สถานะทำความสะอาด" className="inline-flex rounded-md border bg-muted/50 p-0.5">
        {HK_STATUS_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={status === k}
            disabled={readOnly || set.isPending}
            onClick={() => status !== k && set.mutate(k)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60',
              status === k && 'bg-card text-foreground shadow-xs ring-1 ring-border',
            )}
          >
            <span className={cn('size-1.5 rounded-full', HK_STATUS[k].dot)} />
            {k === 'dirty' ? 'รอทำความสะอาด' : HK_STATUS[k].short}
          </button>
        ))}
      </div>
    </div>
  )
}
