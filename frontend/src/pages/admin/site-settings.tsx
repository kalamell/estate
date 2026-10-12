// ตั้งค่าหน้าแนะนำระบบ (หน้าแรกสาธารณะ) — ตอนนี้มีลิงก์คลิปแนะนำระบบ (YouTube / Vimeo)
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Field } from '@/components/common'
import { VideoFacade } from '@/pages/landing/video'

export function LandingSettingsCard() {
  const q = useQuery({ queryKey: ['admin', 'site'], queryFn: api.admin.site })
  const saved = q.data?.promo_video_url ?? ''
  const [url, setUrl] = useState<string | null>(null)
  const value = url ?? saved
  const dirty = value.trim() !== saved

  const save = useMutation({
    mutationFn: (promo_video_url: string) => api.admin.updateSite({ promo_video_url }),
    onSuccess: async (r) => {
      setUrl(null)
      toast.success(r.promo_video ? 'บันทึกคลิปแล้ว หน้าแรกแสดงคลิปนี้' : 'นำคลิปออกจากหน้าแรกแล้ว')
      await invalidate('admin', 'public-site')
    },
  })
  const video = q.data?.promo_video

  return (
    <Card>
      <CardHeader>
        <CardTitle>หน้าแนะนำระบบ</CardTitle>
        <CardDescription>คลิปแนะนำที่แสดงบนหน้าแรกต่อจากส่วนหัว เว้นว่างไว้ถ้าไม่ต้องการแสดง</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
        {q.isLoading ? (
          <Skeleton className="h-16" />
        ) : (
          <form
            className="grid content-start gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (dirty) save.mutate(value.trim())
            }}
          >
            <Field
              label="ลิงก์คลิป YouTube หรือ Vimeo"
              htmlFor="site-video"
              hint="อัปคลิปขึ้น YouTube (ตั้งเป็นไม่เป็นสาธารณะได้) แล้ววางลิงก์"
            >
              <Input
                id="site-video"
                type="url"
                inputMode="url"
                value={value}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtu.be/…"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
              </Button>
              {dirty && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setUrl(null)} disabled={save.isPending}>
                  ยกเลิก
                </Button>
              )}
              {!!saved && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => save.mutate('')}
                  disabled={save.isPending}
                >
                  <Trash2 /> นำคลิปออก
                </Button>
              )}
            </div>
          </form>
        )}
        <div className="grid content-start gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">ตัวอย่างบนหน้าแรก{dirty && ' (คลิปที่บันทึกไว้)'}</p>
          {video ? (
            <VideoFacade video={video} />
          ) : (
            <div className="grid aspect-video place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
              ยังไม่ได้ตั้งคลิป — หน้าแรกไม่แสดงส่วนนี้
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
