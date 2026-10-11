// พอร์ทัลผู้เช่า: อ่านและลงนามสัญญา (/p/:token/contract/:id — ลิงก์จาก LINE)
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowLeft, Ban, CheckCircle2, Loader2, PenLine, Printer, ShieldCheck } from 'lucide-react'
import { ApiError, api, withUploadAccess, type PortalContractView, type PortalHome } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Field, LogoMark } from '@/components/common'
import { LangProvider, LangSwitch } from '@/components/lang'
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad'
import { useForcedColorTheme } from '@/components/theme-provider'
import { ContractBody } from '@/pages/print/contract'
import { TenantContractBadge } from './contracts'
import { portalLang, useSetPortalLang } from './lang'

const silent = { meta: { silent: true }, retry: false } as const

export default function PortalContractPage() {
  const { token = '', id } = useParams()
  const home = useQuery({ queryKey: ['portal', token], queryFn: () => api.portal.home(token), ...silent })
  useForcedColorTheme(home.data ? (home.data.org.theme ?? 'ink') : undefined)
  return (
    <LangProvider lang={portalLang(home.data)}>
      <ContractScreen token={token} id={Number(id)} home={home.data} />
    </LangProvider>
  )
}

function ContractScreen({ token, id, home }: { token: string; id: number; home?: PortalHome }) {
  const i18n = useI18n()
  const { t } = i18n
  const setLang = useSetPortalLang(token)
  const q = useQuery({
    queryKey: ['portal', token, 'contract', id],
    queryFn: () => api.portal.contract(token, id),
    ...silent,
  })
  const c = q.data?.contract
  const notFound = q.error instanceof ApiError && q.error.status >= 400 && q.error.status < 500

  useEffect(() => {
    if (!c) return
    const prev = document.title
    document.title = `${c.title} · ${c.doc_no}`
    return () => {
      document.title = prev
    }
  }, [c])

  return (
    <div className="min-h-svh bg-background pb-10">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <Button asChild variant="ghost" size="icon" className="-ml-2 size-10 shrink-0">
            <Link to={`/p/${token}`} aria-label={t('กลับหน้าหลัก', 'Back to portal')}>
              <ArrowLeft />
            </Link>
          </Button>
          {home ? <LogoMark /> : null}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-semibold">{home?.org.name ?? t('พอร์ทัลผู้เช่า', 'Tenant portal')}</div>
            <div className="truncate text-xs text-muted-foreground">{t('สัญญาเช่า', 'Lease contract')}</div>
          </div>
          {home && <LangSwitch value={i18n.lang} onChange={(l) => setLang.mutate(l)} />}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4">
        {q.isLoading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-[60svh]" />
          </>
        ) : !q.data || !c ? (
          <Card className="items-center gap-3 px-5 py-10 text-center">
            <h1 className="text-lg font-semibold">
              {notFound ? t('ไม่พบสัญญานี้', 'Contract not found') : t('เชื่อมต่อไม่สำเร็จ', 'Could not connect')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {notFound
                ? t('ลิงก์อาจไม่ถูกต้อง หรือสัญญาถูกยกเลิก กรุณาติดต่อผู้ดูแล', 'The link may be wrong — please contact the manager')
                : t('ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง', 'Check your internet connection and try again')}
            </p>
            {!notFound && (
              <Button className="h-11" onClick={() => q.refetch()}>
                {t('ลองใหม่', 'Try again')}
              </Button>
            )}
          </Card>
        ) : (
          <ContractView token={token} view={q.data} tenantName={home?.tenant.full_name} />
        )}
      </main>
    </div>
  )
}

