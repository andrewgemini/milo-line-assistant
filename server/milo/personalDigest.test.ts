import { describe, expect, it } from "vitest";
import { formatEveningSummary, formatMorningBrief, shouldDeliverDailyDigest } from "./personalDigest";

describe("personal digests", () => {
  const reference = new Date("2026-09-16T02:00:00.000Z");
  const snapshot = {
    reference,
    calendars: [{ id: 1, title: "ประชุมลูกค้า", startsAt: "2026-09-16T07:00:00.000Z" }],
    reminders: [{ id: 2, title: "เตรียมเอกสาร", nextRunAt: "2026-09-16T06:45:00.000Z" }],
    todos: [{ id: 3, title: "ส่งรายงาน", dueAt: "2026-09-16T10:00:00.000Z", status: "todo" as const }],
    completedTodos: [{ id: 4, title: "เช็กยอด", status: "done" as const, completedAt: reference }],
    bills: [{ id: 5, title: "ค่าไฟ", amount: "1250", dueAt: "2026-09-16T02:00:00.000Z" }],
    finance: { income: 35000, expense: 80, balance: 34920 },
  };

  it("builds a morning brief from the same personal data domains as Today", () => {
    const text = formatMorningBrief(snapshot);
    expect(text).toContain("Morning Brief");
    expect(text).toContain("ประชุมลูกค้า");
    expect(text).toContain("ส่งรายงาน");
    expect(text).toContain("ค่าไฟ");
    expect(text).toContain("34,920");
  });

  it("builds an evening summary with completed work and remaining work", () => {
    const text = formatEveningSummary(snapshot);
    expect(text).toContain("Evening Summary");
    expect(text).toContain("เช็กยอด");
    expect(text).toContain("ส่งรายงาน");
    expect(text).toContain("ค่าไฟ");
  });

  it("prevents duplicate delivery within the same Bangkok day", () => {
    expect(shouldDeliverDailyDigest(null, reference)).toBe(true);
    expect(shouldDeliverDailyDigest("2026-09-16T01:00:00.000Z", reference)).toBe(false);
    expect(shouldDeliverDailyDigest("2026-09-15T10:00:00.000Z", reference)).toBe(true);
  });
});
