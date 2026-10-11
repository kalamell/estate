import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Loader2, MailCheck, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common'
import { AuthLayout, AuthNotice } from './layout'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const forgot = useMutation({
    mutationFn: () => api.forgotPassword(email.trim()),
    meta: { silent: true },
  })

  if (forgot.isSuccess)
    return (
      <AuthLayout title="ตรวจอีเมลของคุณ" subtitle="ขั้นต่อไปอยู่ในกล่องจดหมาย">
        <div className="grid gap-6">
          <AuthNotice icon={MailCheck} title="ถ้ามีบัญชีนี้ เราได้ส่งลิงก์ไปที่อีเมลแล้ว">
            ตรวจกล่องจดหมาย/สแปมของ <span className="font-medium break-words text-foreground">{email.trim()}</span>{' '}
            ลิงก์ใช้ได้ 1 ชั่วโมง
          </AuthNotice>
          <Button asChild size="lg" className="h-11">
            <Link to="/login">
              <ArrowLeft /> กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ไม่ได้รับอีเมล?{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => forgot.reset()}
            >
              ลองอีกครั้ง
            </button>
          </p>
        </div>
      </AuthLayout>
    )

  return (
    <AuthLayout title="ลืมรหัสผ่าน" subtitle="กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้">
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          forgot.mutate()
        }}
      >
        {forgot.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{forgot.error.message}</AlertDescription>
          </Alert>
        )}
        <Field label="อีเมล" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            className="h-11"
          />
        </Field>
        <Button type="submit" size="lg" className="h-11" disabled={forgot.isPending}>
          {forgot.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          ส่งลิงก์ตั้งรหัสผ่านใหม่
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          นึกออกแล้ว?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
