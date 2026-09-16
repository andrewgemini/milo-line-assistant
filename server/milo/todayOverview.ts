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
  const timeline = [
    ...input.calendars.map(item => ({ at: new Date(item.startsAt), text: `📅 ${thaiTime(item.startsAt)} • ${item.title}` })),
    ...input.reminders.filter(item => item.nextRunAt).map(item => ({ at: new Date(item.nextRunAt!), text: `🔔 ${thaiTime(item.nextRunAt!)} • ${item.title}` })),
    ...input.bills.map(item => ({ at: new Date(item.dueAt), text: `🧾 ${thaiTime(item.dueAt)} • #${item.id} ${item.title} ${Number(item.amount).toLocaleString("th-TH")} บาท` })),
    ...input.todos.filter(item => item.dueAt).map(item => ({ at: new Date(item.dueAt!), text: `✅ ${thaiTime(item.dueAt!)} • #${item.id} ${item.title}` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const undatedTodos = input.todos.filter(item => !item.dueAt).slice(0, 5).map(item => `• #${item.id} ${item.title}`);
  const sections = [
    timeline.length ? `🕒 Timeline\n${timeline.slice(0, 12).map(item => `• ${item.text}`).join("\n")}` : "🕒 Timeline • วันนี้ยังไม่มีรายการตามเวลา",
    undatedTodos.length ? `📌 งานที่ยังไม่กำหนดเวลา\n${undatedTodos.join("\n")}` : "",
    input.bills.length ? "พิมพ์ “จ่ายบิล #เลขรายการ” เมื่อชำระจริง" : "",
    input.finance ? `💰 การเงินวันนี้ • รับ ${input.finance.income.toLocaleString("th-TH")} • จ่าย ${input.finance.expense.toLocaleString("th-TH")} • คงเหลือ ${input.finance.balance.toLocaleString("th-TH")} บาท` : "",
  ].filter(Boolean);
  return `วันนี้ของฉัน • ${date}\n\n${sections.join("\n\n")}`;
}
