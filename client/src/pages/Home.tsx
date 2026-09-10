import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { MiloMascot } from "@/components/MiloMascot";
import {
  ArrowRight, Briefcase, Calendar, CalendarDays, Check, CheckCircle2, Edit3, Flame,
  HeartHandshake, Repeat, ReceiptText, Share2, ShieldCheck, Sparkles, TrendingUp, UsersRound, X,
} from "lucide-react";
import { Link } from "wouter";

const advancedFeatures = [
  { icon: ReceiptText, tone: "bg-[#ddf7eb] text-[#168b6f]", badge: "AI OCR & Smart Parser", title: "สแกนสลิป & Statement อัตโนมัติ", detail: "ส่งรูปสลิปโอนเงิน หรืออัปโหลดไฟล์ PDF Statement (KBank, SCB, BBL, KTB) ไมโลแปลงเป็นตารางรายรับ-รายจ่ายลงแดชบอร์ดทันที แปลงปี พ.ศ. ให้เรียบร้อย" },
  { icon: Calendar, tone: "bg-[#e2f3fc] text-[#2181ab]", badge: "Custom Budget Cycle", title: "รอบงบประมาณตามวันเงินเดือนออก", detail: "ไม่จำเป็นต้องเริ่มวันที่ 1 คุณสามารถตั้งรอบงบตามวันเงินเดือนออกจริงได้ เช่น วันที่ 25 ถึงวันที่ 24 ของเดือนถัดไป ไมโลคำนวณงบและแจ้งเตือนให้ตรงวัน" },
  { icon: ShieldCheck, tone: "bg-[#fff1db] text-[#b06720]", badge: "Safe-to-Spend & Leak Detector", title: "เงินที่ใช้ได้ต่อวัน & ดักจับเงินรั่วไหล", detail: "คำนวณเงินที่ใช้ได้จริงต่อวันอย่างปลอดภัย (Safe-to-Spend) และมีระบบ AI ตรวจจับค่าใช้จ่ายจุกจิกที่บานปลาย พร้อมคำนวณเงินที่จะประหยัดได้ต่อปี" },
  { icon: TrendingUp, tone: "bg-[#f2e9ff] text-[#7d5bb2]", badge: "Cash Flow Forecasting", title: "พยากรณ์กระแสเงินสด 30 วันล่วงหน้า", detail: "คาดการณ์ยอดเงินในกระเป๋า 30 วันข้างหน้าจากพฤติกรรมใช้จ่ายจริงและบิลที่รอจ่าย แจ้งเตือนล่วงหน้าก่อนเงินขาดมือ (Deficit Risk Warning)" },
  { icon: UsersRound, tone: "bg-[#ddf7eb] text-[#168b6f]", badge: "Split Bill & Debt Netting", title: "หารบิล & ทวงหนี้เพื่อนในกลุ่ม LINE", detail: "ชวนไมโลเข้ากลุ่ม LINE พิมพ์หารบิลเท่ากันแบบปัดเศษสตางค์ไม่ตกหล่น หรือหารแบบแยกรายการพร้อม Service Charge 10% และ VAT 7% พร้อมสรุปยอดหนี้หักล้างกันอัตโนมัติ" },
  { icon: Briefcase, tone: "bg-[#e2f3fc] text-[#2181ab]", badge: "Freelance & Business", title: "ใบแจ้งหนี้ ภาษีหัก ณ ที่จ่าย 3% & VAT", detail: "เครื่องมือสำหรับฟรีแลนซ์และธุรกิจขนาดย่อม ออกใบแจ้งหนี้ (Invoice) พร้อมคำนวณ หัก ณ ที่จ่าย 3% (WHT) และ VAT 7% สรุปงบกำไร-ขาดทุน (P&L) และติดตามลูกหนี้/เจ้าหนี้" },
  { icon: Repeat, tone: "bg-[#fff1db] text-[#b06720]", badge: "Subscription Detector", title: "ตรวจจับค่าบริการรายเดือน & สมาชิก", detail: "ไมโลค้นหาและตรวจจับบิลที่ตัดเป็นประจำ เช่น Netflix, Spotify, ค่าเช่า, ค่ายิม สรุปเป็นปฏิทินวันตัดเงิน ไม่ให้คุณลืมยกเลิกบริการที่ไม่ได้ใช้" },
  { icon: CalendarDays, tone: "bg-[#f2e9ff] text-[#7d5bb2]", badge: "Automated Digest & Calendar", title: "สรุปการเงินประจำสัปดาห์ & ปฏิทิน", detail: "ส่งการ์ดสรุปการเงินรายสัปดาห์ (Finance Digest) เข้าแชท LINE อัตโนมัติ พร้อมปุ่มกด Export บันทึกนัดหมายลง Google Calendar หรือดาวน์โหลดไฟล์ .ics ทันที" },
];

