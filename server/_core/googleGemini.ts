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

export async function generateGoogleGeminiText(args: { prompt: string; system: string; timeoutMs?: number }): Promise<string> {
  const apiKey = googleGeminiApiKey();
  if (!apiKey) throw new Error("Google Gemini API key is not configured");
  const model = chatModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 20_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.system }] },
          contents: [{ role: "user", parts: [{ text: args.prompt.slice(0, 4000) }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
        }),
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => ({})) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || `Google Gemini returned HTTP ${response.status}`);
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || "";
    if (!text) throw new Error("Google Gemini returned empty content");
    return text.slice(0, 5000);
  } finally {
    clearTimeout(timeout);
  }
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
