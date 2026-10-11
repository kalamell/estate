import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readLS, writeLS } from '@/lib/storage'
import {
  COLOR_THEME_KEY,
  COLOR_THEME_META,
  DEFAULT_COLOR_THEME,
  ORG_THEME_CACHE_KEY,
  isColorTheme,
  type ColorThemeId,
} from '@/lib/themes'

export type Theme = 'light' | 'dark' | 'system'
/** ธีมสีที่ผู้ใช้เลือก: "org" = ตามองค์กร */
export type ColorThemePref = ColorThemeId | 'org'

interface ThemeCtx {
  /** โหมด สว่าง/มืด/ตามระบบ */
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (t: Theme) => void
  /** ธีมสีที่ผู้ใช้เลือกบนอุปกรณ์นี้ */
  colorTheme: ColorThemePref
  setColorTheme: (t: ColorThemePref) => void
  /** ธีมสีค่าเริ่มต้นขององค์กร */
  orgTheme: ColorThemeId
  setOrgTheme: (t: ColorThemeId) => void
  /** ธีมที่ใช้งานจริงตอนนี้ */
  activeColorTheme: ColorThemeId
  /** บังคับธีม (เช่นพอร์ทัลผู้เช่า) — null = ไม่บังคับ */
  setForcedColorTheme: (t: ColorThemeId | null) => void
}

const STORAGE_KEY = 'estate-theme'
const Ctx = createContext<ThemeCtx | null>(null)

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

/** ธีมสว่าง/มืดด้วยคลาส `.dark` และธีมสีด้วย `data-theme` บน <html> */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const v = readLS(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  })
  const [sysDark, setSysDark] = useState(systemDark)
  const [colorTheme, setColorThemeState] = useState<ColorThemePref>(() => {
    const v = readLS(COLOR_THEME_KEY)
    return isColorTheme(v) ? v : 'org'
  })
  const [orgTheme, setOrgThemeState] = useState<ColorThemeId>(() => {
    const v = readLS(ORG_THEME_CACHE_KEY)
    return isColorTheme(v) ? v : DEFAULT_COLOR_THEME
  })
  const [forced, setForced] = useState<ColorThemeId | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSysDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const resolvedTheme = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme
  const activeColorTheme: ColorThemeId = forced ?? (colorTheme === 'org' ? orgTheme : colorTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.dataset.theme = activeColorTheme
    root.style.colorScheme = resolvedTheme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', COLOR_THEME_META[activeColorTheme].bg[resolvedTheme])
  }, [resolvedTheme, activeColorTheme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    writeLS(STORAGE_KEY, t)
  }, [])

  const setColorTheme = useCallback((t: ColorThemePref) => {
    setColorThemeState(t)
    writeLS(COLOR_THEME_KEY, t)
  }, [])

  const setOrgTheme = useCallback((t: ColorThemeId) => {
    setOrgThemeState(t)
    writeLS(ORG_THEME_CACHE_KEY, t)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      colorTheme,
      setColorTheme,
      orgTheme,
      setOrgTheme,
      activeColorTheme,
      setForcedColorTheme: setForced,
    }),
    [theme, resolvedTheme, setTheme, colorTheme, setColorTheme, orgTheme, setOrgTheme, activeColorTheme],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

/** ตั้งธีมค่าเริ่มต้นขององค์กร (เรียกจาก SessionProvider เมื่อโหลด /api/org แล้ว) */
export function useOrgColorTheme(theme: string | null | undefined) {
  const { setOrgTheme } = useTheme()
  useEffect(() => {
    if (isColorTheme(theme)) setOrgTheme(theme)
  }, [theme, setOrgTheme])
}

/**
 * บังคับธีมสีขณะ component นี้แสดงอยู่ (ไม่สนค่าที่ผู้ใช้เลือก) — ใช้ในพอร์ทัลผู้เช่า
 * theme = undefined → ยังไม่ทราบ (ยังไม่บังคับ), ค่าที่ไม่รู้จัก → ธีมเริ่มต้น
 */
export function useForcedColorTheme(theme: string | null | undefined) {
  const { setForcedColorTheme } = useTheme()
  const id = theme === undefined ? null : isColorTheme(theme) ? theme : DEFAULT_COLOR_THEME
  useEffect(() => {
    if (!id) return
    setForcedColorTheme(id)
    return () => setForcedColorTheme(null)
  }, [id, setForcedColorTheme])
}
