import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Loader2, Plus, Search } from 'lucide-react'
import { api, type HkTaskKind, type Member, type Property, type Unit } from '@/lib/api'
import { HK_KINDS } from '@/lib/housekeeping'
import { invalidate } from '@/lib/query'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/common'
import { HkIndicator } from '@/components/housekeeping-indicator'
import { refreshAround } from './use-task'

const NONE = 'none'

export function CreateTaskDialog({
  open,
  onOpenChange,
  units,
  properties,
  members,
  defaultDate,
  defaultUnitId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  units: Unit[]
  properties: Property[]
  members: Member[]
  defaultDate: string
  defaultUnitId?: number | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {open && (
          <CreateForm
            units={units}
            properties={properties}
            members={members}
            defaultDate={defaultDate}
            defaultUnitId={defaultUnitId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateForm({
  units,
  properties,
  members,
  defaultDate,
  defaultUnitId,
  onDone,
}: {
  units: Unit[]
  properties: Property[]
  members: Member[]
  defaultDate: string
  defaultUnitId?: number | null
  onDone: () => void
}) {
  const [unitId, setUnitId] = useState<number | null>(defaultUnitId ?? null)
  const [kind, setKind] = useState<HkTaskKind>('checkout_clean')
  const [due, setDue] = useState(defaultDate)
  const [assignee, setAssignee] = useState(NONE)
  const [notes, setNotes] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api.createHkTask({
        unit_id: unitId!,
        kind,
        due_date: due,
        assignee_user_id: assignee === NONE ? null : Number(assignee),
        notes: notes.trim() || undefined,
      }),
    onSuccess: async (t) => {
      toast.success(`สร้างงานห้อง ${t.unit_name} แล้ว`)
      onDone()
      await Promise.all([invalidate('hk-tasks'), refreshAround()])
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!unitId) return toast.error('กรุณาเลือกห้อง')
        create.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>สร้างงานแม่บ้าน</DialogTitle>
        <DialogDescription>ระบบจะเพิ่มรายการตรวจตามประเภทงานให้อัตโนมัติ</DialogDescription>
      </DialogHeader>
      <Field label="ห้อง" htmlFor="ct-unit">
        <UnitPicker id="ct-unit" units={units} properties={properties} value={unitId} onChange={setUnitId} />
      </Field>
      <Field label="ประเภทงาน" htmlFor="ct-kind">
        <Select value={kind} onValueChange={(v) => setKind(v as HkTaskKind)}>
          <SelectTrigger id="ct-kind" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(HK_KINDS) as HkTaskKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {HK_KINDS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="กำหนดเสร็จ" htmlFor="ct-due">
          <Input id="ct-due" type="date" className="h-10" value={due} onChange={(e) => setDue(e.target.value)} required />
        </Field>
        <Field label="ผู้รับผิดชอบ" htmlFor="ct-assignee">
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id="ct-assignee" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>ยังไม่มอบหมาย</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={String(m.user_id)}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="หมายเหตุ (ไม่บังคับ)" htmlFor="ct-notes">
        <Textarea id="ct-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          สร้างงาน
        </Button>
      </DialogFooter>
    </form>
  )
}

/** เลือกห้องแบบค้นหาได้ (จัดกลุ่มตามโครงการ) */
function UnitPicker({
  id,
  units,
  properties,
  value,
  onChange,
}: {
  id?: string
  units: Unit[]
  properties: Property[]
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
      const pn = propName.get(u.property_id) ?? ''
      if (term && !`${u.name} ${pn}`.toLowerCase().includes(term)) continue
      const list = m.get(u.property_id)
      if (list) list.push(u)
      else m.set(u.property_id, [u])
    }
    return [...m.entries()].map(([pid, list]) => ({
      pid,
      name: propName.get(pid) ?? `โครงการ #${pid}`,
      list: list.sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true })),
    }))
  }, [units, q, propName])
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
            <span className="text-muted-foreground">ค้นหาและเลือกห้อง</span>
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
            placeholder="พิมพ์เลขห้องหรือชื่อโครงการ"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="ค้นหาห้อง"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1" role="listbox">
          {groups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบห้อง</p>}
          {groups.map((g) => (
            <div key={g.pid}>
              <div className="px-2 pt-2 pb-1 text-xs text-muted-foreground">{g.name}</div>
              {g.list.map((u) => (
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
                  <span className="font-medium tabular-nums">ห้อง {u.name}</span>
                  <HkIndicator status={u.housekeeping_status} size="xs" />
                  {u.id === value && <Check className="ml-auto size-4" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
