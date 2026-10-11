// API client + types สำหรับ Estate backend (Axum)
// - ใช้คุกกี้ HttpOnly ที่เซิร์ฟเวอร์ตั้งให้ (same-origin, credentials: 'include')
// - ทุกคำขอที่ผูกกับองค์กรจะส่ง header X-Org-Id

import { toast } from 'sonner'
import type { ColorThemeId } from './themes'
import type { Lang } from './i18n'
export type { ColorThemeId } from './themes'

// ===================== Types: auth / SaaS =====================

export type Role = 'owner' | 'admin' | 'staff'
export type OrgStatus = 'trial' | 'active' | 'suspended' | 'cancelled'

export interface User {
  id: number
  name: string
  email: string
  is_super_admin: boolean
}

export interface OrgSummary {
  id: number
  name: string
  role: Role
  status: OrgStatus
  package_name: string
}

export interface Me {
  user: User
  orgs: OrgSummary[]
}

export interface Features {
  ocr: boolean
  view3d: boolean
  short_stay: boolean
  invoices: boolean
  portal: boolean
  reports: boolean
}

/** ข้อมูลผู้ออกเอกสาร (ใบแจ้งหนี้/ใบเสร็จ) */
export interface OrgLegal {
  legal_name: string
  tax_id: string
  /** "00000" = สำนักงานใหญ่ */
  branch_code: string
  address: string
  phone: string
  vat_registered: boolean
  vat_rate: number
  receipt_note: string
}

export interface OrgProfile extends Partial<OrgLegal> {
  id: number
  name: string
  status: OrgStatus
  ends_at: string | null
  created_at: string
  /** ธีมสีค่าเริ่มต้นขององค์กร */
  theme?: ColorThemeId | string
  /** การตั้งค่า LINE Official Account */
  line?: LineSettings
  /** ประกาศความเป็นส่วนตัว (ข้อความที่ใช้จริง — ค่าเริ่มต้นสร้างโดยเซิร์ฟเวอร์) */
  privacy_notice?: string
  /** true = องค์กรแก้ไขข้อความเอง */
  privacy_notice_custom?: boolean
  /** ผู้ติดต่อเรื่องข้อมูลส่วนบุคคล (DPO) */
  dpo_contact?: string
  /** ระยะเวลาเก็บข้อมูลหลังสิ้นสุดความสัมพันธ์ (ปี) */
  retention_years?: number
}

/** ตั้งค่า PDPA — privacy_notice ว่าง = กลับไปใช้ข้อความมาตรฐาน */
export interface OrgPrivacyInput {
  privacy_notice: string
  dpo_contact: string
  /** 1–20 */
  retention_years: number
}

export type OrgUpdate = { name: string; theme?: ColorThemeId } & OrgLegal & Partial<OrgPrivacyInput>

// ----- LINE OA -----
export interface LineSettings {
  enabled: boolean
  channel_id: string
  /** เช่น "@123abcde" */
  basic_id: string
  has_secret: boolean
  has_token: boolean
  webhook_url: string
  auto_invoice: boolean
  auto_receipt: boolean
  auto_ticket_reply: boolean
  auto_remind: boolean
  /** แจ้งงานแม่บ้านให้พนักงานที่เชื่อม LINE */
  auto_housekeeping?: boolean
  /** แจ้งพัสดุถึงผู้เช่าอัตโนมัติ */
  auto_parcel?: boolean
  linked_tenants: number
  add_friend_url: string | null
}

export interface LineSettingsInput {
  enabled: boolean
  channel_id: string
  basic_id: string
  /** ส่งเฉพาะเมื่อผู้ใช้กรอกค่าใหม่ (ไม่ส่ง = ใช้ค่าเดิม) */
  channel_secret?: string
  channel_access_token?: string
  auto_invoice: boolean
  auto_receipt: boolean
  auto_ticket_reply: boolean
  auto_remind: boolean
  auto_housekeeping: boolean
  auto_parcel: boolean
}

export interface LineBotInfo {
  display_name: string
  basic_id: string
  picture_url: string | null
}

export type LineMessageKind =
  | 'invoice'
  | 'receipt'
  | 'ticket_reply'
  | 'reminder'
  | 'portal_link'
  | 'reply'
  | 'welcome'
  | 'linked'

export interface LineMessage {
  id: number
  tenant_id: number | null
  tenant_name: string | null
  kind: LineMessageKind | string
  status: 'sent' | 'failed'
  error: string | null
  created_at: string
}

/** โค้ดเชื่อมบัญชี LINE ของผู้เช่า */
export interface LineLinkCode {
  code: string
  /** เปิดแชท OA พร้อมข้อความ "เชื่อมบัญชี <code>" */
  link_url: string
  add_friend_url: string | null
  expires_at: string
}

export interface OrgInfo {
  org: OrgProfile
  package: {
    id: number
    name: string
    description: string
    price_monthly: number
    max_properties: number
    max_units: number
    max_members: number
    features: Features
  }
  usage: { properties: number; units: number; members: number }
  /** สรุปสถานะการต่ออายุ (สำหรับแถบแจ้งเตือน) */
  billing?: BillingSummary
  role: Role
}

export interface Member {
  user_id: number
  name: string
  email: string
  role: Role
  created_at: string
  /** เชื่อม LINE (รับแจ้งงาน) แล้ว */
  line_linked?: boolean
}

/** โค้ดเชื่อม LINE ของพนักงาน (ผู้ใช้ปัจจุบัน) — ข้อความ "เชื่อมพนักงาน <code>" */
export type StaffLineLinkCode = LineLinkCode

export interface AdminStats {
  orgs: number
  active_orgs: number
  trial_orgs: number
  suspended_orgs: number
  users: number
  properties: number
  units: number
  mrr: number
}

export interface PackageInput {
  name: string
  description: string
  price_monthly: number
  /** 0 = คิดอัตโนมัติจาก ราคารายเดือน × yearly_months */
  price_yearly: number
  max_properties: number
  max_units: number
  max_members: number
  features: Features
  is_active: boolean
  is_default: boolean
  sort_order: number
}

export interface Package extends PackageInput {
  id: number
  org_count: number
}

export interface AdminOrg {
  id: number
  name: string
  owner_name: string | null
  owner_email: string | null
  package_id: number
  package_name: string
  status: OrgStatus
  ends_at: string | null
  properties: number
  units: number
  members: number
  created_at: string
}

export interface AdminUser {
  id: number
  name: string
  email: string
  is_super_admin: boolean
  is_active: boolean
  org_count: number
  created_at: string
}

// ===================== Types: ค่าบริการแพลตฟอร์ม (SaaS billing) =====================

export type BillingCycle = 'monthly' | 'yearly'
export type SubInvoiceStatus = 'pending' | 'review' | 'paid' | 'void'

/** สรุปสถานะการต่ออายุ (GET /api/org → billing, GET /api/billing → summary) */
export interface BillingSummary {
  /** วันที่เหลือก่อนหมดอายุ (ติดลบ = เลยมาแล้ว), null = ไม่มีวันหมดอายุ */
  days_left: number | null
  grace_until: string | null
  /** หมดอายุแล้วแต่ยังอยู่ในช่วงผ่อนผัน (ยังใช้งานได้ตามปกติ) */
  in_grace: boolean
  open_invoice: {
    id: number
    doc_no: string
    total: number
    due_date: string
    status: SubInvoiceStatus
    reject_reason: string | null
  } | null
}

/** ข้อมูลผู้ให้บริการแพลตฟอร์ม (ตั้งค่าโดย super admin) */
export interface PlatformSettings {
  company_name: string
  tax_id: string
  branch_code: string
  address: string
  phone: string
  email: string
  vat_registered: boolean
  vat_rate: number
  promptpay_id: string
  bank_info: string
  /** ออกใบแจ้งหนี้ต่ออายุล่วงหน้ากี่วัน */
  remind_days: number
  /** ใช้งานต่อได้หลังหมดอายุกี่วัน */
  grace_days: number
  /** ราคารายปีอัตโนมัติ = ราคารายเดือน × จำนวนเดือนนี้ */
  yearly_months: number
}

