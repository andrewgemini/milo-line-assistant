/**
 * Voice transcription helper with provider fallback.
 * In production Milo prefers the higher-accuracy remote provider for short Thai
 * LINE clips, then falls back to local Whisper when remote providers are unavailable.
 */
import { transcribe as gatewayTranscribe } from "ai";
import { createGateway, gateway } from "@ai-sdk/gateway";
import { ENV } from "./env";
import { generateGoogleGeminiJson, googleGeminiConfigured } from "./googleGemini";
import { localVoiceRuntimeStatus, transcriptQualityIssue, transcribeAudioLocal } from "./localVoiceTranscription";

export type TranscribeOptions = {
  audioUrl?: string;
  audioBuffer?: Buffer | Uint8Array;
  mimeType?: string;
  language?: string;
  prompt?: string;
  gatewayToken?: string;
};

export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

export function gatewayAuthAvailable(env: NodeJS.ProcessEnv = process.env, requestToken?: string) {
  return Boolean(
    (env.AI_GATEWAY_API_KEY || "").trim() ||
    (env.VERCEL_OIDC_TOKEN || "").trim() ||
    requestToken?.trim()
  );
}

export function gatewayTranscriptionModel(env: NodeJS.ProcessEnv = process.env) {
  return (env.MILO_STT_MODEL || "fish-audio/transcribe-1").trim();
}

export function voiceTranscriptionRuntimeStatus(requestToken?: string) {
  const forge = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  const groq = Boolean((process.env.GROQ_API_KEY || "").trim());
  const openai = Boolean((process.env.OPENAI_API_KEY || "").trim());
  const gatewayAvailable = gatewayAuthAvailable(process.env, requestToken);
  const local = localVoiceRuntimeStatus();
  const google = googleGeminiConfigured();
  return {
    configured: google || groq || local.enabled || forge || openai || gatewayAvailable,
    mode: google ? "google-gemini-audio" : groq ? "groq-whisper-large-v3" : gatewayAvailable
      ? (local.enabled ? "vercel-ai-gateway-stt+local-fallback" : "vercel-ai-gateway-stt")
      : forge
        ? (local.enabled ? "forge-whisper+local-fallback" : "forge-whisper")
        : openai
          ? (local.enabled ? "openai-whisper+local-fallback" : "openai-whisper")
          : local.enabled
            ? "local-whisper-onnx"
            : "unconfigured",
    local,
  } as const;
}

function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
  };
  return mimeToExt[mimeType] || "audio";
}

