import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRight, Eye, Info, Loader2, PencilLine, RotateCcw, Save, Scale } from 'lucide-react'
import { api, type OrgInfo } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { orgLegalOf, orgThemeOf } from '@/lib/docs'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Field, ToneBadge } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { NoticeText } from '@/components/privacy'

export function PrivacyTab() {
  const { orgInfo } = useSession()
  if (!orgInfo) return <Skeleton className="h-96 max-w-3xl rounded-lg" />
  // key: โหลดฟอร์มใหม่เมื่อข้อความจากเซิร์ฟเวอร์เปลี่ยน (เช่น หลังกลับไปใช้ข้อความมาตรฐาน)
  return (
    <PrivacyForm
      key={`${orgInfo.org.id}:${orgInfo.org.privacy_notice_custom}:${orgInfo.org.privacy_notice?.length}`}
      info={orgInfo}
    />
  )
}

const clampYears = (n: number) => Math.min(20, Math.max(1, Math.round(n) || 1))

function PrivacyForm({ info }: { info: OrgInfo }) {
  const { canManage, readOnly } = useSession()
  const confirm = useConfirm()
  const o = info.org
  const custom = !!o.privacy_notice_custom
  const original = o.privacy_notice ?? ''
  const [notice, setNotice] = useState(original)
  const [dpo, setDpo] = useState(o.dpo_contact ?? '')
  const [years, setYears] = useState(String(o.retention_years ?? 5))
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const disabled = !canManage || readOnly
  const yearsNum = Number(years)
  const yearsInvalid = !Number.isInteger(yearsNum) || yearsNum < 1 || yearsNum > 20
  const changed = notice !== original

  const save = useMutation({
    mutationFn: (v: { notice: string }) =>
      api.updateOrg({
        ...orgLegalOf(info),
        name: o.name,
        theme: orgThemeOf(info),
        privacy_notice: v.notice,
        dpo_contact: dpo.trim(),
        retention_years: clampYears(yearsNum),
      }),
    onSuccess: async (_r, v) => {
      toast.success(v.notice ? 'บันทึกการตั้งค่าความเป็นส่วนตัวแล้ว' : 'กลับไปใช้ข้อความมาตรฐานแล้ว')
      await invalidate('org-info')
    },
  })

  // ข้อความมาตรฐานที่ไม่ได้แก้ → ส่งค่าว่างเพื่อให้ยังอัปเดตตามแม่แบบของระบบ
  const noticeToSend = () => (!custom && !changed ? '' : notice.trim())

  const resetDefault = async () => {
    if (
      await confirm({
        title: 'ใช้ข้อความมาตรฐาน?',
        description: 'ข้อความที่แก้ไขไว้จะถูกแทนที่ด้วยประกาศมาตรฐานที่ระบบสร้างจากข้อมูลองค์กร',
        confirmText: 'ใช้ข้อความมาตรฐาน',
      })
    )
      save.mutate({ notice: '' })
  }

  return (
    <form
      className="grid max-w-3xl gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (yearsInvalid) return toast.error('ระยะเวลาเก็บข้อมูลต้องอยู่ระหว่าง 1–20 ปี')
        save.mutate({ notice: noticeToSend() })
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            ประกาศความเป็นส่วนตัว
            {custom || changed ? (
              <ToneBadge tone="ink">กำหนดเอง{changed ? ' (ยังไม่บันทึก)' : ''}</ToneBadge>
            ) : (
              <ToneBadge tone="grey">ข้อความมาตรฐาน</ToneBadge>
            )}
          </CardTitle>
          <CardDescription>
            แสดงให้ผู้เช่าอ่านและยอมรับเมื่อเปิดพอร์ทัลครั้งแรก และดูได้ตลอดในเมนูความเป็นส่วนตัวของพอร์ทัล
          </CardDescription>
          <CardAction>
            <div className="flex rounded-md border bg-muted/50 p-0.5" role="radiogroup" aria-label="มุมมอง">
              {(
                [
                  ['edit', PencilLine, 'แก้ไข'],
                  ['preview', Eye, 'ตัวอย่าง'],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={mode === v}
                  onClick={() => setMode(v)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs',
                    mode === v
                      ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {mode === 'edit' ? (
            <Textarea
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
              rows={16}
              aria-label="ประกาศความเป็นส่วนตัว"
              className="min-h-72 font-[inherit] text-sm leading-relaxed"
              disabled={disabled}
            />
          ) : (
            <div className="max-h-[28rem] overflow-y-auto rounded-md border bg-muted/30 p-4">
              <NoticeText text={notice} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              ข้อความมาตรฐานสร้างจากชื่อองค์กร ที่อยู่ และผู้ติดต่อด้านล่างโดยอัตโนมัติ — แก้ไขได้ตามลักษณะธุรกิจของคุณ
            </p>
            {canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void resetDefault()}
                disabled={readOnly || save.isPending || (!custom && !changed)}
              >
                <RotateCcw /> ใช้ข้อความมาตรฐาน
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ผู้ติดต่อและการเก็บรักษาข้อมูล</CardTitle>
          <CardDescription>แสดงในประกาศความเป็นส่วนตัวและพอร์ทัลผู้เช่า</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field
            label="เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) / ผู้ติดต่อ"
            htmlFor="p-dpo"
            hint="ชื่อ อีเมล หรือเบอร์โทรสำหรับติดต่อเรื่องข้อมูลส่วนบุคคล"
          >
            <Input
              id="p-dpo"
              value={dpo}
              onChange={(e) => setDpo(e.target.value)}
              placeholder="เช่น คุณสมชาย · privacy@example.com · 02-000-0000"
              disabled={disabled}
            />
          </Field>
          <Field
            label="เก็บข้อมูลผู้เช่า (ปี)"
            htmlFor="p-years"
            hint={
              yearsInvalid ? (
                <span className="text-destructive">ระบุ 1–20 ปี</span>
              ) : (
                'นับจากกิจกรรมล่าสุด (สิ้นสุดสัญญา/ชำระเงิน)'
              )
            }
          >
            <Input
              id="p-years"
              type="number"
              min={1}
              max={20}
              inputMode="numeric"
              value={years}
              onChange={(e) => setYears(e.target.value)}
              aria-invalid={yearsInvalid || undefined}
              disabled={disabled}
              className="tabular-nums"
            />
          </Field>
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

      <Alert>
        <Scale />
        <AlertTitle>หน้าที่หลักตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)</AlertTitle>
        <AlertDescription>
          <ul className="ml-4 list-disc space-y-1">
            <li>แจ้งประกาศความเป็นส่วนตัวและขอความยินยอมก่อนหรือขณะเก็บข้อมูลผู้เช่า</li>
            <li>
              ตอบคำขอใช้สิทธิ์ของผู้เช่า (ขอสำเนา แก้ไข ลบ คัดค้าน ถอนความยินยอม) <b>ภายใน 30 วัน</b>
            </li>
            <li>
              เก็บเอกสารภาษีและบัญชี (ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี) <b>ตามกฎหมาย 5 ปี</b> — ระบบจะไม่ลบเอกสารเหล่านี้
            </li>
            <li>ลบหรือทำให้ข้อมูลไม่สามารถระบุตัวตนได้เมื่อหมดความจำเป็น</li>
            <li>แจ้งเหตุละเมิดข้อมูลต่อ สคส. ภายใน 72 ชั่วโมงเมื่อมีความเสี่ยงต่อสิทธิของเจ้าของข้อมูล</li>
          </ul>
          <p className="mt-2 flex items-center gap-1.5 font-medium">
            <Info className="size-3.5" /> ข้อมูลนี้เป็นแนวทางทั่วไป ควรปรึกษาผู้เชี่ยวชาญกฎหมาย
          </p>
          <Link
            to="/privacy-requests"
            className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            ไปที่คำขอ PDPA <ArrowRight className="size-3.5" />
          </Link>
        </AlertDescription>
      </Alert>
    </form>
  )
}
