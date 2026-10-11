import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Info, Loader2, Save } from 'lucide-react'
import { api, type OrgInfo, type OrgLegal } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { orgLegalOf, orgPrivacyOf, orgThemeOf } from '@/lib/docs'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/common'

export function IssuerTab() {
  const { orgInfo } = useSession()
  if (!orgInfo) return <Skeleton className="h-96 max-w-3xl rounded-lg" />
  return <IssuerForm key={orgInfo.org.id} info={orgInfo} />
}

function IssuerForm({ info }: { info: OrgInfo }) {
  const { canManage, readOnly } = useSession()
  const [form, setForm] = useState<OrgLegal>(() => orgLegalOf(info))
  const set = <K extends keyof OrgLegal>(k: K, v: OrgLegal[K]) => setForm((f) => ({ ...f, [k]: v }))
  const disabled = !canManage || readOnly

  const taxDigits = form.tax_id.replace(/\D/g, '')
  const taxInvalid = form.tax_id.trim() !== '' && taxDigits.length !== 13
  const branchInvalid = !/^\d{5}$/.test(form.branch_code)

  const save = useMutation({
    mutationFn: () =>
      api.updateOrg({
        name: info.org.name,
        theme: orgThemeOf(info),
        ...orgPrivacyOf(info),
        ...form,
        tax_id: taxDigits,
        legal_name: form.legal_name.trim(),
        vat_rate: Number(form.vat_rate) || 0,
      }),
    onSuccess: async () => {
      toast.success('บันทึกข้อมูลผู้ออกเอกสารแล้ว')
      await invalidate('org-info')
    },
  })

  return (
    <form
      className="grid max-w-3xl gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (taxInvalid) return toast.error('เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก')
        if (branchInvalid) return toast.error('รหัสสาขาต้องเป็นตัวเลข 5 หลัก')
        save.mutate()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลผู้ออกเอกสาร</CardTitle>
          <CardDescription>
            แสดงบนหัวใบแจ้งหนี้ ใบเสร็จรับเงิน และใบกำกับภาษี — ปล่อยว่างชื่อนิติบุคคลเพื่อใช้ชื่อองค์กร
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อผู้ประกอบการ / นิติบุคคล" htmlFor="l-name" className="sm:col-span-2">
            <Input
              id="l-name"
              value={form.legal_name}
              placeholder={info.org.name}
              onChange={(e) => set('legal_name', e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field
            label="เลขประจำตัวผู้เสียภาษี"
            htmlFor="l-tax"
            hint={taxInvalid ? <span className="text-destructive">ต้องเป็นตัวเลข 13 หลัก</span> : '13 หลัก'}
          >
            <Input
              id="l-tax"
              inputMode="numeric"
              maxLength={17}
              value={form.tax_id}
              onChange={(e) => set('tax_id', e.target.value)}
              aria-invalid={taxInvalid || undefined}
              disabled={disabled}
              className="tabular-nums"
            />
          </Field>
          <Field
            label="สาขา"
            htmlFor="l-branch"
            hint={form.branch_code === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${form.branch_code}`}
          >
            <Input
              id="l-branch"
              inputMode="numeric"
              maxLength={5}
              value={form.branch_code}
              onChange={(e) => set('branch_code', e.target.value.replace(/\D/g, ''))}
              aria-invalid={branchInvalid || undefined}
              disabled={disabled}
              className="tabular-nums"
            />
          </Field>
          <Field label="ที่อยู่" htmlFor="l-addr" className="sm:col-span-2">
            <Textarea
              id="l-addr"
              rows={2}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="โทรศัพท์" htmlFor="l-phone">
            <Input
              id="l-phone"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              disabled={disabled}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ภาษีมูลค่าเพิ่ม (VAT)</CardTitle>
          <CardDescription>เปิดเมื่อจดทะเบียนภาษีมูลค่าเพิ่มแล้ว ใบเสร็จจะออกเป็น "ใบเสร็จรับเงิน / ใบกำกับภาษี"</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <label className="flex items-center gap-3">
            <Switch
              checked={form.vat_registered}
              onCheckedChange={(v) => set('vat_registered', v)}
              disabled={disabled}
            />
            <span className="text-sm font-medium">จดทะเบียนภาษีมูลค่าเพิ่ม</span>
          </label>
          {form.vat_registered && (
            <Field label="อัตรา VAT (%)" htmlFor="l-vat" className="w-40">
              <Input
                id="l-vat"
                type="number"
                min={0}
                max={20}
                step="0.01"
                value={form.vat_rate}
                onChange={(e) => set('vat_rate', e.target.value === '' ? 0 : Number(e.target.value))}
                disabled={disabled}
              />
            </Field>
          )}
          <Alert>
            <Info />
            <AlertTitle>ข้อควรทราบ</AlertTitle>
            <AlertDescription>
              <ul className="ml-4 list-disc space-y-1">
                <li>ค่าเช่าที่อยู่อาศัยโดยทั่วไปได้รับยกเว้นภาษีมูลค่าเพิ่ม</li>
                <li>
                  กำหนดรายการที่ต้องคิด VAT เป็นรายรายการ (เช่น ค่าบริการ อินเทอร์เน็ต ที่จอดรถ) ในค่าบริการรายเดือนของห้อง
                  หรือในใบแจ้งหนี้
                </li>
                <li>กรุณาปรึกษานักบัญชีหรือผู้สอบบัญชีของคุณเพื่อความถูกต้อง</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>หมายเหตุท้ายเอกสาร</CardTitle>
          <CardDescription>เช่น ช่องทางชำระเงิน เลขบัญชี หรือเงื่อนไขการชำระ — พิมพ์ท้ายใบแจ้งหนี้</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={form.receipt_note}
            onChange={(e) => set('receipt_note', e.target.value)}
            aria-label="หมายเหตุท้ายเอกสาร"
            disabled={disabled}
          />
        </CardContent>
        {canManage && (
          <CardFooter className="justify-end border-t pt-6">
            <Button type="submit" disabled={readOnly || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              บันทึก
            </Button>
          </CardFooter>
        )}
      </Card>
    </form>
  )
}
