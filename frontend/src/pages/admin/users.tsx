import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, Users } from 'lucide-react'
import { api, type AdminUser } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { initials, thDate } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/common'
import { useConfirm } from '@/components/confirm'

export default function AdminUsers() {
  const { user: me } = useSession()
  const confirm = useConfirm()
  const { data: users, isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: api.admin.users })
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users ?? []
    return (users ?? []).filter((u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s))
  }, [users, q])

  const update = useMutation({
    mutationFn: (v: { u: AdminUser; patch: { is_super_admin?: boolean; is_active?: boolean } }) =>
      api.admin.updateUser(v.u.id, v.patch),
    onSuccess: async () => {
      toast.success('อัปเดตผู้ใช้แล้ว')
      await invalidate('admin')
    },
  })

  const toggle = async (u: AdminUser, patch: { is_super_admin?: boolean; is_active?: boolean }) => {
    if (patch.is_super_admin === true) {
      const ok = await confirm({
        title: `ให้สิทธิ์ Super Admin แก่ ${u.name}?`,
        description: 'ผู้ใช้นี้จะเข้าถึงและแก้ไขข้อมูลของทุกองค์กรในระบบได้',
        confirmText: 'ให้สิทธิ์',
      })
      if (!ok) return
    }
    if (patch.is_active === false) {
      const ok = await confirm({
        title: `ปิดการใช้งาน ${u.name}?`,
        description: 'ผู้ใช้นี้จะไม่สามารถเข้าสู่ระบบได้จนกว่าจะเปิดใช้งานอีกครั้ง',
        confirmText: 'ปิดการใช้งาน',
        destructive: true,
      })
      if (!ok) return
    }
    update.mutate({ u, patch })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">ผู้ใช้</h1>
          <p className="text-sm text-muted-foreground">จัดการสิทธิ์ Super Admin และการเปิด/ปิดบัญชี</p>
        </div>
        <div className="relative w-full sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อหรืออีเมล" className="bg-card pl-9" aria-label="ค้นหาผู้ใช้" />
        </div>
      </div>
      <Card className="overflow-hidden py-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !filtered.length ? (
          <EmptyState icon={Users} title="ไม่พบผู้ใช้" />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-4">ผู้ใช้</TableHead>
                <TableHead className="text-center">องค์กร</TableHead>
                <TableHead className="hidden md:table-cell">สมัครเมื่อ</TableHead>
                <TableHead className="text-center">Super Admin</TableHead>
                <TableHead className="pr-4 text-center">ใช้งาน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const self = u.id === me.id
                return (
                  <TableRow key={u.id} className={u.is_active ? '' : 'opacity-60'}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback className={u.is_super_admin ? 'bg-gradient-to-br from-amber-400 to-rose-500 font-semibold text-white' : 'bg-secondary font-semibold text-secondary-foreground'}>
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="truncate">{u.name}</span>
                            {self && <Badge variant="secondary" className="text-[10px]">คุณ</Badge>}
                            {!u.is_active && <Badge variant="outline" className="text-[10px]">ปิดใช้งาน</Badge>}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{u.org_count}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{thDate(u.created_at)}</TableCell>
                    {(['is_super_admin', 'is_active'] as const).map((k) => (
                      <TableCell key={k} className={k === 'is_active' ? 'pr-4 text-center' : 'text-center'}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Switch
                                checked={u[k]}
                                disabled={self || update.isPending}
                                onCheckedChange={(v) => void toggle(u, { [k]: v })}
                                aria-label={`${k === 'is_super_admin' ? 'Super Admin' : 'ใช้งาน'} — ${u.name}`}
                                className={k === 'is_super_admin' ? 'data-[state=checked]:bg-amber-500' : undefined}
                              />
                            </span>
                          </TooltipTrigger>
                          {self && <TooltipContent>เปลี่ยนสิทธิ์ของตัวเองไม่ได้</TooltipContent>}
                        </Tooltip>
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
