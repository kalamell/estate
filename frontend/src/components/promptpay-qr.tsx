import { cn } from '@/lib/utils'
import { QrSvg } from '@/components/qr'
import { useI18n } from '@/lib/i18n'

/** แสดง QR จาก PromptPay payload (EMVCo) */
export function PromptPayQR({
  payload,
  amount,
  className,
}: {
  payload: string
  amount?: string
  className?: string
}) {
  const { t, en } = useI18n()
  return (
    <div className={cn('mx-auto w-56 overflow-hidden rounded-md border bg-white text-[#1c1b19]', className)}>
      <div className="bg-[#2c4a6b] px-3 py-2 text-center text-xs font-semibold tracking-wide text-white">
        {en ? 'PromptPay' : 'PromptPay · พร้อมเพย์'}
      </div>
      <div className="p-3">
        <QrSvg value={payload} label="QR code PromptPay" />
      </div>
      <div className="border-t px-3 py-2 text-center text-xs text-[#6b675f]">
        {t('สแกนจ่ายด้วยแอปธนาคาร', 'Scan with your banking app')}
        {amount && <div className="text-base font-semibold text-[#1c1b19] tabular-nums">{amount}</div>}
      </div>
    </div>
  )
}
