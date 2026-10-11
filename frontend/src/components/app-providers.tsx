import { Outlet } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmProvider } from '@/components/confirm'

/**
 * provider ที่หน้าในแอปใช้ (tooltip, กล่องยืนยัน) — โหลดแบบ lazy เป็น layout route
 * หน้าแนะนำระบบ (/ ตอนยังไม่ล็อกอิน และ /pricing) อยู่นอก layout นี้ จึงไม่ต้องดาวน์โหลดโค้ดส่วนนี้
 */
export default function AppProviders() {
  return (
    <TooltipProvider delayDuration={300}>
      <ConfirmProvider>
        <Outlet />
      </ConfirmProvider>
    </TooltipProvider>
  )
}
