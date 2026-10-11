// ค่าคงที่และตัวช่วยสำหรับ PDPA
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type ConsentSource, type PrivacyRequestKind, type PrivacyRequestStatus } from './api'
import { diffDays, today, type Tone } from './format'

export const CONFIRM_WORD = 'ลบข้อมูล'

export const PRIVACY_KINDS: Record<PrivacyRequestKind, { label: string; hint: string }> = {
  access: { label: 'ขอเข้าถึง / ขอสำเนาข้อมูล', hint: 'ขอดูหรือรับสำเนาข้อมูลส่วนบุคคลที่เก็บไว้' },
  correction: { label: 'ขอแก้ไขข้อมูล', hint: 'ข้อมูลไม่ถูกต้อง ไม่เป็นปัจจุบัน หรือไม่ครบถ้วน' },
  deletion: { label: 'ขอลบข้อมูล', hint: 'ขอให้ลบหรือทำให้ข้อมูลไม่สามารถระบุตัวตนได้' },
  objection: { label: 'คัดค้านการประมวลผล', hint: 'ไม่ต้องการให้ใช้ข้อมูลเพื่อวัตถุประสงค์บางอย่าง' },
  withdraw_consent: { label: 'ถอนความยินยอม', hint: 'ยกเลิกความยินยอมที่เคยให้ไว้' },
}

export const PRIVACY_STATUS: Record<PrivacyRequestStatus, { label: string; tone: Tone }> = {
  open: { label: 'รอดำเนินการ', tone: 'mustard' },
  done: { label: 'ดำเนินการแล้ว', tone: 'green' },
  rejected: { label: 'ปฏิเสธ', tone: 'grey' },
}

export const CONSENT_SOURCE: Record<ConsentSource, string> = {
  portal: 'ผ่านพอร์ทัล',
  staff: 'เจ้าหน้าที่บันทึก',
  online_booking: 'จองออนไลน์',
}

/** นับวันถึงกำหนดตอบคำขอ (กฎหมายกำหนด 30 วัน) */
export function dueInfo(due: string) {
  const days = diffDays(today(), due.slice(0, 10))
  if (days < 0) return { days, overdue: true, label: `เกินกำหนด ${-days} วัน` }
  if (days === 0) return { days, overdue: false, label: 'ครบกำหนดวันนี้' }
  return { days, overdue: false, label: `เหลือ ${days} วัน` }
}

/** ส่งออกข้อมูลผู้เช่าเป็นไฟล์ JSON */
export function useExportTenant() {
  return useMutation({
    mutationFn: (id: number) => api.exportTenant(id),
    onSuccess: () => toast.success('ดาวน์โหลดไฟล์ข้อมูลแล้ว'),
  })
}

