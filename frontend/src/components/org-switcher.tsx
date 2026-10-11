import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react'
import { api, type Me } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { ORG_STATUS, ROLES, initials } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { Field } from '@/components/common'

export function CreateOrgDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated?: (id: number) => void
}) {
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () => api.createOrg(name.trim()),
    onSuccess: (org) => {
      queryClient.setQueryData<Me | null>(['me'], (me) =>
        me ? { ...me, orgs: [...me.orgs, org] } : me,
      )
      toast.success(`สร้างองค์กร “${org.name}” แล้ว`)
      setName('')
      onOpenChange(false)
      onCreated?.(org.id)
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>สร้างองค์กรใหม่</DialogTitle>
            <DialogDescription>
              แยกพื้นที่ทำงานสำหรับธุรกิจอื่น เริ่มต้นด้วยแพ็กเกจทดลองใช้
            </DialogDescription>
          </DialogHeader>
          <Field label="ชื่อองค์กร" htmlFor="org-name">
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น บ้านสวนอพาร์ทเมนต์"
              required
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending && <Loader2 className="animate-spin" />}
              สร้างองค์กร
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function OrgSwitcher() {
  const { orgs, org, switchOrg } = useSession()
  const { isMobile, setOpenMobile } = useSidebar()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground">
                {initials(org?.name ?? '?')}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-sidebar-accent-foreground">
                  {org?.name ?? 'เลือกองค์กร'}
                </span>
                <span className="truncate text-xs opacity-70">
                  {org ? `${org.package_name} · ${ROLES[org.role]}` : ''}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">องค์กรของคุณ</DropdownMenuLabel>
            {orgs.map((o) => (
              <DropdownMenuItem
                key={o.id}
                onSelect={() => {
                  if (o.id !== org?.id) switchOrg(o.id)
                  setOpenMobile(false)
                }}
                className="gap-2 p-2"
              >
                <div className="grid size-7 place-items-center rounded-md border text-xs font-semibold">
                  {initials(o.name)}
                </div>
                <div className="grid flex-1 leading-tight">
                  <span className="truncate">{o.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {ROLES[o.role]} · {ORG_STATUS[o.status]?.label ?? o.status}
                  </span>
                </div>
                {o.id === org?.id && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" onSelect={() => setCreateOpen(true)}>
              <div className="grid size-7 place-items-center rounded-md border border-dashed">
                <Plus className="size-4" />
              </div>
              <span className="font-medium">สร้างองค์กรใหม่</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={switchOrg} />
    </SidebarMenu>
  )
}
