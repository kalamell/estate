import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowRight,
  BookmarkCheck,
  Download,
  FileSpreadsheet,
  Gauge,
  DoorOpen,
  Loader2,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { api, type ImportDescribe } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { ACCEPT_EXT, MAX_FILE_MB } from '@/lib/imports'
import { sqlUtc } from '@/lib/billing'
import { thDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/components/confirm'

export function UploadStep({
  current,
  onUploaded,
  onContinue,
}: {
  current: ImportDescribe | null
  onUploaded: (d: ImportDescribe) => void
  onContinue: () => void
}) {
  const { readOnly } = useSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const d = await api.uploadImport(fd)
      // หลายชีต: เริ่มที่ชีตที่มีข้อมูลมากที่สุด (เปลี่ยนได้ในขั้นถัดไป)
      const best = d.sheets.reduce((a, b) => (b.rows > a.rows ? b : a), d.sheets[0])
      return best && best.index !== d.sheet ? api.inspectImport(d.id, { sheet: best.index }) : d
    },
    meta: { silent: true },
    onSuccess: onUploaded,
  })

  const pick = (files: FileList | null) => {
    const f = files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!f) return
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPT_EXT.includes(ext)) return setLocalError(`ไม่รองรับไฟล์ ${ext || f.name} — ใช้ ${ACCEPT_EXT.join(' ')}`)
    if (f.size > MAX_FILE_MB * 1024 * 1024) return setLocalError(`ไฟล์ใหญ่เกิน ${MAX_FILE_MB} MB — แบ่งเป็นหลายไฟล์`)
    setLocalError(null)
    upload.mutate(f)
  }
  const error = localError ?? upload.error?.message

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        {current && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              กำลังนำเข้า <b className="font-medium">{current.filename}</b>
            </span>
            <Button size="sm" variant="outline" onClick={onContinue}>
              ทำต่อ <ArrowRight />
            </Button>
          </div>
        )}
        <div
          role="button"
          tabIndex={0}
          aria-label="เลือกไฟล์ Excel หรือ CSV"
          aria-disabled={readOnly || upload.isPending}
          onClick={() => !readOnly && !upload.isPending && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !readOnly && !upload.isPending) {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (!readOnly) setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            if (!readOnly && !upload.isPending) pick(e.dataTransfer.files)
          }}
          className={cn(
            'grid cursor-pointer place-items-center rounded-xl border-2 border-dashed bg-card px-6 py-14 text-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:py-20',
            drag ? 'border-primary bg-primary/[0.04]' : 'hover:border-primary/50 hover:bg-muted/30',
            (readOnly || upload.isPending) && 'cursor-default',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_EXT.join(',')}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => pick(e.target.files)}
          />
          <div className="grid size-12 place-items-center rounded-lg border bg-muted text-muted-foreground">
            {upload.isPending ? <Loader2 className="size-5 animate-spin text-primary" /> : <Upload className="size-5" />}
          </div>
          <p className="mt-4 text-base font-medium">
            {upload.isPending ? 'กำลังอ่านไฟล์…' : drag ? 'วางไฟล์ที่นี่' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Excel (.xlsx .xls) · OpenDocument (.ods) · CSV — ไม่เกิน {MAX_FILE_MB} MB
          </p>
          <Button
            type="button"
            className="mt-5"
            disabled={readOnly || upload.isPending}
            onClick={(e) => {
              e.stopPropagation()
              inputRef.current?.click()
            }}
          >
            <FileSpreadsheet /> เลือกไฟล์
          </Button>
          {readOnly && <p className="mt-3 text-xs text-muted-foreground">บัญชีอ่านได้อย่างเดียว — ต่ออายุแพ็กเกจเพื่อนำเข้าข้อมูล</p>}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <SavedMappings />
      </div>

      <aside className="space-y-4">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>ใช้ไฟล์ที่มีอยู่ได้เลย</CardTitle>
            <CardDescription>
              ไม่ต้องใช้แม่แบบของเรา — ตารางรูปแบบไหนก็ได้ คุณจะจับคู่คอลัมน์ของคุณกับข้อมูลในระบบเองในขั้นถัดไป
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-2.5">
              {[
                { icon: DoorOpen, t: 'ห้อง', d: 'เลขห้อง ชั้น ค่าเช่า (สร้างโครงการให้อัตโนมัติได้)' },
                { icon: Users, t: 'ผู้เช่า', d: 'ชื่อ เบอร์โทร อีเมล เลขบัตร ที่อยู่' },
                { icon: FileSpreadsheet, t: 'สัญญา', d: 'วันเข้าพัก วันสิ้นสุด ค่าเช่า เงินประกัน' },
                { icon: Gauge, t: 'มิเตอร์', d: 'เลขมิเตอร์ไฟ/น้ำล่าสุด' },
              ].map((x) => (
                <li key={x.t} className="flex gap-2.5">
                  <x.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{x.t}</span>
                    <span className="text-muted-foreground"> — {x.d}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              ระบบตรวจทุกแถวก่อนนำเข้า แถวที่ผิดจะถูกข้ามพร้อมบอกเหตุผล และนำเข้าทั้งหมดในครั้งเดียว — ถ้าล้มเหลวจะไม่มีอะไรเปลี่ยน
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <a href={api.importTemplateUrl()} download>
                <Download /> ดาวน์โหลดไฟล์ตัวอย่าง (ไม่บังคับ)
              </a>
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}

function SavedMappings() {
  const confirm = useConfirm()
  const q = useQuery({ queryKey: ['import-mappings'], queryFn: api.importMappings })
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteImportMapping(id),
    onSuccess: async () => {
      toast.success('ลบการจับคู่ที่จำไว้แล้ว')
      await invalidate('import-mappings')
    },
  })
  if (q.isLoading) return <Skeleton className="h-24 rounded-xl" />
  const list = q.data ?? []
  if (!list.length) return null
  return (
    <Card className="gap-0 py-0">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2 font-medium">
          <BookmarkCheck className="size-4 text-muted-foreground" /> การจับคู่ที่จำไว้
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          อัปโหลดไฟล์ที่หัวตารางเหมือนเดิม ระบบจะจับคู่คอลัมน์ให้ตามครั้งก่อนอัตโนมัติ
        </p>
      </div>
      <ul className="divide-y">
        {list.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{m.name}</div>
              <div className="text-xs text-muted-foreground">
                จับคู่ {m.fields} ช่อง · ใช้ล่าสุด {thDate(sqlUtc(m.updated_at))}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={`ลบการจับคู่ ${m.name}`}
              disabled={remove.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: 'ลบการจับคู่ที่จำไว้?',
                  description: `ครั้งหน้าที่อัปโหลดไฟล์รูปแบบเดียวกับ "${m.name}" ระบบจะเดาการจับคู่จากชื่อคอลัมน์แทน`,
                  confirmText: 'ลบ',
                  destructive: true,
                })
                if (ok) remove.mutate(m.id)
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
