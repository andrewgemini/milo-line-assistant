import { describe, expect, it } from "vitest";
import { nextRecurringRunAt } from "../db";

describe("recurring transaction schedule", () => {
  it("advances a weekly transaction by its stored interval", () => {
    expect(nextRecurringRunAt(new Date("2026-08-31T23:00:00.000Z"), "week", 2).toISOString()).toBe("2026-09-14T23:00:00.000Z");
  });

  it("advances a calendar-month transaction without using the delivery time", () => {
    expect(nextRecurringRunAt(new Date("2026-01-15T23:00:00.000Z"), "month").toISOString()).toBe("2026-02-15T23:00:00.000Z");
  });
});
