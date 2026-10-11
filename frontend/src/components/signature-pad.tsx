// ช่องลงลายมือชื่อ (นิ้ว/ปากกา/เมาส์) → PNG พื้นขาว
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface SignaturePadHandle {
  /** null = ยังไม่ได้เซ็น */
  toBlob: () => Promise<Blob | null>
  clear: () => void
}

const INK = '#1c1b19'

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { className?: string; onChange?: (signed: boolean) => void; label?: string }
>(function SignaturePad({ className, onChange, label = 'ลงชื่อผู้รับ' }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [signed, setSigned] = useState(false)

  const setup = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    // ใช้ขนาด layout (ไม่รวม transform ของแอนิเมชันเปิด dialog)
    const rect = { width: c.offsetWidth, height: c.offsetHeight }
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    c.width = Math.round(rect.width * dpr)
    c.height = Math.round(rect.height * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.4
    ctx.strokeStyle = INK
  }, [])

  useEffect(() => {
    setup()
  }, [setup])

  const mark = (v: boolean) => {
    setSigned(v)
    onChange?.(v)
  }

  const clear = useCallback(() => {
    setup()
    setSigned(false)
    onChange?.(false)
  }, [setup, onChange])

  useImperativeHandle(
    ref,
    () => ({
      clear,
      toBlob: () =>
        new Promise<Blob | null>((resolve) => {
          const c = canvasRef.current
          if (!c || !signed) return resolve(null)
          c.toBlob((b) => resolve(b), 'image/png')
        }),
    }),
    [clear, signed],
  )

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget
    const r = c.getBoundingClientRect()
    const sx = r.width ? c.offsetWidth / r.width : 1
    const sy = r.height ? c.offsetHeight / r.height : 1
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }

  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="relative overflow-hidden rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          className="block h-36 w-full touch-none cursor-crosshair"
          aria-label={label}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = true
            const p = point(e)
            last.current = p
            const ctx = e.currentTarget.getContext('2d')
            if (ctx) {
              ctx.beginPath()
              ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2)
              ctx.fillStyle = INK
              ctx.fill()
            }
            if (!signed) mark(true)
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return
            const ctx = e.currentTarget.getContext('2d')
            if (!ctx) return
            const p = point(e)
            ctx.beginPath()
            ctx.moveTo(last.current.x, last.current.y)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
            last.current = p
          }}
          onPointerUp={() => {
            drawing.current = false
            last.current = null
          }}
          onPointerCancel={() => {
            drawing.current = false
            last.current = null
          }}
        />
        {!signed && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-[#8a877f]">
            ใช้นิ้วเซ็นชื่อในกรอบนี้
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-[#d6d3cb]" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{signed ? 'ลงชื่อแล้ว' : label}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={clear} disabled={!signed}>
          <Eraser /> ล้าง
        </Button>
      </div>
    </div>
  )
})
