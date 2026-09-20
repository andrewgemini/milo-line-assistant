import { afterEach, describe, expect, it, vi } from "vitest";
import { generateGoogleGeminiJson, generateGoogleGeminiText, googleGeminiModels } from "./googleGemini";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Google Gemini resilient routing", () => {
  it("uses the configured model first and retains free multimodal fallbacks", () => {
    expect(googleGeminiModels("vision", { MILO_GOOGLE_VISION_MODEL: "custom-model" } as NodeJS.ProcessEnv))
      .toEqual(["custom-model", "gemini-3.6-flash", "gemini-3.8-flash"]);
  });

  it("falls back for structured image extraction and keeps the API key out of the URL", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-secret-key");
    vi.stubEnv("MILO_GOOGLE_VISION_MODEL", "unavailable-model");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "model unavailable" } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "พบใบเสร็จ", confidence: 0.95, proposals: [] }) }] } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateGoogleGeminiJson({
      prompt: "อ่านใบเสร็จ",
      imageDataUrl: "data:image/jpeg;base64,YWJj",
      schema: { type: "object", additionalProperties: false, properties: { proposals: { type: "array", items: { type: "object", additionalProperties: false } } } },
      kind: "vision",
    })).resolves.toMatchObject({ summary: "พบใบเสร็จ" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain("/models/unavailable-model:generateContent");
    expect(firstUrl).not.toContain("test-secret-key");
    expect(firstInit.headers).toMatchObject({ "x-goog-api-key": "test-secret-key" });
    const config = JSON.parse(String(firstInit.body)).generationConfig;
    expect(config.responseSchema).toBeUndefined();
    expect(config.responseJsonSchema.additionalProperties).toBe(false);
    expect(config.responseJsonSchema.properties.proposals.items.additionalProperties).toBe(false);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/models/gemini-3.6-flash:generateContent");
  });

  it("falls back when the chat model returns an empty candidate", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-secret-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [] } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "สวัสดีครับ" }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateGoogleGeminiText({ prompt: "สวัสดี", system: "ตอบภาษาไทย" })).resolves.toBe("สวัสดีครับ");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/models/gemini-3.8-flash:generateContent");
  });
});
