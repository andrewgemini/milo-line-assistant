import { describe, expect, it } from "vitest";
import { analyzeOcrText, normalizeOcrText } from "./ocrImageAnalysis";

describe("OCR slip parser", () => {
  it("normalizes Thai digits and parses a Thai bank slip", () => {
    const result = analyzeOcrText(`
โอนเงินสำเร็จ
วันที่ 12/09/2569 เวลา 22:45 น.
ผู้รับ: ร้านกาแฟ มีสุข
จำนวนเงิน 1,250.00 บาท
ค่าธรรมเนียม 0.00 บาท
พร้อมเพย์
`);
    expect(result.proposals[0]).toMatchObject({
      kind: "expense",
      documentType: "bank_slip",
      amount: 1250,
      dateText: "2026-09-12",
      timeText: "22:45",
      merchant: "ร้านกาแฟ มีสุข",
      category: "อาหาร",
      paymentMethod: "โอนเงิน",
    });
  });

  it("parses an English transfer slip and ignores fee as the transaction amount", () => {
    const result = analyzeOcrText(`
BANK TRANSFER SUCCESSFUL
Date 2026-09-12 14:30
Recipient: TEST COFFEE SHOP
Amount 123.45 THB
Fee 15.00 THB
`);
    expect(result.proposals[0]).toMatchObject({
      kind: "expense",
      documentType: "bank_slip",
      amount: 123.45,
      dateText: "2026-09-12",
      timeText: "14:30",
      merchant: "TEST COFFEE SHOP",
      category: "อาหาร",
    });
  });

  it("converts Thai numerals before parsing", () => {
    expect(normalizeOcrText("ยอดรวม ๘๐.๕๐ บาท")).toContain("80.50 บาท");
  });
});
