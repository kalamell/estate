import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, Building, CalendarRange, Check, DoorOpen, Info, Loader2, QrCode, Users, X } from 'lucide-react'
import { api, type BillingCycle, type BillingOverview, type BillingPackage, type Features, type OrgInfo } from '@/lib/api'
import { CYCLE_LABEL, CYCLE_UNIT, overLimits, planCheckout, priceOf, yearlySaving } from '@/lib/billing'
import { FEATURE_LABELS } from '@/lib/features'
import { invalidate } from '@/lib/query'
import { baht, thDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { SumRow } from '@/components/billing'

export function Plans({ b, usage }: { b: BillingOverview; usage: OrgInfo['usage'] | undefined }) {
  const [cycle, setCycle] = useState<BillingCycle>(b.subscription.price > 0 ? b.subscription.cycle : 'monthly')
  const [picked, setPicked] = useState<BillingPackage | null>(null)
  const bestMonths = Math.max(0, ...b.packages.filter((p) => p.price_monthly > 0).map((p) => yearlySaving(p).months))
  const inReview = b.open_invoice?.invoice.status === 'review'

  return (
    <section className="space-y-4" aria-labelledby="plans-title">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="plans-title" className="text-base font-semibold">
          ต่ออายุหรือเปลี่ยนแพ็กเกจ
        </h2>
        <div className="sm:ml-auto">
          <div className="flex gap-1 rounded-md border bg-muted/50 p-1" role="radiogroup" aria-label="รอบการชำระ">
            {(['monthly', 'yearly'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cycle === c}
                onClick={() => setCycle(c)}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs whitespace-nowrap transition-colors',
                  cycle === c
                    ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {CYCLE_LABEL[c]}
                {c === 'yearly' && bestMonths > 0 && (
                  <span className="rounded-sm bg-success/10 px-1 text-[11px] font-medium text-success">
                    ประหยัด ~{bestMonths.toLocaleString('th-TH')} เดือน
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      {inReview && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="size-4 shrink-0" /> มีสลิปรอผู้ให้บริการตรวจสอบอยู่ — สั่งซื้อใหม่ได้หลังได้รับผลการตรวจ
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {b.packages.map((p) => (
          <PlanCard key={p.id} b={b} pkg={p} cycle={cycle} usage={usage} locked={inReview} onPick={() => setPicked(p)} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        ราคารวมภาษีมูลค่าเพิ่มแล้ว · ชำระผ่าน QR พร้อมเพย์หรือโอนเข้าบัญชี แล้วแนบสลิปเพื่อให้ผู้ให้บริการยืนยัน
      </p>
      <CheckoutDialog b={b} pkg={picked} cycle={cycle} onClose={() => setPicked(null)} />
    </section>
  )
}

function PlanCard({
  b,
  pkg,
  cycle,
  usage,
  locked,
  onPick,
}: {
  b: BillingOverview
  pkg: BillingPackage
  cycle: BillingCycle
  usage: OrgInfo['usage'] | undefined
  locked: boolean
  onPick: () => void
}) {
  const sub = b.subscription
  const price = priceOf(pkg, cycle)
  const free = price <= 0
  const saving = yearlySaving(pkg)
  const over = overLimits(pkg, usage)
  const sameCycle = pkg.current && (cycle === sub.cycle || free)
  const current = b.packages.find((p) => p.current)

  let label = 'เลือกแพ็กเกจนี้'
  let primary = false
  let disabledWhy: string | null = null
  if (pkg.current && sameCycle) {
    if (free) {
      label = 'ใช้งานอยู่'
      if (!sub.ends_at) disabledWhy = 'ใช้งานแพ็กเกจนี้อยู่แล้ว'
      else label = 'ใช้ต่อแบบไม่มีวันหมดอายุ'
    } else {
      label = `ต่ออายุ${CYCLE_LABEL[cycle]}`
      primary = true
    }
  } else if (pkg.current) {
    label = `เปลี่ยนเป็น${CYCLE_LABEL[cycle]}`
    primary = cycle === 'yearly'
  } else if (free) {
    label = 'เปลี่ยนเป็นแพ็กเกจฟรี'
  } else if (current && pkg.price_monthly > current.price_monthly) {
    label = 'อัปเกรด'
    primary = true
  }
  if (!disabledWhy) {
    if (sub.status === 'cancelled') disabledWhy = 'บัญชีถูกยกเลิก'
    else if (locked) disabledWhy = 'รอผลตรวจสลิปก่อน'
    else if (over.length) disabledWhy = 'การใช้งานเกินขีดจำกัด'
    else if (free && sub.status === 'suspended') disabledWhy = 'บัญชีถูกระงับ — ติดต่อผู้ให้บริการ'
  }

  return (
    <Card className={cn('relative gap-4', pkg.current && 'border-primary/50 ring-1 ring-primary/20')}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{pkg.name}</CardTitle>
          {pkg.current && (
            <Badge variant="outline" className="border-primary/40 text-primary">
              แพ็กเกจปัจจุบัน
            </Badge>
          )}
        </div>
        {pkg.description && <p className="line-clamp-2 text-sm text-muted-foreground">{pkg.description}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight tabular-nums">{free ? 'ฟรี' : baht(price)}</span>
            {!free && <span className="text-sm text-muted-foreground">/ {CYCLE_UNIT[cycle]}</span>}
          </div>
          <div className="mt-1 min-h-5 text-xs text-muted-foreground">
            {free
              ? 'ไม่มีค่าใช้จ่าย'
              : cycle === 'yearly'
                ? (
                    <>
                      เฉลี่ย {baht(Math.round(saving.perMonth))}/เดือน
                      {saving.save > 0 && (
                        <span className="ml-1.5 font-medium text-success">ประหยัด {baht(saving.save)}</span>
                      )}
                    </>
                  )
                : saving.save > 0
                  ? `หรือ ${baht(pkg.price_yearly)}/ปี (ประหยัด ${saving.months.toLocaleString('th-TH')} เดือน)`
                  : `หรือ ${baht(pkg.price_yearly)}/ปี`}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {[
            { icon: Building, label: 'โครงการ', v: pkg.max_properties, used: usage?.properties },
            { icon: DoorOpen, label: 'ห้อง', v: pkg.max_units, used: usage?.units },
            { icon: Users, label: 'สมาชิก', v: pkg.max_members, used: usage?.members },
          ].map((l) => (
            <div
              key={l.label}
              className={cn('rounded-md bg-muted/60 p-2', l.used != null && l.used > l.v && 'bg-destructive/10 text-destructive')}
            >
              <l.icon className="mx-auto mb-1 size-4 opacity-60" />
              <div className="text-base font-semibold tabular-nums">{l.v.toLocaleString('th-TH')}</div>
              <div className="opacity-70">{l.label}</div>
            </div>
          ))}
        </div>
        <Separator />
        <ul className="space-y-1.5 text-sm">
          {(Object.keys(FEATURE_LABELS) as (keyof Features)[]).map((k) => (
            <li key={k} className={cn('flex items-center gap-2', !pkg.features[k] && 'text-muted-foreground')}>
              {pkg.features[k] ? (
                <Check className="size-4 shrink-0 text-success" />
              ) : (
                <X className="size-4 shrink-0 text-muted-foreground/60" />
              )}
              {FEATURE_LABELS[k].label}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="mt-auto flex-col items-stretch gap-2 border-t pt-4">
        {over.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            ใช้งานเกินขีดจำกัด ({over.join(', ')}) — ลดจำนวนก่อนเปลี่ยน
          </p>
        )}
        <Button
          variant={primary ? 'default' : 'outline'}
          disabled={!!disabledWhy}
          title={disabledWhy ?? undefined}
          onClick={onPick}
        >
          {label}
        </Button>
      </CardFooter>
    </Card>
  )
}

function CheckoutDialog({
  b,
  pkg,
  cycle,
  onClose,
}: {
  b: BillingOverview
  pkg: BillingPackage | null
  cycle: BillingCycle
  onClose: () => void
}) {
  return (
    <Dialog open={!!pkg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {pkg && <CheckoutBody b={b} pkg={pkg} cycle={cycle} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function CheckoutBody({
  b,
  pkg,
  cycle,
  onClose,
}: {
  b: BillingOverview
  pkg: BillingPackage
  cycle: BillingCycle
  onClose: () => void
}) {
  const plan = planCheckout(b, pkg, cycle)
  const pending = b.open_invoice?.invoice.status === 'pending' ? b.open_invoice.invoice : null
  const go = useMutation({
    mutationFn: () => api.checkout({ package_id: pkg.id, cycle: plan.kind === 'free' ? 'monthly' : cycle }),
    onSuccess: async (r) => {
      if ('switched' in r) toast.success(`เปลี่ยนเป็นแพ็กเกจ ${pkg.name} แล้ว`)
      else toast.success(`ออกใบแจ้งหนี้ ${r.invoice.doc_no} แล้ว — สแกน QR เพื่อชำระ`)
      await invalidate('billing', 'org-info', 'me')
      onClose()
      if (!('switched' in r))
        requestAnimationFrame(() => document.getElementById('pay')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    },
  })

  const title =
    plan.kind === 'renewal'
      ? `ต่ออายุแพ็กเกจ ${pkg.name}`
      : plan.kind === 'free'
        ? `เปลี่ยนเป็นแพ็กเกจ ${pkg.name}`
        : pkg.current
          ? `เปลี่ยนเป็น${CYCLE_LABEL[cycle]} — ${pkg.name}`
          : `เปลี่ยนเป็นแพ็กเกจ ${pkg.name}`

  const notes: { tone?: 'warn'; text: React.ReactNode }[] = []
  if (plan.kind === 'renewal') {
    notes.push({
      text: plan.continues ? (
        <>
          รอบใหม่ต่อจากวันหมดอายุเดิม <b className="font-medium">{thDateLong(plan.start)}</b> — วันที่เหลืออยู่ไม่หายไป
        </>
      ) : (
        'แพ็กเกจหมดอายุเกินช่วงผ่อนผันแล้ว รอบใหม่จะเริ่มนับจากวันที่ผู้ให้บริการยืนยันการชำระ'
      ),
    })
  } else if (plan.kind === 'change') {
    notes.push({ text: 'แพ็กเกจใหม่เริ่มใช้ทันทีที่ผู้ให้บริการยืนยันการชำระ (รอบใหม่นับจากวันนั้น)' })
    if (plan.credit > 0)
      notes.push({
        text: `มูลค่าวันที่เหลือ ${plan.daysLeft.toLocaleString('th-TH')} วันของแพ็กเกจเดิมถูกหักเป็นส่วนลดให้แล้ว`,
      })
    else if (b.subscription.status === 'trial') notes.push({ text: 'ช่วงทดลองใช้ไม่มีส่วนลดจากแพ็กเกจเดิม' })
  } else {
    notes.push({ text: 'เปลี่ยนทันที ไม่ต้องชำระเงิน และไม่มีวันหมดอายุ' })
    if (plan.daysLost > 0)
      notes.push({
        tone: 'warn',
        text: `วันที่เหลือ ${plan.daysLost.toLocaleString('th-TH')} วันของแพ็กเกจเดิมจะสิ้นสุดทันที และไม่มีการคืนเงิน`,
      })
    notes.push({ text: 'ฟีเจอร์และขีดจำกัดจะเปลี่ยนตามแพ็กเกจใหม่' })
  }
  if (plan.kind !== 'free') {
    notes.push({ text: 'ระบบจะออกใบแจ้งหนี้พร้อม QR พร้อมเพย์ — โอนแล้วแนบสลิปในหน้านี้เพื่อให้ผู้ให้บริการตรวจสอบ' })
  }
  if (pending)
    notes.push({ tone: 'warn', text: `ใบแจ้งหนี้ ${pending.doc_no} ที่ยังไม่ได้ชำระจะถูกยกเลิก และออกใบใหม่แทน` })

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>ตรวจสอบรายละเอียดก่อนยืนยัน</DialogDescription>
      </DialogHeader>

      <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
        <SumRow label="แพ็กเกจ" value={`${pkg.name}${plan.kind === 'free' ? '' : ` · ${CYCLE_LABEL[cycle]}`}`} muted />
        {plan.kind !== 'free' && (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">รอบบริการ (โดยประมาณ)</span>
              <span className="flex items-center gap-1.5 text-right">
                <CalendarRange className="size-3.5 text-muted-foreground" />
                {thDateLong(plan.start)} – {thDateLong(plan.end)}
              </span>
            </div>
            <Separator />
            <SumRow label="ราคาแพ็กเกจ" value={baht(plan.price)} muted />
            {plan.kind === 'change' && plan.credit > 0 && (
              <SumRow label="ส่วนลดจากแพ็กเกจเดิม (ประมาณ)" value={`−${baht(plan.credit)}`} muted />
            )}
            <SumRow
              label="ยอดชำระ"
              value={baht(plan.kind === 'change' ? plan.total : plan.price)}
              strong
            />
            {b.platform.vat_registered && (
              <p className="text-right text-xs text-muted-foreground">รวมภาษีมูลค่าเพิ่ม {b.platform.vat_rate}% แล้ว</p>
            )}
          </>
        )}
      </div>

      <ul className="space-y-2 text-sm">
        {notes.map((n, i) => (
          <li key={i} className={cn('flex items-start gap-2', n.tone === 'warn' && 'text-warning-foreground')}>
            {n.tone === 'warn' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            ) : (
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span>{n.text}</span>
          </li>
        ))}
      </ul>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button onClick={() => go.mutate()} disabled={go.isPending}>
          {go.isPending ? <Loader2 className="animate-spin" /> : plan.kind === 'free' ? <Check /> : <QrCode />}
          {plan.kind === 'free' ? 'ยืนยันเปลี่ยนแพ็กเกจ' : 'ออกใบแจ้งหนี้'}
        </Button>
      </DialogFooter>
    </div>
  )
}
