// หน้าแนะนำระบบ (/ ตอนยังไม่ล็อกอิน และ /pricing) — โหลดแยกจากแอป ไม่ใช้ provider/guard ของแอป
// ข้อความทุกข้อต้องตรงกับสิ่งที่ระบบทำได้จริง (ดู README.md) — เขียนเป็นข้อเท็จจริง ไม่ใช่สโลแกน
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BarChart3,
  CalendarRange,
  ChevronDown,
  FileSignature,
  FileUp,
  Gauge,
  Menu,
  MessageCircle,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useMe } from '@/lib/me'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { Logo } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { ContactSection } from './contact'
import { PricingSection } from './pricing'
import { ProductPreview } from './product-preview'

const YEAR = new Date().getFullYear()

const NAV = [
  { href: '#features', label: 'ฟีเจอร์' },
  { href: '#pricing', label: 'ราคา' },
  { href: '#faq', label: 'คำถามที่พบบ่อย' },
  { href: '#contact', label: 'ติดต่อ' },
]

const JOBS: { title: string; body: string }[] = [
  {
    title: 'จดมิเตอร์และออกบิล',
    body: 'ถ่ายรูปมิเตอร์จากมือถือ ระบบอ่านตัวเลขให้ตรวจ แล้วออกบิลค่าเช่า ค่าน้ำ ค่าไฟ ทั้งโครงการในรอบเดียว',
  },
  {
    title: 'ตามเงินและออกใบเสร็จ',
    body: 'บิลมี QR พร้อมเพย์ ระบบตรวจสลิป ออกใบเสร็จเลขต่อเนื่อง และส่ง LINE เตือนห้องที่ยังไม่จ่าย',
  },
  {
    title: 'ตอบผู้เช่าทาง LINE',
    body: 'ผู้เช่าพิมพ์ “บิล” “ใบเสร็จ” หรือ “แจ้งซ่อม” ใน LINE OA ของหอ แล้วได้ข้อมูลของห้องตัวเองทันที',
  },
]

const FACTS = [
  'ใบเสร็จเลขต่อเนื่อง ไม่ข้ามเลข',
  'ซิงก์ปฏิทิน OTA ทุก 30 นาที',
  'ผู้เช่าเลือกภาษาไทยหรืออังกฤษ',
  'ใช้ได้ทั้งบนมือถือและคอมพิวเตอร์',
]

