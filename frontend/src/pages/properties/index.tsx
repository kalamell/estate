import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Building,
  DoorOpen,
  Droplets,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  Tags,
  BedDouble,
  Trash2,
  Zap,
} from 'lucide-react'
import { api, type Property } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { KINDS } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LS, writeLS } from '@/lib/storage'
import { useSession } from '@/contexts/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { LeafletMap } from '@/components/leaflet-map'
import { PropertyDialog } from './property-dialog'

export default function PropertiesPage() {
  const { canManage, readOnly, features } = useSession()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { data: properties, isLoading } = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const [editing, setEditing] = useState<Property | null>(null)
  const [open, setOpen] = useState(false)

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteProperty(id),
    onSuccess: async () => {
      toast.success('ลบแล้ว')
      await invalidate('properties', 'units', 'dashboard', 'org-info')
    },
  })

  const edit = (p: Property | null) => {
    setEditing(p)
    setOpen(true)
  }
  const askDelete = async (p: Property) => {
    if (
      await confirm({
        title: `ลบ “${p.name}”?`,
        description: 'ห้องทั้งหมดในโครงการจะถูกลบด้วย และไม่สามารถกู้คืนได้',
        confirmText: 'ลบโครงการ',
        destructive: true,
      })
    )
      remove.mutate(p.id)
  }
  const viewUnits = (p: Property) => {
    writeLS(LS.unitsProperty, String(p.id))
    navigate(`/units?property=${p.id}`)
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden py-0">
        <LeafletMap properties={properties ?? []} className="h-[340px] sm:h-[420px]" scrollWheelZoom />
      </Card>

      <div className="flex items-center gap-3">
        <h2 className="font-semibold">
          โครงการทั้งหมด{' '}
          <span className="text-muted-foreground">({properties?.length ?? 0})</span>
        </h2>
        {canManage && (
          <Button className="ml-auto" onClick={() => edit(null)} disabled={readOnly}>
            <Plus /> เพิ่มโครงการ
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : !properties?.length ? (
        <Card>
          <EmptyState
            icon={Building}
            title="ยังไม่มีโครงการ"
            description={canManage ? 'เพิ่มหอพัก อพาร์ทเมนต์ หรือบ้านเช่าแห่งแรกของคุณ' : 'ติดต่อผู้ดูแลเพื่อเพิ่มโครงการ'}
            action={
              canManage && (
                <Button onClick={() => edit(null)} disabled={readOnly}>
                  <Plus /> เพิ่มโครงการ
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => {
            const short = p.kind === 'short_stay'
            return (
              <Card key={p.id} className="group gap-0 p-5 transition-colors hover:border-foreground/20">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-md border',
                      short ? 'bg-warning/10 text-warning-foreground' : 'bg-primary/10 text-primary',
                    )}
                  >
                    {short ? <BedDouble className="size-5" /> : <Building className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{KINDS[p.kind]}</div>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="ตัวเลือก" disabled={readOnly}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => edit(p)}>
                          <Pencil /> แก้ไข
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => void askDelete(p)}>
                          <Trash2 /> ลบ
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <p className="mt-3 line-clamp-2 flex min-h-10 gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  {p.address || '—'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="font-normal">
                    <Zap className="text-warning" /> {p.electric_rate} ฿/หน่วย
                  </Badge>
                  <Badge variant="secondary" className="font-normal">
                    <Droplets className="text-info" /> {p.water_rate} ฿/หน่วย
                  </Badge>
                  {p.promptpay_id && (
                    <Badge variant="secondary" className="font-normal">
                      <QrCode /> PromptPay
                    </Badge>
                  )}
                </div>
                <div className={cn('mt-4 grid gap-2', features.short_stay && 'grid-cols-2')}>
                  <Button variant="secondary" onClick={() => viewUnits(p)}>
                    <DoorOpen /> ดูห้อง
                  </Button>
                  {features.short_stay && (
                    <Button variant="outline" onClick={() => navigate(`/properties/${p.id}/pricing`)}>
                      <Tags /> ราคาตามฤดูกาล
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <PropertyDialog
        open={open}
        onOpenChange={setOpen}
        property={editing}
        others={(properties ?? []).filter((p) => p.id !== editing?.id)}
      />
    </div>
  )
}
