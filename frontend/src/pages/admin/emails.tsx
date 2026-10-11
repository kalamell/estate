import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, CircleCheck, Loader2, Mail, RefreshCw, Send, ServerCog } from 'lucide-react'
import { api, type EmailStatus, type TestEmailResult } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { sqlUtc } from '@/lib/billing'
import { dateTime } from '@/lib/docs'
import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/format'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, Field, ToneBadge } from '@/components/common'

const STATUS: Record<EmailStatus, { label: string; tone: Tone; hint: string }> = {
  queued: { label: 'รอส่ง', tone: 'ink', hint: 'อยู่ในคิว ระบบจะส่งอัตโนมัติ (ลองซ้ำสูงสุด 5 ครั้ง)' },
  sent: { label: 'ส่งแล้ว', tone: 'green', hint: 'ส่งถึงเซิร์ฟเวอร์อีเมลแล้ว' },
  failed: { label: 'ส่งไม่สำเร็จ', tone: 'red', hint: 'ลองครบ 5 ครั้งแล้วยังส่งไม่ได้' },
  logged: { label: 'บันทึกใน log', tone: 'grey', hint: 'ยังไม่ได้ตั้งค่า SMTP — เนื้อหาอีเมลถูกเขียนลง log ของเซิร์ฟเวอร์' },
}

const KIND: Record<string, string> = {
  verify: 'ยืนยันอีเมล',
  reset: 'ตั้งรหัสผ่านใหม่',
  test: 'ทดสอบ',
  slip_review: 'สลิปรอตรวจ',
  renewal: 'ต่ออายุแพ็กเกจ',
  change: 'เปลี่ยนแพ็กเกจ',
}

type Filter = EmailStatus | ''
const FILTERS: { v: Filter; label: string }[] = [
  { v: '', label: 'ทั้งหมด' },
  { v: 'queued', label: 'รอส่ง' },
  { v: 'sent', label: 'ส่งแล้ว' },
  { v: 'failed', label: 'ไม่สำเร็จ' },
  { v: 'logged', label: 'ใน log' },
]

