import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readLS, writeLS } from '@/lib/storage'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeCtx {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (t: Theme) => void
}

const STORAGE_KEY = 'estate-theme'
const Ctx = createContext<ThemeCtx | null>(null)

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

/** ธีมสว่าง/มืดด้วยคลาส `.dark` บน <html> (เก็บค่าใน localStorage) */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const v = readLS(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  })
  const [sysDark, setSysDark] = useState(systemDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSysDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const resolvedTheme = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.style.colorScheme = resolvedTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#151412' : '#FAF9F6')
  }, [resolvedTheme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    writeLS(STORAGE_KEY, t)
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
