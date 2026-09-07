import { describe, expect, it, vi } from "vitest";
import { dashboardSectionIds, scrollToDashboardSection } from "./dashboardNavigation";

describe("dashboard navigation", () => {
  it("keeps every sidebar and mobile section id in the supported navigation set", () => {
    expect(dashboardSectionIds).toEqual(["overview", "analysis", "budgets", "transactions", "recurring", "vault", "tasks", "groups", "export"]);
  });

  it("scrolls a resolved section into view with the intended smooth top alignment", () => {
    const scrollIntoView = vi.fn();
    const root = { getElementById: vi.fn(() => ({ scrollIntoView })) };
    expect(scrollToDashboardSection("groups", root)).toBe(true);
    expect(root.getElementById).toHaveBeenCalledWith("groups");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("sends the vault menu to the active metadata manager instead of the retired quick-action panel", () => {
    const scrollIntoView = vi.fn();
    expect(scrollToDashboardSection("vault", { getElementById: vi.fn((id: string) => id === "vault-management" ? { scrollIntoView } : null) })).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("sends the transactions menu to the searchable evidence-aware ledger", () => {
    const scrollIntoView = vi.fn();
    const root = { getElementById: vi.fn((id: string) => id === "transactions-main" ? { scrollIntoView } : null) };
    expect(scrollToDashboardSection("transactions", root)).toBe(true);
    expect(root.getElementById).toHaveBeenCalledWith("transactions-main");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does not throw or report success when a target section is unavailable", () => {
    expect(scrollToDashboardSection("analysis", { getElementById: () => null })).toBe(false);
  });
});
