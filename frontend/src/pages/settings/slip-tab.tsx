// ตั้งค่าตรวจสลิปที่ผู้เช่าแนบมา (เจ้าของ/ผู้ดูแล)
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRight, Check, Info, KeyRound, Loader2, Save, ScanLine, ShieldCheck } from 'lucide-react'
import { api, type OrgSlipSettings } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { SLIP_PROVIDERS } from '@/lib/slips'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Field } from '@/components/common'

export function SlipTab() {
  const q = useQuery({ queryKey: ['org-slip'], queryFn: api.slipSettings })
  if (!q.data) return <Skeleton className="h-96 max-w-5xl rounded-lg" />
  return <SlipSettingsView key={JSON.stringify(q.data)} initial={q.data} />
}

function SlipSettingsView({ initial }: { initial: OrgSlipSettings }) {
  const { readOnly } = useSession()
  const [provider, setProvider] = useState(initial.provider)
  const [key, setKey] = useState('')
  const [branch, setBranch] = useState(initial.branch_id)
  const [auto, setAuto] = useState(initial.auto_approve)
  const external = provider !== 'none'
  const needsKey = external && !initial.has_key && !key.trim()
  const needsBranch = provider === 'slipok' && !branch.trim()

  const save = useMutation({
    mutationFn: () =>
      api.updateSlipSettings({
        provider,
        api_key: key.trim(),
        branch_id: branch.trim(),
        auto_approve: external && auto,
      }),
    onSuccess: async () => {
      setKey('')
      toast.success('บันทึกการตรวจสลิปแล้ว')
      await invalidate('org-slip')
    },
  })

  return (
    <div className="grid max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (needsBranch) return toast.error('SlipOK ต้องระบุ Branch ID')
          if (needsKey) return toast.error('กรุณาใส่ API key ของผู้ให้บริการ')
          save.mutate()
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="size-4 text-muted-foreground" /> ตรวจสลิป
            </CardTitle>
            <CardDescription>
              ตรวจสลิปที่ผู้เช่าแนบในพอร์ทัลหรือส่งในแชต LINE ทันทีที่ได้รับ ก่อนเข้าคิว{' '}
              <Link to="/payment-notices" className="font-medium text-primary hover:underline">
                แจ้งชำระ
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="ผู้ให้บริการตรวจสลิป" htmlFor="os-provider" className="sm:col-span-2">
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as OrgSlipSettings['provider'])}
                disabled={readOnly}
              >
                <SelectTrigger id="os-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLIP_PROVIDERS.map((p) => (
                    <SelectItem key={p.v} value={p.v}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {external && (
              <Field
                label="API key"
                htmlFor="os-key"
                className={provider === 'slipok' ? undefined : 'sm:col-span-2'}
                hint={
                  initial.has_key ? (
                    <span className="text-success">✓ ตั้งค่าแล้ว — ปล่อยว่างเพื่อใช้คีย์เดิม</span>
                  ) : (
                    <span className={needsKey ? 'text-warning-foreground' : undefined}>ยังไม่ได้ตั้งค่า</span>
                  )
                }
              >
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="os-key"
                    type="password"
                    autoComplete="new-password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={initial.has_key ? '••••••••••••' : 'วาง API key'}
                    className="pl-9 font-mono"
                    disabled={readOnly}
                  />
                </div>
              </Field>
            )}
            {provider === 'slipok' && (
              <Field
                label="Branch ID"
                htmlFor="os-branch"
                hint={needsBranch ? <span className="text-destructive">จำเป็นสำหรับ SlipOK</span> : 'ดูได้ในหน้าจัดการของ SlipOK'}
              >
                <Input
                  id="os-branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  aria-invalid={needsBranch || undefined}
                  disabled={readOnly}
                />
              </Field>
            )}
            {external ? (
              <label className="flex items-start gap-3 rounded-md border p-3 sm:col-span-2">
                <Switch checked={auto} onCheckedChange={setAuto} className="mt-0.5" disabled={readOnly} />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">ยืนยันอัตโนมัติเมื่อตรวจกับธนาคารผ่านและยอดตรง</span>
                  <span className="text-xs text-muted-foreground">
                    บันทึกรับชำระและออกใบเสร็จให้ทันที (ส่งใบเสร็จทาง LINE ถ้าเปิดไว้) — สลิปที่ไม่ผ่าน ยอดไม่ตรง
                    หรือซ้ำ ยังรอเจ้าหน้าที่ตรวจตามปกติ
                  </span>
                </span>
              </label>
            ) : (
              <Alert className="sm:col-span-2">
                <ScanLine />
                <AlertTitle>ตรวจขั้นพื้นฐาน (ไม่มีค่าใช้จ่าย)</AlertTitle>
                <AlertDescription>
                  อ่าน QR บนสลิปและเตือนสลิปที่เคยใช้แล้ว — แต่ QR บนสลิปไม่มียอดเงิน จึงยังต้องเช็กยอดเข้าบัญชีเองก่อนกดยืนยัน
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t pt-6">
            <Button type="submit" disabled={readOnly || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              บันทึก
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4 text-muted-foreground" /> ระบบตรวจอะไรได้บ้าง
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 text-sm">
          <div className="grid gap-2">
            <div className="font-medium">ไม่เชื่อมผู้ให้บริการ</div>
            <ul className="grid gap-1.5 text-muted-foreground">
              <Point ok>อ่าน QR บนสลิป รู้ธนาคารผู้โอนและเลขอ้างอิง</Point>
              <Point ok>กันสลิปเดิมถูกใช้ซ้ำกับบิลอื่น</Point>
              <Point>ยืนยันยอดเงินและชื่อผู้โอนไม่ได้ — เจ้าหน้าที่ต้องเช็กเอง</Point>
            </ul>
          </div>
          <div className="grid gap-2">
            <div className="font-medium">เชื่อม EasySlip / SlipOK</div>
            <ul className="grid gap-1.5 text-muted-foreground">
              <Point ok>ตรวจกับธนาคาร ได้ยอดเงิน ผู้โอน ผู้รับ และเวลาโอน</Point>
              <Point ok>เตือนเมื่อยอดไม่ตรงกับยอดที่แจ้ง</Point>
              <Point ok>ยืนยันและออกใบเสร็จอัตโนมัติได้</Point>
            </ul>
          </div>
          <p className="rounded-md bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            EasySlip และ SlipOK เป็นบริการของผู้ให้บริการภายนอกที่มีค่าใช้จ่าย องค์กรสมัครและชำระค่าบริการกับผู้ให้บริการเอง
            แล้วนำ API key มาใส่ที่นี่ — ระบบส่งเฉพาะข้อมูลจาก QR บนสลิปไปตรวจ
          </p>
          <Button asChild variant="ghost" size="sm" className="w-fit text-muted-foreground">
            <Link to="/payment-notices">
              <ShieldCheck /> ไปที่รายการแจ้งชำระ <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Point({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <Info className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
      )}
      <span>{children}</span>
    </li>
  )
}
