import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { analyzeImageWithOcr, ocrAssetsReady } from "./ocrImageAnalysis";

export type ImageProposal = {
  kind: "reminder" | "expense" | "unknown";
  documentType: "appointment" | "receipt" | "bank_slip" | "unknown";
  title: string;
  merchant: string;
  dateText: string;
  timeText: string;
  amount: number;
  currency: string;
  category: string;
  paymentMethod: string;
  receiptNumber: string;
  lineItems: string[];
  note: string;
};

export type ImageAnalysis = {
  summary: string;
  confidence: number;
  proposals: ImageProposal[];
};

const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    confidence: { type: "number" },
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["reminder", "expense", "unknown"] },
          documentType: { type: "string", enum: ["appointment", "receipt", "bank_slip", "unknown"] },
          title: { type: "string" },
          merchant: { type: "string" },
          dateText: { type: "string" },
          timeText: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string" },
          category: { type: "string" },
          paymentMethod: { type: "string" },
          receiptNumber: { type: "string" },
          lineItems: { type: "array", items: { type: "string" } },
          note: { type: "string" },
        },
        required: ["kind", "documentType", "title", "merchant", "dateText", "timeText", "amount", "currency", "category", "paymentMethod", "receiptNumber", "lineItems", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "confidence", "proposals"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = "คุณคือไมโล ผู้ช่วยภาษาไทย อ่านภาพใบนัด ตาราง สลิปโอนเงิน และใบเสร็จอย่างระมัดระวัง คืน JSON ตาม schema เท่านั้น ห้ามเดาหรือแต่งข้อความ/ตัวเลขที่อ่านไม่ชัด สำหรับสลิปให้ใช้ยอดโอนจริง ไม่ใช้ยอดคงเหลือหรือค่าธรรมเนียม สำหรับใบเสร็จให้ใช้ยอดรวมสุทธิที่ชำระแล้ว หากวันที่อ่านได้แน่ชัดให้ส่ง dateText รูปแบบ YYYY-MM-DD มิฉะนั้นเป็นสตริงว่าง สำหรับค่าใช้จ่ายให้แยก merchant, paymentMethod, receiptNumber, รายการสำคัญ และเลือก category ภาษาไทยจาก อาหาร, เดินทาง, ค่าสาธารณูปโภค, สุขภาพ, การศึกษา, บันเทิง, ช้อปปิ้ง, ท่องเที่ยว, ทั่วไป หากไม่พบข้อมูลที่บันทึกได้ให้ใช้ kind=unknown และ amount=0";
const USER_PROMPT = "วิเคราะห์ภาพเพื่อหาใบนัดหรือธุรกรรมค่าใช้จ่ายจากสลิป/ใบเสร็จ โดยเสนอข้อมูลเพื่อให้ผู้ใช้ยืนยันก่อนบันทึกเท่านั้น";

function parseAnalysisContent(content: unknown): ImageAnalysis {
  if (typeof content !== "string" || !content.trim()) throw new Error("Image model did not return JSON");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const json = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
  const parsed = JSON.parse(json) as ImageAnalysis;
  if (!parsed || !Array.isArray(parsed.proposals) || typeof parsed.summary !== "string") throw new Error("Image model returned an invalid analysis");
  return parsed;
}

async function analyzeImageWithForge(dataUrl: string): Promise<ImageAnalysis> {
  const response = await invokeLLM({
    model: ENV.visionModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_image_analysis", strict: true, schema } },
  });
  return parseAnalysisContent(response.choices[0]?.message.content);
}

async function gatewayRequest(dataUrl: string, token: string, structured: boolean) {
  const body: Record<string, unknown> = {
    model: process.env.MILO_VISION_MODEL || "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    stream: false,
    temperature: 0,
  };
  if (structured) body.response_format = { type: "json_schema", json_schema: { name: "milo_image_analysis", strict: true, schema } };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(payload.error?.message || `AI Gateway returned HTTP ${response.status}`);
    return parseAnalysisContent(payload.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeImageWithGatewayKey(dataUrl: string, token: string): Promise<ImageAnalysis> {
  try {
    return await gatewayRequest(dataUrl, token, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/response.?format|json.?schema|structured/i.test(message)) return gatewayRequest(dataUrl, token, false);
    throw error;
  }
}

export function imageAnalysisMode() {
  if (ENV.forgeApiKey) return ocrAssetsReady() ? "forge-vision+ocr-fallback" : "forge-vision";
  if ((process.env.AI_GATEWAY_API_KEY || "").trim()) return ocrAssetsReady() ? "vercel-ai-gateway-key+ocr-fallback" : "vercel-ai-gateway-key";
  return ocrAssetsReady() ? "ocr-fallback" : "unconfigured";
}

export async function imageAnalysisRuntimeStatus() {
  const mode = imageAnalysisMode();
  return {
    mode,
    authenticated: Boolean(ENV.forgeApiKey || (process.env.AI_GATEWAY_API_KEY || "").trim() || ocrAssetsReady()),
    ocrAssetsReady: ocrAssetsReady(),
  };
}

export async function analyzeImage(dataUrl: string): Promise<ImageAnalysis> {
  if (ENV.forgeApiKey) {
    try {
      return await analyzeImageWithForge(dataUrl);
    } catch (error) {
      console.warn("[Milo Image] primary vision provider failed; using local OCR fallback", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const gatewayKey = (process.env.AI_GATEWAY_API_KEY || "").trim();
  if (gatewayKey) {
    try {
      return await analyzeImageWithGatewayKey(dataUrl, gatewayKey);
    } catch (error) {
      console.warn("[Milo Image] AI Gateway failed; using local OCR fallback", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return analyzeImageWithOcr(dataUrl);
}
