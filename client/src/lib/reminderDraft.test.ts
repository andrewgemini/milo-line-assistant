import { describe, expect, it } from "vitest";
import { canSubmitReminderDraft, clearedReminderDraft, normalizedReminderTitle, reminderDueAtFromBangkokInput } from "./reminderDraft";

describe("reminder draft helpers", () => {
  it("trims a reminder title before submit", () => {
    expect(normalizedReminderTitle("  ประชุมทีม  ")).toBe("ประชุมทีม");
  });

  it("does not allow an empty reminder title", () => {
    expect(canSubmitReminderDraft("   ")).toBe(false);
    expect(canSubmitReminderDraft("โทรกลับ")).toBe(true);
  });

  it("clears a reminder draft only with an explicit success reset", () => {
    expect(clearedReminderDraft()).toEqual({ title: "", time: "" });
  });

  it("interprets datetime-local input as Asia/Bangkok regardless of browser timezone", () => {
    expect(reminderDueAtFromBangkokInput("2026-08-26T14:30").toISOString()).toBe("2026-08-26T07:30:00.000Z");
  });

  it("keeps the one-hour default relative to the current instant when no time is entered", () => {
    expect(reminderDueAtFromBangkokInput("", new Date("2026-08-26T01:00:00.000Z")).toISOString()).toBe("2026-08-26T02:00:00.000Z");
  });
});
