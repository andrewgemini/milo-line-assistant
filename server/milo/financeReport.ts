export type FinancePeriod = "day" | "week" | "month" | "year";

export type ReportTransaction = { transactionType: "income" | "expense"; amount: string | number; category: string };

function bangkokCalendarParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter(item => item.type !== "literal").map(item => [item.type, item.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function atBangkokMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0));
}

export function financeReportWindow(period: FinancePeriod, reference = new Date()) {
  const calendar = bangkokCalendarParts(reference);
  if (period === "day") { const start = atBangkokMidnight(calendar.year, calendar.month, calendar.day); return { start, end: new Date(start.getTime() + 86_400_000) }; }
  if (period === "week") {
    const weekday = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day)).getUTCDay() || 7;
    const start = atBangkokMidnight(calendar.year, calendar.month, calendar.day - (weekday - 1));
    return { start, end: new Date(start.getTime() + 7 * 86_400_000) };
  }
  if (period === "month") return { start: atBangkokMidnight(calendar.year, calendar.month, 1), end: atBangkokMidnight(calendar.year, calendar.month + 1, 1) };
  return { start: atBangkokMidnight(calendar.year, 1, 1), end: atBangkokMidnight(calendar.year + 1, 1, 1) };
}

export function summarizeFinanceRows(rows: ReportTransaction[]) {
  const income = rows.filter(row => row.transactionType === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = rows.filter(row => row.transactionType === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const categories = rows.filter(row => row.transactionType === "expense").reduce<Record<string, number>>((all, row) => ({ ...all, [row.category]: (all[row.category] ?? 0) + Number(row.amount) }), {});
  return { income, expense, balance: income - expense, transactionCount: rows.length, categories };
}

export function buildFinanceReport(rows: ReportTransaction[], period: FinancePeriod, reference = new Date()) {
  const { start, end } = financeReportWindow(period, reference);
  return { period, start, end, ...summarizeFinanceRows(rows) };
}
