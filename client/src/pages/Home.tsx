import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { MiloMascot } from "@/components/MiloMascot";
import { MiloStandingHero } from "@/components/MiloStandingHero";
import {
  ArrowRight, BellRing, BriefcaseBusiness, CalendarClock, Check, CheckCircle2, FileText,
  Globe2, ListChecks, LockKeyhole, MousePointer2, ReceiptText, Search,
  Sparkles, UsersRound, WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Link } from "wouter";

const lineUrl = "https://line.me/R/ti/p/%40684bxtsi";

const featureCards = [
  { icon: Sparkles, title: "บอกครั้งเดียว จัดการหลายอย่าง", detail: "พิมพ์ประโยคเดียว แล้ว Milo แยกนัดหมาย เตือน บิล และงานให้พร้อมยืนยัน" },
  { icon: CalendarClock, title: "วันนี้มีอะไรบ้าง", detail: "ดูไทม์ไลน์วันนี้รวม Calendar, To-do, Reminder, บิลรอจ่าย และภาพรวมการเงิน" },
  { icon: ReceiptText, title: "บิลรอจ่ายไม่ปนกับค่าใช้จ่าย", detail: "Milo เก็บบิลไว้ก่อน และค่อยบันทึกเป็นค่าใช้จ่ายจริงเมื่อคุณสั่งจ่าย" },
  { icon: ListChecks, title: "Smart Follow-up", detail: "บอกงานที่อยากให้ตามต่อ แล้ว Milo สร้างงานและเตือนติดตามให้อัตโนมัติ" },
  { icon: BellRing, title: "Morning Brief · Evening Summary", detail: "สรุปส่วนตัวเข้า LINE เวลา 07:00 และ 20:00 ครอบคลุมงาน นัด เตือน บิล และการเงิน" },
  { icon: FileText, title: "คลังข้อความและไฟล์", detail: "เก็บข้อความ ลิงก์ รูป และไฟล์ไว้ค้นคืนในแชทเดิมได้ทุกเมื่อ" },
  { icon: UsersRound, title: "ผู้ช่วยประจำกลุ่ม LINE", detail: "เตือน ค้นไฟล์ ทำงานร่วมกัน และแท็กสมาชิกในกลุ่มด้วย @ไมโล" },
  { icon: WalletCards, title: "การเงินแบบสนทนา", detail: "จดรายรับรายจ่ายด้วยภาษาคน พร้อมหมวด งบ สรุป และการวิเคราะห์" },
];

const useCases: Array<[LucideIcon, string, string, string]> = [
  [Sparkles, "บันทึกชุดรายการ", "พรุ่งนี้ 14:00 ประชุมลูกค้า ค่าแท็กซี่ 300 ช่วยเตือนก่อนประชุม", "bg-violet-50 text-violet-600"],
  [CalendarClock, "วันนี้มีอะไร", "วันนี้มีอะไรบ้าง", "bg-sky-50 text-sky-600"],
  [BellRing, "Morning Brief", "สรุปเช้านี้ให้หน่อย", "bg-amber-50 text-amber-600"],
  [ListChecks, "Smart Follow-up", "ช่วยตามงานใบเสนอราคากับลูกค้าด้วย", "bg-emerald-50 text-emerald-600"],
  [ReceiptText, "บิลรอจ่าย", "ค่าแท็กซี่ 300 บาท รอจ่ายก่อน", "bg-orange-50 text-orange-500"],
  [WalletCards, "จดรายรับรายจ่าย", "กินกาแฟ 80 บาท", "bg-sky-50 text-sky-600"],
  [Search, "Quick Search", "ค้นหา ใบเสนอราคา", "bg-rose-50 text-rose-500"],
  [UsersRound, "ใช้ในกลุ่ม LINE", "@ไมโล แจ้งส่งงานด้วยถึง @สมชาย", "bg-amber-50 text-amber-500"],
];

