import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Megaphone, Plus, Wrench } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TicketInbox, type InboxConfig } from '@/components/tickets/inbox'
import { NewTicketDialog } from '@/components/tickets/new-ticket-dialog'
import { ORG_CATEGORIES } from '@/components/tickets/labels'
import { AnnouncementsTab } from './announcements'
import { TicketCost } from './ticket-cost'

export default function TicketsPage() {
  const { readOnly } = useSession()
  const [params, setParams] = useSearchParams()
  const [newOpen, setNewOpen] = useState(false)
  const tab = params.get('tab') === 'announcements' ? 'announcements' : 'inbox'

  const config: InboxConfig = {
    key: 'tickets',
    list: (f) => api.tickets(f),
    get: api.ticket,
    reply: api.replyTicket,
    patch: api.patchTicket,
    categories: ORG_CATEGORIES,
    self: 'staff',
    allowInternal: true,
    assignable: true,
    propertyFilter: true,
    readOnly,
    emptyText: 'ไม่มีคำร้องในสถานะนี้',
    paneExtra: (t) => <TicketCost ticket={t} />,
    toolbar: (
      <Button size="sm" onClick={() => setNewOpen(true)} disabled={readOnly}>
        <Plus /> บันทึกคำร้อง
      </Button>
    ),
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setParams(v === 'announcements' ? { tab: v } : {}, { replace: true })}
      className="gap-4"
    >
      <TabsList variant="line" className="w-full justify-start border-b">
        <TabsTrigger value="inbox" className="flex-none px-3">
          <Wrench /> แจ้งซ่อม & ติดต่อ
        </TabsTrigger>
        <TabsTrigger value="announcements" className="flex-none px-3">
          <Megaphone /> ประกาศ
        </TabsTrigger>
      </TabsList>
      <TabsContent value="inbox">
        <TicketInbox config={config} />
        <NewTicketDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          title="บันทึกคำร้อง / แจ้งซ่อม"
          description="บันทึกแทนผู้เช่าที่แจ้งทางโทรศัพท์หรือ LINE หรือบันทึกงานซ่อมบำรุงของทีม"
          categories={ORG_CATEGORIES}
          withUnit
          create={api.createTicket}
          onCreated={async (t) => {
            await invalidate('tickets', 'dashboard')
            setParams({ t: String(t.id) })
          }}
        />
      </TabsContent>
      <TabsContent value="announcements">
        <AnnouncementsTab />
      </TabsContent>
    </Tabs>
  )
}
