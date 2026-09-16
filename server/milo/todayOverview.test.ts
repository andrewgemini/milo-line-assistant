import { describe, expect, it } from "vitest";
import { bangkokDayRange, formatTodayOverview } from "./todayOverview";

describe("today overview", () => {
  it("uses the Bangkok calendar-day boundary", () => {
    const range = bangkokDayRange(new Date("2026-09-16T18:30:00.000Z"));
    expect(range.start.toISOString()).toBe("2026-09-16T17:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-17T17:00:00.000Z");
  });

  it("combines calendar, reminders, tasks, bills and real finance totals", () => {
    const text = formatTodayOverview({
      reference: new Date("2026-09-16T02:00:00.000Z"),
      calendars: [{ id: 1, title: "ประชุมลูกค้า", startsAt: "2026-09-16T07:00:00.000Z" }],
      reminders: [{ id: 2, title: "เตรียมเอกสาร", nextRunAt: "2026-09-16T06:45:00.000Z" }],
      todos: [{ id: 3, title: "ส่งรายงาน" }],
      bills: [{ id: 4, title: "ค่าไฟ", amount: "1250", dueAt: "2026-09-16T02:00:00.000Z" }],
      finance: { income: 35000, expense: 80, balance: 34920 },
    });
    expect(text).toContain("วันนี้ของฉัน");
    expect(text).toContain("ประชุมลูกค้า");
    expect(text).toContain("ค่าไฟ");
    expect(text).toContain("1,250");
    expect(text).toContain("คงเหลือ 34,920 บาท");
  });
});
