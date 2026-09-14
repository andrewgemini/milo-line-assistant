import { describe, expect, it } from "vitest";
import { buildGoogleCalendarUrl, calendarEventToIcs, parseCalendarIntent } from "./calendar";

describe("Milo calendar", () => {
  const now = new Date("2026-09-14T02:00:00.000Z"); // 09:00 Bangkok

  it("creates a one-hour event from natural Thai chat", () => {
    const result = parseCalendarIntent("ลงปฏิทิน ประชุมทีมพรุ่งนี้ 10:30", now);
    expect(result?.type).toBe("create");
    if (result?.type !== "create") return;
    expect(result.data.title).toBe("ประชุมทีม");
    expect(result.data.startsAt.toISOString()).toBe("2026-09-15T03:30:00.000Z");
    expect(result.data.endsAt.toISOString()).toBe("2026-09-15T04:30:00.000Z");
  });

  it("supports Buddhist-calendar dates and explicit end times", () => {
    const result = parseCalendarIntent("นัดหมอ วันที่ 20/09/2569 14:00 ถึง 15:30", now);
    expect(result?.type).toBe("create");
    if (result?.type !== "create") return;
    expect(result.data.title).toBe("หมอ");
    expect(result.data.startsAt.toISOString()).toBe("2026-09-20T07:00:00.000Z");
    expect(result.data.endsAt.toISOString()).toBe("2026-09-20T08:30:00.000Z");
  });

  it("supports list and cancel commands", () => {
    expect(parseCalendarIntent("ดูปฏิทิน", now)).toEqual({ type: "list" });
    expect(parseCalendarIntent("ยกเลิกนัด #12", now)).toEqual({ type: "cancel", id: 12 });
  });

  it("builds a Google Calendar template URL with Bangkok timezone", () => {
    const url = new URL(buildGoogleCalendarUrl({
      title: "ประชุมทีม",
      detail: "ห้อง A",
      startsAt: new Date("2026-09-15T03:30:00.000Z"),
      endsAt: new Date("2026-09-15T04:30:00.000Z"),
    }));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("ctz")).toBe("Asia/Bangkok");
    expect(url.searchParams.get("dates")).toBe("20260915T033000Z/20260915T043000Z");
  });

  it("produces an importable ICS event", () => {
    const ics = calendarEventToIcs({
      id: 12,
      title: "ประชุม, ทีม",
      detail: "ห้อง A; ชั้น 2",
      startsAt: new Date("2026-09-15T03:30:00.000Z"),
      endsAt: new Date("2026-09-15T04:30:00.000Z"),
      createdAt: new Date("2026-09-14T02:00:00.000Z"),
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:milo-12@milo-line-app.vercel.app");
    expect(ics).toContain("SUMMARY:ประชุม\\, ทีม");
    expect(ics).toContain("DESCRIPTION:ห้อง A\\; ชั้น 2");
  });
});