export interface SubInvoice {
  id: number
  org_id: number
  org_name: string
  doc_no: string
  /** renewal = ต่ออายุแพ็กเกจเดิม, change = เปลี่ยนแพ็กเกจ/รอบบิล */
  kind: 'renewal' | 'change'
  package_id: number
  package_name: string
  cycle: BillingCycle
  period_start: string
  period_end: string
  /** ราคาแพ็กเกจ (รวม VAT) */
  price: number
  /** ส่วนลดจากมูลค่าวันที่เหลือของแพ็กเกจเดิม */
  credit: number
  /** มูลค่าก่อน VAT */
  subtotal: number
  vat_amount: number
  total: number
  due_date: string
  status: SubInvoiceStatus
  slip_url: string | null
  slip_at: string | null
  reject_reason: string | null
  paid_at: string | null
  payment_ref: string | null
  receipt_no: string | null
  issuer: {
    name: string
    tax_id: string
    branch_code: string
    address: string
    phone: string
    email: string
    vat_registered: boolean
    vat_rate: number
  }
  payer: { name: string; tax_id: string; branch_code: string; address: string; phone: string }
  void_reason: string | null
  created_at: string
  /** ผลตรวจสลิปอัตโนมัติล่าสุด (null = ยังไม่ได้ตรวจ) */
  slip_result?: SlipResult | null
  slip_message?: string | null
}

export type SlipResult = 'verified' | 'readable' | 'unreadable' | 'duplicate' | 'mismatch' | 'error'

/** ผู้ให้บริการตรวจสลิปสำหรับค่าแพ็กเกจ */
export interface PlatformSlipSettings {
  provider: 'none' | 'easyslip' | 'slipok'
  has_key: boolean
  branch_id: string
  auto_approve: boolean
}

export interface SubPayment {
  invoice: SubInvoice
  /** QR พร้อมเพย์แบบระบุยอด (เฉพาะใบที่ยังไม่ชำระ และตั้งค่าพร้อมเพย์แล้ว) */
  promptpay_payload: string | null
  bank_info: string
  baht_text: string
}

export interface BillingPackage {
  id: number
  name: string
  description: string
  price_monthly: number
  /** ราคารายปีจริง (คำนวณอัตโนมัติแล้วถ้าไม่ได้กำหนด) */
  price_yearly: number
  max_properties: number
  max_units: number
  max_members: number
  features: Features
  current: boolean
}

export interface BillingOverview {
  platform: {
    company_name: string
    bank_info: string
    has_promptpay: boolean
    vat_registered: boolean
    vat_rate: number
    grace_days: number
    yearly_months: number
  }
  subscription: {
    package_id: number
    package_name: string
    cycle: BillingCycle
    status: OrgStatus
    ends_at: string | null
    price: number
    read_only: boolean
  }
  summary: BillingSummary
  packages: BillingPackage[]
  open_invoice: SubPayment | null
  invoices: SubInvoice[]
}

export interface AdminBilling {
  settings: PlatformSettings
  summary: { review: number; pending: number; overdue: number; revenue_month: number; revenue_year: number }
  invoices: SubInvoice[]
  slip?: PlatformSlipSettings
}

// ===================== Types: domain =====================

export type PropertyKind = 'dormitory' | 'apartment' | 'condo' | 'house' | 'short_stay'
export type UnitStatus = 'vacant' | 'reserved' | 'occupied' | 'maintenance'
export type BookingKind = 'lease' | 'short_stay'
export type BookingStatus = 'reserved' | 'active' | 'completed' | 'cancelled'
export type DepositStatus = 'pending' | 'paid' | 'refunded' | 'forfeited'
export type MeterType = 'electric' | 'water'
export type FurnitureKind =
  | 'bed'
  | 'desk'
  | 'wardrobe'
  | 'sofa'
  | 'fridge'
  | 'tv'
  | 'bathroom'
  | 'kitchen'

export interface Property {
  id: number
  name: string
  kind: PropertyKind
  address: string
  lat: number | null
  lng: number | null
  electric_rate: number
  water_rate: number
  promptpay_id: string | null
  late_fee_type: LateFeeType
  late_fee_amount: number
  late_fee_grace_days: number
  /** หน้าจองออนไลน์ (/stay/:slug) */
  booking_enabled?: boolean
  /** [a-z0-9-] 3–40 ตัว */
  booking_slug?: string | null
  booking_intro?: string
  /** "14:00" */
  check_in_time?: string
  /** "12:00" */
  check_out_time?: string
  min_nights?: number
  /** 0–100 (% ของยอดรวม) */
  deposit_percent?: number
  created_at: string
}

export type LateFeeType = 'none' | 'flat' | 'per_day'

export type PropertyInput = Omit<Property, 'id' | 'created_at'>

export interface Furniture {
  kind: FurnitureKind | string
  x: number
  z: number
  w: number
  d: number
  h: number
  color?: string | null
}

export interface Unit {
  id: number
  property_id: number
  name: string
  floor: number
  rent_monthly: number
  rate_daily: number
  deposit: number
  status: UnitStatus
  width: number
  length: number
  height: number
  layout: Furniture[]
  note: string
  extra_charges: ExtraCharge[]
  /** สถานะทำความสะอาด */
  housekeeping_status?: HousekeepingStatus
}

export interface ExtraCharge {
  label: string
  amount: number
  vatable: boolean
}

export type UnitInput = Partial<Omit<Unit, 'id'>> & { property_id: number; name: string }

export type ConsentSource = 'portal' | 'staff' | 'online_booking'

export interface Tenant {
  id: number
  full_name: string
  phone: string
  email: string
  /** ผู้ใช้ที่ไม่ใช่ผู้ดูแลจะได้ค่าที่ปิดบัง เช่น "•••••••••1234" */
  id_card: string
  note: string
  tax_id: string
  address: string
  branch_code: string
  portal_token: string | null
  created_at: string
  line_linked?: boolean
  line_display_name?: string | null
  line_linked_at?: string | null
  /** PDPA: เวลาที่ได้รับความยินยอม */
  consent_at?: string | null
  consent_source?: ConsentSource | null
  /** ลบข้อมูลส่วนบุคคล (ทำให้ไม่ระบุตัวตน) แล้ว */
  anonymized_at?: string | null
  /** รหัสประเทศ 2 ตัวอักษร ('' หรือ 'TH' = ไทย/ไม่ระบุ) */
  nationality?: string
  gender?: Gender
  birth_date?: string | null
  /** วันที่เดินทางเข้าประเทศ */
  arrival_date?: string | null
  visa_type?: string
  visa_expiry?: string | null
  /** ภาษาที่ใช้ติดต่อ (LINE / พอร์ทัล) */
  lang?: Lang
}

export type Gender = '' | 'M' | 'F'

export type TenantInput = Pick<
  Tenant,
  'full_name' | 'phone' | 'email' | 'note' | 'tax_id' | 'address' | 'branch_code'
> & {
  /** ไม่ส่ง = ใช้ค่าเดิม (กันการส่งค่าที่ถูกปิดบังกลับไป) */
  id_card?: string
  /** เจ้าหน้าที่ยืนยันว่าได้รับความยินยอมจากผู้เช่าแล้ว */
  consent_obtained?: boolean
  /** ข้อมูลคนต่างชาติ — ไม่ส่ง = ไม่เปลี่ยน, วันที่ส่ง '' = ล้างค่า */
  nationality?: string
  gender?: Gender
  birth_date?: string
  arrival_date?: string
  visa_type?: string
  visa_expiry?: string
  /** ภาษาที่ใช้ติดต่อ — ไม่ส่ง = ไม่เปลี่ยน */
  lang?: Lang
}

// ----- PDPA -----
export type PrivacyRequestKind = 'access' | 'correction' | 'deletion' | 'objection' | 'withdraw_consent'
export type PrivacyRequestStatus = 'open' | 'done' | 'rejected'

