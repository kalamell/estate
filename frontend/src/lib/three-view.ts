// มุมมอง 3D: (1) ห้องเดี่ยวพร้อมเฟอร์นิเจอร์ (2) อาคารทั้งหลัง แสดงสถานะแต่ละห้องด้วยสี
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Furniture, Unit, UnitStatus } from './api'

export const STATUS_COLORS: Record<UnitStatus, number> = {
  vacant: 0x10b981,
  reserved: 0xf59e0b,
  occupied: 0x6366f1,
  maintenance: 0x94a3b8,
}

const FURNITURE_COLORS: Record<string, string> = {
  bed: '#c7d2fe',
  desk: '#d6b38a',
  wardrobe: '#a78b6d',
  sofa: '#fda4af',
  fridge: '#e5e7eb',
  tv: '#1f2937',
  bathroom: '#e2e8f0',
  kitchen: '#fde68a',
}

export interface RoomSpec {
  width: number
  length: number
  height: number
  status: UnitStatus
  layout: Furniture[]
}

interface BaseStage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  dispose: () => void
}

export interface RoomStage {
  update: (room: RoomSpec) => void
  dispose: () => void
}

export interface BuildingStage {
  update: (units: Unit[]) => void
  dispose: () => void
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    mesh.geometry?.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (mat) {
      for (const m of ([] as THREE.Material[]).concat(mat)) {
        const tex = (m as THREE.SpriteMaterial).map
        tex?.dispose()
        m.dispose()
      }
    }
  })
}

function createStage(container: HTMLElement): BaseStage {
  const width = container.clientWidth || 600
  const height = container.clientHeight || 400
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = true
  renderer.domElement.style.touchAction = 'none'
  container.innerHTML = ''
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI / 2.05

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.1))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4)
  sun.position.set(8, 14, 10)
  sun.castShadow = true
  scene.add(sun)

  let frame = 0
  const loop = () => {
    controls.update()
    renderer.render(scene, camera)
    frame = requestAnimationFrame(loop)
  }
  loop()

  const onResize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const ro = new ResizeObserver(onResize)
  ro.observe(container)

  const dispose = () => {
    cancelAnimationFrame(frame)
    ro.disconnect()
    controls.dispose()
    disposeObject(scene)
    renderer.dispose()
    container.innerHTML = ''
  }
  return { renderer, scene, camera, controls, dispose }
}

