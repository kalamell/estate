// นำเข้าข้อมูลจาก Excel/CSV — /import (เจ้าของ/ผู้ดูแล)
// อัปโหลด → เลือกชีต/แถวหัวตาราง → จับคู่คอลัมน์ของผู้ใช้กับช่องข้อมูลของเรา → ตรวจสอบ → นำเข้า
import { useState } from 'react'
import { Check, FileSpreadsheet, RotateCcw } from 'lucide-react'
import type { ImportCommitResult, ImportDescribe } from '@/lib/api'
import { initMapping, type MappingState } from '@/lib/imports'
import { cn } from '@/lib/utils'
import { useSession } from '@/contexts/session'
import { Button } from '@/components/ui/button'
import { AdminOnlyState } from '@/components/common'
import { UploadStep } from './upload-step'
import { SheetStep } from './sheet-step'
import { MappingStep } from './mapping-step'
import { ResultView, ReviewStep } from './review-step'

const STEPS = ['อัปโหลด', 'เลือกชีตและแถวหัวตาราง', 'จับคู่คอลัมน์', 'ตรวจสอบ'] as const
type Step = 1 | 2 | 3 | 4

export default function ImportPage() {
  const { canManage } = useSession()
  const [step, setStep] = useState<Step>(1)
  const [reached, setReached] = useState<Step>(1)
  const [describe, setDescribe] = useState<ImportDescribe | null>(null)
  const [state, setState] = useState<MappingState | null>(null)
  const [result, setResult] = useState<ImportCommitResult | null>(null)

  if (!canManage) return <AdminOnlyState />

  const go = (s: Step) => {
    setStep(s)
    setReached((r) => (s > r ? s : r))
    window.scrollTo({ top: 0 })
  }
  /** ได้ผลอ่านไฟล์ใหม่ (อัปโหลด / เปลี่ยนชีต / เปลี่ยนแถวหัวตาราง) → ตั้งการจับคู่ใหม่ */
  const loaded = (d: ImportDescribe) => {
    setDescribe(d)
    setState(initMapping(d))
  }
  const restart = () => {
    setDescribe(null)
    setState(null)
    setResult(null)
    setStep(1)
    setReached(1)
    window.scrollTo({ top: 0 })
  }

  if (result && describe)
    return (
      <div className="mx-auto max-w-5xl">
        <ResultView filename={describe.filename} result={result} onRestart={restart} />
      </div>
    )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Stepper step={step} reached={describe ? reached : 1} onGo={go} />
        {describe && (
          <div className="flex min-w-0 items-center gap-2 text-sm lg:ml-auto">
            <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-medium" title={describe.filename}>
              {describe.filename}
            </span>
            <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={restart}>
              <RotateCcw /> เปลี่ยนไฟล์
            </Button>
          </div>
        )}
      </div>

      {step === 1 && (
        <UploadStep
          current={describe}
          onUploaded={(d) => {
            loaded(d)
            setReached(1)
            go(2)
          }}
          onContinue={() => go(2)}
        />
      )}
      {step === 2 && describe && (
        <SheetStep describe={describe} onLoaded={loaded} onBack={() => go(1)} onNext={() => go(3)} />
      )}
      {step === 3 && describe && state && (
        <MappingStep describe={describe} state={state} onChange={setState} onBack={() => go(2)} onNext={() => go(4)} />
      )}
      {step === 4 && describe && state && (
        <ReviewStep describe={describe} state={state} onBack={() => go(3)} onDone={setResult} />
      )}
    </div>
  )
}

function Stepper({ step, reached, onGo }: { step: Step; reached: Step; onGo: (s: Step) => void }) {
  return (
    <nav aria-label="ขั้นตอนการนำเข้า" className="min-w-0">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step
          const done = n < step
          const current = n === step
          const can = n <= reached && !current
          return (
            <li key={label} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              {i > 0 && <span aria-hidden className={cn('h-px w-3 shrink-0 sm:w-6', n <= reached ? 'bg-primary/50' : 'bg-border')} />}
              <button
                type="button"
                disabled={!can}
                onClick={() => onGo(n)}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-1 text-sm transition-colors',
                  can && 'hover:bg-muted',
                  !can && !current && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums',
                    current && 'border-primary bg-primary text-primary-foreground',
                    done && 'border-primary/40 bg-primary/10 text-primary',
                    !current && !done && 'text-muted-foreground',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : n}
                </span>
                <span
                  className={cn(
                    'truncate',
                    current ? 'font-medium text-foreground' : 'hidden text-muted-foreground md:inline',
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
