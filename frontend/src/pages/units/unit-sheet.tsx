import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarPlus, Droplets, Loader2, Move3d, Plus, Save, Trash2, X, Zap } from 'lucide-react'
import { api, type FurnitureKind, type Unit, type UnitStatus } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { FURNITURE, UNIT_STATUS, baht, num, thDate } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function UnitSheet({ unit, onClose }: { unit: Unit | null; onClose: () => void }) {
  return (
    <Sheet open={!!unit} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-2xl" aria-describedby={undefined}>
        {unit && <UnitEditor key={unit.id} unit={unit} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function UnitEditor({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const { features, canManage, readOnly } = useSession()
  const confirm = useConfirm()
  const { openBooking } = useBookingDialog()
  const [draft, setDraft] = useState<Unit>(() => ({ ...unit, layout: [...(unit.layout || [])] }))
  const [tabState, setTab] = useState(features.view3d ? 'room3d' : 'info')
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
    mutationFn: () => api.updateUnit(draft),
    onSuccess: async (saved) => {
      setDraft({ ...saved, layout: [...(saved.layout || [])] })
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

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <div className="border-b px-6 pt-3 pb-2">
          <TabsList variant="line" className="w-full justify-start">
            {features.view3d && (
              <TabsTrigger value="room3d" className="flex-none">
                <Move3d /> ห้อง 3D
              </TabsTrigger>
            )}
            <TabsTrigger value="info" className="flex-none">
              ข้อมูลห้อง
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
                <div className="relative h-72 overflow-hidden rounded-xl bg-gradient-to-b from-slate-100 to-white sm:h-80 dark:from-slate-800 dark:to-slate-900">
                  <RoomView room={room} />
                  <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
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
                    <Zap className="size-4 text-amber-500" /> ไฟฟ้า
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Droplets className="size-4 text-sky-500" /> น้ำ
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
