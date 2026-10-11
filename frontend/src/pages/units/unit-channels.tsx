import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, Info, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api, type ChannelFeed, type ChannelSource, type Unit } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { CHANNELS, CHANNEL_SOURCES, channelOf, syncSummary } from '@/lib/channels'
import { timeAgo } from '@/lib/docs'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Field, UpsellHint } from '@/components/common'
import { useConfirm } from '@/components/confirm'
import { CopyField } from '@/components/copy-field'
import { ChannelDot, ChannelStatusBadge } from '@/components/channel-status'

/** แท็บ "ปฏิทิน & ช่องทางขาย" ในหน้าห้อง — iCal export/import */
export function UnitChannels({ unit }: { unit: Unit }) {
  const { features } = useSession()
  if (!features.short_stay)
    return (
      <UpsellHint>
        การซิงก์ปฏิทินกับ Airbnb, Booking.com และ Agoda (iCal) ใช้ได้ในแพ็กเกจที่มีฟีเจอร์ห้องพักรายวัน
      </UpsellHint>
    )
  return <ChannelsBody unit={unit} />
}

function ChannelsBody({ unit }: { unit: Unit }) {
  const { readOnly, canManage } = useSession()
  const confirm = useConfirm()
  const q = useQuery({ queryKey: ['unit-channels', unit.id], queryFn: () => api.unitChannels(unit.id) })

  const regen = useMutation({
    mutationFn: () => api.regenerateExport(unit.id),
    onSuccess: async () => {
      toast.success('สร้างลิงก์ใหม่แล้ว — อย่าลืมอัปเดตลิงก์ในทุกช่องทาง')
      await invalidate('unit-channels')
    },
  })

  if (q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
      </div>
    )
  if (!q.data) return <p className="text-sm text-muted-foreground">โหลดข้อมูลช่องทางไม่สำเร็จ</p>
  const { export_url, feeds } = q.data
  const sep = export_url.includes('?') ? '&' : '?'

  return (
    <div className="space-y-8">
      {/* Export */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">ส่งปฏิทินของเราออกไป (Export)</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            นำลิงก์นี้ไปใส่ในช่องทางขาย เพื่อให้วันที่ถูกจองในระบบนี้ (และช่องทางอื่น) ถูกปิดอัตโนมัติ
          </p>
        </div>
        <CopyField value={export_url} label="ลิงก์ปฏิทิน (iCal)" />

        {feeds.length > 0 && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              แนะนำ: ใช้ลิงก์เฉพาะของแต่ละช่องทาง (ไม่ส่งการจองของช่องทางนั้นกลับไปหาตัวเอง)
            </p>
            {feeds.map((f) => (
              <div key={f.id} className="grid gap-1">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <ChannelDot source={f.source} className="size-2" />
                  ลิงก์สำหรับใส่กลับใน {f.name || channelOf(f.source).label}
                </span>
                <CopyField
                  value={`${export_url}${sep}exclude=${f.id}`}
                  label={`ลิงก์สำหรับ ${f.name || channelOf(f.source).label}`}
                  inputClassName="h-8"
                />
              </div>
            ))}
          </div>
        )}

        <div className="divide-y rounded-md border">
          {(['airbnb', 'booking', 'agoda'] as ChannelSource[]).map((s) => (
            <details key={s} className="group px-3 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-2.5 text-sm">
                <ChannelDot source={s} className="size-2" />
                วิธีใส่ลิงก์ใน {s === 'booking' ? 'Booking.com (Extranet)' : s === 'agoda' ? 'Agoda (YCS)' : 'Airbnb'}
                <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-3 pl-4 text-xs leading-relaxed text-muted-foreground">{CHANNELS[s].exportSteps}</p>
            </details>
          ))}
        </div>

        {canManage && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">หากลิงก์รั่วไหล สร้างใหม่ได้ ลิงก์เดิมจะใช้ไม่ได้ทันที</p>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto shrink-0"
              disabled={readOnly || regen.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: 'สร้างลิงก์ปฏิทินใหม่?',
                    description:
                      'ลิงก์เดิมที่ใส่ไว้ใน Airbnb / Booking.com / Agoda จะหยุดทำงาน ต้องนำลิงก์ใหม่ไปใส่ทุกช่องทาง มิฉะนั้นอาจเกิดการจองซ้อน',
                    confirmText: 'สร้างลิงก์ใหม่',
                    destructive: true,
                  })
                )
                  regen.mutate()
              }}
            >
              {regen.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              สร้างลิงก์ใหม่
            </Button>
          </div>
        )}
      </section>

      {/* Import */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-semibold">ดึงปฏิทินจากช่องทางอื่น (Import)</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            วันที่ถูกจองในช่องทางเหล่านี้จะถูกปิดในระบบ ป้องกันการจองซ้อน
          </p>
        </div>
        {feeds.length ? (
          <ul className="divide-y rounded-md border">
            {feeds.map((f) => (
              <FeedRow key={f.id} feed={f} />
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            ยังไม่ได้เชื่อมปฏิทินจากช่องทางอื่น
          </p>
        )}
        {!readOnly && <AddFeedForm unitId={unit.id} />}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        iCal ซิงก์เฉพาะวันที่ไม่ว่าง (ไม่มีชื่อแขก/ราคา) ระบบดึงอัตโนมัติทุก 30 นาที
      </p>
    </div>
  )
}

function FeedRow({ feed: f }: { feed: ChannelFeed }) {
  const { readOnly, canManage } = useSession()
  const confirm = useConfirm()
  const ch = channelOf(f.source)
  const sync = useMutation({
    mutationFn: () => api.syncChannel(f.id),
    onSuccess: async (r) => {
      if (r.conflicts.length)
        toast.warning(`ซิงก์แล้ว — ${syncSummary(r)}`, { description: r.conflicts.join('\n') })
      else toast.success(`ซิงก์แล้ว — ${syncSummary(r)}`)
      await invalidate('unit-channels', 'channels', 'calendar')
    },
    onError: () => invalidate('unit-channels'),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteChannel(f.id),
    onSuccess: async () => {
      toast.success('ลบปฏิทินแล้ว')
      await invalidate('unit-channels', 'channels', 'calendar')
    },
  })
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <ChannelDot source={f.source} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{f.name || ch.label}</span>
          <ChannelStatusBadge feed={f} />
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground" title={f.url}>
          {f.url}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {f.last_synced_at ? `ซิงก์ล่าสุด ${timeAgo(f.last_synced_at)}` : 'ยังไม่เคยซิงก์'} · {f.events_count} ช่วงที่ไม่ว่าง
        </div>
        {f.last_status === 'error' && f.last_error && (
          <div className="mt-1 text-xs break-words text-destructive">{f.last_error}</div>
        )}
      </div>
      <div className="flex shrink-0">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="ซิงก์ตอนนี้"
          disabled={readOnly || sync.isPending}
          onClick={() => sync.mutate()}
        >
          <RefreshCw className={sync.isPending ? 'animate-spin' : undefined} />
        </Button>
        {canManage && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            aria-label="ลบปฏิทิน"
            disabled={readOnly || remove.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: `ลบปฏิทิน ${f.name || ch.label}?`,
                  description: `วันที่ถูกปิดจาก ${ch.label} จะถูกลบออกจากปฏิทินของห้องนี้`,
                  confirmText: 'ลบ',
                  destructive: true,
                })
              )
                remove.mutate()
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  )
}

