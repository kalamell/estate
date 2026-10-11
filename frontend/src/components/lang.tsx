// ตัวเลือกภาษา TH | EN และ provider ของหน้าที่ผู้เช่า/แขกเห็น
import { useEffect, type ReactNode } from 'react'
import { LANGS, LangContext, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** ครอบหน้าด้วยภาษาที่เลือก + ตั้ง <html lang> ให้ตรง (คืนค่าเดิมเมื่อออกจากหน้า) */
export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  useEffect(() => {
    const el = document.documentElement
    const prev = el.lang
    el.lang = lang
    return () => {
      el.lang = prev || 'th'
    }
  }, [lang])
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

/** ปุ่มสลับภาษาแบบแบ่งช่อง (TH | EN) */
export function LangSwitch({
  value,
  onChange,
  disabled,
  className,
}: {
  value: Lang
  onChange: (l: Lang) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label="ภาษา / Language"
      className={cn('flex h-10 shrink-0 items-center rounded-md border bg-muted/50 p-0.5', className)}
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          lang={l}
          aria-label={l === 'th' ? 'ภาษาไทย' : 'English'}
          disabled={disabled}
          onClick={() => value !== l && onChange(l)}
          className={cn(
            'h-full min-w-9 rounded-sm px-2 text-xs font-semibold tracking-wide transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            value === l
              ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
