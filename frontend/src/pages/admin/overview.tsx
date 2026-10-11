import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building, Building2, CircleDollarSign, DoorOpen, FlaskConical, Inbox, PauseCircle, Users, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { baht } from '@/lib/format'
import { StatCard, StatCardSkeleton } from '@/components/common'

export default function AdminOverview() {
  const { data: s } = useQuery({ queryKey: ['admin', 'stats'], queryFn: api.admin.stats })
  const billing = useQuery({
    queryKey: ['admin', 'billing', 'settings'],
    queryFn: () => api.admin.billing({ status: 'review' }),
    meta: { silent: true },
  }).data?.summary
  if (!s)
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    )
  const n = (v: number) => v.toLocaleString('th-TH')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">ภาพรวมระบบ</h1>
        <p className="text-sm text-muted-foreground">สรุปลูกค้าและรายได้ประจำของ Estate</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="รายได้ประจำต่อเดือน (MRR)"
          icon={CircleDollarSign}
          tone="success"
          value={baht(s.mrr)}
          sub="จากองค์กรที่ใช้งานอยู่"
          className="col-span-2"
        />
        <Link to="/admin/billing" className="col-span-2 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <StatCard
            label="สลิปรอตรวจ"
            icon={Inbox}
            tone={billing?.review ? 'warning' : 'default'}
            value={billing ? n(billing.review) : '—'}
            sub={billing ? `รอชำระ ${n(billing.pending)} · รับเดือนนี้ ${baht(billing.revenue_month)}` : 'ค่าบริการแพ็กเกจ'}
            className="h-full transition-colors hover:bg-muted/40"
          />
        </Link>
        <StatCard label="องค์กรทั้งหมด" icon={Building2} value={n(s.orgs)} />
        <StatCard label="ใช้งานอยู่" icon={Zap} tone="brand" value={n(s.active_orgs)} />
        <StatCard label="ทดลองใช้" icon={FlaskConical} value={n(s.trial_orgs)} />
        <StatCard label="ถูกระงับ" icon={PauseCircle} tone="danger" value={n(s.suspended_orgs)} />
        <StatCard label="ผู้ใช้" icon={Users} value={n(s.users)} className="col-span-2" />
        <StatCard label="โครงการ / ห้อง" icon={Building} className="col-span-2" value={`${n(s.properties)} / ${n(s.units)}`} sub={<span className="inline-flex items-center gap-1"><DoorOpen className="size-3" /> ห้องทั้งหมดในระบบ</span>} />
      </div>
    </div>
  )
}
