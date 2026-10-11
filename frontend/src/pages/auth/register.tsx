import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, Loader2, Rocket } from 'lucide-react'
import { api, setOrgId } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common'
import { AuthLayout } from './layout'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', org_name: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const register = useMutation({
    mutationFn: () => api.register({ ...form, email: form.email.trim() }),
    meta: { silent: true },
    onSuccess: (me) => {
      setOrgId(me.orgs[0]?.id ?? null)
      queryClient.setQueryData(['me'], me)
      navigate('/', { replace: true })
    },
  })
  const tooShort = form.password.length > 0 && form.password.length < 8

  return (
    <AuthLayout title="สร้างบัญชีใหม่" subtitle="เริ่มทดลองใช้ฟรี พร้อมสร้างองค์กรแรกของคุณ">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          register.mutate()
        }}
      >
        {register.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{register.error.message}</AlertDescription>
          </Alert>
        )}
        <Field label="ชื่อของคุณ" htmlFor="name">
          <Input id="name" autoComplete="name" value={form.name} onChange={set('name')} required autoFocus className="h-11" />
        </Field>
        <Field label="อีเมล" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} required className="h-11" />
        </Field>
        <Field
          label="รหัสผ่าน"
          htmlFor="password"
          hint={<span className={tooShort ? 'text-destructive' : ''}>อย่างน้อย 8 ตัวอักษร</span>}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={form.password}
            onChange={set('password')}
            required
            aria-invalid={tooShort || undefined}
            className="h-11"
          />
        </Field>
        <Field label="ชื่อองค์กร / ธุรกิจ" htmlFor="org" hint="เช่น ชื่อหอพักหรือบริษัท — เปลี่ยนภายหลังได้">
          <Input id="org" value={form.org_name} onChange={set('org_name')} required className="h-11" />
        </Field>
        <Button type="submit" size="lg" className="mt-2 h-11" disabled={register.isPending}>
          {register.isPending ? <Loader2 className="animate-spin" /> : <Rocket />}
          สร้างบัญชีและองค์กร
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          มีบัญชีอยู่แล้ว?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