const FEATURES: { icon: LucideIcon; title: string; items: string[] }[] = [
  {
    icon: Gauge,
    title: 'งานประจำเดือน',
    items: [
      'ถ่ายรูปมิเตอร์น้ำ-ไฟ ระบบอ่านตัวเลข (OCR) ให้ตรวจก่อนบันทึก และเก็บรูปไว้เป็นหลักฐาน',
      'ออกบิลทั้งโครงการในครั้งเดียว รวมค่าบริการรายเดือน เช่น อินเทอร์เน็ต ที่จอดรถ และค่าปรับจ่ายช้า',
      'บิลทุกใบมี QR พร้อมเพย์ระบุยอด ผู้เช่าสแกนจ่ายจากแอปธนาคารได้ทันที',
      'ตรวจสลิปจาก QR บนสลิปและจับสลิปซ้ำ ต่อ EasySlip หรือ SlipOK เพื่อยืนยันยอดกับธนาคารอัตโนมัติ',
      'ใบเสร็จและใบกำกับภาษีเลขที่ต่อเนื่องตามปี พ.ศ. พิมพ์ A4 ต้นฉบับและสำเนา',
    ],
  },
  {
    icon: MessageCircle,
    title: 'ผู้เช่าและ LINE',
    items: [
      'ใช้ LINE OA ของหอคุณเอง ส่งบิล ใบเสร็จ และเตือนก่อนครบกำหนดให้อัตโนมัติ',
      'พอร์ทัลผู้เช่าผ่านลิงก์ส่วนตัว ดูบิล สแกนจ่าย แนบสลิป และอ่านประกาศ',
      'แจ้งซ่อมพร้อมรูป มอบหมายผู้รับผิดชอบ ติดตามสถานะ และตอบกลับผู้เช่าทาง LINE',
      'บันทึกพัสดุ แจ้งผู้เช่าพร้อมรหัสรับ 4 หลัก เก็บลายเซ็นตอนส่งมอบ',
      'ผู้เช่าต่างชาติรับบิล ใบเสร็จ และข้อความแจ้งเตือนเป็นภาษาอังกฤษ',
    ],
  },
  {
    icon: CalendarRange,
    title: 'ห้องพักรายวัน',
    items: [
      'ปฏิทินรวมทุกห้อง แยกสีตามช่องทาง และเตือนเมื่อมีการจองซ้อน',
      'ซิงก์วันที่ไม่ว่างกับ Airbnb, Booking.com, Agoda และ VRBO ผ่านลิงก์ iCal',
      'หน้าจองตรงของโครงการ แขกเลือกวัน ส่งคำขอ และโอนมัดจำผ่านพร้อมเพย์ ไม่มีค่าคอมมิชชัน',
      'แขกเช็คเอาท์แล้วระบบสร้างงานทำความสะอาด และแจ้งแม่บ้านทาง LINE',
      'ตั้งราคาตามฤดูกาล วันหยุด หรือวันศุกร์-เสาร์ และส่วนลดเมื่อพักหลายคืน',
    ],
  },
  {
    icon: FileSignature,
    title: 'เอกสารและกฎหมาย',
    items: [
      'สัญญาเช่าอิเล็กทรอนิกส์ ผู้เช่าลงนามบนมือถือ ระบบเก็บเวลา IP และค่า SHA-256 ของเนื้อหาสัญญา',
      'ตม.30: สร้างรายการเมื่อผู้เช่าต่างชาติเข้าพัก นับเวลา 24 ชั่วโมง และส่งออกไฟล์ช่วยกรอก',
      'PDPA: ประกาศความเป็นส่วนตัว บันทึกความยินยอม รับคำขอใช้สิทธิ และส่งออกข้อมูลผู้เช่า',
      'ประวัติการใช้งาน (audit log) ของการรับเงิน ยกเลิกเอกสาร ลบข้อมูล และเปลี่ยนสิทธิ์',
    ],
  },
  {
    icon: BarChart3,
    title: 'ภาพรวมธุรกิจ',
    items: [
      'รายรับ อัตราเข้าพัก และอายุหนี้ย้อนหลังรายเดือน พร้อมรายชื่อห้องที่ค้างมากที่สุด',
      'บันทึกรายจ่ายพร้อมรูปใบเสร็จ และตั้งรายจ่ายประจำให้ลงรายการทุกเดือน',
      'กำไรต่อโครงการ รายรับเทียบรายจ่าย ส่งออก CSV ให้นักบัญชี',
      'ทีมงานหลายคน แบ่งสิทธิ์เป็นเจ้าของ ผู้ดูแล และพนักงาน',
    ],
  },
  {
    icon: FileUp,
    title: 'เริ่มจากข้อมูลที่มีอยู่',
    items: [
      'นำเข้าจากไฟล์ Excel หรือ CSV ที่ใช้อยู่ ไม่ต้องกรอกใหม่ตามแม่แบบ',
      'จับคู่คอลัมน์ของไฟล์กับข้อมูลในระบบ ระบบเดาจากหัวคอลัมน์ภาษาไทยและอังกฤษให้ก่อน',
      'นำเข้าโครงการ ห้อง ผู้เช่า สัญญา และเลขมิเตอร์ล่าสุดในครั้งเดียว',
      'ตรวจผลทีละแถวก่อนยืนยัน แถวที่มีปัญหาแจ้งเหตุผล นำเข้าไฟล์เดิมซ้ำไม่สร้างข้อมูลซ้ำ',
    ],
  },
]

