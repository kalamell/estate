// ภาษาของพอร์ทัลผู้เช่า
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type PortalHome } from '@/lib/api'
import { detectLang, isLang, type Lang } from '@/lib/i18n'
import { queryClient } from '@/lib/query'
import { writeLS } from '@/lib/storage'

/** ภาษาของผู้เช่า (ตั้งค่าในพอร์ทัล) — ก่อนโหลดเสร็จใช้ค่าที่จำไว้ในเครื่อง */
export const portalLang = (d: PortalHome | undefined): Lang =>
  isLang(d?.tenant.lang) ? d.tenant.lang : detectLang()

/** สลับภาษาทันที แล้วบันทึกให้ผู้เช่า (LINE จะใช้ภาษานี้ด้วย) */
export function useSetPortalLang(token: string) {
  return useMutation({
    mutationFn: (lang: Lang) => api.portal.setLang(token, lang),
    meta: { silent: true },
    onMutate: (lang) => {
      writeLS('estate.lang', lang)
      const prev = queryClient.getQueryData<PortalHome>(['portal', token])
      queryClient.setQueryData<PortalHome>(['portal', token], (old) =>
        old ? { ...old, tenant: { ...old.tenant, lang } } : old,
      )
      return { prev }
    },
    onError: (e, _l, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['portal', token], ctx.prev)
      toast.error((e as Error).message || 'Could not save language / บันทึกภาษาไม่สำเร็จ')
    },
  })
}