export interface PrivacyRequest {
  id: number
  tenant_id: number
  tenant_name: string
  kind: PrivacyRequestKind
  note: string
  status: PrivacyRequestStatus
  response: string
  /** YYYY-MM-DD (30 วันนับจากวันที่ยื่น) */
  due_date: string
  created_at: string
  resolved_at: string | null
}

export interface RetentionDue {
  tenant_id: number
  tenant_name: string
  last_activity: string
  /** ปีที่ผ่านไปนับจากกิจกรรมล่าสุด */
  years: number
}

export interface PortalPrivacy {
  notice: string
  dpo_contact: string
  consented: boolean
  consent_at: string | null
}

// ----- Audit log -----
export interface AuditLog {
  id: number
  user_id: number | null
  user_name: string | null
  action: string
  entity: string
  entity_id: number | null
  detail: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

export interface Booking {
  id: number
  unit_id: number
  tenant_id: number
  kind: BookingKind
  start_date: string
  end_date: string | null
  price: number
  deposit_amount: number
  deposit_status: DepositStatus
  status: BookingStatus
  source: string
  created_at: string
  unit_name: string
  property_name: string
  tenant_name: string
}

export interface BookingInput {
  unit_id: number
  tenant_id: number
  kind: BookingKind
  start_date: string
  end_date: string | null
  price: number | null
  deposit_amount: number | null
  source: string
}

export interface MeterReading {
  id: number
  unit_id: number
  meter_type: MeterType
  reading_date: string
  value: number
  photo_path: string | null
  ocr_raw: string | null
  created_at: string
}

export interface LineItem {
  label: string
  qty: number
  unit_price: number
  amount: number
  vatable: boolean
}

export type LineItemInput = Omit<LineItem, 'amount'>

export type InvoiceKind = 'monthly' | 'manual' | 'move_out'
export type InvoiceStatus = 'unpaid' | 'paid' | 'void'

export interface Invoice {
  id: number
  doc_no: string
  kind: InvoiceKind
  unit_id: number
  unit_name: string
  property_id: number
  property_name: string
  booking_id: number | null
  tenant_name: string | null
  period: string
  issue_date: string
  due_date: string
  items: LineItem[]
  subtotal: number
  vat_amount: number
  total: number
  status: InvoiceStatus
  void_reason: string | null
  paid_amount: number
  overdue_days: number
  late_fee: number
  paid_at: string | null
  created_at: string
}

export interface Issuer {
  legal_name: string
  tax_id: string
  branch_code: string
  address: string
  phone: string
  vat_registered?: boolean
  /** (ถ้ามี) หมายเหตุท้ายเอกสาร */
  receipt_note?: string
}

export interface DocParty {
  name?: string
  full_name?: string
  address: string
  tax_id: string
  branch_code: string
  phone?: string
}

export interface InvoiceDetail {
  invoice: Invoice
  promptpay_payload: string | null
  paid_amount: number
  receipts: Receipt[]
  issuer: Issuer
  tenant: { full_name: string; address: string; tax_id: string; branch_code: string; phone: string } | null
  property: { name: string; address: string }
}

export type PayMethod = 'promptpay' | 'transfer' | 'cash' | 'deposit'

export interface PayInput {
  method: PayMethod
  paid_at: string
  amount?: number
  include_late_fee?: boolean
  wht_amount?: number
  note?: string
}

export interface ManualInvoiceInput {
  unit_id: number
  due_date: string
  period?: string
  items: LineItemInput[]
}

export interface Receipt {
  id: number
  doc_no: string
  is_tax_invoice: boolean
  invoice_id: number | null
  invoice_doc_no: string | null
  issue_date: string
  issuer: Issuer
  payer: { name: string; address: string; tax_id: string; branch_code: string }
  unit_name: string
  property_name: string
  items: LineItem[]
  subtotal: number
  vat_amount: number
  total: number
  wht_amount: number
  net_received: number
  amount_text: string
  method: PayMethod | string
  status: 'issued' | 'void'
  void_reason: string | null
  created_at: string
}

// ----- Tickets -----
export type TicketScope = 'org' | 'platform'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'

export interface Ticket {
  id: number
  scope: TicketScope
  title: string
  description: string
  category: string
  priority: TicketPriority
  status: TicketStatus
  property_id: number | null
  property_name: string | null
  unit_id: number | null
  unit_name: string | null
  tenant_id: number | null
  tenant_name: string | null
  org_name?: string | null
  reporter_name: string | null
  source: 'tenant' | 'staff' | 'org'
  assignee_user_id: number | null
  assignee_name: string | null
  photos: string[]
  message_count: number
  created_at: string
  updated_at: string
}

export interface TicketMessage {
  id: number
  author_type: 'staff' | 'tenant' | 'platform'
  author_name: string
  body: string
  internal: boolean
  photos: string[]
  created_at: string
}

export interface TicketDetail {
  ticket: Ticket
  messages: TicketMessage[]
}

export interface TicketPatch {
  status?: TicketStatus
  priority?: TicketPriority
  assignee_user_id?: number | null
}

export interface Announcement {
  id: number
  property_id: number | null
  property_name: string | null
  title: string
  body: string
  pinned: boolean
  created_at: string
}

export interface AnnouncementInput {
  property_id: number | null
  title: string
  body: string
  pinned: boolean
}

// ----- Move-out -----
export interface Deduction {
  label: string
  amount: number
}

export interface MoveOut {
  id: number
  doc_no: string | null
  booking_id: number
  tenant_name: string
  unit_name: string
  property_name: string
  move_out_date: string
  deposit_amount: number
  deductions: Deduction[]
  deductions_total: number
  outstanding_total: number
  include_outstanding: boolean
  refund_amount: number
  status: 'draft' | 'settled'
  refund_method: 'transfer' | 'cash' | null
  settled_at: string | null
  note: string
  created_at: string
}

export interface MoveOutInput {
  booking_id: number
  move_out_date: string
  deductions: Deduction[]
  include_outstanding: boolean
  note: string
}

export interface MoveOutDetail {
  move_out: MoveOut
  issuer: Issuer
  tenant: { full_name: string; address: string; tax_id: string; branch_code: string; phone: string } | null
}

// ----- Reports -----
export interface ReportSummary {
  revenue: { month: string; amount: number }[]
  billed: { month: string; amount: number }[]
  occupancy: { month: string; rate: number }[]
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number }
  top_debtors: {
    tenant_name: string
    unit_name: string
    property_name: string
    amount: number
    oldest_due: string
  }[]
}

// ----- Tenant portal -----
export interface PortalHome {
  tenant: { full_name: string; phone: string; lang?: Lang }
  org: { name: string; phone: string; theme?: ColorThemeId | string }
  line?: {
    enabled: boolean
    basic_id: string
    add_friend_url: string | null
    linked: boolean
    display_name: string | null
  }
  property: { name: string; address: string } | null
  unit: { name: string; floor: number } | null
  booking: {
    kind: BookingKind
    start_date: string
    end_date: string | null
    price: number
    deposit_amount: number
  } | null
  announcements: Announcement[]
  invoices: {
    id: number
    doc_no: string
    period: string
    due_date: string
    total: number
    status: InvoiceStatus
    paid_amount: number
    overdue_days: number
    late_fee?: number
  }[]
  receipts: { id: number; doc_no: string; issue_date: string; total: number; status: 'issued' | 'void' }[]
  features: { portal: boolean }
  /** PDPA — ประกาศความเป็นส่วนตัวและสถานะความยินยอม */
  privacy?: PortalPrivacy
  /** การแจ้งชำระล่าสุดของแต่ละบิล */
  payment_notices?: PortalNotice[]
  /** พัสดุรอรับ + ที่รับแล้วใน 30 วัน */
  parcels?: PortalParcel[]
  /** สัญญาที่ส่งให้ผู้เช่าแล้ว (ไม่รวมร่าง) */
  contracts?: PortalContractSummary[]
}

export interface PortalNotice {
  id: number
  invoice_id: number
  amount: number
  status: NoticeStatus
  reject_reason: string | null
  created_at: string
}

