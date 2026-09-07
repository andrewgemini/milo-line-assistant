import { describe, expect, it } from "vitest";
import { financeDelta, previousFinanceReportReference } from "./financeComparison";

describe("finance comparison", () => {
  it("selects a prior calendar reference for each supported reporting period", () => {
    const reference = new Date("2026-08-27T05:00:00.000Z");
    expect(previousFinanceReportReference("day", reference).toISOString()).toBe("2026-08-26T05:00:00.000Z");
    expect(previousFinanceReportReference("week", reference).toISOString()).toBe("2026-08-20T05:00:00.000Z");
    expect(previousFinanceReportReference("month", reference).toISOString()).toBe("2026-07-27T05:00:00.000Z");
    expect(previousFinanceReportReference("year", reference).toISOString()).toBe("2025-08-27T05:00:00.000Z");
  });

  it("reports a difference without inventing a percentage when the prior value is zero", () => {
    expect(financeDelta(120, 100)).toEqual({ difference: 20, percentage: 20 });
    expect(financeDelta(80, 0)).toEqual({ difference: 80, percentage: null });
  });
});
