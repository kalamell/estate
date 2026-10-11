import { useSearchParams } from 'react-router-dom'
import { FileText, Receipt } from 'lucide-react'
import { useSession } from '@/contexts/session'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UpsellCard } from '@/components/common'
import { InvoicesTab } from './invoices-tab'
import { ReceiptsTab } from './receipts-tab'

export default function InvoicesPage() {
  const { features, featuresLoaded } = useSession()
  const [params, setParams] = useSearchParams()
  if (featuresLoaded && !features.invoices)
    return (
      <UpsellCard
        title="ระบบออกบิลไม่รวมในแพ็กเกจปัจจุบัน"
        description="อัปเกรดแพ็กเกจเพื่อออกใบแจ้งหนี้อัตโนมัติ คำนวณค่าน้ำค่าไฟ ออกใบเสร็จ และรับชำระผ่าน PromptPay QR"
      />
    )
  const tab = params.get('tab') === 'receipts' ? 'receipts' : 'invoices'
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setParams(v === 'receipts' ? { tab: v } : {}, { replace: true })}
      className="gap-5"
    >
      <TabsList variant="line" className="w-full justify-start border-b">
        <TabsTrigger value="invoices" className="flex-none px-3">
          <FileText /> ใบแจ้งหนี้
        </TabsTrigger>
        <TabsTrigger value="receipts" className="flex-none px-3">
          <Receipt /> ใบเสร็จรับเงิน
        </TabsTrigger>
      </TabsList>
      <TabsContent value="invoices">
        <InvoicesTab initialStatus={params.get('status') ?? undefined} />
      </TabsContent>
      <TabsContent value="receipts">
        <ReceiptsTab />
      </TabsContent>
    </Tabs>
  )
}
