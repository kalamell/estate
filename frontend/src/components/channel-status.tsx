import type { ChannelFeed } from '@/lib/api'
import { channelOf } from '@/lib/channels'
import { cn } from '@/lib/utils'
import { ToneBadge } from '@/components/common'

export function ChannelStatusBadge({ feed }: { feed: Pick<ChannelFeed, 'last_status'> }) {
  if (feed.last_status === 'ok') return <ToneBadge tone="green">ปกติ</ToneBadge>
  if (feed.last_status === 'error') return <ToneBadge tone="red">ผิดพลาด</ToneBadge>
  return <ToneBadge tone="grey">ยังไม่ซิงก์</ToneBadge>
}

/** จุดสีของช่องทาง (ไม่มีสี = primary ของธีม) */
export function ChannelDot({ source, className }: { source: string; className?: string }) {
  const c = channelOf(source).color
  return (
    <span
      aria-hidden
      className={cn('size-2.5 shrink-0 rounded-full bg-primary', className)}
      style={c ? { backgroundColor: c } : undefined}
    />
  )
}
