import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Megaphone, Pin, Plus, Trash2 } from 'lucide-react'
import { api, type AnnouncementInput } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { thDateLong } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Field, ToneBadge } from '@/components/common'
import { useConfirm } from '@/components/confirm'

export function AnnouncementsTab() {
  const { readOnly, canManage } = useSession()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['announcements'], queryFn: api.announcements })
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteAnnouncement(id),
    onSuccess: async () => {
      toast.success('ลบประกาศแล้ว')
      await invalidate('announcements')
    },
  })
  const sorted = [...(data ?? [])].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at),
  )

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">ประกาศจะแสดงในพอร์ทัลผู้เช่าของโครงการที่เลือก</p>
        <Button className="ml-auto" onClick={() => setOpen(true)} disabled={readOnly}>
          <Plus /> สร้างประกาศ
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : !sorted.length ? (
        <Card>
          <EmptyState icon={Megaphone} title="ยังไม่มีประกาศ" description="เช่น แจ้งตัดน้ำ ปิดซ่อมลิฟต์ หรือกำหนดชำระค่าเช่า" />
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => (
            <Card key={a.id} className="gap-2 px-5 py-4">
              <div className="flex items-start gap-2">
                {a.pinned && <Pin className="mt-1 size-4 shrink-0 text-primary" aria-label="ปักหมุด" />}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{a.title}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <ToneBadge tone={a.property_id ? 'ink' : 'grey'}>{a.property_name || 'ทุกโครงการ'}</ToneBadge>
                    {thDateLong(a.created_at)}
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={readOnly}
                    aria-label="ลบประกาศ"
                    onClick={async () => {
                      if (await confirm({ title: `ลบประกาศ "${a.title}"?`, confirmText: 'ลบ', destructive: true }))
                        remove.mutate(a.id)
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{a.body}</p>
            </Card>
          ))}
        </div>
      )}
      <AnnouncementDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

const ALL = 'all'

function AnnouncementDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties, enabled: open })
  const [form, setForm] = useState({ property: ALL, title: '', body: '', pinned: false })
  const save = useMutation({
    mutationFn: () => {
      const b: AnnouncementInput = {
        property_id: form.property === ALL ? null : Number(form.property),
        title: form.title.trim(),
        body: form.body.trim(),
        pinned: form.pinned,
      }
      return api.createAnnouncement(b)
    },
    onSuccess: async () => {
      toast.success('เผยแพร่ประกาศแล้ว')
      setForm({ property: ALL, title: '', body: '', pinned: false })
      await invalidate('announcements')
      onOpenChange(false)
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (form.title.trim()) save.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>สร้างประกาศ</DialogTitle>
            <DialogDescription>ผู้เช่าจะเห็นประกาศในหน้าแรกของพอร์ทัล</DialogDescription>
          </DialogHeader>
          <Field label="แสดงที่" htmlFor="an-prop">
            <Select value={form.property} onValueChange={(v) => setForm((f) => ({ ...f, property: v }))}>
              <SelectTrigger id="an-prop" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทุกโครงการ</SelectItem>
                {properties.data?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="หัวข้อ" htmlFor="an-title">
            <Input id="an-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          </Field>
          <Field label="ข้อความ" htmlFor="an-body">
            <Textarea id="an-body" rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={form.pinned} onCheckedChange={(v) => setForm((f) => ({ ...f, pinned: v }))} />
            ปักหมุดไว้ด้านบน
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={!form.title.trim() || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              เผยแพร่
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