const faq = [
  ["ไมโลคืออะไร?", "ไมโลคือผู้ช่วยส่วนตัวบน LINE ที่ช่วยจำ จัดการ และติดตามเรื่องต่าง ๆ ในแชทเดียว ทั้งนัดหมาย เตือน To-do บิลรอจ่าย การเงิน และสรุปประจำวัน"],
  ["บอกเรื่องเดียวแล้วให้ไมโลจัดการหลายอย่างได้ไหม?", "ได้ครับ เช่น บอกวันเวลา นัดหมาย ค่าใช้จ่าย และคำขอเตือนในประโยคเดียว Milo จะรวมเป็นรายการเดียวให้ตรวจสอบและยืนยันก่อนบันทึก"],
  ["บิลรอจ่ายต่างจากรายจ่ายอย่างไร?", "บิลรอจ่ายยังไม่ถูกนับเป็นค่าใช้จ่ายจริงจนกว่าคุณจะสั่งจ่ายบิล จึงช่วยแยกภาระที่ยังค้างจากเงินที่จ่ายแล้วได้"],
  ["Morning Brief และ Evening Summary ทำงานอย่างไร?", "Milo สามารถส่งสรุปส่วนตัวเข้า LINE ทุกวัน โดย Morning Brief เวลา 07:00 และ Evening Summary เวลา 20:00 รวมข้อมูลที่มีอยู่ในวันนั้น เช่น นัดหมาย งาน เตือน บิล และการเงิน"],
  ["Smart Follow-up คืออะไร?", "บอก Milo ว่างานไหนต้องตามต่อ เช่น ตามใบเสนอราคากับลูกค้า แล้ว Milo จะสร้างงานติดตามและตั้งเตือนให้โดยไม่ต้องจัดการหลายขั้นตอนเอง"],
  ["เริ่มใช้งานไมโลอย่างไร?", "กดปุ่มเชิญใช้งานหรือสแกน QR Code เพื่อเพิ่มเพื่อน Milo บน LINE แล้วเริ่มแชทได้ทันที ไม่ต้องติดตั้งแอปเพิ่ม"],
  ["ข้อมูลของฉันปลอดภัยไหม?", "ไมโลออกแบบโดยคำนึงถึงความเป็นส่วนตัวและความปลอดภัยของข้อมูล พร้อมการเชื่อมต่อผ่านมาตรฐาน HTTPS/TLS"],
];

