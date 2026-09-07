import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Bot,
  Briefcase,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Edit3,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Flame,
  FolderSearch,
  HeartHandshake,
  PieChart,
  ReceiptText,
  Repeat,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { Link } from "wouter";

// Extended showcase of Milo features across all phases
const advancedFeatures = [
  {
    icon: ReceiptText,
    tone: "bg-[#ddf7eb] text-[#168b6f]",
    badge: "AI OCR & Smart Parser",
    title: "สแกนสลิป & Statement อัตโนมัติ",
    detail: "ส่งรูปสลิปโอนเงิน หรืออัปโหลดไฟล์ PDF Statement (KBank, SCB, BBL, KTB) ไมโลแปลงเป็นตารางรายรับ-รายจ่ายลงแดชบอร์ดทันที แปลงปี พ.ศ. ให้เรียบร้อย",
  },
  {
    icon: Calendar,
    tone: "bg-[#e2f3fc] text-[#2181ab]",
    badge: "Custom Budget Cycle",
    title: "รอบงบประมาณตามวันเงินเดือนออก",
    detail: "ไม่จำเป็นต้องเริ่มวันที่ 1 คุณสามารถตั้งรอบงบตามวันเงินเดือนออกจริงได้ เช่น วันที่ 25 ถึงวันที่ 24 ของเดือนถัดไป ไมโลคำนวณงบและแจ้งเตือนให้ตรงวัน",
  },
  {
    icon: ShieldCheck,
    tone: "bg-[#fff1db] text-[#b06720]",
    badge: "Safe-to-Spend & Leak Detector",
    title: "เงินที่ใช้ได้ต่อวัน & ดักจับเงินรั่วไหล",
    detail: "คำนวณเงินที่ใช้ได้จริงต่อวันอย่างปลอดภัย (Safe-to-Spend) และมีระบบ AI ตรวจจับค่าใช้จ่ายจุกจิกที่บานปลาย พร้อมคำนวณเงินที่จะประหยัดได้ต่อปี",
  },
  {
    icon: TrendingUp,
    tone: "bg-[#f2e9ff] text-[#7d5bb2]",
    badge: "Cash Flow Forecasting",
    title: "พยากรณ์กระแสเงินสด 30 วันล่วงหน้า",
    detail: "คาดการณ์ยอดเงินในกระเป๋า 30 วันข้างหน้าจากพฤติกรรมใช้จ่ายจริงและบิลที่รอจ่าย แจ้งเตือนล่วงหน้าก่อนเงินขาดมือ (Deficit Risk Warning)",
  },
  {
    icon: UsersRound,
    tone: "bg-[#ddf7eb] text-[#168b6f]",
    badge: "Split Bill & Debt Netting",
    title: "หารบิล & ทวงหนี้เพื่อนในกลุ่ม LINE",
    detail: "ชวนไมโลเข้ากลุ่ม LINE พิมพ์หารบิลเท่ากันแบบปัดเศษสตางค์ไม่ตกหล่น หรือหารแบบแยกรายการพร้อม Service Charge 10% และ VAT 7% พร้อมสรุปยอดหนี้หักล้างกันอัตโนมัติ",
  },
  {
    icon: Briefcase,
    tone: "bg-[#e2f3fc] text-[#2181ab]",
    badge: "Freelance & Business",
    title: "ใบแจ้งหนี้ ภาษีหัก ณ ที่จ่าย 3% & VAT",
    detail: "เครื่องมือสำหรับฟรีแลนซ์และธุรกิจขนาดย่อม ออกใบแจ้งหนี้ (Invoice) พร้อมคำนวณ หัก ณ ที่จ่าย 3% (WHT) และ VAT 7% สรุปงบกำไร-ขาดทุน (P&L) และติดตามลูกหนี้/เจ้าหนี้",
  },
  {
    icon: Repeat,
    tone: "bg-[#fff1db] text-[#b06720]",
    badge: "Subscription Detector",
    title: "ตรวจจับค่าบริการรายเดือน & สมาชิก",
    detail: "ไมโลค้นหาและตรวจจับบิลที่ตัดเป็นประจำ เช่น Netflix, Spotify, ค่าเช่า, ค่ายิม สรุปเป็นปฏิทินวันตัดเงิน ไม่ให้คุณลืมยกเลิกบริการที่ไม่ได้ใช้",
  },
  {
    icon: CalendarDays,
    tone: "bg-[#f2e9ff] text-[#7d5bb2]",
    badge: "Automated Digest & Calendar",
    title: "สรุปการเงินประจำสัปดาห์ & ปฏิทิน",
    detail: "ส่งการ์ดสรุปการเงินรายสัปดาห์ (Finance Digest) เข้าแชท LINE อัตโนมัติ พร้อมปุ่มกด Export บันทึกนัดหมายลง Google Calendar หรือดาวน์โหลดไฟล์ .ics ทันที",
  },
];

