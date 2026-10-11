import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building, IdCard, Link2, Mail, MoreHorizontal, Pencil, Phone, Plus, Search, Trash2, Users } from 'lucide-react'
import { api, type Tenant } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { initials } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { TenantDialog } from '@/components/tenant-dialog'
import { PortalLinkDialog } from '@/components/portal-link-dialog'

export default function TenantsPage() {
  const { readOnly, features } = useSession()
  const [portalFor, setPortalFor] = useState<Tenant | null>(null)
  const confirm = useConfirm()
  const { data: tenants, isLoading } = useQuery({ queryKey: ['tenants'], queryFn: api.tenants })
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return tenants ?? []
    return (tenants ?? []).filter((t) =>
      [t.full_name, t.phone, t.email, t.id_card].some((v) => v?.toLowerCase().includes(s)),
    )
  }, [tenants, q])

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteTenant(id),
    onSuccess: async () => {
      toast.success('ลบแล้ว')
      await invalidate('tenants')
    },
  })
  const edit = (t: Tenant | null) => {
    setEditing(t)
    setOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์โทร อีเมล"
            className="bg-card pl-9"
            aria-label="ค้นหาผู้เช่า"
          />
        </div>
        <Button className="ml-auto" onClick={() => edit(null)} disabled={readOnly}>
          <Plus /> เพิ่มผู้เช่า
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            icon={Users}
            title={q ? 'ไม่พบผู้เช่าที่ค้นหา' : 'ยังไม่มีผู้เช่า'}
            description={q ? 'ลองค้นหาด้วยคำอื่น' : 'เพิ่มผู้เช่าเพื่อใช้ในการจองและทำสัญญา'}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card key={t.id} className="flex-row items-start gap-4 p-4">
              <Avatar className="size-11 rounded-md">
                <AvatarFallback className="rounded-md bg-muted text-lg font-semibold text-muted-foreground">
                  {initials(t.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate font-medium">{t.full_name}</div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="size-3.5" />
                  {t.phone ? (
                    <a href={`tel:${t.phone}`} className="hover:text-foreground hover:underline">
                      {t.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </div>
                {t.email && (
                  <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" />
                    <span className="truncate">{t.email}</span>
                  </div>
                )}
                {t.id_card && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <IdCard className="size-3.5" />
                    {t.id_card}
                  </div>
                )}
                {t.tax_id && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building className="size-3.5" />
                    เลขผู้เสียภาษี {t.tax_id}
                  </div>
                )}
                {features.portal && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => setPortalFor(t)}
                  >
                    <Link2 /> ลิงก์พอร์ทัลผู้เช่า
                  </Button>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="ตัวเลือก" disabled={readOnly}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => edit(t)}>
                    <Pencil /> แก้ไข
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={async () => {
                      if (
                        await confirm({
                          title: `ลบ ${t.full_name}?`,
                          description: 'การลบไม่สามารถย้อนกลับได้',
                          confirmText: 'ลบ',
                          destructive: true,
                        })
                      )
                        remove.mutate(t.id)
                    }}
                  >
                    <Trash2 /> ลบ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
        </div>
      )}

      <TenantDialog open={open} onOpenChange={setOpen} tenant={editing} />
      <PortalLinkDialog tenant={portalFor} onClose={() => setPortalFor(null)} />
    </div>
  )
}
