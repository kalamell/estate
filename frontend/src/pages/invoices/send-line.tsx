// ปุ่ม "ส่งทาง LINE" สำหรับใบแจ้งหนี้/ใบเสร็จ
import { useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LineIcon } from '@/components/line'

/** ชื่อผู้เช่าที่เชื่อม LINE แล้ว (null = ยังโหลดไม่เสร็จ → ไม่ปิดปุ่ม ให้ backend ตัดสิน) */
export function useLinkedTenantNames() {
  const { data } = useQuery({ queryKey: ['tenants'], queryFn: api.tenants, meta: { silent: true } })
  return useMemo(
    () => (data ? new Set(data.filter((t) => t.line_linked).map((t) => t.full_name)) : null),
    [data],
  )
}

export function SendLineButton({
  kind,
  id,
  reason,
  withLabel,
  className,
}: {
  kind: 'invoice' | 'receipt'
  id: number
  /** เหตุผลที่ส่งไม่ได้ (ปิดปุ่ม + tooltip) */
  reason?: string | null
  withLabel?: boolean
  className?: string
}) {
  const { readOnly, lineReady } = useSession()
  const send = useMutation({
    mutationFn: () => (kind === 'invoice' ? api.sendInvoiceLine(id) : api.sendReceiptLine(id)),
    onSuccess: () => toast.success(kind === 'invoice' ? 'ส่งใบแจ้งหนี้ทาง LINE แล้ว' : 'ส่งใบเสร็จทาง LINE แล้ว'),
  })
  const why = !lineReady ? 'ยังไม่ได้ตั้งค่า LINE OA' : readOnly ? 'บัญชีอ่านได้อย่างเดียว' : reason
  const disabled = !!why || send.isPending
  const icon = send.isPending ? <Loader2 className="animate-spin" /> : <LineIcon className={why ? 'grayscale' : undefined} />
  const btn = withLabel ? (
    <Button variant="outline" disabled={disabled} onClick={() => send.mutate()} className={className}>
      {icon} ส่งทาง LINE
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      onClick={() => send.mutate()}
      aria-label="ส่งทาง LINE"
      className={className}
    >
      {icon}
    </Button>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span ห่อไว้เพื่อให้ tooltip ทำงานแม้ปุ่มถูกปิด */}
        <span className="inline-flex" tabIndex={disabled ? 0 : -1}>
          {btn}
        </span>
      </TooltipTrigger>
      <TooltipContent>{why ?? 'ส่งทาง LINE'}</TooltipContent>
    </Tooltip>
  )
}
