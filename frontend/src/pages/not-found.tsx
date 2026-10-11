import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common'

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="ไม่พบหน้าที่ต้องการ"
      description="ลิงก์อาจไม่ถูกต้องหรือหน้านี้ถูกย้ายแล้ว"
      action={
        <Button asChild>
          <Link to="/">กลับหน้าภาพรวม</Link>
        </Button>
      }
    />
  )
}
