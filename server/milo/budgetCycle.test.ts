import { describe, expect, it } from "vitest";
import { budgetCycleWindow, normalizeBudgetCycleStartDay } from "./budgetCycle";

describe("budget cycle window", () => {
  it("uses the previous month when the configured start day has not arrived yet", () => {
    const result = budgetCycleWindow(new Date("2026-09-12T14:00:00.000Z"), 14);
    expect(result.key).toBe("2026-08");
    expect(result.start.toISOString()).toBe("2026-08-13T17:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-09-13T17:00:00.000Z");
  });
  it("switches to the current month on the configured start day in Bangkok", () => {
    const result = budgetCycleWindow(new Date("2026-09-14T02:00:00.000Z"), 14);
    expect(result.key).toBe("2026-09");
    expect(result.start.toISOString()).toBe("2026-09-13T17:00:00.000Z");
  });
  it("keeps the supported setting within 1 to 28", () => {
    expect(normalizeBudgetCycleStartDay(0)).toBe(1);
    expect(normalizeBudgetCycleStartDay(31)).toBe(28);
  });
});
