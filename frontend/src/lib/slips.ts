// แจ้งชำระ + ตรวจสลิป: ป้ายสถานะ ชื่อธนาคาร และตัวช่วยที่ใช้ร่วมกัน
import type { NoticeStatus, OrgSlipSettings, PaymentNotice } from './api'
import type { Tone } from './format'

export { SLIP_RESULT } from './billing'

export const NOTICE_STATUS: Record<NoticeStatus, { label: string; tone: Tone }> = {
  pending: { label: 'รอตรวจสอบ', tone: 'mustard' },
  approved: { label: 'ยืนยันแล้ว', tone: 'green' },
  rejected: { label: 'ไม่ผ่าน', tone: 'red' },
}

export const NOTICE_CHANNEL: Record<PaymentNotice['channel'], string> = {
  portal: 'พอร์ทัล',
  line: 'LINE',
}

/** ยืนยันโดยระบบ (ตรวจกับธนาคารผ่าน + ตั้งค่ายืนยันอัตโนมัติ) */
export const isAutoApproved = (n: Pick<PaymentNotice, 'status' | 'reviewed_by_name'>) =>
  n.status === 'approved' && !n.reviewed_by_name

/** รหัสธนาคารบน QR สลิป → ชื่อธนาคาร (ตรงกับฝั่งเซิร์ฟเวอร์) */
export const BANKS: Record<string, string> = {
  '002': 'กรุงเทพ',
  '004': 'กสิกรไทย',
  '006': 'กรุงไทย',
  '011': 'ทหารไทยธนชาต',
  '014': 'ไทยพาณิชย์',
  '022': 'ซีไอเอ็มบี ไทย',
  '024': 'ยูโอบี',
  '025': 'กรุงศรีอยุธยา',
  '030': 'ออมสิน',
  '033': 'อาคารสงเคราะห์',
  '034': 'ธ.ก.ส.',
  '066': 'อิสลามแห่งประเทศไทย',
  '067': 'ทิสโก้',
  '069': 'เกียรตินาคินภัทร',
  '070': 'ไอซีบีซี (ไทย)',
  '071': 'ไทยเครดิต',
  '073': 'แลนด์ แอนด์ เฮ้าส์',
}

export const bankLabel = (code: string | null | undefined) =>
  !code ? '' : BANKS[code] ? `${BANKS[code]} (${code})` : `รหัสธนาคาร ${code}`

export const SLIP_PROVIDERS: { v: OrgSlipSettings['provider']; label: string }[] = [
  { v: 'none', label: 'ไม่ใช้ (อ่าน QR บนสลิปอย่างเดียว)' },
  { v: 'easyslip', label: 'EasySlip' },
  { v: 'slipok', label: 'SlipOK' },
]

export const PROVIDER_LABEL: Record<string, string> = {
  none: 'อ่าน QR ในระบบ',
  easyslip: 'EasySlip',
  slipok: 'SlipOK',
}
