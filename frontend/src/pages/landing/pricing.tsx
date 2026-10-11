import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building, Check, DoorOpen, RefreshCw, Users, X } from 'lucide-react'
import type { BillingCycle, Features, PublicPackage, PublicSite } from '@/lib/api'
import { CYCLE_LABEL, CYCLE_UNIT, priceOf, yearlySaving } from '@/lib/billing'
import { FEATURE_LABELS } from '@/lib/features'
import { baht } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const n = (v: number) => v.toLocaleString('th-TH')

export function PricingSection({
  site,
  loading,
  error,
  onRetry,
  authed,
  onIntent,
}: {
  site: PublicSite | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
  /** ล็อกอินอยู่ → ปุ่มพาไปหน้าแพ็กเกจในแอปแทนการสมัคร */
  authed: boolean
  /** ชี้/แตะปุ่มสมัคร — เริ่มโหลดหน้าสมัครล่วงหน้า */
  onIntent: () => void
}) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const packages = site?.packages ?? []
  const starter = packages.find((p) => p.is_default) ?? packages[0]
  const bestMonths = Math.max(0, ...packages.filter((p) => p.price_monthly > 0).map((p) => yearlySaving(p).months))

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="max-w-2xl">
            <h2 id="pricing-title" className="text-2xl sm:text-3xl">
              ราคา
            </h2>
            <p className="mt-2 text-muted-foreground">
              คิดตามจำนวนโครงการ ห้อง และผู้ใช้ ราคารวมภาษีมูลค่าเพิ่มแล้ว จ่ายผ่าน QR พร้อมเพย์ ไม่ต้องผูกบัตร
              และไม่มีการตัดเงินอัตโนมัติ
            </p>
          </div>
          <div
            className="flex gap-1 rounded-md border bg-card p-1 sm:ml-auto"
            role="radiogroup"
            aria-label="รอบการชำระ"
          >
            {(['monthly', 'yearly'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cycle === c}
                onClick={() => setCycle(c)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  cycle === c
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {c === 'monthly' ? 'จ่ายรายเดือน' : 'จ่ายรายปี'}
                {c === 'yearly' && bestMonths > 0 && (
                  <span
                    className={cn(
                      'rounded-sm px-1 text-[11px] font-medium',
                      cycle === c ? 'bg-primary-foreground/15' : 'bg-success/10 text-success',
                    )}
                  >
                    ประหยัด ~{n(bestMonths)} เดือน
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading &&
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[30rem] rounded-lg" />)}
          {!loading && error && (
            <div className="rounded-lg border bg-card p-6 text-sm md:col-span-2 lg:col-span-3">
              <p className="font-medium">โหลดราคาไม่สำเร็จ</p>
              <p className="mt-1 text-muted-foreground">ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
                <RefreshCw /> โหลดอีกครั้ง
              </Button>
            </div>
          )}
          {packages.map((p) => (
            <PlanCard key={p.id} pkg={p} cycle={cycle} authed={authed} onIntent={onIntent} />
          ))}
        </div>

        {starter && (
          <ul className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="flex gap-3">
              <span className="mt-2.5 h-px w-4 shrink-0 bg-primary" aria-hidden />
              ทุกบัญชีเริ่มที่แพ็กเกจ {starter.name}
              {starter.price_monthly > 0 ? ' (ทดลองใช้ 14 วัน)' : ''} แล้วเปลี่ยนแพ็กเกจได้เองในแอป
              ถ้าเปลี่ยนกลางรอบ ระบบหักมูลค่าวันที่เหลือให้
            </li>
            <li className="flex gap-3">
              <span className="mt-2.5 h-px w-4 shrink-0 bg-primary" aria-hidden />
              ชำระแล้วได้ใบเสร็จทุกครั้ง หยุดต่ออายุเมื่อไหร่ก็ได้ ข้อมูลยังอยู่และเปิดดูได้
            </li>
            <li className="flex gap-3">
              <span className="mt-2.5 h-px w-4 shrink-0 bg-primary" aria-hidden />
              ค่าบริการตรวจสลิปของ EasySlip/SlipOK และค่าส่งข้อความของ LINE OA จ่ายกับผู้ให้บริการนั้นโดยตรง
            </li>
            <li className="flex gap-3">
              <span className="mt-2.5 h-px w-4 shrink-0 bg-primary" aria-hidden />
              <span>
                มีหลายโครงการหรือหลายร้อยห้อง{' '}
                <a href="#contact" className="font-medium text-primary underline-offset-4 hover:underline">
                  ติดต่อทีมงาน
                </a>{' '}
                เพื่อช่วยย้ายข้อมูลและเลือกแพ็กเกจ
              </span>
            </li>
          </ul>
        )}
      </div>
    </section>
  )
}

function PlanCard({
  pkg,
  cycle,
  authed,
  onIntent,
}: {
  pkg: PublicPackage
  cycle: BillingCycle
  authed: boolean
  onIntent: () => void
}) {
  const price = priceOf(pkg, cycle)
  const free = price <= 0
  const saving = yearlySaving(pkg)
  const cta = authed
    ? 'ดูในหน้าแพ็กเกจ'
    : pkg.is_default
      ? free
        ? 'เริ่มใช้ฟรี'
        : 'ทดลองใช้ 14 วัน'
      : `สมัครแล้วเลือก ${pkg.name}`

  return (
    <article
      className={cn(
        'flex flex-col rounded-lg border bg-card p-6',
        pkg.is_default && 'border-primary/50 ring-1 ring-primary/20',
      )}
      aria-labelledby={`plan-${pkg.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`plan-${pkg.id}`} className="text-lg">
          {pkg.name}
        </h3>
        {pkg.is_default && (
          <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            เริ่มต้นตอนสมัคร
          </span>
        )}
      </div>
      {pkg.description && <p className="mt-1 min-h-10 text-sm text-muted-foreground">{pkg.description}</p>}

      <div className="mt-5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight tabular-nums">{free ? 'ฟรี' : baht(price)}</span>
          {!free && <span className="text-sm text-muted-foreground">/ {CYCLE_UNIT[cycle]}</span>}
        </div>
        <p className="mt-1 min-h-5 text-xs text-muted-foreground">
          {free ? (
            'ไม่มีค่าใช้จ่าย ไม่มีวันหมดอายุ'
          ) : cycle === 'yearly' ? (
            <>
              เฉลี่ย {baht(Math.round(saving.perMonth))}/เดือน
              {saving.save > 0 && <span className="ml-1.5 font-medium text-success">ประหยัด {baht(saving.save)}</span>}
            </>
          ) : (
            `${CYCLE_LABEL.yearly} ${baht(pkg.price_yearly)}`
          )}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { icon: Building, label: 'โครงการ', v: pkg.max_properties },
          { icon: DoorOpen, label: 'ห้อง', v: pkg.max_units },
          { icon: Users, label: 'ผู้ใช้', v: pkg.max_members },
        ].map((l) => (
          <div key={l.label} className="rounded-md bg-muted/60 p-2">
            <l.icon className="mx-auto mb-1 size-4 opacity-60" aria-hidden />
            <dd className="text-base font-semibold tabular-nums">{n(l.v)}</dd>
            <dt className="text-muted-foreground">{l.label}</dt>
          </div>
        ))}
      </dl>

      <ul className="mt-5 space-y-2 border-t pt-5 text-sm">
        {(Object.keys(FEATURE_LABELS) as (keyof Features)[]).map((k) => (
          <li key={k} className={cn('flex items-start gap-2', !pkg.features[k] && 'text-muted-foreground')}>
            {pkg.features[k] ? (
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="มี" />
            ) : (
              <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-label="ไม่มี" />
            )}
            {FEATURE_LABELS[k].label}
          </li>
        ))}
      </ul>

      <Button asChild variant={pkg.is_default ? 'default' : 'outline'} className="mt-6 w-full">
        <Link to={authed ? '/billing' : '/register'} onPointerEnter={onIntent} onFocus={onIntent}>
          {cta}
        </Link>
      </Button>
    </article>
  )
}
