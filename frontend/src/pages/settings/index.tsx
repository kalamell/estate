import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Building2, Cable, FileText, MessageCircle, Palette, ScanLine, ShieldCheck, Users } from 'lucide-react'
import { useSession } from '@/contexts/session'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OrgTab } from './org-tab'
import { MembersTab } from './members-tab'
import { IssuerTab } from './issuer-tab'
import { AppearanceTab } from './appearance-tab'
import { LineTab } from './line-tab'
import { PrivacyTab } from './privacy-tab'
import { SlipTab } from './slip-tab'

const TABS = ['org', 'issuer', 'appearance', 'line', 'slip', 'privacy', 'members'] as const
const ADMIN_TABS: readonly Tab[] = ['line', 'slip', 'privacy']
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
      {canManage && (
        <Link
          to="/integrations"
          className="flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50"
        >
          <Cable className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">การเชื่อมต่อ</span>
            <span className="text-muted-foreground"> — ดูสถานะ LINE OA ตรวจสลิป พร้อมเพย์ และปฏิทิน OTA ในหน้าเดียว</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
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
          <TabsTrigger value="slip" className="px-3">
            <ScanLine /> ตรวจสลิป
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
        <TabsContent value="slip">
          <SlipTab />
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
