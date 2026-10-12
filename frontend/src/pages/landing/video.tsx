// คลิปแนะนำระบบบนหน้าแรก — แสดงรูปปก + ปุ่มเล่นก่อน (ไม่โหลด player ของ YouTube/Vimeo จนกว่าผู้ชมจะกดเล่น)
// ก่อนกดมีเพียงรูปปกของ YouTube ที่โหลดจากภายนอก ส่วน Vimeo ใช้การ์ดสีของธีมแทนรูปปก
import { useState } from 'react'
import { Play } from 'lucide-react'
import type { PromoVideo } from '@/lib/api'
import { cn } from '@/lib/utils'

const CAPTION = 'ดูการใช้งานจริง 1 นาที'

export function PromoVideoSection({ video }: { video: PromoVideo | null | undefined }) {
  if (!video) return null
  return (
    <section aria-labelledby="video-title" className="border-b">
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <h2 id="video-title" className="text-2xl sm:text-3xl">
            {CAPTION}
          </h2>
          <p className="text-sm text-muted-foreground">จดมิเตอร์ ออกบิล ผู้เช่าจ่ายผ่านพอร์ทัล และออกใบเสร็จ</p>
        </div>
        {/* key: เปลี่ยนคลิปแล้วกลับไปเป็นรูปปกใหม่ */}
        <VideoFacade key={video.embed_url} video={video} />
      </div>
    </section>
  )
}

/** กรอบ 16:9 — ก่อนกดเป็นปุ่มรูปปก กดแล้วจึงใส่ iframe ของผู้ให้บริการ */
export function VideoFacade({ video, className }: { video: PromoVideo; className?: string }) {
  const [playing, setPlaying] = useState(false)
  const title = `${CAPTION} — คลิปแนะนำระบบ Estate`
  return (
    <div className={cn('relative aspect-video overflow-hidden rounded-lg border bg-muted shadow-sm', className)}>
      {playing ? (
        <iframe
          src={video.embed_url}
          title={title}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`เล่นคลิป: ${CAPTION}`}
          className="group absolute inset-0 block size-full cursor-pointer text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              // รูป hqdefault ของ YouTube เป็น 4:3 มีขอบดำบน-ล่าง → ครอบให้เต็มกรอบ 16:9
              className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <PosterCard />
          )}
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <span
            aria-hidden
            className="absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-white/70 transition-transform group-hover:scale-105 sm:size-20"
          >
            <Play className="size-7 translate-x-0.5 fill-current sm:size-8" />
          </span>
          <span className="absolute right-4 bottom-4 left-4 flex items-center gap-2 text-sm font-medium text-white sm:text-base">
            <span className="rounded-sm bg-black/45 px-2 py-1 backdrop-blur-sm">{CAPTION}</span>
          </span>
        </button>
      )}
    </div>
  )
}

/** รูปปกแทนสำหรับ Vimeo (ไม่มี URL รูปปกที่ใช้ได้โดยไม่เรียก API ภายนอก) */
function PosterCard() {
  return (
    <span aria-hidden className="absolute inset-0 grid place-items-center bg-primary text-primary-foreground">
      <span
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <span className="relative -mt-28 text-center sm:-mt-36">
        <span className="block text-2xl font-semibold tracking-tight sm:text-3xl">Estate</span>
        <span className="mt-1 block text-sm opacity-80">ระบบหลังบ้านสำหรับหอพักและห้องเช่า</span>
      </span>
    </span>
  )
}
