import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, CalendarCheck, Loader2, Plus } from 'lucide-react'
import { ApiError, api, type BookingKind, type Unit } from '@/lib/api'
import { handleApiError, invalidate } from '@/lib/query'
import { BOOKING_SOURCES, UNIT_STATUS, baht, today } from '@/lib/format'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field } from '@/components/common'
import { TenantDialog } from '@/components/tenant-dialog'

interface Form {
  unit_id: string
  tenant_id: string
  kind: BookingKind
  start_date: string
  end_date: string
  price: string
  deposit_amount: string
  source: string
}

/** ค่าเริ่มต้นของฟอร์ม (เช่น เลือกช่วงวันจากปฏิทิน) */
export interface BookingPrefill {
  unit_id?: number
  start_date?: string
  end_date?: string
  kind?: BookingKind
}

const BookingCtx = createContext<{ openBooking: (unit?: Unit, prefill?: BookingPrefill) => void } | null>(
  null,
)

export function useBookingDialog() {
  const ctx = useContext(BookingCtx)
  if (!ctx) throw new Error('useBookingDialog must be used within BookingDialogProvider')
  return ctx
}

export function BookingDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [unit, setUnit] = useState<Unit | undefined>()
  const [prefill, setPrefill] = useState<BookingPrefill | undefined>()
  const [nonce, setNonce] = useState(0)
  const openBooking = useCallback((u?: Unit, p?: BookingPrefill) => {
    setUnit(u)
    setPrefill(p)
    setNonce((n) => n + 1)
    setOpen(true)
  }, [])
  const value = useMemo(() => ({ openBooking }), [openBooking])
  return (
    <BookingCtx.Provider value={value}>
      {children}
      <BookingDialog key={nonce} open={open} onOpenChange={setOpen} unit={unit} prefill={prefill} />
    </BookingCtx.Provider>
  )
}

