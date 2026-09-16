import { describe, expect, it } from "vitest";
import { deserializeCapturePlan, formatCapturePreview, parseCompoundCapture, serializeCapturePlan } from "./multiIntent";

const now = new Date("2026-09-16T02:00:00.000Z");

describe("compound capture", () => {
  it("splits a natural sentence into a meeting, pending bill and reminder", () => {
    const plan = parseCompoundCapture("พรุ่งนี้บ่ายสองประชุมกับลูกค้า ค่าแท็กซี่ 300 บาท ช่วยเตือนก่อนประชุมด้วยนะ", now);
    expect(plan?.items.map(item => item.type)).toEqual(["calendar", "pending_bill", "reminder"]);
    expect(plan?.items[0]).toMatchObject({ type: "calendar", title: "ประชุมกับลูกค้า" });
    expect(plan?.items[1]).toMatchObject({ type: "pending_bill", title: "ค่าแท็กซี่", amount: 300, category: "เดินทาง" });
    expect(plan?.items[2]).toMatchObject({ type: "reminder" });
    expect((plan?.items[0] as { startsAt: Date }).startsAt.toISOString()).toBe("2026-09-17T07:00:00.000Z");
    expect((plan?.items[2] as { dueAt: Date }).dueAt.toISOString()).toBe("2026-09-17T06:45:00.000Z");
  });

  it("accepts LINE natural language when the amount touches the next Thai word", () => {
    const plan = parseCompoundCapture("พรุ่งนี้ 14:00 น ประชุมกับลูกค้า ค่าแท็กซี่ 300 บาทช่วยเตือนก่อนประชุมด้วยนะ", now);
    expect(plan?.items.map(item => item.type)).toEqual(["calendar", "pending_bill", "reminder"]);
    expect(plan?.items[0]).toMatchObject({ type: "calendar", title: "ประชุมกับลูกค้า" });
    expect(plan?.items[1]).toMatchObject({ type: "pending_bill", title: "ค่าแท็กซี่", amount: 300 });
    expect(plan?.items[2]).toMatchObject({ type: "reminder" });
  });

  it("turns a future bill into a pending bill plus due reminder", () => {
    const plan = parseCompoundCapture("พรุ่งนี้จ่ายค่าไฟ 1,250 บาท", now);
    expect(plan?.items).toHaveLength(2);
    expect(plan?.items[0]).toMatchObject({ type: "pending_bill", title: "ค่าไฟ", amount: 1250, category: "ค่าสาธารณูปโภค" });
    expect(plan?.items[1]).toMatchObject({ type: "reminder", title: "ถึงกำหนดจ่ายค่าไฟ" });
  });

  it("does not replace ordinary immediate finance commands", () => {
    expect(parseCompoundCapture("กินกาแฟ 80", now)).toBeUndefined();
    expect(parseCompoundCapture("จ่ายค่าอาหาร 100 บาท", now)).toBeUndefined();
  });

  it("round-trips dates and produces one consolidated preview", () => {
    const plan = parseCompoundCapture("พรุ่งนี้จ่ายค่าไฟ 1,250 บาท", now)!;
    const restored = deserializeCapturePlan(serializeCapturePlan(plan));
    expect(restored.items[0]).toMatchObject({ type: "pending_bill", amount: 1250 });
    expect((restored.items[0] as { dueAt: Date }).dueAt).toBeInstanceOf(Date);
    const preview = formatCapturePreview(restored, date => date.toISOString());
    expect(preview).toContain("บิลรอจ่าย");
    expect(preview).toContain("ยังไม่สร้างรายการการเงินจริง");
  });
});
