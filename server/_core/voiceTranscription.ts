/**
 * Voice transcription helper with provider fallback.
 * Forge Whisper remains primary when configured; OpenAI Whisper is used as a
 * secondary provider when OPENAI_API_KEY is available.
 */
import { gateway, transcribe as gatewayTranscribe } from "ai";
import { ENV } from "./env";

export type TranscribeOptions = {
  audioUrl?: string;
  audioBuffer?: Buffer | Uint8Array;
  mimeType?: string;
  language?: string;
  prompt?: string;
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

function gatewayAuthAvailable() {
  return Boolean(
    (process.env.AI_GATEWAY_API_KEY || "").trim() ||
    (process.env.VERCEL_OIDC_TOKEN || "").trim() ||
    process.env.VERCEL ||
    process.env.VERCEL_ENV
  );
}

export function voiceTranscriptionRuntimeStatus() {
  const forge = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  const openai = Boolean((process.env.OPENAI_API_KEY || "").trim());
  const gatewayAvailable = gatewayAuthAvailable();
  return {
    configured: forge || openai || gatewayAvailable,
    mode: forge
      ? "forge-whisper"
      : openai
        ? "openai-whisper"
        : gatewayAvailable
          ? "vercel-ai-gateway-stt"
          : "unconfigured",
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

function makeFormData(audioBuffer: Buffer, mimeType: string, options: TranscribeOptions) {
  const formData = new FormData();
  const filename = `audio.${getFileExtension(mimeType)}`;
  const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append("file", audioBlob, filename);
  formData.append("model", "whisper-1");
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
  return whisperResponse;
}

async function transcribeWithGateway(
  audioBuffer: Buffer,
  options: TranscribeOptions,
): Promise<TranscriptionResponse> {
  const modelId = (process.env.MILO_STT_MODEL || "fish-audio/transcribe-1-free").trim();
  const result = await gatewayTranscribe({
    model: gateway.transcriptionModel(modelId),
    audio: audioBuffer,
    maxRetries: 1,
  });

  return {
    task: "transcribe",
    language: result.language || options.language || "th",
    duration: result.durationInSeconds || 0,
    text: result.text,
    segments: result.segments.map((segment, index) => ({
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
}

export async function transcribeAudio(options: TranscribeOptions): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    const forgeConfigured = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
    const openAIKey = (process.env.OPENAI_API_KEY || "").trim();
    const gatewayConfigured = gatewayAuthAvailable();

    if (!forgeConfigured && !openAIKey && !gatewayConfigured) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "Use Vercel AI Gateway/OIDC, AI_GATEWAY_API_KEY, Forge credentials, or OPENAI_API_KEY",
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
          return {
            error: "Failed to download audio file",
            code: "INVALID_FORMAT",
            details: `HTTP ${response.status}: ${response.statusText}`,
          };
        }
        audioBuffer = Buffer.from(await response.arrayBuffer());
        mimeType = response.headers.get("content-type") || options.mimeType || "audio/mpeg";
      } catch (error) {
        return {
          error: "Failed to fetch audio file",
          code: "SERVICE_ERROR",
          details: error instanceof Error ? error.message : "Unknown error",
        };
      }
    } else {
      return {
        error: "Audio input is missing",
        code: "INVALID_FORMAT",
        details: "Provide audioBuffer or audioUrl",
      };
    }

    const sizeMB = audioBuffer.length / (1024 * 1024);
    if (sizeMB > 16) {
      return {
        error: "Audio file exceeds maximum size limit",
        code: "FILE_TOO_LARGE",
        details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`,
      };
    }

    if (forgeConfigured) {
      const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
      const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();
      try {
        const response = await callTranscriptionProvider(fullUrl, ENV.forgeApiKey, audioBuffer, mimeType, options);
        const parsed = await parseProviderResponse(response, "forge");
        if (!("error" in parsed) || (!gatewayConfigured && !openAIKey)) return parsed;
        console.warn("[Milo Voice] Forge transcription failed; trying fallback provider", { status: response.status });
      } catch (error) {
        if (!gatewayConfigured && !openAIKey) {
          return {
            error: "Transcription service request failed",
            code: "TRANSCRIPTION_FAILED",
            details: error instanceof Error ? error.message : "Forge transcription failed",
          };
        }
        console.warn("[Milo Voice] Forge transcription unavailable; trying fallback provider", {
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    if (gatewayConfigured) {
      try {
        return await transcribeWithGateway(audioBuffer, options);
      } catch (error) {
        console.warn("[Milo Voice] AI Gateway transcription failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
        if (!openAIKey) {
          return {
            error: "Transcription service request failed",
            code: "TRANSCRIPTION_FAILED",
            details: error instanceof Error ? error.message : "AI Gateway transcription failed",
          };
        }
      }
    }

    if (openAIKey) {
      try {
        const response = await callTranscriptionProvider(
          "https://api.openai.com/v1/audio/transcriptions",
          openAIKey,
          audioBuffer,
          mimeType,
          options,
        );
        return parseProviderResponse(response, "openai");
      } catch (error) {
        return {
          error: "Transcription service request failed",
          code: "TRANSCRIPTION_FAILED",
          details: error instanceof Error ? error.message : "OpenAI transcription failed",
        };
      }
    }

    return {
      error: "Voice transcription service is not configured",
      code: "SERVICE_ERROR",
      details: "No transcription provider is available",
    };
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
