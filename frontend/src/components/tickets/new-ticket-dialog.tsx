import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { api, type Ticket, type TicketPriority } from '@/lib/api'
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
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/common'
import { PRIORITY } from './labels'
import { PhotoPicker } from './parts'

const NONE = 'none'

export function NewTicketDialog({
  open,
  onOpenChange,
  title,
  description,
  categories,
  withUnit,
  create,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  categories: Record<string, string>
  /** เลือกห้อง/ผู้เช่าได้ (คำร้องภายในองค์กร) */
  withUnit?: boolean
  create: (fd: FormData) => Promise<Ticket>
  onCreated?: (t: Ticket) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {open && (
          <TicketForm
            title={title}
            description={description}
            categories={categories}
            withUnit={withUnit}
            create={create}
            onDone={(t) => {
              onOpenChange(false)
              onCreated?.(t)
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TicketForm({
  title,
  description,
  categories,
  withUnit,
  create,
  onDone,
  onCancel,
}: {
  title: string
  description?: string
  categories: Record<string, string>
  withUnit?: boolean
  create: (fd: FormData) => Promise<Ticket>
  onDone: (t: Ticket) => void
  onCancel: () => void
}) {
  const [category, setCategory] = useState(Object.keys(categories)[0])
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [propertyId, setPropertyId] = useState(NONE)
  const [unitId, setUnitId] = useState(NONE)
  const [tenantId, setTenantId] = useState(NONE)

  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties, enabled: !!withUnit })
  const units = useQuery({
    queryKey: ['units', Number(propertyId)],
    queryFn: () => api.units(Number(propertyId)),
    enabled: !!withUnit && propertyId !== NONE,
  })
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: api.tenants, enabled: !!withUnit })

  const save = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.set('category', category)
      fd.set('priority', priority)
      fd.set('title', subject.trim())
      fd.set('description', body.trim())
      if (withUnit && unitId !== NONE) fd.set('unit_id', unitId)
      if (withUnit && tenantId !== NONE) fd.set('tenant_id', tenantId)
      for (const f of files) fd.append('photos', f)
      return create(fd)
    },
    onSuccess: (t) => {
      toast.success('ส่งคำร้องแล้ว')
      onDone(t)
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (subject.trim()) save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="หมวดหมู่" htmlFor="nt-cat">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="nt-cat" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(categories).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ความเร่งด่วน" htmlFor="nt-pri">
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger id="nt-pri" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY) as TicketPriority[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {PRIORITY[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {withUnit && (
          <>
            <Field label="โครงการ" htmlFor="nt-prop">
              <Select
                value={propertyId}
                onValueChange={(v) => {
                  setPropertyId(v)
                  setUnitId(NONE)
                }}
              >
                <SelectTrigger id="nt-prop" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>ไม่ระบุ</SelectItem>
                  {properties.data?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ห้อง" htmlFor="nt-unit">
              <Select value={unitId} onValueChange={setUnitId} disabled={propertyId === NONE}>
                <SelectTrigger id="nt-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>ไม่ระบุ</SelectItem>
                  {units.data?.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ผู้เช่า (ถ้ามี)" htmlFor="nt-tenant" className="sm:col-span-2">
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger id="nt-tenant" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>ไม่ระบุ</SelectItem>
                  {tenants.data?.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
      </div>
      <Field label="หัวข้อ" htmlFor="nt-title">
        <Input id="nt-title" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </Field>
      <Field label="รายละเอียด" htmlFor="nt-desc">
        <Textarea id="nt-desc" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="รูปภาพประกอบ">
        <PhotoPicker files={files} onChange={setFiles} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={!subject.trim() || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          ส่งคำร้อง
        </Button>
      </DialogFooter>
    </form>
  )
}
