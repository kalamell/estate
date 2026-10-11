// ส่วนประกอบที่ใช้ร่วมกันสำหรับ PDPA (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, ShieldCheck, ShieldOff, UserX } from 'lucide-react'
import { ApiError, api, type Tenant } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { thDate } from '@/lib/format'
import { CONFIRM_WORD, CONSENT_SOURCE } from '@/lib/privacy'
import { cn } from '@/lib/utils'
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
import { Field, ToneBadge } from '@/components/common'

/** สถานะความยินยอม/การลบข้อมูลของผู้เช่า */
export function ConsentBadge({ tenant, className }: { tenant: Tenant; className?: string }) {
  if (tenant.anonymized_at)
    return (
      <ToneBadge tone="grey" className={className}>
        <UserX /> ลบข้อมูลแล้ว · {thDate(tenant.anonymized_at)}
      </ToneBadge>
    )
  if (tenant.consent_at)
    return (
      <ToneBadge tone="green" className={cn('max-w-full justify-start text-left whitespace-normal', className)}>
        <ShieldCheck />
        <span>
          ยินยอมแล้ว · {thDate(tenant.consent_at)}
          {tenant.consent_source ? ` · ${CONSENT_SOURCE[tenant.consent_source] ?? tenant.consent_source}` : ''}
        </span>
      </ToneBadge>
    )
  return (
    <ToneBadge tone="mustard" className={className}>
      <ShieldOff /> ยังไม่มีความยินยอม
    </ToneBadge>
  )
}

/** ประกาศความเป็นส่วนตัว (ข้อความล้วน รักษาการขึ้นบรรทัด) */
export function NoticeText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('text-sm leading-relaxed whitespace-pre-wrap', className)}>
      {text.trim() || 'ยังไม่มีประกาศความเป็นส่วนตัว'}
    </div>
  )
}

export interface AnonymizeTarget {
  id: number
  name: string
}

/** ยืนยันการลบข้อมูลส่วนบุคคล (พิมพ์คำว่า "ลบข้อมูล") */
export function AnonymizeDialog({
  target,
  onClose,
  onDone,
}: {
  target: AnonymizeTarget | null
  onClose: () => void
  onDone?: (t: Tenant) => void
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target && <AnonymizeForm key={target.id} target={target} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  )
}

function AnonymizeForm({
  target,
  onClose,
  onDone,
}: {
  target: AnonymizeTarget
  onClose: () => void
  onDone?: (t: Tenant) => void
}) {
  const [typed, setTyped] = useState('')
  const run = useMutation({
    mutationFn: () => api.anonymizeTenant(target.id),
    meta: { silent: true },
    onSuccess: async (t) => {
      toast.success(`ลบข้อมูลส่วนบุคคลของ ${target.name} แล้ว`)
      await invalidate('tenants', 'privacy-retention', 'privacy-requests', 'dashboard')
      onDone?.(t)
      onClose()
    },
  })
  const err = run.error
  const ok = typed.trim() === CONFIRM_WORD
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) run.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>ลบข้อมูลส่วนบุคคลของ {target.name}?</DialogTitle>
        <DialogDescription>ทำให้ข้อมูลไม่สามารถระบุตัวตนได้ — ไม่สามารถย้อนกลับได้</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 text-sm">
        <div>
          <div className="font-medium">ข้อมูลที่จะถูกลบ</div>
          <p className="text-muted-foreground">
            ชื่อ เบอร์โทร อีเมล เลขบัตรประชาชน ที่อยู่ หมายเหตุ การเชื่อม LINE และลิงก์พอร์ทัล
          </p>
        </div>
        <div>
          <div className="font-medium">ข้อมูลที่ยังเก็บไว้</div>
          <p className="text-muted-foreground">
            ใบแจ้งหนี้ ใบเสร็จรับเงิน ใบกำกับภาษี และประวัติการชำระเงิน ต้องเก็บต่อตามกฎหมายภาษีและการบัญชี
            (อย่างน้อย 5 ปี) โดยชื่อในระบบจะแสดงเป็นผู้เช่าที่ลบข้อมูลแล้ว
          </p>
        </div>
      </div>
      <Field label={<>พิมพ์ “{CONFIRM_WORD}” เพื่อยืนยัน</>} htmlFor="anon-confirm">
        <Input
          id="anon-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoFocus
          placeholder={CONFIRM_WORD}
        />
      </Field>
      {err && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {err instanceof ApiError ? err.message : 'ลบข้อมูลไม่สำเร็จ'}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="submit" variant="destructive" disabled={!ok || run.isPending}>
          {run.isPending ? <Loader2 className="animate-spin" /> : <UserX />}
          ลบข้อมูลส่วนบุคคล
        </Button>
      </DialogFooter>
    </form>
  )
}
