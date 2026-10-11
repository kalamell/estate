// รับพัสดุเข้าระบบ — ออกแบบให้กรอกเร็วที่เคาน์เตอร์/บนมือถือ
import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Loader2, PackagePlus, Search, UserRound } from 'lucide-react'
import { api, type Parcel, type ParcelKind, type Property, type Unit } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { CARRIERS, PARCEL_KINDS } from '@/lib/parcels'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/common'
import { LineIcon } from '@/components/line'
import { PhotoPicker } from '@/components/tickets/parts'
import { PickupCode } from './parts'

type Mode = 'unit' | 'property'
const OTHER = 'อื่นๆ'

/** ผู้เช่าปัจจุบันของแต่ละห้อง (กำลังพัก > จองไว้) — ตรงกับที่เซิร์ฟเวอร์จับคู่ */
function useOccupants() {
  const bookings = useQuery({
    queryKey: ['bookings', 'current-occupants'],
    queryFn: () => api.bookings(),
    staleTime: 60_000,
    meta: { silent: true },
  })
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: api.tenants, meta: { silent: true } })
  return useMemo(() => {
    const lineOf = new Map((tenants.data ?? []).map((t) => [t.id, !!t.line_linked]))
    const m = new Map<number, { tenant_id: number; name: string; line: boolean; active: boolean }>()
    for (const b of bookings.data ?? []) {
      if (b.status !== 'active' && b.status !== 'reserved') continue
      const cur = m.get(b.unit_id)
      const active = b.status === 'active'
      if (cur && (cur.active || !active)) continue
      m.set(b.unit_id, { tenant_id: b.tenant_id, name: b.tenant_name, line: lineOf.get(b.tenant_id) ?? false, active })
    }
    return m
  }, [bookings.data, tenants.data])
}