function LineButton({ label = "เชิญใช้งาน", light = false }: { label?: string; light?: boolean }) {
  return (
    <a href={lineUrl} target="_blank" rel="noreferrer">
      <Button className={light ? "rounded-full bg-white px-7 font-bold text-[#087d60] shadow-lg hover:bg-[#effff9]" : "rounded-full bg-[#12b77c] px-7 font-bold text-white shadow-lg shadow-[#12b77c]/20 hover:bg-[#0b9d6b]"}>
        <span className="mr-2 grid size-7 place-items-center rounded-full bg-white/95 text-[10px] font-black text-[#10a875]">LINE</span>
        {label}<ArrowRight className="ml-2 size-4" />
      </Button>
    </a>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#123b35]">
      <header className="sticky top-0 z-50 border-b border-[#e8f1ee] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-5 lg:px-10">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <div className="grid size-11 place-items-center overflow-hidden rounded-xl bg-[#09b56f]/10"><MiloMascot size="sm" /></div>
            <div className="leading-none"><div className="font-display text-[25px] font-black tracking-tight text-[#0e3b35]">Milo</div><div className="mt-1 text-[11px] font-semibold text-[#11a876]">LINE AI Assistant</div></div>
          </Link>
          <nav className="hidden items-center gap-8 text-[14px] font-semibold text-[#355f58] xl:flex">
            <a href="#home" className="border-b-2 border-[#12b77c] py-6 text-[#07996a]">หน้าหลัก</a>
            <a href="#news" className="transition hover:text-[#07996a]">ความสามารถใหม่</a>
            <a href="#features" className="transition hover:text-[#07996a]">ฟีเจอร์ทั้งหมด</a>
            <a href="#business" className="transition hover:text-[#07996a]">การใช้งาน</a>
            <a href="#faq" className="transition hover:text-[#07996a]">คำถามที่พบบ่อย</a>
            <a href="#about" className="transition hover:text-[#07996a]">เกี่ยวกับเรา</a>
          </nav>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 text-sm font-semibold text-[#315d56] lg:flex"><Globe2 className="size-4" /> TH⌄</div>
            <LineButton />
            <Link href="/dashboard" className="hidden items-center gap-2 border-l border-[#e3eeea] pl-4 text-xs font-semibold text-[#35635b] lg:flex"><LockKeyhole className="size-4" /><span>สำหรับผู้ดูแลระบบ<br /><span className="font-normal text-[10px]">(Admin เท่านั้น)</span></span></Link>
          </div>
        </div>
        <Link href="/dashboard" className="flex h-10 items-center justify-center gap-2 border-t border-[#e8f1ee] bg-[#f5fcfa] px-4 text-sm font-semibold text-[#176f5f] lg:hidden">
          <LockKeyhole className="size-4" />ตั้งค่า / แดชบอร์ดผู้ดูแล
        </Link>
      </header>

      <main id="home">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#f2fffa] via-white to-[#effbf7]">
          <div className="absolute -left-24 top-20 size-[420px] rounded-full bg-[#c6f4e3]/60 blur-3xl" />
          <div className="absolute right-0 top-0 size-[520px] rounded-full bg-[#e5faf3] blur-3xl" />
          <div className="relative mx-auto grid min-h-[390px] max-w-[1500px] items-center gap-6 px-5 py-8 lg:grid-cols-[.8fr_1.4fr_.8fr] lg:px-12 lg:py-5">
            <div className="relative z-10 py-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d8eee7] bg-white px-4 py-2 text-xs font-bold text-[#247f6b] shadow-sm"><span className="grid size-5 place-items-center rounded-full bg-[#0bb575] text-[8px] text-white">LINE</span> LINE Official Account</span>
              <h1 className="font-display mt-5 text-6xl font-black leading-[.95] tracking-tight text-[#075b4b] sm:text-7xl">Milo<span className="text-[#08b475]">✣</span><br /><span className="text-[#10ae78]">LINE Assistant</span></h1>
              <h2 className="font-display mt-3 text-2xl font-black text-[#075b4b] sm:text-3xl">ผู้ช่วยส่วนตัวที่จบทุกอย่างใน LINE แชทเดียว</h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-[#3d6c64]">ผู้ช่วยส่วนตัวบน LINE ที่จำ จัดการ และติดตามเรื่องให้คุณ ตั้งแต่นัดหมาย เตือน To-do บิลรอจ่าย ไปจนถึงสรุปเช้า–เย็น</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["บันทึกหลายรายการในครั้งเดียว", "วันนี้มีอะไร", "Smart Follow-up", "Morning 07:00 · Evening 20:00"].map((x, i) => <span key={x} className="inline-flex items-center gap-1.5 rounded-full border border-[#d9eee7] bg-white px-3 py-2 text-xs font-semibold text-[#387168] shadow-sm"><span className="text-[#0aae76]">{["✦", "◷", "✓", "☀"][i]}</span>{x}</span>)}
              </div>
            </div>

            <div className="relative flex min-h-[410px] items-end justify-center overflow-visible lg:min-h-[420px]">
              <div className="absolute left-[3%] top-5 hidden w-[235px] rotate-[-7deg] rounded-[30px] border-[8px] border-[#163d37] bg-white p-2 shadow-2xl sm:block">
                <div className="rounded-[20px] bg-[#f4faf8] p-3"><div className="mb-3 flex items-center gap-2 text-xs font-bold"><span className="size-5 rounded-full bg-[#12b77c]" /> Milo</div><div className="rounded-2xl bg-white p-3 text-[11px] leading-5 shadow-sm">สวัสดีครับ!<br />Milo พร้อมดูแลคุณ<br />จัดการร้านค้าได้แล้ว<br />วันนี้มีอะไรให้ช่วยบ้าง?</div><div className="mt-2 w-fit rounded-full bg-[#12b77c] px-3 py-1 text-[10px] font-bold text-white">เริ่มใช้งานเลย! ♥</div></div>
              </div>
              <div className="relative z-10 -mb-1 h-[390px] w-[330px] translate-y-0 drop-shadow-2xl lg:-translate-x-4 lg:-translate-y-2"><MiloStandingHero className="h-full w-full" /></div>
              <div className="absolute right-[1%] top-7 z-0 rounded-[28px] bg-[#0b9e70] px-7 py-4 text-center text-lg font-black leading-tight text-white shadow-xl">ทุกอย่างจบ<br />ใน LINE แชทเดียว<br /><span className="text-2xl">กับ Milo ✣</span></div>
            </div>

            <div className="relative z-20 rounded-[24px] border border-[#dceee8] bg-white/95 p-6 shadow-xl shadow-[#2b9c7e]/10 backdrop-blur">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#e1f8ed] text-[#08a971]"><Check className="size-6" /></span><div><h3 className="font-display text-xl font-black text-[#11604f]">ระบบพร้อมใช้งาน</h3><p className="text-xs text-[#6a8e87]">Milo พร้อมช่วยจัดการชีวิต งาน และการเงินแล้ว</p></div></div>
              <a href={lineUrl} target="_blank" rel="noreferrer" className="mt-5 block"><Button className="h-14 w-full rounded-full bg-[#10b779] text-lg font-black text-white shadow-lg hover:bg-[#0a9f6a]">เชิญใช้งาน <ArrowRight className="ml-auto size-5" /></Button></a>
              <div className="mt-4 divide-y divide-[#e9f3f0]">
                {[['ใช้งานได้ทันที', 'ไม่ต้องติดตั้ง พร้อมใช้งานผ่าน LINE'], ['ปลอดภัย มั่นคง', 'ข้อมูลของคุณถูกเก็บเป็นความลับ'], ['รองรับทุกธุรกิจ', 'ร้านค้าในทุกขนาด ใช้งานได้จริง']].map(([a,b]) => <div key={a} className="flex gap-3 py-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#0da974]" /><div><p className="text-sm font-bold text-[#24564e]">{a}</p><p className="text-[11px] text-[#71928c]">{b}</p></div></div>)}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-[1500px] px-5 py-5 lg:px-10">
          <div className="mb-4 flex items-end justify-between"><div><h2 className="font-display text-2xl font-black text-[#0c5c4d]">✦ ฟีเจอร์เด่นของ Milo</h2><p className="mt-1 text-sm text-[#6a9189]">ครบ จบ ในที่เดียว เพื่อธุรกิจของคุณ</p></div><a href="#business" className="hidden text-sm font-bold text-[#078e68] sm:block">ดูรายละเอียดทั้งหมด →</a></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map(({ icon: Icon, title, detail }) => <article key={title} className="rounded-2xl border border-[#e1efeb] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><span className="grid size-11 place-items-center rounded-full bg-[#e6faf2] text-[#079c70]"><Icon className="size-6" /></span><h3 className="mt-4 font-display font-bold text-[#1d5a50]">{title}</h3><p className="mt-1 text-xs leading-5 text-[#72938d]">{detail}</p></article>)}
          </div>
        </section>

        <section id="assistant" className="mx-auto max-w-[1500px] px-5 py-6 lg:px-10">
          <div className="overflow-hidden rounded-[28px] border border-[#d8eee6] bg-[#f7fffb] shadow-sm">
            <div className="grid gap-6 p-6 lg:grid-cols-[1.05fr_.95fr] lg:p-8">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0a9b70] shadow-sm"><Sparkles className="size-4" /> Personal Assistant Layer</span>
                <h2 className="font-display mt-4 text-3xl font-black leading-tight text-[#14584b]">จาก “แชท” กลายเป็นผู้ช่วยที่จำและตามงานให้</h2>
                <p className="mt-3 text-sm leading-6 text-[#648a82]">Milo ไม่ได้แค่ตอบข้อความ แต่ช่วยเปลี่ยนข้อความเดียวให้เป็นรายการที่ทำต่อได้ พร้อมภาพรวมของวันนี้และสรุปประจำวัน</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    [CalendarClock, "Today Overview", "ไทม์ไลน์เดียวรวม นัดหมาย · เตือน · To-do · บิลรอจ่าย · การเงิน"],
                    [Sparkles, "Compound Capture", "ประโยคเดียวแยกเป็นหลายรายการ แล้วให้คุณตรวจสอบก่อนยืนยัน"],
                    [ListChecks, "Smart Follow-up", "สร้างงานติดตามพร้อมเตือนจากคำสั่งภาษาธรรมชาติ"],
                    [BellRing, "Daily Digest", "Morning Brief 07:00 และ Evening Summary 20:00 ส่งเข้า LINE ส่วนตัว"],
                  ].map(([Icon, title, detail]) => <div key={title as string} className="rounded-2xl border border-[#dceee8] bg-white p-4"><span className="grid size-9 place-items-center rounded-full bg-[#e7f9f1] text-[#0aa773]"><Icon className="size-4" /></span><p className="mt-3 text-sm font-bold text-[#2a5e54]">{title as string}</p><p className="mt-1 text-[11px] leading-5 text-[#76968f]">{detail as string}</p></div>)}
                </div>
              </div>
              <div className="rounded-3xl border border-[#dceee8] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-[#0b9d72]">ตัวอย่างการทำงาน</p><p className="font-display text-lg font-black text-[#1c5148]">หนึ่งข้อความ → หลายงานที่พร้อมทำต่อ</p></div><span className="rounded-full bg-[#e9faf3] px-3 py-1 text-[10px] font-bold text-[#0a9d72]">พร้อมยืนยัน</span></div>
                <div className="mt-5 rounded-2xl bg-[#f3faf7] p-4 text-xs leading-6 text-[#426d64]">“พรุ่งนี้ 14:00 ประชุมกับลูกค้า ค่าแท็กซี่ 300 บาท ช่วยเตือนก่อนประชุมด้วยนะ”</div>
                <div className="mt-4 space-y-2 text-xs">
                  {[[CalendarClock,"นัดหมาย","ประชุมกับลูกค้า · 14:00"],[ReceiptText,"บิลรอจ่าย","ค่าแท็กซี่ 300 บาท · ยังไม่เป็นรายจ่าย"],[BellRing,"เตือน","เตือนก่อนประชุม · 13:45"]].map(([Icon,title,detail]) => <div key={title as string} className="flex items-center gap-3 rounded-xl border border-[#e5f1ed] px-3 py-2.5"><span className="grid size-8 place-items-center rounded-full bg-[#effaf6] text-[#0ba876]"><Icon className="size-4" /></span><div><p className="font-bold text-[#3b675e]">{title as string}</p><p className="text-[10px] text-[#7b9993]">{detail as string}</p></div><Check className="ml-auto size-4 text-[#0aa773]" /></div>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1500px] px-5 py-5 lg:px-10">
          <div className="relative overflow-hidden rounded-[25px] border border-[#dceee8] bg-white shadow-sm"><div className="grid items-center gap-5 p-5 sm:grid-cols-[1fr_1.1fr]"><div><p className="font-display text-xl font-black leading-8 text-[#14594c]">“พิมพ์บอก Milo เหมือนบอกเพื่อน<br />แล้วจัดการต่อได้ในแชทเดียว”</p><p className="mt-3 text-xs font-semibold text-[#70938b]">Milo LINE Assistant</p></div><div className="flex justify-end"><MiloMascot size="md" /></div></div></div>
        </section>

        <section id="news" className="border-y border-[#e1f1ec] bg-[#fbfffd] py-10">
          <div className="mx-auto grid max-w-[1500px] items-center gap-10 px-5 lg:grid-cols-2 lg:px-10">
            <div className="flex min-h-[330px] items-end justify-center rounded-[28px] bg-gradient-to-br from-[#effcf7] to-[#e1f7ef] p-6"><MiloMascot size="lg" /></div>
            <div><span className="rounded-full bg-[#e7f8f2] px-3 py-1 text-xs font-bold text-[#0b9c70]">ความสามารถใหม่ที่ใช้ได้จริง</span><h2 className="font-display mt-4 text-4xl font-black leading-tight text-[#163f39] sm:text-5xl">ให้ Milo จำ จัดการ และตามต่อให้คุณ</h2><p className="mt-2 text-base font-semibold text-[#0b9f72]">พิมพ์ตามธรรมชาติ แล้วให้ระบบเปลี่ยนเป็นงานที่พร้อมทำต่อ</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{useCases.map(([Icon,title,detail,tone]) => <div key={title} className="flex items-center gap-3 rounded-2xl border border-[#e4f0ed] bg-white p-3 shadow-sm"><span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone}`}><Icon className="size-5" /></span><div><p className="text-sm font-bold text-[#295a51]">{title}</p><p className="text-[10px] text-[#789690]">“{detail}”</p></div></div>)}</div><div className="mt-5 flex justify-end font-display text-sm font-bold text-[#244f48]">แล้วเจอกันนะครับ<br />– ไมโล 🐾</div></div>
          </div>
        </section>

        <section id="business" className="border-b border-[#e1f1ec] bg-[#effaf6] py-12">
          <div className="mx-auto max-w-[1500px] px-5 lg:px-10"><div className="mx-auto max-w-3xl text-center"><span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#15936f] shadow-sm"><BriefcaseBusiness className="size-4" /> สำหรับธุรกิจ & ฟรีแลนซ์</span><h2 className="font-display mt-4 text-3xl font-black text-[#165448]">ชีวิต งาน และการเงิน — จัดการจาก LINE</h2><p className="mt-2 text-sm leading-6 text-[#668c84]">ตั้งแต่ข้อความเดียวที่สร้างหลายรายการ ไปจนถึงสรุปประจำวัน ทุกอย่างยังอยู่ใน LINE แชทเดียว</p></div><div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4"><div className="rounded-3xl bg-white p-6 shadow-sm"><CalendarClock className="size-8 text-[#0ca974]" /><h3 className="mt-4 font-bold">Today Overview</h3><p className="mt-2 text-sm leading-6 text-[#718e89]">รวมปฏิทิน To-do เตือน บิลรอจ่าย และภาพรวมการเงินไว้ในไทม์ไลน์เดียว</p></div><div className="rounded-3xl bg-white p-6 shadow-sm"><ListChecks className="size-8 text-[#278ac0]" /><h3 className="mt-4 font-bold">Smart Follow-up</h3><p className="mt-2 text-sm leading-6 text-[#718e89]">บอกงานที่ต้องตามต่อ แล้ว Milo ช่วยสร้างงานและเตือนติดตามให้</p></div><div className="rounded-3xl bg-white p-6 shadow-sm"><ReceiptText className="size-8 text-[#e28d29]" /><h3 className="mt-4 font-bold">Pending Bill</h3><p className="mt-2 text-sm leading-6 text-[#718e89]">แยกบิลที่ยังไม่จ่ายออกจากรายจ่ายจริง และบันทึกเมื่อชำระแล้ว</p></div><div className="rounded-3xl bg-white p-6 shadow-sm"><BellRing className="size-8 text-[#0ca974]" /><h3 className="mt-4 font-bold">Daily Digest</h3><p className="mt-2 text-sm leading-6 text-[#718e89]">Morning Brief 07:00 และ Evening Summary 20:00 ส่งเข้า LINE ส่วนตัว</p></div></div></div>
        </section>

        <section id="faq" className="py-12"><div className="mx-auto grid max-w-5xl gap-8 px-5 lg:grid-cols-[.7fr_1.3fr] lg:px-10"><div><p className="text-sm font-bold text-[#0b9c70]">คำถามที่พบบ่อย</p><h2 className="font-display mt-2 text-3xl font-black text-[#184d43]">อยากรู้เรื่องไหน<br />ถามไมโลได้เลย</h2><div className="mt-5 rounded-2xl bg-[#effaf6] p-4 text-sm text-[#61877f]"><MousePointer2 className="mb-2 size-5 text-[#0ca974]" />กดคำถามเพื่อดูคำตอบ</div></div><Accordion type="single" collapsible className="rounded-3xl border border-[#dceee8] bg-white px-5 shadow-sm">{faq.map(([q,a],i) => <AccordionItem key={q} value={`q-${i}`}><AccordionTrigger className="text-left font-semibold text-[#2b5b52]">{q}</AccordionTrigger><AccordionContent className="text-sm leading-7 text-[#708d87]">{a}</AccordionContent></AccordionItem>)}</Accordion></div></section>

        <section id="invite" className="mx-auto max-w-[1500px] px-5 pb-6 lg:px-10">
          <div className="relative isolate overflow-hidden rounded-[28px] border border-[#ccefe2] bg-gradient-to-r from-[#e9fff6] via-[#dffaf0] to-[#effff9] shadow-sm">
            <div className="absolute -left-16 -top-20 size-64 rounded-full bg-[#b5f1d9]/60 blur-3xl" />
            <div className="absolute -right-20 -bottom-28 size-80 rounded-full bg-[#b8f4dc]/50 blur-3xl" />
            <div className="relative grid min-h-[330px] items-center gap-6 px-5 py-5 sm:px-8 lg:grid-cols-[330px_1fr_auto_auto_240px] lg:px-10">
              <div className="relative hidden h-[330px] self-end lg:block">
                <div className="absolute bottom-0 left-0 h-[320px] w-[320px]"><MiloMascot size="lg" /></div>
              </div>
              <div className="min-w-0">
                <p className="font-display text-2xl font-black tracking-tight text-[#0d6554] sm:text-3xl">เริ่มใช้งานไมโลวันนี้ <span className="text-[#f2b632]">✦</span></p>
                <p className="mt-1 max-w-xl text-sm font-medium leading-6 text-[#4e8277]">เพิ่มเพื่อน Milo แล้วเริ่มพิมพ์สิ่งที่อยากให้ช่วยได้ทันที<br className="hidden sm:block" /> ทั้งแชทส่วนตัวและกลุ่ม LINE โดยไม่ต้องติดตั้งแอปเพิ่ม</p>
              </div>
              <div className="hidden h-16 w-px bg-[#c4e8dc] lg:block" />
              <LineButton label="เพิ่มเพื่อน Milo" light />
              <div className="flex items-center justify-center gap-4 lg:justify-end">
                <div className="rounded-2xl bg-white p-2.5 shadow-md ring-1 ring-[#d5eee5]"><img src="/milo-line-qr.png" alt="QR Code สำหรับเพิ่มเพื่อน Milo บน LINE" className="size-24 rounded-xl object-contain sm:size-28" /></div>
                <div className="hidden min-w-[115px] text-sm font-bold leading-6 text-[#287565] xl:block">สแกน QR Code<br /><span className="font-normal text-[#67958b]">เพื่อเพิ่มเพื่อนเลยครับ</span><span className="block text-xl">↗</span></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer id="about" className="border-t border-[#e2f0ec] bg-white px-5 py-5 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center overflow-hidden rounded-xl bg-[#e8faf3]"><MiloMascot size="sm" /></div>
            <div className="leading-tight"><p className="font-display text-base font-black text-[#0d5f50]">Milo <span className="font-normal text-[#4f8a7e]">LINE Assistant</span></p><p className="mt-1 text-[10px] text-[#8aa9a2]">© 2025 Milo LINE AI Assistant. All rights reserved.</p></div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-[#5d8a82]">
            <span>🛡 ปลอดภัย</span><span>✦ รวดเร็ว</span><span>💬 ใช้งานง่าย</span><span>◉ พร้อมดูแล 24/7</span>
          </div>
          <a href={lineUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 text-xs font-bold text-[#118c69]">LINE <span className="text-[#5f8f86]">@684bxtsi</span> <ArrowRight className="size-4" /></a>
        </div>
      </footer>
    </div>
  );
}
