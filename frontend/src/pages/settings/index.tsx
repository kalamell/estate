import { useSearchParams } from 'react-router-dom'
import { Building2, Package, Users } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OrgTab } from './org-tab'
import { PackageTab } from './package-tab'
import { MembersTab } from './members-tab'

const TABS = ['org', 'package', 'members'] as const
type Tab = (typeof TABS)[number]

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'org'
  return (
    <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-6">
      <TabsList className="h-10 w-full sm:w-fit">
        <TabsTrigger value="org" className="px-3">
          <Building2 /> องค์กร
        </TabsTrigger>
        <TabsTrigger value="package" className="px-3">
          <Package /> แพ็กเกจ & การใช้งาน
        </TabsTrigger>
        <TabsTrigger value="members" className="px-3">
          <Users /> สมาชิก
        </TabsTrigger>
      </TabsList>
      <TabsContent value="org">
        <OrgTab />
      </TabsContent>
      <TabsContent value="package">
        <PackageTab />
      </TabsContent>
      <TabsContent value="members">
        <MembersTab />
      </TabsContent>
    </Tabs>
  )
}
