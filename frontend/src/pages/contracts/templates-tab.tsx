// แม่แบบสัญญา — แก้ไขข้อความพร้อมตัวแปร {{...}} (เจ้าของ/ผู้ดูแลแก้ไขได้)
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Braces, FilePlus2, Files, Loader2, Save, Scale, Star, Trash2, TriangleAlert } from 'lucide-react'
import { api, type ContractKind, type ContractPlaceholder, type ContractTemplate } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { CONTRACT_KINDS, LAWYER_NOTE, placeholdersIn } from '@/lib/contracts'
import { sqlUtc } from '@/lib/billing'
import { timeAgo } from '@/lib/docs'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Field, ToneBadge } from '@/components/common'
import { useConfirm } from '@/components/confirm'

const NEW = 'new'

export function TemplatesTab() {
  const { canManage, readOnly } = useSession()
  const q = useQuery({ queryKey: ['contract-templates'], queryFn: api.contractTemplates })
  const [selected, setSelected] = useState<number | typeof NEW | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const templates = q.data?.templates ?? []
  const current: ContractTemplate | null =
    selected === NEW ? null : (templates.find((t) => t.id === selected) ?? templates[0] ?? null)
  const editing = selected === NEW ? NEW : (current?.id ?? null)
  const canEdit = canManage && !readOnly

  const pick = (v: number | typeof NEW) => {
    setSelected(v)
    // มือถือ: เลื่อนลงไปที่ตัวแก้ไข
    if (window.matchMedia('(max-width: 1023px)').matches)
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Scale />
        <AlertTitle>{LAWYER_NOTE}</AlertTitle>
        <AlertDescription>
          แม่แบบตั้งต้น (ไทยและอังกฤษ) เป็นตัวอย่างเพื่อเริ่มต้นใช้งาน ปรับข้อความให้ตรงกับเงื่อนไขของคุณ
          และให้ผู้เชี่ยวชาญด้านกฎหมายตรวจทานก่อนใช้กับผู้เช่าจริง
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2">
          {canEdit && (
            <Button variant="outline" className="h-10 w-full sm:h-9" onClick={() => pick(NEW)}>
              <FilePlus2 /> แม่แบบใหม่
            </Button>
          )}
          {q.isLoading ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : (
            <Card className="gap-0 overflow-hidden py-0">
              <ul className="divide-y">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => pick(t.id)}
                      aria-current={editing === t.id ? 'true' : undefined}
                      className={cn(
                        'grid w-full gap-0.5 px-4 py-3 text-left hover:bg-muted/40',
                        editing === t.id && 'bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]',
                      )}
                    >
                      <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-sm font-medium">{t.name}</span>
                        {t.is_default && <Star className="mt-0.5 size-3.5 shrink-0 fill-primary text-primary" aria-label="ค่าเริ่มต้น" />}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {CONTRACT_KINDS[t.kind] ?? t.kind} · แก้ไข {timeAgo(sqlUtc(t.updated_at))}
                      </span>
                    </button>
                  </li>
                ))}
                {selected === NEW && (
                  <li className="bg-primary/5 px-4 py-3 text-sm font-medium shadow-[inset_3px_0_0_var(--primary)]">
                    แม่แบบใหม่ (ยังไม่บันทึก)
                  </li>
                )}
              </ul>
            </Card>
          )}
        </div>

        <div ref={editorRef} className="scroll-mt-4">
          {q.isLoading ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : editing == null ? (
            <Card className="grid place-items-center py-16 text-sm text-muted-foreground">
              <Files className="size-6" />
              เลือกแม่แบบเพื่อแก้ไข
            </Card>
          ) : (
            <TemplateEditor
              key={editing}
              template={current && editing !== NEW ? current : null}
              placeholders={q.data?.placeholders ?? []}
              canEdit={canEdit}
              onSaved={(t) => setSelected(t.id)}
              onDeleted={() => setSelected(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function TemplateEditor({
  template,
  placeholders,
  canEdit,
  onSaved,
  onDeleted,
}: {
  template: ContractTemplate | null
  placeholders: ContractPlaceholder[]
  canEdit: boolean
  onSaved: (t: ContractTemplate) => void
  onDeleted: () => void
}) {
  const confirm = useConfirm()
  const [name, setName] = useState(template?.name ?? '')
  const [kind, setKind] = useState<ContractKind>(template?.kind ?? 'lease')
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false)
  const [body, setBody] = useState(template?.body ?? '')
  const ta = useRef<HTMLTextAreaElement>(null)
  const known = useMemo(() => new Set(placeholders.map((p) => p.key)), [placeholders])
  const unknown = placeholdersIn(body).filter((k) => !known.has(k))
  const dirty =
    !template ||
    name !== template.name ||
    kind !== template.kind ||
    isDefault !== template.is_default ||
    body !== template.body

  const save = useMutation({
    mutationFn: () => api.saveContractTemplate({ id: template?.id, name: name.trim(), kind, body, is_default: isDefault }),
    onSuccess: async (t) => {
      toast.success('บันทึกแม่แบบแล้ว')
      await invalidate('contract-templates')
      onSaved(t)
    },
  })
  const remove = useMutation({
    mutationFn: () => api.deleteContractTemplate(template!.id),
    onSuccess: async () => {
      toast.success('ลบแม่แบบแล้ว')
      await invalidate('contract-templates')
      onDeleted()
    },
  })

  const insert = (key: string) => {
    const token = `{{${key}}}`
    const el = ta.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? start
    setBody(body.slice(0, start) + token + body.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <Card className="gap-0 py-0">
      <form
        className="grid gap-4 p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || !body.trim()) return toast.error('กรุณาระบุชื่อและเนื้อหาแม่แบบ')
          if (unknown.length) return toast.error(`ตัวแปรที่ไม่รู้จัก: ${unknown.map((k) => `{{${k}}}`).join(' ')}`)
          save.mutate()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Field label="ชื่อแม่แบบ" htmlFor="tp-name" hint="ชื่อแรกก่อนวงเล็บใช้เป็นชื่อสัญญา">
            <Input id="tp-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} required />
          </Field>
          <Field label="ประเภท" htmlFor="tp-kind">
            <Select value={kind} onValueChange={(v) => setKind(v as ContractKind)} disabled={!canEdit}>
              <SelectTrigger id="tp-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CONTRACT_KINDS) as ContractKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {CONTRACT_KINDS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-3 rounded-md border px-3 py-2.5">
          <Switch checked={isDefault} onCheckedChange={setIsDefault} disabled={!canEdit} />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">ใช้เป็นแม่แบบเริ่มต้น</span>
            <span className="text-xs text-muted-foreground">เลือกให้อัตโนมัติเมื่อสร้างสัญญาใหม่</span>
          </span>
          <Star className={cn('ml-auto size-4', isDefault ? 'fill-primary text-primary' : 'text-muted-foreground')} />
        </label>

        {canEdit && (
          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Braces className="size-3.5" /> ตัวแปร — แตะเพื่อแทรกที่ตำแหน่งเคอร์เซอร์
            </div>
            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-muted/30 p-2">
              {placeholders.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(p.key)}
                  title={`{{${p.key}}}`}
                  className="inline-flex h-7 items-center gap-1.5 rounded-sm border bg-card px-2 text-xs hover:border-primary/40 hover:bg-primary/5"
                >
                  {p.label}
                  <span className="font-mono text-[10px] text-muted-foreground">{p.key}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="เนื้อหาสัญญา" htmlFor="tp-body" hint="เว้นบรรทัดว่างเพื่อขึ้นย่อหน้าใหม่ · บรรทัดที่ขึ้นต้นด้วย “ข้อ 1” หรือ “1.” จะเป็นหัวข้อ">
          <Textarea
            id="tp-body"
            ref={ta}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={!canEdit}
            rows={22}
            className="min-h-[50svh] text-sm leading-relaxed"
          />
        </Field>
        {unknown.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              ตัวแปรที่ไม่รู้จัก: <span className="font-mono">{unknown.map((k) => `{{${k}}}`).join(' ')}</span>
            </span>
          </div>
        )}

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            {template && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `ลบแม่แบบ “${template.name}”?`,
                      description: 'สัญญาที่สร้างจากแม่แบบนี้แล้วจะไม่ได้รับผลกระทบ',
                      confirmText: 'ลบแม่แบบ',
                      destructive: true,
                    })
                  )
                    remove.mutate()
                }}
              >
                <Trash2 /> ลบ
              </Button>
            )}
            {template && !dirty && <ToneBadge tone="grey">บันทึกแล้ว</ToneBadge>}
            <Button type="submit" className="ml-auto" disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              บันทึกแม่แบบ
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">เฉพาะเจ้าของหรือผู้ดูแลองค์กรแก้ไขแม่แบบได้</p>
        )}
      </form>
    </Card>
  )
}
