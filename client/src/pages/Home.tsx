import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { MiloMascot } from "@/components/MiloMascot";
import {
  ArrowRight, BarChart3, BellRing, BriefcaseBusiness, Check, CheckCircle2, FileText,
  Globe2, LockKeyhole, MessageCircle, MousePointer2, ReceiptText, Search, ShieldCheck,
  Sparkles, UsersRound, WalletCards, Zap,
} from "lucide-react";
import { Link } from "wouter";

const lineUrl = "https://line.me/R/ti/p/%40684bxtsi";

const featureCards = [
  { icon: WalletCards, title: "จัดการออเดอร์", detail: "รับออเดอร์ ตรวจสอบสถานะ ได้แบบเรียลไทม์" },
  { icon: UsersRound, title: "ดูแลลูกค้า", detail: "เก็บข้อมูลลูกค้า สร้างความสัมพันธ์ และเพิ่มยอดขาย" },
  { icon: BarChart3, title: "วิเคราะห์ยอดขาย", detail: "รายงานสถิติ ช่วยให้คุณวางแผนธุรกิจได้ดีขึ้น" },
  { icon: BellRing, title: "แจ้งเตือนอัตโนมัติ", detail: "ไม่พลาดทุกการสั่งซื้อ และข้อมูลสำคัญ" },
  { icon: ShieldCheck, title: "ปลอดภัย มั่นคง", detail: "มาตรฐานความปลอดภัยระดับองค์กร รองรับการใช้งานจริง" },
];

const capabilities = [
  [MessageCircle, "ตอบคำถามอัจฉริยะ", "ตอบได้ทั้งข้อมูลทั่วไป และเรื่องเฉพาะทาง", "bg-emerald-50 text-emerald-600"],
  [Sparkles, "ช่วยคิด ช่วยวางแผน", "ไอเดีย คำแนะนำ และแนวทางที่ใช้ได้จริง", "bg-sky-50 text-sky-600"],
  [FileText, "ทำงานได้หลากหลาย", "สรุปข้อมูล แปลภาษา และจัดการงานต่างๆ", "bg-violet-50 text-violet-600"],
  [BellRing, "พร้อมดูแล 24 ชั่วโมง", "ไม่ว่าเรื่องไหน ก็มีไมโลอยู่ข้างๆ เสมอ", "bg-orange-50 text-orange-500"],
];

const useCases = [
  [Search, "ค้นหาข้อมูล", "วันนี้มีข่าวอะไรบ้าง?", "bg-sky-50 text-sky-600"],
  [ReceiptText, "ช่วยสรุป", "สรุปข่าววันนี้ให้หน่อย", "bg-rose-50 text-rose-500"],
  [Sparkles, "แนะนำไอเดีย", "ไอเดียทำคอนเทนต์หน่อย", "bg-emerald-50 text-emerald-600"],
  [FileText, "ช่วยวางแผน", "วางแผนการเดินทางให้หน่อย", "bg-emerald-50 text-emerald-600"],
  [Globe2, "แปลภาษา", "แปลภาษาอังกฤษให้หน่อย", "bg-sky-50 text-sky-600"],
  [UsersRound, "และอีกมากมาย", "ถามได้เลย... ไมโลอยู่เสมอ", "bg-amber-50 text-amber-500"],
];

