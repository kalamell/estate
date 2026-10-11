// หมวดรายจ่าย — เพิ่ม เปลี่ยนชื่อ ปิดใช้ (หมวดที่มีรายการแล้วลบไม่ได้ ให้ปิดใช้แทน)
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Loader2, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { ApiError, api, type ExpenseCategory } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState, ToneBadge } from '@/components/common'
import { useConfirm } from '@/components/confirm'

export function CategoriesTab() {
  const { readOnly } = useSession()
  const list = useQuery({ queryKey: ['expense-categories'], queryFn: api.expenseCategories })
  const [name, setName] = useState('')
  const add = useMutation({
    mutationFn: () => api.createExpenseCategory(name.trim()),
    onSuccess: async () => {
      toast.success('เพิ่มหมวดแล้ว')
      setName('')
      await invalidate('expense-categories')
    },
  })

  return (
    <div className="max-w-2xl space-y-5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) add.mutate()
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อหมวดใหม่ เช่น ค่าการตลาด"
          className="bg-card"
          aria-label="ชื่อหมวดใหม่"
          disabled={readOnly}
        />
        <Button type="submit" disabled={readOnly || !name.trim() || add.isPending}>
          {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />} เพิ่มหมวด
        </Button>
      </form>

      <Card className="gap-0 overflow-hidden py-0">
        {list.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !list.data?.length ? (
          <EmptyState icon={Tags} title="ยังไม่มีหมวด" />
        ) : (
          <ul className="divide-y">
            {list.data.map((c) => (
              <CategoryRow key={c.id} c={c} readOnly={readOnly} />
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        หมวดที่มีรายการแล้วลบไม่ได้ — ปิดใช้งานเพื่อซ่อนจากตัวเลือกตอนบันทึก รายการเดิมยังอยู่ในรายงาน
      </p>
    </div>
  )
}

function CategoryRow({ c, readOnly }: { c: ExpenseCategory; readOnly: boolean }) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(c.name)
  const update = useMutation({
    mutationFn: (b: { name: string; is_active: boolean }) => api.updateExpenseCategory(c.id, b),
    onSuccess: async () => {
      setEditing(false)
      await invalidate('expense-categories', 'expenses')
    },
  })
  const remove = useMutation({
    mutationFn: () => api.deleteExpenseCategory(c.id),
    meta: { silent: true },
    onSuccess: async () => {
      toast.success('ลบหมวดแล้ว')
      await invalidate('expense-categories')
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409)
        toast.error(e.message, {
          action: c.is_active
            ? { label: 'ปิดใช้งานแทน', onClick: () => update.mutate({ name: c.name, is_active: false }) }
            : undefined,
        })
      else toast.error((e as Error).message)
    },
  })

  return (
    <li className={cn('flex min-h-14 items-center gap-3 px-4 py-2', !c.is_active && 'bg-muted/30')}>
      {editing ? (
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) update.mutate({ name: name.trim(), is_active: c.is_active })
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="ชื่อหมวด" className="h-9" />
          <Button type="submit" size="icon" aria-label="บันทึกชื่อ" disabled={update.isPending}>
            <Check />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="ยกเลิก"
            onClick={() => {
              setName(c.name)
              setEditing(false)
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <div className={cn('truncate text-sm font-medium', !c.is_active && 'text-muted-foreground')}>{c.name}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {c.used ? `${c.used} รายการ` : 'ยังไม่มีรายการ'}
            </div>
          </div>
          {!c.is_active && <ToneBadge tone="grey">ปิดใช้</ToneBadge>}
          <Switch
            checked={c.is_active}
            onCheckedChange={(v) => update.mutate({ name: c.name, is_active: v })}
            disabled={readOnly || update.isPending}
            aria-label={c.is_active ? `ปิดใช้หมวด ${c.name}` : `เปิดใช้หมวด ${c.name}`}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`เปลี่ยนชื่อหมวด ${c.name}`}
            disabled={readOnly}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={c.used ? 0 : -1}>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`ลบหมวด ${c.name}`}
                  disabled={readOnly || c.used > 0 || remove.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `ลบหมวด “${c.name}”?`,
                        confirmText: 'ลบหมวด',
                        destructive: true,
                      })
                    )
                      remove.mutate()
                  }}
                >
                  <Trash2 />
                </Button>
              </span>
            </TooltipTrigger>
            {c.used > 0 && <TooltipContent>มีรายการอยู่ — ปิดใช้งานแทนการลบ</TooltipContent>}
          </Tooltip>
        </>
      )}
    </li>
  )
}
