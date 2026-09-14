import { afterEach, expect, it, vi } from "vitest";
import { transcribeAudio, voiceTranscriptionRuntimeStatus } from "./voiceTranscription";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("sends Thai LINE audio bytes to Groq instead of Gateway", async () => {
  vi.stubEnv("GROQ_API_KEY", "test-only-key");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "test-oidc");
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "ค่ากาแฟ 40 บาท", language: "th", duration: 2, segments: [] })));
  vi.stubGlobal("fetch", fetchMock);
  expect(voiceTranscriptionRuntimeStatus().mode).toBe("groq-whisper-large-v3");
  expect(await transcribeAudio({ audioBuffer: Buffer.from("audio"), mimeType: "audio/m4a", language: "th" })).toMatchObject({ text: "ค่ากาแฟ 40 บาท" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
  const form = options.body as FormData;
  expect(form.get("model")).toBe("whisper-large-v3");
  expect(form.get("language")).toBe("th");
  expect(form.get("response_format")).toBe("verbose_json");
  expect(await (form.get("file") as Blob).text()).toBe("audio");
});

it("reports exhausted Groq quota without silently switching providers", async () => {
  vi.stubEnv("GROQ_API_KEY", "test-only-key");
  const fetchMock = vi.fn(async () => new Response("rate limit exceeded", { status: 429 }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await transcribeAudio({ audioBuffer: Buffer.from("audio"), language: "th" })).toMatchObject({ code: "TRANSCRIPTION_FAILED", details: expect.stringContaining("groq: 429") });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
