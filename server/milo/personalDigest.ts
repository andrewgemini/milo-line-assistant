type CalendarRow = { id: number; title: string; startsAt: Date | string; endsAt?: Date | string };
type ReminderRow = { id: number; title: string; nextRunAt?: Date | string | null };
type TodoRow = { id: number; title: string; dueAt?: Date | string | null; status?: "todo" | "done" | "cancelled"; completedAt?: Date | string | null };
type BillRow = { id: number; title: string; amount: string | number; dueAt: Date | string };
type FinanceSummary = { income: number; expense: number; balance: number };

function thaiDate(value: Date | string) { return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "long" }).format(new Date(value)); }
function thaiTime(value: Date | string) { return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function money(value: number | string) { return Number(value).toLocaleString("th-TH", { maximumFractionDigits: 2 }); }

export function shouldDeliverDailyDigest(lastRunAt: Date | string | null | undefined, reference: Date) {
  if (!lastRunAt) return true;
  const key = (value: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  return key(lastRunAt) !== key(reference);
}

export type PersonalDigestSnapshot = {
  reference: Date;
  calendars: CalendarRow[];
  reminders: ReminderRow[];
  todos: TodoRow[];
  completedTodos?: TodoRow[];
  bills: BillRow[];
  finance?: FinanceSummary;
};

export function formatMorningBrief(input: PersonalDigestSnapshot) {
  const lines: string[] = [`☀️ Morning Brief • ${thaiDate(input.reference)}`, "สวัสดีครับ วันนี้ Milo สรุปสิ่งสำคัญให้ก่อนเริ่มวัน"];
  if (input.calendars.length) lines.push(`\n📅 นัดหมาย ${input.calendars.length} รายการ\n${input.calendars.slice(0, 8).map(item => `• ${thaiTime(item.startsAt)} • ${item.title}`).join("\n")}`);
  else lines.push("\n📅 วันนี้ไม่มีนัดหมายสำคัญ");
  const activeTodos = input.todos.filter(item => item.status !== "done" && item.status !== "cancelled");
  if (activeTodos.length) lines.push(`\n✅ งานค้าง ${activeTodos.length} รายการ\n${activeTodos.slice(0, 8).map(item => `• #${item.id} ${item.title}${item.dueAt ? ` • ${thaiTime(item.dueAt)}` : ""}`).join("\n")}`);
  if (input.reminders.length) lines.push(`\n🔔 เตือน ${input.reminders.length} รายการ\n${input.reminders.slice(0, 8).map(item => `• ${item.nextRunAt ? thaiTime(item.nextRunAt) : "--:--"} • ${item.title}`).join("\n")}`);
  if (input.bills.length) lines.push(`\n🧾 บิลรอจ่าย ${input.bills.length} รายการ\n${input.bills.slice(0, 5).map(item => `• #${item.id} ${item.title} ${money(item.amount)} บาท • ${thaiTime(item.dueAt)}`).join("\n")}`);
  if (input.finance) lines.push(`\n💰 การเงินวันนี้\nรับ ${money(input.finance.income)} บาท • จ่าย ${money(input.finance.expense)} บาท • คงเหลือ ${money(input.finance.balance)} บาท`);
  lines.push("\nพิมพ์ “วันนี้มีอะไร” เพื่อดู Timeline รวมได้ทุกเมื่อครับ");
  return lines.join("\n");
}

export function formatEveningSummary(input: PersonalDigestSnapshot) {
  const lines: string[] = [`🌙 Evening Summary • ${thaiDate(input.reference)}`, "สรุปวันของคุณก่อนพักครับ"];
  const completed = input.completedTodos ?? [];
  if (completed.length) lines.push(`\n✅ งานที่เสร็จ ${completed.length} รายการ\n${completed.slice(0, 8).map(item => `• #${item.id} ${item.title}`).join("\n")}`);
  else lines.push("\n✅ งานที่เสร็จวันนี้ • ยังไม่มีรายการที่บันทึกไว้");
  if (input.finance) lines.push(`\n💰 การเงิน\nรับ ${money(input.finance.income)} บาท • จ่าย ${money(input.finance.expense)} บาท • สุทธิ ${money(input.finance.balance)} บาท`);
  if (input.bills.length) lines.push(`\n🧾 บิลที่ยังรอจ่าย ${input.bills.length} รายการ\n${input.bills.slice(0, 5).map(item => `• #${item.id} ${item.title} ${money(item.amount)} บาท`).join("\n")}`);
  if (input.todos.length) lines.push(`\n📌 งานที่ยังค้าง ${input.todos.length} รายการ\n${input.todos.slice(0, 8).map(item => `• #${item.id} ${item.title}${item.dueAt ? ` • ${thaiDate(item.dueAt)} ${thaiTime(item.dueAt)}` : ""}`).join("\n")}`);
  if (!input.todos.length && !input.bills.length) lines.push("\n🎉 ไม่มีงานค้างหรือบิลรอจ่ายในภาพรวมวันนี้");
  lines.push("\nพรุ่งนี้พิมพ์ “วันนี้มีอะไร” เพื่อดูตารางและสิ่งที่ต้องจัดการครับ");
  return lines.join("\n");
}
