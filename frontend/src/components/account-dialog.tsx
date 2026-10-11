import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, KeyRound, Loader2, MailCheck, MailWarning, Send } from 'lucide-react'
import { api, type User } from '@/lib/api'
import { useResendVerification } from '@/lib/account'
import { initials } from '@/lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Field, ToneBadge } from '@/components/common'
import { PasswordInput, PasswordStrength } from '@/components/password-input'

/** บัญชีของฉัน: ข้อมูลผู้ใช้ สถานะยืนยันอีเมล และเปลี่ยนรหัสผ่าน */
export function AccountDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>บัญชีของฉัน</DialogTitle>
          <DialogDescription>ข้อมูลเข้าสู่ระบบของคุณ — ใช้กับทุกองค์กรที่คุณเป็นสมาชิก</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <Avatar className="size-11 rounded-lg">
            <AvatarFallback className="rounded-md bg-primary font-semibold text-primary-foreground">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-sm text-muted-foreground">{user.email}</span>
          </div>
        </div>
        <EmailStatus user={user} />
        <Separator />
        {/* key: เปิดใหม่ = ฟอร์มว่าง */}
        <ChangePasswordForm key={String(open)} />
      </DialogContent>
    </Dialog>
  )
}

function EmailStatus({ user }: { user: User }) {
  const resend = useResendVerification(user.email)
  const verified = user.email_verified !== false
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3">
      {verified ? (
        <MailCheck className="size-5 shrink-0 text-success" />
      ) : (
        <MailWarning className="size-5 shrink-0 text-warning" />
      )}
      <div className="min-w-[12rem] flex-1 text-sm">
        <div className="flex items-center gap-2 font-medium">
          สถานะอีเมล
          {verified ? <ToneBadge tone="green">ยืนยันแล้ว</ToneBadge> : <ToneBadge tone="mustard">ยังไม่ยืนยัน</ToneBadge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {verified
            ? 'คุณจะได้รับใบแจ้งหนี้ การแจ้งเตือน และกู้คืนรหัสผ่านทางอีเมลนี้ได้'
            : 'ยืนยันอีเมลเพื่อรับใบแจ้งหนี้และกู้คืนรหัสผ่าน — เปิดลิงก์ในอีเมลที่เราส่งให้'}
        </p>
      </div>
      {!verified && (
        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => resend.mutate()} disabled={resend.isPending}>
          {resend.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          ส่งลิงก์อีกครั้ง
        </Button>
      )}
    </div>
  )
}

function ChangePasswordForm() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [touched, setTouched] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const change = useMutation({
    mutationFn: () => api.changePassword({ current_password: form.current, new_password: form.next }),
    meta: { silent: true },
    onSuccess: () => {
      toast.success('เปลี่ยนรหัสผ่านแล้ว', { description: 'อุปกรณ์อื่นที่เข้าสู่ระบบอยู่ถูกออกจากระบบแล้ว' })
      setForm({ current: '', next: '', confirm: '' })
      setTouched(false)
    },
  })
  const mismatch = form.confirm.length > 0 && form.confirm !== form.next
  const same = form.next.length > 0 && form.next === form.current
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setTouched(true)
        if (form.next.length < 8 || form.next !== form.confirm || same) return
        change.mutate()
      }}
    >
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-muted-foreground" /> เปลี่ยนรหัสผ่าน
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          อุปกรณ์นี้ยังเข้าสู่ระบบอยู่ อุปกรณ์อื่นทั้งหมดจะถูกออกจากระบบ
        </p>
      </div>
      {change.error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{change.error.message}</AlertDescription>
        </Alert>
      )}
      <Field label="รหัสผ่านปัจจุบัน" htmlFor="pw-current">
        <PasswordInput
          id="pw-current"
          autoComplete="current-password"
          value={form.current}
          onChange={set('current')}
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="รหัสผ่านใหม่"
          htmlFor="pw-new"
          hint={same && <span className="text-destructive">ต้องต่างจากรหัสผ่านปัจจุบัน</span>}
        >
          <PasswordInput
            id="pw-new"
            autoComplete="new-password"
            value={form.next}
            onChange={set('next')}
            required
            aria-invalid={(touched && form.next.length < 8) || same || undefined}
            aria-describedby="pw-new-strength"
          />
        </Field>
        <Field
          label="ยืนยันรหัสผ่านใหม่"
          htmlFor="pw-confirm"
          hint={
            (mismatch || (touched && form.confirm !== form.next)) && (
              <span className="text-destructive">รหัสผ่านไม่ตรงกัน</span>
            )
          }
        >
          <PasswordInput
            id="pw-confirm"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set('confirm')}
            required
            aria-invalid={mismatch || undefined}
          />
        </Field>
      </div>
      <PasswordStrength id="pw-new-strength" value={form.next} />
      <div className="flex justify-end">
        <Button type="submit" disabled={change.isPending} className="w-full sm:w-auto">
          {change.isPending && <Loader2 className="animate-spin" />}
          เปลี่ยนรหัสผ่าน
        </Button>
      </div>
    </form>
  )
}