function BookingDialog({
  open,
  onOpenChange,
  unit,
  prefill,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  unit?: Unit
  prefill?: BookingPrefill
}) {
  const { features } = useSession()
  const units = useQuery({ queryKey: ['units', 'all'], queryFn: () => api.units(), enabled: open })
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties, enabled: open })
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: api.tenants, enabled: open })
  const [tenantOpen, setTenantOpen] = useState(false)

  const [conflict, setConflict] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(() => ({
    unit_id: prefill?.unit_id ? String(prefill.unit_id) : unit ? String(unit.id) : '',
    tenant_id: '',
    kind:
      prefill?.kind === 'short_stay' && features.short_stay
        ? 'short_stay'
        : prefill?.kind === 'lease'
          ? 'lease'
          : unit && unit.rate_daily > 0 && !unit.rent_monthly && features.short_stay
            ? 'short_stay'
            : 'lease',
    start_date: prefill?.start_date ?? today(),
    end_date: prefill?.end_date ?? '',
    price: '',
    deposit_amount: '',
    source: 'direct',
  }))
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setConflict(null)
    setForm((f) => ({ ...f, [k]: v }))
  }
  const tenantId = form.tenant_id || (tenants.data?.[0] ? String(tenants.data[0].id) : '')

  const unitList = units.data
  const propList = properties.data
  const grouped = useMemo(() => {
    const byProp = new Map<number, Unit[]>()
    for (const u of unitList ?? []) {
      if (!byProp.has(u.property_id)) byProp.set(u.property_id, [])
      byProp.get(u.property_id)!.push(u)
    }
    return [...byProp.entries()].map(([pid, list]) => ({
      name: propList?.find((p) => p.id === pid)?.name ?? `โครงการ #${pid}`,
      list,
    }))
  }, [unitList, propList])

  const selectedUnit = units.data?.find((u) => String(u.id) === form.unit_id) ?? unit
  const isLease = form.kind === 'lease'

  const quote = useMemo(() => {
    const u = selectedUnit
    if (!u) return null
    if (isLease) {
      const rent = Number(form.price || u.rent_monthly)
      const dep = Number(form.deposit_amount || u.deposit)
      return {
        line: `ค่าเช่า ${baht(rent)}/เดือน · มัดจำ ${baht(dep)}`,
        total: rent + dep,
        totalLabel: 'ชำระวันทำสัญญา (เดือนแรก + มัดจำ)',
      }
    }
    if (!form.end_date) return null
    const nights = Math.round(
      (new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86_400_000,
    )
    if (nights <= 0) return null
    const rate = Number(form.price || u.rate_daily)
    return {
      line: `${nights} คืน × ${baht(rate)}`,
      total: nights * rate + Number(form.deposit_amount || 0),
      totalLabel: 'ยอดรวม',
    }
  }, [selectedUnit, isLease, form.price, form.deposit_amount, form.end_date, form.start_date])

  const save = useMutation({
    mutationFn: () =>
      api.createBooking({
        unit_id: Number(form.unit_id),
        tenant_id: Number(tenantId),
        kind: form.kind,
        start_date: form.start_date,
        end_date: form.end_date || null,
        price: form.price === '' ? null : Number(form.price),
        deposit_amount: form.deposit_amount === '' ? null : Number(form.deposit_amount),
        source: isLease ? 'direct' : form.source,
      }),
    meta: { silent: true },
    onSuccess: async () => {
      toast.success('บันทึกการจองแล้ว')
      await invalidate('bookings', 'units', 'dashboard', 'calendar')
      onOpenChange(false)
    },
    onError: (e) => {
      // 409 = ช่วงวันที่ชนกับการจองอื่น หรือถูกปิดจากช่องทางภายนอก (iCal) — แสดงข้อความจากเซิร์ฟเวอร์ในฟอร์ม
      if (e instanceof ApiError && e.status === 409) setConflict(e.message)
      else handleApiError(e)
    },
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!form.unit_id) return toast.error('กรุณาเลือกห้อง')
              if (!tenantId) return toast.error('กรุณาเลือกผู้เช่า')
              save.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>สร้างการจอง / สัญญาเช่า</DialogTitle>
              <DialogDescription>เลือกห้อง ผู้เช่า และช่วงเวลา ระบบจะคำนวณยอดให้อัตโนมัติ</DialogDescription>
            </DialogHeader>

            {features.short_stay && (
              <Tabs value={form.kind} onValueChange={(v) => set('kind', v as BookingKind)}>
                <TabsList className="grid h-10 w-full grid-cols-2">
                  <TabsTrigger value="lease">สัญญารายเดือน</TabsTrigger>
                  <TabsTrigger value="short_stay">รายวัน / Airbnb</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <Field label="ห้อง" htmlFor="b-unit">
              <Select value={form.unit_id} onValueChange={(v) => set('unit_id', v)}>
                <SelectTrigger id="b-unit" className="w-full">
                  <SelectValue placeholder={units.isLoading ? 'กำลังโหลด…' : 'เลือกห้อง'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {grouped.map((g) => (
                    <SelectGroup key={g.name}>
                      <SelectLabel>{g.name}</SelectLabel>
                      {g.list.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)} disabled={u.status === 'maintenance'}>
                          <span className={`size-2 rounded-full ${UNIT_STATUS[u.status]?.dot}`} />
                          ห้อง {u.name}
                          <span className="text-muted-foreground">— {UNIT_STATUS[u.status]?.label}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="ผู้เช่า / แขก" htmlFor="b-tenant">
              <div className="flex gap-2">
                <Select value={tenantId} onValueChange={(v) => set('tenant_id', v)}>
                  <SelectTrigger id="b-tenant" className="w-full">
                    <SelectValue placeholder={tenants.data?.length === 0 ? 'ยังไม่มีผู้เช่า' : 'เลือกผู้เช่า'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {tenants.data?.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.full_name}
                        {t.phone && <span className="text-muted-foreground">· {t.phone}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="secondary" onClick={() => setTenantOpen(true)}>
                  <Plus /> ใหม่
                </Button>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={isLease ? 'วันเริ่มสัญญา' : 'เช็คอิน'} htmlFor="b-start">
                <Input
                  id="b-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set('start_date', e.target.value)}
                  required
                />
              </Field>
              <Field label={isLease ? 'วันสิ้นสุด (ถ้ามี)' : 'เช็คเอาท์'} htmlFor="b-end">
                <Input
                  id="b-end"
                  type="date"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={(e) => set('end_date', e.target.value)}
                  required={!isLease}
                />
              </Field>
              <Field label={isLease ? 'ค่าเช่า/เดือน' : 'ราคา/คืน'} htmlFor="b-price">
                <Input
                  id="b-price"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={form.price}
                  placeholder={
                    selectedUnit
                      ? String(isLease ? selectedUnit.rent_monthly : selectedUnit.rate_daily)
                      : 'ตามราคาห้อง'
                  }
                  onChange={(e) => set('price', e.target.value)}
                />
              </Field>
              <Field label="เงินมัดจำ" htmlFor="b-deposit">
                <Input
                  id="b-deposit"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={form.deposit_amount}
                  placeholder={selectedUnit && isLease ? String(selectedUnit.deposit) : 'ตามราคาห้อง'}
                  onChange={(e) => set('deposit_amount', e.target.value)}
                />
              </Field>
              {!isLease && (
                <Field label="ช่องทาง" htmlFor="b-source" className="col-span-2">
                  <Select value={form.source} onValueChange={(v) => set('source', v)}>
                    <SelectTrigger id="b-source" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(BOOKING_SOURCES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>

            {conflict && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <div className="font-medium">จองช่วงนี้ไม่ได้</div>
                  <div className="text-destructive/90">{conflict}</div>
                </div>
              </div>
            )}

            {quote && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm">
                <div className="text-muted-foreground">{quote.line}</div>
                <div className="mt-1 flex items-baseline font-semibold text-primary">
                  <span>{quote.totalLabel}</span>
                  <span className="ml-auto text-lg tabular-nums">{baht(quote.total)}</span>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <CalendarCheck />}
                ยืนยันการจอง
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <TenantDialog
        open={tenantOpen}
        onOpenChange={setTenantOpen}
        onSaved={(t) => set('tenant_id', String(t.id))}
      />
    </>
  )
}