const faq = [
  ["ไมโลต่างจากแอปจดบันทึกรายรับรายจ่ายทั่วไปอย่างไร?", "ไมโลทำงานใน LINE 100% คุณไม่ต้องโหลดแอปใหม่ แค่พิมพ์บอกเหมือนคุยกับเพื่อน ส่งรูปสลิป หรืออัปโหลดไฟล์ PDF Statement ธนาคาร ไมโลจะบันทึก แยกหมวด และคำนวณงบประมาณให้ทันทีแบบเรียลไทม์"],
  ["สามารถตั้งรอบงบประมาณตามวันเงินเดือนออก เช่น วันที่ 25 ได้ไหม?", "ทำได้ทันที ไมโลมีระบบ Custom Salary Budget Cycle ให้คุณกำหนดวันเริ่มรอบเงินเดือน เช่น วันที่ 25 โดยระบบจะคำนวณและตัดรอบงบประมาณทุกวันที่ 25 ของเดือนให้อัตโนมัติ"],
  ["ระบบหารบิลในกลุ่ม LINE คำนวณ Service Charge และ VAT อย่างไร?", "ไมโลคำนวณให้ทั้งแบบหารเท่ากันและแบบแยกรายการ โดยสามารถระบุ Service Charge 10% หรือ VAT 7% เพิ่มเติมได้ และมีระบบ Debt Netting สรุปยอดหนี้ว่าใครต้องจ่ายให้ใคร"],
  ["ฟรีแลนซ์สามารถใช้ไมโลช่วยคำนวณภาษีหัก ณ ที่จ่ายได้ไหม?", "ได้เลย ไมโลมีระบบ Invoice Generator สำหรับคำนวณยอดเงินก่อนภาษี, หัก ณ ที่จ่าย 3% (WHT), และบวกภาษีมูลค่าเพิ่ม 7% (VAT) พร้อมออกใบสรุปยอดให้ส่งต่อลูกค้าได้ทันที"],
  ["ข้อมูลการเงินมีความปลอดภัยแค่ไหน?", "ข้อมูลทั้งหมดถูกจัดเก็บบนฐานข้อมูลคลาวด์มาตรฐานความปลอดภัยสูง เชื่อมต่อด้วย SSL (TLS 1.2+) และเข้าถึงได้เฉพาะคุณผ่านบัญชี LINE ที่เชื่อมต่อไว้เท่านั้น"],
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f8fffd] text-[#245851]">
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="relative grid size-12 place-items-center overflow-visible">
              <MiloMascot size="sm" />
            </div>
            <span className="font-display text-xl font-bold text-[#173f39]">Milo <span className="text-xs font-semibold text-[#20a586]">LINE AI Assistant</span></span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-[#4a7a73] md:flex">
            <a href="#features" className="transition-colors hover:text-[#198f73]">ฟีเจอร์</a>
            <a href="#showcase" className="transition-colors hover:text-[#198f73]">ตัวอย่างการใช้งาน</a>
            <a href="#business" className="transition-colors hover:text-[#198f73]">ธุรกิจ & ฟรีแลนซ์</a>
            <a href="#faq" className="transition-colors hover:text-[#198f73]">คำถามที่พบบ่อย</a>
          </nav>
          <a href="#invite"><Button className="rounded-full bg-[#18ad7f] px-5 text-white shadow-md hover:bg-[#118e69]">เชิญใช้งาน <ArrowRight className="ml-1 size-4" /></Button></a>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-[#f3fffb] via-white to-[#eefaf6]">
          <div className="absolute -left-24 top-10 size-80 rounded-full bg-[#bff1dd]/50 blur-3xl" />
          <div className="absolute -right-20 top-0 size-96 rounded-full bg-[#d7f3ec]/70 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-12 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:pb-20 lg:pt-16">
            <div className="relative z-10">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#beeadd] bg-white/90 px-4 py-2 text-sm font-semibold text-[#287d6b] shadow-sm"><Sparkles className="size-4 text-[#20a586]" /> AI ผู้ช่วยอัจฉริยะบน LINE</div>
              <h1 className="font-display max-w-2xl text-5xl font-black leading-[1.08] tracking-tight text-[#102f2b] sm:text-6xl lg:text-7xl">สวัสดีครับ<br />ผม<span className="text-[#16a979]">ไมโล</span> 🐾</h1>
              <p className="mt-6 max-w-xl text-xl font-semibold leading-9 text-[#315f57]">พร้อมดูแลคุณ 24 ชั่วโมง<br />ตอบได้ทุกเรื่อง ที่คุณอยากรู้</p>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#648c85]">ผู้ช่วย AI ที่ทำงานใน LINE ของคุณ ตั้งแต่การเงิน งานเอกสาร การวางแผน ไปจนถึงเรื่องจุกจิกในทุกวัน</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#invite"><Button size="lg" className="rounded-full bg-[#18ad7f] px-8 text-base font-bold text-white shadow-lg shadow-[#18ad7f]/20 hover:bg-[#118e69]">เชิญใช้งาน <ArrowRight className="ml-2 size-5" /></Button></a>
                <a href="#showcase"><Button size="lg" variant="outline" className="rounded-full border-[#a9dccd] bg-white px-7 text-base text-[#357269] hover:bg-[#effbf7]">ดูตัวอย่างการใช้งาน</Button></a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-sm text-[#5d827c]">
                <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[#20a586]" /> ภาษาไทยธรรมชาติ</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[#20a586]" /> พร้อมใช้งาน 24 ชม.</span>
                <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-[#20a586]" /> ปลอดภัย</span>
              </div>
            </div>

            <div id="showcase" className="relative mx-auto min-h-[560px] w-full max-w-[560px]">
              <div className="absolute left-0 top-4 z-20 hidden sm:block"><MiloMascot size="lg" /></div>
              <div className="absolute right-0 top-20 z-10 w-full max-w-[350px] rounded-[2rem] border border-[#d0eee3] bg-white/95 p-5 shadow-2xl shadow-[#3aa889]/15 backdrop-blur">
                <div className="text-center"><p className="font-display text-2xl font-black text-[#174b40]">เชิญใช้งาน <span className="text-[#18a979]">Milo</span></p><p className="mt-1 text-lg font-bold text-[#174b40]">บน LINE ✨</p></div>
                <div className="mt-5 rounded-2xl bg-white p-3 shadow-inner"><img src="/milo-line-qr.png" alt="QR Code สำหรับเพิ่มเพื่อน Milo บน LINE" className="mx-auto aspect-square w-full max-w-[260px] rounded-xl object-contain" /></div>
                <a href="https://line.me/R/ti/p/%40684bxtsi" target="_blank" rel="noreferrer" className="mt-4 block"><Button size="lg" className="w-full rounded-full bg-[#18ad7f] text-white shadow-lg hover:bg-[#118e69]">เพิ่มเพื่อน Milo @684bxtsi <ArrowRight className="ml-2 size-4" /></Button></a>
                <p className="mt-3 text-center text-xs text-[#6d938b]">สแกน QR Code เพื่อเพิ่มเพื่อนและเริ่มใช้งานได้เลย!</p>
              </div>
              <div className="absolute bottom-0 left-0 right-0 z-30 rounded-[2rem] border border-white bg-white/90 p-4 shadow-xl backdrop-blur sm:left-24">
                <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#e2f8ed] text-2xl">🐾</span><div><p className="text-sm font-bold text-[#185447]">สวัสดีครับ ผมไมโล 👋</p><p className="text-xs text-[#6d918a]">ยินดีให้บริการครับ!</p></div><span className="ml-auto h-2.5 w-2.5 rounded-full bg-[#25c28c] shadow-[0_0_0_5px_#dcf8ed]" /></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto -mt-5 max-w-6xl px-5 lg:px-8">
          <div className="grid overflow-hidden rounded-[2rem] border border-[#dceee8] bg-white shadow-xl sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["💬", "ตอบคำถามอัจฉริยะ", "ตอบได้ทั้งข้อมูลทั่วไปและเรื่องเฉพาะทาง"],
              ["💡", "ช่วยคิด ช่วยวางแผน", "ไอเดีย คำแนะนำ และแนวทางที่ใช้ได้จริง"],
              ["📄", "ทำงานได้หลากหลาย", "สรุปข้อมูล แปลภาษา และจัดการงานต่างๆ"],
              ["⏰", "พร้อมดูแล 24 ชั่วโมง", "ไม่ว่าเรื่องไหน ก็มีไมโลอยู่ข้างๆ เสมอ"],
            ].map(([icon, title, detail]) => <div key={title} className="border-b border-[#e6f2ee] p-6 text-center last:border-0 sm:border-r lg:border-b-0 lg:last:border-r-0"><div className="mx-auto grid size-14 place-items-center rounded-full bg-[#e7f8f0] text-2xl">{icon}</div><h3 className="mt-4 font-display font-bold text-[#245851]">{title}</h3><p className="mt-1 text-xs leading-5 text-[#789a94]">{detail}</p></div>)}
          </div>
        </section>

        <section id="features" className="mint-grid mt-16 border-y border-[#d9f0e9] bg-[#effbf7] py-24">
          <div className="mx-auto max-w-6xl px-5 lg:px-8">
            <div className="mx-auto max-w-3xl text-center"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#daf5e9] px-4 py-1.5 text-xs font-bold text-[#168a6f]"><Sparkles className="size-3.5" /> ฟีเจอร์อัจฉริยะ</span><h2 className="font-display mt-4 text-4xl font-black leading-tight text-[#245851] sm:text-5xl">ไม่ได้มีแค่จดรายจ่าย<br />ไมโลเป็น <span className="text-[#1ea585]">ผู้ช่วยอัจฉริยะ</span> ใน LINE</h2><p className="mt-4 text-base text-[#618b83]">จัดการข้อมูล การเงิน งานเอกสาร และการวางแผนในแชทเดียว</p></div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{advancedFeatures.map((item) => <article key={item.title} className="rounded-[1.8rem] border border-[#dceee8] bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-[#aee3d3] hover:shadow-xl"><div className="flex items-center justify-between"><span className={`grid size-12 place-items-center rounded-2xl ${item.tone}`}><item.icon className="size-6" /></span><span className="rounded-md bg-[#f0faf6] px-2.5 py-0.5 text-[10px] font-semibold text-[#22856d]">{item.badge}</span></div><h3 className="font-display mt-5 text-lg font-bold leading-snug text-[#23554d]">{item.title}</h3><p className="mt-2.5 text-xs leading-5 text-[#6b8e88]">{item.detail}</p></article>)}</div>
          </div>
        </section>

        <section id="business" className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 lg:grid-cols-2 lg:px-8">
          <div><span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f7f2] px-3.5 py-1 text-xs font-bold text-[#1e9a7d]"><Briefcase className="size-3.5" /> ออกแบบมาเพื่อฟรีแลนซ์ & คนทำงาน</span><h2 className="font-display mt-4 text-4xl font-black leading-tight text-[#245851]">จัดการรายได้ ภาษี และใบแจ้งหนี้<br /><span className="text-[#1da484]">ไม่ต้องเปิด Excel ให้ปวดหัว</span></h2><p className="mt-5 text-base leading-7 text-[#648c85]">ไม่ว่าจะเป็นงานรับจ้างอิสระ ร้านค้า หรือโปรเจกต์ส่วนตัว ไมโลช่วยสร้างใบแจ้งหนี้ คำนวณหัก ณ ที่จ่าย 3% (WHT) และภาษี 7% (VAT) พร้อมสรุปกำไรขาดทุนให้เสร็จสรรพ</p><div className="mt-7 space-y-3.5"><div className="flex items-start gap-3 rounded-2xl border border-[#dceee8] bg-white p-4"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e3f4ee] text-[#1c8a6f]"><Check className="size-4 stroke-[3]" /></span><div><p className="text-sm font-semibold text-[#28574f]">คำนวณภาษี WHT 3% & VAT 7% อัตโนมัติ</p><p className="mt-0.5 text-xs text-[#759891]">ระบุยอดสุทธิหรือยอดก่อนภาษี ไมโลคำนวณฐานภาษีและยอดจ่ายจริงให้ทันที</p></div></div><div className="flex items-start gap-3 rounded-2xl border border-[#dceee8] bg-white p-4"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e3f4ee] text-[#1c8a6f]"><Check className="size-4 stroke-[3]" /></span><div><p className="text-sm font-semibold text-[#28574f]">ติดตามลูกหนี้และยอดค้างชำระ (AR / AP)</p><p className="mt-0.5 text-xs text-[#759891]">เตือนก่อนถึงกำหนดชำระเงิน และแยกหมวดหมู่ลูกค้าอย่างเป็นระบบ</p></div></div></div></div>
          <div className="rounded-[2.4rem] border border-[#d2ebe4] bg-white p-7 shadow-xl shadow-[#3aa889]/10"><div className="flex items-center justify-between border-b border-[#e9f4f0] pb-4"><div><p className="text-xs text-[#7b9c95]">ตัวอย่างใบแจ้งหนี้จากไมโล</p><h4 className="font-display text-lg font-bold text-[#23534a]">งานออกแบบ UX/UI Application</h4></div><span className="rounded-full bg-[#ddf7ec] px-3 py-1 text-xs font-semibold text-[#188569]">รอรับเงิน</span></div><div className="mt-4 space-y-2 text-xs text-[#5e837d]"><div className="flex justify-between border-b border-[#f3f9f6] py-1"><span>ค่าบริการ (Subtotal)</span><span className="font-semibold text-[#27534b]">฿45,000.00</span></div><div className="flex justify-between border-b border-[#f3f9f6] py-1"><span>VAT 7%</span><span className="font-semibold text-[#27534b]">+฿3,150.00</span></div><div className="flex justify-between border-b border-[#f3f9f6] py-1"><span>WHT 3%</span><span className="font-semibold text-[#c55a4c]">-฿1,350.00</span></div><div className="flex justify-between pt-2 text-sm font-bold text-[#1a856a]"><span>ยอดชำระสุทธิ</span><span className="text-lg">฿46,800.00</span></div></div><div className="mt-4 rounded-xl bg-[#f2faf7] p-3 text-center text-[11px] font-medium text-[#2f7566]">💡 ไมโลสร้างใบเสนอราคาและสรุปเป็น Flex Message ส่งต่อให้ลูกค้าในแชท LINE ได้ทันที</div></div>
        </section>

        <section id="faq" className="border-t border-[#dcefe9] bg-[#f5fcfa] py-20"><div className="mx-auto grid max-w-5xl gap-10 px-5 lg:grid-cols-[.75fr_1.25fr] lg:px-8"><div><p className="text-sm font-semibold text-[#1e9a7d]">คำถามที่พบบ่อย</p><h2 className="font-display mt-3 text-4xl font-black leading-tight text-[#245851]">สงสัยเรื่องไมโล<br />เราตอบไว้ให้แล้ว</h2><div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#cde8e0] bg-white p-4 text-sm text-[#638881]"><HeartHandshake className="size-5 shrink-0 text-[#e391a7]" />ไมโลช่วยดูแลทุกวันให้เบาสบายขึ้น</div></div><Accordion type="single" collapsible className="rounded-3xl border border-[#d5ece6] bg-white px-5 shadow-sm">{faq.map(([question, answer], index) => <AccordionItem key={question} value={`item-${index}`} className="border-[#e1f0ec]"><AccordionTrigger className="py-5 text-left font-display text-base font-medium text-[#2b5d56] hover:no-underline">{question}</AccordionTrigger><AccordionContent className="pb-5 text-sm leading-7 text-[#708f89]">{answer}</AccordionContent></AccordionItem>)}</Accordion></div></section>

        <section id="invite" className="mx-auto max-w-6xl px-5 py-16 lg:px-8"><div className="relative overflow-hidden rounded-[2.5rem] bg-[#0f7665] px-7 py-12 text-white shadow-2xl sm:px-12"><div className="absolute -right-20 -top-20 size-72 rounded-full bg-[#4fe0b0]/20 blur-3xl" /><div className="relative grid items-center gap-10 lg:grid-cols-[1fr_auto]"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#a5f3df]">Milo LINE Assistant</p><h2 className="font-display mt-3 text-4xl font-black sm:text-5xl">มาเป็นเพื่อนกันนะครับ 💚</h2><p className="mt-4 max-w-2xl text-base leading-7 text-[#d2f6ee] sm:text-lg">เพิ่มเพื่อน Milo บน LINE แล้วเริ่มใช้งานผู้ช่วยอัจฉริยะของคุณได้ทันที</p><a href="https://line.me/R/ti/p/%40684bxtsi" target="_blank" rel="noreferrer" className="mt-7 inline-block"><Button size="lg" className="rounded-full bg-white px-8 text-[#16725f] shadow-lg hover:bg-[#e5faf3]">เพิ่มเพื่อน Milo <ArrowRight className="ml-2 size-5" /></Button></a></div><div className="rounded-[1.8rem] bg-white p-4 shadow-xl"><img src="/milo-line-qr.png" alt="QR Code สำหรับเพิ่มเพื่อน Milo บน LINE" className="size-48 rounded-xl object-contain sm:size-56" /></div></div></div></section>
      </main>

      <footer className="border-t border-[#dcefe9] bg-[#101d28] px-5 py-10 text-white"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-full bg-white/10"><MiloMascot size="sm" /></div><div><p className="font-bold">Milo</p><p className="text-xs text-white/60">LINE AI Assistant</p></div></div><p className="text-xs text-white/50">ผู้ช่วยอัจฉริยะที่อยู่ข้างคุณทุกวัน 🐾</p><a href="#invite" className="text-sm font-semibold text-[#6de7c0] hover:text-white">เชิญใช้งาน →</a></div></footer>
    </div>
  );
}
