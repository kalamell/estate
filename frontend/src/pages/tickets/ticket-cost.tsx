// บันทึกค่าใช้จ่ายของงานซ่อม (หมวดซ่อมบำรุง + ห้อง/โครงการของงาน) และยอดที่บันทึกแล้ว (เฉพาะเจ้าของ/ผู้ดูแล)
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coins, Plus } from 'lucide-react'
import { api, type Ticket } from '@/lib/api'
import { baht } from '@/lib/format'
import { REPAIR_CATEGORY } from '@/lib/expenses'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { ExpenseDialog } from '@/components/expense-dialog'

export function TicketCost({ ticket }: { ticket: Ticket }) {
  const { canManage, readOnly } = useSession()
  const [open, setOpen] = useState(false)
  // รายการรายจ่ายดูได้เฉพาะเจ้าของ/ผู้ดูแล → พนักงานไม่แสดงยอด
  const all = useQuery({
    queryKey: ['expenses', 'for-tickets'],
    queryFn: () => api.expenses({}),
    enabled: canManage,
    meta: { silent: true },
  })
  const linked = (all.data?.expenses ?? []).filter((e) => e.ticket_id === ticket.id)
  const total = linked.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-dashed px-3 py-2">
      <Coins className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 text-xs text-muted-foreground">
        {canManage && linked.length > 0 ? (
          <>
            ค่าใช้จ่ายของงานนี้{' '}
            <span className="font-semibold text-foreground tabular-nums">{baht(total)}</span> · {linked.length} รายการ
          </>
        ) : (
          'ค่าอะไหล่ / ค่าช่าง — บันทึกเป็นรายจ่ายของห้องนี้'
        )}
      </div>
      <Button size="sm" variant="outline" className="h-9 sm:h-8" onClick={() => setOpen(true)} disabled={readOnly}>
        <Plus /> บันทึกค่าใช้จ่ายของงานนี้
      </Button>
      <ExpenseDialog
        open={open}
        onOpenChange={setOpen}
        defaults={{
          ticket_id: ticket.id,
          ticket_title: ticket.title,
          property_id: ticket.property_id,
          unit_id: ticket.unit_id,
          category_name: REPAIR_CATEGORY,
        }}
      />
    </div>
  )
}
