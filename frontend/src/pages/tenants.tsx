import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Building,
  FileJson,
  IdCard,
  Link2,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Trash2,
  Unlink,
  UserX,
  Users,
} from 'lucide-react'
import { api, type Tenant } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { TenantDialog } from '@/components/tenant-dialog'
import { PortalLinkDialog } from '@/components/portal-link-dialog'
import { LineIcon, LineLinkDialog, LineSetupHint, TenantLineBadge, useTenantLineActions } from '@/components/line'
import { AnonymizeDialog, ConsentBadge, type AnonymizeTarget } from '@/components/privacy'
import { useExportTenant } from '@/lib/privacy'

type LineFilter = 'all' | 'linked' | 'unlinked'
const LINE_FILTERS: { v: LineFilter; label: string }[] = [
  { v: 'all', label: 'ทั้งหมด' },
  { v: 'linked', label: 'เชื่อม LINE แล้ว' },
  { v: 'unlinked', label: 'ยังไม่เชื่อม' },
]

export default function TenantsPage() {
  const { readOnly, features, line, lineReady, canManage } = useSession()
  const [params] = useSearchParams()
  const [anonFor, setAnonFor] = useState<AnonymizeTarget | null>(null)
  const exportTenant = useExportTenant()
  const [portalFor, setPortalFor] = useState<Tenant | null>(null)
  const [lineFor, setLineFor] = useState<Tenant | null>(null)
  const [lineFilter, setLineFilter] = useState<LineFilter>('all')
  const { sendPortal, askUnlink } = useTenantLineActions()
  const confirm = useConfirm()
  const { data: tenants, isLoading } = useQuery({ queryKey: ['tenants'], queryFn: api.tenants })
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(() => params.get('q') ?? '')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (tenants ?? []).filter(
      (t) =>
        (lineFilter === 'all' || (lineFilter === 'linked') === !!t.line_linked) &&
        (!s ||
          [t.full_name, t.phone, t.email, t.id_card, t.line_display_name ?? ''].some((v) =>
            v?.toLowerCase().includes(s),
          )),
    )
  }, [tenants, q, lineFilter])
  const linkedCount = useMemo(() => (tenants ?? []).filter((t) => t.line_linked).length, [tenants])
  const total = useMemo(() => (tenants ?? []).filter((t) => !t.anonymized_at).length, [tenants])

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
        <div className="flex gap-1 rounded-md border bg-muted/50 p-1" role="radiogroup" aria-label="กรองตามสถานะ LINE">
          {LINE_FILTERS.map((f) => (
            <button
              key={f.v}
              role="radio"
              aria-checked={lineFilter === f.v}
              onClick={() => setLineFilter(f.v)}
              className={cn(
                'h-7 rounded-sm px-2.5 text-xs whitespace-nowrap transition-colors',
                lineFilter === f.v
                  ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button className="ml-auto" onClick={() => edit(null)} disabled={readOnly}>
          <Plus /> เพิ่มผู้เช่า
        </Button>
      </div>

      {lineReady ? (
        <Card className="flex-row flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <LineIcon className="size-6" />
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-medium">LINE OA {line?.basic_id}</div>
            <div className="text-xs text-muted-foreground">ผู้เช่าที่เชื่อมแล้วจะได้รับบิล ใบเสร็จ และแจ้งเตือนทาง LINE</div>
          </div>
          <div className="ml-auto flex w-full items-center gap-3 sm:w-64">
            <Progress value={total ? (linkedCount / total) * 100 : 0} className="h-1.5 flex-1" aria-label="สัดส่วนผู้เช่าที่เชื่อม LINE" />
            <span className="text-sm whitespace-nowrap tabular-nums">
              <span className="font-semibold">{linkedCount}</span>
              <span className="text-muted-foreground"> / {total} คน</span>
            </span>
          </div>
        </Card>
      ) : (
        <LineSetupHint />
      )}

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
            title={q || lineFilter !== 'all' ? 'ไม่พบผู้เช่าที่ค้นหา' : 'ยังไม่มีผู้เช่า'}
            description={q || lineFilter !== 'all' ? 'ลองค้นหาด้วยคำอื่นหรือเปลี่ยนตัวกรอง' : 'เพิ่มผู้เช่าเพื่อใช้ในการจองและทำสัญญา'}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const anonymized = !!t.anonymized_at
            return (
              <Card
                key={t.id}
                className={cn('gap-0 overflow-hidden py-0', anonymized && 'bg-muted/40 text-muted-foreground shadow-none')}
              >
                <div className={cn('flex items-start gap-4 p-4', anonymized && 'opacity-80')}>
                  <Avatar className="size-11 rounded-md">
                    <AvatarFallback className="rounded-md bg-muted text-lg font-semibold text-muted-foreground">
                      {initials(t.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="truncate font-medium">{t.full_name}</div>
                    {!anonymized && (
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
                    )}
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
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {!anonymized && <TenantLineBadge tenant={t} />}
                      <ConsentBadge tenant={t} />
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="ตัวเลือก" disabled={readOnly}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!anonymized && (
                        <DropdownMenuItem onSelect={() => edit(t)}>
                          <Pencil /> แก้ไข
                        </DropdownMenuItem>
                      )}
                      {features.portal && !anonymized && (
                        <DropdownMenuItem onSelect={() => setPortalFor(t)}>
                          <Link2 /> ลิงก์พอร์ทัล (ส่งเอง)
                        </DropdownMenuItem>
                      )}
                      {t.line_linked && !anonymized && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setLineFor(t)}>
                            <LineIcon /> จัดการ LINE
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => void askUnlink(t)}>
                            <Unlink /> ยกเลิกการเชื่อม LINE
                          </DropdownMenuItem>
                        </>
                      )}
                      {canManage && !anonymized && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => exportTenant.mutate(t.id)}>
                            <FileJson /> ส่งออกข้อมูล (JSON)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setAnonFor({ id: t.id, name: t.full_name })}
                          >
                            <UserX /> ลบข้อมูลส่วนบุคคล
                          </DropdownMenuItem>
                        </>
                      )}
                      {!anonymized && <DropdownMenuSeparator />}
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
                </div>
                {anonymized ? (
                  <div className="mt-auto border-t px-4 py-2.5 text-xs">
                    ข้อมูลส่วนบุคคลถูกลบแล้ว — เอกสารการเงินยังเก็บไว้ตามกฎหมาย
                  </div>
                ) : (
                  <div className="mt-auto flex flex-wrap gap-2 border-t bg-muted/30 px-4 py-2.5">
                    {t.line_linked ? (
                      features.portal && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 bg-card text-xs"
                          disabled={readOnly || !lineReady || (sendPortal.isPending && sendPortal.variables?.id === t.id)}
                          onClick={() => sendPortal.mutate(t)}
                        >
                          {sendPortal.isPending && sendPortal.variables?.id === t.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Send />
                          )}
                          ส่งลิงก์พอร์ทัลทาง LINE
                        </Button>
                      )
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card text-xs"
                        disabled={readOnly || !lineReady}
                        title={!lineReady ? 'ยังไม่ได้ตั้งค่า LINE OA' : undefined}
                        onClick={() => setLineFor(t)}
                      >
                        <LineIcon /> เชื่อม LINE
                      </Button>
                    )}
                    {features.portal &&
                      (t.line_linked ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="ml-auto"
                          aria-label="ลิงก์พอร์ทัล (ส่งเอง)"
                          title="ลิงก์พอร์ทัล (ส่งเอง)"
                          onClick={() => setPortalFor(t)}
                        >
                          <Link2 />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPortalFor(t)}>
                          <Link2 /> ลิงก์พอร์ทัล (ส่งเอง)
                        </Button>
                      ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <TenantDialog open={open} onOpenChange={setOpen} tenant={editing} />
      <PortalLinkDialog tenant={portalFor} onClose={() => setPortalFor(null)} />
      <LineLinkDialog tenant={lineFor} onClose={() => setLineFor(null)} />
      <AnonymizeDialog target={anonFor} onClose={() => setAnonFor(null)} />
    </div>
  )
}