const STEPS: { title: string; body: string }[] = [
  {
    title: 'สมัครและตั้งชื่อองค์กร',
    body: 'สมัครด้วยอีเมล ตั้งชื่อหอหรือบริษัท แล้วใช้งานแพ็กเกจเริ่มต้นได้ทันที ไม่ต้องผูกบัตร',
  },
  {
    title: 'นำเข้าข้อมูลหรือเพิ่มห้องเอง',
    body: 'อัปโหลด Excel ที่ใช้อยู่แล้วจับคู่คอลัมน์ หรือเพิ่มโครงการและห้องเอง จากนั้นตั้งค่าน้ำ ค่าไฟ และเลขพร้อมเพย์ของโครงการ',
  },
  {
    title: 'เชื่อม LINE OA แล้วออกบิลรอบแรก',
    body: 'ใส่ค่าจาก LINE Developers ของ OA ที่หอมีอยู่ ส่งลิงก์ให้ผู้เช่าเชื่อมบัญชีครั้งเดียว แล้วจดมิเตอร์และออกบิลเดือนแรก',
  },
]

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'ข้อมูลของเราเก็บไว้ที่ไหน สำรองอย่างไร',
    a: (
      <>
        <p>
          ข้อมูลเก็บในฐานข้อมูลบนเซิร์ฟเวอร์ของผู้ให้บริการ ข้อมูลของแต่ละองค์กรแยกจากกัน
          ผู้ใช้เห็นเฉพาะองค์กรที่ตัวเองเป็นสมาชิก ระบบสำรองฐานข้อมูลและไฟล์รูปทุกวัน
        </p>
        <p>
          token ของ LINE และ API key ของบริการตรวจสลิปเข้ารหัส (AES-256-GCM) ก่อนบันทึก ไฟล์ที่อัปโหลด เช่น
          สลิปและรูปมิเตอร์ เปิดได้เฉพาะผู้ที่มีสิทธิ์
        </p>
      </>
    ),
  },
  {
    q: 'ใช้กับ LINE OA ที่หอมีอยู่แล้วได้ไหม',
    a: (
      <>
        <p>
          ได้ ใช้ LINE Official Account เดิม เปิด Messaging API แล้วนำ Channel secret และ Channel access token
          มาใส่ในหน้าตั้งค่า เพื่อนใน OA เดิมยังอยู่ครบ ผู้เช่าเชื่อมบัญชีครั้งเดียวผ่านพอร์ทัลหรือสแกน QR
        </p>
        <p>
          ข้อความที่ระบบส่งให้ผู้เช่านับรวมในโควตาข้อความของแพ็กเกจ LINE OA ที่คุณใช้อยู่
          ส่วนข้อความที่ระบบตอบเมื่อผู้เช่าพิมพ์ถามเป็นการตอบกลับ ซึ่ง LINE ไม่นับโควตา
        </p>
      </>
    ),
  },
  {
    q: 'เชื่อม Airbnb, Booking.com, Agoda ได้แค่ไหน',
    a: (
      <>
        <p>
          ระบบซิงก์ <b className="font-medium">วันที่ไม่ว่าง</b> ผ่านลิงก์ iCal ทั้งขาเข้าและขาออก ระบบดึงปฏิทินจาก OTA
          ทุก 30 นาที วันที่ถูกจองในช่องทางหนึ่งจะถูกปิดในระบบและในช่องทางอื่น
        </p>
        <p>
          iCal ไม่ส่งราคา ชื่อแขก หรือรายละเอียดการจอง ราคาบน OTA จึงยังต้องแก้ที่แต่ละช่องทาง และ OTA
          ดึงปฏิทินจากเราตามรอบของเขาเอง ช่วงสั้น ๆ ระหว่างรอบอาจเกิดการจองซ้อนได้ ระบบจะเตือนเมื่อพบ
          การซิงก์ราคาและรับการจองอัตโนมัติต้องเชื่อมผ่าน Channel Manager ซึ่งยังไม่รองรับในตอนนี้
        </p>
      </>
    ),
  },
  {
    q: 'ออกใบกำกับภาษีได้ไหม',
    a: (
      <p>
        ได้ ใส่ชื่อนิติบุคคล เลขประจำตัวผู้เสียภาษี และสาขาในหน้าตั้งค่า ระบบออกใบเสร็จรับเงิน/ใบกำกับภาษีเลขที่ต่อเนื่องตามปี
        พ.ศ. เลือกคิด VAT ได้ทีละรายการ รองรับหักภาษี ณ ที่จ่าย ข้อมูลผู้ออกและผู้จ่ายถูกบันทึกลงเอกสาร ณ
        วันที่ออกและแก้ย้อนหลังไม่ได้ ยกเลิกเอกสารได้พร้อมเหตุผลโดยเลขที่ไม่หาย ควรให้นักบัญชีตรวจการตั้งค่า VAT
        ก่อนเริ่มใช้จริง
      </p>
    ),
  },
  {
    q: 'ย้ายข้อมูลจาก Excel ที่ใช้อยู่ได้ไหม',
    a: (
      <p>
        ได้ อัปโหลดไฟล์ .xlsx .xls .ods หรือ .csv เลือกชีตและแถวหัวตาราง แล้วจับคู่คอลัมน์กับข้อมูลในระบบ
        ระบบรองรับวันที่แบบ พ.ศ. เบอร์โทรที่ Excel ตัดเลข 0 หน้า และ CSV ภาษาไทยที่บันทึกจาก Excel
        ตรวจผลทีละแถวได้ก่อนกดนำเข้า ถ้ามีหลายไฟล์หรือรูปแบบซับซ้อน ทีมงานช่วยดูให้ได้
      </p>
    ),
  },
  {
    q: 'ยกเลิกได้เมื่อไหร่ เอาข้อมูลออกได้ไหม',
    a: (
      <>
        <p>
          ไม่มีสัญญาผูกมัด ค่าบริการจ่ายเป็นรอบผ่านพร้อมเพย์ ระบบไม่ตัดเงินอัตโนมัติ ถ้าไม่ต่ออายุ
          บัญชีจะเปลี่ยนเป็นอ่านอย่างเดียวหลังพ้นช่วงผ่อนผัน ข้อมูลยังอยู่ครบ
          และเปลี่ยนไปแพ็กเกจที่เล็กลงได้ถ้าจำนวนห้องไม่เกินขีดจำกัด
        </p>
        <p>
          ส่งออกรายงานรายรับ ลูกหนี้ รายจ่าย และกำไรเป็น CSV (เปิดใน Excel ได้) และส่งออกข้อมูลผู้เช่ารายคนเป็น JSON
          ได้ตลอดเวลา
        </p>
      </>
    ),
  },
  {
    q: 'ระบบช่วยเรื่อง PDPA อย่างไร',
    a: (
      <p>
        คุณเป็นผู้ควบคุมข้อมูลของผู้เช่า Estate เป็นผู้ประมวลผลตามคำสั่งของคุณ ระบบมีประกาศความเป็นส่วนตัวที่แก้ไขได้
        บันทึกความยินยอมของผู้เช่า รับคำขอใช้สิทธิพร้อมนับกำหนด 30 วัน ส่งออกข้อมูลของเจ้าของข้อมูล
        ทำข้อมูลให้ไม่ระบุตัวตน และเตือนเมื่อครบระยะเวลาเก็บที่ตั้งไว้ รายละเอียดอยู่ใน
        <Link to="/privacy" className="mx-1 font-medium text-primary hover:underline">
          นโยบายความเป็นส่วนตัว
        </Link>
      </p>
    ),
  },
]

