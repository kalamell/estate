// รายละเอียดสัญญา — แก้ไขร่าง ส่งให้ผู้เช่า ลงนามฝ่ายผู้ให้เช่า ยกเลิก (/contracts/:id)
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Ban,
  Check,
  Eye,
  FileWarning,
  Loader2,
  Lock,
  PenLine,
  Pencil,
  Printer,
  Save,
  Send,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { ApiError, api, type Contract } from '@/lib/api'
import { invalidate, queryClient } from '@/lib/query'
import { placeholdersIn, shortUA, stampOf } from '@/lib/contracts'
import { dateTime, printHref } from '@/lib/docs'
import { sqlUtc } from '@/lib/billing'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Field, ToneBadge } from '@/components/common'
import { CopyField } from '@/components/copy-field'
import { LineIcon } from '@/components/line'
import { ReasonDialog } from '@/components/reason-dialog'
import { ContractBody } from '@/pages/print/contract'
import { ContractStatusBadge, LandlordSignDialog } from './parts'

const at = (s: string | null) => (s ? dateTime(sqlUtc(s)) : null)

export default function ContractDetailPage() {
  const id = Number(useParams().id)
  const q = useQuery({ queryKey: ['contract', id], queryFn: () => api.contract(id), meta: { silent: true } })
  if (q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[60svh] rounded-xl" />
      </div>
    )
  if (!q.data)
    return (
      <Card>
        <EmptyState
          icon={FileWarning}
          title={q.error instanceof ApiError && q.error.status === 404 ? 'ไม่พบสัญญานี้' : 'โหลดสัญญาไม่สำเร็จ'}
          action={
            <Button asChild variant="outline">
              <Link to="/contracts">
                <ArrowLeft /> สัญญาทั้งหมด
              </Link>
            </Button>
          }
        />
      </Card>
    )
  return <Detail key={q.data.id} c={q.data} />
}

