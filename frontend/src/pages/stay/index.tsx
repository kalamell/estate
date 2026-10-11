// หน้าจองออนไลน์ (สาธารณะ ไม่ต้องล็อกอิน) — /stay/:slug
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQueries, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarDays,
  ChevronDown,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Moon,
  Ruler,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'
import { ApiError, api, type Property, type PublicQuote, type StayBusy, type StayInfo } from '@/lib/api'
import { addMonths, baht, diffDays, thDayShort, today } from '@/lib/format'
import { readLS, stayRequestKey, writeLS } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, ToneBadge } from '@/components/common'
import { LeafletMap } from '@/components/leaflet-map'
import { RangeCalendar, type DateRange } from '@/components/range-calendar'
import { useForcedColorTheme } from '@/components/theme-provider'
import { StayError, StayFooter, StayHeader, StaySkeleton } from './parts'

const silent = { meta: { silent: true }, retry: false } as const

export default function StayPage() {
  const { slug = '' } = useParams()
  const info = useQuery({ queryKey: ['stay', slug], queryFn: () => api.stay.info(slug), ...silent })
  useForcedColorTheme(info.data ? (info.data.org.theme ?? 'ink') : undefined)

  if (info.isLoading) return <StaySkeleton wide />
  if (info.error || !info.data)
    return <StayError error={info.error} retry={() => info.refetch()} notFoundText="ไม่พบหน้าจองนี้" />
  return <Booking slug={slug} d={info.data} />
}

interface Guest {
  guest_name: string
  phone: string
  email: string
  guests: string
  note: string
}

