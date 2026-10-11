import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { TicketInbox, type InboxConfig } from '@/components/tickets/inbox'
import { NewTicketDialog } from '@/components/tickets/new-ticket-dialog'
import { SUPPORT_CATEGORIES } from '@/components/tickets/labels'
import { Button } from '@/components/ui/button'

export default function SupportPage() {
  const [, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const config: InboxConfig = {
    key: 'support',
    list: () => api.support(),
    get: api.supportTicket,
    reply: api.replySupport,
    categories: SUPPORT_CATEGORIES,
    self: 'staff',
    emptyText: 'ยังไม่มีคำร้องถึงผู้ให้บริการ',
    toolbar: (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> ส่งคำร้องใหม่
      </Button>
    ),
  }
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        แจ้งปัญหาการใช้งาน สอบถาม หรือเสนอฟีเจอร์ถึงทีมงาน Estate — ทีมงานจะตอบกลับในเธรดนี้
      </p>
      <TicketInbox config={config} />
      <NewTicketDialog
        open={open}
        onOpenChange={setOpen}
        title="ติดต่อผู้ให้บริการ"
        description="อธิบายสิ่งที่เกิดขึ้นและแนบภาพหน้าจอ (ถ้ามี) เพื่อให้ทีมงานช่วยได้เร็วขึ้น"
        categories={SUPPORT_CATEGORIES}
        create={api.createSupport}
        onCreated={async (t) => {
          await invalidate('support')
          setParams({ t: String(t.id) })
        }}
      />
    </div>
  )
}