const faq = [
  ["ไมโลคืออะไร?", "ไมโลคือผู้ช่วยอัจฉริยะบน LINE ที่พร้อมช่วยตอบคำถาม สรุปข้อมูล วางแผน และช่วยจัดการงานต่างๆ ในแชทเดียว"],
  ["เริ่มใช้งานไมโลอย่างไร?", "กดปุ่มเชิญใช้งานหรือสแกน QR Code เพื่อเพิ่มเพื่อน Milo บน LINE แล้วเริ่มแชทได้ทันที ไม่ต้องติดตั้งแอปเพิ่ม"],
  ["ไมโลใช้งานได้ตลอดเวลาหรือไม่?", "ใช้งานได้ตลอด 24 ชั่วโมงตามความพร้อมของระบบ และสามารถคุยกับไมโลได้เหมือนคุยกับผู้ช่วยส่วนตัว"],
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
            <a href="#news" className="transition hover:text-[#07996a]">ข่าวสาร</a>
            <a href="#features" className="transition hover:text-[#07996a]">สินค้า/บริการ</a>
            <a href="#business" className="transition hover:text-[#07996a]">เอกสาร</a>
            <a href="#faq" className="transition hover:text-[#07996a]">คำถามที่พบบ่อย</a>
            <a href="#about" className="transition hover:text-[#07996a]">เกี่ยวกับเรา</a>
          </nav>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 text-sm font-semibold text-[#315d56] lg:flex"><Globe2 className="size-4" /> TH⌄</div>
            <LineButton />
            <Link href="/dashboard" className="hidden items-center gap-2 border-l border-[#e3eeea] pl-4 text-xs font-semibold text-[#35635b] lg:flex"><LockKeyhole className="size-4" /><span>สำหรับผู้ดูแลระบบ<br /><span className="font-normal text-[10px]">(Admin เท่านั้น)</span></span></Link>
          </div>
        </div>
      </header>

      <main id="home">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#f2fffa] via-white to-[#effbf7]">
          <div className="absolute -left-24 top-20 size-[420px] rounded-full bg-[#c6f4e3]/60 blur-3xl" />
          <div className="absolute right-0 top-0 size-[520px] rounded-full bg-[#e5faf3] blur-3xl" />
          <div className="relative mx-auto grid min-h-[390px] max-w-[1500px] items-center gap-6 px-5 py-8 lg:grid-cols-[.9fr_1.1fr_.8fr] lg:px-12 lg:py-5">
            <div className="relative z-10 py-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d8eee7] bg-white px-4 py-2 text-xs font-bold text-[#247f6b] shadow-sm"><span className="grid size-5 place-items-center rounded-full bg-[#0bb575] text-[8px] text-white">LINE</span> LINE Official Account</span>
              <h1 className="font-display mt-5 text-6xl font-black leading-[.95] tracking-tight text-[#075b4b] sm:text-7xl">Milo<span className="text-[#08b475]">✣</span><br /><span className="text-[#10ae78]">LINE Assistant</span></h1>
              <h2 className="font-display mt-3 text-2xl font-black text-[#075b4b] sm:text-3xl">ผู้ช่วยอัจฉริยะสำหรับธุรกิจของคุณ</h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-[#3d6c64]">ช่วยบริหารจัดการร้านค้า และดูแลลูกค้าของคุณได้ง่ายขึ้น ผ่าน LINE อย่างชาญฉลาด</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["แจ้งเตือนอัตโนมัติ", "จัดการออเดอร์", "ดูแลลูกค้า", "วิเคราะห์ยอดขาย"].map((x, i) => <span key={x} className="inline-flex items-center gap-1.5 rounded-full border border-[#d9eee7] bg-white px-3 py-2 text-xs font-semibold text-[#387168] shadow-sm"><span className="text-[#0aae76]">{["♧", "▣", "●", "▥"][i]}</span>{x}</span>)}
              </div>
            </div>

            <div className="relative flex min-h-[370px] items-end justify-center lg:min-h-[390px]">
              <div className="absolute left-[3%] top-5 hidden w-[235px] rotate-[-7deg] rounded-[30px] border-[8px] border-[#163d37] bg-white p-2 shadow-2xl sm:block">
                <div className="rounded-[20px] bg-[#f4faf8] p-3"><div className="mb-3 flex items-center gap-2 text-xs font-bold"><span className="size-5 rounded-full bg-[#12b77c]" /> Milo</div><div className="rounded-2xl bg-white p-3 text-[11px] leading-5 shadow-sm">สวัสดีครับ!<br />Milo พร้อมดูแลคุณ<br />จัดการร้านค้าได้แล้ว<br />วันนี้มีอะไรให้ช่วยบ้าง?</div><div className="mt-2 w-fit rounded-full bg-[#12b77c] px-3 py-1 text-[10px] font-bold text-white">เริ่มใช้งานเลย! ♥</div></div>
              </div>
              <div className="relative z-10 -mb-4 drop-shadow-2xl"><MiloMascot size="lg" /></div>
              <div className="absolute right-[1%] top-7 rounded-[28px] bg-[#0b9e70] px-7 py-4 text-center text-lg font-black leading-tight text-white shadow-xl">จัดการร้าน<br />ได้ทุกที่ ทุกเวลา<br /><span className="text-2xl">กับ Milo ✣</span></div>
            </div>

            <div className="relative z-20 rounded-[24px] border border-[#dceee8] bg-white/95 p-6 shadow-xl shadow-[#2b9c7e]/10 backdrop-blur">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#e1f8ed] text-[#08a971]"><Check className="size-6" /></span><div><h3 className="font-display text-xl font-black text-[#11604f]">ระบบพร้อมใช้งาน</h3><p className="text-xs text-[#6a8e87]">Milo พร้อมดูแลธุรกิจของคุณแล้ว</p></div></div>
              <a href={lineUrl} target="_blank" rel="noreferrer" className="mt-5 block"><Button className="h-14 w-full rounded-full bg-[#10b779] text-lg font-black text-white shadow-lg hover:bg-[#0a9f6a]">เชิญใช้งาน <ArrowRight className="ml-auto size-5" /></Button></a>
              <div className="mt-4 divide-y divide-[#e9f3f0]">
                {[["ใช้งานได้ทันที", "ไม่ต้องติดตั้ง พร้อมใช้งานผ่าน LINE"], ["ปลอดภัย มั่นคง", "ข้อมูลของคุณถูกเก็บเป็นความลับ"], ["รองรับทุกธุรกิจ", "ร้านค้าในทุกขนาด ใช้งานได้จริง"]].map(([a,b]) => <div key={a} className="flex gap-3 py-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#0da974]" /><div><p className="text-sm font-bold text-[#24564e]">{a}</p><p className="text-[11px] text-[#71928c]">{b}</p></div></div>)}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-[1500px] px-5 py-5 lg:px-10">
          <div className="mb-4 flex items-end justify-between"><div><h2 className="font-display text-2xl font-black text-[#0c5c4d]">✦ ฟีเจอร์เด่นของ Milo</h2><p className="mt-1 text-sm text-[#6a9189]">ครบ จบ ในที่เดียว เพื่อธุรกิจของคุณ</p></div><a href="#business" className="hidden text-sm font-bold text-[#078e68] sm:block">ดูรายละเอียดทั้งหมด →</a></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {featureCards.map(({ icon: Icon, title, detail }) => <article key={title} className="rounded-2xl border border-[#e1efeb] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><span className="grid size-11 place-items-center rounded-full bg-[#e6faf2] text-[#079c70]"><Icon className="size-6" /></span><h3 className="mt-4 font-display font-bold text-[#1d5a50]">{title}</h3><p className="mt-1 text-xs leading-5 text-[#72938d]">{detail}</p></article>)}
          </div>
        </section>

        <section className="mx-auto max-w-[1500px] px-5 py-5 lg:px-10">
          <div className="relative overflow-hidden rounded-[25px] border border-[#dceee8] bg-white shadow-sm"><div className="grid items-center gap-5 p-5 sm:grid-cols-[1fr_1.1fr]"><div><p className="font-display text-xl font-black leading-8 text-[#14594c]">“Milo เป็นผู้ช่วยของคุณ<br />ธุรกิจเล็กก็ไปได้ไกล”</p><p className="mt-3 text-xs font-semibold text-[#70938b]">Milo LINE Assistant</p></div><div className="flex justify-end"><MiloMascot size="md" /></div></div></div>
        </section>

        <section id="news" className="border-y border-[#e1f1ec] bg-[#fbfffd] py-10">
          <div className="mx-auto grid max-w-[1500px] items-center gap-10 px-5 lg:grid-cols-2 lg:px-10">
            <div className="flex min-h-[330px] items-end justify-center rounded-[28px] bg-gradient-to-br from-[#effcf7] to-[#e1f7ef] p-6"><MiloMascot size="lg" /></div>
            <div><span className="rounded-full bg-[#e7f8f2] px-3 py-1 text-xs font-bold text-[#0b9c70]">ตัวอย่างการใช้งาน</span><h2 className="font-display mt-4 text-4xl font-black leading-tight text-[#163f39] sm:text-5xl">ไมโลช่วยคุณได้ในทุกวัน</h2><p className="mt-2 text-base font-semibold text-[#0b9f72]">ไม่ว่าจะเรื่องเล็กหรือเรื่องใหญ่ ก็ถามไมโลได้เลย</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{useCases.map(([Icon,title,detail,tone]) => <div key={title} className="flex items-center gap-3 rounded-2xl border border-[#e4f0ed] bg-white p-3 shadow-sm"><span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone}`}><Icon className="size-5" /></span><div><p className="text-sm font-bold text-[#295a51]">{title}</p><p className="text-[10px] text-[#789690]">“{detail}”</p></div></div>)}</div><div className="mt-5 flex justify-end font-display text-sm font-bold text-[#244f48]">แล้วเจอกันนะครับ<br />– ไมโล 🐾</div></div>
          </div>
        </section>

        <section id="business" className="border-b border-[#e1f1ec] bg-[#effaf6] py-12">
          <div className="mx-auto max-w-[1500px] px-5 lg:px-10"><div className="mx-auto max-w-3xl text-center"><span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#15936f] shadow-sm"><BriefcaseBusiness className="size-4" /> สำหรับธุรกิจ & ฟรีแลนซ์</span><h2 className="font-display mt-4 text-3xl font-black text-[#165448]">จัดการงานธุรกิจให้เป็นเรื่องง่าย</h2><p className="mt-2 text-sm leading-6 text-[#668c84]">สรุปข้อมูล ออกเอกสาร วิเคราะห์ และช่วยวางแผนผ่าน LINE โดยไม่ต้องสลับหลายแอป</p></div><div className="mt-8 grid gap-5 md:grid-cols-3"><div className="rounded-3xl bg-white p-6 shadow-sm"><ReceiptText className="size-8 text-[#0ca974]" /><h3 className="mt-4 font-bold">เอกสารและใบแจ้งหนี้</h3><p className="mt-2 text-sm leading-6 text-[#718e89]">ช่วยร่างเอกสาร สรุปยอด และเตรียมข้อมูลให้พร้อมส่งต่อ</p></div><div className="rounded-3xl bg-white p-6 shadow-sm"><BarChart3 className="size-8 text-[#278ac0]" /><h3 className="mt-4 font-bold">วิเคราะห์และวางแผน</h3><p className="mt-2 text-sm leading-6 text-[#718e89]">เปลี่ยนข้อมูลที่ซับซ้อนให้เป็นคำแนะนำที่เข้าใจง่าย</p></div><div className="rounded-3xl bg-white p-6 shadow-sm"><Zap className="size-8 text-[#e28d29]" /><h3 className="mt-4 font-bold">ทำงานได้เร็วขึ้น</h3><p className="mt-2 text-sm leading-6 text-[#718e89]">ลดงานซ้ำๆ และมีผู้ช่วยพร้อมตอบอยู่ใน LINE</p></div></div></div>
        </section>

        <section id="faq" className="py-12"><div className="mx-auto grid max-w-5xl gap-8 px-5 lg:grid-cols-[.7fr_1.3fr] lg:px-10"><div><p className="text-sm font-bold text-[#0b9c70]">คำถามที่พบบ่อย</p><h2 className="font-display mt-2 text-3xl font-black text-[#184d43]">อยากรู้เรื่องไหน<br />ถามไมโลได้เลย</h2><div className="mt-5 rounded-2xl bg-[#effaf6] p-4 text-sm text-[#61877f]"><MousePointer2 className="mb-2 size-5 text-[#0ca974]" />กดคำถามเพื่อดูคำตอบ</div></div><Accordion type="single" collapsible className="rounded-3xl border border-[#dceee8] bg-white px-5 shadow-sm">{faq.map(([q,a],i) => <AccordionItem key={q} value={`q-${i}`}><AccordionTrigger className="text-left font-semibold text-[#2b5b52]">{q}</AccordionTrigger><AccordionContent className="text-sm leading-7 text-[#708d87]">{a}</AccordionContent></AccordionItem>)}</Accordion></div></section>

        <section id="invite" className="mx-auto max-w-[1500px] px-5 pb-8 lg:px-10"><div className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-[#08785f] via-[#078d6b] to-[#0a6f61] px-7 py-8 text-white shadow-xl sm:px-12"><div className="absolute -right-20 -top-24 size-80 rounded-full bg-[#5ee5bb]/20 blur-3xl" /><div className="relative grid items-center gap-7 lg:grid-cols-[1fr_auto_auto]"><div><p className="font-display text-3xl font-black">✨ เริ่มใช้งานไมโลวันนี้ ✨</p><p className="mt-2 max-w-2xl text-sm leading-6 text-[#d4fff1]">เข้าแชทบอทหลังบ้าน เชื่อมบัญชี LINE ของคุณ และเริ่มบริหารการเงินอย่างอัจฉริยะได้ทันที</p></div><LineButton label="เพิ่มเพื่อน Milo" light /><div className="rounded-2xl bg-white p-2 shadow-lg"><img src="/milo-line-qr.png" alt="QR Code สำหรับเพิ่มเพื่อน Milo บน LINE" className="size-28 rounded-lg object-contain sm:size-32" /></div></div></div></section>
      </main>

      <footer id="about" className="border-t border-[#dceee8] bg-[#101d28] px-5 py-7 text-white lg:px-10"><div className="mx-auto flex max-w-[1500px] flex-col items-center justify-between gap-4 md:flex-row"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center overflow-hidden rounded-xl bg-white/10"><MiloMascot size="sm" /></div><div><p className="font-display font-black">Milo <span className="text-xs font-normal text-white/70">LINE Assistant</span></p><p className="mt-1 text-[10px] text-white/45">© 2025 Milo LINE AI Assistant. All rights reserved.</p></div></div><div className="flex items-center gap-5 text-xs text-white/65"><span>🛡 ปลอดภัย</span><span>⚡ รวดเร็ว</span><span>💬 ใช้งานง่าย</span><span>◉ พร้อมดูแล 24/7</span></div><a href={lineUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#59e1b5]">@684bxtsi →</a></div></footer>
    </div>
  );
}
