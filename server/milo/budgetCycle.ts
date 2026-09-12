const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokParts(date: Date) {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function normalizeMonth(year: number, month: number) {
  const value = new Date(Date.UTC(year, month - 1, 1));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

function atBangkokMidnight(year: number, month: number, day: number) {
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth(), normalized.getUTCDate(), -7, 0, 0));
}

export function normalizeBudgetCycleStartDay(day: number) {
  return Math.min(Math.max(Math.trunc(day || 1), 1), 28);
}

export function budgetCycleWindow(reference = new Date(), configuredStartDay = 1) {
  const startDay = normalizeBudgetCycleStartDay(configuredStartDay);
  const parts = bangkokParts(reference);
  const startMonth = parts.day >= startDay
    ? { year: parts.year, month: parts.month }
    : normalizeMonth(parts.year, parts.month - 1);
  const nextMonth = normalizeMonth(startMonth.year, startMonth.month + 1);
  const start = atBangkokMidnight(startMonth.year, startMonth.month, startDay);
  const end = atBangkokMidnight(nextMonth.year, nextMonth.month, startDay);
  const key = `${startMonth.year}-${String(startMonth.month).padStart(2, "0")}`;
  return { startDay, start, end, key };
}

export function formatBudgetCycleLabel(reference = new Date(), configuredStartDay = 1) {
  const { start, end } = budgetCycleWindow(reference, configuredStartDay);
  const endInclusive = new Date(end.getTime() - 1);
  const format = new Intl.DateTimeFormat("th-TH-u-nu-latn", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  return `${format.format(start)} – ${format.format(endInclusive)}`;
}
