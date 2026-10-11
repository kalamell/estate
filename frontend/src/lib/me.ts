import { useQuery } from '@tanstack/react-query'
import { ApiError, api, type Me } from './api'

/** ดึงข้อมูลผู้ใช้ปัจจุบัน — คืน null เมื่อยังไม่ได้เข้าสู่ระบบ */
export function useMe({ enabled = true }: { enabled?: boolean } = {}) {
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
    enabled,
    meta: { silent: true },
  })
}