function Detail({ c }: { c: Contract }) {
  const { canManage, readOnly } = useSession()
  const canEdit = canManage && !readOnly
  const isDraft = c.status === 'draft'
  const [title, setTitle] = useState(c.title)
  const [body, setBody] = useState(c.body)
  const [view, setView] = useState<'edit' | 'preview'>(isDraft && canEdit ? 'edit' : 'preview')
  const [sendOpen, setSendOpen] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const dirty = title !== c.title || body !== c.body
  const leftover = placeholdersIn(body)

  const tenants = useQuery({ queryKey: ['tenants'], queryFn: api.tenants, meta: { silent: true } })
  const token = tenants.data?.find((t) => t.id === c.tenant_id)?.portal_token ?? null
  const portalLink = token ? `${window.location.origin}/p/${token}/contract/${c.id}` : null

  const setData = (r: Contract) => queryClient.setQueryData(['contract', c.id], r)
  const save = useMutation({
    mutationFn: () => api.updateContract(c.id, { title: title.trim(), body }),
    onSuccess: async (r) => {
      toast.success('บันทึกร่างแล้ว')
      setData(r)
      await invalidate('contracts')
    },
  })
  const send = useMutation({
    mutationFn: async () => {
      if (dirty) await api.updateContract(c.id, { title: title.trim(), body })
      return api.sendContract(c.id)
    },
    onSuccess: async (r) => {
      toast.success(
        r.tenant_line_linked ? 'ส่งสัญญาแล้ว — แจ้งผู้เช่าทาง LINE แล้ว' : 'ส่งสัญญาแล้ว — ส่งลิงก์ให้ผู้เช่าเพื่อลงนาม',
      )
      setSendOpen(false)
      setData(r)
      await invalidate('contracts')
    },
  })
  const voidIt = useMutation({
    mutationFn: (reason: string) => api.voidContract(c.id, reason),
    onSuccess: async (r) => {
      toast.success('ยกเลิกสัญญาแล้ว')
      setVoidOpen(false)
      setData(r)
      await invalidate('contracts')
    },
  })

  const canLandlordSign = canEdit && (c.status === 'sent' || c.status === 'tenant_signed') && !c.landlord_signed_at

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Link to="/contracts" className="inline-flex h-8 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> สัญญาทั้งหมด
        </Link>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <h1 className="min-w-0 text-xl font-semibold">{c.title}</h1>
          <ContractStatusBadge status={c.status} className="mt-1" />
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">{c.doc_no}</span> · {c.tenant_name ?? 'ไม่มีผู้เช่า'} · ห้อง {c.unit_name} ·{' '}
          {c.property_name}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {isDraft && canEdit ? (
            <Card className="gap-0 py-0">
              <div className="flex flex-wrap items-center gap-2 border-b px-4">
                <Tabs value={view} onValueChange={(v) => setView(v as 'edit' | 'preview')}>
                  <TabsList variant="line" className="h-11">
                    <TabsTrigger value="edit" className="flex-none px-3">
                      <Pencil /> แก้ไข
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="flex-none px-3">
                      <Eye /> ตัวอย่าง
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <span className="ml-auto text-xs text-muted-foreground">
                  {dirty ? 'ยังไม่ได้บันทึก' : 'บันทึกแล้ว'}
                </span>
              </div>
              {view === 'edit' ? (
                <form
                  className="grid gap-4 p-4 sm:p-5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!title.trim() || !body.trim()) return toast.error('กรุณาระบุชื่อและเนื้อหาสัญญา')
                    save.mutate()
                  }}
                >
                  <Field label="ชื่อสัญญา" htmlFor="c-title">
                    <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                  </Field>
                  <Field label="เนื้อหา" htmlFor="c-body" hint="เว้นบรรทัดว่างเพื่อขึ้นย่อหน้าใหม่">
                    <Textarea
                      id="c-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={24}
                      className="min-h-[55svh] text-sm leading-relaxed"
                    />
                  </Field>
                  {leftover.length > 0 && <LeftoverWarning keys={leftover} />}
                  <div className="flex items-center gap-2">
                    {dirty && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setTitle(c.title)
                          setBody(c.body)
                        }}
                      >
                        คืนค่า
                      </Button>
                    )}
                    <Button type="submit" className="ml-auto" disabled={!dirty || save.isPending}>
                      {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                      บันทึกร่าง
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="px-4 py-5 sm:px-8 sm:py-8">
                  <ContractBody body={body} className="text-[15px] leading-[1.9]" />
                </div>
              )}
            </Card>
          ) : (
            <Card className="gap-0 py-0">
              {!isDraft && (
                <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5" />
                  {c.status === 'void'
                    ? `ยกเลิกแล้ว${c.void_reason ? ` — ${c.void_reason}` : ''}`
                    : 'เนื้อหาถูกล็อกตั้งแต่ส่งให้ผู้เช่า แก้ไขไม่ได้'}
                </div>
              )}
              <div className="px-4 py-5 sm:px-8 sm:py-8">
                <ContractBody body={c.body} className="text-[15px] leading-[1.9]" />
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="gap-3 px-4 py-4">
            <h2 className="text-sm font-semibold">ขั้นตอน</h2>
            <Steps c={c} />
          </Card>

          {c.status !== 'void' && (
            <Card className="gap-3 px-4 py-4">
              {isDraft ? (
                <>
                  <Button className="h-11 w-full sm:h-10" disabled={!canEdit} onClick={() => setSendOpen(true)}>
                    <Send /> ส่งให้ผู้เช่าลงนาม
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    เมื่อส่งแล้วเนื้อหาจะถูกล็อก — ตรวจทานให้เรียบร้อยก่อนส่ง
                  </p>
                </>
              ) : (
                <>
                  {canLandlordSign && (
                    <Button
                      className="h-11 w-full sm:h-10"
                      variant={c.status === 'tenant_signed' ? 'default' : 'outline'}
                      onClick={() => setSignOpen(true)}
                    >
                      <PenLine /> ลงนามฝ่ายผู้ให้เช่า
                    </Button>
                  )}
                  {c.status === 'sent' && (
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      {c.tenant_line_linked ? (
                        <>
                          <LineIcon className="mt-px size-3.5 shrink-0" /> แจ้งผู้เช่าทาง LINE แล้ว — ผู้เช่าลงนามในพอร์ทัลได้จากลิงก์ในข้อความ
                        </>
                      ) : (
                        'ผู้เช่ายังไม่เชื่อม LINE — ส่งลิงก์ด้านล่างให้ผู้เช่าเพื่อเปิดอ่านและลงนาม'
                      )}
                    </p>
                  )}
                  {portalLink && c.status === 'sent' && <CopyField value={portalLink} label="ลิงก์ลงนามของผู้เช่า" />}
                </>
              )}
              <Button asChild variant="outline" className="h-11 w-full sm:h-10">
                <a href={printHref('contract', c.id)} target="_blank" rel="noreferrer">
                  <Printer /> {isDraft ? 'พิมพ์ฉบับร่าง' : 'พิมพ์ / บันทึก PDF'}
                </a>
              </Button>
              {canEdit && (
                <Button
                  variant="ghost"
                  className="h-10 w-full text-destructive hover:text-destructive"
                  onClick={() => setVoidOpen(true)}
                >
                  <Ban /> ยกเลิกสัญญา
                </Button>
              )}
            </Card>
          )}
          {c.status === 'void' && (
            <Button asChild variant="outline" className="h-10 w-full">
              <a href={printHref('contract', c.id)} target="_blank" rel="noreferrer">
                <Printer /> พิมพ์
              </a>
            </Button>
          )}

          {c.tenant_signed_at && <Evidence c={c} />}
        </aside>
      </div>

      <SendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        c={c}
        dirty={dirty}
        leftover={leftover}
        pending={send.isPending}
        onConfirm={() => send.mutate()}
      />
      <LandlordSignDialog contract={c} open={signOpen} onOpenChange={setSignOpen} />
      <ReasonDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`ยกเลิกสัญญา ${c.doc_no}?`}
        description={
          c.status === 'draft'
            ? 'ร่างนี้จะถูกยกเลิก'
            : 'ผู้เช่าจะลงนามสัญญานี้ไม่ได้อีก และเอกสารจะแสดงว่า “ยกเลิก” — ใช้เมื่อต้องทำสัญญาใหม่แทน'
        }
        confirmText="ยกเลิกสัญญา"
        pending={voidIt.isPending}
        onConfirm={(r) => voidIt.mutate(r)}
      />
    </div>
  )
}

