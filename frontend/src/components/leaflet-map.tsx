import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Property } from '@/lib/api'
import { KINDS } from '@/lib/format'
import { cn } from '@/lib/utils'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const pinIcon = (shortStay: boolean, extra = '') =>
  L.divIcon({
    className: '',
    html: `<div class="estate-pin ${shortStay ? 'short-stay' : ''} ${extra}"><span>${shortStay ? '★' : '⌂'}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30],
  })

const pickIcon = L.divIcon({
  className: '',
  html: '<div class="estate-pin" style="background:#e11d48"><span>●</span></div>',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
})

const TH_CENTER: L.LatLngTuple = [13.75, 100.5]

export function LeafletMap({
  properties,
  className,
  scrollWheelZoom = false,
  picked,
  onPick,
  onSelect,
}: {
  properties: Property[]
  className?: string
  scrollWheelZoom?: boolean
  /** ตำแหน่งที่เลือก (โหมดเลือกพิกัด) */
  picked?: { lat: number | null; lng: number | null } | null
  /** คลิกบนแผนที่เพื่อเลือกพิกัด */
  onPick?: (lat: number, lng: number) => void
  onSelect?: (p: Property) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  const pickMarker = useRef<L.Marker | null>(null)
  const pickRef = useRef(onPick)
  const selectRef = useRef(onSelect)
  useEffect(() => {
    pickRef.current = onPick
    selectRef.current = onSelect
  })

  // สร้างแผนที่ครั้งเดียว
  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { scrollWheelZoom, attributionControl: true }).setView(TH_CENTER, 6)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(m)
    markers.current = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => {
      pickRef.current?.(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6))
    })
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    const t = setTimeout(() => m.invalidateSize(), 200)
    return () => {
      clearTimeout(t)
      ro.disconnect()
      m.remove()
      map.current = null
      markers.current = null
      pickMarker.current = null
    }
  }, [scrollWheelZoom])

  // หมุดโครงการ
  useEffect(() => {
    const m = map.current
    const layer = markers.current
    if (!m || !layer) return
    layer.clearLayers()
    const pts: L.LatLngTuple[] = []
    for (const p of properties) {
      if (p.lat == null || p.lng == null) continue
      pts.push([p.lat, p.lng])
      const mk = L.marker([p.lat, p.lng], { icon: pinIcon(p.kind === 'short_stay') })
        .bindPopup(
          `<b>${esc(p.name)}</b><br><span style="opacity:.7">${esc(KINDS[p.kind] ?? p.kind)}</span>` +
            (p.address ? `<br>${esc(p.address)}` : ''),
        )
        .addTo(layer)
      mk.on('click', () => selectRef.current?.(p))
    }
    const hasPick = picked?.lat != null && picked?.lng != null
    if (hasPick) m.setView([picked!.lat!, picked!.lng!], Math.max(m.getZoom(), 14))
    else if (pts.length) m.fitBounds(pts, { padding: [40, 40], maxZoom: 13 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit เฉพาะเมื่อรายการโครงการเปลี่ยน
  }, [properties])

  // หมุดตำแหน่งที่เลือก
  useEffect(() => {
    const m = map.current
    if (!m) return
    const lat = picked?.lat
    const lng = picked?.lng
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      pickMarker.current?.remove()
      pickMarker.current = null
      return
    }
    if (!pickMarker.current) {
      pickMarker.current = L.marker([lat, lng], { icon: pickIcon, draggable: true }).addTo(m)
      pickMarker.current.on('dragend', () => {
        const ll = pickMarker.current!.getLatLng()
        pickRef.current?.(+ll.lat.toFixed(6), +ll.lng.toFixed(6))
      })
    } else {
      pickMarker.current.setLatLng([lat, lng])
    }
    if (!m.getBounds().contains([lat, lng])) m.panTo([lat, lng])
  }, [picked?.lat, picked?.lng])

  return <div ref={el} className={cn('isolate h-80 w-full', className)} />
}
