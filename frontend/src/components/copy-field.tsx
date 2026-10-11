import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** ช่องข้อความอ่านอย่างเดียว + ปุ่มคัดลอก */
export function CopyField({
  value,
  label,
  className,
  inputClassName,
}: {
  value: string
  label: string
  className?: string
  inputClassName?: string
}) {
  const [copied, setCopied] = useState(false)
  const { t } = useI18n()
  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
        aria-label={label}
        className={cn('font-mono text-xs', inputClassName)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        aria-label={t(`คัดลอก${label}`, `Copy ${label}`)}
        onClick={async () => {
          if (await copyText(value)) {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}
