import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setNavigator } from '@/lib/query'

/** ให้โค้ดนอก React (เช่น toast action) นำทางผ่าน router ได้ */
export function NavigatorBridge() {
  const navigate = useNavigate()
  useEffect(() => {
    setNavigator((to) => navigate(to))
    return () => setNavigator(null)
  }, [navigate])
  return null
}