export function ReceiveDialog({
  open,
  onOpenChange,
  units,
  properties,
  defaultPropertyId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  units: Unit[]
  properties: Property[]
  defaultPropertyId: number | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-lg">
        {open && (
          <ReceiveFlow
            units={units}
            properties={properties}
            defaultPropertyId={defaultPropertyId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReceiveFlow(props: {
  units: Unit[]
  properties: Property[]
  defaultPropertyId: number | null
  onDone: () => void
}) {
  const [created, setCreated] = useState<Parcel | null>(null)
  const [round, setRound] = useState(0)
  const [carrier, setCarrier] = useState('')
  if (created)
    return (
      <Received
        parcel={created}
        onNext={() => {
          setCreated(null)
          setRound((r) => r + 1)
        }}
        onDone={props.onDone}
      />
    )
  return (
    <ReceiveForm
      key={round}
      {...props}
      initialCarrier={carrier}
      onCreated={(p) => {
        setCarrier(p.carrier)
        setCreated(p)
      }}
    />
  )
}

function ReceiveForm({
  units,
  properties,
  defaultPropertyId,
  initialCarrier,
  onCreated,
  onDone,
}: {
  units: Unit[]
  properties: Property[]
  defaultPropertyId: number | null
  initialCarrier: string
  onCreated: (p: Parcel) => void
  onDone: () => void
}) {
  const occupants = useOccupants()
  const [mode, setMode] = useState<Mode>('unit')
  const [unitId, setUnitId] = useState<number | null>(null)
  const [propertyId, setPropertyId] = useState<number | null>(defaultPropertyId ?? properties[0]?.id ?? null)
  const [recipient, setRecipient] = useState('')
  const known = (CARRIERS as readonly string[]).includes(initialCarrier)
  const [carrier, setCarrier] = useState(known ? initialCarrier : initialCarrier ? OTHER : '')
  const [carrierOther, setCarrierOther] = useState(known ? '' : initialCarrier)
  const [tracking, setTracking] = useState('')
  const [kind, setKind] = useState<ParcelKind>('parcel')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<File[]>([])

  const occupant = unitId ? occupants.get(unitId) : undefined
  const needRecipient = mode === 'property' || (unitId != null && !occupant)
  const carrierValue = carrier === OTHER ? carrierOther.trim() : carrier

  const create = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      if (mode === 'unit' && unitId) fd.set('unit_id', String(unitId))
      else if (propertyId) fd.set('property_id', String(propertyId))
      fd.set('recipient_name', recipient.trim())
      fd.set('carrier', carrierValue)
      fd.set('tracking_no', tracking.trim())
      fd.set('kind', kind)
      fd.set('note', note.trim())
      if (photos[0]) fd.set('photo', photos[0])
      return api.createParcel(fd)
    },
    onSuccess: async (p) => {
      onCreated(p)
      await invalidate('parcels', 'dashboard')
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (mode === 'unit' && !unitId) return toast.error('กรุณาเลือกห้อง')
        if (mode === 'property' && !propertyId) return toast.error('กรุณาเลือกโครงการ')
        if (needRecipient && !recipient.trim()) return toast.error('กรุณาระบุชื่อผู้รับ')
        create.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>รับพัสดุ</DialogTitle>
        <DialogDescription>บันทึกพัสดุที่รับแทนผู้เช่า ระบบออกรหัสรับ 4 หลักให้อัตโนมัติ</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/50 p-1" role="radiogroup" aria-label="ระบุผู้รับ">
        {(
          [
            ['unit', 'ระบุห้อง'],
            ['property', 'ไม่ทราบห้อง / ห้องว่าง'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={mode === v}
            onClick={() => setMode(v)}
            className={cn(
              'h-9 rounded-sm px-2 text-sm transition-colors',
              mode === v ? 'bg-card font-medium shadow-xs ring-1 ring-border' : 'text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'unit' ? (
        <div className="grid gap-2">
          <Field label="ห้อง" htmlFor="pc-unit">
            <UnitPicker
              id="pc-unit"
              units={units}
              properties={properties}
              occupants={occupants}
              value={unitId}
              onChange={setUnitId}
            />
          </Field>
          {unitId != null &&
            (occupant ? (
              <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  ผู้รับ: <span className="font-medium">{occupant.name}</span>
                </span>
                {occupant.line ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-success">
                    <LineIcon className="size-3.5" /> แจ้งทาง LINE ได้
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">ยังไม่เชื่อม LINE</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-warning-foreground">ห้องนี้ไม่มีผู้เช่าในระบบ — กรุณาระบุชื่อผู้รับ</p>
            ))}
        </div>
      ) : (
        <Field label="โครงการ" htmlFor="pc-prop">
          <Select value={propertyId ? String(propertyId) : ''} onValueChange={(v) => setPropertyId(Number(v))}>
            <SelectTrigger id="pc-prop" className="h-10 w-full">
              <SelectValue placeholder="เลือกโครงการ" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field
        label={needRecipient ? 'ชื่อผู้รับ (บนกล่อง)' : 'ชื่อบนกล่อง (ถ้าต่างจากผู้เช่า)'}
        htmlFor="pc-recipient"
      >
        <Input
          id="pc-recipient"
          className="h-10"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          required={needRecipient}
          aria-invalid={(needRecipient && !recipient.trim()) || undefined}
        />
      </Field>

      <Field label="ขนส่ง">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="ขนส่ง">
          {[...CARRIERS, OTHER].map((c) => (
            <Chip key={c} active={carrier === c} onClick={() => setCarrier(carrier === c ? '' : c)}>
              {c}
            </Chip>
          ))}
        </div>
        {carrier === OTHER && (
          <Input
            className="mt-1.5 h-10"
            placeholder="ชื่อขนส่ง / ร้านค้า"
            value={carrierOther}
            onChange={(e) => setCarrierOther(e.target.value)}
            aria-label="ชื่อขนส่ง"
            autoFocus
          />
        )}
      </Field>

      <Field label="เลขพัสดุ (ถ้ามี)" htmlFor="pc-track">
        <Input
          id="pc-track"
          className="h-10 font-mono"
          value={tracking}
          onChange={(e) => setTracking(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          spellCheck={false}
        />
      </Field>

      <Field label="ประเภท">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="ประเภทพัสดุ">
          {(Object.keys(PARCEL_KINDS) as ParcelKind[]).map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {PARCEL_KINDS[k]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="รูปพัสดุ (แนะนำ)">
        <PhotoPicker files={photos} onChange={setPhotos} max={1} large />
      </Field>

      <Field label="หมายเหตุ" htmlFor="pc-note">
        <Textarea
          id="pc-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น วางไว้ชั้นวาง B, ต้องแช่เย็น"
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" className="h-11 sm:h-9" disabled={create.isPending}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <PackagePlus />}
          บันทึกรับพัสดุ
        </Button>
      </DialogFooter>
    </form>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'h-9 rounded-md border px-3 text-sm whitespace-nowrap transition-colors',
        active
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Received({ parcel, onNext, onDone }: { parcel: Parcel; onNext: () => void; onDone: () => void }) {
  const { line, lineReady } = useSession()
  const autoLine = lineReady && (line?.auto_parcel ?? true)
  const who = parcel.tenant_name ?? parcel.recipient_name
  let lineText: React.ReactNode
  if (!parcel.tenant_id) lineText = 'ไม่ได้ผูกกับผู้เช่าในระบบ — แจ้งผู้รับและรหัสด้วยตนเอง'
  else if (!parcel.tenant_line_linked) lineText = 'ผู้เช่ายังไม่เชื่อม LINE — แจ้งรหัสให้ผู้เช่าเอง (ดูได้ในพอร์ทัลผู้เช่าด้วย)'
  else if (!autoLine) lineText = 'ปิดการแจ้งพัสดุทาง LINE อัตโนมัติไว้ — กด “ส่งแจ้งเตือน” ในรายการได้'
  else
    lineText = (
      <span className="flex items-center gap-1.5 text-success">
        <LineIcon className="size-4" /> ส่งแจ้งเตือนพร้อมรหัสรับทาง LINE ให้ผู้เช่าแล้ว
      </span>
    )
  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Check className="size-5 text-success" /> บันทึกพัสดุแล้ว
        </DialogTitle>
        <DialogDescription>
          {parcel.unit_name ? `ห้อง ${parcel.unit_name} · ` : ''}
          {who || parcel.property_name}
        </DialogDescription>
      </DialogHeader>
      <PickupCode code={parcel.pickup_code} hint="เขียนรหัสนี้บนกล่อง หรือเก็บไว้ตรวจตอนส่งมอบ" />
      <div className="rounded-md border px-3 py-2.5 text-sm text-muted-foreground">{lineText}</div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          เสร็จ
        </Button>
        <Button type="button" className="h-11 sm:h-9" onClick={onNext}>
          <PackagePlus /> รับชิ้นถัดไป
        </Button>
      </DialogFooter>
    </div>
  )
}

/** เลือกห้องแบบค้นหาได้ (ค้นจากเลขห้อง โครงการ หรือชื่อผู้เช่า) */
function UnitPicker({
  id,
  units,
  properties,
  occupants,
  value,
  onChange,
}: {
  id?: string
  units: Unit[]
  properties: Property[]
  occupants: Map<number, { name: string; line: boolean }>
  value: number | null
  onChange: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const propName = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties])
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const m = new Map<number, Unit[]>()
    for (const u of units) {
      const hay = `${u.name} ${propName.get(u.property_id) ?? ''} ${occupants.get(u.id)?.name ?? ''}`.toLowerCase()
      if (term && !hay.includes(term)) continue
      const list = m.get(u.property_id)
      if (list) list.push(u)
      else m.set(u.property_id, [u])
    }
    return [...m.entries()].map(([pid, list]) => ({
      pid,
      name: propName.get(pid) ?? `โครงการ #${pid}`,
      list: list.sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true })),
    }))
  }, [units, q, propName, occupants])
  const selected = units.find((u) => u.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              ห้อง {selected.name}
              <span className="text-muted-foreground"> · {propName.get(selected.property_id)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">ค้นหาเลขห้องหรือชื่อผู้เช่า</span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="พิมพ์เลขห้อง หรือชื่อผู้เช่า"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="ค้นหาห้อง"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1" role="listbox">
          {groups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบห้อง</p>}
          {groups.map((g) => (
            <div key={g.pid}>
              <div className="px-2 pt-2 pb-1 text-xs text-muted-foreground">{g.name}</div>
              {g.list.map((u) => {
                const occ = occupants.get(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    role="option"
                    aria-selected={u.id === value}
                    onClick={() => {
                      onChange(u.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent',
                      u.id === value && 'bg-accent',
                    )}
                  >
                    <span className="shrink-0 font-medium tabular-nums">ห้อง {u.name}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{occ?.name ?? 'ว่าง'}</span>
                    {occ?.line && <LineIcon className="size-3.5 shrink-0" />}
                    {u.id === value && <Check className="size-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
