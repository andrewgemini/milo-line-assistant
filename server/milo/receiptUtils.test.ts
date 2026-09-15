import { describe, expect, it } from "vitest";
import { buildExpenseNote, formatImageProposal, normalizeExpenseCategory, parseExtractedDate, resolveReceiptOccurredAt, selectImageProposal } from "./receiptUtils";

describe("receipt utilities", () => {
  it("normalizes a receipt category from merchant and item context", () => {
    expect(normalizeExpenseCategory("", "Cafe Americano")).toBe("อาหาร");
    expect(normalizeExpenseCategory("", "ค่า MRT วันนี้")).toBe("เดินทาง");
  });

  it("parses Thai Buddhist-era numeric dates without guessing malformed dates", () => {
    expect(parseExtractedDate("27/08/2569")?.toISOString().slice(0, 10)).toBe("2026-08-27");
    expect(parseExtractedDate("27 ส.ค. 2569")?.toISOString().slice(0, 10)).toBe("2026-08-27");
    expect(parseExtractedDate("27/08/2569", "10:15")?.toISOString()).toBe("2026-08-27T03:15:00.000Z");
    expect(parseExtractedDate("2026-08-27", "23.45 น.")?.toISOString()).toBe("2026-08-27T16:45:00.000Z");
    expect(parseExtractedDate("31/02/2569")).toBeUndefined();
    expect(parseExtractedDate("27/08/2569", "25:00")).toBeUndefined();
  });

  it("uses the upload date when the receipt date is unreadable but a nearby receipt time is clear", () => {
    const resolved = resolveReceiptOccurredAt("", "10:57", new Date("2026-09-14T06:37:00.000Z"));
    expect(resolved?.source).toBe("upload-date");
    expect(resolved?.occurredAt.toISOString()).toBe("2026-09-14T03:57:00.000Z");
    expect(resolveReceiptOccurredAt("", "01:00", new Date("2026-09-14T13:00:00.000Z"))).toBeUndefined();
  });

  it("prioritizes a payable expense over other image proposals", () => {
    const proposal = selectImageProposal([{ kind: "reminder", title: "ประชุม" }, { kind: "expense", amount: 125, title: "กาแฟ" }]);
    expect(proposal?.kind).toBe("expense");
  });

  it("does not select an unreadable receipt without a reliable payable amount", () => {
    expect(selectImageProposal([{ kind: "expense", amount: 0, title: "ยอดไม่ชัด" }, { kind: "unknown" }])).toBeUndefined();
  });

  it("shows complete K+ slip details before confirmation", () => {
    const text = formatImageProposal({
      kind: "expense",
      documentType: "bank_slip",
      merchant: "คาเฟ่ อเมซอน สน.ปตท.บจก.โรสท์บีนเฮ้าส์",
      amount: 140,
      currency: "บาท",
      category: "อาหาร",
      dateText: "2026-09-13",
      timeText: "15:07",
      receiptNumber: "016256150715DQR03239",
      title: "กาแฟ",
    });
    expect(text).toContain("คาเฟ่ อเมซอน สน.ปตท.บจก.โรสท์บีนเฮ้าส์");
    expect(text).toContain("วันที่/เวลา 2026-09-13 15:07");
    expect(text).toContain("เลขที่รายการ 016256150715DQR03239");
    expect(text).toContain("รายการ กาแฟ");
  });

  it("never shows POS labels as the merchant in preview or saved notes", () => {
    const contaminated = "ประเภท: ทานที่ร้าน ซื้อ พนักงาน: จ๊ะจ๋า เวลา: 13-09-2569 15:28";
    const preview = formatImageProposal({ kind: "expense", documentType: "receipt", merchant: contaminated, amount: 423, currency: "บาท", category: "อาหาร", title: "รายการจากใบเสร็จ" });
    expect(preview).not.toContain("ประเภท:");
    expect(preview).not.toContain("พนักงาน:");
    const note = buildExpenseNote({ merchant: contaminated, title: "รายการจากใบเสร็จ" });
    expect(note).not.toContain("ร้านค้า/คู่ค้า:");
    expect(note).toContain("รายการ: รายการจากใบเสร็จ");
  });

  it("keeps merchant, payment method, receipt number and items in the expense note", () => {
    expect(buildExpenseNote({ merchant: "ร้านกาแฟ", title: "เครื่องดื่ม", paymentMethod: "PromptPay", receiptNumber: "R-123", lineItems: ["ลาเต้"] })).toContain("ร้านค้า/คู่ค้า: ร้านกาแฟ");
    expect(buildExpenseNote({ merchant: "ร้านกาแฟ", title: "เครื่องดื่ม", paymentMethod: "PromptPay", receiptNumber: "R-123", lineItems: ["ลาเต้"] })).toContain("เลขที่: R-123");
  });
});
