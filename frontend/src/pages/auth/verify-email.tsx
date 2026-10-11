import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CircleCheck, Link2Off, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { useMe } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { AuthLayout, AuthNotice } from './layout'

/** เปิดจากลิงก์ในอีเมล — ยืนยันทันทีเมื่อโหลดหน้า (ใช้ได้ทั้งตอนล็อกอินอยู่และยังไม่ล็อกอิน) */
export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const me = useMe()
  const loggedIn = !!me.data
  // useQuery กันการยิงซ้ำ (โทเค็นใช้ได้ครั้งเดียว) แม้คอมโพเนนต์ mount สองรอบ
  const verify = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => api.verifyEmail(token),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { silent: true },
  })
  const ok = verify.isSuccess

  useEffect(() => {
    if (ok) void queryClient.invalidateQueries({ queryKey: ['me'] })
  }, [ok])

  const next = loggedIn ? (
    <Button asChild size="lg" className="h-11">
      <Link to="/" replace>
        ไปที่หน้าหลัก <ArrowRight />
      </Link>
    </Button>
  ) : (
    <Button asChild size="lg" className="h-11">
      <Link to="/login" replace>
        เข้าสู่ระบบ <ArrowRight />
      </Link>
    </Button>
  )

  if (token && verify.isPending)
    return (
      <AuthLayout title="กำลังยืนยันอีเมล" subtitle="รอสักครู่">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-primary" />
          กำลังตรวจสอบลิงก์จากอีเมล…
        </div>
      </AuthLayout>
    )

  if (ok)
    return (
      <AuthLayout title="ยืนยันอีเมลแล้ว" subtitle="ใช้งานต่อได้ตามปกติ">
        <div className="grid gap-6">
          <AuthNotice icon={CircleCheck} tone="success" title="ยืนยันอีเมลเรียบร้อย">
            ใบแจ้งค่าบริการและการแจ้งเตือนจะส่งมาที่อีเมลนี้ และใช้อีเมลนี้ตั้งรหัสผ่านใหม่ได้เมื่อลืม
          </AuthNotice>
          {next}
        </div>
      </AuthLayout>
    )

  return (
    <AuthLayout title="ยืนยันอีเมลไม่สำเร็จ" subtitle="ลิงก์ยืนยันอีเมลใช้ได้ครั้งเดียวภายใน 72 ชั่วโมง">
      <div className="grid gap-6">
        <AuthNotice icon={Link2Off} tone="error" title="ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว">
          {verify.error && !/ลิงก์/.test(verify.error.message) ? (
            verify.error.message
          ) : loggedIn ? (
            <>
              ถ้ายืนยันไปแล้วไม่ต้องทำอะไรเพิ่ม ถ้ายังไม่ได้ยืนยัน กด <b className="font-medium">ส่งลิงก์อีกครั้ง</b>{' '}
              ที่แถบแจ้งเตือนด้านบนของแอป หรือที่เมนู <b className="font-medium">บัญชีของฉัน</b>
            </>
          ) : (
            'ถ้ายืนยันไปแล้วไม่ต้องทำอะไรเพิ่ม ถ้ายังไม่ได้ยืนยัน ให้เข้าสู่ระบบแล้วขอลิงก์ใหม่ที่เมนู "บัญชีของฉัน"'
          )}
        </AuthNotice>
        {next}
      </div>
    </AuthLayout>
  )
}
