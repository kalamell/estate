import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Send } from 'lucide-react'
import { api, type Tenant } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { portalUrl } from '@/lib/docs'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/confirm'
import { QrSvg } from '@/components/qr'

export function PortalLinkDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {tenant && <PortalLink key={tenant.id} tenant={tenant} />}
      </DialogContent>
    </Dialog>
  )
}

function PortalLink({ tenant }: { tenant: Tenant }) {
  const { readOnly, canManage, org } = useSession()
  const confirm = useConfirm()
  const [token, setToken] = useState(tenant.portal_token)
  const [copied, setCopied] = useState(false)

  const regen = useMutation({
    mutationFn: () => api.regenPortalToken(tenant.id),
    onSuccess: async (r) => {
      setToken(r.portal_token)
      toast.success('สร้างลิงก์ใหม่แล้ว — ลิงก์เดิมใช้ไม่ได้อีกต่อไป')
      await invalidate('tenants')
    },
  })

  const url = token ? portalUrl(token) : ''
  const message = `สวัสดีคุณ ${tenant.full_name} ดูบิล ใบเสร็จ และแจ้งซ่อมกับ ${org?.name ?? 'เรา'} ได้ที่ลิงก์นี้`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>ลิงก์พอร์ทัลผู้เช่า</DialogTitle>
        <DialogDescription>
          {tenant.full_name} ใช้ลิงก์นี้ดูบิล ใบเสร็จ ประกาศ และแจ้งซ่อมได้โดยไม่ต้องสมัครสมาชิก
        </DialogDescription>
      </DialogHeader>
      {token ? (
        <div className="grid gap-4">
          <div className="mx-auto w-48 rounded-md border bg-white p-2">
            <QrSvg value={url} label="QR code ลิงก์พอร์ทัล" />
          </div>
          <div className="flex gap-2">
            <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="ลิงก์พอร์ทัล" className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copy} aria-label="คัดลอกลิงก์">
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild>
              <a
                href={`https://line.me/R/share?text=${encodeURIComponent(`${message}\n${url}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Send /> ส่งทาง LINE
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink /> เปิดดู
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          ยังไม่มีลิงก์ — กด "สร้างลิงก์ใหม่"
        </p>
      )}
      {canManage && (
        <div className="flex items-center gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">หากลิงก์รั่วไหล ให้สร้างใหม่ ลิงก์เดิมจะใช้งานไม่ได้ทันที</p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto shrink-0"
            disabled={readOnly || regen.isPending}
            onClick={async () => {
              if (
                !token ||
                (await confirm({
                  title: 'สร้างลิงก์ใหม่?',
                  description: 'ลิงก์เดิมที่ส่งให้ผู้เช่าจะใช้งานไม่ได้อีก ต้องส่งลิงก์ใหม่ให้ผู้เช่า',
                  confirmText: 'สร้างลิงก์ใหม่',
                  destructive: true,
                }))
              )
                regen.mutate()
            }}
          >
            {regen.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            สร้างลิงก์ใหม่
          </Button>
        </div>
      )}
    </>
  )
}
