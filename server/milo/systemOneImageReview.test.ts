import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewOcrAnalysisWithSystemOne } from "./systemOneImageReview";
import type { ImageAnalysis } from "./imageAnalysis";

const slip: ImageAnalysis = {
  summary: "OCR อ่านสลิปได้ ยอด 716 บาท วันที่ 2026-09-23",
  confidence: 0.96,
  proposals: [{
    kind: "expense",
    documentType: "bank_slip",
    title: "รายการโอนเงิน",
    merchant: "อีฟ แอนด์ บอย-บางแค",
    dateText: "2026-09-23",
    timeText: "15:16",
    amount: 716,
    currency: "บาท",
    category: "ช้อปปิ้ง",
    paymentMethod: "โอนเงิน",
    receiptNumber: "016266151635CQR07478",
    lineItems: [],
    note: "",
  }],
};

describe("OpenThai-SystemOne image OCR review", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reviews OCR fields without sending the original image and accepts a strong bank slip", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.state.source).toContain("local OCR");
      expect(body.state.amount).toBe(716);
      expect(body.state.reference).toBe("016266151635CQR07478");
      expect(body.state).not.toHaveProperty("image");
      expect(body.questions.quality.type).toBe("choice");
      return new Response(JSON.stringify({
        model: "openthai-systemone",
        answers: {
          document_type: { choice: "bank_slip", confidence: 0.98 },
          category: { choice: "ช้อปปิ้ง", confidence: 0.91 },
          quality: { choice: "accept_ocr", confidence: 0.96 },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await reviewOcrAnalysisWithSystemOne(slip, {
      IAPP_API_KEY: "iapp_test",
      OPENTHAI_SYSTEMONE_MODEL: "openthai-systemone",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      accepted: true,
      needsVision: false,
      documentType: "bank_slip",
      category: "ช้อปปิ้ง",
      model: "openthai-systemone",
    });
  });

  it("requests Gemini Vision when SystemOne considers OCR incomplete", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      model: "openthai-systemone",
      answers: {
        document_type: { choice: "receipt", confidence: 0.94 },
        category: { choice: "ทั่วไป", confidence: 0.7 },
        quality: { choice: "needs_vision", confidence: 0.95 },
      },
    }), { status: 200 })));

    const result = await reviewOcrAnalysisWithSystemOne(slip, { IAPP_API_KEY: "iapp_test" });
    expect(result.accepted).toBe(false);
    expect(result.needsVision).toBe(true);
  });
});
