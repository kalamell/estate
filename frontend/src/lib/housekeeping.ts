// ป้ายกำกับ/สีของงานแม่บ้าน
import type { HkTask, HkTaskKind, HkTaskStatus, HousekeepingStatus } from './api'
import type { Tone } from './format'

export const HK_KINDS: Record<HkTaskKind, string> = {
  checkout_clean: 'ทำความสะอาดหลังเช็คเอาท์',
  stayover: 'ทำความสะอาดระหว่างเข้าพัก',
  deep_clean: 'ทำความสะอาดใหญ่',
  inspection: 'ตรวจห้อง',
  maintenance: 'ซ่อมบำรุง',
}

export const HK_TASK_STATUS: Record<HkTaskStatus, { label: string; tone: Tone }> = {
  pending: { label: 'รอดำเนินการ', tone: 'mustard' },
  in_progress: { label: 'กำลังทำ', tone: 'ink' },
  done: { label: 'เสร็จแล้ว', tone: 'green' },
  cancelled: { label: 'ยกเลิก', tone: 'grey' },
}

/** สถานะความสะอาดของห้อง */
export const HK_STATUS: Record<HousekeepingStatus, { label: string; short: string; tone: Tone; dot: string; text: string }> = {
  clean: { label: 'สะอาด', short: 'สะอาด', tone: 'green', dot: 'bg-success', text: 'text-success' },
  dirty: { label: 'รอทำความสะอาด', short: 'รอทำ', tone: 'mustard', dot: 'bg-warning', text: 'text-warning-foreground' },
  in_progress: { label: 'กำลังทำความสะอาด', short: 'กำลังทำ', tone: 'ink', dot: 'bg-info', text: 'text-info' },
}

export const HK_STATUS_ORDER: HousekeepingStatus[] = ['clean', 'dirty', 'in_progress']

export const isOpenTask = (t: Pick<HkTask, 'status'>) => t.status === 'pending' || t.status === 'in_progress'

export const checklistProgress = (t: Pick<HkTask, 'checklist'>) => {
  const total = t.checklist?.length ?? 0
  const done = t.checklist?.filter((c) => c.done).length ?? 0
  return { done, total, complete: total === 0 || done === total }
}
