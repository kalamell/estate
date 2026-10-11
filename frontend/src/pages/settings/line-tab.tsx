import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MessagesSquare,
  PlugZap,
  RefreshCw,
  Save,
  UserPlus,
} from 'lucide-react'
import { api, type LineBotInfo, type LineSettings, type LineSettingsInput } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { EMPTY_LINE, LINE_KIND_LABEL, addFriendUrl, lineStatus } from '@/lib/line'
import { dateTime } from '@/lib/docs'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, ToneBadge } from '@/components/common'
import { LineIcon, useCopy } from '@/components/line'

export function LineTab() {
  const { orgInfo } = useSession()
  if (!orgInfo) return <Skeleton className="h-96 max-w-5xl rounded-lg" />
  const line = orgInfo.org.line ?? EMPTY_LINE
  return <LineSettingsView key={orgInfo.org.id} line={line} />
}

const AUTOMATIONS: {
  k: 'auto_invoice' | 'auto_receipt' | 'auto_ticket_reply' | 'auto_remind' | 'auto_parcel'
  label: string
  hint: string
}[] = [
  { k: 'auto_invoice', label: 'ส่งบิลใหม่อัตโนมัติ', hint: 'เมื่อออกใบแจ้งหนี้ ผู้เช่าจะได้รับบิลพร้อม QR ชำระเงิน' },
  { k: 'auto_receipt', label: 'ส่งใบเสร็จหลังรับชำระ', hint: 'ส่งลิงก์ใบเสร็จทันทีเมื่อบันทึกการรับชำระ' },
  { k: 'auto_ticket_reply', label: 'แจ้งเมื่อทีมงานตอบเรื่องแจ้งซ่อม', hint: 'ผู้เช่าได้รับข้อความเมื่อมีการตอบหรือเปลี่ยนสถานะ' },
  {
    k: 'auto_remind',
    label: 'เตือนก่อนครบกำหนด 1 วัน และเมื่อค้างชำระ',
    hint: 'เตือนเมื่อเกินกำหนด วันที่ 1, 3 และ 7',
  },
  {
    k: 'auto_parcel',
    label: 'แจ้งพัสดุถึงผู้เช่าอัตโนมัติ',
    hint: 'ส่งการ์ดพร้อมรหัสรับพัสดุทันทีที่บันทึกรับพัสดุ — ผู้เช่าพิมพ์ “พัสดุ” ในแชตเพื่อดูรายการที่รอรับได้',
  },
]

interface FormState extends Omit<LineSettingsInput, 'channel_secret' | 'channel_access_token'> {
  channel_secret: string
  channel_access_token: string
}

const formOf = (l: LineSettings): FormState => ({
  enabled: l.enabled,
  channel_id: l.channel_id ?? '',
  basic_id: l.basic_id ?? '',
  channel_secret: '',
  channel_access_token: '',
  auto_invoice: l.auto_invoice,
  auto_receipt: l.auto_receipt,
  auto_ticket_reply: l.auto_ticket_reply,
  auto_remind: l.auto_remind,
  auto_housekeeping: !!l.auto_housekeeping,
  auto_parcel: l.auto_parcel ?? true,
})

