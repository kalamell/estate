import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/common'

export const ALL = 'all'

export function PropertyFilter({
  value,
  onChange,
  id,
  className = 'w-full sm:w-56',
}: {
  value: string
  onChange: (v: string) => void
  id: string
  className?: string
}) {
  const properties = useQuery({ queryKey: ['properties'], queryFn: api.properties })
  return (
    <Field label="โครงการ" htmlFor={id} className={className}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>ทุกโครงการ</SelectItem>
          {properties.data?.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function PeriodFilter({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (v: string) => void
  id: string
}) {
  return (
    <Field label="รอบบิล" htmlFor={id} className="flex-1 sm:w-48 sm:flex-none">
      <div className="flex gap-1">
        <Input
          id={id}
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-card"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange('')}
            aria-label="ทุกรอบบิล"
            title="ทุกรอบบิล"
          >
            <X />
          </Button>
        )}
      </div>
    </Field>
  )
}
