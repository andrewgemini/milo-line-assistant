import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  transcribe: vi.fn(async () => ({ text: "จ่ายกาแฟ 40 บาท", language: "th", durationInSeconds: 2, segments: undefined })),
}));

const { gatewayModel, createGateway } = vi.hoisted(() => {
  const gatewayModel = vi.fn((model: string) => ({ model }));
  return { gatewayModel, createGateway: vi.fn(() => ({ transcriptionModel: gatewayModel })) };
});
vi.mock("@ai-sdk/gateway", () => ({
  createGateway,
  gateway: { transcriptionModel: gatewayModel },
}));

import { transcribe as gatewayTranscribe } from "ai";
import { gatewayAuthAvailable, gatewayTranscriptionModel, transcribeAudio } from "../_core/voiceTranscription";
import { analyzeImage, imageGatewayToken } from "./imageAnalysis";

const originalOidcToken = process.env.VERCEL_OIDC_TOKEN;
const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;

afterEach(() => {
  if (originalOidcToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
  else process.env.VERCEL_OIDC_TOKEN = originalOidcToken;
  if (originalGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Milo production media provider routing", () => {
  it("uses Vercel OIDC for receipt and slip vision when no static Gateway key exists", () => {
    const env = { VERCEL_OIDC_TOKEN: "oidc-token" } as NodeJS.ProcessEnv;
    expect(imageGatewayToken(env)).toBe("oidc-token");
  });

  it("prefers an explicit AI Gateway key over the Vercel OIDC token", () => {
    const env = { AI_GATEWAY_API_KEY: "gateway-key", VERCEL_OIDC_TOKEN: "oidc-token" } as NodeJS.ProcessEnv;
    expect(imageGatewayToken(env)).toBe("gateway-key");
  });

  it("uses the supported Fish Audio transcription model by default", () => {
    expect(gatewayTranscriptionModel({} as NodeJS.ProcessEnv)).toBe("fish-audio/transcribe-1");
    expect(gatewayTranscriptionModel({ MILO_STT_MODEL: "openai/whisper-1" } as NodeJS.ProcessEnv)).toBe("openai/whisper-1");
  });

  it("does not report Gateway authentication from generic Vercel flags alone", () => {
    expect(gatewayAuthAvailable({ VERCEL: "1", VERCEL_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(gatewayAuthAvailable({ VERCEL_OIDC_TOKEN: "oidc-token" } as NodeJS.ProcessEnv)).toBe(true);
    expect(gatewayAuthAvailable({} as NodeJS.ProcessEnv, "request-oidc-token")).toBe(true);
  });

  it("sends a receipt image to AI Gateway with the automatic OIDC token", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ summary: "พบสลิป", confidence: 0.98, proposals: [] }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(analyzeImage("data:image/jpeg;base64,YWJj", { gatewayToken: "request-oidc-token" })).resolves.toMatchObject({ summary: "พบสลิป" });
    expect(fetchMock).toHaveBeenCalledWith("https://ai-gateway.vercel.sh/v1/chat/completions", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer request-oidc-token" }),
    }));
  });

  it("calls the supported Gateway transcription model with LINE audio bytes", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;

    await expect(transcribeAudio({ audioBuffer: Buffer.from("voice"), mimeType: "audio/m4a", language: "th", gatewayToken: "request-oidc-token" }))
      .resolves.toMatchObject({ text: "จ่ายกาแฟ 40 บาท", language: "th", segments: [] });
    expect(createGateway).toHaveBeenCalledWith({ apiKey: "request-oidc-token" });
    expect(gatewayModel).toHaveBeenCalledWith("fish-audio/transcribe-1");
    expect(gatewayTranscribe).toHaveBeenCalledWith(expect.objectContaining({ audio: Buffer.from("voice"), maxRetries: 1 }));
  });
});