function AddFeedForm({ unitId }: { unitId: number }) {
  const [source, setSource] = useState<ChannelSource>('airbnb')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: () => api.addChannel(unitId, { source, name: name.trim() || undefined, url: url.trim() }),
    onSuccess: async (f) => {
      toast.success(`เพิ่มปฏิทิน ${f.name || channelOf(f.source).label} แล้ว — กำลังซิงก์ครั้งแรก`)
      setName('')
      setUrl('')
      await invalidate('unit-channels', 'channels')
      // ซิงก์ครั้งแรกทันที (ไม่ต้องรอรอบ 30 นาที)
      api
        .syncChannel(f.id)
        .then(() => invalidate('unit-channels', 'channels', 'calendar'))
        .catch(() => invalidate('unit-channels'))
    },
  })
  return (
    <form
      className="grid gap-3 rounded-md border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        const u = url.trim()
        if (!/^https?:\/\//i.test(u)) return setError('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')
        setError(null)
        add.mutate()
      }}
    >
      <div className="text-sm font-medium">เพิ่มปฏิทินจากช่องทางอื่น</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ช่องทาง" htmlFor="ch-source">
          <Select value={source} onValueChange={(v) => setSource(v as ChannelSource)}>
            <SelectTrigger id="ch-source" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  <ChannelDot source={s} className="size-2" />
                  {CHANNELS[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ชื่อ (ไม่บังคับ)" htmlFor="ch-name">
          <Input
            id="ch-name"
            className="bg-card"
            value={name}
            placeholder={`เช่น ${CHANNELS[source].label} ห้องวิวสวน`}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label="ลิงก์ iCal (.ics)"
          htmlFor="ch-url"
          className="sm:col-span-2"
          hint={<>หาลิงก์ได้ที่ {CHANNELS[source].label}: {CHANNELS[source].importHelp}</>}
        >
          <Input
            id="ch-url"
            className="bg-card font-mono text-xs"
            inputMode="url"
            value={url}
            placeholder="https://www.airbnb.com/calendar/ical/….ics"
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            aria-invalid={!!error}
            required
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </Field>
      </div>
      <Button type="submit" size="sm" className="justify-self-end" disabled={add.isPending || !url.trim()}>
        {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
        เพิ่มปฏิทิน
      </Button>
    </form>
  )
}
