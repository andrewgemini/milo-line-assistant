import { afterEach, describe, expect, it } from "vitest";
import { localVoiceRuntimeStatus, transcriptQualityIssue } from "./localVoiceTranscription";
import { voiceTranscriptionRuntimeStatus } from "./voiceTranscription";

const ORIGINAL_LOCAL = process.env.MILO_LOCAL_STT_ENABLED;
const ORIGINAL_VERCEL = process.env.VERCEL;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
const ORIGINAL_GATEWAY = process.env.AI_GATEWAY_API_KEY;
const ORIGINAL_OPENAI = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (ORIGINAL_LOCAL === undefined) delete process.env.MILO_LOCAL_STT_ENABLED;
  else process.env.MILO_LOCAL_STT_ENABLED = ORIGINAL_LOCAL;
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
  if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  if (ORIGINAL_GATEWAY === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = ORIGINAL_GATEWAY;
  if (ORIGINAL_OPENAI === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI;
});

describe("local voice transcription runtime", () => {
  it("reports bundled Whisper ONNX assets and ffmpeg when present", () => {
    const status = localVoiceRuntimeStatus();
    expect(status.bundled).toBe(true);
    expect(status.ffmpegAvailable).toBe(true);
    expect(status.model).toBe("onnx-community/whisper-tiny");
  });

  it("can be explicitly disabled without removing the bundled model", () => {
    process.env.MILO_LOCAL_STT_ENABLED = "0";
    const status = localVoiceRuntimeStatus();
    expect(status.bundled).toBe(true);
    expect(status.enabled).toBe(false);
  });

  it("prefers AI Gateway for production accuracy and keeps local Whisper as fallback", () => {
    process.env.MILO_LOCAL_STT_ENABLED = "1";
    process.env.VERCEL = "1";
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const status = voiceTranscriptionRuntimeStatus();
    expect(status.configured).toBe(true);
    expect(status.mode).toBe("vercel-ai-gateway-stt+local-fallback");
    expect(status.local.enabled).toBe(true);
  });

  it("rejects repeated-token hallucinations from short LINE audio", () => {
    const repeated = Array.from({ length: 45 }, () => "ลิด").join(" ");
    expect(transcriptQualityIssue(repeated, 2)).toMatch(/repeated|too-many/);
  });

  it("accepts a plausible short Thai finance transcript", () => {
    expect(transcriptQualityIssue("จ่ายกาแฟ 80 บาท", 2.5)).toBeUndefined();
  });
});