/** เริ่มโหลดหน้าเข้าสู่ระบบ/สมัครเมื่อผู้ใช้ชี้หรือแตะปุ่ม — คลิกแล้วเปิดได้เร็วขึ้น */
let authPrefetched = false
function prefetchAuth() {
  if (authPrefetched) return
  authPrefetched = true
  void import('@/components/app-providers')
  void import('@/components/guards')
  void import('@/pages/auth/login')
  void import('@/pages/auth/register')
}

export default function LandingPage({ section }: { section?: 'pricing' }) {
  const { hash } = useLocation()
  const me = useMe()
  const authed = !!me.data
  const site = useQuery({
    queryKey: ['public-site'],
    queryFn: api.publicSite,
    staleTime: 10 * 60_000,
    retry: 1,
    meta: { silent: true },
  })
  useDocumentTitle(
    section === 'pricing' ? 'ราคาและแพ็กเกจ · Estate' : 'Estate — ระบบบริหารหอพัก อพาร์ทเมนต์ และห้องเช่า',
  )

  // เปิดจาก /pricing หรือลิงก์ที่มี #ส่วน → เลื่อนไปยังส่วนนั้นหลังเรนเดอร์
  useEffect(() => {
    const id = section ?? (hash ? decodeURIComponent(hash.slice(1)) : '')
    if (!id) return
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
  }, [section, hash])

  const starter = site.data?.packages.find((p) => p.is_default) ?? site.data?.packages[0]

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader authed={authed} />
      <main>
        {/* ---------- ส่วนหัว ---------- */}
        <section className="overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-16 sm:pb-24 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
            <div>
              <p className="text-sm text-muted-foreground">
                สำหรับหอพัก อพาร์ทเมนต์ คอนโดปล่อยเช่า บ้านเช่า และห้องพักรายวัน
              </p>
              <h1 className="mt-3 text-[2rem] leading-tight sm:text-[2.6rem]">
                ระบบหลังบ้านสำหรับคนปล่อยเช่าห้อง ออกบิล รับเงิน และตอบผู้เช่าทาง LINE
              </h1>
              <p className="mt-4 max-w-xl text-[17px] text-muted-foreground">
                ใช้แทนสมุดจดมิเตอร์ ไฟล์ Excel และการทวงค่าเช่าในแชตทีละห้อง ทีมงานใช้บนมือถือหรือคอมพิวเตอร์ก็ได้
              </p>
              <ol className="mt-8 space-y-4 border-t pt-6">
                {JOBS.map((j, i) => (
                  <li key={j.title} className="flex gap-4">
                    <span className="grid size-6 shrink-0 place-items-center rounded-sm border text-xs font-semibold text-primary tabular-nums">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{j.title}</p>
                      <p className="text-sm text-muted-foreground">{j.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {authed ? (
                  <Button asChild size="lg">
                    <Link to="/">
                      ไปที่แอป <ArrowRight />
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="lg">
                    <Link to="/register" onPointerEnter={prefetchAuth} onFocus={prefetchAuth} onTouchStart={prefetchAuth}>
                      สมัครใช้งาน <ArrowRight />
                    </Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="outline">
                  <a href="#pricing">ดูราคา</a>
                </Button>
              </div>
              <p className="mt-3 min-h-5 text-sm text-muted-foreground">
                {starter &&
                  (starter.price_monthly > 0
                    ? `เริ่มด้วยแพ็กเกจ ${starter.name} ทดลองใช้ 14 วัน ไม่ต้องผูกบัตร`
                    : `แพ็กเกจ ${starter.name} ใช้ฟรีไม่มีวันหมดอายุ ไม่ต้องผูกบัตร`)}
              </p>
            </div>
            <div>
              <ProductPreview />
            </div>
          </div>
          <div className="border-y bg-muted/30">
            <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-3 px-4 py-5 text-sm sm:px-6 md:grid-cols-4">
              {FACTS.map((f) => (
                <li key={f} className="flex gap-3">
                  <span className="mt-2.5 h-px w-4 shrink-0 bg-primary" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- ฟีเจอร์ ---------- */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <h2 id="features-title" className="text-2xl sm:text-3xl">
                ระบบทำอะไรให้บ้าง
              </h2>
              <p className="mt-2 text-muted-foreground">
                ทุกข้อด้านล่างใช้งานได้ในระบบตอนนี้ บางส่วน เช่น OCR และห้องรายวัน ขึ้นกับแพ็กเกจ
              </p>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((g) => (
                <div key={g.title} className="bg-card p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-md border bg-muted text-primary">
                      <g.icon className="size-[18px]" aria-hidden />
                    </span>
                    <h3 className="text-base">{g.title}</h3>
                  </div>
                  <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                    {g.items.map((it) => (
                      <li key={it} className="flex gap-3">
                        <span className="mt-2.5 h-px w-3 shrink-0 bg-primary/70" aria-hidden />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- เริ่มใช้งาน ---------- */}
        <section aria-labelledby="steps-title" className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 id="steps-title" className="text-2xl sm:text-3xl">
              เริ่มใช้งานอย่างไร
            </h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="border-t-2 border-primary pt-5">
                  <span className="text-sm font-semibold text-primary tabular-nums">ขั้นที่ {i + 1}</span>
                  <h3 className="mt-1 text-lg">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <PricingSection
          site={site.data}
          loading={site.isLoading}
          error={site.isError}
          onRetry={() => void site.refetch()}
          authed={authed}
          onIntent={prefetchAuth}
        />

        {/* ---------- คำถามที่พบบ่อย ---------- */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_2fr] lg:gap-16">
            <div>
              <h2 id="faq-title" className="text-2xl sm:text-3xl">
                คำถามที่พบบ่อย
              </h2>
              <p className="mt-2 text-muted-foreground">
                ไม่เจอคำตอบที่ต้องการ{' '}
                <a href="#contact" className="font-medium text-primary underline-offset-4 hover:underline">
                  ถามทีมงานได้
                </a>
              </p>
            </div>
            <div className="divide-y border-y">
              {FAQ.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-4 py-4 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    <span className="flex-1">{f.q}</span>
                    <ChevronDown
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <div className="space-y-3 pb-5 text-[15px] leading-relaxed text-muted-foreground">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <ContactSection site={site.data} />
      </main>
      <SiteFooter company={site.data?.company.name} />
    </div>
  )
}

function SiteHeader({ authed }: { authed: boolean }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" aria-label="Estate หน้าแรก" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <Logo subtitle={false} />
        </Link>
        <nav aria-label="ส่วนของหน้า" className="ml-6 hidden gap-1 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-sm px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {authed ? (
            <Button asChild size="sm">
              <Link to="/">
                ไปที่แอป <ArrowRight />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/login" onPointerEnter={prefetchAuth} onFocus={prefetchAuth} onTouchStart={prefetchAuth}>
                  เข้าสู่ระบบ
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register" onPointerEnter={prefetchAuth} onFocus={prefetchAuth} onTouchStart={prefetchAuth}>
                  สมัครใช้งาน
                </Link>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {open && (
        <nav id="landing-menu" aria-label="ส่วนของหน้า" className="border-t md:hidden">
          <ul className="mx-auto grid max-w-6xl px-2 py-2">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} onClick={close} className="block rounded-sm px-3 py-2.5 text-sm hover:bg-muted">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}

function SiteFooter({ company }: { company?: string }) {
  const link = 'text-muted-foreground transition-colors hover:text-foreground'
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo subtitle={false} />
          <p className="mt-3 max-w-xs text-muted-foreground">
            ระบบบริหารห้องเช่าสำหรับหอพัก อพาร์ทเมนต์ คอนโด บ้านเช่า และห้องพักรายวัน
          </p>
        </div>
        <FooterCol title="ผลิตภัณฑ์">
          <a href="#features" className={link}>ฟีเจอร์</a>
          <Link to="/pricing" className={link}>ราคา</Link>
          <a href="#faq" className={link}>คำถามที่พบบ่อย</a>
        </FooterCol>
        <FooterCol title="บัญชี">
          <Link to="/login" className={link}>เข้าสู่ระบบ</Link>
          <Link to="/register" className={link}>สมัครใช้งาน</Link>
          <a href="#contact" className={link}>ติดต่อทีมงาน</a>
        </FooterCol>
        <FooterCol title="เอกสาร">
          <Link to="/terms" className={link}>ข้อกำหนดการใช้งาน</Link>
          <Link to="/privacy" className={link}>นโยบายความเป็นส่วนตัว</Link>
        </FooterCol>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          © {YEAR} {company?.trim() || 'Estate'}
        </p>
      </div>
    </footer>
  )
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <div className={cn('mt-3 flex flex-col items-start gap-2')}>{children}</div>
    </div>
  )
}
