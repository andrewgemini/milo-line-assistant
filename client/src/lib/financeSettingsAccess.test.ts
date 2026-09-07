import { describe, expect, it } from "vitest";
import { canManageFinanceSettings } from "./financeSettingsAccess";

describe("finance settings access", () => {
  it("allows only owner and manager to mutate account settings", () => {
    expect(canManageFinanceSettings("owner")).toBe(true);
    expect(canManageFinanceSettings("manager")).toBe(true);
    expect(canManageFinanceSettings("contributor")).toBe(false);
    expect(canManageFinanceSettings("viewer")).toBe(false);
  });
});
