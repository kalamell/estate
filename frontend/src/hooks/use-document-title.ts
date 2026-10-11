import { useEffect } from 'react'

/** ตั้ง document.title ระหว่างที่หน้านี้แสดงอยู่ แล้วคืนค่าเดิมเมื่อออกจากหน้า */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    const prev = document.title
    document.title = title
    return () => {
      document.title = prev
    }
  }, [title])
}
