// สัญชาติ (รหัสประเทศ ISO 3166-1 alpha-2) — ชื่อไทย + อังกฤษไว้ค้นหา
// '' หรือ 'TH' = ไทย/ไม่ระบุ (ไม่ต้องแจ้ง ตม.30)

export interface Country {
  code: string
  th: string
  en: string
}

/** ประเทศที่พบบ่อยในผู้เช่าชาวต่างชาติ (เรียงตามความถี่โดยประมาณ แล้วตามตัวอักษร) */
export const COUNTRIES: Country[] = [
  { code: 'MM', th: 'เมียนมา', en: 'Myanmar' },
  { code: 'CN', th: 'จีน', en: 'China' },
  { code: 'LA', th: 'ลาว', en: 'Laos' },
  { code: 'KH', th: 'กัมพูชา', en: 'Cambodia' },
  { code: 'US', th: 'สหรัฐอเมริกา', en: 'United States' },
  { code: 'GB', th: 'สหราชอาณาจักร', en: 'United Kingdom' },
  { code: 'JP', th: 'ญี่ปุ่น', en: 'Japan' },
  { code: 'KR', th: 'เกาหลีใต้', en: 'South Korea' },
  { code: 'IN', th: 'อินเดีย', en: 'India' },
  { code: 'RU', th: 'รัสเซีย', en: 'Russia' },
  { code: 'DE', th: 'เยอรมนี', en: 'Germany' },
  { code: 'FR', th: 'ฝรั่งเศส', en: 'France' },
  { code: 'AU', th: 'ออสเตรเลีย', en: 'Australia' },
  { code: 'VN', th: 'เวียดนาม', en: 'Vietnam' },
  { code: 'MY', th: 'มาเลเซีย', en: 'Malaysia' },
  { code: 'SG', th: 'สิงคโปร์', en: 'Singapore' },
  { code: 'PH', th: 'ฟิลิปปินส์', en: 'Philippines' },
  { code: 'ID', th: 'อินโดนีเซีย', en: 'Indonesia' },
  { code: 'TW', th: 'ไต้หวัน', en: 'Taiwan' },
  { code: 'HK', th: 'ฮ่องกง', en: 'Hong Kong' },
  { code: 'CA', th: 'แคนาดา', en: 'Canada' },
  { code: 'NL', th: 'เนเธอร์แลนด์', en: 'Netherlands' },
  { code: 'IT', th: 'อิตาลี', en: 'Italy' },
  { code: 'ES', th: 'สเปน', en: 'Spain' },
  { code: 'SE', th: 'สวีเดน', en: 'Sweden' },
  { code: 'NO', th: 'นอร์เวย์', en: 'Norway' },
  { code: 'DK', th: 'เดนมาร์ก', en: 'Denmark' },
  { code: 'FI', th: 'ฟินแลนด์', en: 'Finland' },
  { code: 'CH', th: 'สวิตเซอร์แลนด์', en: 'Switzerland' },
  { code: 'AT', th: 'ออสเตรีย', en: 'Austria' },
  { code: 'BE', th: 'เบลเยียม', en: 'Belgium' },
  { code: 'IE', th: 'ไอร์แลนด์', en: 'Ireland' },
  { code: 'PT', th: 'โปรตุเกส', en: 'Portugal' },
  { code: 'PL', th: 'โปแลนด์', en: 'Poland' },
  { code: 'CZ', th: 'เช็กเกีย', en: 'Czechia' },
  { code: 'UA', th: 'ยูเครน', en: 'Ukraine' },
  { code: 'IL', th: 'อิสราเอล', en: 'Israel' },
  { code: 'NZ', th: 'นิวซีแลนด์', en: 'New Zealand' },
  { code: 'BD', th: 'บังกลาเทศ', en: 'Bangladesh' },
  { code: 'NP', th: 'เนปาล', en: 'Nepal' },
  { code: 'LK', th: 'ศรีลังกา', en: 'Sri Lanka' },
  { code: 'PK', th: 'ปากีสถาน', en: 'Pakistan' },
  { code: 'BT', th: 'ภูฏาน', en: 'Bhutan' },
  { code: 'MN', th: 'มองโกเลีย', en: 'Mongolia' },
  { code: 'KZ', th: 'คาซัคสถาน', en: 'Kazakhstan' },
  { code: 'AE', th: 'สหรัฐอาหรับเอมิเรตส์', en: 'United Arab Emirates' },
  { code: 'SA', th: 'ซาอุดีอาระเบีย', en: 'Saudi Arabia' },
  { code: 'TR', th: 'ตุรกี', en: 'Türkiye' },
  { code: 'IR', th: 'อิหร่าน', en: 'Iran' },
  { code: 'EG', th: 'อียิปต์', en: 'Egypt' },
  { code: 'NG', th: 'ไนจีเรีย', en: 'Nigeria' },
  { code: 'ZA', th: 'แอฟริกาใต้', en: 'South Africa' },
  { code: 'BR', th: 'บราซิล', en: 'Brazil' },
  { code: 'MX', th: 'เม็กซิโก', en: 'Mexico' },
  { code: 'AR', th: 'อาร์เจนตินา', en: 'Argentina' },
  { code: 'GR', th: 'กรีซ', en: 'Greece' },
  { code: 'HU', th: 'ฮังการี', en: 'Hungary' },
  { code: 'RO', th: 'โรมาเนีย', en: 'Romania' },
  { code: 'MO', th: 'มาเก๊า', en: 'Macao' },
  { code: 'BN', th: 'บรูไน', en: 'Brunei' },
  { code: 'TL', th: 'ติมอร์-เลสเต', en: 'Timor-Leste' },
]

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]))

/** ผู้เช่าเป็นชาวต่างชาติ (ต้องแจ้ง ตม.30) */
export const isForeign = (code: string | null | undefined) => {
  const c = (code ?? '').trim().toUpperCase()
  return c !== '' && c !== 'TH'
}

/** ชื่อประเทศภาษาไทย (ไม่รู้จัก → รหัส) */
export const countryName = (code: string | null | undefined) => {
  const c = (code ?? '').trim().toUpperCase()
  if (!c || c === 'TH') return 'ไทย'
  return BY_CODE.get(c)?.th ?? c
}

export const findCountry = (code: string) => BY_CODE.get(code.trim().toUpperCase())

export const GENDERS: { v: '' | 'M' | 'F'; label: string }[] = [
  { v: '', label: 'ไม่ระบุ' },
  { v: 'M', label: 'ชาย' },
  { v: 'F', label: 'หญิง' },
]

export const genderLabel = (g: string | null | undefined) => (g === 'M' ? 'ชาย' : g === 'F' ? 'หญิง' : '—')

/** ประเภทวีซ่าที่พบบ่อย (ช่วยพิมพ์ — พิมพ์ค่าอื่นได้) */
export const VISA_TYPES = [
  'ยกเว้นการตรวจลงตรา (Visa Exemption)',
  'Tourist (TR)',
  'Visa on Arrival',
  'Non-Immigrant B',
  'Non-Immigrant O',
  'Non-Immigrant ED',
  'Non-Immigrant O-A',
  'Destination Thailand Visa (DTV)',
  'Long-Term Resident (LTR)',
  'Thailand Privilege',
]
