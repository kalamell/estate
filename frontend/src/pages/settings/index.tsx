import { Navigate, useSearchParams } from 'react-router-dom'
import { Building2, FileText, MessageCircle, Palette, ShieldCheck, Users } from 'lucide-react'
import { useSession } from '@/contexts/session'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OrgTab } from './org-tab'
import { MembersTab } from './members-tab'
import { IssuerTab } from './issuer-tab'
import { AppearanceTab } from './appearance-tab'
import { LineTab } from './line-tab'
import { PrivacyTab } from './privacy-tab'

const TABS = ['org', 'issuer', 'appearance', 'line', 'privacy', 'members'] as const
const ADMIN_TABS: readonly Tab[] = ['line', 'privacy']
type Tab = (typeof TABS)[number]

export default function SettingsPage() {
  const { canManage } = useSession()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  // แท็บแพ็กเกจเดิมย้ายไปหน้า แพ็กเกจ & การชำระเงิน
  if (raw === 'package') return <Navigate to="/billing" replace />
  const allowed = TABS.filter((t) => canManage || !ADMIN_TABS.includes(t))
  const tab: Tab = (allowed as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'org'
  return (
    <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-6">
      <TabsList className="h-10 w-full justify-start overflow-x-auto sm:w-fit">
        <TabsTrigger value="org" className="px-3">
          <Building2 /> องค์กร
        </TabsTrigger>
        <TabsTrigger value="issuer" className="px-3">
          <FileText /> ข้อมูลผู้ออกเอกสาร & ภาษี
        </TabsTrigger>
        <TabsTrigger value="appearance" className="px-3">
          <Palette /> รูปลักษณ์
        </TabsTrigger>
        {canManage && (
          <TabsTrigger value="line" className="px-3">
            <MessageCircle /> LINE OA
          </TabsTrigger>
        )}
        {canManage && (
          <TabsTrigger value="privacy" className="px-3">
            <ShieldCheck /> ความเป็นส่วนตัว (PDPA)
          </TabsTrigger>
        )}
        <TabsTrigger value="members" className="px-3">
          <Users /> สมาชิก
        </TabsTrigger>
      </TabsList>
      <TabsContent value="org">
        <OrgTab />
      </TabsContent>
      <TabsContent value="issuer">
        <IssuerTab />
      </TabsContent>
      <TabsContent value="appearance">
        <AppearanceTab />
      </TabsContent>
      {canManage && (
        <TabsContent value="line">
          <LineTab />
        </TabsContent>
      )}
      {canManage && (
        <TabsContent value="privacy">
          <PrivacyTab />
        </TabsContent>
      )}
      <TabsContent value="members">
        <MembersTab />
      </TabsContent>
    </Tabs>
  )
}
