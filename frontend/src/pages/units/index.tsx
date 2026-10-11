import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Box, DoorOpen, LayoutGrid, MousePointerClick, Plus } from 'lucide-react'
import { api, type Unit, type UnitStatus } from '@/lib/api'
import { UNIT_STATUS, baht } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/common'
import { HkIndicator } from '@/components/housekeeping-indicator'
import { LS, readLS, writeLS } from '@/lib/storage'
import { AddUnitDialog } from './add-unit-dialog'
import { BuildingView } from './three-canvas'
import { UnitSheet } from './unit-sheet'

export default function UnitsPage() {
  const { features, canManage, readOnly } = useSession()
  const [params, setParams] = useSearchParams()
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })

  const requested = Number(params.get('property') || readLS(LS.unitsProperty) || 0)
  const propertyId =
    properties.data?.find((p) => p.id === requested)?.id ?? properties.data?.[0]?.id ?? null

  const units = useQuery({
    queryKey: ['units', propertyId],
    queryFn: () => api.units(propertyId),
    enabled: propertyId != null,
  })

  const [view, setView] = useState<'grid' | '3d'>(() => (readLS(LS.unitsView) === '3d' ? '3d' : 'grid'))
  const show3d = view === '3d' && features.view3d
  // ?unit=<id>&tab=channels — ลิงก์ตรงจากปฏิทิน/ช่องทางขาย
  const [openId, setOpenIdState] = useState<number | null>(() => Number(params.get('unit')) || null)
  const [openTab, setOpenTab] = useState<string | null>(() => params.get('tab'))
  const setOpenId = (id: number | null) => {
    setOpenIdState(id)
    setOpenTab(null)
    if (id == null && (params.has('unit') || params.has('tab'))) {
      const next = new URLSearchParams(params)
      next.delete('unit')
      next.delete('tab')
      setParams(next, { replace: true })
    }
  }
  const [addOpen, setAddOpen] = useState(false)
  const openUnit = units.data?.find((u) => u.id === openId) ?? null

  useEffect(() => {
    writeLS(LS.unitsView, view)
  }, [view])

  const selectProperty = (id: string) => {
    writeLS(LS.unitsProperty, id)
    setParams({ property: id }, { replace: true })
    setOpenIdState(null)
  }

  const list = useMemo(() => units.data ?? [], [units.data])
  const floors = useMemo(() => {
    const g: Record<number, Unit[]> = {}
    for (const u of list) (g[u.floor] ||= []).push(u)
    return Object.entries(g)
      .map(([f, us]) => [Number(f), us] as const)
      .sort((a, b) => b[0] - a[0])
  }, [list])
  const counts = useMemo(() => {
    const c: Record<UnitStatus, number> = { vacant: 0, reserved: 0, occupied: 0, maintenance: 0 }
    for (const u of list) c[u.status]++
    return c
  }, [list])

  if (properties.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )

  if (!properties.data?.length)
    return (
      <Card>
        <EmptyState
          icon={DoorOpen}
          title="ยังไม่มีโครงการ"
          description="สร้างโครงการก่อน แล้วจึงเพิ่มห้องพัก"
        />
      </Card>
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={propertyId ? String(propertyId) : ''} onValueChange={selectProperty}>
          <SelectTrigger className="w-full bg-card sm:w-64" aria-label="เลือกโครงการ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {properties.data.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(UNIT_STATUS) as UnitStatus[]).map((k) => (
            <span
              key={k}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium',
                UNIT_STATUS[k].badge,
              )}
            >
              {UNIT_STATUS[k].label}
              <span className="tabular-nums">{counts[k]}</span>
            </span>
          ))}
        </div>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          {features.view3d && (
            <Tabs value={view} onValueChange={(v) => setView(v as 'grid' | '3d')}>
              <TabsList>
                <TabsTrigger value="grid" aria-label="มุมมองผัง">
                  <LayoutGrid /> ผัง
                </TabsTrigger>
                <TabsTrigger value="3d" aria-label="มุมมอง 3D อาคาร">
                  <Box /> 3D อาคาร
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {canManage && (
            <Button className="ml-auto sm:ml-0" onClick={() => setAddOpen(true)} disabled={readOnly || !propertyId}>
              <Plus /> เพิ่มห้อง
            </Button>
          )}
        </div>
      </div>

      {units.isLoading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : !list.length ? (
        <Card>
          <EmptyState
            icon={DoorOpen}
            title="ยังไม่มีห้องในโครงการนี้"
            action={
              canManage && (
                <Button onClick={() => setAddOpen(true)} disabled={readOnly}>
                  <Plus /> เพิ่มห้อง
                </Button>
              )
            }
          />
        </Card>
      ) : show3d ? (
        <Card className="relative overflow-hidden py-0">
          <div className="h-[420px] bg-muted sm:h-[520px]">
            <BuildingView units={list} onPick={(u) => setOpenId(u.id)} />
          </div>
          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
            <MousePointerClick className="size-4" />
            ลากเพื่อหมุน · เลื่อนเพื่อซูม · คลิกห้องเพื่อดูรายละเอียด
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {floors.map(([floor, us]) => (
            <Card key={floor} className="gap-3 p-4 sm:p-5">
              <div className="text-sm font-medium text-muted-foreground">ชั้น {floor}</div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {us.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setOpenId(u.id)}
                    className={cn(
                      'rounded-md border border-l-4 bg-card px-2.5 py-2.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring',
                      UNIT_STATUS[u.status].bar,
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <span className="min-w-0 truncate text-base font-semibold tabular-nums">{u.name}</span>
                      <HkIndicator status={u.housekeeping_status} size="xs" className="ml-auto" />
                    </div>
                    <div className={cn('text-[11px] font-medium', UNIT_STATUS[u.status].text)}>
                      {UNIT_STATUS[u.status].label}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                      {u.rent_monthly ? `${baht(u.rent_monthly)}/ด.` : `${baht(u.rate_daily)}/คืน`}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <UnitSheet unit={openUnit} onClose={() => setOpenId(null)} initialTab={openTab} />
      {propertyId && (
        <AddUnitDialog open={addOpen} onOpenChange={setAddOpen} propertyId={propertyId} sample={list[0]} />
      )}
    </div>
  )
}
