import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Camera,
  Droplets,
  Gauge,
  ImageUp,
  Loader2,
  RefreshCw,
  Save,
  ScanLine,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { api, type MeterType } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { num, thDate, today } from '@/lib/format'
import { LS, readLS, writeLS } from '@/lib/storage'
import { readMeter } from '@/lib/ocr'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, Field, UpsellHint } from '@/components/common'
import { useConfirm } from '@/components/confirm'

export default function MetersPage() {
  const { features, readOnly } = useSession()
  const confirm = useConfirm()
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  const allUnits = useQuery({ queryKey: ['units', 'all'], queryFn: () => api.units() })

  const [propertyId, setPropertyId] = useState<string>(() => readLS(LS.meterProperty) ?? '')
  const effectiveProperty =
    properties.data?.find((p) => String(p.id) === propertyId)?.id ?? properties.data?.[0]?.id
  const [unitId, setUnitId] = useState<string>('')
  const [meterType, setMeterType] = useState<MeterType>('electric')
  const [date, setDate] = useState(today())
  const [value, setValue] = useState('')
  const [ocrRaw, setOcrRaw] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [allowDecrease, setAllowDecrease] = useState(false)
  const [autoNext, setAutoNext] = useState(true)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLInputElement>(null)

  const units = useMemo(
    () => (allUnits.data ?? []).filter((u) => u.property_id === effectiveProperty),
    [allUnits.data, effectiveProperty],
  )
  const unitName = useMemo(() => {
    const m = new Map<number, string>()
    for (const u of allUnits.data ?? []) m.set(u.id, u.name)
    return m
  }, [allUnits.data])

  const meterFilter = unitId ? { unit_id: Number(unitId) } : {}
  const meters = useQuery({
    queryKey: ['meters', meterFilter],
    queryFn: () => api.meters(meterFilter),
  })
  const lastMeter = unitId
    ? meters.data?.find((m) => String(m.unit_id) === unitId && m.meter_type === meterType)
    : undefined
  const usage = value !== '' && lastMeter ? Number(value) - lastMeter.value : null

  // ล้าง object URL เมื่อเปลี่ยนรูป
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const runOcr = async (src: string) => {
    if (!features.ocr) return
    setOcrBusy(true)
    setOcrProgress(0)
    try {
      const r = await readMeter(src, setOcrProgress)
      setOcrRaw(r.raw)
      if (r.value) {
        setValue(r.value)
        toast.success(`อ่านค่าได้ ${r.value} — โปรดตรวจสอบก่อนบันทึก`)
      } else {
        toast.error('อ่านตัวเลขไม่ได้ กรุณาพิมพ์ค่าเอง')
        valueRef.current?.focus()
      }
    } catch (e) {
      toast.error('OCR ล้มเหลว: ' + (e as Error).message)
    } finally {
      setOcrBusy(false)
    }
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    setPhoto(file)
    setPreview(url)
    void runOcr(url)
  }

  const clearPhoto = () => {
    setPhoto(null)
    setPreview(null)
    setOcrRaw('')
  }

  const save = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('unit_id', unitId)
      fd.append('meter_type', meterType)
      fd.append('reading_date', date)
      fd.append('value', value)
      if (ocrRaw) fd.append('ocr_raw', ocrRaw)
      if (allowDecrease) fd.append('allow_decrease', '1')
      if (photo) fd.append('photo', photo)
      return api.createMeter(fd)
    },
    onSuccess: async () => {
      toast.success('บันทึกค่ามิเตอร์แล้ว')
      setValue('')
      setOcrRaw('')
      setPhoto(null)
      setPreview(null)
      setAllowDecrease(false)
      if (autoNext) {
        const i = units.findIndex((u) => String(u.id) === unitId)
        const next = units[i + 1]
        if (next) setUnitId(String(next.id))
      }
      await invalidate('meters')
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteMeter(id),
    onSuccess: async () => {
      toast.success('ลบแล้ว')
      await invalidate('meters')
    },
  })

  const canSave = !!unitId && value !== '' && !readOnly && !save.isPending

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="h-fit gap-4 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="size-5 text-primary" /> บันทึกค่ามิเตอร์
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="โครงการ" htmlFor="m-prop" className="col-span-2">
              <Select
                value={effectiveProperty ? String(effectiveProperty) : ''}
                onValueChange={(v) => {
                  setPropertyId(v)
                  writeLS(LS.meterProperty, v)
                  setUnitId('')
                }}
              >
                <SelectTrigger id="m-prop" className="w-full">
                  <SelectValue placeholder="เลือกโครงการ" />
                </SelectTrigger>
                <SelectContent>
                  {properties.data?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ห้อง" htmlFor="m-unit">
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger id="m-unit" className="w-full">
                  <SelectValue placeholder="เลือกห้อง" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {units.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="วันที่จด" htmlFor="m-date">
              <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <Tabs value={meterType} onValueChange={(v) => setMeterType(v as MeterType)}>
            <TabsList className="grid h-11 w-full grid-cols-2">
              <TabsTrigger value="electric">
                <Zap className="text-amber-500" /> ไฟฟ้า
              </TabsTrigger>
              <TabsTrigger value="water">
                <Droplets className="text-sky-500" /> น้ำประปา
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPhoto}
          />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
          <div className="relative">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/40 transition-colors outline-none hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="ถ่ายรูปหน้าปัดมิเตอร์"
            >
              {preview ? (
                <img src={preview} alt="รูปมิเตอร์" className="absolute inset-0 size-full bg-slate-950/5 object-contain" />
              ) : (
                <div className="text-center text-muted-foreground">
                  <div className="mx-auto mb-2 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Camera className="size-7" />
                  </div>
                  <div className="text-sm font-medium text-foreground">ถ่ายรูปหน้าปัดมิเตอร์</div>
                  <div className="text-xs">
                    {features.ocr ? 'ระบบจะอ่านตัวเลขให้อัตโนมัติ' : 'แนบรูปเป็นหลักฐาน'}
                  </div>
                </div>
              )}
              {ocrBusy && (
                <div className="absolute inset-0 grid place-items-center bg-slate-950/65 text-sm text-white backdrop-blur-[1px]">
                  <div className="w-48 text-center">
                    <ScanLine className="mx-auto mb-2 size-8 animate-pulse" />
                    กำลังอ่านตัวเลข {ocrProgress}%
                    <Progress value={ocrProgress} className="mt-2 h-1.5 bg-white/20 [&>div]:bg-white" />
                  </div>
                </div>
              )}
            </button>
            {preview && !ocrBusy && (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="absolute top-2 right-2 rounded-full shadow"
                onClick={clearPhoto}
                aria-label="ลบรูป"
              >
                <X />
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="-mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ImageUp className="size-3.5" /> เลือกรูปจากเครื่อง
          </button>
          {!features.ocr && <UpsellHint>อ่านตัวเลขอัตโนมัติ (OCR) ไม่รวมในแพ็กเกจปัจจุบัน — กรอกค่าเองได้ตามปกติ</UpsellHint>}

          <div className="space-y-1.5">
            <Label htmlFor="m-value" className="text-xs font-medium text-muted-foreground">
              ค่าที่อ่านได้ (หน่วย)
            </Label>
            <div className="flex gap-2">
              <Input
                ref={valueRef}
                id="m-value"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0000"
                className="h-14 text-2xl font-semibold tracking-wider tabular-nums md:text-2xl"
              />
              {preview && features.ocr && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-14"
                  disabled={ocrBusy}
                  onClick={() => void runOcr(preview)}
                >
                  <RefreshCw className={cn(ocrBusy && 'animate-spin')} /> อ่านใหม่
                </Button>
              )}
            </div>
            {lastMeter && (
              <p className="text-xs text-muted-foreground">
                ครั้งก่อน: <b className="text-foreground">{num(lastMeter.value)}</b> ({thDate(lastMeter.reading_date)})
                {usage !== null && (
                  <span className={usage < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}>
                    {' '}
                    → ใช้ไป {usage.toFixed(2)} หน่วย
                  </span>
                )}
              </p>
            )}
            {ocrRaw && <p className="text-xs text-muted-foreground">OCR: {ocrRaw}</p>}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Checkbox id="m-dec" checked={allowDecrease} onCheckedChange={(v) => setAllowDecrease(v === true)} />
              <Label htmlFor="m-dec" className="text-xs font-normal text-muted-foreground">
                เปลี่ยนมิเตอร์ใหม่ / มิเตอร์วนรอบ
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="m-next" checked={autoNext} onCheckedChange={(v) => setAutoNext(v === true)} />
              <Label htmlFor="m-next" className="text-xs font-normal text-muted-foreground">
                ไปห้องถัดไปอัตโนมัติหลังบันทึก
              </Label>
            </div>
          </div>

          <Button size="lg" className="h-12 w-full bg-brand text-base text-white" disabled={!canSave} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            บันทึก
          </Button>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0 lg:col-span-3">
        <div className="flex items-center border-b px-5 py-4">
          <h2 className="font-semibold">ประวัติการจด</h2>
          {unitId && (
            <span className="ml-2 text-sm text-muted-foreground">· ห้อง {unitName.get(Number(unitId))}</span>
          )}
        </div>
        <div className="max-h-[720px] divide-y overflow-y-auto">
          {meters.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : !meters.data?.length ? (
            <EmptyState icon={Gauge} title="ยังไม่มีข้อมูล" description="ค่ามิเตอร์ที่บันทึกจะแสดงที่นี่" />
          ) : (
            meters.data.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                {m.photo_path ? (
                  <a
                    href={m.photo_path}
                    target="_blank"
                    rel="noreferrer"
                    className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted"
                    aria-label="ดูรูปมิเตอร์"
                  >
                    <img src={m.photo_path} alt="" loading="lazy" className="size-full object-cover" />
                  </a>
                ) : (
                  <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-muted">
                    {m.meter_type === 'electric' ? (
                      <Zap className="size-5 text-amber-500" />
                    ) : (
                      <Droplets className="size-5 text-sky-500" />
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-lg font-semibold tabular-nums">{num(m.value)}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.meter_type === 'electric' ? 'ไฟฟ้า' : 'น้ำ'} · ห้อง {unitName.get(m.unit_id) ?? m.unit_id} ·{' '}
                    {thDate(m.reading_date)}
                  </div>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="ml-auto text-destructive hover:text-destructive"
                  aria-label="ลบรายการ"
                  disabled={readOnly}
                  onClick={async () => {
                    if (await confirm({ title: 'ลบรายการนี้?', confirmText: 'ลบ', destructive: true }))
                      remove.mutate(m.id)
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
