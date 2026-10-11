// ส่วนประกอบ UI ที่เกี่ยวกับ LINE OA (ใช้ร่วมหลายหน้า)
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Check, Copy, Loader2, RefreshCw, Send, Share2, Unlink } from 'lucide-react'
import { api, type Tenant } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { addFriendUrl, expiresIn } from '@/lib/line'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { QrSvg } from '@/components/qr'
import { ToneBadge } from '@/components/common'
import { useConfirm } from '@/components/confirm'

/** ไอคอน LINE (ฟองคำพูดในสี่เหลี่ยมเขียว) */
export function LineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-4 shrink-0', className)}>
      <rect width="24" height="24" rx="5.5" fill="#06C755" />
      <path
        fill="#fff"
        d="M12 5.2c-4.3 0-7.8 2.8-7.8 6.3 0 3.1 2.8 5.7 6.5 6.2.3.1.6.2.7.4.1.2.1.5 0 .8l-.1.7c0 .2-.2.8.7.4.9-.4 4.8-2.8 6.5-4.8 1.2-1.3 1.8-2.6 1.8-4 0-3.2-3.5-6-7.8-6Z"
      />
      <path
        fill="#06C755"
        d="M8.6 13.4H7c-.2 0-.4-.2-.4-.4V9.9c0-.2.2-.4.4-.4s.4.2.4.4v2.7h1.2c.2 0 .4.2.4.4s-.2.4-.4.4Zm1.4-.4c0 .2-.2.4-.4.4s-.4-.2-.4-.4V9.9c0-.2.2-.4.4-.4s.4.2.4.4V13Zm3.8 0c0 .2-.1.3-.3.4h-.1c-.1 0-.2-.1-.3-.2l-1.6-2.2V13c0 .2-.2.4-.4.4s-.4-.2-.4-.4V9.9c0-.2.1-.3.3-.4h.1c.1 0 .2.1.3.2l1.6 2.2V9.9c0-.2.2-.4.4-.4s.4.2.4.4V13Zm2.6-1.9c.2 0 .4.2.4.4s-.2.4-.4.4h-1.2v.7h1.2c.2 0 .4.2.4.4s-.2.4-.4.4h-1.6c-.2 0-.4-.2-.4-.4V9.9c0-.2.2-.4.4-.4h1.6c.2 0 .4.2.4.4s-.2.4-.4.4h-1.2v.7h1.2Z"
      />
    </svg>
  )
}

/** ป้ายสถานะ LINE ของผู้เช่า */
export function TenantLineBadge({ tenant, className }: { tenant: Tenant; className?: string }) {
  if (tenant.line_linked)
    return (
      <ToneBadge tone="green" className={cn('max-w-full gap-1.5', className)}>
        <LineIcon className="size-3.5" />
        <span className="truncate">เชื่อมแล้ว{tenant.line_display_name ? ` · ${tenant.line_display_name}` : ''}</span>
      </ToneBadge>
    )
  return (
    <ToneBadge tone="grey" className={cn('gap-1.5', className)}>
      <LineIcon className="size-3.5 opacity-50 grayscale" />
      ยังไม่เชื่อม LINE
    </ToneBadge>
  )
}

/** คัดลอกข้อความ พร้อมสถานะ "คัดลอกแล้ว" ชั่วคราว */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback(async (text: string, key = text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }, [])
  return { copied, copy }
}

/** คำแนะนำเมื่อยังไม่ได้ตั้งค่า LINE OA */
export function LineSetupHint({ className, children }: { className?: string; children?: ReactNode }) {
  const { canManage } = useSession()
  return (
    <div className={cn('flex items-start gap-2.5 rounded-md border border-dashed bg-muted/40 px-3 py-2.5 text-sm', className)}>
      <LineIcon className="mt-0.5" />
      <div className="text-muted-foreground">
        {children ?? 'ยังไม่ได้ตั้งค่า LINE OA — ตั้งค่าเพื่อส่งบิล ใบเสร็จ และแจ้งเตือนให้ผู้เช่าทาง LINE อัตโนมัติ'}{' '}
        {canManage ? (
          <Link to="/settings?tab=line" className="font-medium whitespace-nowrap text-primary hover:underline">
            ไปที่ตั้งค่า → LINE OA
          </Link>
        ) : (
          <span className="whitespace-nowrap">(ติดต่อเจ้าของหรือผู้ดูแลองค์กร)</span>
        )}
      </div>
    </div>
  )
}

