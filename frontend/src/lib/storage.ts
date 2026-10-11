// localStorage แบบปลอดภัย (บางเบราว์เซอร์/โหมดส่วนตัวอาจโยน error)
export function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export const LS = {
  unitsProperty: 'estate.unitsProperty',
  unitsView: 'estate.unitsView',
  meterProperty: 'estate.meterProperty',
}

/** token คำขอจองล่าสุดของแต่ละหน้าจอง (/stay/:slug) */
export const stayRequestKey = (slug: string) => `estate.stay.${slug}`
