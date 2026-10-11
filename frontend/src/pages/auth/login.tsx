import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, Loader2, LogIn } from 'lucide-react'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Field } from '@/components/common'
import { PasswordInput } from '@/components/password-input'
import { AuthLayout } from './layout'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => api.login({ email: email.trim(), password }),
    meta: { silent: true },
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me)
      navigate(from === '/login' ? '/' : from, { replace: true })
    },
  })

  return (
    <AuthLayout title="เข้าสู่ระบบ" subtitle="ใช้อีเมลและรหัสผ่านที่ลงทะเบียนไว้">
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate()
        }}
      >
        {login.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{login.error.message}</AlertDescription>
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
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
              รหัสผ่าน
            </Label>
            <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              ลืมรหัสผ่าน
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11"
          />
        </div>
        <Button type="submit" size="lg" className="h-11" disabled={login.isPending}>
          {login.isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
          เข้าสู่ระบบ
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          ยังไม่มีบัญชี{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            สมัครใช้งาน
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
