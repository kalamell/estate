import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { api, type Unit } from '@/lib/api'
import { invalidate } from '@/lib/query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common'

/** เพิ่มห้อง — คัดลอกราคา ขนาด และผังเฟอร์นิเจอร์จากห้องแรกของโครงการเป็นค่าเริ่มต้น */
function AddUnitForm({
  onOpenChange,
  propertyId,
  sample,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  propertyId: number
  sample?: Unit
}) {
  const [name, setName] = useState('')
  const [floor, setFloor] = useState('')
  const [floorTouched, setFloorTouched] = useState(false)

  const create = useMutation({
    mutationFn: () =>
      api.createUnit({
        property_id: propertyId,
        name: name.trim(),
        floor: Number(floor) || parseInt(name.trim()[0] ?? '', 10) || 1,
        rent_monthly: sample?.rent_monthly,
        rate_daily: sample?.rate_daily,
        deposit: sample?.deposit,
        width: sample?.width,
        length: sample?.length,
        height: sample?.height,
        layout: sample?.layout,
      }),
    onSuccess: async () => {
      toast.success('เพิ่มห้องแล้ว')
      await invalidate('units', 'dashboard', 'org-info')
      onOpenChange(false)
    },
  })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) create.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>เพิ่มห้อง</DialogTitle>
        <DialogDescription>
          {sample ? `ใช้ราคาและผังห้องจากห้อง ${sample.name} เป็นค่าเริ่มต้น` : 'ปรับราคาและขนาดได้ภายหลัง'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <Field label="หมายเลขห้อง" htmlFor="nu-name">
          <Input
            id="nu-name"
            value={name}
            placeholder="เช่น 305"
            autoFocus
            required
            onChange={(e) => {
              setName(e.target.value)
              if (!floorTouched) {
                const f = parseInt(e.target.value.trim()[0] ?? '', 10)
                setFloor(Number.isNaN(f) ? '' : String(f || 1))
              }
            }}
          />
        </Field>
        <Field label="ชั้น" htmlFor="nu-floor">
          <Input
            id="nu-floor"
            type="number"
            value={floor}
            placeholder="1"
            onChange={(e) => {
              setFloorTouched(true)
              setFloor(e.target.value)
            }}
          />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending && <Loader2 className="animate-spin" />}
          เพิ่มห้อง
        </Button>
      </DialogFooter>
    </form>
  )
}

export function AddUnitDialog(props: React.ComponentProps<typeof AddUnitForm>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <AddUnitForm {...props} />
      </DialogContent>
    </Dialog>
  )
}
