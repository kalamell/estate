// บัญชีผู้ใช้: ส่งลิงก์ยืนยันอีเมลอีกครั้ง (ใช้ร่วมกันระหว่างแถบแจ้งเตือนและหน้าบัญชีของฉัน)
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError, api } from './api'
import { handleApiError, queryClient } from './query'

export function useResendVerification(email: string) {
  return useMutation({
    mutationFn: api.resendVerification,
    meta: { silent: true },
    onSuccess: () => {
      toast.success('ส่งลิงก์ยืนยันแล้ว', { description: `ตรวจกล่องจดหมาย/สแปมของ ${email} — ลิงก์ใช้ได้ 72 ชั่วโมง` })
    },
    onError: (e) => {
      // 409 = ยืนยันไปแล้ว (เช่น เปิดลิงก์จากอีกแท็บ) → อัปเดตสถานะ
      if (e instanceof ApiError && e.status === 409) {
        toast.success('อีเมลนี้ยืนยันแล้ว')
        void queryClient.invalidateQueries({ queryKey: ['me'] })
        return
      }
      handleApiError(e)
    },
  })
}
