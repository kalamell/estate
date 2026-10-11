// API client + types สำหรับ Estate backend (Axum)
// - ใช้คุกกี้ HttpOnly ที่เซิร์ฟเวอร์ตั้งให้ (same-origin, credentials: 'include')
// - ทุกคำขอที่ผูกกับองค์กรจะส่ง header X-Org-Id

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
}

export interface OrgInfo {
  org: { id: number; name: string; status: OrgStatus; ends_at: string | null; created_at: string }
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
  created_at: string
}

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
}

export type UnitInput = Partial<Omit<Unit, 'id'>> & { property_id: number; name: string }

export interface Tenant {
  id: number
  full_name: string
  phone: string
  email: string
  id_card: string
  note: string
  created_at: string
}

export type TenantInput = Pick<Tenant, 'full_name' | 'phone' | 'email' | 'id_card' | 'note'>

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
}

export interface Invoice {
  id: number
  unit_id: number
  booking_id: number | null
  period: string
  issue_date: string
  due_date: string
  items: LineItem[]
  total: number
  status: 'unpaid' | 'paid' | string
  paid_at: string | null
  created_at: string
  unit_name: string
  property_id: number
  property_name: string
  tenant_name: string | null
}

export interface InvoiceDetail {
  invoice: Invoice
  promptpay_payload: string | null
  paid_amount: number
}

export interface Dashboard {
  total_units: number
  occupancy_rate: number
  units_by_status: Partial<Record<UnitStatus, number>>
  revenue_month: number
  outstanding: number
  outstanding_count: number
  deposits_held: number
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
const patch = <T>(path: string, json: unknown) => request<T>(path, { method: 'PATCH', json })
const del = <T = unknown>(path: string, org = true) =>
  request<T>(path, { method: 'DELETE', org })

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
  updateOrg: (name: string) => put<OrgInfo>('/api/org', { name }),
  members: () => get<Member[]>('/api/org/members'),
  addMember: (b: { email: string; name?: string; password?: string; role: Role }) =>
    post<Member>('/api/org/members', b),
  updateMember: (userId: number, role: Role) => put<Member>(`/api/org/members/${userId}`, { role }),
  removeMember: (userId: number) => del(`/api/org/members/${userId}`),

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
  invoice: (id: number) => get<InvoiceDetail>(`/api/invoices/${id}`),
  payInvoice: (id: number, method: 'cash' | 'promptpay') =>
    post<Invoice>(`/api/invoices/${id}/pay`, { method }),

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
  },
}
