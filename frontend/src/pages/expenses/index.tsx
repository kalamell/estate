// รายจ่าย — เจ้าของ/ผู้ดูแลเห็นรายการทั้งหมด รายจ่ายประจำ และหมวด; พนักงานบันทึกรายจ่ายได้อย่างเดียว (/expenses)
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BanknoteArrowDown, CalendarSync, Check, Plus, Tags } from 'lucide-react'
import type { Expense } from '@/lib/api'
import { baht, thDate } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/common'
import { ExpenseDialog } from '@/components/expense-dialog'
import { ExpensesTab } from './expenses-tab'
import { RecurringTab } from './recurring-tab'
import { CategoriesTab } from './categories-tab'

const TABS = ['list', 'recurring', 'categories'] as const
type Tab = (typeof TABS)[number]

export default function ExpensesPage() {
  const { canManage } = useSession()
  const [params, setParams] = useSearchParams()
  if (!canManage) return <StaffExpenses />
  const raw = params.get('tab') as Tab | null
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'list'
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setParams(v === 'list' ? {} : { tab: v }, { replace: true })}
      className="gap-5"
    >
      <TabsList variant="line" className="w-full justify-start overflow-x-auto overflow-y-hidden border-b">
        <TabsTrigger value="list" className="flex-none px-3">
          <BanknoteArrowDown /> รายการ
        </TabsTrigger>
        <TabsTrigger value="recurring" className="flex-none px-3">
          <CalendarSync /> รายจ่ายประจำ
        </TabsTrigger>
        <TabsTrigger value="categories" className="flex-none px-3">
          <Tags /> หมวดรายจ่าย
        </TabsTrigger>
      </TabsList>
      <TabsContent value="list">
        <ExpensesTab />
      </TabsContent>
      <TabsContent value="recurring">
        <RecurringTab />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesTab />
      </TabsContent>
    </Tabs>
  )
}

/** พนักงาน: บันทึกรายจ่าย (ไม่เห็นรายการทั้งหมด) — แสดงเฉพาะที่เพิ่งบันทึกในครั้งนี้ */
function StaffExpenses() {
  const { readOnly } = useSession()
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<Expense[]>([])
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Card>
        <EmptyState
          icon={BanknoteArrowDown}
          title="บันทึกค่าใช้จ่าย"
          description="ซื้ออะไหล่ ค่าช่าง ของใช้ส่วนกลาง ฯลฯ — ถ่ายรูปใบเสร็จแนบไว้ เจ้าของหรือผู้ดูแลจะเห็นรายการทั้งหมดและนำไปคิดกำไร"
          action={
            <Button className="h-11" onClick={() => setOpen(true)} disabled={readOnly}>
              <Plus /> บันทึกรายจ่าย
            </Button>
          }
        />
      </Card>
      {added.length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b px-4 py-3 text-sm font-medium">บันทึกแล้วในครั้งนี้</div>
          <ul className="divide-y">
            {added.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Check className="size-4 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{e.vendor || e.note || e.category_name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {thDate(e.expense_date)} · {e.category_name} ·{' '}
                    {e.property_name ? `${e.property_name}${e.unit_name ? ` ห้อง ${e.unit_name}` : ''}` : 'ส่วนกลาง'}
                  </div>
                </div>
                <span className="font-medium tabular-nums">{baht(e.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ExpenseDialog open={open} onOpenChange={setOpen} onSaved={(e) => setAdded((a) => [e, ...a])} />
    </div>
  )
}
