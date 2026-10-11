import Alpine from 'alpinejs';
import { renderRoom, renderBuilding } from './three-view.js';

const api = async (path, opts = {}) => {
  const init = { ...opts };
  if (opts.json !== undefined) {
    init.method ||= 'POST';
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(opts.json);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
};

// เก็บอ็อบเจกต์ three.js / Leaflet / Tesseract ไว้นอก Alpine เพื่อไม่ให้ถูกห่อด้วย reactive proxy
const stages = { building: null, room: null };
const maps = {};
const ocr = { worker: null };

const today = () => new Date().toISOString().slice(0, 10);
const thisPeriod = () => new Date().toISOString().slice(0, 7);

export const KINDS = {
  dormitory: 'หอพัก', apartment: 'อพาร์ทเมนต์', condo: 'คอนโด', house: 'บ้านเช่า', short_stay: 'ห้องพักรายวัน / Airbnb',
};
export const STATUS = {
  vacant: { label: 'ว่าง', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200', tile: 'from-emerald-400 to-emerald-500' },
  reserved: { label: 'จองแล้ว', cls: 'bg-amber-100 text-amber-700 ring-amber-200', tile: 'from-amber-400 to-amber-500' },
  occupied: { label: 'มีผู้เช่า', cls: 'bg-indigo-100 text-indigo-700 ring-indigo-200', tile: 'from-indigo-500 to-violet-500' },
  maintenance: { label: 'ปิดปรับปรุง', cls: 'bg-slate-200 text-slate-600 ring-slate-300', tile: 'from-slate-400 to-slate-500' },
};
const BOOKING_STATUS = {
  reserved: ['จองแล้ว', 'bg-amber-100 text-amber-700'],
  active: ['กำลังเข้าพัก', 'bg-indigo-100 text-indigo-700'],
  completed: ['สิ้นสุดแล้ว', 'bg-slate-100 text-slate-600'],
  cancelled: ['ยกเลิก', 'bg-rose-100 text-rose-700'],
};
const DEPOSIT_STATUS = { pending: 'รอชำระ', paid: 'ชำระแล้ว', refunded: 'คืนแล้ว', forfeited: 'ริบ' };
const FURNITURE = {
  bed: ['เตียง', 1.6, 2.0, 0.5], desk: ['โต๊ะทำงาน', 1.2, 0.6, 0.75], wardrobe: ['ตู้เสื้อผ้า', 0.6, 1.2, 2.0],
  sofa: ['โซฟา', 1.8, 0.8, 0.8], fridge: ['ตู้เย็น', 0.6, 0.6, 1.5], tv: ['ทีวี', 1.2, 0.3, 1.0],
  bathroom: ['ห้องน้ำ', 1.6, 2.0, 2.4], kitchen: ['เคาน์เตอร์ครัว', 2.0, 0.6, 0.9],
};

const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const thDate = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');

Alpine.data('app', () => ({
  KINDS, STATUS, BOOKING_STATUS, DEPOSIT_STATUS, FURNITURE, baht, thDate,
  page: location.hash.slice(1) || 'dashboard',
  nav: [
    ['dashboard', 'ภาพรวม', 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z'],
    ['properties', 'โครงการ & แผนที่', 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z'],
    ['units', 'ห้องพัก & 3D', 'M12 3L2 9l10 6 10-6-10-6zm-8 9.5l8 4.8 8-4.8M4 16l8 5 8-5'],
    ['bookings', 'การจอง & มัดจำ', 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V9h14v11z'],
    ['meters', 'จดมิเตอร์', 'M13 2L3 14h7l-1 8 10-12h-7l1-8z'],
    ['invoices', 'บิล & ชำระเงิน', 'M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2H4zm12 13H8v-2h8v2zm0-4H8V9h8v2zm0-4H8V5h8v2z'],
    ['tenants', 'ผู้เช่า', 'M16 11a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z'],
  ],
  toast: null,
  sidebar: false,
  dash: null,
  properties: [],
  units: [],
  tenants: [],
  bookings: [],
  invoices: [],
  meters: [],

  // ui state
  selectedProperty: null,
  view3d: false,
  unit: null,
  unitTab: 'info',
  propertyForm: null,
  bookingForm: null,
  tenantForm: null,
  bookingFilter: '',
  invoiceFilter: { property_id: '', period: thisPeriod(), status: '' },
  invoiceView: null,
  meterForm: { property_id: '', unit_id: '', meter_type: 'electric', reading_date: today(), value: '', ocr_raw: '', photo: null, preview: null, allow_decrease: false },
  ocrBusy: false,
  ocrProgress: 0,
  newFurniture: 'bed',

  async init() {
    window.addEventListener('hashchange', () => this.go(location.hash.slice(1) || 'dashboard'));
    await Promise.all([this.loadProperties(), this.loadTenants()]);
    this.selectedProperty = this.properties[0]?.id ?? null;
    this.meterForm.property_id = this.selectedProperty;
    await this.go(this.page);
  },

  notify(msg, type = 'ok') {
    this.toast = { msg, type };
    clearTimeout(this._t);
    this._t = setTimeout(() => (this.toast = null), 3500);
  },

  async safe(fn, okMsg) {
    try {
      const r = await fn();
      if (okMsg) this.notify(okMsg);
      return r;
    } catch (e) {
      this.notify(e.message, 'error');
    }
  },

  async go(page) {
    this.page = page;
    this.sidebar = false;
    if (location.hash.slice(1) !== page) history.replaceState(null, '', '#' + page);
    this.disposeStage();
    if (page === 'dashboard') this.dash = await this.safe(() => api('/api/dashboard'));
    if (page === 'units') await this.loadUnits();
    if (page === 'bookings') await Promise.all([this.loadBookings(), this.loadAllUnits()]);
    if (page === 'meters') await Promise.all([this.loadAllUnits(), this.loadMeters()]);
    if (page === 'invoices') await this.loadInvoices();
    if (page === 'tenants') await this.loadTenants();
    this.$nextTick(() => {
      if (page === 'dashboard') this.drawMap('dashMap');
      if (page === 'properties') this.drawMap('propMap');
      if (page === 'units' && this.view3d) this.drawBuilding();
    });
  },

  // ---------- data ----------
  async loadProperties() { this.properties = (await this.safe(() => api('/api/properties'))) || []; },
  async loadTenants() { this.tenants = (await this.safe(() => api('/api/tenants'))) || []; },
  async loadUnits() {
    if (!this.selectedProperty) return (this.units = []);
    this.units = (await this.safe(() => api('/api/units?property_id=' + this.selectedProperty))) || [];
  },
  async loadAllUnits() { this.allUnits = (await this.safe(() => api('/api/units'))) || []; },
  allUnits: [],
  async loadBookings() {
    const q = this.bookingFilter ? '?status=' + this.bookingFilter : '';
    this.bookings = (await this.safe(() => api('/api/bookings' + q))) || [];
  },
  async loadMeters() {
    const q = this.meterForm.unit_id ? '?unit_id=' + this.meterForm.unit_id : '';
    this.meters = (await this.safe(() => api('/api/meter-readings' + q))) || [];
  },
  async loadInvoices() {
    const p = new URLSearchParams(Object.entries(this.invoiceFilter).filter(([, v]) => v));
    this.invoices = (await this.safe(() => api('/api/invoices?' + p))) || [];
  },

  propName(id) { return this.properties.find((p) => p.id == id)?.name ?? ''; },
  unitLabel(u) { return `${this.propName(u.property_id)} · ห้อง ${u.name}`; },
  get floors() {
    const g = {};
    for (const u of this.units) (g[u.floor] ||= []).push(u);
    return Object.entries(g).sort((a, b) => b[0] - a[0]);
  },
  get unitCounts() {
    const c = { vacant: 0, reserved: 0, occupied: 0, maintenance: 0 };
    for (const u of this.units) c[u.status]++;
    return c;
  },

  // ---------- maps ----------
  drawMap(id) {
    const el = document.getElementById(id);
    if (!el || !window.L) return;
    if (maps[id]) maps[id].remove();
    const map = L.map(el, { scrollWheelZoom: id === 'propMap' }).setView([13.75, 100.5], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);
    const pts = [];
    for (const p of this.properties) {
      if (p.lat == null || p.lng == null) continue;
      pts.push([p.lat, p.lng]);
      const icon = L.divIcon({
        className: '',
        html: `<div class="pin"><span>${p.kind === 'short_stay' ? '★' : '⌂'}</span></div>`,
        iconSize: [34, 34], iconAnchor: [17, 34],
      });
      L.marker([p.lat, p.lng], { icon }).addTo(map)
        .bindPopup(`<b>${p.name}</b><br><span style="color:#64748b">${KINDS[p.kind]}</span><br>${p.address}`);
    }
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
    if (id === 'propMap') {
      map.on('click', (e) => {
        if (!this.propertyForm) return;
        this.propertyForm.lat = +e.latlng.lat.toFixed(6);
        this.propertyForm.lng = +e.latlng.lng.toFixed(6);
        this.notify('ตั้งพิกัดจากแผนที่แล้ว');
      });
    }
    maps[id] = map;
    setTimeout(() => map.invalidateSize(), 150);
  },

  // ---------- properties ----------
  editProperty(p) {
    this.propertyForm = p
      ? { ...p }
      : { name: '', kind: 'dormitory', address: '', lat: null, lng: null, electric_rate: 8, water_rate: 18, promptpay_id: '' };
  },
  async saveProperty() {
    const f = this.propertyForm;
    const body = { ...f, lat: f.lat === '' ? null : f.lat, lng: f.lng === '' ? null : f.lng };
    await this.safe(async () => {
      await api(f.id ? `/api/properties/${f.id}` : '/api/properties', { method: f.id ? 'PUT' : 'POST', json: body });
      this.propertyForm = null;
      await this.loadProperties();
      this.drawMap('propMap');
    }, 'บันทึกโครงการแล้ว');
  },
  async deleteProperty(p) {
    if (!confirm(`ลบ "${p.name}" และห้องทั้งหมดในโครงการ?`)) return;
    await this.safe(async () => {
      await api(`/api/properties/${p.id}`, { method: 'DELETE' });
      await this.loadProperties();
      this.drawMap('propMap');
    }, 'ลบแล้ว');
  },
  locateMe() {
    navigator.geolocation?.getCurrentPosition((pos) => {
      this.propertyForm.lat = +pos.coords.latitude.toFixed(6);
      this.propertyForm.lng = +pos.coords.longitude.toFixed(6);
    }, () => this.notify('ไม่สามารถอ่านตำแหน่งได้', 'error'));
  },

  // ---------- units & 3D ----------
  async selectProperty(id) {
    this.selectedProperty = +id;
    this.unit = null;
    await this.loadUnits();
    if (this.view3d) this.$nextTick(() => this.drawBuilding());
  },
  toggle3d() {
    this.view3d = !this.view3d;
    this.disposeStage();
    if (this.view3d) this.$nextTick(() => this.drawBuilding());
  },
  disposeStage() { stages.building?.dispose(); stages.building = null; },
  drawBuilding() {
    const el = document.getElementById('building3d');
    if (!el) return;
    this.disposeStage();
    stages.building = renderBuilding(el, this.units, (u) => this.openUnit(u));
  },
  async openUnit(u) {
    this.unit = { ...u, layout: [...(u.layout || [])] };
    this.unitTab = 'room3d';
    this.unitBookings = (await this.safe(() => api('/api/bookings?unit_id=' + u.id))) || [];
    this.unitMeters = (await this.safe(() => api('/api/meter-readings?unit_id=' + u.id))) || [];
    this.$nextTick(() => this.drawRoom());
  },
  unitBookings: [],
  unitMeters: [],
  drawRoom() {
    const el = document.getElementById('room3d');
    stages.room?.dispose();
    stages.room = el && this.unit ? renderRoom(el, this.unit) : null;
  },
  closeUnit() {
    stages.room?.dispose();
    stages.room = null;
    this.unit = null;
  },
  addFurniture() {
    const [, w, d, h] = FURNITURE[this.newFurniture];
    this.unit.layout.push({ kind: this.newFurniture, x: 0, z: 0, w, d, h });
    this.drawRoom();
  },
  removeFurniture(i) { this.unit.layout.splice(i, 1); this.drawRoom(); },
  async saveUnit() {
    const u = this.unit;
    await this.safe(async () => {
      const saved = await api(`/api/units/${u.id}`, { method: 'PUT', json: u });
      Object.assign(this.unit, saved);
      await this.loadUnits();
      if (this.view3d) this.drawBuilding();
      this.drawRoom();
    }, 'บันทึกห้องแล้ว');
  },
  async addUnit() {
    const name = prompt('หมายเลขห้อง เช่น 305');
    if (!name) return;
    const floor = parseInt(name[0], 10) || 1;
    const sample = this.units[0];
    await this.safe(async () => {
      await api('/api/units', {
        json: {
          property_id: this.selectedProperty, name, floor,
          rent_monthly: sample?.rent_monthly, rate_daily: sample?.rate_daily, deposit: sample?.deposit,
          width: sample?.width, length: sample?.length, height: sample?.height, layout: sample?.layout,
        },
      });
      await this.loadUnits();
      if (this.view3d) this.drawBuilding();
    }, 'เพิ่มห้องแล้ว');
  },
  async deleteUnit() {
    if (!confirm(`ลบห้อง ${this.unit.name}?`)) return;
    await this.safe(async () => {
      await api(`/api/units/${this.unit.id}`, { method: 'DELETE' });
      this.closeUnit();
      await this.loadUnits();
      if (this.view3d) this.drawBuilding();
    }, 'ลบห้องแล้ว');
  },

  // ---------- bookings ----------
  newBooking(unit) {
    this.bookingForm = {
      unit_id: unit?.id ?? '', tenant_id: this.tenants[0]?.id ?? '',
      kind: unit && unit.rate_daily > 0 && !unit.rent_monthly ? 'short_stay' : 'lease',
      start_date: today(), end_date: '', price: '', deposit_amount: '', source: 'direct',
    };
  },
  get bookingQuote() {
    const f = this.bookingForm;
    if (!f) return null;
    const u = this.allUnits.find((x) => x.id == f.unit_id) || this.units.find((x) => x.id == f.unit_id);
    if (!u) return null;
    if (f.kind === 'lease') {
      const rent = f.price || u.rent_monthly;
      const dep = f.deposit_amount || u.deposit;
      return { line: `ค่าเช่า ${baht(rent)}/เดือน · มัดจำ ${baht(dep)}`, total: +rent + +dep, totalLabel: 'ชำระวันทำสัญญา (เดือนแรก + มัดจำ)' };
    }
    if (!f.end_date) return null;
    const nights = Math.round((new Date(f.end_date) - new Date(f.start_date)) / 86400000);
    if (nights <= 0) return null;
    const rate = f.price || u.rate_daily;
    return { line: `${nights} คืน × ${baht(rate)}`, total: nights * rate + +(f.deposit_amount || 0), totalLabel: 'ยอดรวม' };
  },
  async saveBooking() {
    const f = this.bookingForm;
    const body = {
      ...f, unit_id: +f.unit_id, tenant_id: +f.tenant_id, end_date: f.end_date || null,
      price: f.price === '' ? null : +f.price, deposit_amount: f.deposit_amount === '' ? null : +f.deposit_amount,
    };
    await this.safe(async () => {
      await api('/api/bookings', { json: body });
      this.bookingForm = null;
      await Promise.all([this.loadBookings(), this.loadAllUnits()]);
      if (this.page === 'units') await this.loadUnits();
    }, 'บันทึกการจองแล้ว');
  },
  async patchBooking(b, patch, msg) {
    await this.safe(async () => {
      await api(`/api/bookings/${b.id}`, { method: 'PATCH', json: patch });
      await this.loadBookings();
    }, msg);
  },

  // ---------- tenants ----------
  editTenant(t) { this.tenantForm = t ? { ...t } : { full_name: '', phone: '', email: '', id_card: '', note: '' }; },
  async saveTenant() {
    const f = this.tenantForm;
    await this.safe(async () => {
      await api(f.id ? `/api/tenants/${f.id}` : '/api/tenants', { method: f.id ? 'PUT' : 'POST', json: f });
      this.tenantForm = null;
      await this.loadTenants();
    }, 'บันทึกผู้เช่าแล้ว');
  },
  async deleteTenant(t) {
    if (!confirm(`ลบ ${t.full_name}?`)) return;
    await this.safe(async () => {
      await api(`/api/tenants/${t.id}`, { method: 'DELETE' });
      await this.loadTenants();
    }, 'ลบแล้ว');
  },

  // ---------- meters & OCR ----------
  get meterUnits() { return this.allUnits.filter((u) => u.property_id == this.meterForm.property_id); },
  get lastMeter() {
    return this.meters.find((m) => m.unit_id == this.meterForm.unit_id && m.meter_type === this.meterForm.meter_type);
  },
  onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    this.meterForm.photo = file;
    this.meterForm.preview = URL.createObjectURL(file);
    this.runOcr();
  },
  /** ปรับภาพเป็นขาวดำ เพิ่มคอนทราสต์ ก่อนส่งให้ Tesseract อ่านเฉพาะตัวเลข */
  async preprocess(src) {
    const img = await new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });
    const scale = Math.min(1, 1600 / img.width);
    const c = document.createElement('canvas');
    c.width = img.width * scale; c.height = img.height * scale;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    let sum = 0;
    for (let i = 0; i < d.data.length; i += 4) {
      const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
      d.data[i] = d.data[i + 1] = d.data[i + 2] = g;
      sum += g;
    }
    const mean = sum / (d.data.length / 4);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = d.data[i] > mean * 0.9 ? 255 : 0;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  },
  async runOcr() {
    if (!this.meterForm.preview || !window.Tesseract) return;
    this.ocrBusy = true;
    this.ocrProgress = 0;
    try {
      if (!ocr.worker) {
        ocr.worker = await Tesseract.createWorker('eng', 1, {
          logger: (m) => { if (m.status === 'recognizing text') this.ocrProgress = Math.round(m.progress * 100); },
        });
        await ocr.worker.setParameters({ tessedit_char_whitelist: '0123456789.' });
      }
      const canvas = await this.preprocess(this.meterForm.preview);
      const { data } = await ocr.worker.recognize(canvas);
      const raw = data.text.trim();
      this.meterForm.ocr_raw = raw;
      const candidates = (raw.match(/\d+(\.\d+)?/g) || []).sort((a, b) => b.length - a.length);
      if (candidates[0]) {
        this.meterForm.value = candidates[0];
        this.notify(`อ่านค่าได้ ${candidates[0]} — โปรดตรวจสอบก่อนบันทึก`);
      } else {
        this.notify('อ่านตัวเลขไม่ได้ กรุณาพิมพ์ค่าเอง', 'error');
      }
    } catch (e) {
      this.notify('OCR ล้มเหลว: ' + e.message, 'error');
    } finally {
      this.ocrBusy = false;
    }
  },
  async saveMeter() {
    const f = this.meterForm;
    const fd = new FormData();
    for (const k of ['unit_id', 'meter_type', 'reading_date', 'value', 'ocr_raw']) if (f[k] !== '' && f[k] != null) fd.append(k, f[k]);
    if (f.allow_decrease) fd.append('allow_decrease', '1');
    if (f.photo) fd.append('photo', f.photo);
    await this.safe(async () => {
      await api('/api/meter-readings', { method: 'POST', body: fd });
      Object.assign(f, { value: '', ocr_raw: '', photo: null, preview: null, allow_decrease: false });
      await this.loadMeters();
    }, 'บันทึกค่ามิเตอร์แล้ว');
  },
  async deleteMeter(m) {
    if (!confirm('ลบรายการนี้?')) return;
    await this.safe(async () => { await api(`/api/meter-readings/${m.id}`, { method: 'DELETE' }); await this.loadMeters(); }, 'ลบแล้ว');
  },

  // ---------- invoices ----------
  async generateInvoices() {
    const { property_id, period } = this.invoiceFilter;
    if (!property_id) return this.notify('เลือกโครงการก่อน', 'error');
    const r = await this.safe(() => api('/api/invoices/generate', { json: { property_id: +property_id, period } }));
    if (!r) return;
    this.notify(`ออกบิลใหม่ ${r.created.length} ใบ` + (r.skipped.length ? ` · ข้าม ${r.skipped.length}` : ''));
    if (r.skipped.length) console.info(r.skipped.join('\n'));
    this.skipped = r.skipped;
    await this.loadInvoices();
  },
  skipped: [],
  get invoiceTotals() {
    const t = { total: 0, paid: 0, unpaid: 0 };
    for (const i of this.invoices) { t.total += i.total; t[i.status === 'paid' ? 'paid' : 'unpaid'] += i.total; }
    return t;
  },
  async openInvoice(inv) {
    this.invoiceView = await this.safe(() => api(`/api/invoices/${inv.id}`));
    this.$nextTick(() => {
      const el = document.getElementById('ppqr');
      const payload = this.invoiceView?.promptpay_payload;
      if (!el) return;
      if (!payload || !window.qrcode) return (el.innerHTML = '');
      const qr = qrcode(0, 'M');
      qr.addData(payload);
      qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    });
  },
  async payInvoice(method) {
    const inv = this.invoiceView.invoice;
    await this.safe(async () => {
      await api(`/api/invoices/${inv.id}/pay`, { json: { method } });
      await this.openInvoice(inv);
      await this.loadInvoices();
    }, 'บันทึกการชำระเงินแล้ว');
  },
}));

window.Alpine = Alpine;
Alpine.start();
