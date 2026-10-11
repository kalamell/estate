// สถานะคำขอจองออนไลน์ (สาธารณะ) — /stay/:slug/r/:token
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bookmark,
  CalendarCheck,
  CalendarX2,
  Check,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  ReceiptText,
  Upload,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { ApiError, api, withUploadAccess, type StayRequestStatus } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { baht } from '@/lib/format'
import { useI18n, useLocalLang, type I18n, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CopyField } from '@/components/copy-field'
import { PromptPayQR } from '@/components/promptpay-qr'
import { useForcedColorTheme } from '@/components/theme-provider'
import { LangProvider } from '@/components/lang'
import { StayError, StayFooter, StayHeader, StaySkeleton } from './parts'

const silent = { meta: { silent: true }, retry: false } as const

export default function StayRequestPage() {
  const { slug = '', token = '' } = useParams()
  const [lang, setLang] = useLocalLang()
  const q = useQuery({
    queryKey: ['stay-request', token],
    queryFn: () => api.stay.request(token),
    ...silent,
    refetchOnWindowFocus: true,
    // รอเจ้าหน้าที่ตอบ → ตรวจสถานะใหม่ทุก 30 วินาที
    refetchInterval: (query) => (query.state.data?.request.status === 'pending' ? 30_000 : false),
  })
  // ข้อมูลที่พัก (เวลาเช็คอิน/ที่อยู่) — ไม่จำเป็นต้องมี
  const info = useQuery({ queryKey: ['stay', slug], queryFn: () => api.stay.info(slug), ...silent })
  useForcedColorTheme(q.data ? (q.data.org.theme ?? 'ink') : undefined)

  return (
    <LangProvider lang={lang}>
      {q.isLoading ? (
        <StaySkeleton />
      ) : q.error || !q.data ? (
        <StayError
          error={q.error}
          retry={() => q.refetch()}
          notFoundText={lang === 'en' ? 'Booking request not found' : 'ไม่พบคำขอจองนี้'}
        />
      ) : (
        <Status slug={slug} token={token} d={q.data} info={info.data} lang={lang} setLang={setLang} />
      )}
    </LangProvider>
  )
}

