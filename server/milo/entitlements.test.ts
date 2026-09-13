import { describe, expect, it } from "vitest";
import { assertMiloEntitlement, hasMiloEntitlement, MILO_PLAN_CAPABILITIES, resolveMiloPlan } from "./entitlements";

describe("Milo plan entitlements", () => {
  it("defaults every unconfigured LINE user to Free", () => {
    expect(resolveMiloPlan("Ufree", {} as NodeJS.ProcessEnv)).toBe("free");
  });

  it("bootstraps an admin-linked LINE user as Pro Max", () => {
    expect(resolveMiloPlan("Uadmin", {} as NodeJS.ProcessEnv, true)).toBe("pro_max");
  });

  it("resolves explicit Pro and Pro Max users with Pro Max precedence", () => {
    const env = {
      MILO_PRO_LINE_USER_IDS: "Upro, Uboth",
      MILO_PRO_MAX_LINE_USER_IDS: "Umax, Uboth",
    } as NodeJS.ProcessEnv;
    expect(resolveMiloPlan("Upro", env)).toBe("pro");
    expect(resolveMiloPlan("Umax", env)).toBe("pro_max");
    expect(resolveMiloPlan("Uboth", env)).toBe("pro_max");
  });

  it("keeps the agreed package boundaries", () => {
    expect(MILO_PLAN_CAPABILITIES.free.included).toEqual(["categories", "budget", "monthlySummary"]);
    expect(hasMiloEntitlement("free", "reminders")).toBe(false);
    expect(hasMiloEntitlement("pro", "reminders")).toBe(true);
    expect(hasMiloEntitlement("pro", "advancedCharts")).toBe(true);
    expect(hasMiloEntitlement("pro", "customBudgetCycle")).toBe(true);
    expect(hasMiloEntitlement("pro", "pdf")).toBe(false);
    expect(hasMiloEntitlement("pro_max", "pdf")).toBe(true);
    expect(hasMiloEntitlement("pro_max", "groupAccounting")).toBe(true);
    expect(hasMiloEntitlement("pro_max", "multipleAccounts")).toBe(true);
  });

  it("blocks a paid entitlement with a package-specific upgrade message", () => {
    expect(() => assertMiloEntitlement("free", "reminders")).toThrow("Pro");
    expect(() => assertMiloEntitlement("pro", "pdf")).toThrow("Pro Max");
  });
});
