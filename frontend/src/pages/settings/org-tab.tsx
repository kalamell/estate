import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { api, type Me, type OrgInfo } from '@/lib/api'
import { invalidate, queryClient } from '@/lib/query'
import { ORG_STATUS, ROLES, thDateLong } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Field } from '@/components/common'
import { orgLegalOf, orgPrivacyOf, orgThemeOf } from '@/lib/docs'

export function OrgTab() {
  const { orgInfo } = useSession()
  if (!orgInfo) return <Skeleton className="h-64 max-w-2xl rounded-xl" />
  return <OrgForm key={orgInfo.org.name} info={orgInfo} />
}

function OrgForm({ info: orgInfo }: { info: OrgInfo }) {
  const { canManage, readOnly, role } = useSession()
  const [name, setName] = useState(orgInfo.org.name)

  const save = useMutation({
    mutationFn: () => api.updateOrg({ ...orgLegalOf(orgInfo), ...orgPrivacyOf(orgInfo), name: name.trim(), theme: orgThemeOf(orgInfo) }),
    onSuccess: async (info) => {
      toast.success('บันทึกชื่อองค์กรแล้ว')
      queryClient.setQueryData<Me | null>(['me'], (me) =>
        me ? { ...me, orgs: me.orgs.map((o) => (o.id === info.org.id ? { ...o, name: info.org.name } : o)) } : me,
      )
      await invalidate('org-info')
    },
  })

  const st = ORG_STATUS[orgInfo.org.status]

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) save.mutate()
          }}
          className="grid gap-6"
        >
          <CardHeader>
            <CardTitle>ข้อมูลองค์กร</CardTitle>
            <CardDescription>ชื่อนี้จะแสดงในเมนูสลับองค์กรและเอกสารต่างๆ</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="ชื่อองค์กร" htmlFor="o-name" hint={!canManage ? 'เฉพาะเจ้าของหรือผู้ดูแลเท่านั้นที่แก้ไขได้' : undefined}>
              <Input id="o-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage || readOnly} required />
            </Field>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">สถานะ</dt>
                <dd className="mt-1">
                  <Badge variant="outline" className={st?.badge}>{st?.label ?? orgInfo.org.status}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">บทบาทของคุณ</dt>
                <dd className="mt-1 font-medium">{role ? ROLES[role] : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">สร้างเมื่อ</dt>
                <dd className="mt-1 font-medium">{thDateLong(orgInfo.org.created_at)}</dd>
              </div>
            </dl>
          </CardContent>
          {canManage && (
            <CardFooter className="justify-end border-t pt-6">
              <Button type="submit" disabled={readOnly || save.isPending || !name.trim() || name.trim() === orgInfo.org.name}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                บันทึก
              </Button>
            </CardFooter>
          )}
        </form>
      </Card>
    </div>
  )
}