function box(
  w: number,
  h: number,
  d: number,
  color: THREE.ColorRepresentation,
  opts: THREE.MeshStandardMaterialParameters = {},
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts }),
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function label(text: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = '600 64px "IBM Plex Sans Thai", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(15,23,42,0.45)'
  ctx.shadowBlur = 8
  ctx.fillText(text, 128, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
  sprite.scale.set(1.4, 0.7, 1)
  sprite.renderOrder = 10
  return sprite
}

/** ห้องเดี่ยว: พื้น ผนัง 3 ด้าน และเฟอร์นิเจอร์จาก layout (พิกัดจากกึ่งกลางห้อง หน่วยเมตร) */
export function renderRoom(container: HTMLElement, initial: RoomSpec): RoomStage {
  const stage = createStage(container)
  const { scene, camera, controls } = stage
  let group: THREE.Group | null = null
  let framedSize = -1

  const update = (room: RoomSpec) => {
    if (group) {
      scene.remove(group)
      disposeObject(group)
    }
    group = new THREE.Group()
    const W = Math.max(0.5, Number(room.width) || 4)
    const L = Math.max(0.5, Number(room.length) || 6)
    const H = Math.max(1, Number(room.height) || 2.7)

    const floor = box(W, 0.05, L, 0xf5efe6)
    floor.position.y = -0.025
    group.add(floor)

    const wallColor = 0xe2e8f0
    const wallOpts = { transparent: true, opacity: 0.35 }
    const wt = 0.08
    const back = box(W, H, wt, wallColor, wallOpts)
    back.position.set(0, H / 2, -L / 2)
    const left = box(wt, H, L, wallColor, wallOpts)
    left.position.set(-W / 2, H / 2, 0)
    const right = box(wt, H, L, wallColor, wallOpts)
    right.position.set(W / 2, H / 2, 0)
    group.add(back, left, right)

    const ring = box(W + 0.3, 0.02, L + 0.3, STATUS_COLORS[room.status] ?? 0x94a3b8)
    ring.position.y = -0.06
    group.add(ring)

    for (const f of room.layout || []) {
      const color = f.color || FURNITURE_COLORS[f.kind] || '#cbd5e1'
      const isBath = f.kind === 'bathroom'
      const m = box(f.w, f.h, f.d, color, isBath ? { transparent: true, opacity: 0.55 } : {})
      m.position.set(f.x, f.h / 2, f.z)
      group.add(m)
    }

    const size = Math.ceil(Math.max(W, L)) + 4
    const grid = new THREE.GridHelper(size, size, 0xcbd5e1, 0xe2e8f0)
    grid.position.y = -0.07
    group.add(grid)
    scene.add(group)

    // ตั้งกล้องใหม่เฉพาะเมื่อขนาดห้องเปลี่ยน เพื่อไม่ให้มุมกล้องกระโดดตอนลากเฟอร์นิเจอร์
    const r = Math.max(W, L)
    if (r !== framedSize) {
      framedSize = r
      camera.position.set(r * 0.9, r * 1.1, r * 1.4)
      controls.target.set(0, H / 3, 0)
    }
  }
  update(initial)
  return { update, dispose: stage.dispose }
}

/** อาคาร: แต่ละห้องเป็นกล่องเรียงตามชั้น สีตามสถานะ คลิกเพื่อเลือกห้อง */
export function renderBuilding(
  container: HTMLElement,
  initial: Unit[],
  onPick?: (u: Unit) => void,
): BuildingStage {
  const stage = createStage(container)
  const { scene, camera, controls, renderer } = stage
  let group: THREE.Group | null = null
  let pickables: THREE.Mesh[] = []
  let framed = ''

  const update = (units: Unit[]) => {
    if (group) {
      scene.remove(group)
      disposeObject(group)
    }
    group = new THREE.Group()
    pickables = []
    const floors: Record<number, Unit[]> = {}
    for (const u of units) (floors[u.floor] ||= []).push(u)
    const floorNums = Object.keys(floors)
      .map(Number)
      .sort((a, b) => a - b)
    const maxPerFloor = Math.max(1, ...floorNums.map((f) => floors[f].length))
    const cellW = 2.2
    const cellD = 3
    const floorH = 1.6

    floorNums.forEach((fl, fi) => {
      const row = floors[fl]
      const slab = box(maxPerFloor * cellW + 0.4, 0.12, cellD + 0.6, 0xe2e8f0)
      slab.position.set(0, fi * floorH - 0.06, 0)
      group!.add(slab)
      row.forEach((u, i) => {
        const x = (i - (row.length - 1) / 2) * cellW
        const m = box(cellW - 0.25, floorH - 0.3, cellD, STATUS_COLORS[u.status] ?? 0x94a3b8, {
          transparent: true,
          opacity: 0.88,
        })
        m.position.set(x, fi * floorH + (floorH - 0.3) / 2, 0)
        m.userData.unit = u
        pickables.push(m)
        group!.add(m)
        const tag = label(u.name)
        tag.position.set(x, fi * floorH + (floorH - 0.3) / 2, cellD / 2 + 0.05)
        group!.add(tag)
      })
    })

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(maxPerFloor * cellW, 8), 48),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 1, transparent: true, opacity: 0.35 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.13
    ground.receiveShadow = true
    group.add(ground)
    scene.add(group)

    const key = `${floorNums.length}x${maxPerFloor}`
    if (key !== framed) {
      framed = key
      const totalH = floorNums.length * floorH
      const span = Math.max(maxPerFloor * cellW, totalH)
      camera.position.set(span * 0.55, totalH * 0.75 + 1.5, span * 0.85 + 2.5)
      controls.target.set(0, totalH / 2, 0)
    }
  }

  const ray = new THREE.Raycaster()
  const ptr = new THREE.Vector2()
  let hovered: THREE.Mesh | null = null
  const hitTest = (e: PointerEvent | MouseEvent) => {
    const r = renderer.domElement.getBoundingClientRect()
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ptr, camera)
    return (ray.intersectObjects(pickables)[0]?.object as THREE.Mesh | undefined) ?? null
  }
  const setEmissive = (m: THREE.Mesh | null, hex: number) => {
    if (m) (m.material as THREE.MeshStandardMaterial).emissive.setHex(hex)
  }
  const onMove = (e: PointerEvent) => {
    const hit = hitTest(e)
    if (hovered && hovered !== hit) setEmissive(hovered, 0x000000)
    hovered = hit
    setEmissive(hit, 0x333333)
    renderer.domElement.style.cursor = hit ? 'pointer' : 'grab'
  }
  // แยกคลิกออกจากการลากหมุนกล้อง
  let down: { x: number; y: number } | null = null
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: PointerEvent) => {
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    down = null
    if (moved > 6) return
    const hit = hitTest(e)
    if (hit) onPick?.(hit.userData.unit as Unit)
  }
  const el = renderer.domElement
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onUp)

  update(initial)
  return {
    update,
    dispose: () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      stage.dispose()
    },
  }
}