export interface PortalParcel {
  id: number
  kind: ParcelKind
  kind_label: string
  carrier: string
  tracking_no: string
  /** มีเฉพาะพัสดุที่ยังรอรับ */
  pickup_code: string | null
  status: ParcelStatus
  received_at: string
  picked_up_at: string | null
  photo_url: string | null
}

export interface PortalSlipResult {
  notice: { id: number; status: NoticeStatus; amount: number; created_at: string }
  check: { result: SlipResult; message: string }
  /** ยืนยันอัตโนมัติแล้ว (ออกใบเสร็จแล้ว) */
  paid: boolean
  receipt_id: number | null
}

// ----- สัญญาเช่าอิเล็กทรอนิกส์ -----
export type ContractKind = 'lease' | 'short_stay' | 'other'
export type ContractStatus = 'draft' | 'sent' | 'tenant_signed' | 'completed' | 'void'

export interface ContractTemplate {
  id: number
  name: string
  kind: ContractKind
  body: string
  is_default: boolean
  updated_at: string
}

export type ContractTemplateInput = Pick<ContractTemplate, 'name' | 'kind' | 'body' | 'is_default'>

export interface ContractPlaceholder {
  key: string
  label: string
}

export interface Contract {
  id: number
  booking_id: number
  tenant_id: number | null
  tenant_name: string | null
  tenant_line_linked: boolean
  unit_name: string
  property_name: string
  template_id: number | null
  doc_no: string
  title: string
  body: string
  /** SHA-256 ของชื่อ+เนื้อหา ณ เวลาที่ส่ง */
  content_hash: string | null
  status: ContractStatus
  sent_at: string | null
  tenant_signature_url: string | null
  tenant_signed_name: string | null
  tenant_signed_at: string | null
  tenant_signed_ip: string | null
  tenant_signed_ua: string | null
  landlord_signature_url: string | null
  landlord_signed_name: string | null
  landlord_signed_at: string | null
  void_reason: string | null
  created_at: string
}

export interface PortalContractSummary {
  id: number
  doc_no: string
  title: string
  status: ContractStatus
  sent_at: string | null
  tenant_signed_at: string | null
}

/** สัญญาที่ผู้เช่าเห็นในพอร์ทัล (ไม่มี IP/อุปกรณ์) */
export type PortalContract = Pick<
  Contract,
  | 'id'
  | 'doc_no'
  | 'title'
  | 'body'
  | 'status'
  | 'content_hash'
  | 'sent_at'
  | 'unit_name'
  | 'property_name'
  | 'tenant_name'
  | 'tenant_signature_url'
  | 'tenant_signed_name'
  | 'tenant_signed_at'
  | 'landlord_signature_url'
  | 'landlord_signed_name'
  | 'landlord_signed_at'
  | 'void_reason'
>

export interface PortalContractView {
  contract: PortalContract
  org: { name: string }
}

// ----- แจ้งชำระ + ตรวจสลิป -----
export type NoticeStatus = 'pending' | 'approved' | 'rejected'

/** ผลตรวจสลิป (slip_checks) */
export interface SlipCheckInfo {
  result: SlipResult
  message: string
  bank_code: string | null
  trans_ref: string | null
  amount: number | null
  expected_amount: number | null
  sender_name: string | null
  receiver_name: string | null
  transferred_at: string | null
  provider: string
  duplicate_of: number | null
  created_at?: string
}

export interface PaymentNotice {
  id: number
  invoice_id: number
  invoice_doc_no: string | null
  period: string
  unit_name: string
  tenant_id: number | null
  tenant_name: string | null
  amount: number
  slip_url: string
  note: string
  channel: 'portal' | 'line'
  status: NoticeStatus
  reject_reason: string | null
  receipt_id: number | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  created_at: string
  check: SlipCheckInfo | null
}

export interface OrgSlipSettings {
  provider: 'none' | 'easyslip' | 'slipok'
  has_key: boolean
  branch_id: string
  auto_approve: boolean
}

// ----- พัสดุ -----
export type ParcelKind = 'parcel' | 'letter' | 'food' | 'large' | 'other'
export type ParcelStatus = 'waiting' | 'picked_up' | 'returned'

export interface Parcel {
  id: number
  property_id: number
  property_name: string
  unit_id: number | null
  unit_name: string | null
  tenant_id: number | null
  tenant_name: string | null
  tenant_line_linked: boolean
  recipient_name: string
  carrier: string
  tracking_no: string
  kind: ParcelKind
  note: string
  photo_url: string | null
  pickup_code: string
  status: ParcelStatus
  received_at: string
  received_by_name: string | null
  notified_at: string | null
  picked_up_at: string | null
  picked_up_by: string | null
  pickup_photo_url: string | null
  signature_url: string | null
  handed_by_name: string | null
}

export interface ParcelList {
  parcels: Parcel[]
  summary: { waiting: number; received_today: number; waiting_over_3_days: number }
}

// ----- ตม.30 -----
export type Tm30Status = 'pending' | 'submitted' | 'not_required'
export type Tm30Missing = 'passport_no' | 'arrival_date' | 'visa_type' | 'gender' | 'birth_date'

export interface Tm30Report {
  id: number
  tenant_id: number
  booking_id: number
  check_in: string
  status: Tm30Status
  reference_no: string
  submitted_at: string | null
  submitted_by_name: string | null
  proof_url: string | null
  note: string
  full_name: string
  nationality: string
  passport_no: string
  gender: Gender
  birth_date: string | null
  arrival_date: string | null
  visa_type: string
  visa_expiry: string | null
  phone: string
  unit_name: string
  property_name: string
  property_address: string
  booking_kind: BookingKind
  check_out: string | null
  /** วันสุดท้ายที่ต้องแจ้ง (เข้าพัก + 1 วัน) */
  deadline: string | null
  overdue_days: number
  missing: Tm30Missing[]
}

export interface Tm30List {
  reports: Tm30Report[]
  summary: { pending: number; overdue: number; due_today: number }
  visa_expiring: { tenant_id: number; full_name: string; nationality: string; visa_expiry: string }[]
}

export interface Dashboard {
  total_units: number
  occupancy_rate: number
  units_by_status: Partial<Record<UnitStatus, number>>
  revenue_month: number
  outstanding: number
  outstanding_count: number
  deposits_held: number
  open_tickets: number
  overdue_count: number
  overdue_amount: number
  properties: { id: number; name: string; kind: PropertyKind; units: number; occupied: number }[]
  upcoming_checkins: {
    id: number
    start_date: string
    unit_name: string
    property_name: string
    tenant_name: string
  }[]
  /** คำขอจองออนไลน์ที่รอตอบ */
  pending_requests?: number
  /** งานแม่บ้าน */
  housekeeping?: { dirty: number; in_progress: number; open_tasks: number }
  /** คำขอใช้สิทธิ์ตาม PDPA ที่ยังไม่ปิด */
  open_privacy_requests?: number
  /** ผู้เช่าแจ้งชำระรอตรวจสลิป */
  pending_payment_notices?: number
  /** พัสดุรอผู้เช่ามารับ */
  parcels_waiting?: number
  /** ตม.30 ที่ยังไม่ได้แจ้ง */
  tm30_pending?: number
}

// ----- Housekeeping (งานแม่บ้าน) -----
export type HousekeepingStatus = 'clean' | 'dirty' | 'in_progress'
export type HkTaskKind = 'checkout_clean' | 'stayover' | 'deep_clean' | 'inspection' | 'maintenance'
export type HkTaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'

export interface ChecklistItem {
  label: string
  done: boolean
}

