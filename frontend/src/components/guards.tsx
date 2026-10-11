import { useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Building2, LogOut, ShieldCheck } from 'lucide-react'
import { SessionProvider, useMe, useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FullScreenLoader, Logo } from '@/components/common'
import { CreateOrgDialog } from '@/components/org-switcher'
import { useLogout } from '@/components/user-menu'

export { NavigatorBridge } from '@/components/navigator-bridge'

/** ต้องเข้าสู่ระบบ — มิฉะนั้นพาไป /login */
export function RequireAuth() {
  const { data: me, isLoading, isError, refetch } = useMe()
  const location = useLocation()
  if (isLoading) return <FullScreenLoader />
  if (isError)
    return (
      <div className="grid min-h-svh place-items-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-muted-foreground">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</p>
          <Button onClick={() => refetch()}>ลองใหม่</Button>
        </div>
      </div>
    )
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return (
    <SessionProvider me={me}>
      <Outlet />
    </SessionProvider>
  )
}

/** หน้า login/register — ถ้าเข้าสู่ระบบแล้วให้ไปหน้าแรก */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe()
  if (isLoading) return <FullScreenLoader />
  if (me) return <Navigate to="/" replace />
  return <>{children}</>
}

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user } = useSession()
  if (!user.is_super_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

/** ต้องมีองค์กรอย่างน้อย 1 แห่ง */
export function RequireOrg({ children }: { children: ReactNode }) {
  const { orgs, user, switchOrg } = useSession()
  const [open, setOpen] = useState(false)
  const logout = useLogout()
  const navigate = useNavigate()
  if (orgs.length) return <>{children}</>
  return (
    <div className="grid min-h-svh place-items-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Logo className="mx-auto mb-2" subtitle={false} />
          <CardTitle>ยังไม่มีองค์กร</CardTitle>
          <CardDescription>
            สร้างองค์กรแรกเพื่อเริ่มจัดการโครงการและห้องเช่า หรือขอให้เจ้าของเพิ่มคุณเป็นสมาชิก
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Button onClick={() => setOpen(true)}>
            <Building2 /> สร้างองค์กร
          </Button>
          {user.is_super_admin && (
            <Button variant="outline" onClick={() => navigate('/admin')}>
              <ShieldCheck /> ไปที่ Super Admin Console
            </Button>
          )}
          <Button variant="ghost" onClick={() => void logout()}>
            <LogOut /> ออกจากระบบ
          </Button>
        </CardContent>
      </Card>
      <CreateOrgDialog open={open} onOpenChange={setOpen} onCreated={switchOrg} />
    </div>
  )
}