/** ส่งลิงก์พอร์ทัลทาง LINE / ยกเลิกการเชื่อม */
export function useTenantLineActions() {
  const confirm = useConfirm()
  const sendPortal = useMutation({
    mutationFn: (t: Tenant) => api.sendTenantPortalLine(t.id),
    onSuccess: (_r, t) => toast.success(`ส่งลิงก์พอร์ทัลให้ ${t.full_name} ทาง LINE แล้ว`),
  })
  const unlink = useMutation({
    mutationFn: (t: Tenant) => api.unlinkTenantLine(t.id),
    onSuccess: async (_r, t) => {
      toast.success(`ยกเลิกการเชื่อม LINE ของ ${t.full_name} แล้ว`)
      await invalidate('tenants', 'org-info')
    },
  })
  const askUnlink = async (t: Tenant) => {
    if (
      await confirm({
        title: `ยกเลิกการเชื่อม LINE ของ ${t.full_name}?`,
        description: 'ผู้เช่าจะไม่ได้รับบิลและการแจ้งเตือนทาง LINE อีก จนกว่าจะเชื่อมบัญชีใหม่',
        confirmText: 'ยกเลิกการเชื่อม',
        destructive: true,
      })
    )
      unlink.mutate(t)
  }
  return { sendPortal, unlink, askUnlink }
}

// ===================== Dialog เชื่อม LINE ของผู้เช่า =====================

