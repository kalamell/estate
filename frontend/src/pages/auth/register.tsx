import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, UserPlus } from 'lucide-react'
import { api, request, setOrgId } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common'
import { AuthLayout } from './layout'

/** แพ็กเกจจาก GET /api/public/site (ใช้เฉพาะช่องที่ต้องแสดง) */
interface SitePackage {
  name: string
  price_monthly: number
  max_properties: number
  max_units: number
  is_default: boolean
}

/** แพ็กเกจที่องค์กรใหม่จะได้ — ตรงกับที่ backend เลือกตอนสมัคร (is_default ก่อน แล้วตามลำดับ) */
function useStarterPlan() {
  return useQuery({
    queryKey: ['public-site'],
    queryFn: () => request<{ packages: SitePackage[] }>('/api/public/site', { org: false }),
    select: (d) => d.packages.find((p) => p.is_default) ?? d.packages[0] ?? null,
    staleTime: 10 * 60_000,
    retry: false,
    meta: { silent: true },
  })
}

function PlanNote({ plan }: { plan: SitePackage }) {
  const n = (v: number) => v.toLocaleString('th-TH')
  return (
    <div className="rounded-md border bg-card px-3 py-2.5 text-xs leading-relaxed">
      <p>
        แพ็กเกจเริ่มต้น <span className="font-medium">{plan.name}</span>{' '}
        {plan.price_monthly > 0 ? 'ทดลองใช้ 14 วัน ไม่ต้องผูกบัตร' : 'ใช้ฟรี ไม่มีวันหมดอายุ'}
      </p>
      <p className="text-muted-foreground">
        {n(plan.max_properties)} โครงการ ไม่เกิน {n(plan.max_units)} ห้อง อัปเกรดได้เมื่อห้องเพิ่มขึ้น
      </p>
    </div>
  )
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', org_name: '' })
  const [accepted, setAccepted] = useState(false)
  const [acceptError, setAcceptError] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const register = useMutation({
    mutationFn: () => api.register({ ...form, email: form.email.trim(), accept_terms: true }),
    meta: { silent: true },
    onSuccess: (me) => {
      setOrgId(me.orgs[0]?.id ?? null)
      queryClient.setQueryData(['me'], me)
      navigate('/', { replace: true })
    },
  })
  const tooShort = form.password.length > 0 && form.password.length < 8
  const plan = useStarterPlan().data

  return (
    <AuthLayout title="สมัครใช้งาน" subtitle="บัญชีนี้จะเป็นเจ้าขององค์กร เพิ่มทีมงานได้ภายหลัง">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!accepted) return setAcceptError(true)
          register.mutate()
        }}
      >
        {register.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{register.error.message}</AlertDescription>
          </Alert>
        )}
        <Field label="ชื่อ-นามสกุล" htmlFor="name">
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
        <Field label="ชื่อองค์กร / ธุรกิจ" htmlFor="org" hint="เช่น ชื่อหอพักหรือชื่อบริษัท แก้ไขได้ภายหลัง">
          <Input id="org" value={form.org_name} onChange={set('org_name')} required className="h-11" />
        </Field>
        <div className="grid gap-1.5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="accept"
              checked={accepted}
              onCheckedChange={(v) => {
                setAccepted(v === true)
                setAcceptError(false)
              }}
              aria-invalid={acceptError || undefined}
              aria-describedby={acceptError ? 'accept-error' : undefined}
              className="mt-0.5"
            />
            <label htmlFor="accept" className="text-sm leading-relaxed text-muted-foreground">
              ฉันยอมรับ{' '}
              <Link to="/terms" target="_blank" className="font-medium text-primary hover:underline">
                ข้อกำหนดการใช้งาน
              </Link>{' '}
              และ{' '}
              <Link to="/privacy" target="_blank" className="font-medium text-primary hover:underline">
                นโยบายความเป็นส่วนตัว
              </Link>
            </label>
          </div>
          {acceptError && (
            <p id="accept-error" className="pl-7 text-xs text-destructive">
              ต้องยอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัวก่อนสมัคร
            </p>
          )}
        </div>
        {plan && <PlanNote plan={plan} />}
        <Button type="submit" size="lg" className="mt-2 h-11" disabled={register.isPending}>
          {register.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          สร้างบัญชี
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          มีบัญชีแล้ว{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
