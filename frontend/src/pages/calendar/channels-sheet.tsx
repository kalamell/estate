import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Cable, Loader2, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import { api, type ChannelFeed } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { channelOf, syncSummary } from '@/lib/channels'
import { timeAgo } from '@/lib/docs'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common'
import { ChannelDot, ChannelStatusBadge } from '@/components/channel-status'
import { useConfirm } from '@/components/confirm'
import { unitChannelsHref } from './lib'

export function ChannelsSheet({
  open,
  onOpenChange,
  propertyId,
  unitProperty,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  propertyId: number | null
  /** unit_id → property_id (สำหรับลิงก์ไปหน้าห้อง) */
  unitProperty: Map<number, number>
}) {
  const { readOnly, canManage } = useSession()
  const confirm = useConfirm()
  const feeds = useQuery({
    queryKey: ['channels', propertyId],
    queryFn: () => api.channels(propertyId),
    enabled: open,
  })
  const [busy, setBusy] = useState<Set<number>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const syncOne = async (f: ChannelFeed) => {
    setBusy((s) => new Set(s).add(f.id))
    try {
      return await api.syncChannel(f.id)
    } finally {
      setBusy((s) => {
        const n = new Set(s)
        n.delete(f.id)
        return n
      })
    }
  }

  const syncSingle = useMutation({
    mutationFn: syncOne,
    onSuccess: async (r, f) => {
      if (r.conflicts.length)
        toast.warning(`${f.name || channelOf(f.source).label}: ${syncSummary(r)}`, {
          description: r.conflicts.join('\n'),
        })
      else toast.success(`ซิงก์แล้ว — ${syncSummary(r)}`)
      await invalidate('channels', 'calendar', 'unit-channels')
    },
    onError: () => invalidate('channels'),
  })

  const syncAll = async () => {
    const list = feeds.data ?? []
    if (!list.length) return
    setProgress({ done: 0, total: list.length })
    let imported = 0
    let removed = 0
    let failed = 0
    const conflicts: string[] = []
    for (let i = 0; i < list.length; i++) {
      try {
        const r = await syncOne(list[i])
        imported += r.imported
        removed += r.removed
        conflicts.push(...r.conflicts)
      } catch {
        failed++
      }
      setProgress({ done: i + 1, total: list.length })
    }
    setProgress(null)
    await invalidate('channels', 'calendar', 'unit-channels')
    const summary = syncSummary({ imported, removed, conflicts })
    if (failed) toast.error(`ซิงก์ไม่สำเร็จ ${failed} จาก ${list.length} ปฏิทิน`, { description: summary })
    else if (conflicts.length) toast.warning(`ซิงก์ครบ ${list.length} ปฏิทิน — ${summary}`, { description: conflicts.join('\n') })
    else toast.success(`ซิงก์ครบ ${list.length} ปฏิทิน — ${summary}`)
  }

  const remove = useMutation({
    mutationFn: (f: ChannelFeed) => api.deleteChannel(f.id),
    onSuccess: async () => {
      toast.success('ลบปฏิทินแล้ว — วันที่ถูกปิดจากช่องทางนี้จะถูกลบออก')
      await invalidate('channels', 'calendar', 'unit-channels')
    },
  })

  const list = feeds.data ?? []
  const syncing = progress != null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4 pr-12">
          <SheetTitle>ช่องทางขาย (iCal)</SheetTitle>
          <SheetDescription>
            ปฏิทินที่ดึงจาก Airbnb, Booking.com, Agoda และอื่นๆ ระบบดึงอัตโนมัติทุก 30 นาที
          </SheetDescription>
        </SheetHeader>
        <div className="flex items-center gap-3 border-b px-6 py-3">
          <span className="text-sm text-muted-foreground">{list.length} ปฏิทิน</span>
          <Button
            size="sm"
            className="ml-auto"
            disabled={readOnly || syncing || !list.length}
            onClick={() => void syncAll()}
          >
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            ซิงก์ทั้งหมด
          </Button>
        </div>
        {progress && (
          <div className="space-y-1.5 border-b px-6 py-3">
            <div className="flex text-xs text-muted-foreground">
              กำลังซิงก์…
              <span className="ml-auto tabular-nums">
                {progress.done}/{progress.total}
              </span>
            </div>
            <Progress value={(progress.done / progress.total) * 100} className="h-1.5" />
          </div>
        )}
        <ScrollArea className="min-h-0 flex-1">
          {feeds.isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : !list.length ? (
            <EmptyState
              icon={Cable}
              title="ยังไม่ได้เชื่อมช่องทางขาย"
              description='เพิ่มลิงก์ iCal ได้ที่ ห้องพัก → แท็บ "ปฏิทิน & ช่องทางขาย"'
              action={
                <Button asChild variant="outline" size="sm">
                  <Link to="/units" onClick={() => onOpenChange(false)}>
                    ไปที่ห้องพัก
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {list.map((f) => {
                const ch = channelOf(f.source)
                const isBusy = busy.has(f.id)
                return (
                  <li key={f.id} className="flex items-start gap-3 px-6 py-3.5">
                    <ChannelDot source={f.source} className="mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-medium">{f.name || ch.label}</span>
                        <ChannelStatusBadge feed={f} />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        ห้อง {f.unit_name} · {f.property_name} · {ch.label}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {f.last_synced_at ? `ซิงก์ ${timeAgo(f.last_synced_at)}` : 'ยังไม่เคยซิงก์'} ·{' '}
                        {f.events_count} ช่วงที่ไม่ว่าง
                      </div>
                      {f.last_status === 'error' && f.last_error && (
                        <div className="mt-1 text-xs break-words text-destructive">{f.last_error}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="ซิงก์"
                        disabled={readOnly || isBusy || syncing}
                        onClick={() => syncSingle.mutate(f)}
                      >
                        <RefreshCw className={isBusy ? 'animate-spin' : undefined} />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label="ตั้งค่าช่องทางของห้อง" asChild>
                        <Link to={unitChannelsHref(unitProperty.get(f.unit_id), f.unit_id)} onClick={() => onOpenChange(false)}>
                          <Settings2 />
                        </Link>
                      </Button>
                      {canManage && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="ลบปฏิทิน"
                          disabled={readOnly || remove.isPending || syncing}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: `ลบปฏิทิน ${f.name || ch.label}?`,
                                description: `ห้อง ${f.unit_name} จะไม่ดึงวันที่ไม่ว่างจาก ${ch.label} อีก`,
                                confirmText: 'ลบ',
                                destructive: true,
                              })
                            )
                              remove.mutate(f)
                          }}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
