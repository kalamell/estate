import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type HkTask, type HkTaskPatch, type HkTaskStatus } from '@/lib/api'
import { checklistProgress } from '@/lib/housekeeping'
import { invalidate, queryClient } from '@/lib/query'
import { useConfirm } from '@/components/confirm'

const TASKS = 'hk-tasks'

/** แทนที่งานในทุกรายการที่แคชไว้ */
export function putTask(fn: (t: HkTask) => HkTask | null, id: number) {
  queryClient.setQueriesData<HkTask[]>({ queryKey: [TASKS] }, (old) =>
    old?.map((t) => (t.id === id ? (fn(t) ?? t) : t)),
  )
}

/** ข้อมูลที่ได้จากงานอื่น (เช่น สถานะห้อง แดชบอร์ด) */
export const refreshAround = () => invalidate('hk-today', 'dashboard', 'units', 'calendar')

/**
 * แก้ไขงาน (PATCH) แบบ optimistic
 * - อัปเดตแคชทันที แล้วแทนด้วยข้อมูลจากเซิร์ฟเวอร์เมื่อไม่มีคำขออื่นของงานเดียวกันค้างอยู่
 */
export function usePatchTask() {
  return useMutation({
    mutationKey: ['hk-patch'],
    mutationFn: ({ id, patch }: { id: number; patch: HkTaskPatch; optimistic?: Partial<HkTask> }) =>
      api.patchHkTask(id, patch),
    onMutate: async ({ id, patch, optimistic }) => {
      await queryClient.cancelQueries({ queryKey: [TASKS] })
      const prev = queryClient.getQueriesData<HkTask[]>({ queryKey: [TASKS] })
      putTask((t) => ({ ...t, ...(patch as Partial<HkTask>), ...optimistic }), id)
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.prev ?? []) queryClient.setQueryData(key, data)
    },
    onSuccess: (saved) => {
      // มีคำขออื่นค้าง (เช่น ติ๊กเช็คลิสต์ติดกัน) → อย่าเขียนทับสถานะล่าสุดบนจอ
      if (queryClient.isMutating({ mutationKey: ['hk-patch'] }) <= 1) putTask(() => saved, saved.id)
    },
    onSettled: async () => {
      if (queryClient.isMutating({ mutationKey: ['hk-patch'] }) <= 1) {
        await Promise.all([invalidate(TASKS), refreshAround()])
      }
    },
  })
}

/** เริ่มงาน / ปิดงาน (ยืนยันเมื่อรายการตรวจยังไม่ครบ) / ยกเลิก / เปิดใหม่ */
export function useTaskActions() {
  const patch = usePatchTask()
  const confirm = useConfirm()
  const setStatus = async (task: HkTask, status: HkTaskStatus) => {
    if (status === 'done') {
      const p = checklistProgress(task)
      if (
        !p.complete &&
        !(await confirm({
          title: 'รายการตรวจยังไม่ครบ',
          description: `ทำไปแล้ว ${p.done} จาก ${p.total} รายการ — ยืนยันว่างานห้อง ${task.unit_name} เสร็จแล้ว?`,
          confirmText: 'ยืนยันเสร็จงาน',
        }))
      )
        return
    }
    if (
      status === 'cancelled' &&
      !(await confirm({
        title: `ยกเลิกงานห้อง ${task.unit_name}?`,
        description: 'งานจะถูกย้ายออกจากกระดานงาน',
        confirmText: 'ยกเลิกงาน',
        destructive: true,
      }))
    )
      return
    const now = new Date().toISOString()
    patch.mutate(
      {
        id: task.id,
        patch: { status },
        optimistic: {
          started_at: status === 'in_progress' ? (task.started_at ?? now) : task.started_at,
          completed_at: status === 'done' ? now : null,
        },
      },
      {
        onSuccess: () =>
          toast.success(
            status === 'in_progress'
              ? `เริ่มงานห้อง ${task.unit_name}`
              : status === 'done'
                ? `ห้อง ${task.unit_name} เสร็จแล้ว`
                : status === 'cancelled'
                  ? 'ยกเลิกงานแล้ว'
                  : 'เปิดงานอีกครั้งแล้ว',
          ),
      },
    )
  }
  return { setStatus, patch }
}
