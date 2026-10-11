import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from './api'

/** ตัวช่วยนำทางจากนอก React tree (ตั้งค่าโดย <NavigatorBridge/>) */
let navigateFn: ((to: string) => void) | null = null
export function setNavigator(fn: ((to: string) => void) | null) {
  navigateFn = fn
}
export function navigateTo(to: string) {
  if (navigateFn) navigateFn(to)
  else window.location.assign(to)
}

let lastToast = { msg: '', at: 0 }

/** จัดการข้อผิดพลาดจาก API แบบรวมศูนย์ */
export function handleApiError(err: unknown) {
  const e = err instanceof ApiError ? err : null
  if (e?.status === 401) {
    // เซสชันหมดอายุ → ล้างข้อมูลผู้ใช้ แล้ว guard จะพาไปหน้า /login
    queryClient.setQueryData(['me'], null)
    return
  }
  // 429 แจ้งเตือนแล้วใน request()
  if (e?.status === 429) return
  const msg = e?.status === 403 ? 'ไม่มีสิทธิ์' : (err as Error)?.message || 'เกิดข้อผิดพลาด'
  // กันข้อความซ้ำจากหลาย query พร้อมกัน
  const now = Date.now()
  if (msg === lastToast.msg && now - lastToast.at < 1500) return
  lastToast = { msg, at: now }

  if (
    e?.status === 402 &&
    (e.code === 'limit_reached' ||
      e.code === 'subscription_inactive' ||
      e.code === 'feature_unavailable')
  ) {
    toast.error(msg, {
      description:
        e.code === 'limit_reached'
          ? 'เกินขีดจำกัดของแพ็กเกจปัจจุบัน'
          : e.code === 'feature_unavailable'
            ? 'ฟีเจอร์นี้ไม่รวมอยู่ในแพ็กเกจปัจจุบัน'
            : 'การสมัครใช้งานไม่อยู่ในสถานะใช้งาน',
      action: { label: 'ดูแพ็กเกจ', onClick: () => navigateTo('/settings?tab=package') },
      duration: 8000,
    })
    return
  }
  toast.error(msg)
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { silent?: boolean }
    mutationMeta: { silent?: boolean }
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (!query.meta?.silent) handleApiError(err)
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _v, _c, mutation) => {
      if (!mutation.meta?.silent) handleApiError(err)
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false
        return count < 1
      },
    },
  },
})

/** invalidate หลาย key พร้อมกัน */
export function invalidate(...keys: string[]) {
  return Promise.all(keys.map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
}
