import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ApiError,
  api,
  getOrgId,
  setOrgId,
  type Features,
  type LineSettings,
  type Me,
  type OrgInfo,
  type OrgSummary,
  type Role,
  type User,
} from '@/lib/api'
import { queryClient } from '@/lib/query'
import { today } from '@/lib/format'
import { useOrgColorTheme } from '@/components/theme-provider'

/** ดึงข้อมูลผู้ใช้ปัจจุบัน — คืน null เมื่อยังไม่ได้เข้าสู่ระบบ */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.me()
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 5 * 60_000,
    meta: { silent: true },
  })
}

interface Session {
  user: User
  orgs: OrgSummary[]
  org: OrgSummary | null
  orgId: number | null
  switchOrg: (id: number) => void
  orgInfo: OrgInfo | undefined
  role: Role | null
  /** owner / admin — จัดการโครงการ ห้อง สมาชิก และองค์กรได้ */
  canManage: boolean
  /** บัญชีถูกระงับหรือหมดอายุ */
  readOnly: boolean
  features: Features
  featuresLoaded: boolean
  /** การตั้งค่า LINE OA (null = backend ยังไม่ส่งมา) */
  line: LineSettings | null
  /** LINE OA เปิดใช้งานและตั้งค่าครบ */
  lineReady: boolean
}

const SessionContext = createContext<Session | null>(null)

const ALL_FEATURES: Features = {
  ocr: true,
  view3d: true,
  short_stay: true,
  invoices: true,
  portal: true,
  reports: true,
}

const NON_ORG_KEYS = new Set(['me', 'admin'])

export function SessionProvider({ me, children }: { me: Me; children: ReactNode }) {
  const [selected, setSelected] = useState<number | null>(() => getOrgId())
  const orgs = me.orgs
  const org = orgs.find((o) => o.id === selected) ?? orgs[0] ?? null
  const orgId = org?.id ?? null
  // ให้ API client ใช้ org ปัจจุบันเสมอ (idempotent)
  if (getOrgId() !== orgId) setOrgId(orgId)

  const switchOrg = useCallback((id: number) => {
    setOrgId(id)
    queryClient.removeQueries({
      predicate: (q) => !NON_ORG_KEYS.has(String(q.queryKey[0])),
    })
    setSelected(id)
  }, [])

  const { data: orgInfo } = useQuery({
    queryKey: ['org-info', orgId],
    queryFn: api.org,
    enabled: orgId != null,
    staleTime: 60_000,
  })
  // ธีมสีค่าเริ่มต้นขององค์กร
  useOrgColorTheme(orgInfo?.org.theme)

  const value = useMemo<Session>(() => {
    const role = orgInfo?.role ?? org?.role ?? null
    const status = orgInfo?.org.status ?? org?.status
    const endsAt = orgInfo?.org.ends_at
    const expired = !!endsAt && endsAt.slice(0, 10) < today()
    const readOnly = status === 'suspended' || status === 'cancelled' || expired
    return {
      user: me.user,
      orgs,
      org,
      orgId,
      switchOrg,
      orgInfo,
      role,
      canManage: role === 'owner' || role === 'admin',
      readOnly,
      features: orgInfo?.package.features ?? ALL_FEATURES,
      featuresLoaded: !!orgInfo,
      line: orgInfo?.org.line ?? null,
      lineReady: !!orgInfo?.org.line?.enabled,
    }
  }, [me.user, orgs, org, orgId, switchOrg, orgInfo])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