export default function AdminEmails() {
  const [status, setStatus] = useState<Filter>('')
  const q = useQuery({
    queryKey: ['admin', 'emails', status],
    queryFn: () => api.admin.emails({ status }),
  })
  const configured = q.data?.smtp_configured
  const emails = q.data?.emails ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">อีเมล</h1>
          <p className="text-sm text-muted-foreground">
            อีเมลที่ระบบส่ง: ยืนยันอีเมล ลืมรหัสผ่าน และใบแจ้งหนี้ค่าบริการ
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="sm:ml-auto"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
        >
          <RefreshCw className={cn(q.isFetching && 'animate-spin')} /> รีเฟรช
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SmtpCard configured={configured} />
        <TestCard />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="font-semibold">กล่องขาออก</div>
          <span className="text-xs text-muted-foreground">200 รายการล่าสุด</span>
          <div className="flex w-full gap-1 overflow-x-auto rounded-md border bg-muted/50 p-1 sm:ml-auto sm:w-auto" role="radiogroup" aria-label="กรองสถานะ">
            {FILTERS.map((f) => (
              <button
                key={f.v}
                role="radio"
                aria-checked={status === f.v}
                onClick={() => setStatus(f.v)}
                className={cn(
                  'h-7 shrink-0 rounded-sm px-2.5 text-xs whitespace-nowrap transition-colors',
                  status === f.v
                    ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !emails.length ? (
          <EmptyState icon={Mail} title="ยังไม่มีอีเมล" description={status ? 'ไม่มีอีเมลในสถานะนี้' : undefined} />
        ) : (
          <Table className="table-fixed">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-4">อีเมล</TableHead>
                <TableHead className="w-28 sm:w-32">สถานะ</TableHead>
                <TableHead className="hidden w-20 text-center md:table-cell">ครั้งที่ส่ง</TableHead>
                <TableHead className="hidden w-36 pr-4 md:table-cell">เวลา</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((e) => {
                const st = STATUS[e.status] ?? { label: e.status, tone: 'grey' as Tone, hint: '' }
                return (
                  <TableRow key={e.id} className="align-top">
                    <TableCell className="pl-4 whitespace-normal">
                      <div className="truncate font-medium" title={e.subject}>
                        {e.subject}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="truncate">{e.to_addr}</span>
                        <span aria-hidden>·</span>
                        <span>{KIND[e.kind] ?? e.kind}</span>
                        <span className="md:hidden">· {dateTime(sqlUtc(e.created_at))}</span>
                      </div>
                      {e.last_error && (
                        <div className="mt-1 rounded-sm bg-destructive/[0.06] px-2 py-1 font-mono text-[11px] leading-relaxed break-words text-destructive">
                          {e.last_error}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={st.tone} className="whitespace-nowrap">
                        <span title={st.hint}>{st.label}</span>
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="hidden text-center tabular-nums md:table-cell">{e.attempts}</TableCell>
                    <TableCell className="hidden pr-4 text-xs text-muted-foreground md:table-cell">
                      <div>{dateTime(sqlUtc(e.created_at))}</div>
                      {e.sent_at && e.status === 'sent' && <div>ส่ง {dateTime(sqlUtc(e.sent_at))}</div>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function SmtpCard({ configured }: { configured: boolean | undefined }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ServerCog className="size-4 text-muted-foreground" />
          เซิร์ฟเวอร์ส่งอีเมล (SMTP)
          {configured === undefined ? (
            <Skeleton className="h-5 w-24" />
          ) : configured ? (
            <ToneBadge tone="green">ตั้งค่าแล้ว</ToneBadge>
          ) : (
            <ToneBadge tone="mustard">ยังไม่ได้ตั้งค่า</ToneBadge>
          )}
        </CardTitle>
        <CardDescription>
          {configured
            ? 'ระบบส่งอีเมลจริงผ่าน SMTP ที่ตั้งไว้'
            : 'ตอนนี้อีเมลจะถูกเขียนลง log ของเซิร์ฟเวอร์แทนการส่งจริง — ผู้ใช้จะไม่ได้รับลิงก์ลืมรหัสผ่าน/ยืนยันอีเมล'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          ตั้งค่าตัวแปร <code className="rounded-sm bg-muted px-1 py-0.5 text-xs">SMTP_*</code> ในไฟล์{' '}
          <code className="rounded-sm bg-muted px-1 py-0.5 text-xs">.env</code> แล้วรีสตาร์ตเซิร์ฟเวอร์ — ดูรายละเอียดใน{' '}
          <code className="rounded-sm bg-muted px-1 py-0.5 text-xs">DEPLOY.md</code>
        </p>
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
{`SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=…
SMTP_PASSWORD=…
SMTP_FROM="Estate <no-reply@example.com>"
SMTP_TLS=starttls   # หรือ tls (465), none`}
        </pre>
      </CardContent>
    </Card>
  )
}

function TestCard() {
  const { user } = useSession()
  const [to, setTo] = useState(user.email)
  const [result, setResult] = useState<(TestEmailResult & { to: string }) | null>(null)
  const test = useMutation({
    mutationFn: () => api.admin.testEmail(to.trim()),
    onSuccess: async (r) => {
      setResult({ ...r, to: to.trim() })
      await invalidate('admin')
    },
  })
  const st = result ? STATUS[result.status] : null
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4 text-muted-foreground" /> ส่งอีเมลทดสอบ
        </CardTitle>
        <CardDescription>ส่งทันที (ไม่รอคิว) เพื่อตรวจว่าการตั้งค่า SMTP ใช้งานได้</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            setResult(null)
            test.mutate()
          }}
        >
          <Field label="ส่งถึง" htmlFor="test-to" className="flex-1">
            <Input id="test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={test.isPending}>
            {test.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            ส่งอีเมลทดสอบ
          </Button>
        </form>
        {result && st && (
          <Alert variant={result.status === 'failed' || result.error ? 'destructive' : 'default'}>
            {result.status === 'sent' ? <CircleCheck className="text-success" /> : <AlertCircle />}
            <AlertTitle className="flex flex-wrap items-center gap-2">
              <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
              <span className="min-w-0 truncate font-normal text-muted-foreground">{result.to}</span>
            </AlertTitle>
            <AlertDescription>
              {result.error
                ? result.error
                : result.status === 'sent'
                  ? 'ส่งสำเร็จ — ตรวจกล่องจดหมาย (และสแปม) ของผู้รับ'
                  : result.status === 'logged'
                    ? 'ยังไม่ได้ตั้งค่า SMTP — อีเมลถูกเขียนลง log ของเซิร์ฟเวอร์แทน'
                    : st.hint}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