function LeftoverWarning({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/35 bg-warning/10 px-3 py-2.5 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>
        ยังมีตัวแปรที่ไม่ได้แทนค่า: <span className="font-mono">{keys.map((k) => `{{${k}}}`).join(' ')}</span> —
        แก้เป็นข้อความจริงก่อนส่ง
      </span>
    </div>
  )
}

function Steps({ c }: { c: Contract }) {
  const voided = c.status === 'void'
  const steps: { label: string; when: string | null; done: boolean }[] = [
    { label: 'สร้างร่าง', when: at(c.created_at), done: true },
    { label: 'ส่งให้ผู้เช่า (ล็อกเนื้อหา)', when: at(c.sent_at), done: !!c.sent_at },
    {
      label: `ผู้เช่าลงนาม${c.tenant_signed_name ? ` — ${c.tenant_signed_name}` : ''}`,
      when: at(c.tenant_signed_at),
      done: !!c.tenant_signed_at,
    },
    {
      label: `ผู้ให้เช่าลงนาม${c.landlord_signed_name ? ` — ${c.landlord_signed_name}` : ''}`,
      when: at(c.landlord_signed_at),
      done: !!c.landlord_signed_at,
    },
  ]
  const next = steps.findIndex((s) => !s.done)
  return (
    <ol className="grid gap-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold',
              s.done && 'border-success bg-success text-white',
              !s.done && i === next && !voided && 'border-warning bg-warning/15 text-warning-foreground',
              !s.done && (i !== next || voided) && 'text-muted-foreground',
            )}
          >
            {s.done ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className="grid min-w-0 gap-0.5 text-sm leading-tight">
            <span className={cn(!s.done && 'text-muted-foreground')}>{s.label}</span>
            {s.when && <span className="text-xs text-muted-foreground tabular-nums">{s.when}</span>}
          </span>
        </li>
      ))}
      {voided && (
        <li className="flex gap-3 text-sm text-destructive">
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-destructive/40 bg-destructive/10">
            <Ban className="size-3.5" />
          </span>
          ยกเลิกแล้ว
        </li>
      )}
    </ol>
  )
}

