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
      <AuthLayout title="ส่งลิงก์แล้ว" subtitle="เปิดอีเมลแล้วกดลิงก์เพื่อตั้งรหัสผ่านใหม่">
        <div className="grid gap-6">
          <AuthNotice icon={MailCheck} title="ถ้าอีเมลนี้มีบัญชีอยู่ ระบบได้ส่งลิงก์ไปแล้ว">
            ส่งไปที่ <span className="font-medium break-words text-foreground">{email.trim()}</span> ถ้าไม่เห็นในกล่องจดหมาย
            ให้ดูในโฟลเดอร์สแปม ลิงก์ใช้ได้ครั้งเดียวภายใน 1 ชั่วโมง
          </AuthNotice>
          <Button asChild size="lg" className="h-11">
            <Link to="/login">
              <ArrowLeft /> กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            พิมพ์อีเมลผิด หรือไม่ได้รับอีเมล{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => forgot.reset()}
            >
              ส่งใหม่
            </button>
          </p>
        </div>
      </AuthLayout>
    )

  return (
    <AuthLayout title="ลืมรหัสผ่าน" subtitle="กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้">
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
          <Link to="/login" className="font-medium text-primary hover:underline">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
