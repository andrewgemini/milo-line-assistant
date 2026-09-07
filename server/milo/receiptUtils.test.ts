import { describe, expect, it } from "vitest";
import { buildExpenseNote, normalizeExpenseCategory, parseExtractedDate, selectImageProposal } from "./receiptUtils";

describe("receipt utilities", () => {
  it("normalizes a receipt category from merchant and item context", () => {
    expect(normalizeExpenseCategory("", "Cafe Americano")).toBe("อาหาร");
    expect(normalizeExpenseCategory("", "ค่า MRT วันนี้")).toBe("เดินทาง");
  });

  it("parses Thai Buddhist-era numeric dates without guessing malformed dates", () => {
    expect(parseExtractedDate("27/08/2569")?.toISOString().slice(0, 10)).toBe("2026-08-27");
    expect(parseExtractedDate("27 ส.ค. 2569")?.toISOString().slice(0, 10)).toBe("2026-08-27");
    expect(parseExtractedDate("31/02/2569")).toBeUndefined();
  });

  it("prioritizes a payable expense over other image proposals", () => {
    const proposal = selectImageProposal([{ kind: "reminder", title: "ประชุม" }, { kind: "expense", amount: 125, title: "กาแฟ" }]);
    expect(proposal?.kind).toBe("expense");
  });

  it("does not select an unreadable receipt without a reliable payable amount", () => {
    expect(selectImageProposal([{ kind: "expense", amount: 0, title: "ยอดไม่ชัด" }, { kind: "unknown" }])).toBeUndefined();
  });

  it("keeps merchant, payment method, receipt number and items in the expense note", () => {
    expect(buildExpenseNote({ merchant: "ร้านกาแฟ", title: "เครื่องดื่ม", paymentMethod: "PromptPay", receiptNumber: "R-123", lineItems: ["ลาเต้"] })).toContain("ร้านค้า/คู่ค้า: ร้านกาแฟ");
    expect(buildExpenseNote({ merchant: "ร้านกาแฟ", title: "เครื่องดื่ม", paymentMethod: "PromptPay", receiptNumber: "R-123", lineItems: ["ลาเต้"] })).toContain("เลขที่: R-123");
  });
});
