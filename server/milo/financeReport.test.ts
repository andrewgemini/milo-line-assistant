import { describe, expect, it } from "vitest";
import { buildFinanceReport, financeReportWindow } from "./financeReport";

describe("financeReport", () => {
  it("builds income, expense, profit/loss, categories, and Thai monthly boundaries from real rows", () => {
    const report = buildFinanceReport([
      { transactionType: "income", amount: "5000.00", category: "ขายสินค้า" },
      { transactionType: "expense", amount: "125.50", category: "อาหาร" },
      { transactionType: "expense", amount: "200", category: "อาหาร" },
    ], "month", new Date("2026-08-26T10:00:00Z"));
    expect(report).toMatchObject({ income: 5000, expense: 325.5, balance: 4674.5, transactionCount: 3, categories: { อาหาร: 325.5 } });
    expect(report.start.toISOString()).toBe("2026-07-31T17:00:00.000Z");
  });

  it("uses Monday as the weekly boundary in Asia/Bangkok", () => {
    const window = financeReportWindow("week", new Date("2026-08-26T10:00:00Z"));
    expect(window.start.toISOString()).toBe("2026-08-23T17:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-08-30T17:00:00.000Z");
  });
});
