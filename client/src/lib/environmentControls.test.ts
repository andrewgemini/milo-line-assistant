import { describe, expect, it } from "vitest";
import { environmentSwitchTarget, hasDashboardDraft } from "./environmentControls";

describe("environment controls", () => {
  it("detects only meaningful dashboard drafts", () => {
    expect(hasDashboardDraft({ reminderTitle: "", reminderTime: "", isEditingLineLink: false, lineUserId: "" })).toBe(false);
    expect(hasDashboardDraft({ reminderTitle: "ประชุม", reminderTime: "", isEditingLineLink: false, lineUserId: "" })).toBe(true);
    expect(hasDashboardDraft({ reminderTitle: "", reminderTime: "", isEditingLineLink: true, lineUserId: "U123" })).toBe(true);
  });

  it("selects the opposite environment URL", () => {
    expect(environmentSwitchTarget(false, "preview", "production")).toBe("production");
    expect(environmentSwitchTarget(true, "preview", "production")).toBe("preview");
  });
});
