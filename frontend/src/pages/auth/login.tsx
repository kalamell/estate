import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, Loader2, LogIn } from 'lucide-react'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common'
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
    <AuthLayout title="ยินดีต้อนรับกลับ" subtitle="เข้าสู่ระบบเพื่อจัดการโครงการและห้องเช่าของคุณ">
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
        <Field label="รหัสผ่าน" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11"
          />
        </Field>
        <Button type="submit" size="lg" className="h-11" disabled={login.isPending}>
          {login.isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
          เข้าสู่ระบบ
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          ยังไม่มีบัญชี?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            สมัครใช้งานฟรี
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
