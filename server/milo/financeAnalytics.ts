export type FinanceAnalyticsTransaction = {
  transactionType: "income" | "expense";
  amount: string | number;
  occurredAt: Date;
};

const thaiDateKey = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export function buildFinanceAnalytics(rows: FinanceAnalyticsTransaction[], now = new Date()) {
  const todayKey = thaiDateKey(now);
  const todayAtNoon = new Date(`${todayKey}T12:00:00.000Z`);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayAtNoon);
    date.setUTCDate(todayAtNoon.getUTCDate() - (6 - index));
    return { dateKey: thaiDateKey(date), income: 0, expense: 0 };
  });
  const dayMap = new Map(days.map(day => [day.dateKey, day]));

  for (const row of rows) {
    const day = dayMap.get(thaiDateKey(row.occurredAt));
    if (!day) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    if (row.transactionType === "income") day.income += amount;
    else day.expense += amount;
  }

  return {
    daily: days,
    transactionCount: rows.length,
    sevenDayIncome: days.reduce((sum, day) => sum + day.income, 0),
    sevenDayExpense: days.reduce((sum, day) => sum + day.expense, 0),
  };
}
