// ประวัติการใช้งาน (audit log) — /audit-logs (เจ้าของ/ผู้ดูแล)
import { Fragment, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, History, Loader2 } from 'lucide-react'
import { api, type AuditLog } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AdminOnlyState, EmptyState } from '@/components/common'

const LIMIT = 50
const ALL = 'all'

/** ชื่อการกระทำภาษาไทย (ไม่พบ → แสดงค่าดิบ) */
const AUDIT_ACTIONS: Record<string, string> = {
  'auth.login': 'เข้าสู่ระบบ',
  'auth.logout': 'ออกจากระบบ',
  'auth.login_failed': 'เข้าสู่ระบบไม่สำเร็จ',
  'payment.create': 'บันทึกการชำระเงิน',
  'invoice.create': 'สร้างใบแจ้งหนี้',
  'invoice.generate': 'ออกใบแจ้งหนี้รายเดือน',
  'invoice.void': 'ยกเลิกใบแจ้งหนี้',
  'receipt.void': 'ยกเลิกใบเสร็จ',
  'tenant.create': 'เพิ่มผู้เช่า',
  'tenant.update': 'แก้ไขผู้เช่า',
  'tenant.delete': 'ลบผู้เช่า',
  'tenant.export': 'ส่งออกข้อมูลผู้เช่า',
  'tenant.anonymize': 'ลบข้อมูลส่วนบุคคลผู้เช่า',
  'tenant.consent': 'บันทึกความยินยอม',
  'tenant.portal_token': 'สร้างลิงก์พอร์ทัลผู้เช่าใหม่',
  'tenant.self_export': 'ผู้เช่าดาวน์โหลดข้อมูลของตนเอง',
  'booking.update': 'แก้ไขการจอง',
  'subscription.checkout': 'สั่งซื้อ/ต่ออายุแพ็กเกจ',
  'subscription.slip': 'แนบสลิปค่าแพ็กเกจ',
  'subscription.cancel': 'ยกเลิกใบแจ้งหนี้ค่าแพ็กเกจ',
  'subscription.paid': 'ชำระค่าแพ็กเกจแล้ว (ต่ออายุ)',
  'subscription.rejected': 'สลิปค่าแพ็กเกจไม่ผ่าน',
  'member.add': 'เพิ่มสมาชิก',
  'member.remove': 'นำสมาชิกออก',
  'member.role': 'เปลี่ยนบทบาทสมาชิก',
  'org.update': 'แก้ไขข้อมูลองค์กร',
  'line.update': 'แก้ไขการตั้งค่า LINE OA',
  'property.delete': 'ลบโครงการ',
  'unit.delete': 'ลบห้อง',
  'booking.status': 'เปลี่ยนสถานะการจอง',
  'move_out.settle': 'ปิดยอดย้ายออก/คืนมัดจำ',
  'privacy_request.create': 'ยื่นคำขอ PDPA',
  'privacy_request.update': 'ตอบคำขอ PDPA',
}

const AUDIT_ENTITIES: Record<string, string> = {
  auth: 'การเข้าสู่ระบบ',
  payment: 'การชำระเงิน',
  invoice: 'ใบแจ้งหนี้',
  receipt: 'ใบเสร็จ',
  tenant: 'ผู้เช่า',
  booking: 'การจอง',
  move_out: 'ย้ายออก',
  property: 'โครงการ',
  unit: 'ห้อง',
  member: 'สมาชิก',
  org: 'องค์กร',
  line: 'LINE OA',
  privacy_request: 'คำขอ PDPA',
}

/** สีตามความอ่อนไหวของการกระทำ */
const actionTone = (a: string) =>
  /\.(void|delete|remove|anonymize)$/.test(a)
    ? 'bg-destructive'
    : /\.(export|role|login_failed)$/.test(a)
      ? 'bg-warning'
      : 'bg-muted-foreground/40'

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

export default function AuditLogsPage() {
  const { canManage } = useSession()
  if (!canManage) return <AdminOnlyState />
  return <AuditLogs />
}

