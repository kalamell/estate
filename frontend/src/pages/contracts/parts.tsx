// สัญญา: ป้ายสถานะ กล่องสร้างสัญญา และกล่องลงนามฝ่ายผู้ให้เช่า
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FilePlus2, Loader2, PenLine, TriangleAlert } from 'lucide-react'
import { api, type Contract, type ContractStatus } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { CONTRACT_KINDS, CONTRACT_STATUS } from '@/lib/contracts'
import { thDate } from '@/lib/format'
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
import { Field, ToneBadge } from '@/components/common'
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad'

export function ContractStatusBadge({ status, className }: { status: ContractStatus; className?: string }) {
  const s = CONTRACT_STATUS[status] ?? CONTRACT_STATUS.draft
  return (
    <ToneBadge tone={s.tone} className={className}>
      {s.label}
    </ToneBadge>
  )
}

// ===================== สร้างสัญญาจากการจอง =====================

export function CreateContractDialog({
  open,
  onOpenChange,
  bookingId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  bookingId?: number | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {open && <CreateForm bookingId={bookingId ?? null} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function CreateForm({ bookingId, onClose }: { bookingId: number | null; onClose: () => void }) {
  const navigate = useNavigate()
  const bookings = useQuery({ queryKey: ['bookings', {}], queryFn: () => api.bookings() })
  const templates = useQuery({ queryKey: ['contract-templates'], queryFn: api.contractTemplates })
  const [booking, setBooking] = useState(bookingId ? String(bookingId) : '')
  const [template, setTemplate] = useState('')
  const options = useMemo(
    () =>
      (bookings.data ?? [])
        .filter((b) => b.status !== 'cancelled' || String(b.id) === booking)
        .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || b.id - a.id),
    [bookings.data, booking],
  )
  const list = templates.data?.templates ?? []
  const tpl = template || String(list.find((t) => t.is_default)?.id ?? list[0]?.id ?? '')
  const existing = useQuery({
    queryKey: ['contracts', { booking_id: Number(booking) }],
    queryFn: () => api.contracts({ booking_id: Number(booking) }),
    enabled: !!booking,
  })
  const active = (existing.data ?? []).filter((c) => c.status !== 'void')

  const create = useMutation({
    mutationFn: () => api.createContract({ booking_id: Number(booking), template_id: tpl ? Number(tpl) : null }),
    onSuccess: async ({ contract, unknown_placeholders }) => {
      if (unknown_placeholders.length)
        toast.warning(`สร้างร่างแล้ว แต่มีตัวแปรที่ไม่รู้จัก: ${unknown_placeholders.map((k) => `{{${k}}}`).join(' ')}`)
      else toast.success(`สร้างร่างสัญญา ${contract.doc_no} แล้ว`)
      await invalidate('contracts')
      onClose()
      navigate(`/contracts/${contract.id}`)
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!booking) return toast.error('กรุณาเลือกการจอง')
        create.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>สร้างสัญญา</DialogTitle>
        <DialogDescription>
          ระบบเติมชื่อผู้เช่า ห้อง ค่าเช่า และเงินประกันจากการจองให้ — แก้ไขเนื้อหาได้ก่อนส่งให้ผู้เช่าลงนาม
        </DialogDescription>
      </DialogHeader>
      <Field label="การจอง" htmlFor="ct-booking">
        <Select value={booking} onValueChange={setBooking}>
          <SelectTrigger id="ct-booking" className="w-full" disabled={bookings.isLoading}>
            <SelectValue placeholder={bookings.isLoading ? 'กำลังโหลด…' : 'เลือกการจอง'} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                <span className="truncate">
                  ห้อง {b.unit_name} · {b.tenant_name}
                  <span className="text-muted-foreground">
                    {' '}
                    · {b.kind === 'lease' ? 'รายเดือน' : 'รายวัน'} {thDate(b.start_date)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="แม่แบบ"
        htmlFor="ct-template"
        hint="แก้ไขหรือเพิ่มแม่แบบได้ที่แท็บ “แม่แบบสัญญา”"
      >
        <Select value={tpl} onValueChange={setTemplate}>
          <SelectTrigger id="ct-template" className="w-full" disabled={templates.isLoading}>
            <SelectValue placeholder="เลือกแม่แบบ" />
          </SelectTrigger>
          <SelectContent>
            {list.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
                <span className="text-muted-foreground">
                  {' '}
                  · {CONTRACT_KINDS[t.kind] ?? t.kind}
                  {t.is_default ? ' · ค่าเริ่มต้น' : ''}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {active.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/35 bg-warning/10 px-3 py-2.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            การจองนี้มีสัญญาอยู่แล้ว:{' '}
            {active.map((c) => `${c.doc_no} (${CONTRACT_STATUS[c.status].label})`).join(', ')}
          </span>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={!booking || create.isPending}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
          สร้างร่างสัญญา
        </Button>
      </DialogFooter>
    </form>
  )
}

// ===================== ผู้ให้เช่าลงนาม =====================

export function LandlordSignDialog({
  contract,
  open,
  onOpenChange,
}: {
  contract: Contract
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-md">
        {open && <LandlordSignForm c={contract} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function LandlordSignForm({ c, onClose }: { c: Contract; onClose: () => void }) {
  const { user } = useSession()
  const [name, setName] = useState(user?.name ?? '')
  const [signed, setSigned] = useState(false)
  const sig = useRef<SignaturePadHandle>(null)
  const sign = useMutation({
    mutationFn: async () => {
      const blob = await sig.current?.toBlob()
      if (!blob) throw new Error('กรุณาลงลายมือชื่อ')
      const fd = new FormData()
      fd.set('signature', blob, 'signature.png')
      fd.set('signed_name', name.trim())
      return api.landlordSignContract(c.id, fd)
    },
    onSuccess: async (r) => {
      toast.success(r.status === 'completed' ? 'ลงนามครบทั้งสองฝ่ายแล้ว' : 'ลงนามฝ่ายผู้ให้เช่าแล้ว — รอผู้เช่าลงนาม')
      onClose()
      await invalidate('contracts', 'contract')
    },
  })
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return toast.error('กรุณาระบุชื่อผู้ลงนาม')
        if (!signed) return toast.error('กรุณาลงลายมือชื่อ')
        sign.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>ลงนามฝ่ายผู้ให้เช่า</DialogTitle>
        <DialogDescription>
          {c.doc_no} · {c.tenant_name ?? 'ผู้เช่า'} · ห้อง {c.unit_name}
        </DialogDescription>
      </DialogHeader>
      <Field label="ชื่อผู้ลงนาม (ผู้ให้เช่าหรือผู้มีอำนาจลงนาม)" htmlFor="ll-name">
        <Input id="ll-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <SignaturePad ref={sig} onChange={setSigned} label="ลายมือชื่อผู้ให้เช่า" />
      <p className="text-xs text-muted-foreground">
        ระบบบันทึกชื่อ ลายมือชื่อ เวลา และผู้ใช้ที่ลงนามไว้เป็นหลักฐาน — ลงนามได้ครั้งเดียว
      </p>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={sign.isPending}>
          {sign.isPending ? <Loader2 className="animate-spin" /> : <PenLine />}
          ลงนาม
        </Button>
      </DialogFooter>
    </form>
  )
}