function Evidence({ c }: { c: Contract }) {
  return (
    <Card className="gap-3 px-4 py-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-muted-foreground" /> หลักฐานการลงนาม
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <SigThumb label="ผู้เช่า" url={c.tenant_signature_url} />
        <SigThumb label="ผู้ให้เช่า" url={c.landlord_signature_url} />
      </div>
      <dl className="grid gap-2 text-xs">
        <Row k="ผู้เช่าลงนาม" v={stampOf(c.tenant_signed_at, 'th')} />
        <Row k="IP" v={<span className="font-mono">{c.tenant_signed_ip || '—'}</span>} />
        <Row k="อุปกรณ์" v={shortUA(c.tenant_signed_ua)} />
        <Row k="รหัสเนื้อหา" v={<span className="font-mono break-all">{c.content_hash ?? '—'}</span>} />
      </dl>
    </Card>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

function SigThumb({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="grid gap-1">
      <div className="grid h-16 place-items-center overflow-hidden rounded-md border bg-white">
        {url ? (
          <img src={url} alt={`ลายมือชื่อ${label}`} className="max-h-14 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-[#8a877f]">ยังไม่ลงนาม</span>
        )}
      </div>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function SendDialog({
  open,
  onOpenChange,
  c,
  dirty,
  leftover,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  c: Contract
  dirty: boolean
  leftover: string[]
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ส่งสัญญาให้ผู้เช่าลงนาม?</DialogTitle>
          <DialogDescription>
            {c.tenant_name ?? 'ผู้เช่า'} · ห้อง {c.unit_name}
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2.5 text-sm">
          <li className="flex gap-2.5">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <b>เนื้อหาจะถูกล็อก</b> — ระบบเก็บรหัสตรวจสอบ (SHA-256) ของชื่อและเนื้อหา ณ เวลาที่ส่ง แก้ไขอีกไม่ได้
              หากต้องเปลี่ยนต้องยกเลิกแล้วทำสัญญาใหม่
            </span>
          </li>
          <li className="flex gap-2.5">
            {c.tenant_line_linked ? (
              <LineIcon className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Send className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span>
              {c.tenant_line_linked
                ? 'ผู้เช่าจะได้รับแจ้งทาง LINE พร้อมลิงก์เปิดอ่านและลงนามในพอร์ทัล'
                : 'ผู้เช่ายังไม่เชื่อม LINE — หลังส่งให้คัดลอกลิงก์ลงนามไปให้ผู้เช่าเอง'}
            </span>
          </li>
          <li className="flex gap-2.5">
            <PenLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>คุณลงนามฝ่ายผู้ให้เช่าได้หลังส่ง ก่อนหรือหลังผู้เช่าก็ได้</span>
          </li>
        </ul>
        {dirty && <ToneBadge tone="ink">จะบันทึกการแก้ไขล่าสุดก่อนส่ง</ToneBadge>}
        {leftover.length > 0 && <LeftoverWarning keys={leftover} />}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            ยังไม่ส่ง
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            ล็อกและส่ง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