function ContractView({ token, view, tenantName }: { token: string; view: PortalContractView; tenantName?: string }) {
  const { t } = useI18n()
  const c = view.contract
  const signRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [readToEnd, setReadToEnd] = useState(() => typeof IntersectionObserver === 'undefined')
  const signing = c.status === 'sent'

  // ต้องเลื่อนอ่านถึงท้ายสัญญาก่อนจึงติ๊กยอมรับได้
  useEffect(() => {
    if (!signing || readToEnd || !endRef.current || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setReadToEnd(true)
    })
    io.observe(endRef.current)
    return () => io.disconnect()
  }, [signing, readToEnd])

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{c.doc_no}</span>
          <TenantContractBadge status={c.status} />
        </div>
        <h1 className="text-xl font-semibold">{c.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t(`ห้อง ${c.unit_name}`, `Room ${c.unit_name}`)} · {c.property_name}
        </p>
      </div>

      {signing && (
        <div className="flex items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-3 text-sm">
          <PenLine className="size-5 shrink-0 text-warning-foreground" />
          <span className="min-w-0 flex-1">
            {t('อ่านสัญญาให้ครบ แล้วลงนามท้ายหน้านี้', 'Read the whole contract, then sign at the bottom')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 bg-card"
            onClick={() => signRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <ArrowDown /> {t('ไปลงนาม', 'Sign')}
          </Button>
        </div>
      )}

      {c.status === 'void' && (
        <Card className="flex-row items-start gap-3 px-4 py-4 text-sm">
          <Ban className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="font-semibold">{t('สัญญานี้ถูกยกเลิกแล้ว', 'This contract has been cancelled')}</div>
            {c.void_reason && (
              <div className="text-muted-foreground">
                {t('เหตุผล', 'Reason')}: {c.void_reason}
              </div>
            )}
          </div>
        </Card>
      )}

      {(c.status === 'tenant_signed' || c.status === 'completed') && <SignedSummary token={token} view={view} />}

      <Card className="gap-0 py-0">
        <div className="px-4 py-5 sm:px-6">
          <ContractBody body={c.body} className="text-[15px] leading-[1.85]" />
        </div>
        <div ref={endRef} className="h-px" aria-hidden />
      </Card>

      {signing && (
        <div ref={signRef} className="scroll-mt-4">
          <SignForm token={token} view={view} readToEnd={readToEnd} tenantName={tenantName} />
        </div>
      )}
    </>
  )
}

function SignForm({
  token,
  view,
  readToEnd,
  tenantName,
}: {
  token: string
  view: PortalContractView
  readToEnd: boolean
  tenantName?: string
}) {
  const { t } = useI18n()
  const c = view.contract
  const [agree, setAgree] = useState(false)
  const [name, setName] = useState('')
  const [signed, setSigned] = useState(false)
  const sig = useRef<SignaturePadHandle>(null)

  const submit = useMutation({
    mutationFn: async () => {
      const blob = await sig.current?.toBlob()
      if (!blob) throw new Error(t('กรุณาลงลายมือชื่อ', 'Please sign in the box'))
      const fd = new FormData()
      fd.set('signature', blob, 'signature.png')
      fd.set('signed_name', name.trim())
      fd.set('agree', 'true')
      fd.set('content_hash', c.content_hash ?? '')
      return api.portal.signContract(token, c.id, fd)
    },
    meta: { silent: true },
    onSuccess: async (r) => {
      queryClient.setQueryData(['portal', token, 'contract', c.id], r)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      toast.success(t('ลงนามสัญญาเรียบร้อย ขอบคุณครับ/ค่ะ', 'Contract signed — thank you'))
      await queryClient.invalidateQueries({ queryKey: ['portal', token], exact: true })
    },
    onError: async (e) => {
      toast.error((e as Error).message || t('ลงนามไม่สำเร็จ กรุณาลองใหม่', 'Could not sign — please try again'))
      // เนื้อหาเปลี่ยน/ลงนามไปแล้ว → โหลดฉบับล่าสุด
      if (e instanceof ApiError && e.status === 409)
        await queryClient.invalidateQueries({ queryKey: ['portal', token, 'contract', c.id] })
    },
  })

  const ready = agree && name.trim().length >= 2 && signed
  return (
    <Card className="gap-0 py-0">
      <form
        className="grid gap-5 px-4 py-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!agree) return toast.error(t('กรุณายืนยันว่าได้อ่านและยอมรับสัญญา', 'Please confirm you have read and accept the contract'))
          if (name.trim().length < 2) return toast.error(t('กรุณาพิมพ์ชื่อ-นามสกุล', 'Please type your full name'))
          if (!signed) return toast.error(t('กรุณาลงลายมือชื่อ', 'Please sign in the box'))
          submit.mutate()
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <PenLine className="size-4 text-muted-foreground" /> {t('ลงนามสัญญา', 'Sign the contract')}
        </h2>

        <label
          className={cn(
            'flex items-start gap-3 rounded-md border p-3 text-sm leading-relaxed',
            !readToEnd && 'opacity-60',
            agree && 'border-primary/40 bg-primary/5',
          )}
        >
          <Checkbox
            checked={agree}
            disabled={!readToEnd}
            onCheckedChange={(v) => setAgree(v === true)}
            className="mt-0.5 size-5"
          />
          <span>
            {t(
              `ข้าพเจ้าได้อ่านและเข้าใจสัญญาเลขที่ ${c.doc_no} โดยตลอดแล้ว และตกลงยอมรับข้อตกลงทุกข้อ`,
              `I have read and understood contract no. ${c.doc_no} in full and agree to all of its terms`,
            )}
            {!readToEnd && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {t('เลื่อนอ่านสัญญาให้ถึงท้ายก่อน', 'Scroll to the end of the contract first')}
              </span>
            )}
          </span>
        </label>

        <Field
          label={t('ชื่อ-นามสกุล (พิมพ์ตามบัตร)', 'Full name (as on your ID / passport)')}
          htmlFor="sg-name"
        >
          <Input
            id="sg-name"
            className="h-12 bg-card text-base"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tenantName || c.tenant_name || ''}
            required
          />
        </Field>

        <SignaturePad ref={sig} onChange={setSigned} label={t('ลายมือชื่อผู้เช่า', 'Your signature')} />

        <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            {t(
              'เมื่อกดลงนาม ระบบจะบันทึกชื่อ ลายมือชื่อ เวลา IP และอุปกรณ์ของคุณเป็นหลักฐานการลงนามอิเล็กทรอนิกส์ มีผลผูกพันเช่นเดียวกับการลงนามบนกระดาษ',
              'When you sign, your name, signature, time, IP address and device are recorded as evidence of your electronic signature, which is as binding as signing on paper.',
            )}
            {c.content_hash && (
              <span className="mt-1 block font-mono text-[11px]">
                {t('รหัสเอกสาร', 'Document hash')} {c.content_hash.slice(0, 16)}…
              </span>
            )}
          </span>
        </p>

        <Button type="submit" className="h-12 w-full text-base" disabled={!ready || submit.isPending}>
          {submit.isPending ? <Loader2 className="animate-spin" /> : <PenLine />}
          {t('ลงนามสัญญา', 'Sign contract')}
        </Button>
      </form>
    </Card>
  )
}

