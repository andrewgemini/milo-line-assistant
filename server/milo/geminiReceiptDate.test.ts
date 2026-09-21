import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), ocr: vi.fn() }));
vi.mock("../_core/googleGemini", () => ({ googleGeminiConfigured: () => true, generateGoogleGeminiJson: mocks.generate }));
vi.mock("./ocrImageAnalysis", () => ({ analyzeImageWithOcr: mocks.ocr, buildReceiptHeaderDataUrl: vi.fn(), ocrAssetsReady: () => true }));
import { analyzeImage } from "./imageAnalysis";
afterEach(() => vi.resetAllMocks());
const receipt = (dateText: string, timeText: string) => ({ summary: "receipt", confidence: 0.95, proposals: [{ kind: "expense", documentType: "receipt", title: "อาหาร", merchant: "", dateText, timeText, amount: 423, currency: "THB", category: "อาหาร", paymentMethod: "เงินสด", receiptNumber: "03000728", lineItems: [], note: "" }] });
describe("Gemini receipt dates", () => {
  it("does not present OCR-only financial values when Gemini is unavailable", async () => {
    mocks.generate.mockRejectedValue(new Error("high demand"));
    await expect(analyzeImage("data:image/png;base64,AA==")).rejects.toThrow("temporarily unavailable");
    expect(mocks.ocr).not.toHaveBeenCalled();
  });
  it("returns complete printed receipt fields without slow OCR that could read the screenshot clock", async () => {
    mocks.generate.mockResolvedValue(receipt("2026-09-13", "15:28"));
    const result = await analyzeImage("data:image/png;base64,AA==");
    expect(result.proposals[0]).toMatchObject({ amount: 423, dateText: "2026-09-13", timeText: "15:28" });
    expect(mocks.ocr).not.toHaveBeenCalled();
  });
  it("fills a missing time but preserves the date already read from the receipt", async () => {
    mocks.generate.mockResolvedValue(receipt("2026-09-13", ""));
    mocks.ocr.mockResolvedValue(receipt("2026-09-15", "15:28"));
    const result = await analyzeImage("data:image/png;base64,AA==");
    expect(result.proposals[0]).toMatchObject({ amount: 423, dateText: "2026-09-13", timeText: "15:28" });
  });
});