function Status({
  slug,
  token,
  d,
  info,
  lang,
  setLang,
}: {
  slug: string
  token: string
  d: StayRequestStatus
  info?: Awaited<ReturnType<typeof api.stay.info>>
  lang: Lang
  setLang: (l: Lang) => void
}) {
  const i18n = useI18n()
  const { t, dateLong } = i18n
  const r = d.request
  const p = info?.property
  const hero = HERO[r.status]?.(r, i18n) ?? HERO.pending(r, i18n)
  return (
    <div className="min-h-svh bg-background">
      <StayHeader
        org={d.org}
        subtitle={t('สถานะคำขอจอง', 'Booking status')}
        to={`/stay/${slug}`}
        lang={lang}
        onLang={setLang}
      />
      <main className="mx-auto max-w-lg space-y-4 p-4">
        <section className="flex items-start gap-3 pt-2">
          <div className={cn('grid size-11 shrink-0 place-items-center rounded-md', hero.tone)}>
            <hero.icon className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{hero.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{hero.text}</p>
          </div>
        </section>

        <Timeline r={r} />

        <Card className="gap-0 py-0">
          <div className="space-y-1 border-b px-5 py-4">
            <div className="text-xs text-muted-foreground">{t(`คุณ${r.guest_name}`, r.guest_name)}</div>
            <div className="font-semibold">
              {r.property_name} · {t(`ห้อง ${r.unit_name}`, `Room ${r.unit_name}`)}
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x border-b">
            <DateCell label={t('เช็คอิน', 'Check-in')} date={r.check_in} time={p?.check_in_time} from />
            <DateCell label={t('เช็คเอาท์', 'Check-out')} date={r.check_out} time={p?.check_out_time} />
          </div>
          <dl className="space-y-1.5 px-5 py-4 text-sm">
            <Line
              label={`${baht(r.rate)} × ${t(`${r.nights} คืน`, `${r.nights} night${r.nights === 1 ? '' : 's'}`)}`}
              value={baht(r.total)}
            />
            <Line label={t('มัดจำ', 'Deposit')} value={baht(r.deposit_amount)} strong />
            <Line
              label={t('ชำระส่วนที่เหลือเมื่อเช็คอิน', 'Balance due at check-in')}
              value={baht(r.total - r.deposit_amount)}
              muted
            />
          </dl>
        </Card>

        {r.status === 'pending' && <PaySection token={token} d={d} />}

        {r.status === 'approved' && (
          <Card className="gap-3 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarCheck className="size-4 text-success" /> {t('ข้อมูลการเข้าพัก', 'Your stay')}
            </h2>
            <ul className="space-y-2 text-sm">
              <li>
                {t('เช็คอิน', 'Check-in')} <b>{dateLong(r.check_in)}</b>
                {p?.check_in_time && t(` ตั้งแต่ ${p.check_in_time} น.`, ` from ${p.check_in_time}`)}
              </li>
              <li>
                {t('เช็คเอาท์', 'Check-out')} <b>{dateLong(r.check_out)}</b>
                {p?.check_out_time && t(` ก่อน ${p.check_out_time} น.`, ` by ${p.check_out_time}`)}
              </li>
              {p?.address && (
                <li className="flex items-start gap-1.5 text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" /> {p.address}
                </li>
              )}
            </ul>
            <div className="grid gap-2 sm:grid-cols-2">
              {p?.lat != null && p.lng != null && (
                <Button asChild variant="outline" className="h-11">
                  <a href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">
                    <Navigation /> {t('นำทาง', 'Directions')}
                  </a>
                </Button>
              )}
              {d.org.phone && (
                <Button asChild variant="outline" className="h-11">
                  <a href={`tel:${d.org.phone}`}>
                    <Phone /> {t('โทรหาที่พัก', 'Call the property')}
                  </a>
                </Button>
              )}
            </div>
          </Card>
        )}

        {(r.status === 'rejected' || r.status === 'expired') && (
          <Card className="gap-3 px-5 py-4">
            {r.status === 'rejected' && r.reject_reason && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t('เหตุผลจากที่พัก', 'Reason from the property')}: </span>
                {r.reject_reason}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {r.status === 'expired'
                ? t(
                    'คำขอนี้หมดเวลาชำระมัดจำแล้ว หากโอนเงินไปแล้วกรุณาติดต่อที่พัก',
                    'The deposit deadline has passed. If you already transferred money, please contact the property.',
                  )
                : t(
                    'หากชำระมัดจำไปแล้ว ที่พักจะติดต่อกลับเพื่อคืนเงิน',
                    'If you already paid a deposit, the property will contact you about a refund.',
                  )}
            </p>
            <Button asChild className="h-11">
              <Link to={`/stay/${slug}`}>
                <CalendarCheck /> {t('เลือกวันใหม่', 'Choose new dates')}
              </Link>
            </Button>
          </Card>
        )}

        <Card className="gap-3 px-5 py-4">
          <div className="flex items-start gap-2 text-sm">
            <Bookmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              {t(
                'บันทึกลิงก์นี้ไว้ (บุ๊กมาร์กหรือส่งเข้าแชทตัวเอง) เพื่อกลับมาดูสถานะการจอง',
                'Save this link (bookmark it or send it to yourself) to check your booking status later',
              )}
            </span>
          </div>
          <CopyField value={window.location.href} label={t('ลิงก์สถานะการจอง', 'booking status link')} />
        </Card>
      </main>
      <StayFooter />
    </div>
  )
}

type Hero = { icon: LucideIcon; tone: string; title: string; text: string }
const HERO: Record<string, (r: StayRequestStatus['request'], i: I18n) => Hero> = {
  pending: (r, { t, dateTime }) =>
    r.slip_url
      ? {
          icon: Clock,
          tone: 'bg-warning/15 text-warning-foreground',
          title: t('ได้รับสลิปแล้ว รอยืนยัน', 'Slip received — awaiting confirmation'),
          text: t(
            'ที่พักกำลังตรวจสอบการชำระเงิน หน้านี้จะอัปเดตอัตโนมัติ',
            'The property is checking your payment. This page updates automatically.',
          ),
        }
      : {
          icon: Clock,
          tone: 'bg-warning/15 text-warning-foreground',
          title: t('รอชำระมัดจำ', 'Deposit due'),
          text: t(
            `กรุณาชำระมัดจำภายใน ${dateTime(r.expires_at)} เพื่อยืนยันห้อง`,
            `Please pay the deposit by ${dateTime(r.expires_at)} to secure the room`,
          ),
        },
  approved: (_r, { t }) => ({
    icon: CheckCircle2,
    tone: 'bg-success/10 text-success',
    title: t('ยืนยันการจองแล้ว', 'Booking confirmed'),
    text: t('แล้วพบกัน — แสดงหน้านี้ตอนเช็คอินได้เลย', 'See you soon — show this page at check-in'),
  }),
  rejected: (_r, { t }) => ({
    icon: XCircle,
    tone: 'bg-destructive/10 text-destructive',
    title: t('คำขอจองไม่ได้รับการอนุมัติ', 'Booking request declined'),
    text: t('ขออภัย ที่พักไม่สามารถรับการจองนี้ได้', 'Sorry, the property cannot accept this booking'),
  }),
  expired: (_r, { t }) => ({
    icon: CalendarX2,
    tone: 'bg-muted text-muted-foreground',
    title: t('คำขอหมดอายุ', 'Request expired'),
    text: t(
      'ไม่ได้รับมัดจำภายในเวลาที่กำหนด วันที่เลือกถูกเปิดให้จองใหม่แล้ว',
      'No deposit was received in time, so the dates have been released',
    ),
  }),
}

function Timeline({ r }: { r: StayRequestStatus['request'] }) {
  const { t, dateTime } = useI18n()
  const failed = r.status === 'rejected' || r.status === 'expired'
  const steps: { label: string; sub?: string; state: 'done' | 'current' | 'todo' | 'failed' }[] = [
    { label: t('ส่งคำขอ', 'Requested'), sub: dateTime(r.created_at), state: 'done' },
    {
      label: t('ชำระมัดจำ', 'Deposit'),
      sub: r.slip_url
        ? t('ส่งสลิปแล้ว', 'Slip sent')
        : r.status === 'pending'
          ? t(`ภายใน ${dateTime(r.expires_at)}`, `by ${dateTime(r.expires_at)}`)
          : undefined,
      state: r.slip_url || r.status === 'approved' ? 'done' : r.status === 'pending' ? 'current' : 'failed',
    },
    {
      label: failed
        ? r.status === 'expired'
          ? t('หมดอายุ', 'Expired')
          : t('ไม่อนุมัติ', 'Declined')
        : t('ยืนยันการจอง', 'Confirmed'),
      state: r.status === 'approved' ? 'done' : failed ? 'failed' : r.slip_url ? 'current' : 'todo',
    },
  ]
  return (
    <ol className="grid grid-cols-3 gap-2 rounded-md border bg-card p-3">
      {steps.map((s, i) => (
        <li key={i} className="flex flex-col items-center gap-1.5 text-center">
          <span
            className={cn(
              'grid size-7 place-items-center rounded-full border text-xs font-semibold',
              s.state === 'done' && 'border-success bg-success text-white',
              s.state === 'current' && 'border-warning bg-warning/15 text-warning-foreground',
              s.state === 'todo' && 'text-muted-foreground',
              s.state === 'failed' && 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            {s.state === 'done' ? <Check className="size-4" /> : s.state === 'failed' ? <X className="size-4" /> : i + 1}
          </span>
          <span className={cn('text-xs font-medium', s.state === 'todo' && 'text-muted-foreground')}>{s.label}</span>
          {s.sub && <span className="text-[11px] leading-tight text-muted-foreground">{s.sub}</span>}
        </li>
      ))}
    </ol>
  )
}

function PaySection({ token, d }: { token: string; d: StayRequestStatus }) {
  const { t, dateTime } = useI18n()
  const r = d.request
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('photo', file!)
      return api.stay.uploadSlip(token, fd)
    },
    meta: { silent: true },
    onSuccess: async (res) => {
      const r = res.check?.result
      if (r === 'duplicate')
        toast.warning(
          t('สลิปนี้เคยถูกใช้แล้ว — ที่พักจะตรวจสอบและติดต่อกลับ', 'This slip has been used before — the property will check and contact you'),
        )
      else if (r === 'unreadable')
        toast.success(
          t(
            'ส่งสลิปแล้ว — ระบบอ่าน QR บนสลิปไม่ได้ ที่พักจะตรวจสอบจากรูป',
            'Slip sent — the QR code could not be read, so the property will check the image',
          ),
        )
      else if (r === 'mismatch')
        toast.warning(
          t(
            'ส่งสลิปแล้ว แต่ยอดเงินไม่ตรงกับยอดมัดจำ — ที่พักจะตรวจสอบ',
            'Slip sent, but the amount does not match the deposit — the property will check',
          ),
        )
      else toast.success(t('ส่งสลิปแล้ว — รอที่พักยืนยัน', 'Slip sent — waiting for the property to confirm'))
      setFile(null)
      await queryClient.invalidateQueries({ queryKey: ['stay-request', token] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('อัปโหลดไม่สำเร็จ กรุณาลองใหม่', 'Upload failed — please try again')),
  })

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">
          {t('ชำระมัดจำ', 'Pay deposit')} {baht(r.deposit_amount)}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            `ชำระภายใน ${dateTime(r.expires_at)} มิฉะนั้นคำขอจะหมดอายุ`,
            `Pay by ${dateTime(r.expires_at)} or the request will expire`,
          )}
        </p>
      </div>
      <div className="bg-muted/40 px-5 py-5">
        {d.promptpay_payload ? (
          <>
            <PromptPayQR payload={d.promptpay_payload} amount={baht(r.deposit_amount)} className="w-60" />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t(
                'บันทึกภาพ QR แล้วเปิดในแอปธนาคาร · ยอดเงินถูกกรอกให้อัตโนมัติ',
                'Save the QR image and open it in your banking app · the amount is filled in for you',
              )}
            </p>
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {t(
              `ติดต่อที่พัก${d.org.phone ? ` ${d.org.phone}` : ''} เพื่อรับช่องทางชำระเงิน`,
              `Contact the property${d.org.phone ? ` (${d.org.phone})` : ''} for payment details`,
            )}
          </p>
        )}
      </div>
      <div className="space-y-3 border-t px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ReceiptText className="size-4 text-muted-foreground" />
          {r.slip_url ? t('สลิปที่ส่งแล้ว', 'Slip sent') : t('แนบสลิปการโอน', 'Attach transfer slip')}
        </div>
        {(preview || r.slip_url) && (
          <img
            src={preview ?? withUploadAccess(r.slip_url!, { r: token })}
            alt={t('สลิปการโอน', 'Transfer slip')}
            className="max-h-72 w-full rounded-md border bg-muted object-contain"
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
        {file ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11" onClick={() => setFile(null)} disabled={upload.isPending}>
              {t('เลือกใหม่', 'Choose again')}
            </Button>
            <Button className="h-11" onClick={() => upload.mutate()} disabled={upload.isPending}>
              {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              {t('ส่งสลิป', 'Send slip')}
            </Button>
          </div>
        ) : (
          <Button
            variant={r.slip_url ? 'outline' : 'default'}
            className="h-11 w-full"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus /> {r.slip_url ? t('ส่งสลิปใหม่', 'Send a new slip') : t('เลือกรูปสลิป', 'Choose slip image')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function DateCell({ label, date, time, from }: { label: string; date: string; time?: string; from?: boolean }) {
  const { t, dayShort } = useI18n()
  return (
    <div className="px-5 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{dayShort(date)}</div>
      {time && (
        <div className="text-xs text-muted-foreground">
          {from ? t(`ตั้งแต่ ${time} น.`, `from ${time}`) : t(`ก่อน ${time} น.`, `by ${time}`)}
        </div>
      )}
    </div>
  )
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', muted && 'text-xs text-muted-foreground')}>
      <dt className={cn(!muted && 'text-muted-foreground')}>{label}</dt>
      <dd className={cn('tabular-nums', strong && 'font-semibold text-primary')}>{value}</dd>
    </div>
  )
}
