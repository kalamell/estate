import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, Loader2, Save, Search } from 'lucide-react'
import { api, type AdminOrg, type OrgStatus, type Package } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { ORG_STATUS, thDate, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/common'

export default function AdminOrgs() {
  const orgs = useQuery({ queryKey: ['admin', 'orgs'], queryFn: api.admin.orgs })
  const packages = useQuery({ queryKey: ['admin', 'packages'], queryFn: api.admin.packages })
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = orgs.data ?? []
    if (!s) return list
    return list.filter((o) =>
      [o.name, o.owner_name, o.owner_email, o.package_name].some((v) => v?.toLowerCase().includes(s)),
    )
  }, [orgs.data, q])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">องค์กรลูกค้า</h1>
          <p className="text-sm text-muted-foreground">เปลี่ยนแพ็กเกจ สถานะ และวันสิ้นสุดการใช้งาน</p>
        </div>
        <div className="relative w-full sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาองค์กร เจ้าของ แพ็กเกจ" className="bg-card pl-9" aria-label="ค้นหาองค์กร" />
        </div>
      </div>
      <Card className="overflow-hidden py-0">
        {orgs.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !filtered.length ? (
          <EmptyState icon={Building2} title="ไม่พบองค์กร" />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-4">องค์กร</TableHead>
                <TableHead>การใช้งาน</TableHead>
                <TableHead>แพ็กเกจ</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>วันสิ้นสุด</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <OrgRow key={o.id} org={o} packages={packages.data ?? []} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function OrgRow({ org, packages }: { org: AdminOrg; packages: Package[] }) {
  const initial = { package_id: String(org.package_id), status: org.status, ends_at: org.ends_at?.slice(0, 10) ?? '' }
  const [draft, setDraft] = useState(initial)
  const dirty =
    draft.package_id !== initial.package_id || draft.status !== initial.status || draft.ends_at !== initial.ends_at
  const expired = !!draft.ends_at && draft.ends_at < today()

  const save = useMutation({
    mutationFn: () =>
      api.admin.updateOrg(org.id, {
        package_id: Number(draft.package_id),
        status: draft.status,
        ends_at: draft.ends_at || null,
      }),
    onSuccess: async () => {
      toast.success(`บันทึก “${org.name}” แล้ว`)
      await invalidate('admin')
    },
  })

  return (
    <TableRow className={cn(dirty && 'bg-amber-50/60 dark:bg-amber-500/5')}>
      <TableCell className="pl-4">
        <div className="font-medium">{org.name}</div>
        <div className="text-xs text-muted-foreground">
          {org.owner_name ?? '—'}
          {org.owner_email && <span> · {org.owner_email}</span>}
        </div>
        <div className="text-[11px] text-muted-foreground/80">สร้าง {thDate(org.created_at)}</div>
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {org.properties} โครงการ · {org.units} ห้อง · {org.members} คน
      </TableCell>
      <TableCell>
        <Select value={draft.package_id} onValueChange={(v) => setDraft((d) => ({ ...d, package_id: v }))}>
          <SelectTrigger size="sm" className="w-36" aria-label="แพ็กเกจ">
            <SelectValue placeholder={org.package_name} />
          </SelectTrigger>
          <SelectContent>
            {packages.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
                {!p.is_active && <span className="text-muted-foreground"> (ปิด)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v as OrgStatus }))}>
          <SelectTrigger size="sm" className="w-32" aria-label="สถานะ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ORG_STATUS) as OrgStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                <span className={cn('size-2 rounded-full', ORG_STATUS[s].dot)} />
                {ORG_STATUS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={draft.ends_at}
          onChange={(e) => setDraft((d) => ({ ...d, ends_at: e.target.value }))}
          className={cn('h-8 w-40', expired && 'border-destructive/50 text-destructive')}
          aria-label="วันสิ้นสุด"
        />
      </TableCell>
      <TableCell className="pr-4 text-right">
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          บันทึก
        </Button>
      </TableCell>
    </TableRow>
  )
}
