import { describe, expect, it } from "vitest";
import { buildFinanceAnalytics } from "./financeAnalytics";

describe("buildFinanceAnalytics", () => {
  it("groups real income and expense rows into seven Bangkok calendar days", () => {
    const analytics = buildFinanceAnalytics([
      { transactionType: "expense", amount: "125.50", occurredAt: new Date("2026-08-24T06:30:00.000Z") },
      { transactionType: "income", amount: 900, occurredAt: new Date("2026-08-25T08:00:00.000Z") },
      { transactionType: "expense", amount: "20", occurredAt: new Date("2026-08-15T06:30:00.000Z") },
    ], new Date("2026-08-25T12:00:00.000Z"));

    expect(analytics.daily).toHaveLength(7);
    expect(analytics.daily.at(-2)).toMatchObject({ dateKey: "2026-08-24", expense: 125.5 });
    expect(analytics.daily.at(-1)).toMatchObject({ dateKey: "2026-08-25", income: 900 });
    expect(analytics.sevenDayIncome).toBe(900);
    expect(analytics.sevenDayExpense).toBe(125.5);
    expect(analytics.transactionCount).toBe(3);
  });
});
