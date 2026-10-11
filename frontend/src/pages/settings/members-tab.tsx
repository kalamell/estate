import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Trash2, UserPlus, Users } from 'lucide-react'
import { api, type Member, type Role } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { ROLES, initials, thDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, ToneBadge } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { LineIcon, StaffLineDialog } from '@/components/line'

const ROLE_HINT: Record<Role, string> = {
  owner: 'จัดการได้ทุกอย่าง รวมถึงสมาชิกและองค์กร',
  admin: 'จัดการโครงการ ห้อง และสมาชิกได้',
  staff: 'ทำงานประจำวัน: จอง จดมิเตอร์ ออกบิล',
}

function RoleSelect({
  value,
  onChange,
  disabled,
  id,
  allowOwner,
}: {
  value: Role
  onChange: (r: Role) => void
  disabled?: boolean
  id?: string
  allowOwner: boolean
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)} disabled={disabled}>
      <SelectTrigger id={id} size="sm" className="w-32" aria-label="บทบาท">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(ROLES) as Role[])
          .filter((r) => allowOwner || r !== 'owner' || value === 'owner')
          .map((r) => (
            <SelectItem key={r} value={r}>
              {ROLES[r]}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}

export function MembersTab() {
  const { canManage, readOnly, user, role, orgInfo } = useSession()
  const confirm = useConfirm()
  const [addOpen, setAddOpen] = useState(false)
  const [lineOpen, setLineOpen] = useState(false)
  const { data: members, isLoading } = useQuery({ queryKey: ['members'], queryFn: api.members })
  const meLinked = !!members?.find((m) => m.user_id === user.id)?.line_linked

  const update = useMutation({
    mutationFn: (v: { m: Member; role: Role }) => api.updateMember(v.m.user_id, v.role),
    onSuccess: async () => {
      toast.success('เปลี่ยนบทบาทแล้ว')
      await invalidate('members')
    },
  })
  const remove = useMutation({
    mutationFn: (m: Member) => api.removeMember(m.user_id),
    onSuccess: async () => {
      toast.success('นำสมาชิกออกแล้ว')
      await invalidate('members', 'org-info')
    },
  })

  const editable = canManage && !readOnly
  const maxMembers = orgInfo?.package.max_members

  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="border-b pb-6">
        <CardTitle>สมาชิกในองค์กร</CardTitle>
        <CardDescription>
          {members ? `${members.length}${maxMembers ? ` / ${maxMembers}` : ''} คน` : ' '}
          {!canManage && ' · เฉพาะเจ้าของหรือผู้ดูแลเท่านั้นที่จัดการสมาชิกได้'}
        </CardDescription>
        {canManage && (
          <CardAction>
            <Button onClick={() => setAddOpen(true)} disabled={readOnly}>
              <UserPlus /> <span className="hidden sm:inline">เพิ่มสมาชิก</span>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b bg-muted/30 px-4 py-3 sm:px-6">
        <LineIcon className={cn('size-5', !meLinked && 'opacity-60 grayscale')} />
        <div className="min-w-[12rem] flex-1 text-sm">
          <div className="font-medium">{meLinked ? 'LINE ของคุณเชื่อมแล้ว' : 'รับแจ้งงานทาง LINE'}</div>
          <div className="text-xs text-muted-foreground">
            {meLinked
              ? 'คุณจะได้รับแจ้งงานแม่บ้านและงานที่ได้รับมอบหมายทาง LINE'
              : 'เชื่อม LINE ของคุณกับ LINE OA ขององค์กร เพื่อรับแจ้งงานแม่บ้านบนมือถือ'}
          </div>
        </div>
        <Button
          variant={meLinked ? 'outline' : 'default'}
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => setLineOpen(true)}
        >
          {meLinked ? 'จัดการ' : 'เชื่อม LINE ของฉัน (รับแจ้งงาน)'}
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : !members?.length ? (
        <EmptyState icon={Users} title="ยังไม่มีสมาชิก" />
      ) : (
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="pl-6">สมาชิก</TableHead>
              <TableHead>บทบาท</TableHead>
              <TableHead className="hidden sm:table-cell">LINE</TableHead>
              <TableHead className="hidden sm:table-cell">เข้าร่วมเมื่อ</TableHead>
              <TableHead className="pr-6" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const self = m.user_id === user.id
              return (
                <TableRow key={m.user_id}>
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">
                          {initials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="truncate">{m.name}</span>
                          {m.line_linked && (
                            <span className="sm:hidden" title="เชื่อม LINE แล้ว">
                              <LineIcon className="size-3.5" />
                            </span>
                          )}
                          {self && (
                            <Badge variant="secondary" className="text-[10px]">
                              คุณ
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {editable && !self ? (
                      <RoleSelect
                        value={m.role}
                        allowOwner={role === 'owner'}
                        disabled={update.isPending}
                        onChange={(r) => r !== m.role && update.mutate({ m, role: r })}
                      />
                    ) : (
                      <Badge variant="outline">{ROLES[m.role]}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {m.line_linked ? (
                      <ToneBadge tone="green" className="gap-1.5">
                        <LineIcon className="size-3.5" /> เชื่อมแล้ว
                      </ToneBadge>
                    ) : self ? (
                      <Button variant="outline" size="xs" onClick={() => setLineOpen(true)}>
                        <LineIcon className="size-3.5" /> เชื่อม LINE ของฉัน
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">ยังไม่เชื่อม</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{thDate(m.created_at)}</TableCell>
                  <TableCell className="pr-6 text-right">
                    {editable && !self && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label={`นำ ${m.name} ออก`}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: `นำ ${m.name} ออกจากองค์กร?`,
                              description: 'ผู้ใช้นี้จะไม่สามารถเข้าถึงข้อมูลขององค์กรนี้ได้อีก',
                              confirmText: 'นำออก',
                              destructive: true,
                            })
                          )
                            remove.mutate(m)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} allowOwner={role === 'owner'} />
      <StaffLineDialog open={lineOpen} onOpenChange={setLineOpen} />
    </Card>
  )
}

function AddMemberDialog({
  open,
  onOpenChange,
  allowOwner,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  allowOwner: boolean
}) {
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'staff' as Role })
  const set = (k: 'email' | 'name' | 'password') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const add = useMutation({
    mutationFn: () =>
      api.addMember({
        email: form.email.trim(),
        role: form.role,
        name: form.name.trim() || undefined,
        password: form.password || undefined,
      }),
    onSuccess: async () => {
      toast.success('เพิ่มสมาชิกแล้ว')
      setForm({ email: '', name: '', password: '', role: 'staff' })
      onOpenChange(false)
      await invalidate('members', 'org-info')
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>เพิ่มสมาชิก</DialogTitle>
            <DialogDescription>
              ใส่อีเมลของผู้ใช้ที่มีบัญชีอยู่แล้ว หรือกรอกชื่อและรหัสผ่านเพื่อสร้างบัญชีใหม่
            </DialogDescription>
          </DialogHeader>
          <Field label="อีเมล" htmlFor="am-email">
            <Input id="am-email" type="email" value={form.email} onChange={set('email')} required autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อ (สำหรับบัญชีใหม่)" htmlFor="am-name">
              <Input id="am-name" value={form.name} onChange={set('name')} />
            </Field>
            <Field label="รหัสผ่าน (สำหรับบัญชีใหม่)" htmlFor="am-pass">
              <Input
                id="am-pass"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={form.password}
                onChange={set('password')}
              />
            </Field>
          </div>
          <Field label="บทบาท" htmlFor="am-role" hint={ROLE_HINT[form.role]}>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}>
              <SelectTrigger id="am-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLES) as Role[])
                  .filter((r) => allowOwner || r !== 'owner')
                  .map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLES[r]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Loader2 className="animate-spin" />}
              เพิ่มสมาชิก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
