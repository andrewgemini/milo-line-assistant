import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio, voiceTranscriptionRuntimeStatus } from "./voiceTranscription";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Google Gemini LINE voice transcription", () => {
  it("uses the multimodal Flash model for inline LINE audio", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-secret-key");
    vi.stubEnv("MILO_GEMINI_STT_MODEL", "");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "จ่ายค่าอาหาร 80 บาท" }] } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(voiceTranscriptionRuntimeStatus().mode).toBe("google-gemini-audio");
    await expect(transcribeAudio({ audioBuffer: Buffer.from("line-audio"), mimeType: "audio/m4a", language: "th" }))
      .resolves.toMatchObject({ text: "จ่ายค่าอาหาร 80 บาท", language: "th" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/gemini-3.6-flash:generateContent");
    expect(url).not.toContain("test-secret-key");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-secret-key" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      contents: [{ parts: [expect.objectContaining({ text: expect.stringContaining("ถอดเสียงภาษาไทย") }), { inlineData: { mimeType: "audio/m4a", data: Buffer.from("line-audio").toString("base64") } }] }],
    });
  });

  it("retries with the current fallback when the primary model returns no transcript", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-secret-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [] } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "เงินเดือนเข้า 30000 บาท" }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(transcribeAudio({ audioBuffer: Buffer.from("line-audio"), mimeType: "audio/m4a", language: "th" }))
      .resolves.toMatchObject({ text: "เงินเดือนเข้า 30000 บาท" });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/models/gemini-3.8-flash:generateContent");
  });
});
