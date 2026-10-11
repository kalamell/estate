import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building, Check, DoorOpen, Loader2, Package as PackageIcon, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { api, type Features, type Package, type PackageInput } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { baht } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Field } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { FEATURE_LABELS } from '@/lib/features'

const EMPTY: PackageInput = {
  name: '',
  description: '',
  price_monthly: 0,
  price_yearly: 0,
  max_properties: 1,
  max_units: 20,
  max_members: 2,
  features: { ocr: false, view3d: false, short_stay: false, invoices: true, portal: false, reports: false },
  is_active: true,
  is_default: false,
  sort_order: 0,
}

/** จำนวนเดือนของราคารายปีอัตโนมัติ (ตั้งค่าที่ ค่าบริการ → ตั้งค่าผู้ให้บริการ) */
function useYearlyMonths() {
  return (
    useQuery({
      queryKey: ['admin', 'billing', 'settings'],
      queryFn: () => api.admin.billing({ status: 'review' }),
      meta: { silent: true },
    }).data?.settings.yearly_months ?? 10
  )
}

export default function AdminPackages() {
  const confirm = useConfirm()
  const months = useYearlyMonths()
  const { data: packages, isLoading } = useQuery({ queryKey: ['admin', 'packages'], queryFn: api.admin.packages })
  const [editing, setEditing] = useState<Package | null>(null)
  const [open, setOpen] = useState(false)
  const remove = useMutation({
    mutationFn: (id: number) => api.admin.deletePackage(id),
    onSuccess: async () => {
      toast.success('ลบแพ็กเกจแล้ว')
      await invalidate('admin')
    },
  })
  const edit = (p: Package | null) => {
    setEditing(p)
    setOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">แพ็กเกจ</h1>
          <p className="text-sm text-muted-foreground">กำหนดราคา ขีดจำกัด และฟีเจอร์ของแต่ละแพ็กเกจ</p>
        </div>
        <Button className="ml-auto" onClick={() => edit(null)}>
          <Plus /> สร้างแพ็กเกจ
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : !packages?.length ? (
        <Card>
          <EmptyState icon={PackageIcon} title="ยังไม่มีแพ็กเกจ" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((p) => (
            <Card key={p.id} className={cn('relative gap-4', !p.is_active && 'opacity-70', p.is_default && 'border-primary/40')}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                  {p.is_default && (
                    <Badge variant="outline" className="border-primary/40 text-primary">ค่าเริ่มต้น</Badge>
                  )}
                  {!p.is_active && <Badge variant="outline">ปิดใช้งาน</Badge>}
                </div>
                {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight tabular-nums">{baht(p.price_monthly)}</span>
                    <span className="text-sm text-muted-foreground">/ เดือน</span>
                  </div>
                  {p.price_monthly > 0 && (
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {baht(p.price_yearly || p.price_monthly * months)} / ปี
                      {!p.price_yearly && ` (อัตโนมัติ × ${months} เดือน)`}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {[
                    { icon: Building, label: 'โครงการ', v: p.max_properties },
                    { icon: DoorOpen, label: 'ห้อง', v: p.max_units },
                    { icon: Users, label: 'สมาชิก', v: p.max_members },
                  ].map((l) => (
                    <div key={l.label} className="rounded-lg bg-muted/60 p-2">
                      <l.icon className="mx-auto mb-1 size-4 text-muted-foreground" />
                      <div className="text-base font-semibold tabular-nums">{l.v.toLocaleString('th-TH')}</div>
                      <div className="text-muted-foreground">{l.label}</div>
                    </div>
                  ))}
                </div>
                <Separator />
                <ul className="space-y-1.5 text-sm">
                  {(Object.keys(FEATURE_LABELS) as (keyof Features)[]).map((k) => (
                    <li key={k} className={cn('flex items-center gap-2', !p.features[k] && 'text-muted-foreground')}>
                      {p.features[k] ? (
                        <Check className="size-4 text-success" />
                      ) : (
                        <X className="size-4 text-muted-foreground/60" />
                      )}
                      {FEATURE_LABELS[k].label}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="mt-auto gap-2 border-t pt-4">
                <span className="text-xs text-muted-foreground">ใช้งาน {p.org_count} องค์กร · ลำดับ {p.sort_order}</span>
                <div className="ml-auto flex gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={() => edit(p)} aria-label={`แก้ไข ${p.name}`}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label={`ลบ ${p.name}`}
                    disabled={p.org_count > 0}
                    title={p.org_count > 0 ? 'มีองค์กรใช้งานอยู่ ลบไม่ได้' : undefined}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `ลบแพ็กเกจ “${p.name}”?`,
                          confirmText: 'ลบ',
                          destructive: true,
                        })
                      )
                        remove.mutate(p.id)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      <PackageDialog open={open} onOpenChange={setOpen} pkg={editing} />
    </div>
  )
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

type NumField = 'price_monthly' | 'price_yearly' | 'max_properties' | 'max_units' | 'max_members' | 'sort_order'

function PackageForm({ onOpenChange, pkg }: { open: boolean; onOpenChange: (o: boolean) => void; pkg: Package | null }) {
  const months = useYearlyMonths()
  const [form, setForm] = useState<PackageInput>(() =>
    pkg
      ? {
          name: pkg.name,
          description: pkg.description ?? '',
          price_monthly: pkg.price_monthly,
          price_yearly: pkg.price_yearly ?? 0,
          max_properties: pkg.max_properties,
          max_units: pkg.max_units,
          max_members: pkg.max_members,
          features: { ...EMPTY.features, ...pkg.features },
          is_active: pkg.is_active,
          is_default: pkg.is_default,
          sort_order: pkg.sort_order,
        }
      : EMPTY,
  )

  const save = useMutation({
    mutationFn: () => (pkg ? api.admin.updatePackage(pkg.id, form) : api.admin.createPackage(form)),
    onSuccess: async () => {
      toast.success('บันทึกแพ็กเกจแล้ว')
      await invalidate('admin')
      onOpenChange(false)
    },
  })
  const numIn = (k: NumField) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value === '' ? 0 : Number(e.target.value) }))
  const setFeature = (k: keyof Features, v: boolean) => setForm((f) => ({ ...f, features: { ...f.features, [k]: v } }))

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{pkg ? `แก้ไขแพ็กเกจ ${pkg.name}` : 'สร้างแพ็กเกจ'}</DialogTitle>
        <DialogDescription>ขีดจำกัดต้องมีค่าอย่างน้อย 1 · ราคารวม VAT</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="ชื่อแพ็กเกจ" htmlFor="pk-name" className="sm:col-span-2">
          <Input id="pk-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </Field>
        <Field label="ราคา/เดือน (฿)" htmlFor="pk-price">
          <Input id="pk-price" type="number" min={0} step="0.01" value={form.price_monthly} onChange={numIn('price_monthly')} />
        </Field>
        <Field label="คำอธิบาย" htmlFor="pk-desc" className="sm:col-span-2">
          <Textarea id="pk-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <Field
          label="ราคา/ปี (฿)"
          htmlFor="pk-price-y"
          hint={
            form.price_yearly > 0
              ? form.price_monthly > 0 && form.price_yearly < form.price_monthly * 12
                ? `ลูกค้าประหยัด ${baht(form.price_monthly * 12 - form.price_yearly)} ต่อปี`
                : 'กำหนดเอง'
              : `ว่าง = อัตโนมัติ ${baht(form.price_monthly * months)} (× ${months} เดือน)`
          }
        >
          <Input
            id="pk-price-y"
            type="number"
            min={0}
            step="0.01"
            value={form.price_yearly || ''}
            placeholder={`อัตโนมัติ ${(form.price_monthly * months).toLocaleString('th-TH')}`}
            onChange={numIn('price_yearly')}
          />
        </Field>
        <Field label="จำนวนโครงการสูงสุด" htmlFor="pk-mp">
          <Input id="pk-mp" type="number" min={1} value={form.max_properties} onChange={numIn('max_properties')} required />
        </Field>
        <Field label="จำนวนห้องสูงสุด" htmlFor="pk-mu">
          <Input id="pk-mu" type="number" min={1} value={form.max_units} onChange={numIn('max_units')} required />
        </Field>
        <Field label="จำนวนสมาชิกสูงสุด" htmlFor="pk-mm">
          <Input id="pk-mm" type="number" min={1} value={form.max_members} onChange={numIn('max_members')} required />
        </Field>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">ฟีเจอร์</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(FEATURE_LABELS) as (keyof Features)[]).map((k) => (
            <SwitchRow key={k} id={`pk-f-${k}`} label={FEATURE_LABELS[k].label} checked={form.features[k]} onChange={(v) => setFeature(k, v)} />
          ))}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <SwitchRow id="pk-active" label="เปิดใช้งาน" hint="แสดงให้เลือกได้" checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
        <SwitchRow id="pk-default" label="ค่าเริ่มต้น" hint="สำหรับองค์กรใหม่" checked={form.is_default} onChange={(v) => setForm((f) => ({ ...f, is_default: v }))} />
        <Field label="ลำดับการแสดง" htmlFor="pk-sort">
          <Input id="pk-sort" type="number" value={form.sort_order} onChange={numIn('sort_order')} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          บันทึก
        </Button>
      </DialogFooter>
    </form>
  )
}

function PackageDialog(props: React.ComponentProps<typeof PackageForm>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <PackageForm {...props} />
      </DialogContent>
    </Dialog>
  )
}
