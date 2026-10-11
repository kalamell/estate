// เลือกสัญชาติแบบค้นหาได้ (ไทย / อังกฤษ / รหัสประเทศ) — พิมพ์รหัส 2 ตัวอักษรอื่นได้
import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { COUNTRIES, countryName, findCountry } from '@/lib/countries'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function CountryCode({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-grid h-5 min-w-7 place-items-center rounded-sm border bg-muted px-1 font-mono text-[11px] font-medium text-muted-foreground',
        className,
      )}
    >
      {code}
    </span>
  )
}

export function CountryPicker({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string
  value: string
  onChange: (code: string) => void
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const list = useMemo(
    () =>
      term
        ? COUNTRIES.filter(
            (c) => c.th.includes(term) || c.en.toLowerCase().includes(term) || c.code.toLowerCase() === term,
          )
        : COUNTRIES,
    [term],
  )
  const custom = /^[a-z]{2}$/i.test(term) && term.toUpperCase() !== 'TH' && !findCountry(term) ? term.toUpperCase() : null
  const pick = (code: string) => {
    onChange(code)
    setOpen(false)
    setQ('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="h-9 w-full justify-between font-normal"
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <CountryCode code={value} />
              <span className="truncate">{countryName(value)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">ค้นหาสัญชาติ</span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="พิมพ์ชื่อประเทศ หรือรหัส เช่น US"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="ค้นหาสัญชาติ"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1" role="listbox">
          {custom && (
            <Option selected={value === custom} onClick={() => pick(custom)}>
              <CountryCode code={custom} />
              <span>ใช้รหัส {custom}</span>
            </Option>
          )}
          {list.map((c) => (
            <Option key={c.code} selected={value === c.code} onClick={() => pick(c.code)}>
              <CountryCode code={c.code} />
              <span className="truncate">{c.th}</span>
              <span className="truncate text-xs text-muted-foreground">{c.en}</span>
            </Option>
          ))}
          {!list.length && !custom && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              ไม่พบ — พิมพ์รหัสประเทศ 2 ตัวอักษร (ISO) ได้
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent',
        selected && 'bg-accent',
      )}
    >
      {children}
      {selected && <Check className="ml-auto size-4 shrink-0" />}
    </button>
  )
}
