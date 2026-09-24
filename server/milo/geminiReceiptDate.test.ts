import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), ocr: vi.fn(), systemOneReview: vi.fn(), systemOneConfigured: vi.fn() }));
vi.mock("../_core/googleGemini", () => ({ googleGeminiConfigured: () => true, generateGoogleGeminiJson: mocks.generate }));
vi.mock("./ocrImageAnalysis", () => ({ analyzeImageWithOcr: mocks.ocr, buildReceiptHeaderDataUrl: vi.fn(), ocrAssetsReady: () => true }));
vi.mock("./systemOneImageReview", () => ({ reviewOcrAnalysisWithSystemOne: mocks.systemOneReview, systemOneImageReviewConfigured: mocks.systemOneConfigured }));
import { analyzeImage } from "./imageAnalysis";
beforeEach(() => mocks.systemOneConfigured.mockReturnValue(false));
afterEach(() => vi.resetAllMocks());
const receipt = (dateText: string, timeText: string) => ({ summary: "receipt", confidence: 0.95, proposals: [{ kind: "expense", documentType: "receipt", title: "อาหาร", merchant: "", dateText, timeText, amount: 423, currency: "THB", category: "อาหาร", paymentMethod: "เงินสด", receiptNumber: "03000728", lineItems: [], note: "" }] });
const bankSlip = () => ({ summary: "OCR อ่านสลิปได้ ยอด 716 บาท วันที่ 2026-09-23", confidence: 0.96, proposals: [{ kind: "expense", documentType: "bank_slip", title: "รายการโอนเงิน", merchant: "อีฟ แอนด์ บอย-บางแค", dateText: "2026-09-23", timeText: "15:16", amount: 716, currency: "บาท", category: "ช้อปปิ้ง", paymentMethod: "โอนเงิน", receiptNumber: "016266151635CQR07478", lineItems: [], note: "" }] });
describe("Gemini receipt dates", () => {
  it("uses OCR + OpenThai-SystemOne as primary and skips Gemini when SystemOne accepts", async () => {
    mocks.systemOneConfigured.mockReturnValue(true);
    mocks.ocr.mockResolvedValue(bankSlip());
    mocks.systemOneReview.mockResolvedValue({
      accepted: true,
      needsVision: false,
      confidence: 0.96,
      documentType: "bank_slip",
      category: "ช้อปปิ้ง",
      model: "openthai-systemone",
    });
    const result = await analyzeImage("data:image/png;base64,AA==");
    expect(mocks.ocr).toHaveBeenCalledTimes(1);
    expect(mocks.systemOneReview).toHaveBeenCalledTimes(1);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.summary).toContain("OpenThai-SystemOne");
    expect(result.proposals[0]).toMatchObject({ amount: 716, documentType: "bank_slip", category: "ช้อปปิ้ง" });
  });
  it("does not present OCR-only receipt values when Gemini is unavailable and OCR is not a strongly identified bank slip", async () => {
    mocks.generate.mockRejectedValue(new Error("high demand"));
    mocks.ocr.mockResolvedValue(receipt("2026-09-13", "15:28"));
    await expect(analyzeImage("data:image/png;base64,AA==")).rejects.toThrow("could not verify this slip strongly enough");
    expect(mocks.ocr).toHaveBeenCalledTimes(1);
  });
  it("falls back to a strongly identified OCR bank slip when Gemini is temporarily unavailable", async () => {
    mocks.generate.mockRejectedValue(new Error("high demand"));
    mocks.ocr.mockResolvedValue(bankSlip());
    const result = await analyzeImage("data:image/png;base64,AA==");
    expect(result.proposals[0]).toMatchObject({ documentType: "bank_slip", amount: 716, dateText: "2026-09-23", timeText: "15:16", receiptNumber: "016266151635CQR07478" });
    expect(result.summary).toContain("อ่านสลิปด้วย OCR แทน");
    expect(result.summary).toContain("ตรวจสอบก่อนยืนยันบันทึก");
  });
  it("uses Gemini after the OCR/SystemOne primary path cannot finish confidently", async () => {
    mocks.ocr.mockResolvedValue(receipt("2026-09-13", "15:28"));
    mocks.generate.mockResolvedValue(receipt("2026-09-13", "15:28"));
    const result = await analyzeImage("data:image/png;base64,AA==");
    expect(result.proposals[0]).toMatchObject({ amount: 423, dateText: "2026-09-13", timeText: "15:28" });
    expect(mocks.ocr).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalled();
  });
  it("fills a missing time but preserves the date already read from the receipt", async () => {
    mocks.generate.mockResolvedValue(receipt("2026-09-13", ""));
    mocks.ocr.mockResolvedValue(receipt("2026-09-15", "15:28"));
    const result = await analyzeImage("data:image/png;base64,AA==");
    expect(result.proposals[0]).toMatchObject({ amount: 423, dateText: "2026-09-13", timeText: "15:28" });
  });
});
