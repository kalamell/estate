import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, KeyRound, Link2Off, Loader2, RotateCcw } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/common'
import { PasswordInput, PasswordStrength } from '@/components/password-input'
import { AuthLayout, AuthNotice } from './layout'

/** ข้อผิดพลาดจากโทเค็น (ลิงก์ผิด/หมดอายุ/ใช้แล้ว) — ไม่ใช่เรื่องรหัสผ่าน */
const isTokenError = (e: unknown) => e instanceof ApiError && e.status === 400 && /ลิงก์/.test(e.message)

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)

  const reset = useMutation({
    mutationFn: () => api.resetPassword({ token, password }),
    meta: { silent: true },
    onSuccess: () => {
      // เซสชันทั้งหมดถูกยกเลิกแล้ว — ให้เข้าสู่ระบบใหม่
      queryClient.setQueryData(['me'], null)
      toast.success('ตั้งรหัสผ่านใหม่แล้ว', { description: 'เข้าสู่ระบบด้วยรหัสผ่านใหม่' })
      navigate('/login', { replace: true })
    },
  })

  const tooShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && confirm !== password

  // ลิงก์ถูกตัด/คัดลอกไม่ครบ → แจ้งทันทีโดยไม่ต้องให้กรอกรหัสผ่านก่อน
  if (!/^[0-9a-f]{32,}$/i.test(token) || isTokenError(reset.error))
    return (
      <AuthLayout title="ลิงก์ใช้ไม่ได้" subtitle="ลิงก์ตั้งรหัสผ่านใหม่ใช้ได้ครั้งเดียว และหมดอายุใน 1 ชั่วโมง">
        <div className="grid gap-6">
          <AuthNotice icon={Link2Off} tone="error" title="ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว">
            ลิงก์นี้อาจถูกใช้ไปแล้ว หรือมีการขอลิงก์ใหม่หลังจากนั้น ให้ขอลิงก์ใหม่แล้วเปิดจากอีเมลฉบับล่าสุด
          </AuthNotice>
          <Button asChild size="lg" className="h-11">
            <Link to="/forgot-password">
              <RotateCcw /> ขอลิงก์ใหม่
            </Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </AuthLayout>
    )

  return (
    <AuthLayout title="ตั้งรหัสผ่านใหม่" subtitle="เมื่อบันทึกแล้ว ทุกอุปกรณ์ที่เข้าสู่ระบบอยู่จะถูกออกจากระบบ">
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          if (password.length < 8 || password !== confirm) return
          reset.mutate()
        }}
      >
        {reset.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{reset.error.message}</AlertDescription>
          </Alert>
        )}
        <Field label="รหัสผ่านใหม่" htmlFor="password">
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            aria-invalid={(touched && password.length < 8) || tooShort || undefined}
            aria-describedby="pw-strength"
            className="h-11"
          />
          <PasswordStrength id="pw-strength" value={password} />
        </Field>
        <Field
          label="ยืนยันรหัสผ่านใหม่"
          htmlFor="confirm"
          hint={
            (mismatch || (touched && confirm !== password)) && (
              <span className="text-destructive">รหัสผ่านทั้งสองช่องไม่ตรงกัน</span>
            )
          }
        >
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            aria-invalid={mismatch || undefined}
            className="h-11"
          />
        </Field>
        <Button type="submit" size="lg" className="h-11" disabled={reset.isPending}>
          {reset.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          บันทึกรหัสผ่านใหม่
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
