import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, Loader2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'

const EMPTY: TenantInput = {
  full_name: '',
  phone: '',
  email: '',
  id_card: '',
  note: '',
  tax_id: '',
  address: '',
  branch_code: '',
}

const toInput = (t: Tenant): TenantInput & { id: number } => ({
  id: t.id,
  full_name: t.full_name,
  phone: t.phone ?? '',
  email: t.email ?? '',
  id_card: t.id_card ?? '',
  note: t.note ?? '',
  tax_id: t.tax_id ?? '',
  address: t.address ?? '',
  branch_code: t.branch_code ?? '',
})

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
  const [form, setForm] = useState<TenantInput & { id?: number }>(() => (tenant ? toInput(tenant) : EMPTY))
  const [showTax, setShowTax] = useState(() => !!(tenant?.tax_id || tenant?.address || tenant?.branch_code))
  const taxDigits = form.tax_id.replace(/\D/g, '')
  const taxInvalid = form.tax_id.trim() !== '' && taxDigits.length !== 13

  const save = useMutation({
    mutationFn: () => api.saveTenant({ ...form, tax_id: taxDigits }),
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
        if (taxInvalid) {
          setShowTax(true)
          return toast.error('เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก')
        }
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
      <div className="rounded-md border">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium"
          aria-expanded={showTax}
          onClick={() => setShowTax((v) => !v)}
        >
          สำหรับออกใบเสร็จ/ใบกำกับภาษีในนามนิติบุคคล
          <ChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', showTax && 'rotate-180')} />
        </button>
        {showTax && (
          <div className="grid gap-4 border-t p-3">
            <Field label="ที่อยู่ (ตามที่จะพิมพ์บนเอกสาร)" htmlFor="t-addr">
              <Textarea id="t-addr" rows={2} value={form.address} onChange={set('address')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field
                label="เลขประจำตัวผู้เสียภาษี"
                htmlFor="t-tax"
                hint={taxInvalid ? <span className="text-destructive">ต้องเป็นตัวเลข 13 หลัก</span> : undefined}
              >
                <Input
                  id="t-tax"
                  inputMode="numeric"
                  value={form.tax_id}
                  onChange={set('tax_id')}
                  aria-invalid={taxInvalid || undefined}
                  className="tabular-nums"
                />
              </Field>
              <Field label="สาขา" htmlFor="t-branch" hint="00000 = สนญ.">
                <Input
                  id="t-branch"
                  inputMode="numeric"
                  maxLength={5}
                  value={form.branch_code}
                  onChange={set('branch_code')}
                  placeholder="00000"
                  className="tabular-nums"
                />
              </Field>
            </div>
          </div>
        )}
      </div>
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
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <TenantForm {...props} />
      </DialogContent>
    </Dialog>
  )
}
