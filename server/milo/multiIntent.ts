import { parseCalendarDateTime, parseCalendarIntent } from "./calendar";
import { suggestStandardCategory } from "./financeCategories";

export type CompoundCaptureItem =
  | { type: "calendar"; title: string; startsAt: Date; endsAt: Date }
  | { type: "reminder"; title: string; dueAt: Date }
  | { type: "pending_bill"; title: string; amount: number; category: string; dueAt: Date };

export type CompoundCapturePlan = {
  originalText: string;
  items: CompoundCaptureItem[];
};

const MONEY_CLAUSE = /((?:(?:จ่าย|ชำระ|ซื้อ)\s*)?ค่า[\u0E00-\u0E7FA-Za-z0-9._/-]+(?:\s+[\u0E00-\u0E7FA-Za-z0-9._/-]+){0,2}|(?:จ่าย|ชำระ|ซื้อ)\s+[\u0E00-\u0E7FA-Za-z0-9._/-]+(?:\s+[\u0E00-\u0E7FA-Za-z0-9._/-]+){0,2})\s+(\d[\d,]*(?:\.\d{1,2})?)\s*บาท(?=\s|$|[\u0E00-\u0E7F])/;
const CALENDAR_CUE = /ประชุม|นัด|พบ|คุย|สัมภาษณ์|ส่งงาน/i;
const FUTURE_CUE = /วันนี้|พรุ่งนี้|วันที่\s*\d|\d{1,2}[/-]\d{1,2}|\d{4}-\d{1,2}-\d{1,2}|(?:เวลา\s*)?\d{1,2}(?::|\.)\d{2}|(?:ตี|บ่าย|เย็น|ค่ำ)\s*(?:\d{1,2}|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ)/i;

function cleanBillTitle(raw: string) {
  return raw.replace(/^(?:จ่าย|ชำระ|ซื้อ)\s*/i, "").replace(/^ค่า\s*/i, "ค่า").replace(/\s+/g, " ").trim().slice(0, 255);
}

function reminderLeadMinutes(value: string) {
  const explicit = value.match(/(?:เตือน)?ก่อน(?:ประชุม|นัด)?\s*(\d+)\s*นาที/i);
  return explicit ? Math.min(Math.max(Number(explicit[1]), 1), 24 * 60) : 15;
}

function stripCaptureClauses(value: string, moneyMatch?: RegExpMatchArray | null) {
  let result = value;
  if (moneyMatch?.[0]) result = result.replace(moneyMatch[0], " ");
  return result
    .replace(/(?:ช่วย)?เตือน(?:ฉัน)?ก่อน(?:ประชุม|นัด)?(?:\s*\d+\s*นาที)?(?:ด้วยนะ|ด้วย|นะ|ครับ|ค่ะ)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCompoundCapture(text: string, now = new Date()): CompoundCapturePlan | undefined {
  const value = text.trim().replace(/^@?ไมโล\s*/i, "").trim();
  if (!value || !FUTURE_CUE.test(value)) return undefined;
  if (/^(?:ยืนยัน|แก้(?:ไข)?|ตั้งจด|จดอัตโนมัติ|จดประจำ|รายการประจำ|ตั้งงบ|เพิ่มหมวด|ลบหมวด|ค้นหา|ส่งออก)/i.test(value) || /ทุก(?:วัน|สัปดาห์|เดือน)/i.test(value)) return undefined;

  const moneyMatch = value.match(MONEY_CLAUSE);
  if (!moneyMatch) return undefined;
  const calendarText = stripCaptureClauses(value, moneyMatch);
  const calendarIntent = CALENDAR_CUE.test(calendarText)
    ? parseCalendarIntent(`นัด ${calendarText}`, now)
    : undefined;
  const calendar = calendarIntent?.type === "create" ? calendarIntent.data : undefined;
  const items: CompoundCaptureItem[] = [];

  if (calendar) {
    items.push({ type: "calendar", title: calendar.title, startsAt: calendar.startsAt, endsAt: calendar.endsAt });
  }

  if (moneyMatch) {
    const amount = Number(moneyMatch[2].replace(/,/g, ""));
    const title = cleanBillTitle(moneyMatch[1]);
    if (title && Number.isFinite(amount) && amount > 0) {
      const dueAt = calendar?.startsAt ?? parseCalendarDateTime(value, now);
      items.push({
        type: "pending_bill",
        title,
        amount: Math.round(amount * 100) / 100,
        category: suggestStandardCategory("expense", title),
        dueAt,
      });
      if (!calendar && !/เตือน/i.test(value)) {
        items.push({ type: "reminder", title: `ถึงกำหนดจ่าย${title}`, dueAt });
      }
    }
  }

  if (calendar && /เตือน/i.test(value)) {
    items.push({
      type: "reminder",
      title: `เตือน${calendar.title}`,
      dueAt: new Date(calendar.startsAt.getTime() - reminderLeadMinutes(value) * 60_000),
    });
  }

  if (items.length < 2) return undefined;
  return { originalText: value.slice(0, 2_000), items };
}

export function serializeCapturePlan(plan: CompoundCapturePlan) {
  return JSON.stringify(plan);
}

export function deserializeCapturePlan(payload: string): CompoundCapturePlan {
  const parsed = JSON.parse(payload) as { originalText?: unknown; items?: Array<Record<string, unknown>> };
  if (typeof parsed.originalText !== "string" || !Array.isArray(parsed.items)) throw new Error("Invalid capture payload");
  const items = parsed.items.map(item => {
    if (item.type === "calendar" && typeof item.title === "string") {
      const startsAt = new Date(String(item.startsAt));
      const endsAt = new Date(String(item.endsAt));
      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) throw new Error("Invalid calendar capture");
      return { type: "calendar" as const, title: item.title, startsAt, endsAt };
    }
    if (item.type === "reminder" && typeof item.title === "string") {
      const dueAt = new Date(String(item.dueAt));
      if (!Number.isFinite(dueAt.getTime())) throw new Error("Invalid reminder capture");
      return { type: "reminder" as const, title: item.title, dueAt };
    }
    if (item.type === "pending_bill" && typeof item.title === "string" && typeof item.category === "string") {
      const dueAt = new Date(String(item.dueAt));
      const amount = Number(item.amount);
      if (!Number.isFinite(dueAt.getTime()) || !Number.isFinite(amount) || amount <= 0) throw new Error("Invalid bill capture");
      return { type: "pending_bill" as const, title: item.title, category: item.category, amount, dueAt };
    }
    throw new Error("Unknown capture item");
  });
  return { originalText: parsed.originalText, items };
}

export function formatCapturePreview(plan: CompoundCapturePlan, formatDate: (date: Date) => string) {
  const rows = plan.items.map(item => {
    if (item.type === "calendar") return `📅 นัดหมาย • ${item.title}\n   ${formatDate(item.startsAt)}`;
    if (item.type === "reminder") return `🔔 เตือน • ${item.title}\n   ${formatDate(item.dueAt)}`;
    return `🧾 บิลรอจ่าย • ${item.title} ${item.amount.toLocaleString("th-TH")} บาท\n   ครบกำหนด ${formatDate(item.dueAt)} • หมวด${item.category}`;
  });
  return `ไมโลเข้าใจว่า…\n\n${rows.join("\n\n")}\n\nยังไม่สร้างรายการการเงินจริงจนกว่าจะกดจ่ายบิล`;
}
