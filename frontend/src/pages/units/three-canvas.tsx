import { useEffect, useRef } from 'react'
import type { Unit } from '@/lib/api'
import { renderBuilding, renderRoom, type BuildingStage, type RoomSpec, type RoomStage } from '@/lib/three-view'
import { cn } from '@/lib/utils'

/** มุมมองอาคาร 3D — สร้าง renderer ครั้งเดียว แล้วอัปเดตเมื่อรายการห้องเปลี่ยน */
export function BuildingView({
  units,
  onPick,
  className,
}: {
  units: Unit[]
  onPick: (u: Unit) => void
  className?: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const stage = useRef<BuildingStage | null>(null)
  const pick = useRef(onPick)
  const initial = useRef(units)
  useEffect(() => {
    pick.current = onPick
  })
  useEffect(() => {
    if (!el.current) return
    stage.current = renderBuilding(el.current, initial.current, (u) => pick.current(u))
    return () => {
      stage.current?.dispose()
      stage.current = null
    }
  }, [])
  useEffect(() => {
    stage.current?.update(units)
  }, [units])
  return <div ref={el} className={cn('h-full w-full', className)} />
}

/** มุมมองห้องเดี่ยว 3D พร้อมเฟอร์นิเจอร์ */
export function RoomView({ room, className }: { room: RoomSpec; className?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const stage = useRef<RoomStage | null>(null)
  const initial = useRef(room)
  useEffect(() => {
    if (!el.current) return
    stage.current = renderRoom(el.current, initial.current)
    return () => {
      stage.current?.dispose()
      stage.current = null
    }
  }, [])
  useEffect(() => {
    stage.current?.update(room)
  }, [room])
  return <div ref={el} className={cn('h-full w-full', className)} />
}