function SignedSummary({ token, view }: { token: string; view: PortalContractView }) {
  const { t, at } = useI18n()
  const c = view.contract
  const done = c.status === 'completed'
  const img = (u: string | null) => (u ? withUploadAccess(u, { t: token }) : null)
  return (
    <Card className="gap-4 border-success/30 px-4 py-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="size-7 shrink-0 text-success" />
        <div>
          <div className="font-semibold">
            {done ? t('ลงนามครบทั้งสองฝ่ายแล้ว', 'Signed by both parties') : t('คุณลงนามแล้ว', 'You have signed')}
          </div>
          <p className="text-sm text-muted-foreground">
            {done
              ? t('สัญญามีผลสมบูรณ์ เก็บสำเนาไว้ได้จากปุ่มด้านล่าง', 'The contract is complete — save a copy below')
              : t('รอผู้ให้เช่าลงนาม เราจะแจ้งให้ทราบเมื่อเรียบร้อย', 'Waiting for the landlord to sign — we will let you know')}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SigBox
          label={t('ผู้เช่า', 'Tenant')}
          name={c.tenant_signed_name}
          url={img(c.tenant_signature_url)}
          when={c.tenant_signed_at ? at(c.tenant_signed_at) : null}
        />
        <SigBox
          label={t('ผู้ให้เช่า', 'Landlord')}
          name={c.landlord_signed_name || view.org.name}
          url={img(c.landlord_signature_url)}
          when={c.landlord_signed_at ? at(c.landlord_signed_at) : null}
        />
      </div>
      <Button asChild variant="outline" className="h-11 w-full">
        <Link to={`/p/${token}/print/contract/${c.id}`}>
          <Printer /> {t('ดู / พิมพ์สัญญา', 'View / print contract')}
        </Link>
      </Button>
    </Card>
  )
}

function SigBox({ label, name, url, when }: { label: string; name: string | null; url: string | null; when: string | null }) {
  const { t } = useI18n()
  return (
    <div className="grid min-w-0 gap-1 text-center">
      <div className="grid h-20 place-items-center overflow-hidden rounded-md border bg-white">
        {url ? (
          <img src={url} alt={`${label}: ${name ?? ''}`} className="max-h-[72px] max-w-full object-contain" />
        ) : (
          <span className="text-xs text-[#8a877f]">{t('ยังไม่ลงนาม', 'Not signed yet')}</span>
        )}
      </div>
      <div className="truncate text-sm font-medium">{name || '—'}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {when && <div className="text-[11px] text-muted-foreground tabular-nums">{when}</div>}
    </div>
  )
}
