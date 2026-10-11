import { Link, useNavigate } from 'react-router-dom'
import { useTheme, type ColorThemePref, type Theme } from '@/components/theme-provider'
import { ChevronsUpDown, LogOut, Palette, Settings, ShieldCheck } from 'lucide-react'
import { COLOR_THEMES, COLOR_THEME_META } from '@/lib/themes'
import { ThemeSwatch } from '@/components/theme-swatch'
import { api, setOrgId, type User } from '@/lib/api'
import { queryClient } from '@/lib/query'
import { initials } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function useLogout() {
  const navigate = useNavigate()
  return async () => {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    setOrgId(null)
    queryClient.clear()
    queryClient.setQueryData(['me'], null)
    navigate('/login', { replace: true })
  }
}

function UserAvatar({ user, className, onSidebar }: { user: User; className?: string; onSidebar?: boolean }) {
  return (
    <Avatar className={className ?? 'size-8 rounded-lg'}>
      <AvatarFallback
        className={
          onSidebar
            ? 'rounded-md bg-sidebar-mark text-sm font-semibold text-sidebar-mark-foreground'
            : 'rounded-md bg-primary text-sm font-semibold text-primary-foreground'
        }
      >
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** เนื้อหาเมนูผู้ใช้ — ใช้ร่วมกันระหว่าง sidebar และ admin console */
function UserMenuContent({
  user,
  side = 'bottom',
  showSettings = true,
}: {
  user: User
  side?: 'bottom' | 'right' | 'top'
  showSettings?: boolean
}) {
  const logout = useLogout()
  return (
    <DropdownMenuContent className="min-w-60 rounded-lg" side={side} align="end" sideOffset={4}>
      <DropdownMenuLabel className="p-0 font-normal">
        <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
          <UserAvatar user={user} />
          <div className="grid flex-1 leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <ThemeSubmenu />
        {showSettings && (
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings />
              ตั้งค่าองค์กร
            </Link>
          </DropdownMenuItem>
        )}
        {user.is_super_admin && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldCheck />
              Super Admin Console
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
        <LogOut />
        ออกจากระบบ
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

const MODES: { v: Theme; label: string }[] = [
  { v: 'light', label: 'สว่าง' },
  { v: 'dark', label: 'มืด' },
  { v: 'system', label: 'ตามระบบ' },
]

/** เมนูย่อย "ธีมสี" — เลือกธีมส่วนตัว (เฉพาะอุปกรณ์นี้) และโหมดสว่าง/มืด */
function ThemeSubmenu() {
  const { theme, setTheme, colorTheme, setColorTheme, orgTheme, activeColorTheme } = useTheme()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette />
        ธีมสี
        <ThemeSwatch id={activeColorTheme} className="ml-auto" />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">ธีมสี (เฉพาะอุปกรณ์นี้)</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={colorTheme} onValueChange={(v) => setColorTheme(v as ColorThemePref)}>
          <DropdownMenuRadioItem value="org" onSelect={(e) => e.preventDefault()}>
            <ThemeSwatch id={orgTheme} />
            ตามองค์กร
            <span className="ml-auto pl-3 text-xs text-muted-foreground">{COLOR_THEME_META[orgTheme].label}</span>
          </DropdownMenuRadioItem>
          {COLOR_THEMES.map((id) => (
            <DropdownMenuRadioItem key={id} value={id} onSelect={(e) => e.preventDefault()}>
              <ThemeSwatch id={id} />
              {COLOR_THEME_META[id].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">โหมดแสดงผล</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {MODES.map((m) => (
            <DropdownMenuRadioItem key={m.v} value={m.v} onSelect={(e) => e.preventDefault()}>
              {m.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** ปุ่มผู้ใช้ในส่วนท้าย sidebar */
export function SidebarUserMenu({ user, isMobile }: { user: User; isMobile: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[state=open]:bg-sidebar-accent">
          <UserAvatar user={user} onSidebar />
          <div className="grid flex-1 leading-tight">
            <span className="truncate font-medium text-sidebar-accent-foreground">{user.name}</span>
            <span className="truncate text-xs opacity-70">{user.email}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <UserMenuContent user={user} side={isMobile ? 'top' : 'right'} />
    </DropdownMenu>
  )
}

/** ปุ่มผู้ใช้แบบไอคอน (ใช้ใน header ของ admin console) */
export function CompactUserMenu({ user, showSettings }: { user: User; showSettings?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="เมนูผู้ใช้">
          <UserAvatar user={user} className="size-8 rounded-full" />
        </Button>
      </DropdownMenuTrigger>
      <UserMenuContent user={user} showSettings={showSettings} />
    </DropdownMenu>
  )
}
