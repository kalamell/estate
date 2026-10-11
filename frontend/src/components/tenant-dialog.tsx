import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { api, type Tenant, type TenantInput } from '@/lib/api'
import { invalidate } from '@/lib/query'
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
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/common'

const EMPTY: TenantInput = { full_name: '', phone: '', email: '', id_card: '', note: '' }

function TenantForm({
  onOpenChange,
  tenant,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  tenant?: Tenant | null
  onSaved?: (t: Tenant) => void
}) {
  const [form, setForm] = useState<TenantInput & { id?: number }>(() => (tenant ? { ...tenant } : EMPTY))

  const save = useMutation({
    mutationFn: () => api.saveTenant(form),
    onSuccess: async (t) => {
      toast.success('บันทึกผู้เช่าแล้ว')
      await invalidate('tenants')
      onSaved?.(t)
      onOpenChange(false)
    },
  })
  const set = (k: keyof TenantInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{form.id ? 'แก้ไขผู้เช่า' : 'เพิ่มผู้เช่า'}</DialogTitle>
        <DialogDescription>ข้อมูลติดต่อของผู้เช่าหรือแขกผู้เข้าพัก</DialogDescription>
      </DialogHeader>
      <Field label="ชื่อ-นามสกุล" htmlFor="t-name">
        <Input id="t-name" value={form.full_name} onChange={set('full_name')} required autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="เบอร์โทร" htmlFor="t-phone">
          <Input id="t-phone" value={form.phone} onChange={set('phone')} inputMode="tel" />
        </Field>
        <Field label="อีเมล" htmlFor="t-email">
          <Input id="t-email" type="email" value={form.email} onChange={set('email')} />
        </Field>
      </div>
      <Field label="เลขบัตรประชาชน / พาสปอร์ต" htmlFor="t-id">
        <Input id="t-id" value={form.id_card} onChange={set('id_card')} />
      </Field>
      <Field label="หมายเหตุ" htmlFor="t-note">
        <Textarea id="t-note" rows={2} value={form.note} onChange={set('note')} />
      </Field>
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

export function TenantDialog(props: React.ComponentProps<typeof TenantForm>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <TenantForm {...props} />
      </DialogContent>
    </Dialog>
  )
}