function AuditLogs() {
  const [entity, setEntity] = useState(ALL)
  const [userId, setUserId] = useState(ALL)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const members = useQuery({ queryKey: ['members'], queryFn: api.members, meta: { silent: true } })

  const q = useInfiniteQuery({
    queryKey: ['audit-logs', entity, userId],
    queryFn: ({ pageParam }) =>
      api.auditLogs({
        entity: entity === ALL ? '' : entity,
        user_id: userId === ALL ? '' : Number(userId),
        limit: LIMIT,
        before_id: pageParam,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length >= LIMIT ? last[last.length - 1]?.id : undefined),
  })
  const rows = useMemo(() => q.data?.pages.flat() ?? [], [q.data])

  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-44 bg-card" aria-label="กรองตามประเภทข้อมูล">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกประเภท</SelectItem>
            {Object.entries(AUDIT_ENTITIES).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-48 bg-card" aria-label="กรองตามผู้ใช้">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ผู้ใช้ทั้งหมด</SelectItem>
            {(members.data ?? []).map((m) => (
              <SelectItem key={m.user_id} value={String(m.user_id)}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">บันทึกการทำรายการสำคัญเพื่อการตรวจสอบย้อนหลัง</p>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={History}
            title="ไม่พบประวัติ"
            description={entity !== ALL || userId !== ALL ? 'ลองเปลี่ยนตัวกรอง' : 'การทำรายการสำคัญจะถูกบันทึกที่นี่'}
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-8 pl-4" />
                <TableHead>เวลา</TableHead>
                <TableHead>ผู้ใช้</TableHead>
                <TableHead>การกระทำ</TableHead>
                <TableHead>รายการ</TableHead>
                <TableHead className="hidden pr-4 md:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <LogRow key={r.id} r={r} open={expanded.has(r.id)} onToggle={() => toggle(r.id)} />
              ))}
            </TableBody>
          </Table>
          {q.hasNextPage && (
            <div className="border-t p-3 text-center">
              <Button variant="outline" size="sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
                โหลดเพิ่ม
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function LogRow({ r, open, onToggle }: { r: AuditLog; open: boolean; onToggle: () => void }) {
  const hasDetail = !!r.detail && Object.keys(r.detail).length > 0
  const label = AUDIT_ACTIONS[r.action]
  return (
    <Fragment>
      <TableRow
        className={cn(hasDetail && 'cursor-pointer', open && 'border-b-0 bg-muted/30')}
        onClick={hasDetail ? onToggle : undefined}
      >
        <TableCell className="pl-4">
          {hasDetail && (
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              className="grid size-6 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          )}
        </TableCell>
        <TableCell className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{fmtTime(r.created_at)}</TableCell>
        <TableCell className="max-w-40 truncate">{r.user_name ?? <span className="text-muted-foreground">ระบบ</span>}</TableCell>
        <TableCell>
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className={cn('size-1.5 shrink-0 rounded-full', actionTone(r.action))} aria-hidden />
            {label ?? <code className="text-xs">{r.action}</code>}
          </span>
        </TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground">
          {AUDIT_ENTITIES[r.entity] ?? r.entity}
          {r.entity_id != null && <span className="tabular-nums"> #{r.entity_id}</span>}
        </TableCell>
        <TableCell className="hidden pr-4 font-mono text-xs text-muted-foreground md:table-cell">{r.ip ?? '—'}</TableCell>
      </TableRow>
      {open && hasDetail && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell />
          <TableCell colSpan={5} className="pt-0 pr-4 pb-3">
            {label && <div className="mb-1.5 font-mono text-[11px] text-muted-foreground">{r.action}</div>}
            <pre className="max-h-72 max-w-[calc(100vw-5rem)] overflow-auto rounded-md border bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(r.detail, null, 2)}
            </pre>
            {r.ip && <div className="mt-1.5 font-mono text-[11px] text-muted-foreground md:hidden">IP {r.ip}</div>}
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )
}
