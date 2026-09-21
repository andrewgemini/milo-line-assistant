import { Buffer } from "node:buffer";

export function googleGeminiApiKey(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.GEMINI_API_KEY ||
    env.GOOGLE_GEMINI_API_KEY ||
    env.GOOGLE_API_KEY ||
    env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ""
  ).trim();
}

export function googleGeminiConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(googleGeminiApiKey(env));
}

function modelFor(kind: "vision" | "audio", env: NodeJS.ProcessEnv = process.env) {
  return (
    kind === "vision"
      ? env.MILO_GOOGLE_VISION_MODEL || env.MILO_VISION_MODEL || "gemini-3.8-flash"
      : env.MILO_GOOGLE_STT_MODEL || "gemini-3.5-transcribe"
  ).trim();
}

function chatModel(env: NodeJS.ProcessEnv = process.env) {
  return (env.MILO_GOOGLE_CHAT_MODEL || env.MILO_GEMINI_CHAT_MODEL || "gemini-3.8-flash").trim();
}

type GeminiTransientError = Error & { status?: number; transient?: boolean };

const geminiChatCooldownUntil = new Map<string, number>();

function chatFallbackModel(env: NodeJS.ProcessEnv = process.env) {
  return (env.MILO_GOOGLE_CHAT_FALLBACK_MODEL || "gemini-3.7-flash").trim();
}

function isTransientGeminiStatus(status: number) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /aborted|timeout/i.test(error.message));
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function requestGeminiText(model: string, args: { prompt: string; system: string; timeoutMs: number; apiKey: string }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.system }] },
          contents: [{ role: "user", parts: [{ text: args.prompt.slice(0, 4000) }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 700,
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => ({})) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      const error = new Error(payload.error?.message || `Google Gemini returned HTTP ${response.status}`) as GeminiTransientError;
      error.status = response.status;
      error.transient = isTransientGeminiStatus(response.status);
      throw error;
    }
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || "";
    if (!text) throw new Error("Google Gemini returned empty content");
    return text.slice(0, 5000);
  } catch (error) {
    if (isAbortError(error)) {
      const timeoutError = new Error(`Google Gemini request timed out after ${args.timeoutMs}ms`) as GeminiTransientError;
      timeoutError.transient = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateGoogleGeminiText(args: { prompt: string; system: string; timeoutMs?: number }): Promise<string> {
  const apiKey = googleGeminiApiKey();
  if (!apiKey) throw new Error("Google Gemini API key is not configured");

  const primary = chatModel();
  const fallback = chatFallbackModel();
  const models = [primary, fallback].filter((model, index, all) => model && all.indexOf(model) === index);
  const requestedTimeout = args.timeoutMs ?? Number(process.env.MILO_GOOGLE_CHAT_TIMEOUT_MS || 7_500);
  const perAttemptTimeout = Math.max(3_500, Math.min(requestedTimeout, 9_000));

  let lastError: unknown;
  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    const cooldown = geminiChatCooldownUntil.get(model) ?? 0;
    if (cooldown > Date.now() && index === 0 && models.length > 1) {
      console.warn("[Milo Gemini Chat] primary model cooling down", { model, cooldownMs: cooldown - Date.now() });
      continue;
    }

    try {
      console.info("[Milo Gemini Chat] request", { model, attempt: index + 1, timeoutMs: perAttemptTimeout });
      const text = await requestGeminiText(model, { ...args, timeoutMs: perAttemptTimeout, apiKey });
      geminiChatCooldownUntil.delete(model);
      console.info("[Milo Gemini Chat] success", { model, attempt: index + 1 });
      return text;
    } catch (error) {
      lastError = error;
      const transient = (error as GeminiTransientError)?.transient === true;
      console.warn("[Milo Gemini Chat] attempt failed", {
        model,
        attempt: index + 1,
        status: (error as GeminiTransientError)?.status,
        transient,
        message: error instanceof Error ? error.message : "unknown",
      });
      if (!transient) throw error;

      geminiChatCooldownUntil.set(model, Date.now() + 15_000);
      if (index < models.length - 1) {
        await sleep(250 + Math.floor(Math.random() * 350));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Google Gemini chat failed");
}

export async function generateGoogleGeminiJson<T>(args: {
  prompt: string;
  system?: string;
  imageDataUrl?: string;
  audioBuffer?: Buffer;
  audioMimeType?: string;
  schema: unknown;
  kind: "vision" | "audio";
  language?: string;
}): Promise<T> {
  const apiKey = googleGeminiApiKey();
  if (!apiKey) throw new Error("Google Gemini API key is not configured");

  const model = modelFor(args.kind);
  const parts: Array<Record<string, unknown>> = [{ text: args.prompt }];

  if (args.imageDataUrl) {
    const match = args.imageDataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) throw new Error("Invalid image data URL");
    parts.push({
      inlineData: {
        mimeType: match[1],
        data: match[2],
      },
    });
  }

  if (args.audioBuffer) {
    parts.push({
      inlineData: {
        mimeType: args.audioMimeType || "audio/m4a",
        data: args.audioBuffer.toString("base64"),
      },
    });
  }

  const body = {
    systemInstruction: args.system ? { parts: [{ text: args.system }] } : undefined,
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: args.schema,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.kind === "audio" ? 60_000 : 45_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => ({})) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message || `Google Gemini returned HTTP ${response.status}`);
    }
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    if (!text) throw new Error("Google Gemini returned empty content");
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}