export function LineLinkDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto sm:max-w-2xl">
        {tenant && <LineLinkBody key={tenant.id} initial={tenant} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function LineLinkBody({ initial, onClose }: { initial: Tenant; onClose: () => void }) {
  const { line, org, readOnly } = useSession()
  const { copied, copy } = useCopy()
  const { sendPortal, askUnlink, unlink } = useTenantLineActions()
  // โพลรายชื่อผู้เช่าขณะเปิดอยู่ เพื่อรู้ทันทีเมื่อผู้เช่าเชื่อมสำเร็จ
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: api.tenants, refetchInterval: 4000, meta: { silent: true } })
  const tenant = tenants.data?.find((t) => t.id === initial.id) ?? initial
  const [wasLinked] = useState(!!initial.line_linked)
  const [relink, setRelink] = useState(false)

  const gen = useMutation({ mutationFn: () => api.tenantLineLink(initial.id), meta: { silent: true } })
  const started = useRef(false)
  useEffect(() => {
    if (started.current || initial.line_linked || readOnly) return
    started.current = true
    gen.mutate()
  }, [gen, initial.line_linked, readOnly])

  // นาฬิกาสำหรับนับถอยหลังวันหมดอายุ
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const justLinked = !!tenant.line_linked && !wasLinked
  useEffect(() => {
    if (!justLinked) return
    toast.success(`${tenant.full_name} เชื่อม LINE สำเร็จ`)
    void invalidate('org-info')
  }, [justLinked, tenant.full_name])
  const showLinked = !!tenant.line_linked && !relink

  if (showLinked)
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LineIcon className="size-5" /> LINE ของ {tenant.full_name}
          </DialogTitle>
          <DialogDescription>ผู้เช่าจะได้รับบิล ใบเสร็จ และการแจ้งเตือนทาง LINE โดยอัตโนมัติ</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-success/5 px-4 py-8 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <div className="text-lg font-semibold">{justLinked ? 'เชื่อมบัญชีสำเร็จ' : 'เชื่อม LINE แล้ว'}</div>
          <div className="text-sm text-muted-foreground">
            {tenant.line_display_name ? `ชื่อใน LINE: ${tenant.line_display_name}` : 'บัญชี LINE ของผู้เช่า'}
            {tenant.line_linked_at && ` · ตั้งแต่ ${new Date(tenant.line_linked_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}`}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={readOnly || unlink.isPending}
            onClick={() => void askUnlink(tenant)}
          >
            <Unlink /> ยกเลิกการเชื่อม
          </Button>
          <Button
            variant="outline"
            className="sm:ml-auto"
            disabled={readOnly}
            onClick={() => {
              setRelink(true)
              gen.mutate()
            }}
          >
            <RefreshCw /> เชื่อมบัญชีใหม่
          </Button>
          <Button disabled={readOnly || sendPortal.isPending} onClick={() => sendPortal.mutate(tenant)}>
            {sendPortal.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            ส่งลิงก์พอร์ทัลทาง LINE
          </Button>
        </div>
      </>
    )

  const code = gen.data
  const friendUrl = code?.add_friend_url ?? addFriendUrl(line)
  const basicId = line?.basic_id
  const shareText = code
    ? [
        `สวัสดีคุณ${tenant.full_name} รับบิลและการแจ้งเตือนจาก ${org?.name ?? 'เรา'} ทาง LINE ได้ง่ายๆ`,
        friendUrl ? `1) แอดเพื่อน: ${friendUrl}` : basicId ? `1) แอดเพื่อน LINE: ${basicId}` : '',
        `2) เชื่อมบัญชี (กดแล้วกดส่งข้อความ): ${code.link_url}`,
        `หรือพิมพ์ "เชื่อมบัญชี ${code.code}" ในแชท`,
      ]
        .filter(Boolean)
        .join('\n')
    : ''
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    window.open(`https://line.me/R/share?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener')
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <LineIcon className="size-5" /> เชื่อม LINE · {tenant.full_name}
        </DialogTitle>
        <DialogDescription>ให้ผู้เช่าเปิดแอป LINE บนมือถือ แล้วสแกน QR ทีละขั้น</DialogDescription>
      </DialogHeader>

      {gen.isError ? (
        <div className="grid gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{(gen.error as Error).message || 'สร้างโค้ดเชื่อมบัญชีไม่สำเร็จ'}</p>
          <Button variant="outline" className="w-fit" onClick={() => gen.mutate()}>
            <RefreshCw /> ลองใหม่
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-5">
            <QrStep
              n={1}
              title="แอดเพื่อน"
              caption={basicId ? `เพิ่ม ${basicId} เป็นเพื่อน` : 'เพิ่ม LINE OA เป็นเพื่อน'}
              url={friendUrl}
              loading={gen.isPending}
              copied={copied === 'friend'}
              onCopy={() => friendUrl && copy(friendUrl, 'friend')}
            />
            <QrStep
              n={2}
              title="เชื่อมบัญชี"
              caption="สแกนแล้วกด “ส่ง” ข้อความในแชท"
              url={code?.link_url ?? null}
              loading={gen.isPending}
              copied={copied === 'link'}
              onCopy={() => code && copy(code.link_url, 'link')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-muted/40 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">หรือพิมพ์ข้อความนี้ในแชท LINE OA</div>
              {code ? (
                <div className="font-mono text-lg font-semibold tracking-wider">เชื่อมบัญชี {code.code}</div>
              ) : (
                <Skeleton className="mt-1 h-6 w-44" />
              )}
            </div>
            {code && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  หมดอายุ{' '}
                  {new Date(code.expires_at).toLocaleString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  ({expiresIn(code.expires_at, now)})
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="คัดลอกโค้ด"
                  onClick={() => copy(`เชื่อมบัญชี ${code.code}`, 'code')}
                >
                  {copied === 'code' ? <Check /> : <Copy />}
                </Button>
              </div>
            )}
          </div>

          <ol className="grid gap-2 text-sm">
            {[
              'สแกน QR แรกด้วยกล้องมือถือหรือแอป LINE แล้วกด “เพิ่มเพื่อน”',
              'สแกน QR ที่สอง แอป LINE จะเปิดแชทพร้อมข้อความ “เชื่อมบัญชี …” — กดส่งได้เลย',
              'ระบบจะตอบกลับว่าเชื่อมสำเร็จ หน้านี้จะเปลี่ยนเป็น “เชื่อมแล้ว” อัตโนมัติ',
            ].map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold tabular-nums">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row">
        <Button variant="ghost" onClick={onClose}>
          ปิด
        </Button>
        <Button variant="outline" className="sm:ml-auto" disabled={gen.isPending || readOnly} onClick={() => gen.mutate()}>
          {gen.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          สร้างโค้ดใหม่
        </Button>
        <Button disabled={!code} onClick={() => void share()}>
          <Share2 /> ส่งให้ผู้เช่า
        </Button>
      </div>
    </>
  )
}

function QrStep({
  n,
  title,
  caption,
  url,
  loading,
  copied,
  onCopy,
}: {
  n: number
  title: string
  caption: string
  url: string | null
  loading: boolean
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 rounded-lg border p-2 text-center sm:p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
        {title}
      </div>
      <div className="w-full max-w-52 rounded-md border bg-white p-1.5">
        {url ? (
          <QrSvg value={url} label={`QR ${title}`} />
        ) : loading ? (
          <Skeleton className="aspect-square w-full" />
        ) : (
          <div className="grid aspect-square place-items-center p-2 text-xs text-neutral-500">ไม่มีลิงก์ — ตั้ง Basic ID ก่อน</div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{caption}</p>
      <Button variant="ghost" size="xs" disabled={!url} onClick={onCopy}>
        {copied ? <Check /> : <Copy />} คัดลอกลิงก์
      </Button>
    </div>
  )
}
