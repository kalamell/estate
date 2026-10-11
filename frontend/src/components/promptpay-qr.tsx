import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/** แสดง QR จาก PromptPay payload (EMVCo) เป็น SVG */
export function PromptPayQR({
  payload,
  amount,
  className,
}: {
  payload: string
  amount?: string
  className?: string
}) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null))
    return () => {
      alive = false
    }
  }, [payload])

  return (
    <div
      className={cn(
        'mx-auto w-56 overflow-hidden rounded-xl border bg-white text-slate-900 shadow-sm',
        className,
      )}
    >
      <div className="bg-[#0e3b6b] px-3 py-2 text-center text-xs font-semibold tracking-wide text-white">
        PromptPay · พร้อมเพย์
      </div>
      <div className="p-3">
        {svg ? (
          <div
            className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full"
            role="img"
            aria-label="QR code PromptPay"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <Skeleton className="aspect-square w-full" />
        )}
      </div>
      <div className="border-t px-3 py-2 text-center text-xs text-slate-500">
        สแกนจ่ายด้วย PromptPay
        {amount && <div className="text-base font-bold text-[#0e3b6b]">{amount}</div>}
      </div>
    </div>
  )
}
