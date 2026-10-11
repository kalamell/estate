// ราคาตามฤดูกาล — /properties/:id/pricing
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, CalendarRange, Layers, MoreHorizontal, Pencil, Plus, Tags, Trash2, Zap } from 'lucide-react'
import { api, type RateRule } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { KINDS } from '@/lib/format'
import { describeRule, isExpired, presets } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { EmptyState, ToneBadge, UpsellCard } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { PricePreview } from './price-preview'
import { RuleDialog, type RuleDraft } from './rule-dialog'

const byPriority = (a: RateRule, b: RateRule) => b.priority - a.priority || a.name.localeCompare(b.name, 'th')

export default function PricingPage() {
  const { id } = useParams()
  const propertyId = Number(id)
  const { features, featuresLoaded, canManage, readOnly } = useSession()
  const confirm = useConfirm()
  const [draft, setDraft] = useState<RuleDraft | null>(null)

  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const property = properties.data?.find((p) => p.id === propertyId)
  const enabled = features.short_stay && Number.isFinite(propertyId)
  const rules = useQuery({
    queryKey: ['rate-rules', propertyId],
    queryFn: () => api.rateRules(propertyId),
    enabled,
  })
  const units = useQuery({
    queryKey: ['units', propertyId],
    queryFn: () => api.units(propertyId),
    enabled,
  })

  const groups = useMemo(() => {
    const list = rules.data ?? []
    return {
      night: list.filter((r) => r.rule_type === 'night').sort(byPriority),
      length: list.filter((r) => r.rule_type === 'length').sort((a, b) => (a.min_nights ?? 0) - (b.min_nights ?? 0)),
    }
  }, [rules.data])

  const toggle = useMutation({
    mutationFn: (r: RateRule) => {
      const { id: rid, unit_name: _u, ...rest } = r
      return api.updateRateRule(rid, { ...rest, active: !r.active })
    },
    onSuccess: async (r) => {
      toast.success(r.active ? `เปิดใช้ “${r.name}” แล้ว` : `ปิด “${r.name}” แล้ว`)
      await invalidate('rate-rules', 'unit-prices')
    },
  })
  const remove = useMutation({
    mutationFn: (r: RateRule) => api.deleteRateRule(r.id),
    onSuccess: async () => {
      toast.success('ลบกฎราคาแล้ว')
      await invalidate('rate-rules', 'unit-prices')
    },
  })

  const editable = canManage && !readOnly

  if (featuresLoaded && !features.short_stay)
    return (
      <UpsellCard
        title="ราคาตามฤดูกาลใช้ได้กับแพ็กเกจที่มีห้องพักรายวัน"
        description="ตั้งราคาสุดสัปดาห์ เทศกาล และส่วนลดพักหลายคืนอัตโนมัติ"
      />
    )

  if (properties.isLoading) return <Skeleton className="h-96 rounded-lg" />
  if (!property)
    return (
      <Card>
        <EmptyState
          icon={Tags}
          title="ไม่พบโครงการ"
          action={
            <Button asChild variant="outline">
              <Link to="/properties">กลับไปหน้าโครงการ</Link>
            </Button>
          }
        />
      </Card>
    )

  const unitList = units.data ?? []
  const ruleRow = (r: RateRule) => {
    const expired = isExpired(r)
    return (
      <li key={r.id} className={cn('flex items-start gap-3 px-4 py-3', (!r.active || expired) && 'bg-muted/30')}>
        <Switch
          className="mt-0.5"
          checked={r.active}
          disabled={!editable || toggle.isPending}
          onCheckedChange={() => toggle.mutate(r)}
          aria-label={`เปิดใช้ ${r.name}`}
        />
        <div className={cn('min-w-0 flex-1', !r.active && 'opacity-60')}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted-foreground">{r.unit_id ? `ห้อง ${r.unit_name ?? r.unit_id}` : 'ทุกห้อง'}</span>
            {expired && <ToneBadge tone="grey">หมดช่วงแล้ว</ToneBadge>}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground tabular-nums">{describeRule(r)}</div>
        </div>
        {r.rule_type === 'night' && (
          <span
            className="mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums"
            title="ลำดับความสำคัญ — มากกว่าคำนวณทีหลัง"
          >
            ลำดับ {r.priority}
          </span>
        )}
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`ตัวเลือก ${r.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDraft(r)}>
                <Pencil /> แก้ไข
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  if (
                    await confirm({
                      title: `ลบกฎ “${r.name}”?`,
                      description: 'ราคาของการจองใหม่จะไม่ใช้กฎนี้อีก (การจองเดิมไม่เปลี่ยน)',
                      confirmText: 'ลบกฎ',
                      destructive: true,
                    })
                  )
                    remove.mutate(r)
                }}
              >
                <Trash2 /> ลบ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="กลับไปหน้าโครงการ">
          <Link to="/properties">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{property.name}</h2>
          <p className="text-xs text-muted-foreground">{KINDS[property.kind]} · ราคาต่อคืนอัตโนมัติสำหรับการจองรายวัน</p>
        </div>
        {editable && (
          <Button className="ml-auto" onClick={() => setDraft({ rule_type: 'night' })}>
            <Plus /> เพิ่มกฎราคา
          </Button>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="size-3.5" /> เพิ่มด่วน
          </span>
          {presets().map((p) => (
            <Button key={p.key} variant="outline" size="sm" className="bg-card" onClick={() => setDraft({ ...p.rule })}>
              {p.label}
            </Button>
          ))}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div className="space-y-6">
          <RuleGroup
            icon={CalendarRange}
            title="ราคาตามช่วงวันที่ / วันในสัปดาห์"
            description="ปรับราคาต่อคืน — กฎที่ลำดับสูงกว่าคำนวณทีหลัง"
            loading={rules.isLoading}
            empty="ยังไม่มีกฎราคา — ลองเพิ่ม “สุดสัปดาห์ +20%”"
          >
            {groups.night.map(ruleRow)}
          </RuleGroup>
          <RuleGroup
            icon={Layers}
            title="ส่วนลดพักหลายคืน"
            description="ใช้ส่วนลดสูงสุดที่เข้าเงื่อนไขกับยอดรวมทั้งการจอง"
            loading={rules.isLoading}
            empty="ยังไม่มีส่วนลดพักหลายคืน"
          >
            {groups.length.map(ruleRow)}
          </RuleGroup>
        </div>
        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>ตัวอย่างราคา</CardTitle>
            <CardDescription>ราคาต่อคืนหลังใช้กฎ (ไม่รวมส่วนลดพักหลายคืน)</CardDescription>
          </CardHeader>
          <CardContent>
            {units.isLoading ? <Skeleton className="h-72" /> : <PricePreview units={unitList} />}
          </CardContent>
        </Card>
      </div>

      <RuleDialog draft={draft} propertyId={propertyId} units={unitList} onClose={() => setDraft(null)} />
    </div>
  )
}

function RuleGroup({
  icon: Icon,
  title,
  description,
  loading,
  empty,
  children,
}: {
  icon: typeof Tags
  title: string
  description: string
  loading: boolean
  empty: string
  children: React.ReactNode[]
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-start gap-3 border-b px-4 py-3.5">
        <Icon className="mt-0.5 size-4 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {!loading && <span className="ml-auto text-sm text-muted-foreground tabular-nums">{children.length}</span>}
      </div>
      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : children.length ? (
        <ul className="divide-y">{children}</ul>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  )
}
