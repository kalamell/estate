import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/** QR code เป็น SVG (สีดำบนขาว) */
export function QrSvg({ value, className, label }: { value: string; className?: string; label?: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#1c1b19', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null))
    return () => {
      alive = false
    }
  }, [value])
  if (!svg) return <Skeleton className={cn('aspect-square w-full', className)} />
  return (
    <div
      className={cn('aspect-square w-full bg-white [&>svg]:h-full [&>svg]:w-full', className)}
      role="img"
      aria-label={label ?? 'QR code'}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
