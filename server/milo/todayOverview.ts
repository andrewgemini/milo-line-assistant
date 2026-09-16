type CalendarRow = { id: number; title: string; startsAt: Date | string };
type ReminderRow = { id: number; title: string; nextRunAt?: Date | string | null };
type TodoRow = { id: number; title: string; dueAt?: Date | string | null };
type BillRow = { id: number; title: string; amount: string | number; dueAt: Date | string };
type FinanceSummary = { income: number; expense: number; balance: number };

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export function bangkokDayRange(reference = new Date()) {
  const shifted = new Date(reference.getTime() + BANGKOK_OFFSET_MS);
  const start = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), -7));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function thaiTime(value: Date | string) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatTodayOverview(input: {
  reference: Date;
  calendars: CalendarRow[];
  reminders: ReminderRow[];
  todos: TodoRow[];
  bills: BillRow[];
  finance?: FinanceSummary;
}) {
  const date = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "long" }).format(input.reference);
  const sections: string[] = [];

  sections.push(input.calendars.length
    ? `📅 นัดหมาย\n${input.calendars.slice(0, 5).map(item => `• ${thaiTime(item.startsAt)} • ${item.title}`).join("\n")}`
    : "📅 นัดหมาย • ไม่มี");

  sections.push(input.reminders.length
    ? `🔔 เตือนวันนี้\n${input.reminders.slice(0, 5).map(item => `• ${item.nextRunAt ? thaiTime(item.nextRunAt) : "--:--"} • ${item.title}`).join("\n")}`
    : "🔔 เตือนวันนี้ • ไม่มี");

  sections.push(input.todos.length
    ? `✅ งานค้าง\n${input.todos.slice(0, 5).map(item => `• #${item.id} ${item.title}${item.dueAt ? ` • ${thaiTime(item.dueAt)}` : ""}`).join("\n")}`
    : "✅ งานค้าง • ไม่มี");

  sections.push(input.bills.length
    ? `🧾 บิลรอจ่าย\n${input.bills.slice(0, 5).map(item => `• #${item.id} ${item.title} ${Number(item.amount).toLocaleString("th-TH")} บาท • ${thaiTime(item.dueAt)}`).join("\n")}\nพิมพ์ “จ่ายบิล #เลขรายการ” เมื่อชำระจริง`
    : "🧾 บิลรอจ่าย • ไม่มี");

  if (input.finance) {
    sections.push(`💰 วันนี้ • รับ ${input.finance.income.toLocaleString("th-TH")} • จ่าย ${input.finance.expense.toLocaleString("th-TH")} • คงเหลือ ${input.finance.balance.toLocaleString("th-TH")} บาท`);
  }

  return `วันนี้ของฉัน • ${date}\n\n${sections.join("\n\n")}`;
}
