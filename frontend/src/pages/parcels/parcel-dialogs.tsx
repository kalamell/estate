// ส่งมอบพัสดุ (รหัส + ลายเซ็น + รูป) และรายละเอียดพัสดุ
import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BellRing, Check, Eye, EyeOff, HandHelping, Loader2, Trash2, Undo2 } from 'lucide-react'
import { api, type Parcel } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { sqlUtc } from '@/lib/billing'
import { dateTime } from '@/lib/docs'
import { KIND_ICON, PARCEL_KINDS } from '@/lib/parcels'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { LineIcon } from '@/components/line'
import { ReasonDialog } from '@/components/reason-dialog'
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad'
import { PhotoGrid, PhotoPicker } from '@/components/tickets/parts'
import { ParcelStatusBadge } from './parts'

const at = (s: string | null) => (s ? dateTime(sqlUtc(s)) : '—')
const recipientOf = (p: Parcel) => p.tenant_name || p.recipient_name || 'ไม่ระบุชื่อ'

/** หัวสรุปพัสดุ (ห้อง ผู้รับ ขนส่ง เลขพัสดุ) */
function ParcelSummary({ p }: { p: Parcel }) {
  const Icon = KIND_ICON[p.kind] ?? KIND_ICON.parcel
  return (
    <div className="flex items-start gap-3 rounded-md border px-3 py-2.5">
      {p.photo_url ? (
        <PhotoGrid photos={[p.photo_url]} className="[&>button]:size-14" />
      ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-6" />
        </span>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate font-medium">{recipientOf(p)}</div>
        <div className="text-xs text-muted-foreground">
          {p.unit_name ? `ห้อง ${p.unit_name} · ` : ''}
          {p.property_name}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{PARCEL_KINDS[p.kind] ?? p.kind}</span>
          {p.carrier && <span>· {p.carrier}</span>}
          {p.tracking_no && <span className="font-mono">· {p.tracking_no}</span>}
        </div>
      </div>
    </div>
  )
}

// ===================== ส่งมอบ =====================

export function HandoverDialog({ parcel, onClose }: { parcel: Parcel | null; onClose: () => void }) {
  return (
    <Dialog open={!!parcel} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-md">
        {parcel && <HandoverForm key={parcel.id} p={parcel} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function HandoverForm({ p, onClose }: { p: Parcel; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [by, setBy] = useState(p.tenant_name || p.recipient_name || '')
  const [photos, setPhotos] = useState<File[]>([])
  const [signed, setSigned] = useState(false)
  const sig = useRef<SignaturePadHandle>(null)
  const codeBad = code !== '' && !/^\d{4}$/.test(code)

  const pickup = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      if (code) fd.set('code', code)
      if (by.trim()) fd.set('picked_up_by', by.trim())
      const blob = await sig.current?.toBlob()
      if (blob) fd.set('signature', blob, 'signature.png')
      if (photos[0]) fd.set('photos', photos[0])
      return api.pickupParcel(p.id, fd)
    },
    onSuccess: async (r) => {
      toast.success(`ส่งมอบพัสดุให้ ${r.picked_up_by ?? recipientOf(r)} แล้ว`)
      onClose()
      await invalidate('parcels', 'dashboard')
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (codeBad) return toast.error('รหัสรับพัสดุต้องเป็นตัวเลข 4 หลัก')
        if (!by.trim()) return toast.error('กรุณาระบุชื่อผู้รับพัสดุ')
        pickup.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>ส่งมอบพัสดุ</DialogTitle>
        <DialogDescription>ตรวจรหัสรับจากผู้เช่า แล้วให้ผู้รับเซ็นชื่อ</DialogDescription>
      </DialogHeader>
      <ParcelSummary p={p} />

      <Field
        label="รหัสรับพัสดุ 4 หลัก (แนะนำ)"
        htmlFor="ho-code"
        hint={
          codeBad ? (
            <span className="text-destructive">ตัวเลข 4 หลัก</span>
          ) : (
            'ผู้เช่าดูรหัสได้ในข้อความ LINE หรือพอร์ทัล — เว้นว่างได้ถ้ายืนยันตัวตนด้วยวิธีอื่น'
          )
        }
      >
        <Input
          id="ho-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          aria-invalid={codeBad || undefined}
          className="h-14 text-center font-mono text-3xl tracking-[0.5em] tabular-nums"
          placeholder="••••"
          autoFocus
        />
      </Field>

      <Field label="ชื่อผู้มารับ" htmlFor="ho-by" hint="แก้ได้ถ้ามีผู้รับแทน">
        <Input id="ho-by" className="h-10" value={by} onChange={(e) => setBy(e.target.value)} required />
      </Field>

      <SignaturePad ref={sig} onChange={setSigned} />

      <Field label="รูปตอนส่งมอบ (ไม่บังคับ)">
        <PhotoPicker files={photos} onChange={setPhotos} max={1} large />
      </Field>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="submit" className="h-11 sm:h-9" disabled={pickup.isPending}>
          {pickup.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          ยืนยันส่งมอบ{!signed && !code ? ' (ไม่มีลายเซ็น)' : ''}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ===================== รายละเอียด =====================

export function ParcelDetailDialog({
  parcel,
  onClose,
  onHandover,
}: {
  parcel: Parcel | null
  onClose: () => void
  onHandover: (p: Parcel) => void
}) {
  return (
    <Dialog open={!!parcel} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-md">
        {parcel && <Detail key={parcel.id} p={parcel} onClose={onClose} onHandover={() => onHandover(parcel)} />}
      </DialogContent>
    </Dialog>
  )
}

function Detail({ p, onClose, onHandover }: { p: Parcel; onClose: () => void; onHandover: () => void }) {
  const { readOnly, canManage, lineReady } = useSession()
  const confirm = useConfirm()
  const [showCode, setShowCode] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const waiting = p.status === 'waiting'

  const notify = useMutation({
    mutationFn: () => api.notifyParcel(p.id),
    onSuccess: async () => {
      toast.success('ส่งแจ้งเตือนทาง LINE แล้ว')
      await invalidate('parcels')
    },
  })
  const ret = useMutation({
    mutationFn: (note: string) => api.returnParcel(p.id, note),
    onSuccess: async () => {
      toast.success('บันทึกตีกลับแล้ว')
      setReturnOpen(false)
      onClose()
      await invalidate('parcels', 'dashboard')
    },
  })
  const remove = useMutation({
    mutationFn: () => api.deleteParcel(p.id),
    onSuccess: async () => {
      toast.success('ลบรายการแล้ว')
      onClose()
      await invalidate('parcels', 'dashboard')
    },
  })

  const timeline: { label: string; value: string; sub?: string }[] = [
    { label: 'รับไว้', value: at(p.received_at), sub: p.received_by_name ? `โดย ${p.received_by_name}` : undefined },
  ]
  if (p.notified_at) timeline.push({ label: 'แจ้ง LINE', value: at(p.notified_at) })
  if (p.status === 'picked_up')
    timeline.push({
      label: 'ส่งมอบ',
      value: at(p.picked_up_at),
      sub: [p.picked_up_by && `ผู้รับ ${p.picked_up_by}`, p.handed_by_name && `ส่งโดย ${p.handed_by_name}`]
        .filter(Boolean)
        .join(' · '),
    })
  if (p.status === 'returned')
    timeline.push({ label: 'ตีกลับ', value: at(p.picked_up_at), sub: p.handed_by_name ? `โดย ${p.handed_by_name}` : undefined })

  const photos = [p.photo_url, p.pickup_photo_url].filter((u): u is string => !!u)

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          พัสดุ #{p.id} <ParcelStatusBadge parcel={p} />
        </DialogTitle>
        <DialogDescription>
          {p.unit_name ? `ห้อง ${p.unit_name} · ` : ''}
          {p.property_name}
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-md border px-3 py-2.5 text-sm">
        <dt className="text-muted-foreground">ผู้รับ</dt>
        <dd className="text-right">
          {recipientOf(p)}
          {p.tenant_name && p.recipient_name && p.recipient_name !== p.tenant_name && (
            <span className="block text-xs text-muted-foreground">ชื่อบนกล่อง: {p.recipient_name}</span>
          )}
        </dd>
        <dt className="text-muted-foreground">ประเภท</dt>
        <dd className="text-right">{PARCEL_KINDS[p.kind] ?? p.kind}</dd>
        {p.carrier && (
          <>
            <dt className="text-muted-foreground">ขนส่ง</dt>
            <dd className="text-right">{p.carrier}</dd>
          </>
        )}
        {p.tracking_no && (
          <>
            <dt className="text-muted-foreground">เลขพัสดุ</dt>
            <dd className="text-right font-mono text-xs leading-5 break-all">{p.tracking_no}</dd>
          </>
        )}
        {waiting && (
          <>
            <dt className="text-muted-foreground">รหัสรับ</dt>
            <dd className="flex items-center justify-end gap-1">
              <span className="font-mono font-semibold tracking-widest tabular-nums">{showCode ? p.pickup_code : '••••'}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label={showCode ? 'ซ่อนรหัส' : 'แสดงรหัส'}
                onClick={() => setShowCode((v) => !v)}
              >
                {showCode ? <EyeOff /> : <Eye />}
              </Button>
            </dd>
          </>
        )}
        {p.tenant_id && (
          <>
            <dt className="text-muted-foreground">LINE</dt>
            <dd className="flex items-center justify-end gap-1.5 text-right">
              {p.tenant_line_linked ? (
                <>
                  <LineIcon className="size-3.5" /> เชื่อมแล้ว
                </>
              ) : (
                <span className="text-muted-foreground">ยังไม่เชื่อม</span>
              )}
            </dd>
          </>
        )}
      </dl>

      {p.note && <p className="rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-line">{p.note}</p>}

      <ol className="grid gap-2 border-l pl-4">
        {timeline.map((t) => (
          <li key={t.label} className="relative text-sm">
            <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" />
            <span className="font-medium">{t.label}</span>{' '}
            <span className="text-muted-foreground tabular-nums">{t.value}</span>
            {t.sub && <span className="block text-xs text-muted-foreground">{t.sub}</span>}
          </li>
        ))}
      </ol>

      {photos.length > 0 && (
        <div className="grid gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">รูปภาพ</div>
          <PhotoGrid photos={photos} />
        </div>
      )}
      {p.signature_url && (
        <div className="grid gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">ลายเซ็นผู้รับ</div>
          <img src={p.signature_url} alt="ลายเซ็นผู้รับ" className="h-28 w-full rounded-md border bg-white object-contain" />
        </div>
      )}

      {waiting && (
        <div className="grid gap-2 border-t pt-4">
          <Button className="h-11 sm:h-9" onClick={onHandover} disabled={readOnly}>
            <HandHelping /> ส่งมอบ
          </Button>
          <div className="flex flex-wrap gap-2">
            {p.tenant_id && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => notify.mutate()}
                disabled={readOnly || !lineReady || !p.tenant_line_linked || notify.isPending}
                title={!lineReady ? 'ยังไม่ได้ตั้งค่า LINE OA' : !p.tenant_line_linked ? 'ผู้เช่ายังไม่เชื่อม LINE' : undefined}
              >
                {notify.isPending ? <Loader2 className="animate-spin" /> : <BellRing />}
                ส่งแจ้งเตือนอีกครั้ง
              </Button>
            )}
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setReturnOpen(true)} disabled={readOnly}>
              <Undo2 /> ตีกลับ
            </Button>
          </div>
        </div>
      )}
      {canManage && (
        <DialogFooter className="border-t pt-4 sm:justify-start">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={readOnly || remove.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: 'ลบรายการพัสดุนี้?',
                  description: 'ใช้เมื่อบันทึกผิด — ประวัติการรับ-ส่งมอบของรายการนี้จะหายไป',
                  confirmText: 'ลบ',
                  destructive: true,
                })
              )
                remove.mutate()
            }}
          >
            <Trash2 /> ลบรายการ
          </Button>
        </DialogFooter>
      )}

      <ReasonDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title="ตีกลับพัสดุ"
        description="เช่น ไม่มีผู้รับ ผู้เช่าย้ายออกแล้ว หรือส่งคืนผู้ส่ง"
        confirmText="บันทึกตีกลับ"
        pending={ret.isPending}
        onConfirm={(r) => ret.mutate(r)}
      />
    </div>
  )
}
