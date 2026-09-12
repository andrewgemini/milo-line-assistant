import { suggestStandardCategory } from "./financeCategories";

export type ReminderDraft = {
  title: string; recurrenceType: "once" | "minute" | "day" | "week" | "month"; recurrenceInterval: number;
  recurrenceWeekdays?: string; recurrenceDayOfMonth?: number; dueAt: Date; nextRunAt: Date;
};

export type MiloCommand =
  | { type: "reminder"; data: ReminderDraft }
  | { type: "expense" | "income"; amount: number; category: string; note: string }
  | { type: "note"; title: string; content: string }
  | { type: "todo"; title: string }
  | { type: "vault"; title: string; content: string; itemType: "text" | "link"; tagsText?: string; sourceUrl?: string }
  | { type: "search"; query: string }
  | { type: "mention"; message: string; memberName: string }
  | { type: "budget"; category: string; amount: number }
  | { type: "budgetCycleStart"; day: number }
  | { type: "openingBalance"; amount: number }
  | { type: "exportFinance"; format: "csv" | "xlsx" }
  | { type: "recurringCreate"; transactionType: "income" | "expense"; amount: number; category: string; note: string; recurrenceType: "day" | "week" | "month"; recurrenceInterval: number; recurrenceWeekday?: number; recurrenceDayOfMonth?: number; nextRunAt: Date }
  | { type: "recurringList" }
  | { type: "recurringStatus"; id: number; status: "active" | "paused" | "cancelled" }
  | { type: "imageConfirm"; dateText?: string }
  | { type: "imageEdit"; field: "amount"; value: number }
  | { type: "imageEdit"; field: "category" | "date" | "merchant" | "note"; value: string }
  | { type: "pdfConfirm" }
  | { type: "invalid"; message: string }
  | { type: "categoryAdd"; name: string; transactionType: "income" | "expense" }
  | { type: "categoryRemove"; name: string; transactionType: "income" | "expense" }
  | { type: "categoryList"; transactionType?: "income" | "expense" }
  | { type: "transactionSearch"; query: string }
  | { type: "transactionDelete"; id: number }
  | { type: "transactionUpdate"; id: number; amount: number }
  | { type: "financeReport"; period: "day" | "week" | "month" | "year" }
  | { type: "voiceConfirm" }
  | { type: "voiceEditPrompt" }
  | { type: "voiceEdit"; transcript: string }
  | { type: "voiceCategoryChange"; category: string }
  | { type: "aiSummary"; period: "day" | "week" | "month" | "year" }
  | { type: "recordGuide" }
  | { type: "budgetOverview" }
  | { type: "transactionList" }
  | { type: "settingGuide" }
  | { type: "dashboardGuide" }
  | { type: "greeting" }
  | { type: "help" | "unknown" };

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
function titleWithoutSchedule(text: string) { return text.replace(/(?:ทุก\s*\d+\s*นาที|ทุกวัน|ทุกสัปดาห์(?:วัน)?(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?|ทุกเดือน(?:วันที่)?\s*\d+|พรุ่งนี้|วันนี้|วันที่\s*\d+\/\d+(?:\/\d+)?|\d{4}-\d{1,2}-\d{1,2}|(?:เวลา\s*)?\d{1,2}(?::|\.)?\d{0,2}\s*น?\.?)/gi, "").replace(/\s+/g, " ").trim() || "รายการเตือน"; }
function clock(text: string) { const match = text.match(/เวลา\s*(\d{1,2})(?:(?::|\.)(\d{2}))?/) ?? text.match(/(?:^|\s)(\d{1,2})(?::|\.)(\d{2})(?:\s|น|$)/); return { hour: Math.min(Math.max(Number(match?.[1] ?? 9), 0), 23), minute: Math.min(Math.max(Number(match?.[2] ?? 0), 0), 59) }; }
function bangkokParts(date: Date) { const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS); return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), weekday: shifted.getUTCDay() }; }
function atBangkok(year: number, month: number, day: number, hour: number, minute: number) { return new Date(Date.UTC(year, month - 1, day, hour - 7, minute)); }
function addBangkokDays(parts: ReturnType<typeof bangkokParts>, days: number) { const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days)); return { year: calendar.getUTCFullYear(), month: calendar.getUTCMonth() + 1, day: calendar.getUTCDate() }; }
function recurringFrom(value: string, now: Date): Extract<MiloCommand, { type: "recurringCreate" }> | undefined {
  const prefix = value.match(/^(?:ตั้ง)?(?:จดอัตโนมัติ|จดประจำ|รายการประจำ)\s+(.+)$/i);
  if (!prefix) return undefined;
  const body = prefix[1].trim();
  const scheduleMatch = body.match(/\s+(ทุกวัน|ทุกสัปดาห์(?:วัน)?(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?|ทุกเดือน(?:วันที่)?\s*\d{1,2})(?:\s+(?:เวลา\s*)?(\d{1,2})(?::|\.)(\d{2}))?\s*$/i);
  if (!scheduleMatch || scheduleMatch.index === undefined) return undefined;
  const transactionText = body.slice(0, scheduleMatch.index).trim();
  const amountMatch = transactionText.match(/^(?:(รายรับ|รับ|รายจ่าย|จ่าย)\s*)?(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i);
  if (!amountMatch) return undefined;
  const transactionType: "income" | "expense" = /รายรับ|รับ/i.test(amountMatch[1] ?? "") ? "income" : "expense";
  const note = amountMatch[2].trim().replace(/^ค่า(?=กาแฟ)/i, "");
  const amount = Number(amountMatch[3].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || !note) return undefined;
  const schedule = scheduleMatch[1];
  const hour = Math.min(Math.max(Number(scheduleMatch[2] ?? 9), 0), 23);
  const minute = Math.min(Math.max(Number(scheduleMatch[3] ?? 0), 0), 59);
  const parts = bangkokParts(now);
  if (/ทุกวัน/i.test(schedule)) {
    let nextRunAt = atBangkok(parts.year, parts.month, parts.day, hour, minute);
    if (nextRunAt <= now) { const next = addBangkokDays(parts, 1); nextRunAt = atBangkok(next.year, next.month, next.day, hour, minute); }
    return { type: "recurringCreate", transactionType, amount, category: suggestStandardCategory(transactionType, note), note, recurrenceType: "day", recurrenceInterval: 1, nextRunAt };
  }
  const weekly = schedule.match(/ทุกสัปดาห์(?:วัน)?(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?/i);
  if (weekly) {
    const map: Record<string, number> = { "อาทิตย์": 0, "จันทร์": 1, "อังคาร": 2, "พุธ": 3, "พฤหัส": 4, "ศุกร์": 5, "เสาร์": 6 };
    const recurrenceWeekday = map[weekly[1] ?? "จันทร์"];
    let days = (recurrenceWeekday - parts.weekday + 7) % 7;
    let date = addBangkokDays(parts, days);
    let nextRunAt = atBangkok(date.year, date.month, date.day, hour, minute);
    if (nextRunAt <= now) { days += 7; date = addBangkokDays(parts, days); nextRunAt = atBangkok(date.year, date.month, date.day, hour, minute); }
    return { type: "recurringCreate", transactionType, amount, category: suggestStandardCategory(transactionType, note), note, recurrenceType: "week", recurrenceInterval: 1, recurrenceWeekday, nextRunAt };
  }
  const monthly = schedule.match(/ทุกเดือน(?:วันที่)?\s*(\d{1,2})/i);
  if (monthly) {
    const recurrenceDayOfMonth = Math.min(Math.max(Number(monthly[1]), 1), 28);
    let nextRunAt = atBangkok(parts.year, parts.month, recurrenceDayOfMonth, hour, minute);
    if (nextRunAt <= now) nextRunAt = atBangkok(parts.year, parts.month + 1, recurrenceDayOfMonth, hour, minute);
    return { type: "recurringCreate", transactionType, amount, category: suggestStandardCategory(transactionType, note), note, recurrenceType: "month", recurrenceInterval: 1, recurrenceDayOfMonth, nextRunAt };
  }
  return undefined;
}

function reminderFrom(text: string, now: Date): ReminderDraft | undefined {
  if (!/^(?:@?ไมโล\s*)?(?:ตั้ง)?เตือน(?:ฉัน)?\s*/i.test(text.trim())) return undefined;
  const body = text.trim().replace(/^(?:@?ไมโล\s*)?(?:ตั้ง)?เตือน(?:ฉัน)?\s*/i, ""); const time = clock(body); const title = titleWithoutSchedule(body);
  const setTime = (date: Date) => { const parts = bangkokParts(date); return atBangkok(parts.year, parts.month, parts.day, time.hour, time.minute); };
  const minutes = body.match(/ทุก\s*(\d+)\s*นาที/i); if (minutes) { const interval = Math.max(1, Number(minutes[1])); const run = new Date(now.getTime() + interval * 60_000); return { title, recurrenceType: "minute", recurrenceInterval: interval, dueAt: run, nextRunAt: run }; }
  if (/ทุกวัน/i.test(body)) { let run = setTime(now); if (run <= now) { const next = addBangkokDays(bangkokParts(now), 1); run = atBangkok(next.year, next.month, next.day, time.hour, time.minute); } return { title, recurrenceType: "day", recurrenceInterval: 1, dueAt: run, nextRunAt: run }; }
  const weekly = body.match(/ทุกสัปดาห์(?:วัน)?(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?/i); if (weekly) { const map: Record<string, number> = { "อาทิตย์": 0, "จันทร์": 1, "อังคาร": 2, "พุธ": 3, "พฤหัส": 4, "ศุกร์": 5, "เสาร์": 6 }; const weekday = map[weekly[1] ?? "จันทร์"]; const parts = bangkokParts(now); const days = (weekday - parts.weekday + 7) % 7 || 7; const date = addBangkokDays(parts, days); const run = atBangkok(date.year, date.month, date.day, time.hour, time.minute); return { title, recurrenceType: "week", recurrenceInterval: 1, recurrenceWeekdays: String(weekday), dueAt: run, nextRunAt: run }; }
  const monthly = body.match(/ทุกเดือน(?:วันที่)?\s*(\d{1,2})?/i); if (monthly) { const parts = bangkokParts(now); const day = Math.min(Math.max(Number(monthly[1] ?? parts.day), 1), 28); let run = atBangkok(parts.year, parts.month, day, time.hour, time.minute); if (run <= now) run = atBangkok(parts.year, parts.month + 1, day, time.hour, time.minute); return { title, recurrenceType: "month", recurrenceInterval: 1, recurrenceDayOfMonth: day, dueAt: run, nextRunAt: run }; }
  const parts = bangkokParts(now); let run = atBangkok(parts.year, parts.month, parts.day, time.hour, time.minute); if (/พรุ่งนี้/i.test(body)) { const tomorrow = addBangkokDays(parts, 1); run = atBangkok(tomorrow.year, tomorrow.month, tomorrow.day, time.hour, time.minute); }
  const iso = body.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); const thai = body.match(/วันที่\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/); if (iso) run = atBangkok(Number(iso[1]), Number(iso[2]), Number(iso[3]), time.hour, time.minute); if (thai) { const rawYear = thai[3] ? Number(thai[3]) : parts.year; const year = rawYear > 2400 ? rawYear - 543 : rawYear; run = atBangkok(year, Number(thai[2]), Number(thai[1]), time.hour, time.minute); if (!thai[3] && run <= now) run = atBangkok(year + 1, Number(thai[2]), Number(thai[1]), time.hour, time.minute); }
  if (!/วันนี้|พรุ่งนี้|วันที่|\d{4}-/i.test(body) && run <= now) { const tomorrow = addBangkokDays(parts, 1); run = atBangkok(tomorrow.year, tomorrow.month, tomorrow.day, time.hour, time.minute); }
  return { title, recurrenceType: "once", recurrenceInterval: 1, dueAt: run, nextRunAt: run };
}

export function parseMiloCommand(text: string, now = new Date()): MiloCommand {
  const reminder = reminderFrom(text, now); if (reminder) return { type: "reminder", data: reminder };
  const value = text.trim().replace(/^@?ไมโล\s*/i, "");
  const recurring = recurringFrom(value, now); if (recurring) return recurring;
  if (/^(?:ดู)?(?:รายการประจำ|จดอัตโนมัติ)$/i.test(value)) return { type: "recurringList" };
  const recurringStatus = value.match(/^(เปิด|พัก|หยุด|ยกเลิก)(?:รายการประจำ|จดอัตโนมัติ)\s*#?(\d+)$/i);
  if (recurringStatus) return { type: "recurringStatus", id: Number(recurringStatus[2]), status: recurringStatus[1] === "เปิด" ? "active" : recurringStatus[1] === "ยกเลิก" ? "cancelled" : "paused" };
  const budgetStart = value.match(/^(?:ตั้ง)?วันเริ่ม(?:รอบ)?งบ(?:ประมาณ)?\s*(\d{1,2})$/i);
  if (budgetStart) { const day = Number(budgetStart[1]); return day >= 1 && day <= 28 ? { type: "budgetCycleStart", day } : { type: "invalid", message: "วันเริ่มรอบงบต้องอยู่ระหว่างวันที่ 1–28" }; }
  const exportMatch = value.match(/^(?:ส่งออก|export)(?:ข้อมูล|รายการ|ธุรกรรม)?\s*(excel|xlsx|csv)$/i);
  if (exportMatch) return { type: "exportFinance", format: /csv/i.test(exportMatch[1]) ? "csv" : "xlsx" };
  if (/^(?:ยืนยัน|บันทึกจาก)\s*pdf$/i.test(value)) return { type: "pdfConfirm" };
  if (value === "หน้าหลัก") return { type: "dashboardGuide" };
  if (value === "วิเคราะห์") return { type: "aiSummary", period: "month" };
  if (value === "จดบันทึก") return { type: "recordGuide" };
  if (value === "กระเป๋าเงิน") return { type: "budgetOverview" };
  if (value === "ตั้งค่า") return { type: "settingGuide" };
  const money = value.match(/^(จ่าย|รายจ่าย|รับ|รายรับ)\s*(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i); if (money) { const income = /รับ|รายรับ/i.test(money[1]); const rawNote = money[2].trim(); const note = income ? rawNote : rawNote.replace(/^ค่า(?=กาแฟ)/i, ""); const transactionType = income ? "income" : "expense"; return { type: transactionType, amount: Number(money[3].replace(/,/g, "")), category: suggestStandardCategory(transactionType, note), note }; }
  const naturalMoney = value.match(/^(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i);
  if (naturalMoney) {
    const note = naturalMoney[1].trim().replace(/^ค่า(?=กาแฟ)/i, "");
    const amount = Number(naturalMoney[2].replace(/,/g, ""));
    const incomeCue = /^(?:ได้เงิน|เงินเดือนเข้า|ขายของได้|ขายได้|รับเงิน|รายรับ|รายได้|โบนัส|ค่าจ้าง|เงินเดือน)/i.test(note);
    const expenseCue = /^(?:กิน|ซื้อ|จ่าย|ค่า|เติม|ช้อป|เดินทาง|แท็กซี่|กาแฟ|อาหาร|ข้าว|น้ำมัน|บิล|โอน|ของใช้|ชำระ)/i.test(note);
    if (Number.isFinite(amount) && amount > 0 && note && (incomeCue || expenseCue)) {
      const transactionType = incomeCue ? "income" : "expense";
      return { type: transactionType, amount, category: suggestStandardCategory(transactionType, note), note };
    }
  }
  const transactionSearch = value.match(/^(?:ค้นหา|หา)รายการ\s+(.+)$/i); if (transactionSearch) return { type: "transactionSearch", query: transactionSearch[1].trim() };
  const transactionDelete = value.match(/^ลบรายการ\s*#?(\d+)$/i); if (transactionDelete) return { type: "transactionDelete", id: Number(transactionDelete[1]) };
  const transactionUpdate = value.match(/^แก้รายการ\s*#?(\d+)\s*(?:เป็น|ยอด)\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i); if (transactionUpdate) return { type: "transactionUpdate", id: Number(transactionUpdate[1]), amount: Number(transactionUpdate[2].replace(/,/g, "")) };
  const openingBalance = value.match(/^(?:ตั้ง)?ยอด(?:เงิน)?เริ่มต้น\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i); if (openingBalance) return { type: "openingBalance", amount: Number(openingBalance[1].replace(/,/g, "")) };
  if (/^(?:สวัสดี(?:ไมโล|ครับ|ค่ะ)?|หวัดดี(?:ไมโล)?|hello|hi|hey)$/i.test(value)) return { type: "greeting" };
  if (/^(?:เมนูไมโล|วิธีใช้งาน|คู่มือ(?:การใช้งาน)?|คำสั่ง|ช่วย|เมนู|help|\?)$/i.test(value)) return { type: "help" };
  if (/^(?:จดบันทึก|เริ่มจดบันทึก|บันทึกรายรับรายจ่าย|บันทึกรายรับ-รายจ่าย|จด)$/i.test(value)) return { type: "recordGuide" };
  if (/^(?:หมวด\s*\/?\s*งบ|งบประมาณ|คุมงบประมาณ|ดูงบ|งบ)$/i.test(value)) return { type: "budgetOverview" };
  if (/^(?:รายการ|ประวัติ|ประวัติธุรกรรม|ประวัติรายการ|รายการธุรกรรม|รายการทั้งหมด|ดูย้อนหลัง)$/i.test(value)) return { type: "transactionList" };
  if (/^ตั้งค่า$/i.test(value)) return { type: "settingGuide" };
  if (/^(?:dashboard|แดชบอร์ด|เว็บแดชบอร์ด|จัดการระบบหลังบ้าน|หลังบ้าน|แดชบอร์ดหลังบ้าน)$/i.test(value)) return { type: "dashboardGuide" };
  if (/^(?:ประเภท|ประเภทและหมวดหมู่|หมวดหมู่|หมวดหมู่รายรับ-?จ่าย|ดูหมวดหมู่)$/i.test(value)) return { type: "categoryList" };
  if (/^(?:วิเคราะห์|สุขภาพการเงิน|วิเคราะห์การเงิน|วิเคราะห์รายจ่าย|สรุปธุรกิจ)\s*(?:ของ)?\s*(วันนี้|สัปดาห์นี้|เดือนนี้|ปีนี้)?$/i.test(value)) { const m = value.match(/(วันนี้|สัปดาห์นี้|เดือนนี้|ปีนี้)/i); const periods: Record<string, "day" | "week" | "month" | "year"> = { "วันนี้": "day", "สัปดาห์นี้": "week", "เดือนนี้": "month", "ปีนี้": "year" }; return { type: "aiSummary", period: m ? (periods[m[1]] ?? "month") : "month" }; }
  if (/^(?:ดูยอดคงเหลือ|ยอดคงเหลือ)$/.test(value)) return { type: "financeReport", period: "month" };
  const financeReport = value.match(/^สรุป(?:การเงิน|รายรับรายจ่าย|ยอด(?:ประจำเดือน)?)?\s*(?:ของ)?\s*(วันนี้|สัปดาห์นี้|เดือนนี้|ปีนี้)?$/i); if (financeReport) { const periodKey = financeReport[1] ?? "เดือนนี้"; const periods: Record<string, "day" | "week" | "month" | "year"> = { "วันนี้": "day", "สัปดาห์นี้": "week", "เดือนนี้": "month", "ปีนี้": "year" }; return { type: "financeReport", period: periods[periodKey] ?? "month" }; }
  if (/^(?:ยืนยันเสียง|บันทึกจากเสียง)$/i.test(value)) return { type: "voiceConfirm" }; if (/^แก้ไขข้อความเสียง$/i.test(value)) return { type: "voiceEditPrompt" }; const voiceCategory = value.match(/^เปลี่ยนหมวดเสียง\s+(.+)$/i); if (voiceCategory) return { type: "voiceCategoryChange", category: voiceCategory[1].trim() }; const voiceEdit = value.match(/^แก้ไข(?:ข้อความ)?เสียง\s+(.+)$/i); if (voiceEdit) return { type: "voiceEdit", transcript: voiceEdit[1].trim() };
  const note = value.match(/^(โน้ต|บันทึก)\s+(.+)$/i); if (note) return { type: "note", title: note[2].slice(0, 80), content: note[2] }; const todo = value.match(/^(งาน|todo|ทูดู)\s+(.+)$/i); if (todo) return { type: "todo", title: todo[2] };
  const vault = value.match(/^(เก็บ|บันทึกไว้)\s+(.+)$/i); if (vault) { const content = vault[2].trim(); const sourceUrl = content.match(/https?:\/\/\S+/i)?.[0]; const tagsText = (content.match(/#[^\s#]+/g) ?? []).join(" ") || undefined; return { type: "vault", title: (sourceUrl ?? content).slice(0, 80), content, itemType: sourceUrl ? "link" : "text", sourceUrl, tagsText }; }
  const search = value.match(/^(ค้นหา|หาไฟล์|ค้น)\s+(.+)$/i); if (search) return { type: "search", query: search[2] }; const mention = value.match(/^แจ้ง\s*(.+?)\s*ถึง\s*@?(.+)$/i); if (mention) return { type: "mention", message: mention[1].trim(), memberName: mention[2].trim() };
  const categoryAdd = value.match(/^(?:เพิ่ม|ตั้ง)หมวด(?:หมู่)?\s*(?:\s*(รายรับ|รายจ่าย))?\s*(.*)$/i); if (categoryAdd) { const transactionType = categoryAdd[1] === "รายรับ" ? "income" : "expense"; const name = categoryAdd[2].trim(); return name && name.length <= 100 ? { type: "categoryAdd", name, transactionType } : { type: "invalid", message: "กรุณาระบุชื่อหมวด เช่น เพิ่มหมวดรายจ่าย เดินทาง" }; }
  const categoryRemove = value.match(/^(?:ลบ|เอาออก)หมวด(?:หมู่)?\s*(?:\s*(รายรับ|รายจ่าย))?\s*(.*)$/i); if (categoryRemove) { const transactionType = categoryRemove[1] === "รายรับ" ? "income" : "expense"; const name = categoryRemove[2].trim(); return name ? { type: "categoryRemove", name, transactionType } : { type: "invalid", message: "กรุณาระบุหมวดที่ต้องการลบ เช่น ลบหมวดรายจ่าย เดินทาง" }; }
  const categoryList = value.match(/^(?:ดู)?หมวด(?:หมู่)?(?:\s*(รายรับ|รายจ่าย))?$/i); if (categoryList) return { type: "categoryList", transactionType: categoryList[1] === "รายรับ" ? "income" : categoryList[1] === "รายจ่าย" ? "expense" : undefined };
  const budget = value.match(/^(?:ตั้ง)?งบ\s+(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i); if (budget) { const category = budget[1].trim(); const amount = Number(budget[2].replace(/,/g, "")); if (!category || !Number.isFinite(amount) || amount <= 0) return { type: "invalid", message: "งบประมาณต้องระบุหมวดและจำนวนเงินที่มากกว่า 0 บาท" }; return { type: "budget", category, amount }; }
  if (/^(?:ตั้ง)?งบ(?:\s|$)/i.test(value)) return { type: "invalid", message: "รูปแบบงบประมาณ: ตั้งงบ อาหาร 5000 บาท" };
  const imageEdit = value.match(/^(?:แก้|แก้ไข)(?:ข้อมูล)?(?:ใบเสร็จ|สลิป|รูป|ภาพ)\s+(ยอด|จำนวนเงิน|หมวด|หมวดหมู่|วันที่|ร้านค้า|ผู้รับ|หมายเหตุ)\s+(.+)$/i);
  if (imageEdit) {
    const label = imageEdit[1]; const raw = imageEdit[2].trim();
    if (/ยอด|จำนวนเงิน/i.test(label)) { const amount = Number(raw.replace(/,/g, "").replace(/\s*บาท$/i, "")); return Number.isFinite(amount) && amount > 0 ? { type: "imageEdit", field: "amount", value: amount } : { type: "invalid", message: "ยอดที่แก้ไขต้องเป็นจำนวนเงินมากกว่า 0 บาท" }; }
    if (/หมวด/i.test(label)) return raw ? { type: "imageEdit", field: "category", value: raw } : { type: "invalid", message: "กรุณาระบุหมวดที่ต้องการแก้ไข" };
    if (/วันที่/i.test(label)) return raw ? { type: "imageEdit", field: "date", value: raw } : { type: "invalid", message: "กรุณาระบุวันที่ที่ถูกต้อง" };
    if (/ร้านค้า|ผู้รับ/i.test(label)) return raw ? { type: "imageEdit", field: "merchant", value: raw } : { type: "invalid", message: "กรุณาระบุร้านค้าหรือผู้รับ" };
    return { type: "imageEdit", field: "note", value: raw };
  }
  const imageConfirm = value.match(/^(?:ยืนยันรูป|ยืนยันภาพ|บันทึกจากรูป|ยืนยันค่าใช้จ่าย|ยืนยันสลิป|ยืนยันใบเสร็จ|บันทึกสลิป|บันทึกใบเสร็จ)(?:\s+(?:วันที่\s*)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}))?$/i); if (imageConfirm) return imageConfirm[1] ? { type: "imageConfirm", dateText: imageConfirm[1] } : { type: "imageConfirm" };
  if (/^(ช่วย|เมนู|help)$/i.test(value)) return { type: "help" }; return { type: "unknown" };
}
