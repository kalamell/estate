import { toast } from 'sonner'

/** คัดลอกข้อความลงคลิปบอร์ด — คืน true เมื่อสำเร็จ */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    toast.error('คัดลอกไม่สำเร็จ')
    return false
  }
}
