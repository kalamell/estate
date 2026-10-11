import { useMemo } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Eraser, History, MoveRight, Sparkles } from 'lucide-react'
import type { DateOrder, ImportDescribe, ImportOptions, PropertyKind } from '@/lib/api'
import {
  DATE_ORDERS,
  assignField,
  fieldByColumn,
  groupFields,
  previewDate,
  sampleValues,
  type MappingState,
  type PropertyMode,
} from '@/lib/imports'
import { KINDS, thDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Field, ToneBadge } from '@/components/common'

const SKIP = '__skip'

export function MappingStep({
  describe: d,
  state,
  onChange,
  onBack,
  onNext,
}: {
  describe: ImportDescribe
  state: MappingState
  onChange: (s: MappingState) => void
  onBack: () => void
  onNext: () => void
}) {
  const { mapping, propertyMode } = state
  const byColumn = useMemo(() => fieldByColumn(mapping), [mapping])
  const groups = useMemo(() => groupFields(d.fields), [d.fields])
  const fieldLabel = (k: string) => d.fields.find((f) => f.key === k)?.label ?? k
  const letterOf = (c: number) => d.columns[c]?.letter ?? String(c + 1)
  const mappedCount = byColumn.size
  const noKey = mapping.unit_name == null && mapping.tenant_name == null

  const setField = (column: number, key: string | null) => {
    const next = assignField(mapping, column, key)
    // เลือกคอลัมน์ชื่อโครงการ → ใช้ชื่อโครงการจากไฟล์
    const mode: PropertyMode = key === 'property_name' ? 'column' : propertyMode
    onChange({ ...state, mapping: next, propertyMode: mode })
  }

  return (
    <div className="space-y-5">
      {noKey && (
        <Alert className="border-warning/40 bg-warning/[0.06]">
          <AlertTriangle className="text-warning" />
          <AlertTitle>ยังไม่ได้จับคู่ “เลขห้อง” หรือ “ชื่อผู้เช่า”</AlertTitle>
          <AlertDescription>ต้องมีอย่างน้อยหนึ่งในสองช่องนี้ ระบบจึงจะรู้ว่าแต่ละแถวคือห้องหรือผู้เช่าคนไหน</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0 gap-0 self-start overflow-hidden py-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="font-semibold">จับคู่คอลัมน์</div>
              <div className="text-xs text-muted-foreground">
                เลือกว่าแต่ละคอลัมน์ในไฟล์ของคุณคือข้อมูลอะไรในระบบ · จับคู่แล้ว {mappedCount} จาก {d.columns.length} คอลัมน์
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {d.mapping_source.type === 'saved' ? (
                <ToneBadge tone="green" className="max-w-full">
                  <History /> <span className="truncate">จำจากครั้งก่อน: {d.mapping_source.name}</span>
                </ToneBadge>
              ) : (
                <ToneBadge tone="ink">
                  <Sparkles /> เดาจากชื่อคอลัมน์
                </ToneBadge>
              )}
              {mappedCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-muted-foreground"
                  onClick={() => onChange({ ...state, mapping: {} })}
                >
                  <Eraser /> ล้าง
                </Button>
              )}
            </div>
          </div>
          <div className="hidden grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,16rem)] gap-3 border-b bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground md:grid">
            <span>คอลัมน์ในไฟล์ของคุณ · ตัวอย่างข้อมูล</span>
            <span />
            <span>ข้อมูลในระบบ</span>
          </div>
          <ul className="divide-y">
            {d.columns.map((col) => {
              const key = byColumn.get(col.index) ?? null
              const samples = sampleValues(d.sample, col.index)
              const ignored = key === 'property_name' && propertyMode === 'one'
              return (
                <li
                  key={col.index}
                  className={cn(
                    'grid gap-2 border-l-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,16rem)] md:items-center md:gap-3',
                    key && !ignored ? 'border-l-primary' : 'border-l-transparent',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-sm border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                        {col.letter}
                      </span>
                      <span className={cn('truncate font-medium', !key && 'text-muted-foreground')} title={col.header}>
                        {col.header}
                      </span>
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                      {samples.length ? (
                        samples.map((v) => (
                          <span
                            key={v}
                            className="max-w-[12rem] truncate rounded-sm bg-muted/70 px-1.5 py-0.5 text-xs text-muted-foreground"
                            title={v}
                          >
                            {v}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground/70 italic">ไม่มีข้อมูลในแถวตัวอย่าง</span>
                      )}
                    </div>
                  </div>
                  <MoveRight
                    className={cn('hidden size-4 justify-self-center md:block', key ? 'text-primary' : 'text-muted-foreground/40')}
                  />
                  <div className="min-w-0">
                    <Select value={key ?? SKIP} onValueChange={(v) => setField(col.index, v === SKIP ? null : v)}>
                      <SelectTrigger
                        className={cn('w-full', key ? 'bg-card' : 'bg-transparent text-muted-foreground')}
                        aria-label={`ข้อมูลของคอลัมน์ ${col.letter} ${col.header}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        <SelectItem value={SKIP}>
                          <span className="text-muted-foreground">— ไม่นำเข้า —</span>
                        </SelectItem>
                        {groups.map((g) => (
                          <SelectGroup key={g.group}>
                            <SelectSeparator />
                            <SelectLabel className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                              {g.group}
                            </SelectLabel>
                            {g.fields.map((f) => {
                              const used = mapping[f.key]
                              return (
                                <SelectItem key={f.key} value={f.key}>
                                  {f.label}
                                  {used != null && used !== col.index && (
                                    <span className="text-xs text-muted-foreground">(ใช้กับคอลัมน์ {letterOf(used)})</span>
                                  )}
                                </SelectItem>
                              )
                            })}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    {ignored && (
                      <p className="mt-1 text-xs text-muted-foreground">ไม่ใช้ เพราะเลือกโครงการเดียวสำหรับทุกแถว</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>

        <aside className="space-y-4">
          <OptionsPanel describe={d} state={state} onChange={onChange} fieldLabel={fieldLabel} letterOf={letterOf} />
        </aside>
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-5">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> ย้อนกลับ
        </Button>
        <Button onClick={onNext} disabled={noKey}>
          ถัดไป: ตรวจสอบ <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="text-xs font-semibold tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="grid gap-0.5 text-sm">
        <span>{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

function OptionsPanel({
  describe: d,
  state,
  onChange,
  fieldLabel,
  letterOf,
}: {
  describe: ImportDescribe
  state: MappingState
  onChange: (s: MappingState) => void
  fieldLabel: (k: string) => string
  letterOf: (c: number) => string
}) {
  const { options: o, mapping, propertyMode } = state
  const set = (patch: Partial<ImportOptions>) => onChange({ ...state, options: { ...o, ...patch } })
  const setMode = (m: PropertyMode) => onChange({ ...state, propertyMode: m })
  const propCol = mapping.property_name
  const hasProps = d.properties.length > 0
  const unitsMapped = mapping.unit_name != null

  // ตัวอย่างวันที่จากไฟล์ (คอลัมน์วันที่แรกที่จับคู่ไว้)
  const dateCol = mapping.start_date ?? mapping.end_date ?? mapping.reading_date
  const dateSample = dateCol != null ? sampleValues(d.sample, dateCol, 1)[0] : undefined
  const parsed = dateSample ? previewDate(dateSample, o.date_order) : null

  // สรุปข้อมูลที่จะนำเข้า
  const groups = groupFields(d.fields)
    .map((g) => ({ group: g.group, labels: g.fields.filter((f) => mapping[f.key] != null).map((f) => f.label) }))
    .filter((g) => g.labels.length)

  return (
    <Card className="gap-0 divide-y py-0">
      <Section title="ข้อมูลที่จะนำเข้า">
        {groups.length ? (
          <dl className="grid gap-1.5 text-sm">
            {groups.map((g) => (
              <div key={g.group} className="grid grid-cols-[4.5rem_1fr] gap-2">
                <dt className="text-muted-foreground">{g.group}</dt>
                <dd>{g.labels.join(', ')}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่ได้จับคู่คอลัมน์</p>
        )}
      </Section>

      <Section title="โครงการ">
        <div className="grid gap-2" role="radiogroup" aria-label="โครงการของห้อง">
          <ModeOption
            active={propertyMode === 'one'}
            disabled={!hasProps}
            onClick={() => setMode('one')}
            title="ใช้โครงการเดียวกันทุกแถว"
            hint={hasProps ? undefined : 'ยังไม่มีโครงการในระบบ'}
          >
            {propertyMode === 'one' && hasProps && (
              <Select
                value={o.property_id != null ? String(o.property_id) : ''}
                onValueChange={(v) => set({ property_id: Number(v) })}
              >
                <SelectTrigger className="mt-2 w-full bg-card" aria-label="เลือกโครงการ" aria-invalid={o.property_id == null || undefined}>
                  <SelectValue placeholder="เลือกโครงการ" />
                </SelectTrigger>
                <SelectContent>
                  {d.properties.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </ModeOption>
          <ModeOption
            active={propertyMode === 'column'}
            onClick={() => setMode('column')}
            title="อ่านชื่อโครงการจากคอลัมน์ในไฟล์"
          >
            {propertyMode === 'column' && (
              <div className="mt-2 grid gap-3">
                <Select
                  value={propCol != null ? String(propCol) : ''}
                  onValueChange={(v) => onChange({ ...state, mapping: assignField(mapping, Number(v), 'property_name') })}
                >
                  <SelectTrigger className="w-full bg-card" aria-label="คอลัมน์ชื่อโครงการ" aria-invalid={(propCol == null && unitsMapped) || undefined}>
                    <SelectValue placeholder="เลือกคอลัมน์ชื่อโครงการ" />
                  </SelectTrigger>
                  <SelectContent>
                    {d.columns.map((c) => (
                      <SelectItem key={c.index} value={String(c.index)}>
                        <span className="font-mono text-xs text-muted-foreground">{c.letter}</span> {c.header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SwitchRow
                  id="imp-create-props"
                  label="สร้างโครงการที่ยังไม่มี"
                  hint="ชื่อโครงการในไฟล์ที่ไม่ตรงกับในระบบจะถูกสร้างใหม่"
                  checked={o.create_properties}
                  onChange={(v) => set({ create_properties: v })}
                />
                {o.create_properties && (
                  <Field label="ประเภทโครงการใหม่" htmlFor="imp-kind">
                    <Select value={o.property_kind} onValueChange={(v) => set({ property_kind: v as PropertyKind })}>
                      <SelectTrigger id="imp-kind" className="w-full bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(KINDS) as PropertyKind[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {KINDS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
            )}
          </ModeOption>
        </div>
        {propertyMode === 'one' && hasProps && o.property_id == null && unitsMapped && (
          <p className="text-xs text-warning-foreground">เลือกโครงการที่จะนำห้องเข้าไป</p>
        )}
        {propertyMode === 'column' && propCol == null && unitsMapped && d.properties.length !== 1 && (
          <p className="text-xs text-warning-foreground">
            เลือกคอลัมน์ “{fieldLabel('property_name')}” {hasProps && 'หรือใช้โครงการเดียวกันทุกแถว'}
          </p>
        )}
        {propertyMode === 'column' && propCol != null && (
          <p className="text-xs text-muted-foreground">ใช้คอลัมน์ {letterOf(propCol)} เป็นชื่อโครงการ</p>
        )}
      </Section>

      <Section title="ห้อง สัญญา และวันที่">
        <SwitchRow
          id="imp-update-units"
          label="อัปเดตห้องที่มีอยู่แล้ว"
          hint="ห้องเลขเดียวกันในโครงการเดียวกัน: ปรับชั้นและค่าเช่าตามไฟล์"
          checked={o.update_units}
          onChange={(v) => set({ update_units: v })}
        />
        <SwitchRow
          id="imp-deposit"
          label="ผู้เช่าจ่ายเงินประกันแล้ว"
          hint="บันทึกเงินประกันในสัญญาที่นำเข้าเป็น “ชำระแล้ว”"
          checked={o.deposit_paid}
          onChange={(v) => set({ deposit_paid: v })}
        />
        <Field
          label="รูปแบบวันที่ในไฟล์"
          htmlFor="imp-date"
          hint={
            dateSample ? (
              <>
                ในไฟล์: <span className="font-medium text-foreground">{dateSample}</span>
                {parsed ? (
                  <>
                    {' '}→ <span className="font-medium text-foreground">{thDateLong(parsed)}</span>
                  </>
                ) : (
                  ' — ระบบอ่านรูปแบบนี้ให้อัตโนมัติ'
                )}
              </>
            ) : (
              'ปี พ.ศ. หรือ ค.ศ. ก็ได้ · ชื่อเดือนไทย/อังกฤษก็ได้'
            )
          }
        >
          <Select value={o.date_order} onValueChange={(v) => set({ date_order: v as DateOrder })}>
            <SelectTrigger id="imp-date" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_ORDERS.map((x) => (
                <SelectItem key={x.v} value={x.v}>
                  {x.label}
                  <span className="font-mono text-xs text-muted-foreground">{x.example}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>
    </Card>
  )
}

function ModeOption({
  active,
  disabled,
  onClick,
  title,
  hint,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-3 transition-colors',
        active ? 'border-primary/50 bg-primary/[0.04]' : 'hover:bg-muted/40',
        disabled && 'opacity-60',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active}
        disabled={disabled}
        onClick={onClick}
        className="flex w-full items-start gap-2.5 text-left text-sm disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
            active ? 'border-primary' : 'border-input',
          )}
        >
          {active && <span className="size-2 rounded-full bg-primary" />}
        </span>
        <span className="grid gap-0.5">
          <span className={cn(active && 'font-medium')}>{title}</span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </span>
      </button>
      {children}
    </div>
  )
}
