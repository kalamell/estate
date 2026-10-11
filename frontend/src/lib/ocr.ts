// OCR ตัวเลขหน้าปัดมิเตอร์ด้วย Tesseract.js (โหลดแบบ lazy เพื่อลดขนาด bundle หลัก)
import type { Worker } from 'tesseract.js'

let worker: Worker | null = null
let workerPromise: Promise<Worker> | null = null
let progressListener: ((pct: number) => void) | null = null

async function getWorker(): Promise<Worker> {
  if (worker) return worker
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const w = await createWorker('eng', 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') progressListener?.(Math.round(m.progress * 100))
        },
      })
      await w.setParameters({ tessedit_char_whitelist: '0123456789.' })
      worker = w
      return w
    })().catch((e) => {
      workerPromise = null
      throw e
    })
  }
  return workerPromise
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'))
    img.src = src
  })
}

/** ปรับภาพเป็นขาวดำ เพิ่มคอนทราสต์ (threshold จากค่าเฉลี่ย) ก่อนส่งให้ Tesseract อ่านเฉพาะตัวเลข */
export async function preprocess(src: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(src)
  const scale = Math.min(1, 1600 / img.width)
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale)
  c.height = Math.round(img.height * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  let sum = 0
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]
    d.data[i] = d.data[i + 1] = d.data[i + 2] = g
    sum += g
  }
  const mean = sum / (d.data.length / 4)
  for (let i = 0; i < d.data.length; i += 4) {
    const v = d.data[i] > mean * 0.9 ? 255 : 0
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v
  }
  ctx.putImageData(d, 0, 0)
  return c
}

/** เลือกกลุ่มตัวเลขที่ยาวที่สุดจากข้อความ OCR */
export function pickReading(raw: string): string | null {
  const candidates = (raw.match(/\d+(\.\d+)?/g) || []).sort((a, b) => b.length - a.length)
  return candidates[0] ?? null
}

export interface OcrResult {
  raw: string
  value: string | null
}

/** อ่านตัวเลขจากรูป (object URL / data URL) — onProgress รับค่า 0–100 */
export async function readMeter(
  src: string,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> {
  progressListener = onProgress ?? null
  try {
    const w = await getWorker()
    const canvas = await preprocess(src)
    const { data } = await w.recognize(canvas)
    const raw = data.text.trim()
    return { raw, value: pickReading(raw) }
  } finally {
    progressListener = null
  }
}
