import { cn } from '@/lib/utils'
import { COLOR_THEME_META, type ColorThemeId } from '@/lib/themes'

/** สี่เหลี่ยมเล็กสองสี (แถบเมนู + สีหลัก) แทนธีมสี */
export function ThemeSwatch({ id, className }: { id: ColorThemeId; className?: string }) {
  const [a, b] = COLOR_THEME_META[id].swatch
  return (
    <span
      aria-hidden
      className={cn('inline-flex size-4 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/15 dark:ring-white/20', className)}
    >
      <span className="h-full w-1/2" style={{ background: a }} />
      <span className="h-full w-1/2" style={{ background: b }} />
    </span>
  )
}
