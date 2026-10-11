// API client + types สำหรับ Estate backend (Axum)
// - ใช้คุกกี้ HttpOnly ที่เซิร์ฟเวอร์ตั้งให้ (same-origin, credentials: 'include')
// - ทุกคำขอที่ผูกกับองค์กรจะส่ง header X-Org-Id

import type { ColorThemeId } from './themes'
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
}

export type OrgUpdate = { name: string; theme?: ColorThemeId } & OrgLegal

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
  role: Role
}

export interface Member {
  user_id: number
  name: string
  email: string
  role: Role
  created_at: string
}

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
}

export interface ExtraCharge {
  label: string
  amount: number
  vatable: boolean
}

export type UnitInput = Partial<Omit<Unit, 'id'>> & { property_id: number; name: string }

export interface Tenant {
  id: number
  full_name: string
  phone: string
  email: string
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
}

export type TenantInput = Pick<
  Tenant,
  'full_name' | 'phone' | 'email' | 'id_card' | 'note' | 'tax_id' | 'address' | 'branch_code'
>

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
  tenant: { full_name: string; phone: string }
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
  }[]
  receipts: { id: number; doc_no: string; issue_date: string; total: number; status: 'issued' | 'void' }[]
  features: { portal: boolean }
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
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string }
    throw new ApiError(res.status, err.error || `HTTP ${res.status}`, err.code)
  }
  return data as T
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
  register: (b: { name: string; email: string; password: string; org_name: string }) =>
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
  lineMessages: (limit = 50) => get<LineMessage[]>('/api/line/messages', { limit }),

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

  tenants: () => get<Tenant[]>('/api/tenants'),
  saveTenant: (t: TenantInput & { id?: number }) =>
    t.id ? put<Tenant>(`/api/tenants/${t.id}`, t) : post<Tenant>('/api/tenants', t),
  deleteTenant: (id: number) => del(`/api/tenants/${id}`),
  regenPortalToken: (id: number) =>
    post<{ portal_token: string }>(`/api/tenants/${id}/portal-token`),
  tenantLineLink: (id: number) => post<LineLinkCode>(`/api/tenants/${id}/line-link`),
  unlinkTenantLine: (id: number) => del(`/api/tenants/${id}/line`),
  sendTenantPortalLine: (id: number) => post<{ sent: boolean }>(`/api/tenants/${id}/line/send-portal`),

  bookings: (f: { unit_id?: number; property_id?: number; status?: string } = {}) =>
    get<Booking[]>('/api/bookings', f),
  createBooking: (b: BookingInput) => post<Booking>('/api/bookings', b),
  patchBooking: (id: number, p: { status?: BookingStatus; deposit_status?: DepositStatus }) =>
    patch<Booking>(`/api/bookings/${id}`, p),

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
  },
}
