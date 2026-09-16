import { describe, expect, it } from "vitest";
import { mergeImageAnalyses, type ImageAnalysis } from "./imageAnalysis";

function analysis(overrides: Partial<ImageAnalysis["proposals"][number]>): ImageAnalysis {
  return {
    summary: "test",
    confidence: 0.8,
    proposals: [{
      kind: "expense",
      documentType: "receipt",
      title: "ข้อมูลจากรูป",
      merchant: "",
      dateText: "",
      timeText: "",
      amount: 0,
      currency: "บาท",
      category: "ทั่วไป",
      paymentMethod: "",
      receiptNumber: "",
      lineItems: [],
      note: "",
      ...overrides,
    }],
  };
}

describe("image analysis merge", () => {
  it("replaces contaminated receipt fields with OCR net-pay details", () => {
    const primary = analysis({
      merchant: "ช ร้านกระเพรากลางซอย ถุง อาหาร ของหวาน เครื่องดื่ม ค่าสินค้า/บริการ 75 บาท สิทธิไทยช่วยไทยพลัส -45 บาท",
      amount: 75,
      timeText: "10:57",
      category: "อาหาร",
    });
    const ocr = analysis({
      merchant: "ร้านกระเพรากลางซอย",
      amount: 30,
      dateText: "2026-09-14",
      timeText: "10:57",
      lineItems: ["ค่าสินค้า/บริการ 75 บาท", "สิทธิไทยช่วยไทยพลัส -45 บาท", "จำนวนเงินที่ชำระ 30 บาท"],
    });
    expect(mergeImageAnalyses(primary, ocr).proposals[0]).toMatchObject({
      merchant: "ร้านกระเพรากลางซอย",
      amount: 30,
      dateText: "2026-09-14",
      timeText: "10:57",
      category: "อาหาร",
    });
  });

  it("rejects a corrupted provider merchant and keeps the readable OCR coffee shop", () => {
    const primary = analysis({ merchant: "ะ ภ% 7 oo WAT", amount: 40, dateText: "2026-09-16", timeText: "10:34", category: "อาหาร" });
    const ocr = analysis({ merchant: "INDI Coffee", amount: 16, dateText: "2026-09-16", timeText: "10:34", category: "อาหาร" });
    expect(mergeImageAnalyses(primary, ocr).proposals[0]).toMatchObject({
      merchant: "INDI Coffee",
      amount: 16,
      dateText: "2026-09-16",
      timeText: "10:34",
    });
  });

  it("keeps the fuller cleaned OCR merchant for a multi-line K+ CJ slip", () => {
    const primary = analysis({ documentType: "bank_slip", title: "กาแฟ", merchant: "= CJ 1685 เพชรเกษม1 06 บจก. ซี.เจ. เอกซ์เพรส กรุ๊ป 2รอ", amount: 40, dateText: "2026-09-14", timeText: "11:02", paymentMethod: "โอนเงิน" });
    const ocr = analysis({ documentType: "bank_slip", title: "รายการโอนเงิน", merchant: "CJ 1685 เพชรเกษม106 บจก. ซี.เจ. เอ็กซ์เพรส กรุ๊ป", amount: 40, dateText: "2026-09-14", timeText: "11:02", receiptNumber: "016257110259CQR07995", paymentMethod: "โอนเงิน" });
    expect(mergeImageAnalyses(primary, ocr).proposals[0]).toMatchObject({
      merchant: "CJ 1685 เพชรเกษม106 บจก. ซี.เจ. เอ็กซ์เพรส กรุ๊ป",
      amount: 40,
      receiptNumber: "016257110259CQR07995",
      title: "รายการโอนเงิน",
    });
  });
});
