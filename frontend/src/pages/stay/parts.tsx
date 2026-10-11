import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Phone, SearchX, WifiOff } from 'lucide-react'
import { ApiError, type StayOrg } from '@/lib/api'
import { initials } from '@/lib/format'
import { useI18n, type Lang } from '@/lib/i18n'
import { LangSwitch } from '@/components/lang'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** ตราองค์กร (อักษรแรกของชื่อ) */
export function OrgMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-md bg-primary text-base font-semibold text-primary-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

export function StayHeader({
  org,
  subtitle,
  to,
  wide,
  lang,
  onLang,
}: {
  org: StayOrg
  subtitle: ReactNode
  to?: string
  wide?: boolean
  /** แสดงตัวเลือกภาษา TH | EN */
  lang?: Lang
  onLang?: (l: Lang) => void
}) {
  const { t } = useI18n()
  const brand = (
    <>
      <OrgMark name={org.name} />
      <div className="min-w-0 leading-tight">
        <div className="truncate font-semibold">{org.name}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </>
  )
  return (
    <header className="border-b bg-card">
      <div className={cn('mx-auto flex items-center gap-3 px-4 py-3', wide ? 'max-w-5xl' : 'max-w-lg')}>
        {to ? (
          <Link to={to} className="flex min-w-0 flex-1 items-center gap-3">
            {brand}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{brand}</div>
        )}
        {lang && onLang && <LangSwitch value={lang} onChange={onLang} />}
        {org.phone && (
          <Button asChild variant="outline" className="h-10 shrink-0 px-3">
            <a href={`tel:${org.phone}`} aria-label={`${t('โทร', 'Call')} ${org.phone}`}>
              <Phone />
              <span className="hidden tabular-nums sm:inline">{org.phone}</span>
              <span className="sm:hidden">{t('โทร', 'Call')}</span>
            </a>
          </Button>
        )}
      </div>
    </header>
  )
}

export function StayError({ error, retry, notFoundText }: { error: unknown; retry: () => void; notFoundText: string }) {
  const { t } = useI18n()
  const notFound = error instanceof ApiError && error.status >= 400 && error.status < 500
  const Icon = notFound ? SearchX : WifiOff
  return (
    <div className="grid min-h-svh place-items-center bg-background p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-md border bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <h1 className="mt-5 text-lg font-semibold">{notFound ? notFoundText : t('เชื่อมต่อไม่สำเร็จ', 'Could not connect')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {notFound
            ? t(
                'ลิงก์อาจพิมพ์ผิด หรือที่พักปิดรับจองออนไลน์ชั่วคราว กรุณาติดต่อที่พักโดยตรง',
                'The link may be mistyped, or online booking is paused. Please contact the property directly.',
              )
            : t('ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง', 'Check your internet connection and try again')}
        </p>
        {!notFound && (
          <Button className="mt-5 h-11" onClick={retry}>
            {t('ลองใหม่', 'Try again')}
          </Button>
        )}
      </div>
    </div>
  )
}

export function StaySkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className={cn('mx-auto space-y-4 p-4', wide ? 'max-w-5xl' : 'max-w-lg')}>
      <Skeleton className="h-14" />
      <Skeleton className="h-40" />
      <Skeleton className="h-72" />
    </div>
  )
}

export function StayFooter() {
  const { t } = useI18n()
  return (
    <footer className="mx-auto max-w-5xl px-4 pt-6 pb-10 text-center text-xs text-muted-foreground">
      {t('ระบบจองออนไลน์โดย Estate', 'Online booking by Estate')}
    </footer>
  )
}