export interface HkTask {
  id: number
  unit_id: number
  unit_name: string
  property_id: number
  property_name: string
  booking_id: number | null
  guest_name: string | null
  kind: HkTaskKind
  status: HkTaskStatus
  /** YYYY-MM-DD */
  due_date: string
  assignee_user_id: number | null
  assignee_name: string | null
  notes: string
  checklist: ChecklistItem[]
  photos: string[]
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface HkTaskInput {
  unit_id: number
  kind: HkTaskKind
  due_date: string
  assignee_user_id?: number | null
  notes?: string
}

export interface HkTaskPatch {
  status?: HkTaskStatus
  assignee_user_id?: number | null
  checklist?: ChecklistItem[]
  notes?: string
  due_date?: string
}

export interface HkMovement {
  booking_id: number
  unit_id: number
  unit_name: string
  property_name: string
  guest_name: string
  source: string
}

export interface HkToday {
  date: string
  checkouts: (HkMovement & { end_date: string })[]
  checkins: (HkMovement & { start_date: string })[]
  summary: Record<HousekeepingStatus, number>
}

// ----- Seasonal / dynamic pricing (ราคาตามฤดูกาล) -----
export type RateRuleType = 'night' | 'length'
export type RateAdjustment = 'fixed' | 'percent' | 'amount'

export interface RateRule {
  id: number
  property_id: number
  unit_id: number | null
  unit_name: string | null
  name: string
  rule_type: RateRuleType
  start_date: string | null
  /** รวมวันสุดท้าย */
  end_date: string | null
  /** 0=อา..6=ส, ว่าง = ทุกวัน */
  weekdays: number[]
  adjustment: RateAdjustment
  value: number
  min_nights: number | null
  priority: number
  active: boolean
}

export type RateRuleInput = Omit<RateRule, 'id' | 'unit_name'>

export interface QuoteNight {
  date: string
  base: number
  price: number
  rules: string[]
}

export interface Quote {
  nights: QuoteNight[]
  nights_count: number
  subtotal: number
  discount: { name: string; percent: number; amount: number } | null
  total: number
  average_rate: number
}

export interface PublicQuote extends Quote {
  deposit_amount: number
}

export interface DayPrice {
  date: string
  price: number
  rules: string[]
}

// ----- Calendar / channel manager (iCal) -----
export type ChannelSource = 'airbnb' | 'booking' | 'agoda' | 'vrbo' | 'other'
export type EventSource = 'lease' | 'direct' | ChannelSource

export interface CalendarUnit {
  id: number
  property_id: number
  property_name: string
  name: string
  floor: number
  status: UnitStatus
  rate_daily: number
  rent_monthly: number
  housekeeping_status?: HousekeepingStatus
}

export interface CalendarEvent {
  id: string
  type: 'booking' | 'block' | 'request'
  unit_id: number
  /** YYYY-MM-DD */
  start: string
  /** YYYY-MM-DD (exclusive = วันเช็คเอาท์) */
  end: string
  title: string
  source: EventSource | string
  status: string
  booking_id: number | null
  request_id: number | null
  conflict: boolean
}

export interface CalendarData {
  units: CalendarUnit[]
  events: CalendarEvent[]
}

export interface ChannelFeed {
  id: number
  unit_id: number
  unit_name: string
  property_name: string
  source: ChannelSource | string
  name: string
  url: string
  last_synced_at: string | null
  last_status: 'ok' | 'error' | null
  last_error: string | null
  events_count: number
}

export interface UnitChannels {
  export_url: string
  feeds: ChannelFeed[]
}

export interface SyncResult {
  imported: number
  removed: number
  conflicts: string[]
}

// ----- Online booking requests -----
export type BookingRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export interface BookingRequest {
  id: number
  status: BookingRequestStatus
  property_name: string
  unit_id: number
  unit_name: string
  check_in: string
  check_out: string
  nights: number
  total: number
  deposit_amount: number
  guest_name: string
  phone: string
  email: string
  guests: number
  note: string
  slip_url: string | null
  /** ผลตรวจสลิปล่าสุด */
  slip_result?: SlipResult | null
  slip_message?: string | null
  created_at: string
  expires_at: string
  booking_id: number | null
  reject_reason: string | null
}

// ----- Public booking page (/stay/:slug) -----
export interface StayOrg {
  name: string
  phone: string
  theme?: ColorThemeId | string
}

export interface StayInfo {
  property: {
    name: string
    address: string
    lat: number | null
    lng: number | null
    intro: string
    check_in_time: string
    check_out_time: string
    min_nights: number
    deposit_percent: number
  }
  org: StayOrg
  units: {
    id: number
    name: string
    floor: number
    rate_daily: number
    width: number
    length: number
    deposit: number
  }[]
}

export interface StayBusy {
  unit_id: number
  start: string
  /** exclusive */
  end: string
}

export interface StayRequestInput {
  unit_id: number
  check_in: string
  check_out: string
  guests: number
  guest_name: string
  phone: string
  email: string
  note: string
  /** ยินยอมให้ใช้ข้อมูลเพื่อการจอง (บังคับ true) */
  consent: true
  /** ภาษาที่แขกใช้จอง — เป็นภาษาเริ่มต้นของผู้เช่าเมื่ออนุมัติ */
  lang?: Lang
}

export interface StayRequestStatus {
  request: {
    status: BookingRequestStatus
    unit_name: string
    property_name: string
    check_in: string
    check_out: string
    nights: number
    rate: number
    total: number
    deposit_amount: number
    guest_name: string
    created_at: string
    expires_at: string
    slip_url: string | null
    reject_reason: string | null
  }
  promptpay_payload: string | null
  org: StayOrg
}

// ===================== Client =====================

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const ORG_KEY = 'estate.orgId'
let currentOrgId: number | null = (() => {
  try {
    const v = localStorage.getItem(ORG_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
})()

export function getOrgId() {
  return currentOrgId
}

export function setOrgId(id: number | null) {
  currentOrgId = id
  try {
    if (id == null) localStorage.removeItem(ORG_KEY)
    else localStorage.setItem(ORG_KEY, String(id))
  } catch {
    /* ignore storage errors */
  }
}

type Query = Record<string, string | number | null | undefined | ''>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  json?: unknown
  body?: FormData
  query?: Query
  /** ส่ง X-Org-Id หรือไม่ (ค่าเริ่มต้น true) */
  org?: boolean
}

function qs(query?: Query) {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  let body: BodyInit | undefined
  let method = opts.method
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.json)
    method ||= 'POST'
  } else if (opts.body) {
    body = opts.body
    method ||= 'POST'
  }
  if (opts.org !== false && currentOrgId != null) headers['X-Org-Id'] = String(currentOrgId)

