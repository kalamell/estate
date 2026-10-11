import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Info, Loader2, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { orgLegalOf, orgThemeOf } from '@/lib/docs'
import { COLOR_THEMES, COLOR_THEME_META, type ColorThemeId } from '@/lib/themes'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { useTheme, type ColorThemePref, type Theme } from '@/components/theme-provider'
import { ThemeSwatch } from '@/components/theme-swatch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Field } from '@/components/common'

const MODES: { v: Theme; label: string; icon: LucideIcon }[] = [
  { v: 'light', label: 'สว่าง', icon: Sun },
  { v: 'dark', label: 'มืด', icon: Moon },
  { v: 'system', label: 'ตามระบบ', icon: Monitor },
]

export function AppearanceTab() {
  const { orgInfo, canManage, readOnly } = useSession()
  const { colorTheme, setColorTheme, theme, setTheme } = useTheme()

  const save = useMutation({
    mutationFn: (id: ColorThemeId) =>
      api.updateOrg({ ...orgLegalOf(orgInfo!), name: orgInfo!.org.name, theme: id }),
    onSuccess: async (_r, id) => {
      toast.success(`ตั้งธีมองค์กรเป็น "${COLOR_THEME_META[id].label}" แล้ว`)
      await invalidate('org-info')
    },
  })

  if (!orgInfo) return <Skeleton className="h-96 max-w-5xl rounded-lg" />
  const current = save.isPending && save.variables ? save.variables : orgThemeOf(orgInfo)
  const editable = canManage && !readOnly

  return (
    <div className="grid max-w-5xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>ธีมสีขององค์กร</CardTitle>
          <CardDescription>
            ใช้เป็นค่าเริ่มต้นสำหรับสมาชิกทุกคนและพอร์ทัลผู้เช่า · เอกสารที่พิมพ์ยังเป็นขาว-ดำเสมอ
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!canManage && (
            <Alert>
              <Info />
              <AlertDescription>
                เฉพาะเจ้าของหรือผู้ดูแลเท่านั้นที่เปลี่ยนธีมขององค์กรได้ — คุณเลือกธีมส่วนตัวได้จากเมนูผู้ใช้ (มุมล่างซ้าย) →
                ธีมสี หรือด้านล่างนี้
              </AlertDescription>
            </Alert>
          )}
          <div role="radiogroup" aria-label="ธีมสีขององค์กร" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COLOR_THEMES.map((id) => {
              const meta = COLOR_THEME_META[id]
              const selected = current === id
              const pending = save.isPending && save.variables === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!editable || save.isPending}
                  onClick={() => !selected && save.mutate(id)}
                  className={cn(
                    'group overflow-hidden rounded-lg border bg-card text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-default',
                    selected ? 'border-primary ring-1 ring-primary' : editable && 'hover:border-foreground/30',
                  )}
                >
                  <ThemePreview id={id} />
                  <div className="flex items-start gap-2 border-t p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {meta.label}
                        {selected && (
                          <Badge variant="secondary" className="text-[10px]">
                            ค่าเริ่มต้นองค์กร
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                    {pending ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      selected && (
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3.5" />
                        </span>
                      )
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>การแสดงผลของคุณ</CardTitle>
          <CardDescription>ตั้งค่าเฉพาะอุปกรณ์นี้ ไม่มีผลกับสมาชิกคนอื่น</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="ธีมสี" htmlFor="ap-theme">
            <Select value={colorTheme} onValueChange={(v) => setColorTheme(v as ColorThemePref)}>
              <SelectTrigger id="ap-theme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org">
                  <ThemeSwatch id={orgThemeOf(orgInfo)} />
                  ตามองค์กร ({COLOR_THEME_META[orgThemeOf(orgInfo)].label})
                </SelectItem>
                {COLOR_THEMES.map((id) => (
                  <SelectItem key={id} value={id}>
                    <ThemeSwatch id={id} />
                    {COLOR_THEME_META[id].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="โหมดแสดงผล">
            <div className="grid grid-cols-3 gap-1 rounded-md border bg-muted/50 p-1" role="radiogroup" aria-label="โหมดแสดงผล">
              {MODES.map((m) => (
                <Button
                  key={m.v}
                  type="button"
                  role="radio"
                  aria-checked={theme === m.v}
                  variant="ghost"
                  size="sm"
                  className={cn('h-8', theme === m.v && 'bg-card shadow-xs ring-1 ring-border hover:bg-card')}
                  onClick={() => setTheme(m.v)}
                >
                  <m.icon /> {m.label}
                </Button>
              ))}
            </div>
          </Field>
          {colorTheme !== 'org' && canManage && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              ตอนนี้คุณใช้ธีมส่วนตัว "{COLOR_THEME_META[colorTheme].label}" อยู่ การเปลี่ยนธีมองค์กรด้านบนจะไม่เปลี่ยนหน้าจอของคุณ
              —{' '}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setColorTheme('org')}>
                กลับไปใช้ตามองค์กร
              </button>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** ภาพจำลองขนาดเล็ก: แถบเมนู + การ์ด + ปุ่ม ในสีของธีมนั้น (ตามโหมดสว่าง/มืดปัจจุบัน) */
function ThemePreview({ id }: { id: ColorThemeId }) {
  return (
    <div data-theme={id} className="theme-preview flex h-32 bg-background text-foreground" aria-hidden>
      <div className="flex w-[28%] flex-col gap-1.5 bg-sidebar p-2">
        <div className="mb-1 flex items-center gap-1">
          <span className="size-3 rounded-[2px] bg-sidebar-mark" />
          <span className="h-1.5 w-8 rounded-full bg-sidebar-foreground/50" />
        </div>
        <span className="relative h-3 rounded-[2px] bg-sidebar-accent">
          <span className="absolute inset-y-0.5 left-0 w-0.5 bg-sidebar-primary" />
          <span className="absolute top-1 left-2 h-1 w-7 rounded-full bg-sidebar-accent-foreground/80" />
        </span>
        {[10, 8, 9].map((w, i) => (
          <span key={i} className="ml-2 h-1 rounded-full bg-sidebar-muted/70" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <span className="h-1.5 w-16 rounded-full bg-foreground/70" />
        <div className="flex-1 rounded-[4px] border bg-card p-2">
          <span className="block h-1.5 w-12 rounded-full bg-muted-foreground/60" />
          <span className="mt-1.5 block h-2 w-16 rounded-full bg-chart-1" />
          <div className="mt-2 flex items-center gap-1">
            {(['bg-st-vacant', 'bg-st-reserved', 'bg-st-occupied'] as const).map((c) => (
              <span key={c} className={cn('size-1.5 rounded-[1px]', c)} />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-1">
          <span className="h-4 w-8 rounded-[3px] border bg-card" />
          <span className="grid h-4 w-11 place-items-center rounded-[3px] bg-primary">
            <span className="h-1 w-6 rounded-full bg-primary-foreground/80" />
          </span>
        </div>
      </div>
    </div>
  )
}
