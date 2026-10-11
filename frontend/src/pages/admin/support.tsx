import { api } from '@/lib/api'
import { TicketInbox, type InboxConfig } from '@/components/tickets/inbox'
import { SUPPORT_CATEGORIES } from '@/components/tickets/labels'

const config: InboxConfig = {
  key: 'admin-support',
  list: () => api.admin.support(),
  get: api.admin.supportTicket,
  reply: api.admin.replySupport,
  patch: (id, b) => api.admin.patchSupport(id, { status: b.status, priority: b.priority }),
  categories: SUPPORT_CATEGORIES,
  self: 'platform',
  showOrg: true,
  emptyText: 'ไม่มีคำร้องในสถานะนี้',
}

export default function AdminSupport() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">คำร้องจากลูกค้า</h1>
        <p className="text-sm text-muted-foreground">ปัญหาการใช้งาน คำถาม และข้อเสนอแนะจากองค์กรลูกค้า</p>
      </div>
      <TicketInbox config={config} />
    </div>
  )
}