  let res: Response
  try {
    res = await fetch(path + qs(opts.query), {
      method: method || 'GET',
      headers,
      body,
      credentials: 'include',
    })
  } catch {
    throw new ApiError(0, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่')
  }
  const text = await res.text()
  const data = parseJson(text)
  if (!res.ok) throw toApiError(res.status, data)
  return data as T
}

function parseJson(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const RATE_LIMIT_TEXT = 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'

/** แปลงคำตอบที่ผิดพลาดเป็น ApiError — 429 (ถูกจำกัดอัตรา) แจ้งเตือนทันที */
function toApiError(status: number, data: unknown) {
  const err = (data ?? {}) as { error?: string; code?: string }
  if (status === 429) {
    const msg = err.error || RATE_LIMIT_TEXT
    // id เดียวกัน → ไม่ซ้อนกันเมื่อหลายคำขอโดนพร้อมกัน
    toast.error(msg, { id: 'rate-limit' })
    return new ApiError(status, msg, err.code ?? 'rate_limited')
  }
  return new ApiError(status, err.error || `HTTP ${status}`, err.code)
}

/** ดาวน์โหลดไฟล์จาก API (ใช้คุกกี้ + X-Org-Id) แล้วบันทึกเป็นไฟล์ในเครื่อง */
export async function downloadFile(path: string, filename: string, org = true) {
  const headers: Record<string, string> = {}
  if (org && currentOrgId != null) headers['X-Org-Id'] = String(currentOrgId)
  let res: Response
  try {
    res = await fetch(path, { headers, credentials: 'include' })
  } catch {
    throw new ApiError(0, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่')
  }
  if (!res.ok) throw toApiError(res.status, parseJson(await res.text()))
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * ไฟล์ที่อัปโหลด (/uploads/...) ถูกควบคุมสิทธิ์ — หน้าเจ้าหน้าที่ใช้คุกกี้ได้เลย
 * ส่วนหน้าสาธารณะต้องแนบโทเคน: พอร์ทัลผู้เช่า `t`, หน้าสถานะคำขอจอง `r`
 */
export function withUploadAccess(url: string, access: { t?: string; r?: string }): string
export function withUploadAccess(url: string | null, access: { t?: string; r?: string }): string | null
export function withUploadAccess(url: string | null, access: { t?: string; r?: string }) {
  if (!url || !/^(https?:\/\/[^/]+)?\/uploads\//.test(url)) return url
  const params = Object.entries(access).filter((e): e is [string, string] => !!e[1])
  if (!params.length) return url
  const [base, hash = ''] = url.split('#')
  const extra = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `${base}${base.includes('?') ? '&' : '?'}${extra}${hash ? `#${hash}` : ''}`
}

const get = <T>(path: string, query?: Query, org = true) => request<T>(path, { query, org })
const post = <T>(path: string, json: unknown = {}, org = true) => request<T>(path, { json, org })
const put = <T>(path: string, json: unknown, org = true) =>
  request<T>(path, { method: 'PUT', json, org })
const patch = <T>(path: string, json: unknown, org = true) =>
  request<T>(path, { method: 'PATCH', json, org })
const form = <T>(path: string, body: FormData, org = true) => request<T>(path, { body, org })
const del = <T = unknown>(path: string, org = true) =>
  request<T>(path, { method: 'DELETE', org })

const enc = encodeURIComponent

export const api = {
  // auth
  register: (b: { name: string; email: string; password: string; org_name: string; accept_terms: true }) =>
    post<Me>('/api/auth/register', b, false),
  login: (b: { email: string; password: string }) => post<Me>('/api/auth/login', b, false),
  logout: () => post<object>('/api/auth/logout', {}, false),
  me: () => get<Me>('/api/auth/me', undefined, false),
  createOrg: (name: string) => post<OrgSummary>('/api/orgs', { name }, false),

  // org
  org: () => get<OrgInfo>('/api/org'),
  updateOrg: (b: OrgUpdate) => put<OrgInfo>('/api/org', b),
  members: () => get<Member[]>('/api/org/members'),
  addMember: (b: { email: string; name?: string; password?: string; role: Role }) =>
    post<Member>('/api/org/members', b),
  updateMember: (userId: number, role: Role) => put<Member>(`/api/org/members/${userId}`, { role }),
  removeMember: (userId: number) => del(`/api/org/members/${userId}`),

  // LINE OA
  updateLine: (b: LineSettingsInput) => put<LineSettings>('/api/org/line', b),
  testLine: () => post<{ ok: boolean; bot: LineBotInfo }>('/api/org/line/test'),
  /** เชื่อม LINE ของผู้ใช้ปัจจุบันกับ OA ขององค์กร (รับแจ้งงาน) */
  staffLineLink: () => post<StaffLineLinkCode>('/api/org/line/staff-link'),
  unlinkStaffLine: () => del('/api/org/line/staff-link'),
  lineMessages: (limit = 50) => get<LineMessage[]>('/api/line/messages', { limit }),

  // ค่าบริการแพลตฟอร์ม (เจ้าของ/ผู้ดูแลองค์กร — ใช้ได้แม้บัญชีหมดอายุ)
  billing: () => get<BillingOverview>('/api/billing'),
  checkout: (b: { package_id: number; cycle: BillingCycle }) =>
    post<SubPayment | { switched: true }>('/api/billing/checkout', b),
  billingInvoice: (id: number) => get<SubPayment>(`/api/billing/invoices/${id}`),
  uploadBillingSlip: (id: number, fd: FormData) => form<SubPayment>(`/api/billing/invoices/${id}/slip`, fd),
  cancelBillingInvoice: (id: number) => post<object>(`/api/billing/invoices/${id}/cancel`),

  // domain
  dashboard: () => get<Dashboard>('/api/dashboard'),
  properties: () => get<Property[]>('/api/properties'),
  saveProperty: (p: PropertyInput & { id?: number }) =>
    p.id ? put<Property>(`/api/properties/${p.id}`, p) : post<Property>('/api/properties', p),
  deleteProperty: (id: number) => del(`/api/properties/${id}`),

  units: (propertyId?: number | null) => get<Unit[]>('/api/units', { property_id: propertyId }),
  createUnit: (u: UnitInput) => post<Unit>('/api/units', u),
  updateUnit: (u: Unit) => put<Unit>(`/api/units/${u.id}`, u),
  deleteUnit: (id: number) => del(`/api/units/${id}`),
  setHousekeeping: (id: number, status: HousekeepingStatus) =>
    patch<Unit>(`/api/units/${id}/housekeeping`, { status }),
  unitQuote: (id: number, check_in: string, check_out: string) =>
    get<Quote>(`/api/units/${id}/quote`, { check_in, check_out }),
  unitPrices: (id: number, from: string, to: string) =>
    get<{ prices: DayPrice[] }>(`/api/units/${id}/prices`, { from, to }),

  // ราคาตามฤดูกาล
  rateRules: (property_id: number) => get<RateRule[]>('/api/rate-rules', { property_id }),
  createRateRule: (b: RateRuleInput) => post<RateRule>('/api/rate-rules', b),
  updateRateRule: (id: number, b: RateRuleInput) => put<RateRule>(`/api/rate-rules/${id}`, b),
  deleteRateRule: (id: number) => del(`/api/rate-rules/${id}`),

  // งานแม่บ้าน
  hkTasks: (f: { status?: string; property_id?: number | null; date?: string } = {}) =>
    get<HkTask[]>('/api/housekeeping/tasks', f),
  createHkTask: (b: HkTaskInput) => post<HkTask>('/api/housekeeping/tasks', b),
  patchHkTask: (id: number, b: HkTaskPatch) => patch<HkTask>(`/api/housekeeping/tasks/${id}`, b),
  uploadHkPhotos: (id: number, fd: FormData) => form<HkTask>(`/api/housekeeping/tasks/${id}/photos`, fd),
  deleteHkTask: (id: number) => del(`/api/housekeeping/tasks/${id}`),
  hkToday: (property_id?: number | null) => get<HkToday>('/api/housekeeping/today', { property_id }),

  tenants: () => get<Tenant[]>('/api/tenants'),
  saveTenant: (t: TenantInput & { id?: number }) =>
    t.id ? put<Tenant>(`/api/tenants/${t.id}`, t) : post<Tenant>('/api/tenants', t),
  deleteTenant: (id: number) => del(`/api/tenants/${id}`),
  regenPortalToken: (id: number) =>
    post<{ portal_token: string }>(`/api/tenants/${id}/portal-token`),
  tenantLineLink: (id: number) => post<LineLinkCode>(`/api/tenants/${id}/line-link`),
  unlinkTenantLine: (id: number) => del(`/api/tenants/${id}/line`),
  sendTenantPortalLine: (id: number) => post<{ sent: boolean }>(`/api/tenants/${id}/line/send-portal`),

  // PDPA
  exportTenant: (id: number) => downloadFile(`/api/tenants/${id}/export`, `tenant-${id}.json`),
  anonymizeTenant: (id: number) => post<Tenant>(`/api/tenants/${id}/anonymize`, { confirm: 'ลบข้อมูล' }),
  privacyRequests: (f: { status?: PrivacyRequestStatus | '' } = {}) =>
    get<PrivacyRequest[]>('/api/privacy-requests', f),
  patchPrivacyRequest: (id: number, b: { status: PrivacyRequestStatus; response: string }) =>
    patch<PrivacyRequest>(`/api/privacy-requests/${id}`, b),
  privacyRetention: () => get<RetentionDue[]>('/api/privacy/retention'),

  // ประวัติการใช้งาน
  auditLogs: (f: { entity?: string; user_id?: number | ''; limit?: number; before_id?: number } = {}) =>
    get<AuditLog[]>('/api/audit-logs', f),

  bookings: (f: { unit_id?: number; property_id?: number; status?: string } = {}) =>
    get<Booking[]>('/api/bookings', f),
  createBooking: (b: BookingInput) => post<Booking>('/api/bookings', b),
  patchBooking: (id: number, p: { status?: BookingStatus; deposit_status?: DepositStatus }) =>
    patch<Booking>(`/api/bookings/${id}`, p),

  // ปฏิทินการจอง + ช่องทางขาย (iCal)
  calendar: (f: { from: string; to: string; property_id?: number | null }) =>
    get<CalendarData>('/api/calendar', f),
  channels: (property_id?: number | null) => get<ChannelFeed[]>('/api/channels', { property_id }),
  unitChannels: (unitId: number) => get<UnitChannels>(`/api/units/${unitId}/channels`),
  addChannel: (unitId: number, b: { source: string; name?: string; url: string }) =>
    post<ChannelFeed>(`/api/units/${unitId}/channels`, b),
  deleteChannel: (id: number) => del(`/api/channels/${id}`),
  syncChannel: (id: number) => post<SyncResult>(`/api/channels/${id}/sync`),
  regenerateExport: (unitId: number) =>
    post<{ export_url: string }>(`/api/units/${unitId}/channels/regenerate-export`),

  // คำขอจองออนไลน์
  bookingRequests: (f: { status?: string } = {}) => get<BookingRequest[]>('/api/booking-requests', f),
  approveRequest: (id: number, deposit_paid: boolean) =>
    post<{ booking_id: number }>(`/api/booking-requests/${id}/approve`, { deposit_paid }),
  rejectRequest: (id: number, reason: string) =>
    post<unknown>(`/api/booking-requests/${id}/reject`, { reason }),

  meters: (f: { unit_id?: number | null; meter_type?: MeterType } = {}) =>
    get<MeterReading[]>('/api/meter-readings', f),
  createMeter: (fd: FormData) => request<MeterReading>('/api/meter-readings', { body: fd }),
  deleteMeter: (id: number) => del(`/api/meter-readings/${id}`),

  invoices: (f: { property_id?: number | string; period?: string; status?: string } = {}) =>
    get<Invoice[]>('/api/invoices', f),
  generateInvoices: (property_id: number, period: string) =>
    post<{ created: number[]; skipped: string[] }>('/api/invoices/generate', { property_id, period }),
  createInvoice: (b: ManualInvoiceInput) => post<Invoice>('/api/invoices', b),
  invoice: (id: number) => get<InvoiceDetail>(`/api/invoices/${id}`),
  payInvoice: (id: number, b: PayInput) =>
    post<{ invoice: Invoice; receipt: Receipt }>(`/api/invoices/${id}/pay`, b),
  voidInvoice: (id: number, reason: string) => post<Invoice>(`/api/invoices/${id}/void`, { reason }),
  sendInvoiceLine: (id: number) => post<{ sent: boolean }>(`/api/invoices/${id}/send-line`),
  sendInvoicesLine: (property_id: number, period: string) =>
    post<{ sent: number; skipped: string[] }>('/api/invoices/send-line', { property_id, period }),

  receipts: (f: { property_id?: number | string; period?: string; status?: string } = {}) =>
    get<Receipt[]>('/api/receipts', f),
  receipt: (id: number) => get<{ receipt: Receipt }>(`/api/receipts/${id}`),
  voidReceipt: (id: number, reason: string) => post<Receipt>(`/api/receipts/${id}/void`, { reason }),
  sendReceiptLine: (id: number) => post<{ sent: boolean }>(`/api/receipts/${id}/send-line`),

  tickets: (f: { status?: string; property_id?: number | string; category?: string } = {}) =>
    get<Ticket[]>('/api/tickets', f),
  createTicket: (fd: FormData) => form<Ticket>('/api/tickets', fd),
  ticket: (id: number) => get<TicketDetail>(`/api/tickets/${id}`),
  patchTicket: (id: number, b: TicketPatch) => patch<Ticket>(`/api/tickets/${id}`, b),
  replyTicket: (id: number, fd: FormData) => form<unknown>(`/api/tickets/${id}/messages`, fd),

  announcements: () => get<Announcement[]>('/api/announcements'),
  createAnnouncement: (b: AnnouncementInput) => post<Announcement>('/api/announcements', b),
  deleteAnnouncement: (id: number) => del(`/api/announcements/${id}`),

  support: () => get<Ticket[]>('/api/support'),
  createSupport: (fd: FormData) => form<Ticket>('/api/support', fd),
  supportTicket: (id: number) => get<TicketDetail>(`/api/support/${id}`),
  replySupport: (id: number, fd: FormData) => form<unknown>(`/api/support/${id}/messages`, fd),

  moveOuts: () => get<MoveOut[]>('/api/move-outs'),
  createMoveOut: (b: MoveOutInput) => post<MoveOut>('/api/move-outs', b),
  updateMoveOut: (id: number, b: MoveOutInput) => put<MoveOut>(`/api/move-outs/${id}`, b),
  moveOut: (id: number) => get<MoveOutDetail>(`/api/move-outs/${id}`),
  settleMoveOut: (id: number, b: { refund_method: 'transfer' | 'cash'; refunded_at: string }) =>
    post<MoveOut>(`/api/move-outs/${id}/settle`, b),

  reportSummary: (f: { months?: number; property_id?: number | string } = {}) =>
    get<ReportSummary>('/api/reports/summary', f),
  // แจ้งชำระ + ตรวจสลิป
  paymentNotices: (f: { status?: NoticeStatus | '' } = {}) => get<PaymentNotice[]>('/api/payment-notices', f),
  approveNotice: (id: number, b: { amount?: number; paid_at?: string; method?: 'transfer' | 'promptpay' | 'cash' } = {}) =>
    post<PaymentNotice>(`/api/payment-notices/${id}/approve`, b),
  rejectNotice: (id: number, reason: string) => post<PaymentNotice>(`/api/payment-notices/${id}/reject`, { reason }),
  slipSettings: () => get<OrgSlipSettings>('/api/org/slip'),
  updateSlipSettings: (b: Omit<OrgSlipSettings, 'has_key'> & { api_key: string }) =>
    put<OrgSlipSettings>('/api/org/slip', b),

  // พัสดุ
  parcels: (f: { status?: ParcelStatus | ''; property_id?: number | null; q?: string } = {}) =>
    get<ParcelList>('/api/parcels', f),
  createParcel: (fd: FormData) => form<Parcel>('/api/parcels', fd),
  pickupParcel: (id: number, fd: FormData) => form<Parcel>(`/api/parcels/${id}/pickup`, fd),
  notifyParcel: (id: number) => post<Parcel>(`/api/parcels/${id}/notify`),
  returnParcel: (id: number, note: string) => post<Parcel>(`/api/parcels/${id}/return`, { note }),
  deleteParcel: (id: number) => del(`/api/parcels/${id}`),

  // สัญญาเช่าอิเล็กทรอนิกส์
  contractTemplates: () =>
    get<{ templates: ContractTemplate[]; placeholders: ContractPlaceholder[] }>('/api/contract-templates'),
  saveContractTemplate: (t: ContractTemplateInput & { id?: number }) =>
    t.id
      ? put<ContractTemplate>(`/api/contract-templates/${t.id}`, t)
      : post<ContractTemplate>('/api/contract-templates', t),
  deleteContractTemplate: (id: number) => del(`/api/contract-templates/${id}`),
  contracts: (f: { booking_id?: number | null; tenant_id?: number | null; status?: ContractStatus | '' } = {}) =>
    get<Contract[]>('/api/contracts', f),
  contract: (id: number) => get<Contract>(`/api/contracts/${id}`),
  createContract: (b: { booking_id: number; template_id?: number | null }) =>
    post<{ contract: Contract; unknown_placeholders: string[] }>('/api/contracts', b),
  updateContract: (id: number, b: { title: string; body: string }) => put<Contract>(`/api/contracts/${id}`, b),
  sendContract: (id: number) => post<Contract>(`/api/contracts/${id}/send`),
  /** multipart: signature (PNG), signed_name */
  landlordSignContract: (id: number, fd: FormData) => form<Contract>(`/api/contracts/${id}/landlord-sign`, fd),
  voidContract: (id: number, reason: string) => post<Contract>(`/api/contracts/${id}/void`, { reason }),

  // ตม.30
  tm30: (f: { status?: Tm30Status | '' } = {}) => get<Tm30List>('/api/tm30', f),
  submitTm30: (id: number, fd: FormData) => form<Tm30Report>(`/api/tm30/${id}/submit`, fd),
  skipTm30: (id: number, reason: string) => post<Tm30Report>(`/api/tm30/${id}/skip`, { reason }),
  reopenTm30: (id: number) => post<Tm30Report>(`/api/tm30/${id}/reopen`),
  /** ลิงก์ดาวน์โหลด CSV รายการ ตม.30 (แนบ org_id แทน header) */
  tm30ExportUrl: (status: Tm30Status = 'pending') => '/api/tm30/export.csv' + qs({ status, org_id: currentOrgId }),

  /** ลิงก์ดาวน์โหลด CSV (ใช้ <a href> — แนบ org_id แทน header) */
  reportExportUrl: (type: 'invoices' | 'receipts' | 'payments', from: string, to: string) =>
    '/api/reports/export' + qs({ type, from, to, org_id: currentOrgId }),

  // tenant portal (สาธารณะ ไม่ต้องล็อกอิน ไม่ส่ง X-Org-Id)
  portal: {
    home: (token: string) => get<PortalHome>(`/api/portal/${enc(token)}`, undefined, false),
    invoice: (token: string, id: number) =>
      get<InvoiceDetail>(`/api/portal/${enc(token)}/invoices/${id}`, undefined, false),
    receipt: (token: string, id: number) =>
      get<{ receipt: Receipt }>(`/api/portal/${enc(token)}/receipts/${id}`, undefined, false),
    tickets: (token: string) => get<Ticket[]>(`/api/portal/${enc(token)}/tickets`, undefined, false),
    createTicket: (token: string, fd: FormData) =>
      form<Ticket>(`/api/portal/${enc(token)}/tickets`, fd, false),
    ticket: (token: string, id: number) =>
      get<TicketDetail>(`/api/portal/${enc(token)}/tickets/${id}`, undefined, false),
    reply: (token: string, id: number, fd: FormData) =>
      form<unknown>(`/api/portal/${enc(token)}/tickets/${id}/messages`, fd, false),
    lineLink: (token: string) => post<LineLinkCode>(`/api/portal/${enc(token)}/line-link`, {}, false),
    consent: (token: string) => post<{ consent_at: string }>(`/api/portal/${enc(token)}/consent`, {}, false),
    privacyRequest: (token: string, b: { kind: PrivacyRequestKind; note: string }) =>
      post<PrivacyRequest>(`/api/portal/${enc(token)}/privacy-requests`, b, false),
    exportData: (token: string) => downloadFile(`/api/portal/${enc(token)}/export`, 'my-data.json', false),
    /** แจ้งชำระพร้อมสลิป (multipart: photo, amount?, note?) */
    submitSlip: (token: string, invoiceId: number, fd: FormData) =>
      form<PortalSlipResult>(`/api/portal/${enc(token)}/invoices/${invoiceId}/slip`, fd, false),
    setLang: (token: string, lang: Lang) => post<{ lang: Lang }>(`/api/portal/${enc(token)}/lang`, { lang }, false),
    contract: (token: string, id: number) =>
      get<PortalContractView>(`/api/portal/${enc(token)}/contracts/${id}`, undefined, false),
    /** multipart: signature (PNG), signed_name, agree='true', content_hash (ค่าที่แสดงอยู่) */
    signContract: (token: string, id: number, fd: FormData) =>
      form<PortalContractView>(`/api/portal/${enc(token)}/contracts/${id}/sign`, fd, false),
  },

  // หน้าจองออนไลน์ (สาธารณะ ไม่ต้องล็อกอิน ไม่ส่ง X-Org-Id)
  stay: {
    info: (slug: string) => get<StayInfo>(`/api/public/stay/${enc(slug)}`, undefined, false),
    availability: (slug: string, from: string, to: string) =>
      get<{ busy: StayBusy[] }>(`/api/public/stay/${enc(slug)}/availability`, { from, to }, false),
    quote: (slug: string, unit_id: number, check_in: string, check_out: string) =>
      get<PublicQuote>(`/api/public/stay/${enc(slug)}/quote`, { unit_id, check_in, check_out }, false),
    prices: (slug: string, from: string, to: string) =>
      get<{ units: Record<string, { date: string; price: number }[]> }>(
        `/api/public/stay/${enc(slug)}/prices`,
        { from, to },
        false,
      ),
    createRequest: (slug: string, b: StayRequestInput) =>
      post<{ token: string }>(`/api/public/stay/${enc(slug)}/requests`, b, false),
    request: (token: string) =>
      get<StayRequestStatus>(`/api/public/requests/${enc(token)}`, undefined, false),
    uploadSlip: (token: string, fd: FormData) =>
      form<{ slip_url: string; check?: { result: SlipResult; message: string } }>(
        `/api/public/requests/${enc(token)}/slip`,
        fd,
        false,
      ),
  },

  // super admin (ไม่ต้องใช้ X-Org-Id)
  admin: {
    stats: () => get<AdminStats>('/api/admin/stats', undefined, false),
    packages: () => get<Package[]>('/api/admin/packages', undefined, false),
    createPackage: (p: PackageInput) => post<Package>('/api/admin/packages', p, false),
    updatePackage: (id: number, p: PackageInput) =>
      put<Package>(`/api/admin/packages/${id}`, p, false),
    deletePackage: (id: number) => del(`/api/admin/packages/${id}`, false),
    orgs: () => get<AdminOrg[]>('/api/admin/orgs', undefined, false),
    updateOrg: (
      id: number,
      b: { package_id?: number; status?: OrgStatus; ends_at?: string | null },
    ) => put<AdminOrg>(`/api/admin/orgs/${id}`, b, false),
    users: () => get<AdminUser[]>('/api/admin/users', undefined, false),
    updateUser: (id: number, b: { is_super_admin?: boolean; is_active?: boolean }) =>
      put<AdminUser>(`/api/admin/users/${id}`, b, false),
    support: (f: { status?: string } = {}) => get<Ticket[]>('/api/admin/support', f, false),
    supportTicket: (id: number) => get<TicketDetail>(`/api/admin/support/${id}`, undefined, false),
    replySupport: (id: number, fd: FormData) =>
      form<unknown>(`/api/admin/support/${id}/messages`, fd, false),
    patchSupport: (id: number, b: { status?: TicketStatus; priority?: TicketPriority }) =>
      patch<Ticket>(`/api/admin/support/${id}`, b, false),
    billing: (f: { status?: SubInvoiceStatus | ''; org_id?: number | '' } = {}) =>
      get<AdminBilling>('/api/admin/billing', f, false),
    updateBillingSettings: (b: PlatformSettings) =>
      put<PlatformSettings>('/api/admin/billing/settings', b, false),
    updateSlipSettings: (b: Omit<PlatformSlipSettings, 'has_key'> & { api_key: string }) =>
      put<PlatformSlipSettings>('/api/admin/billing/slip', b, false),
    issueInvoice: (b: { org_id: number; package_id: number; cycle: BillingCycle }) =>
      post<SubPayment>('/api/admin/billing/invoices', b, false),
    billingInvoice: (id: number) => get<SubPayment>(`/api/admin/billing/invoices/${id}`, undefined, false),
    approveInvoice: (id: number, payment_ref?: string) =>
      post<SubPayment>(`/api/admin/billing/invoices/${id}/approve`, { payment_ref: payment_ref || null }, false),
    rejectInvoice: (id: number, reason: string) =>
      post<SubPayment>(`/api/admin/billing/invoices/${id}/reject`, { reason }, false),
    voidInvoice: (id: number, reason: string) =>
      post<SubPayment>(`/api/admin/billing/invoices/${id}/void`, { reason }, false),
  },
}