const faq = [
  ["ไมโลต่างจากแอปจดบันทึกรายรับรายจ่ายทั่วไปอย่างไร?", "ไมโลทำงานใน LINE 100% คุณไม่ต้องโหลดแอปใหม่ แค่พิมพ์บอกเหมือนคุยกับเพื่อน ส่งรูปสลิป หรืออัปโหลดไฟล์ PDF Statement ธนาคาร ไมโลจะบันทึก แยกหมวด และคำนวณงบประมาณให้ทันทีแบบเรียลไทม์"],
  ["สามารถตั้งรอบงบประมาณตามวันเงินเดือนออก เช่น วันที่ 25 ได้ไหม?", "ทำได้ทันที ไมโลมีระบบ Custom Salary Budget Cycle ให้คุณกำหนดวันเริ่มรอบเงินเดือน เช่น วันที่ 25 โดยระบบจะคำนวณและตัดรอบงบประมาณทุกวันที่ 25 ของเดือนให้อัตโนมัติ"],
  ["ระบบหารบิลในกลุ่ม LINE คำนวณ Service Charge และ VAT อย่างไร?", "ไมโลคำนวณให้ทั้งแบบหารเท่ากัน (ปัดเศษสตางค์ลงตัว) และแบบแยกรายการ โดยสามารถระบุ Service Charge 10% หรือ VAT 7% เพิ่มเติมได้ และมีระบบ Debt Netting สรุปยอดหนี้ว่าใครต้องจ่ายให้ใครเพื่อลดจำนวนครั้งที่ต้องโอนเงิน"],
  ["ฟรีแลนซ์สามารถใช้ไมโลช่วยคำนวณภาษีหัก ณ ที่จ่ายได้ไหม?", "ได้เลย ไมโลมีระบบ Invoice Generator สำหรับคำนวณยอดเงินก่อนภาษี, หัก ณ ที่จ่าย 3% (WHT), และบวกภาษีมูลค่าเพิ่ม 7% (VAT) พร้อมออกใบสรุปยอดให้ส่งต่อลูกค้าได้ทันที"],
  ["ข้อมูลการเงินมีความปลอดภัยแค่ไหน?", "ข้อมูลทั้งหมดถูกจัดเก็บบนฐานข้อมูลคลาวด์มาตรฐานความปลอดภัยสูง เชื่อมต่อด้วย SSL (TLS 1.2+) และเข้าถึงได้เฉพาะคุณผ่านบัญชี LINE ที่เชื่อมต่อไว้เท่านั้น"],
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f8fffd] text-[#245851]">
      {/* Navigation Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-2xl bg-[#2bb895] text-white soft-shadow">
            <Bot className="size-5" />
          </span>
          <span className="font-display text-xl font-semibold">ไมโล</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-[#4a7a73] md:flex">
          <a href="#features" className="hover:text-[#198f73] transition-colors">ความสามารถใหม่</a>
          <a href="#showcase" className="hover:text-[#198f73] transition-colors">การ์ดอัจฉริยะ</a>
          <a href="#business" className="hover:text-[#198f73] transition-colors">ธุรกิจ & ฟรีแลนซ์</a>
          <a href="#faq" className="hover:text-[#198f73] transition-colors">คำถามที่พบบ่อย</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button className="rounded-full bg-[#238f76] px-5 text-white hover:bg-[#157a62]">
              เข้าสู่ระบบหลังบ้าน <ArrowRight className="ml-1 size-4" />
            </Button>
          </Link>
        </div>
      </header>

      <main>
        {/* Hero Section with New Milo Flex Card Showcase */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-8 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:pb-24 lg:pt-16">
          <div className="hero-orb absolute -left-40 top-4 size-[620px] pointer-events-none" />

          {/* Left Hero Content */}
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#beeadd] bg-white/90 px-4 py-2 text-sm font-medium text-[#287d6b] shadow-sm">
              <Sparkles className="size-4 text-[#20a586]" />
              Milo AI Financial OS ใน LINE ของคุณ
            </div>
            <h1 className="font-display max-w-2xl text-5xl font-semibold leading-[1.14] tracking-tight text-[#245851] sm:text-6xl">
              ชีวิตการเงินจัดการง่าย<br />
              แค่คุยกับ <span className="text-[#1ea585]">ไมโล</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#56807a]">
              จดบันทึกรายรับ-รายจ่าย สแกนสลิป ตรวจจับค่าสมาชิก ตั้งรอบบิลเงินเดือนจริง หารบิลในกลุ่ม และออกใบแจ้งหนี้ในแชท LINE เดียว
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard">
                <Button size="lg" className="rounded-full bg-[#238f76] px-7 text-base text-white hover:bg-[#157a62]">
                  เปิดแดชบอร์ดจัดการระบบ <ArrowRight className="ml-2 size-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline" className="rounded-full border-[#b8ded4] bg-white px-7 text-base text-[#357269] hover:bg-[#effbf7]">
                  สำรวจฟีเจอร์ทั้งหมด
                </Button>
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm text-[#5d827c]">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[#20a586]" /> ภาษาไทยธรรมชาติ 100%
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[#20a586]" /> ตั้งรอบเงินเดือนตามวันจริง
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-[#20a586]" /> ปลอดภัยมาตรฐาน SSL
              </span>
            </div>
          </div>

          {/* Right Hero Showcase: Replicated from User's New Image */}
          <div id="showcase" className="relative mx-auto w-full max-w-[395px]">
            {/* Main Flex Message Card */}
            <div className="overflow-hidden rounded-[2.2rem] border-[6px] border-[#cbf2e2] bg-[#f2fcf7] p-3 shadow-xl">
              {/* Header Box */}
              <div className="rounded-[1.6rem] bg-gradient-to-b from-[#e6faef] to-[#f4fdf8] p-4 border border-[#c6edd9]">
                {/* Status Bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid size-9 place-items-center rounded-full bg-[#18ad7f] text-white shadow-sm">
                      <Check className="size-5 stroke-[3]" />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold text-[#144837] flex items-center gap-1.5">
                        จดสำเร็จ <Sparkles className="size-4 text-[#1eb284]" />
                      </h3>
                      <p className="text-xs text-[#2b7e65] font-medium">อื้อๆ หมูใช้เงินเก่งจังเลยนะค้าบ 💚</p>
                    </div>
                  </div>
                  {/* Cute Cat Badge */}
                  <span className="text-2xl" title="ไมโล">🐱</span>
                </div>

                {/* Main Transaction Card Box */}
                <div className="mt-3.5 rounded-2xl bg-white p-4 shadow-sm border border-[#e2f3eb] space-y-3">
                  {/* Category Tag & Share */}
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1aa57c] px-3.5 py-1 text-xs font-semibold text-white shadow-sm">
                      🍽️ รายจ่าย - อาหาร
                    </span>
                    <button className="grid size-8 place-items-center rounded-xl border border-[#cbe6dc] text-[#1b8c6e] hover:bg-[#effaf5]">
                      <Share2 className="size-4" />
                    </button>
                  </div>

                  {/* Date and Method */}
                  <div className="flex items-center justify-between text-xs text-[#739b92]">
                    <span>26 มิ.ย. 2569 13:58</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#ebf8f2] px-2 py-0.5 font-medium text-[#1c8c6f]">
                      พร้อมเพย์
                    </span>
                  </div>

                  {/* Title & Amount */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-base font-bold text-[#1a443b] flex items-center gap-1.5">
                      💡 กินข้าว
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-[#15a278]">฿50</span>
                      <button className="grid size-7 place-items-center rounded-lg bg-[#f0faf5] text-[#208f74] hover:bg-[#dff3eb]">
                        <Edit3 className="size-3.5" />
                      </button>
                      <button className="grid size-7 place-items-center rounded-lg bg-[#fdf0ee] text-[#d65749] hover:bg-[#fbdcd7]">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <hr className="border-[#ecf5f1]" />

                  {/* Budget Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-[#2c5b52]">อาหาร</span>
                      <span className="text-[#139770] font-bold">฿15,574 / ฿15,000</span>
                    </div>
                    <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-[#e3f4ec]">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#1eb284] to-[#2ecc94] w-full" />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-[#7ea099]">
                      รอบงบ: รายเดือน (วันที่ 1)
                    </p>
                  </div>

                  {/* Cat AI Comment Box */}
                  <div className="rounded-xl bg-[#eefaf4] p-3 border border-[#d6f0e3] flex items-start gap-2.5">
                    <span className="text-xl shrink-0 mt-0.5">😸</span>
                    <p className="text-xs text-[#20604f] leading-relaxed font-medium">
                      หมวด อาหาร ทะลุมา 4% แล้วนะลูก ป้าเริ่มหงุดหงิดนิดๆ แล้ว 😤💚
                    </p>
                  </div>

                  {/* Quick Payment Switcher */}
                  <div className="pt-1">
                    <p className="text-xs font-semibold text-[#29574e] flex items-center gap-1.5">
                      💳 แตะเพื่อเปลี่ยนช่องทางชำระ
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <button className="flex items-center justify-center gap-1 rounded-xl border border-[#cfe6dd] bg-[#f7fcf9] py-1.5 text-[11px] font-semibold text-[#2a685c] hover:bg-[#eaf5ef]">
                        💳 บัตร U...
                      </button>
                      <button className="flex items-center justify-center gap-1 rounded-xl border border-[#cfe6dd] bg-[#f7fcf9] py-1.5 text-[11px] font-semibold text-[#2a685c] hover:bg-[#eaf5ef]">
                        💳 บัตร KTC
                      </button>
                      <button className="flex items-center justify-center gap-1 rounded-xl border border-[#cfe6dd] bg-[#f7fcf9] py-1.5 text-[11px] font-semibold text-[#2a685c] hover:bg-[#eaf5ef]">
                        🟧 TrueM...
                      </button>
                    </div>
                    <p className="mt-2 text-center text-[10px] text-[#86a8a1]">
                      💡 อยากได้ช่องทางอื่น กดปุ่มแก้ไข ✏️ ที่รายการได้เลย!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Gamification & Streak Banner */}
            <div className="mt-3 overflow-hidden rounded-[2rem] border-[5px] border-[#c8f1df] bg-gradient-to-r from-[#dcf7ea] via-[#e6fbf1] to-[#d6f6e7] p-3.5 shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-3xl animate-bounce">🐱🍽️</span>
                  <div>
                    <span className="text-xs font-bold text-[#148b69] flex items-center gap-1">
                      ✨ เก่งมาก! 💚
                    </span>
                    <p className="text-lg font-black text-[#144f3e] flex items-center gap-1 mt-0.5">
                      จดมา 256... <Flame className="size-4 text-[#f26335] fill-[#f26335]" />
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-full bg-[#fde9a5] px-2.5 py-0.5 text-[10px] font-extrabold text-[#966b0f] shadow-sm">
                    God Tier!
                  </span>
                  <div className="mt-1.5 h-2 w-20 overflow-hidden rounded-full bg-white/70">
                    <div className="h-full rounded-full bg-[#18ad7f] w-[92%]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* All Advanced Features Showcase */}
        <section id="features" className="mint-grid border-y border-[#d9f0e9] bg-[#effbf7] py-24">
          <div className="mx-auto max-w-6xl px-5 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#daf5e9] px-4 py-1.5 text-xs font-bold text-[#168a6f]">
                <Sparkles className="size-3.5" /> ฟีเจอร์อัปเดตใหม่ล่าสุดครบทุกด้าน
              </span>
              <h2 className="font-display mt-4 text-4xl font-semibold leading-tight text-[#245851] sm:text-5xl">
                ไม่ได้มีแค่จดรายจ่าย<br />
                ไมโลเป็น <span className="text-[#1ea585]">ระบบปฏิบัติการการเงิน</span> ใน LINE
              </h2>
              <p className="mt-4 text-base text-[#618b83]">
                ตั้งแต่สแกนสลิปธนาคาร คำนวณภาษีฟรีแลนซ์ หารบิลในกลุ่ม ไปจนถึงพยากรณ์กระแสเงินสดล่วงหน้า
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {advancedFeatures.map((item) => (
                <article key={item.title} className="rounded-[1.8rem] bg-white p-6 paper-shadow border border-[#dceee8] hover:border-[#aee3d3] transition-all hover:-translate-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`grid size-12 place-items-center rounded-2xl ${item.tone} shadow-sm`}>
                      <item.icon className="size-6" />
                    </span>
                    <span className="rounded-md bg-[#f0faf6] px-2.5 py-0.5 text-[10px] font-semibold text-[#22856d]">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="font-display mt-5 text-lg font-bold text-[#23554d] leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-2.5 text-xs leading-5 text-[#6b8e88]">
                    {item.detail}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Business & Freelancer Section */}
        <section id="business" className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 lg:grid-cols-2 lg:px-8">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f7f2] px-3.5 py-1 text-xs font-bold text-[#1e9a7d]">
              <Briefcase className="size-3.5" /> ออกแบบมาเพื่อฟรีแลนซ์ & คนทำงาน
            </span>
            <h2 className="font-display mt-4 text-4xl font-semibold leading-tight text-[#245851]">
              จัดการรายได้ ภาษี และใบแจ้งหนี้<br />
              <span className="text-[#1da484]">ไม่ต้องเปิด Excel ให้ปวดหัว</span>
            </h2>
            <p className="mt-5 text-base leading-7 text-[#648c85]">
              ไม่ว่าจะเป็นงานรับจ้างอิสระ ร้านค้า หรือโปรเจกต์ส่วนตัว ไมโลช่วยสร้างใบแจ้งหนี้ คำนวณหัก ณ ที่จ่าย 3% (WHT) และภาษี 7% (VAT) พร้อมสรุปกำไรขาดทุนให้เสร็จสรรพ
            </p>
            <div className="mt-7 space-y-3.5">
              <div className="flex items-start gap-3 rounded-2xl border border-[#dceee8] bg-white p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e3f4ee] text-[#1c8a6f]">
                  <Check className="size-4 stroke-[3]" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#28574f]">คำนวณภาษี WHT 3% & VAT 7% อัตโนมัติ</p>
                  <p className="text-xs text-[#759891] mt-0.5">ระบุยอดสุทธิหรือยอดก่อนภาษี ไมโลคำนวณฐานภาษีและยอดจ่ายจริงให้ทันที</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-[#dceee8] bg-white p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e3f4ee] text-[#1c8a6f]">
                  <Check className="size-4 stroke-[3]" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#28574f]">ติดตามลูกหนี้และยอดค้างชำระ (AR / AP)</p>
                  <p className="text-xs text-[#759891] mt-0.5">เตือนก่อนถึงกำหนดชำระเงิน และแยกหมวดหมู่ลูกค้าอย่างเป็นระบบ</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2.4rem] border border-[#d2ebe4] bg-white p-7 paper-shadow space-y-4">
            <div className="flex items-center justify-between border-b border-[#e9f4f0] pb-4">
              <div>
                <p className="text-xs text-[#7b9c95]">ตัวอย่างใบแจ้งหนี้จากไมโล</p>
                <h4 className="font-display text-lg font-bold text-[#23534a]">งานออกแบบ UX/UI Application</h4>
              </div>
              <span className="rounded-full bg-[#ddf7ec] px-3 py-1 text-xs font-semibold text-[#188569]">
                รอรับเงิน
              </span>
            </div>
            <div className="space-y-2 text-xs text-[#5e837d]">
              <div className="flex justify-between py-1 border-b border-[#f3f9f6]">
                <span>ค่าบริการ (Subtotal)</span>
                <span className="font-semibold text-[#27534b]">฿45,000.00</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#f3f9f6]">
                <span>ภาษีมูลค่าเพิ่ม 7% (VAT)</span>
                <span className="font-semibold text-[#27534b]">+฿3,150.00</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#f3f9f6]">
                <span>หัก ณ ที่จ่าย 3% (WHT)</span>
                <span className="font-semibold text-[#c55a4c]">-฿1,350.00</span>
              </div>
              <div className="flex justify-between pt-2 text-sm font-bold text-[#1a856a]">
                <span>ยอดชำระสุทธิ (Net Total)</span>
                <span className="text-lg">฿46,800.00</span>
              </div>
            </div>
            <div className="rounded-xl bg-[#f2faf7] p-3 text-center text-[11px] text-[#2f7566] font-medium">
              💡 ไมโลสร้างใบเสนอราคาและสรุปเป็น Flex Message ส่งต่อให้ลูกค้าในแชท LINE ได้ทันที
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="border-t border-[#dcefe9] bg-[#f5fcfa] py-20">
          <div className="mx-auto grid max-w-5xl gap-10 px-5 lg:grid-cols-[.75fr_1.25fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold text-[#1e9a7d]">คำถามที่พบบ่อย</p>
              <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-[#245851]">
                สงสัยเรื่องไมโล<br />เราตอบไว้ให้แล้ว
              </h2>
              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#cde8e0] bg-white p-4 text-sm text-[#638881]">
                <HeartHandshake className="size-5 shrink-0 text-[#e391a7]" />
                ไมโลช่วยดูแลทุกวันให้เบาสบายขึ้น
              </div>
            </div>
            <Accordion type="single" collapsible className="rounded-3xl border border-[#d5ece6] bg-white px-5 paper-shadow">
              {faq.map(([question, answer], index) => (
                <AccordionItem key={question} value={`item-${index}`} className="border-[#e1f0ec]">
                  <AccordionTrigger className="py-5 text-left font-display text-base font-medium text-[#2b5d56] hover:no-underline">
                    {question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-7 text-[#708f89]">
                    {answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* CTA Bottom Banner */}
        <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
          <div className="relative overflow-hidden rounded-[2.4rem] bg-[#226e61] px-7 py-14 text-center text-white shadow-2xl">
            <div className="absolute inset-0 opacity-20 mint-grid" />
            <div className="relative">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/15 shadow-inner">
                <Sparkles className="size-7 text-[#a5f3df]" />
              </span>
              <h2 className="font-display mt-5 text-4xl font-bold sm:text-5xl">
                เริ่มใช้งานไมโลวันนี้
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-[#d2f6ee] leading-relaxed">
                เข้าแดชบอร์ดหลังบ้าน เชื่อมบัญชี LINE ของคุณ แล้วเริ่มบริหารการเงินอย่างอัจฉริยะได้ทันที
              </p>
              <Link href="/dashboard">
                <Button size="lg" className="mt-8 rounded-full bg-white px-9 py-6 text-base font-bold text-[#16725f] hover:bg-[#dcf7ef] shadow-lg">
                  เข้าสู่ระบบหลังบ้าน (Dashboard) <ArrowRight className="ml-2 size-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#dcefe9] px-5 py-8 text-center text-sm text-[#7b9c96]">
        ไมโล — ผู้ช่วยส่วนตัวและระบบบริหารการเงินอัจฉริยะใน LINE
      </footer>
    </div>
  );
}

