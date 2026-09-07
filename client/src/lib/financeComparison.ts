export type ComparableFinanceReport = { income: number; expense: number; balance: number; transactionCount: number };

export function previousFinanceReportReference(period: "day" | "week" | "month" | "year", reference = new Date()) {
  const previous = new Date(reference);
  if (period === "day") previous.setUTCDate(previous.getUTCDate() - 1);
  if (period === "week") previous.setUTCDate(previous.getUTCDate() - 7);
  if (period === "month") previous.setUTCMonth(previous.getUTCMonth() - 1);
  if (period === "year") previous.setUTCFullYear(previous.getUTCFullYear() - 1);
  return previous;
}

export function financeDelta(current: number, previous: number) {
  const difference = current - previous;
  if (previous === 0) return { difference, percentage: null as number | null };
  return { difference, percentage: (difference / Math.abs(previous)) * 100 };
}
