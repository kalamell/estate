import { Link } from 'react-router-dom'
import { ArrowRight, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/** ชวนนำเข้าห้อง/ผู้เช่าจาก Excel เมื่อองค์กรยังไม่มีห้อง */
export function ImportCta({ className }: { className?: string }) {
  return (
    <Card className={cn('flex-row flex-wrap items-center gap-4 border-dashed px-5 py-4', className)}>
      <div className="hidden size-10 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground sm:grid">
        <FileSpreadsheet className="size-5" />
      </div>
      <div className="min-w-[14rem] flex-1">
        <div className="font-medium">มีรายชื่อห้องและผู้เช่าใน Excel อยู่แล้ว?</div>
        <p className="text-sm text-muted-foreground">
          นำเข้าห้อง ผู้เช่า สัญญา และเลขมิเตอร์จากไฟล์เดิมของคุณได้ในไม่กี่นาที — ไม่ต้องใช้แม่แบบ
        </p>
      </div>
      <Button asChild className="w-full sm:w-auto">
        <Link to="/import">
          นำเข้าจาก Excel/CSV <ArrowRight />
        </Link>
      </Button>
    </Card>
  )
}
