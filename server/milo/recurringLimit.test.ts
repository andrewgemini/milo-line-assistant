import { describe, expect, it } from "vitest";
import { MAX_RECURRING_TRANSACTIONS, assertRecurringCapacity, configuredRecurringCount } from "./recurringLimit";

describe("recurring transaction UAT limit", () => {
  it("allows the twentieth configured recurring transaction", () => {
    const items = Array.from({ length: 19 }, () => ({ status: "active" }));
    expect(assertRecurringCapacity(items)).toEqual({ count: 19, remaining: 1 });
  });

  it("rejects a twenty-first configured recurring transaction", () => {
    const items = Array.from({ length: MAX_RECURRING_TRANSACTIONS }, () => ({ status: "active" }));
    expect(() => assertRecurringCapacity(items)).toThrow("สูงสุด 20 รายการ");
  });

  it("does not count cancelled recurring items against the 20-item limit", () => {
    const items = [
      ...Array.from({ length: 19 }, () => ({ status: "active" })),
      { status: "cancelled" },
      { status: "cancelled" },
    ];
    expect(configuredRecurringCount(items)).toBe(19);
    expect(assertRecurringCapacity(items).remaining).toBe(1);
  });
});
