import { ApiError, type OrgInfo, type OrgLegal, type OrgPrivacyInput } from './api'
import { DEFAULT_COLOR_THEME, isColorTheme, type ColorThemeId } from './themes'

/** ลิงก์หน้าพิมพ์เอกสาร (เปิดแท็บใหม่ + สั่งพิมพ์อัตโนมัติ) */
export const printHref = (kind: 'invoice' | 'receipt' | 'move-out' | 'contract', id: number) =>
  `/print/${kind}/${id}?autoprint=1`

export const portalUrl = (token: string) => `${window.location.origin}/p/${token}`

/** ข้อความแสดงเมื่อโหลดเอกสารไม่สำเร็จ */
export const docErrorText = (e: unknown, lang: 'th' | 'en' = 'th') =>
  e instanceof ApiError && e.status === 404
    ? lang === 'en'
      ? 'Document not found, or you do not have access'
      : 'ไม่พบเอกสาร หรือคุณไม่มีสิทธิ์เข้าถึง'
    : (e as Error)?.message || (lang === 'en' ? 'Could not load the document' : 'โหลดเอกสารไม่สำเร็จ')

/** ดึงข้อมูลผู้ออกเอกสารจาก org (ใส่ค่าเริ่มต้นเมื่อ backend ยังไม่ส่งมา) */
export function orgLegalOf(info: OrgInfo): OrgLegal {
  const o = info.org
  return {
    legal_name: o.legal_name ?? '',
    tax_id: o.tax_id ?? '',
    branch_code: o.branch_code || '00000',
    address: o.address ?? '',
    phone: o.phone ?? '',
    vat_registered: !!o.vat_registered,
    vat_rate: o.vat_rate ?? 7,
    receipt_note: o.receipt_note ?? '',
  }
}

/**
 * ค่าตั้ง PDPA ปัจจุบัน — ส่งกลับไปพร้อม PUT /api/org จากแท็บอื่นเพื่อไม่ให้ค่าหาย
 * (ข้อความมาตรฐาน → ส่งค่าว่าง เพื่อให้ยังใช้ข้อความมาตรฐานต่อไป)
 */
export function orgPrivacyOf(info: OrgInfo): Partial<OrgPrivacyInput> {
  const o = info.org
  const out: Partial<OrgPrivacyInput> = {}
  if (o.privacy_notice !== undefined) out.privacy_notice = o.privacy_notice_custom ? o.privacy_notice : ''
  if (o.dpo_contact !== undefined) out.dpo_contact = o.dpo_contact
  if (o.retention_years !== undefined) out.retention_years = o.retention_years
  return out
}

/** ธีมสีขององค์กร (ค่าเริ่มต้น ink) — ส่งกลับไปพร้อม PUT /api/org เพื่อไม่ให้ค่าหาย */
export const orgThemeOf = (info: OrgInfo): ColorThemeId =>
  isColorTheme(info.org.theme) ? info.org.theme : DEFAULT_COLOR_THEME

export const timeAgo = (iso: string) => {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'เมื่อสักครู่'
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} วันที่แล้ว`
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