function Booking({ slug, d }: { slug: string; d: StayInfo }) {
  const navigate = useNavigate()
  const t = today()
  const p = d.property
  const minNights = Math.max(1, p.min_nights || 1)
  const [month, setMonth] = useState(t.slice(0, 7))
  const [range, setRange] = useState<DateRange>({})
  const [unitId, setUnitId] = useState<number | null>(d.units.length === 1 ? d.units[0].id : null)
  const [guest, setGuest] = useState<Guest>({ guest_name: '', phone: '', email: '', guests: '1', note: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const prevToken = readLS(stayRequestKey(slug))

  // ช่วงที่ต้องรู้ความว่าง = เดือนที่แสดง ∪ ช่วงที่เลือก
  const viewFrom = `${month}-01` < t ? t : `${month}-01`
  const viewTo = `${addMonths(month, 2)}-01`
  const from = range.start && range.start < viewFrom ? range.start : viewFrom
  const to = range.end && range.end > viewTo ? range.end : viewTo
  const avail = useQuery({
    queryKey: ['stay', slug, 'availability', from, to],
    queryFn: () => api.stay.availability(slug, from, to),
    placeholderData: keepPreviousData,
    ...silent,
  })
  const busyByUnit = useMemo(() => {
    const m = new Map<number, StayBusy[]>()
    for (const b of avail.data?.busy ?? []) {
      const list = m.get(b.unit_id)
      if (list) list.push(b)
      else m.set(b.unit_id, [b])
    }
    return m
  }, [avail.data])

  const nightBusy = useCallback(
    (id: number, day: string) => (busyByUnit.get(id) ?? []).some((b) => b.start <= day && day < b.end),
    [busyByUnit],
  )
  const rangeFree = (id: number, a: string, b: string) =>
    !(busyByUnit.get(id) ?? []).some((x) => x.start < b && x.end > a)

  const unit = d.units.find((u) => u.id === unitId) ?? null
  const minRate = d.units.length ? Math.min(...d.units.map((u) => u.rate_daily)) : 0
  // เลือกห้องแล้ว → ปิดคืนที่ห้องนั้นไม่ว่าง / ยังไม่เลือก → ปิดคืนที่เต็มทุกห้อง
  const isBusy = useCallback(
    (day: string) => (unitId != null ? nightBusy(unitId, day) : d.units.every((u) => nightBusy(u.id, day))),
    [unitId, nightBusy, d.units],
  )

  // ราคาต่อคืนตามฤดูกาลของเดือนที่แสดง
  const pricesQ = useQuery({
    queryKey: ['stay', slug, 'prices', viewFrom, viewTo],
    queryFn: () => api.stay.prices(slug, viewFrom, viewTo),
    placeholderData: keepPreviousData,
    ...silent,
  })
  const priceMap = useMemo(() => {
    const m = new Map<number, Map<string, number>>()
    for (const [id, list] of Object.entries(pricesQ.data?.units ?? {}))
      m.set(Number(id), new Map(list.map((x) => [x.date, x.price])))
    return m
  }, [pricesQ.data])
  const unitPrice = useCallback(
    (id: number, day: string) => priceMap.get(id)?.get(day) ?? d.units.find((u) => u.id === id)?.rate_daily ?? null,
    [priceMap, d.units],
  )
  // เลือกห้องแล้ว → ราคาของห้องนั้น / ยังไม่เลือก → ราคาต่ำสุดของห้องที่ว่างคืนนั้น
  const priceFor = useCallback(
    (day: string) => {
      if (unit) return unitPrice(unit.id, day)
      const free = d.units.filter((u) => !nightBusy(u.id, day))
      const ps = (free.length ? free : d.units).map((u) => unitPrice(u.id, day)).filter((x): x is number => x != null)
      return ps.length ? Math.min(...ps) : minRate || null
    },
    [unit, unitPrice, d.units, nightBusy, minRate],
  )
  // ราคาเริ่มต้นของแต่ละห้องในช่วงที่แสดง
  const fromPrice = (id: number, fallback: number) => {
    const ps = [...(priceMap.get(id)?.values() ?? [])]
    return ps.length ? Math.min(...ps) : fallback
  }

  const nights = range.start && range.end ? diffDays(range.start, range.end) : 0
  const tooShort = nights > 0 && nights < minNights
  const unitFree = unit && range.start && range.end ? rangeFree(unit.id, range.start, range.end) : true
  const rangeOk = !!range.start && !!range.end && nights > 0 && !tooShort

  // ใบเสนอราคาจากเซิร์ฟเวอร์ (รวมกฎราคา ส่วนลดพักหลายคืน และมัดจำ) — ทุกห้องที่ว่างในช่วงที่เลือก
  const quotable = rangeOk ? d.units.filter((u) => rangeFree(u.id, range.start!, range.end!)) : []
  const quotes = useQueries({
    queries: quotable.map((u) => ({
      queryKey: ['stay', slug, 'quote', u.id, range.start, range.end],
      queryFn: () => api.stay.quote(slug, u.id, range.start!, range.end!),
      staleTime: 60_000,
      ...silent,
    })),
  })
  const quoteOf = (id: number): PublicQuote | undefined => quotes[quotable.findIndex((u) => u.id === id)]?.data
  const quote = unit && unitFree ? quoteOf(unit.id) : undefined
  const quoteLoading = !!unit && unitFree && rangeOk && !quote && quotes.some((q) => q.isLoading)
  const fallbackTotal = unit ? nights * unit.rate_daily : 0
  const total = quote?.total ?? fallbackTotal
  const deposit = quote?.deposit_amount ?? Math.round((fallbackTotal * (p.deposit_percent || 0)) / 100)
  const ready = !!unit && nights > 0 && !tooShort && unitFree

  const submit = useMutation({
    mutationFn: () =>
      api.stay.createRequest(slug, {
        unit_id: unit!.id,
        check_in: range.start!,
        check_out: range.end!,
        guests: Math.max(1, Number(guest.guests) || 1),
        guest_name: guest.guest_name.trim(),
        phone: guest.phone.trim(),
        email: guest.email.trim(),
        note: guest.note.trim(),
        consent: true,
      }),
    meta: { silent: true },
    onSuccess: ({ token }) => {
      writeLS(stayRequestKey(slug), token)
      navigate(`/stay/${slug}/r/${token}`)
    },
    onError: (e) => {
      setFormError(e instanceof ApiError ? e.message : 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่')
      if (e instanceof ApiError && e.status === 409) void avail.refetch()
    },
  })

  const setG = <K extends keyof Guest>(k: K, v: string) => {
    setFormError(null)
    setGuest((g) => ({ ...g, [k]: v }))
  }

  const mapProperty = useMemo<Property[]>(
    () =>
      p.lat != null && p.lng != null
        ? [{ id: 0, name: p.name, kind: 'short_stay', address: p.address, lat: p.lat, lng: p.lng } as Property]
        : [],
    [p.lat, p.lng, p.name, p.address],
  )

  return (
    <div className="min-h-svh bg-background pb-24 lg:pb-0">
      <StayHeader org={d.org} subtitle="จองที่พักออนไลน์" wide />

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-8">
        <div className="min-w-0 space-y-8">
          {prevToken && (
            <Link
              to={`/stay/${slug}/r/${prevToken}`}
              className="flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-sm hover:bg-muted/50"
            >
              <Send className="size-4 text-primary" />
              <span className="flex-1">คุณมีคำขอจองที่ส่งไว้แล้ว — ดูสถานะ</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          )}

          {/* ที่พัก */}
          <section className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold">{p.name}</h1>
              {p.address && (
                <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" /> {p.address}
                </p>
              )}
            </div>
            {p.intro && <p className="text-[15px] leading-relaxed whitespace-pre-line">{p.intro}</p>}
            <div className="flex flex-wrap gap-2 text-sm">
              <InfoChip icon={LogIn}>เช็คอิน {p.check_in_time || '14:00'} น.</InfoChip>
              <InfoChip icon={LogOut}>เช็คเอาท์ {p.check_out_time || '12:00'} น.</InfoChip>
              <InfoChip icon={Moon}>ขั้นต่ำ {minNights} คืน</InfoChip>
              {p.deposit_percent > 0 && <InfoChip icon={Clock}>มัดจำ {p.deposit_percent}%</InfoChip>}
            </div>
            {mapProperty.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <LeafletMap properties={mapProperty} className="h-48 sm:h-56" />
              </div>
            )}
          </section>

          {/* เลือกวัน */}
          <section className="space-y-3">
            <StepTitle n={1}>เลือกวันเข้าพัก</StepTitle>
            <Card className="gap-0 px-3 py-4 sm:px-5">
              <RangeCalendar
                value={range}
                onChange={(r) => {
                  setFormError(null)
                  setRange(r)
                }}
                month={month}
                onMonthChange={setMonth}
                isBusy={isBusy}
                priceFor={priceFor}
              />
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-sm">
                {range.start ? (
                  <>
                    <CalendarDays className="size-4 text-muted-foreground" />
                    <span className="tabular-nums">
                      {thDayShort(range.start)} → {range.end ? thDayShort(range.end) : <span className="text-muted-foreground">เลือกวันเช็คเอาท์</span>}
                    </span>
                    {nights > 0 && <span className="font-medium">{nights} คืน</span>}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-muted-foreground"
                      onClick={() => setRange({})}
                    >
                      <X /> ล้าง
                    </Button>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    แตะวันเช็คอิน แล้วแตะวันเช็คเอาท์
                    {unit ? ` · ราคาต่อคืนของห้อง ${unit.name}` : minRate ? ` · ราคาเริ่มต้น/คืน` : ''}
                  </span>
                )}
              </div>
              {tooShort && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
                  <AlertTriangle className="size-4" /> ขั้นต่ำ {minNights} คืน
                </p>
              )}
            </Card>
          </section>

          {/* เลือกห้อง */}
          <section className="space-y-3">
            <StepTitle n={2}>เลือกห้อง</StepTitle>
            {d.units.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                ยังไม่มีห้องเปิดให้จองออนไลน์
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {d.units.map((u) => {
                  const free = range.start && range.end ? rangeFree(u.id, range.start, range.end) : null
                  const selected = u.id === unitId
                  const area = u.width * u.length
                  const uq = free ? quoteOf(u.id) : undefined
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setFormError(null)
                        setUnitId(selected ? null : u.id)
                      }}
                      aria-pressed={selected}
                      className={cn(
                        'flex items-start gap-3 rounded-md border bg-card p-4 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        selected && 'border-primary ring-1 ring-primary',
                        free === false && 'opacity-60',
                      )}
                    >
                      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                        <BedDouble className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">ห้อง {u.name}</span>
                          {free === true && <ToneBadge tone="green">ว่าง</ToneBadge>}
                          {free === false && <ToneBadge tone="grey">ไม่ว่าง</ToneBadge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>ชั้น {u.floor}</span>
                          {area > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Ruler className="size-3" />
                              {area.toLocaleString('th-TH', { maximumFractionDigits: 1 })} ตร.ม.
                            </span>
                          )}
                        </div>
                        {uq ? (
                          <div className="mt-2 text-sm">
                            <span className="font-semibold tabular-nums">{baht(uq.total)}</span>
                            <span className="text-muted-foreground"> · {uq.nights_count} คืน</span>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              เฉลี่ย {baht(uq.average_rate)}/คืน
                              {uq.discount && <span className="text-success"> · ลด {uq.discount.percent}%</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 text-sm">
                            {priceMap.size > 0 && <span className="text-muted-foreground">เริ่มต้น </span>}
                            <span className="font-semibold tabular-nums">{baht(fromPrice(u.id, u.rate_daily))}</span>
                            <span className="text-muted-foreground"> / คืน</span>
                          </div>
                        )}
                      </div>
                      <span
                        aria-hidden
                        className={cn(
                          'mt-1 grid size-4 shrink-0 place-items-center rounded-full border',
                          selected && 'border-primary bg-primary',
                        )}
                      >
                        {selected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* สรุปราคา + ข้อมูลผู้จอง */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="gap-0 py-0">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">สรุปราคา</h2>
            </div>
            <div className="space-y-2 px-5 py-4 text-sm">
              {unit && nights > 0 ? (
                <>
                  {quote ? (
                    <QuoteLines quote={quote} unitName={unit.name} />
                  ) : (
                    <Row
                      label={`ห้อง ${unit.name}`}
                      value={
                        quoteLoading ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                          `${baht(unit.rate_daily)} × ${nights} คืน`
                        )
                      }
                    />
                  )}
                  <Row label="ยอดรวม" value={baht(total)} strong />
                  <div className="!mt-3 rounded-md bg-primary/5 px-3 py-2.5">
                    <Row
                      label={`มัดจำ${p.deposit_percent ? ` ${p.deposit_percent}%` : ''} (ชำระตอนนี้)`}
                      value={<span className="text-base font-semibold text-primary">{baht(deposit)}</span>}
                    />
                    <Row label="ชำระส่วนที่เหลือเมื่อเช็คอิน" value={baht(total - deposit)} muted />
                  </div>
                  {!unitFree && (
                    <p className="flex items-center gap-1.5 text-destructive">
                      <AlertTriangle className="size-4" /> ห้องนี้ไม่ว่างในช่วงที่เลือก
                    </p>
                  )}
                  {tooShort && (
                    <p className="flex items-center gap-1.5 text-destructive">
                      <AlertTriangle className="size-4" /> ขั้นต่ำ {minNights} คืน
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  {!range.end ? 'เลือกวันเข้าพัก' : 'เลือกห้อง'}เพื่อดูราคา
                </p>
              )}
            </div>
          </Card>

          <Card className="gap-0 py-0">
            <form
              ref={formRef}
              className="grid gap-4 px-5 py-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!range.start || !range.end) return setFormError('กรุณาเลือกวันเช็คอินและเช็คเอาท์')
                if (!unit) return setFormError('กรุณาเลือกห้อง')
                if (tooShort) return setFormError(`ขั้นต่ำ ${minNights} คืน`)
                if (!unitFree) return setFormError('ช่วงวันที่ไม่ว่าง กรุณาเลือกวันหรือห้องอื่น')
                if (guest.phone.replace(/\D/g, '').length < 9) return setFormError('กรุณากรอกเบอร์โทรให้ถูกต้อง')
                if (!consent) return setFormError('กรุณายอมรับการใช้ข้อมูลส่วนบุคคลเพื่อการจอง')
                submit.mutate()
              }}
            >
              <StepTitle n={3}>ข้อมูลผู้จอง</StepTitle>
              <Field label="ชื่อ-นามสกุล" htmlFor="g-name">
                <Input
                  id="g-name"
                  className="h-11"
                  autoComplete="name"
                  value={guest.guest_name}
                  onChange={(e) => setG('guest_name', e.target.value)}
                  required
                />
              </Field>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Field label="เบอร์โทร" htmlFor="g-phone">
                  <Input
                    id="g-phone"
                    className="h-11"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={guest.phone}
                    onChange={(e) => setG('phone', e.target.value)}
                    required
                  />
                </Field>
                <Field label="ผู้เข้าพัก" htmlFor="g-guests">
                  <Input
                    id="g-guests"
                    className="h-11"
                    type="number"
                    min={1}
                    max={20}
                    inputMode="numeric"
                    value={guest.guests}
                    onChange={(e) => setG('guests', e.target.value)}
                  />
                </Field>
              </div>
              <Field label="อีเมล (ไม่บังคับ)" htmlFor="g-email">
                <Input
                  id="g-email"
                  className="h-11"
                  type="email"
                  autoComplete="email"
                  value={guest.email}
                  onChange={(e) => setG('email', e.target.value)}
                />
              </Field>
              <Field label="หมายเหตุ (ไม่บังคับ)" htmlFor="g-note">
                <Textarea
                  id="g-note"
                  rows={2}
                  value={guest.note}
                  placeholder="เช่น เวลาที่คาดว่าจะมาถึง"
                  onChange={(e) => setG('note', e.target.value)}
                />
              </Field>
              <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
                <Checkbox
                  id="g-consent"
                  checked={consent}
                  onCheckedChange={(v) => {
                    setFormError(null)
                    setConsent(v === true)
                  }}
                  className="mt-0.5"
                  aria-required
                />
                <div className="text-sm leading-relaxed">
                  <label htmlFor="g-consent">
                    ข้าพเจ้ายินยอมให้ {d.org.name} เก็บและใช้ข้อมูลส่วนบุคคลข้างต้นตาม
                  </label>{' '}
                  <button
                    type="button"
                    onClick={() => setNoticeOpen(true)}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    ประกาศความเป็นส่วนตัว
                  </button>
                  <p className="mt-0.5 text-xs text-muted-foreground">ข้อมูลของท่านใช้เพื่อการจองและติดต่อเท่านั้น</p>
                </div>
              </div>
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {formError}
                </div>
              )}
              <Button type="submit" className="h-11" disabled={submit.isPending}>
                {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                ส่งคำขอจอง
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                การจองจะสมบูรณ์เมื่อที่พักยืนยันหลังได้รับมัดจำ
              </p>
            </form>
          </Card>
        </aside>
      </main>

      <StayFooter />
      <StayPrivacyDialog
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
        orgName={d.org.name}
        phone={d.org.phone}
        onAccept={() => {
          setFormError(null)
          setConsent(true)
          setNoticeOpen(false)
        }}
      />

      {/* แถบล่างบนมือถือ */}
      {ready && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-xs text-muted-foreground">
                {nights} คืน · มัดจำ {baht(deposit)}
              </div>
              <div className="font-semibold tabular-nums">{baht(total)}</div>
            </div>
            <Button
              className="h-11"
              onClick={() => {
                formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                setTimeout(() => document.getElementById('g-name')?.focus({ preventScroll: true }), 400)
              }}
            >
              กรอกข้อมูลจอง <ArrowRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** ประกาศความเป็นส่วนตัวแบบย่อสำหรับหน้าจอง (API สาธารณะไม่ส่งประกาศขององค์กรมา) */
function StayPrivacyDialog({
  open,
  onOpenChange,
  orgName,
  phone,
  onAccept,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orgName: string
  phone: string
  onAccept: () => void
}) {
  const items: [string, string][] = [
    ['ข้อมูลที่เก็บ', 'ชื่อ-นามสกุล เบอร์โทร อีเมล จำนวนผู้เข้าพัก หมายเหตุ และสลิปการโอนมัดจำ'],
    ['วัตถุประสงค์', 'ยืนยันการจอง ติดต่อเรื่องการเข้าพัก และออกหลักฐานการชำระเงิน'],
    ['การเปิดเผย', 'ไม่ขายหรือเปิดเผยแก่บุคคลภายนอก เว้นแต่กฎหมายกำหนด'],
    ['ระยะเวลาเก็บ', 'เท่าที่จำเป็นต่อการเข้าพัก ส่วนหลักฐานการชำระเงินเก็บตามที่กฎหมายกำหนด'],
    [
      'สิทธิของท่าน',
      `ขอเข้าถึง แก้ไข ลบ หรือถอนความยินยอมได้ โดยติดต่อ ${orgName}${phone ? ` โทร ${phone}` : ''}`,
    ],
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> ประกาศความเป็นส่วนตัว
          </DialogTitle>
          <DialogDescription>
            {orgName} · ข้อมูลของท่านใช้เพื่อการจองและติดต่อเท่านั้น
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y rounded-md border text-sm">
          {items.map(([k, v]) => (
            <div key={k} className="grid gap-0.5 px-3 py-2.5">
              <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          เป็นไปตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 — สอบถามประกาศฉบับเต็มได้ที่ที่พัก
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          <Button type="button" onClick={onAccept}>
            ยอมรับ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 font-semibold">
      <span className="grid size-6 place-items-center rounded-sm bg-primary text-xs text-primary-foreground tabular-nums">
        {n}
      </span>
      {children}
    </h2>
  )
}

function InfoChip({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-[13px]">
      <Icon className="size-3.5 text-muted-foreground" />
      {children}
    </span>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', muted && 'text-muted-foreground')}>
      <span className={cn(!strong && 'text-muted-foreground', muted && 'text-xs')}>{label}</span>
      <span className={cn('tabular-nums', strong && 'font-semibold', muted && 'text-xs')}>{value}</span>
    </div>
  )
}

/** รายละเอียดราคาจากใบเสนอราคา: รายคืน (ย่อ/ขยาย) + ส่วนลดพักหลายคืน */
function QuoteLines({ quote, unitName }: { quote: PublicQuote; unitName: string }) {
  const [open, setOpen] = useState(false)
  const uniform = quote.nights.every((n) => n.price === quote.nights[0]?.price)
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="text-muted-foreground">
          ห้อง {unitName} · {quote.nights_count} คืน
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-primary">
            {open ? 'ซ่อน' : 'ดูรายคืน'}
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
          </span>
        </span>
        <span className="tabular-nums">
          {uniform && quote.nights[0] ? `${baht(quote.nights[0].price)} × ${quote.nights_count}` : baht(quote.subtotal)}
        </span>
      </button>
      {open && (
        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-xs">
          {quote.nights.map((n) => (
            <li key={n.date} className="flex items-baseline gap-2">
              <span className="w-20 shrink-0 tabular-nums">{thDayShort(n.date)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{n.rules.join(' · ')}</span>
              {n.price !== n.base && (
                <span className="text-muted-foreground line-through tabular-nums">{baht(n.base)}</span>
              )}
              <span className={cn('tabular-nums', n.price !== n.base && 'font-medium text-primary')}>{baht(n.price)}</span>
            </li>
          ))}
        </ul>
      )}
      {quote.discount && (
        <div className="flex items-baseline justify-between gap-3 text-success">
          <span>
            ส่วนลด{quote.discount.name ? ` ${quote.discount.name}` : ''} ({quote.discount.percent}%)
          </span>
          <span className="tabular-nums">−{baht(quote.discount.amount)}</span>
        </div>
      )}
    </div>
  )
}
