// ธีมสี (preset) — ค่าสีจริงอยู่ใน index.css (html[data-theme="<id>"])
// ที่นี่เก็บเฉพาะชื่อ/คำอธิบาย และสีตัวอย่างสำหรับ swatch

export const COLOR_THEMES = ['ink', 'navy', 'terracotta', 'ocean', 'mono'] as const
export type ColorThemeId = (typeof COLOR_THEMES)[number]
export const DEFAULT_COLOR_THEME: ColorThemeId = 'ink'

export interface ColorThemeMeta {
  id: ColorThemeId
  label: string
  description: string
  /** สีตัวอย่าง: [sidebar, primary/accent] — ใช้ใน swatch สองสี */
  swatch: [string, string]
  /** สีพื้นหลัง (สว่าง, มืด) สำหรับ meta theme-color */
  bg: { light: string; dark: string }
}

export const COLOR_THEME_META: Record<ColorThemeId, ColorThemeMeta> = {
  ink: {
    id: 'ink',
    label: 'หมึกและกระดาษ',
    description: 'กระดาษสีนวล แถบเมนูสีหมึก ปุ่มเขียวป่า — ค่าเริ่มต้น',
    swatch: ['#1c1b19', '#1f5135'],
    bg: { light: '#faf9f6', dark: '#151412' },
  },
  navy: {
    id: 'navy',
    label: 'กรมท่าและทองเหลือง',
    description: 'พื้นครีม แถบเมนูกรมท่า ไฮไลต์สีทองเหลือง ดูภูมิฐาน',
    swatch: ['#14213d', '#b08d57'],
    bg: { light: '#f7f5f0', dark: '#0e1320' },
  },
  terracotta: {
    id: 'terracotta',
    label: 'ดินเผา',
    description: 'พื้นหินอ่อนโทนอุ่น ปุ่มสีอิฐดินเผา',
    swatch: ['#2b2724', '#b5532e'],
    bg: { light: '#f6f4f1', dark: '#171412' },
  },
  ocean: {
    id: 'ocean',
    label: 'ทะเลลึก',
    description: 'พื้นเย็นตา แถบเมนูเขียวหัวเป็ดเข้ม ปุ่มเทียลลึก',
    swatch: ['#0f2a2e', '#145a63'],
    bg: { light: '#f5f8f8', dark: '#0d1718' },
  },
  mono: {
    id: 'mono',
    label: 'ขาวดำ',
    description: 'ขาว-ดำล้วน ใช้สีเฉพาะสถานะห้องและบิล',
    swatch: ['#0a0a0a', '#ffffff'],
    bg: { light: '#ffffff', dark: '#0a0a0a' },
  },
}

export const isColorTheme = (v: unknown): v is ColorThemeId =>
  typeof v === 'string' && (COLOR_THEMES as readonly string[]).includes(v)

/** localStorage: ธีมสีที่ผู้ใช้เลือกเอง (id หรือ "org") */
export const COLOR_THEME_KEY = 'estate-color-theme'
/** localStorage: แคชธีมขององค์กรล่าสุด (กันหน้าจอกะพริบตอนโหลด) */
export const ORG_THEME_CACHE_KEY = 'estate-org-theme'