function getLanguageName(langCode: string): string {
  const langMap: Record<string, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
    pt: "Portuguese", ru: "Russian", ja: "Japanese", ko: "Korean", zh: "Chinese",
    ar: "Arabic", hi: "Hindi", nl: "Dutch", pl: "Polish", tr: "Turkish",
    sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish", th: "Thai",
  };
  return langMap[langCode] || langCode;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function makeFormData(audioBuffer: Buffer, mimeType: string, options: TranscribeOptions, model = "whisper-1") {
  const formData = new FormData();
  const filename = `audio.${getFileExtension(mimeType)}`;
  const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append("file", audioBlob, filename);
  formData.append("model", model);
  formData.append("response_format", "verbose_json");
  if (options.language) formData.append("language", options.language);
  const prompt = options.prompt || (
    options.language
      ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}`
      : "Transcribe the user's voice to text"
  );
  formData.append("prompt", prompt);
  return formData;
}

async function callTranscriptionProvider(
  url: string,
  apiKey: string,
  audioBuffer: Buffer,
  mimeType: string,
  options: TranscribeOptions,
) {
  return fetchWithTimeout(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "Accept-Encoding": "identity",
    },
    body: makeFormData(audioBuffer, mimeType, options),
  }, 60_000);
}

const googleTranscriptSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    language: { type: "string" },
    duration: { type: "number" },
  },
  required: ["text", "language", "duration"],
  additionalProperties: false,
} as const;

async function transcribeWithGoogleGemini(audioBuffer: Buffer, options: TranscribeOptions): Promise<TranscriptionResponse> {
  const result = await generateGoogleGeminiJson<{
    text: string;
    language: string;
    duration: number;
  }>({
    kind: "audio",
    audioBuffer,
    audioMimeType: options.mimeType || "audio/m4a",
    language: options.language || "th",
    schema: googleTranscriptSchema,
    system: "คุณคือระบบถอดเสียงภาษาไทยของ Milo สำหรับคลิปเสียงจาก LINE. งานของคุณคือถอดคำพูดตามเสียงจริงแบบ verbatim ไม่ใช่สรุปความ ไม่ใช่ตอบกลับผู้พูด และไม่ใช่แก้ประโยคให้สวย. ห้ามแต่งคำ ห้ามเติมคำทักทาย ห้ามเปลี่ยนคำลงท้าย และห้ามเดาคำที่ไม่ได้ยิน. ต้องรักษาตัวเลข จำนวนเงิน หน่วย 'บาท/สตางค์' ชื่อรายการ และคำว่า รายรับ/รายจ่าย ตามเสียงจริง. ถ้าผู้พูดพูดว่า 'ค่ากาแฟ 40 บาท' ให้คืนข้อความนั้น ไม่ใช่ 'สวัสดีค่ะ' หรือข้อความอื่น. ถ้ามีเสียงรบกวนให้ถอดเฉพาะคำที่ได้ยินจริงและไม่สร้างประโยคขึ้นมาเอง.",
    prompt: options.prompt || "ถอดเสียงคลิปนี้แบบคำต่อคำ ภาษาหลักคือไทย. ห้ามสรุป ห้ามตอบกลับ และห้ามเติมข้อความ. สำหรับคำสั่งการเงิน ให้คงตัวเลขและหน่วยเงินบาทตามที่พูดจริง",
  });
  const response: TranscriptionResponse = {
    task: "transcribe",
    language: result.language || options.language || "th",
    duration: Number(result.duration || 0),
    text: result.text || "",
    segments: [{
      id: 0,
      seek: 0,
      start: 0,
      end: Number(result.duration || 0),
      text: result.text || "",
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 0,
      no_speech_prob: 0,
    }],
  };
  const validated = validateTranscript(response, "Google Gemini");
  if ("error" in validated) throw new Error(validated.details || validated.error);
  return validated;
}

function validateTranscript(response: TranscriptionResponse, provider: string): TranscriptionResponse | TranscriptionError {
  const text = String(response.text || "").trim();
  if (!text) return { error: "Invalid transcription response", code: "SERVICE_ERROR", details: `${provider} returned empty text` };
  const issue = transcriptQualityIssue(text, response.duration || 0);
  if (issue) {
    return {
      error: "Low-quality transcription response",
      code: "TRANSCRIPTION_FAILED",
      details: `${provider} rejected transcript: ${issue}`,
    };
  }
  return { ...response, text };
}

async function parseProviderResponse(response: Response, provider: string): Promise<TranscriptionResponse | TranscriptionError> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      error: "Transcription service request failed",
      code: "TRANSCRIPTION_FAILED",
      details: `${provider}: ${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`,
    };
  }
  const whisperResponse = await response.json() as WhisperResponse;
  if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
    return {
      error: "Invalid transcription response",
      code: "SERVICE_ERROR",
      details: `${provider} returned an invalid response format`,
    };
  }
  return validateTranscript(whisperResponse, provider);
}

async function transcribeWithGateway(
  audioBuffer: Buffer,
  options: TranscribeOptions,
): Promise<TranscriptionResponse> {
  const modelId = gatewayTranscriptionModel();
  const gatewayProvider = options.gatewayToken?.trim()
    ? createGateway({ apiKey: options.gatewayToken.trim() })
    : gateway;
  const result = await gatewayTranscribe({
    model: gatewayProvider.transcriptionModel(modelId),
    audio: audioBuffer,
    maxRetries: 1,
  });

  const response: TranscriptionResponse = {
    task: "transcribe",
    language: result.language || options.language || "th",
    duration: result.durationInSeconds || 0,
    text: result.text,
    segments: (result.segments ?? []).map((segment, index) => ({
      id: index,
      seek: 0,
      start: segment.startSecond,
      end: segment.endSecond,
      text: segment.text,
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 0,
      no_speech_prob: 0,
    })),
  };
  const validated = validateTranscript(response, "AI Gateway");
  if ("error" in validated) throw new Error(validated.details || validated.error);
  return validated;
}

export async function transcribeAudio(options: TranscribeOptions): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    const groqKey = (process.env.GROQ_API_KEY || "").trim();
    const googleConfigured = googleGeminiConfigured();
    const forgeConfigured = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
    const openAIKey = (process.env.OPENAI_API_KEY || "").trim();
    const gatewayConfigured = gatewayAuthAvailable(process.env, options.gatewayToken);
    const localConfigured = localVoiceRuntimeStatus().enabled;
    const failures: string[] = [];

    if (!groqKey && !localConfigured && !forgeConfigured && !openAIKey && !gatewayConfigured && !googleConfigured) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "Enable local STT or use Vercel AI Gateway/OIDC, AI_GATEWAY_API_KEY, Forge credentials, or OPENAI_API_KEY",
      };
    }

    let audioBuffer: Buffer;
    let mimeType: string;
    if (options.audioBuffer) {
      audioBuffer = Buffer.from(options.audioBuffer);
      mimeType = options.mimeType || "audio/m4a";
    } else if (options.audioUrl) {
      try {
        const response = await fetchWithTimeout(options.audioUrl, {}, 45_000);
        if (!response.ok) {
          return { error: "Failed to download audio file", code: "INVALID_FORMAT", details: `HTTP ${response.status}: ${response.statusText}` };
        }
        audioBuffer = Buffer.from(await response.arrayBuffer());
        mimeType = response.headers.get("content-type") || options.mimeType || "audio/mpeg";
      } catch (error) {
        return { error: "Failed to fetch audio file", code: "SERVICE_ERROR", details: error instanceof Error ? error.message : "Unknown error" };
      }
    } else {
      return { error: "Audio input is missing", code: "INVALID_FORMAT", details: "Provide audioBuffer or audioUrl" };
    }

    const sizeMB = audioBuffer.length / (1024 * 1024);
    if (sizeMB > 16) {
      return { error: "Audio file exceeds maximum size limit", code: "FILE_TOO_LARGE", details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB` };
    }

    // Use the explicitly configured Groq provider directly. Do not route a
    // failed request to another provider with different billing or data handling.
    if (googleGeminiConfigured()) {
      try {
        const result = await transcribeWithGoogleGemini(audioBuffer, options);
        console.info("[Milo Voice] transcription provider", { provider: "google-gemini", chars: result.text.length });
        return result;
      } catch (error) {
        failures.push(`google-gemini: ${error instanceof Error ? error.message : "failed"}`);
        console.warn("[Milo Voice] Google Gemini transcription failed; trying configured fallback", { error: error instanceof Error ? error.message : "unknown" });
      }
    }

    if (groqKey) {
      const form = makeFormData(audioBuffer, mimeType, options, "whisper-large-v3");
      form.set("temperature", "0");
      form.set("prompt", "รายการรายรับ รายจ่าย จำนวนเงิน บาท สตางค์");
      const response = await fetchWithTimeout("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST", headers: { authorization: `Bearer ${groqKey}` }, body: form,
      }, 60_000);
      return await parseProviderResponse(response, "groq");
    }

    // Prefer Gateway for short Thai LINE voice clips; tiny local Whisper remains
    // the offline fallback. This prevents known repetition hallucinations from
    // becoming the primary production result.
    if (gatewayConfigured) {
      try {
        const result = await transcribeWithGateway(audioBuffer, options);
        console.info("[Milo Voice] transcription provider", { provider: "vercel-ai-gateway", chars: result.text.length });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI Gateway transcription failed";
        failures.push(`gateway: ${message}`);
        console.warn("[Milo Voice] AI Gateway transcription failed; trying fallback", { error: message });
      }
    }

    if (forgeConfigured) {
      const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
      const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();
      try {
        const response = await callTranscriptionProvider(fullUrl, ENV.forgeApiKey, audioBuffer, mimeType, options);
        const parsed = await parseProviderResponse(response, "forge");
        if (!("error" in parsed)) {
          console.info("[Milo Voice] transcription provider", { provider: "forge", chars: parsed.text.length });
          return parsed;
        }
        failures.push(`forge: ${parsed.details || parsed.error}`);
      } catch (error) {
        failures.push(`forge: ${error instanceof Error ? error.message : "failed"}`);
      }
    }

    if (openAIKey) {
      try {
        const response = await callTranscriptionProvider("https://api.openai.com/v1/audio/transcriptions", openAIKey, audioBuffer, mimeType, options);
        const parsed = await parseProviderResponse(response, "openai");
        if (!("error" in parsed)) {
          console.info("[Milo Voice] transcription provider", { provider: "openai", chars: parsed.text.length });
          return parsed;
        }
        failures.push(`openai: ${parsed.details || parsed.error}`);
      } catch (error) {
        failures.push(`openai: ${error instanceof Error ? error.message : "failed"}`);
      }
    }

    if (localConfigured) {
      try {
        const result = await transcribeAudioLocal({ audioBuffer, language: options.language || "th" });
        const validated = validateTranscript(result, "local-whisper-onnx");
        if ("error" in validated) throw new Error(validated.details || validated.error);
        console.info("[Milo Voice] transcription provider", { provider: "local-whisper-onnx", chars: validated.text.length });
        return validated;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Local Whisper failed";
        failures.push(`local: ${message}`);
        console.warn("[Milo Voice] Local transcription failed", { error: message });
      }
    }

    return {
      error: "Transcription service request failed",
      code: "TRANSCRIPTION_FAILED",
      details: failures.join(" | ").slice(0, 1800) || "No transcription provider returned a usable transcript",
    };
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
