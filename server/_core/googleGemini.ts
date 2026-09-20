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

const PRIMARY_MULTIMODAL_MODEL = "gemini-3.6-flash";
const FALLBACK_MULTIMODAL_MODEL = "gemini-3.8-flash";

function uniqueModels(values: Array<string | undefined>) {
  return Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function googleGeminiModels(kind: "vision" | "audio" | "chat", env: NodeJS.ProcessEnv = process.env) {
  const configured = kind === "vision"
    ? env.MILO_GOOGLE_VISION_MODEL || env.MILO_VISION_MODEL
    : kind === "audio"
      ? env.MILO_GOOGLE_STT_MODEL || env.MILO_GEMINI_STT_MODEL
      : env.MILO_GOOGLE_CHAT_MODEL || env.MILO_GEMINI_CHAT_MODEL;
  return uniqueModels([configured, PRIMARY_MULTIMODAL_MODEL, FALLBACK_MULTIMODAL_MODEL]);
}

export function googleGeminiModel(kind: "vision" | "audio" | "chat", env: NodeJS.ProcessEnv = process.env) {
  return googleGeminiModels(kind, env)[0];
}

function responseError(payload: { error?: { message?: string }; promptFeedback?: { blockReason?: string } }, status: number, statusText: string) {
  return payload.error?.message || payload.promptFeedback?.blockReason || `Google Gemini returned HTTP ${status} ${statusText}`.trim();
}

export async function generateGoogleGeminiText(args: { prompt: string; system: string; timeoutMs?: number }): Promise<string> {
  const apiKey = googleGeminiApiKey();
  if (!apiKey) throw new Error("Google Gemini API key is not configured");
  const failures: string[] = [];
  for (const model of googleGeminiModels("chat")) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 20_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: args.system }] },
            contents: [{ role: "user", parts: [{ text: args.prompt.slice(0, 4000) }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
          }),
          signal: controller.signal,
        },
      );
      const payload = await response.json().catch(() => ({})) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>; error?: { message?: string }; promptFeedback?: { blockReason?: string } };
      if (!response.ok) throw new Error(responseError(payload, response.status, response.statusText));
      const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || "";
      if (!text) throw new Error(`empty content${payload.candidates?.[0]?.finishReason ? ` (${payload.candidates[0].finishReason})` : ""}`);
      return text.slice(0, 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      failures.push(`${model}: ${message}`);
      console.warn("[Milo Gemini] chat model failed; trying fallback", { model, error: message });
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Google Gemini text generation failed: ${failures.join(" | ").slice(0, 1600)}`);
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
      responseJsonSchema: args.schema,
    },
  };

  const failures: string[] = [];
  for (const model of googleGeminiModels(args.kind)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.kind === "audio" ? 60_000 : 45_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      const payload = await response.json().catch(() => ({})) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        error?: { message?: string };
        promptFeedback?: { blockReason?: string };
      };
      if (!response.ok) throw new Error(responseError(payload, response.status, response.statusText));
      const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
      if (!text) throw new Error(`empty content${payload.candidates?.[0]?.finishReason ? ` (${payload.candidates[0].finishReason})` : ""}`);
      return JSON.parse(text) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      failures.push(`${model}: ${message}`);
      console.warn("[Milo Gemini] structured model failed; trying fallback", { kind: args.kind, model, error: message });
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Google Gemini ${args.kind} generation failed: ${failures.join(" | ").slice(0, 1600)}`);
}