function LineSettingsView({ line }: { line: LineSettings }) {
  const { readOnly } = useSession()
  const [form, setForm] = useState<FormState>(() => formOf(line))
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const [bot, setBot] = useState<LineBotInfo | null>(null)
  const status = lineStatus(line)
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: api.tenants, meta: { silent: true } })

  const save = useMutation({
    mutationFn: () => {
      const basic = form.basic_id.trim()
      const body: LineSettingsInput = {
        enabled: form.enabled,
        channel_id: form.channel_id.trim(),
        basic_id: basic && !basic.startsWith('@') ? `@${basic}` : basic,
        auto_invoice: form.auto_invoice,
        auto_receipt: form.auto_receipt,
        auto_ticket_reply: form.auto_ticket_reply,
        auto_remind: form.auto_remind,
        auto_housekeeping: form.auto_housekeeping,
        auto_parcel: form.auto_parcel,
      }
      if (form.channel_secret.trim()) body.channel_secret = form.channel_secret.trim()
      if (form.channel_access_token.trim()) body.channel_access_token = form.channel_access_token.trim()
      return api.updateLine(body)
    },
    onSuccess: async (l) => {
      toast.success('บันทึกการตั้งค่า LINE OA แล้ว')
      setForm(formOf(l))
      await invalidate('org-info')
    },
  })

  const test = useMutation({
    mutationFn: api.testLine,
    meta: { silent: true },
    onSuccess: (r) => setBot(r.bot),
    onError: () => setBot(null),
  })

  const disabled = readOnly
  const needSecret = form.enabled && !line.has_secret && !form.channel_secret.trim()
  const needToken = form.enabled && !line.has_token && !form.channel_access_token.trim()
  const friendUrl = addFriendUrl(line)
  const totalTenants = tenants.data?.length

  return (
    <div className="grid max-w-6xl gap-6">
      {/* ---------- สถานะ ---------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <LineIcon className="size-9" />
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2">
                LINE Official Account
                {status === 'connected' ? (
                  <ToneBadge tone="green">เชื่อมต่อแล้ว</ToneBadge>
                ) : status === 'disabled' ? (
                  <ToneBadge tone="grey">ปิดใช้งาน</ToneBadge>
                ) : (
                  <ToneBadge tone="mustard">ยังไม่ได้ตั้งค่า</ToneBadge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                ส่งบิล ใบเสร็จ การแจ้งเตือน และรับเรื่องจากผู้เช่าผ่าน LINE OA ขององค์กร
              </CardDescription>
            </div>
          </div>
          <CardAction className="hidden sm:block">
            <TestButton pending={test.isPending} disabled={!line.has_token} onClick={() => test.mutate()} />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Basic ID</dt>
              <dd className="mt-1 font-medium">{line.basic_id || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">ผู้เช่าที่เชื่อม LINE</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {line.linked_tenants}
                {totalTenants != null && <span className="font-normal text-muted-foreground"> / {totalTenants} คน</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Channel secret</dt>
              <dd className="mt-1 font-medium">{line.has_secret ? 'ตั้งค่าแล้ว' : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Access token</dt>
              <dd className="mt-1 font-medium">{line.has_token ? 'ตั้งค่าแล้ว' : '—'}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 sm:hidden">
            <TestButton pending={test.isPending} disabled={!line.has_token} onClick={() => test.mutate()} />
          </div>
          {test.isError && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>เชื่อมต่อไม่สำเร็จ</AlertTitle>
              <AlertDescription>{(test.error as Error).message}</AlertDescription>
            </Alert>
          )}
          {bot && test.isSuccess && (
            <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success/5 p-3">
              <Avatar className="size-10">
                {bot.picture_url && <AvatarImage src={bot.picture_url} alt="" />}
                <AvatarFallback className="bg-muted text-sm">{bot.display_name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <Check className="size-4" /> เชื่อมต่อสำเร็จ
                </div>
                <div className="truncate text-sm">
                  {bot.display_name} <span className="text-muted-foreground">{bot.basic_id}</span>
                </div>
              </div>
            </div>
          )}
          {friendUrl && (
            <div>
              <Button asChild variant="outline" size="sm">
                <a href={friendUrl} target="_blank" rel="noreferrer">
                  <UserPlus /> ลิงก์แอดเพื่อน <ExternalLink className="opacity-60" />
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* ---------- ฟอร์ม ---------- */}
        <form
          className={cn('grid gap-6', status === 'unconfigured' ? 'order-2 lg:order-1' : 'order-1')}
          onSubmit={(e) => {
            e.preventDefault()
            if (needSecret) return toast.error('กรุณาใส่ Channel secret')
            if (needToken) return toast.error('กรุณาใส่ Channel access token')
            save.mutate()
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>การเชื่อมต่อ</CardTitle>
              <CardDescription>คัดลอกค่าจาก LINE Developers Console (ดูขั้นตอนด้านข้าง)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <label className="flex items-center gap-3 rounded-md border px-3 py-3">
                <Switch checked={form.enabled} onCheckedChange={(v) => set('enabled', v)} disabled={disabled} />
                <span className="text-sm font-medium">เปิดใช้งาน LINE OA</span>
                <span className="ml-auto text-xs text-muted-foreground">{form.enabled ? 'เปิด' : 'ปิด'}</span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Channel ID" htmlFor="ln-cid" className="content-start">
                  <Input
                    id="ln-cid"
                    inputMode="numeric"
                    value={form.channel_id}
                    placeholder="เช่น 2001234567"
                    onChange={(e) => set('channel_id', e.target.value)}
                    disabled={disabled}
                    className="tabular-nums"
                  />
                </Field>
                <Field label="Basic ID" htmlFor="ln-bid" hint="ขึ้นต้นด้วย @ ดูได้ใน LINE OA Manager" className="content-start">
                  <Input
                    id="ln-bid"
                    value={form.basic_id}
                    placeholder="@123abcde"
                    onChange={(e) => set('basic_id', e.target.value)}
                    disabled={disabled}
                  />
                </Field>
                <Field label="Channel secret" htmlFor="ln-secret" className="sm:col-span-2">
                  <Input
                    id="ln-secret"
                    type="password"
                    autoComplete="off"
                    value={form.channel_secret}
                    placeholder={line.has_secret ? 'ตั้งค่าแล้ว — เว้นว่างเพื่อใช้ค่าเดิม' : 'วาง Channel secret'}
                    onChange={(e) => set('channel_secret', e.target.value)}
                    aria-invalid={needSecret || undefined}
                    disabled={disabled}
                    className="font-mono"
                  />
                </Field>
                <Field label="Channel access token (long-lived)" htmlFor="ln-token" className="sm:col-span-2">
                  <Input
                    id="ln-token"
                    type="password"
                    autoComplete="off"
                    value={form.channel_access_token}
                    placeholder={line.has_token ? 'ตั้งค่าแล้ว — เว้นว่างเพื่อใช้ค่าเดิม' : 'วาง Channel access token'}
                    onChange={(e) => set('channel_access_token', e.target.value)}
                    aria-invalid={needToken || undefined}
                    disabled={disabled}
                    className="font-mono"
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ส่งอัตโนมัติ</CardTitle>
              <CardDescription>ส่งเฉพาะผู้เช่าและพนักงานที่เชื่อมบัญชี LINE แล้ว</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1">
              {AUTOMATIONS.map((a) => (
                <label key={a.k} className="flex items-start gap-3 rounded-md px-1 py-2.5">
                  <Switch
                    className="mt-0.5"
                    checked={form[a.k]}
                    onCheckedChange={(v) => set(a.k, v)}
                    disabled={disabled}
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{a.label}</span>
                    <span className="text-xs text-muted-foreground">{a.hint}</span>
                  </span>
                </label>
              ))}
              <div className="mt-2 border-t pt-3">
                <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">สำหรับพนักงาน</div>
                <label className="flex items-start gap-3 rounded-md px-1 py-2.5">
                  <Switch
                    className="mt-0.5"
                    checked={form.auto_housekeeping}
                    onCheckedChange={(v) => set('auto_housekeeping', v)}
                    disabled={disabled}
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">แจ้งงานแม่บ้านทาง LINE ให้พนักงาน</span>
                    <span className="text-xs text-muted-foreground">
                      ส่งงานทำความสะอาดใหม่และงานที่ถูกมอบหมายให้พนักงานที่เชื่อม LINE แล้ว — พนักงานเชื่อมได้ที่{' '}
                      <Link to="/settings?tab=members" className="font-medium text-primary hover:underline">
                        ตั้งค่า → สมาชิก
                      </Link>
                    </span>
                  </span>
                </label>
              </div>
            </CardContent>
            <CardFooter className="justify-end border-t pt-6">
              <Button type="submit" disabled={disabled || save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                บันทึก
              </Button>
            </CardFooter>
          </Card>
        </form>

        {/* ---------- คู่มือ ---------- */}
        <SetupGuide
          webhookUrl={line.webhook_url}
          className={status === 'unconfigured' ? 'order-1 lg:order-2' : 'order-2'}
        />
      </div>

      <MessageLog />
    </div>
  )
}

function TestButton({ pending, disabled, onClick }: { pending: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      variant="outline"
      disabled={pending || disabled}
      onClick={onClick}
      title={disabled ? 'บันทึก Channel access token ก่อน' : undefined}
    >
      {pending ? <Loader2 className="animate-spin" /> : <PlugZap />}
      ทดสอบการเชื่อมต่อ
    </Button>
  )
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  )
}

function SetupGuide({ webhookUrl, className }: { webhookUrl: string; className?: string }) {
  const { copied, copy } = useCopy()
  const insecure = !!webhookUrl && (!webhookUrl.startsWith('https://') || /\/\/(localhost|127\.|10\.|192\.168\.)/.test(webhookUrl))
  const steps: ReactNode[] = [
    <span key="s1">
      สร้าง LINE Official Account ที่ <ExtLink href="https://manager.line.biz">LINE Official Account Manager</ExtLink>
    </span>,
    <span key="s2">
      ใน OA Manager ไปที่ <b>Settings → Messaging API</b> แล้วกด <b>เปิดใช้ Messaging API</b> (เลือก/สร้าง Provider)
    </span>,
    <span key="s3">
      ไปที่ <ExtLink href="https://developers.line.biz/console/">LINE Developers Console</ExtLink> เลือก channel ของ OA →
      คัดลอก <b>Channel ID</b> และ <b>Channel secret</b> (แท็บ Basic settings) และกด <b>Issue</b> Channel access token
      (long-lived) (แท็บ Messaging API) มาวางในฟอร์ม
    </span>,
    <div key="s4" className="grid gap-2">
      <span>
        ในแท็บ Messaging API วาง <b>Webhook URL</b> ด้านล่าง → กด <b>Verify</b> → เปิด <b>Use webhook</b>
      </span>
      {webhookUrl ? (
        <div className="flex gap-1.5">
          <Input
            readOnly
            value={webhookUrl}
            onFocus={(e) => e.target.select()}
            aria-label="Webhook URL"
            className="h-8 bg-card font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="คัดลอก Webhook URL"
            onClick={() => copy(webhookUrl, 'wh')}
          >
            {copied === 'wh' ? <Check /> : <Copy />}
          </Button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Webhook URL จะแสดงหลังบันทึกการตั้งค่า</span>
      )}
      <span
        className={cn(
          'flex items-start gap-1.5 text-xs',
          insecure ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        {insecure
          ? 'URL นี้ไม่ใช่ HTTPS สาธารณะ — LINE จะเรียกไม่ได้ ต้องเปิดเว็บด้วยโดเมนจริงที่มี HTTPS'
          : 'ต้องเป็น HTTPS และเข้าถึงได้จากอินเทอร์เน็ต'}
      </span>
    </div>,
    <span key="s5">
      ใน OA Manager ไปที่ <b>Settings → Response settings</b> ปิด <b>ข้อความตอบกลับอัตโนมัติ</b> (Auto-reply) และเปิด{' '}
      <b>Webhooks</b>
    </span>,
    <span key="s6">
      <span className="text-muted-foreground">(แนะนำ)</span> สร้าง <b>Rich menu</b> ใน OA Manager โดยตั้งปุ่มเป็น “ข้อความ”:{' '}
      {['บิล', 'ใบเสร็จ', 'พัสดุ', 'ข้อมูลของฉัน', 'แจ้งซ่อม'].map((t, i) => (
        <span key={t}>
          {i > 0 && ' '}
          <code className="inline-block rounded-sm border bg-muted px-1 py-px text-xs whitespace-nowrap">{t}</code>
        </span>
      ))}
      <span className="mt-1 block text-xs text-muted-foreground">
        ผู้เช่าส่งรูปสลิปในแชตเพื่อแจ้งชำระได้เลย และพิมพ์ “พัสดุ” เพื่อดูพัสดุที่รอรับพร้อมรหัสรับ
      </span>
    </span>,
  ]
  return (
    <Card className={cn('lg:sticky lg:top-20', className)}>
      <CardHeader>
        <CardTitle>ขั้นตอนการตั้งค่า</CardTitle>
        <CardDescription>ใช้เวลาประมาณ 10 นาที ทำครั้งเดียว</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-4">
          {steps.map((s, i) => (
            <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 text-sm leading-relaxed">
              <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
                {i + 1}
              </span>
              <div className="pt-0.5">{s}</div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function MessageLog() {
  const q = useQuery({ queryKey: ['line-messages'], queryFn: () => api.lineMessages(50), meta: { silent: true } })
  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="border-b pb-6">
        <CardTitle>ข้อความล่าสุด</CardTitle>
        <CardDescription>ข้อความที่ระบบส่งทาง LINE 50 รายการล่าสุด</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="รีเฟรช" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn(q.isFetching && 'animate-spin')} />
          </Button>
        </CardAction>
      </CardHeader>
      {q.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : q.isError ? (
        <p className="p-6 text-sm text-muted-foreground">โหลดประวัติข้อความไม่สำเร็จ</p>
      ) : !q.data?.length ? (
        <EmptyState icon={MessagesSquare} title="ยังไม่มีข้อความ" description="เมื่อระบบส่งบิลหรือแจ้งเตือนทาง LINE จะแสดงที่นี่" />
      ) : (
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="hidden pl-6 sm:table-cell">เวลา</TableHead>
              <TableHead className="pl-4 sm:pl-2">ผู้เช่า</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead className="pr-4 sm:pr-6">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="hidden pl-6 text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
                  {dateTime(m.created_at)}
                </TableCell>
                <TableCell className="max-w-40 pl-4 sm:pl-2">
                  <div className="truncate">{m.tenant_name || '—'}</div>
                  <div className="text-xs text-muted-foreground tabular-nums sm:hidden">{dateTime(m.created_at)}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{LINE_KIND_LABEL[m.kind] ?? m.kind}</TableCell>
                <TableCell className="min-w-28 pr-4 whitespace-normal sm:pr-6">
                  {m.status === 'sent' ? (
                    <ToneBadge tone="green">ส่งแล้ว</ToneBadge>
                  ) : (
                    <div className="grid gap-1">
                      <ToneBadge tone="red">ล้มเหลว</ToneBadge>
                      {m.error && <span className="text-xs break-words text-destructive">{m.error}</span>}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
