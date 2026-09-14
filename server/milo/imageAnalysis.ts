import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { analyzeImageWithOcr, ocrAssetsReady } from "./ocrImageAnalysis";
import { normalizeThaiMerchantName } from "./thaiReceiptParser";

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

const SYSTEM_PROMPT = "คุณคือไมโล ผู้ช่วยภาษาไทย อ่านภาพใบนัด ตาราง สลิปโอนเงิน และใบเสร็จอย่างระมัดระวัง คืน JSON ตาม schema เท่านั้น ห้ามเดาหรือแต่งข้อความ/ตัวเลขที่อ่านไม่ชัด สำหรับสลิปให้ใช้ยอดโอนจริง ไม่ใช้ยอดคงเหลือหรือค่าธรรมเนียม สำหรับใบเสร็จให้ใช้ยอดที่จ่ายจริงหลังส่วนลดหรือสิทธิช่วยเหลือ โดยให้ความสำคัญกับช่อง จำนวนเงินที่ชำระ, ยอดที่ชำระ, ยอดสุทธิ มากกว่าค่าสินค้า/บริการก่อนส่วนลด หากวันที่อ่านได้แน่ชัดให้ส่ง dateText รูปแบบ YYYY-MM-DD มิฉะนั้นเป็นสตริงว่าง สำหรับค่าใช้จ่ายให้แยก merchant แบบชื่อร้านจริงเท่านั้น ไม่รวมรายการสินค้า/ส่วนลด/ยอดเงิน, paymentMethod, receiptNumber, lineItems รายการสำคัญ และเลือก category ภาษาไทยจาก อาหาร, เดินทาง, ค่าสาธารณูปโภค, สุขภาพ, การศึกษา, บันเทิง, ช้อปปิ้ง, ท่องเที่ยว, ทั่วไป หากไม่พบข้อมูลที่บันทึกได้ให้ใช้ kind=unknown และ amount=0";
const USER_PROMPT = "วิเคราะห์ภาพเพื่อหาใบนัดหรือธุรกรรมค่าใช้จ่ายจากสลิป/ใบเสร็จ โดยเสนอข้อมูลเพื่อให้ผู้ใช้ยืนยันก่อนบันทึกเท่านั้น";
const RECEIPT_REPAIR_PROMPT = "ตรวจภาพซ้ำอย่างละเอียดโดยโฟกัสเฉพาะวันที่ วัน/เดือน/ปี เวลา และชื่อร้าน/ผู้รับเงินที่พิมพ์อยู่บนเอกสารจริง โดยเฉพาะข้อความตัวเล็กบริเวณส่วนบนของใบเสร็จ ห้ามใช้วันที่ปัจจุบันหรือเดา หากเห็นวันที่ไทย เช่น 14 ก.ย. 2569 ให้แปลงเป็น 2026-09-14 คืน JSON ตาม schema เดิม ฟิลด์ที่อ่านไม่ได้ให้เป็นค่าว่าง";

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

async function gatewayRequest(dataUrl: string, token: string, structured: boolean, userPrompt = USER_PROMPT) {
  const body: Record<string, unknown> = {
    model: process.env.MILO_VISION_MODEL || "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
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

async function analyzeImageWithGatewayKey(dataUrl: string, token: string, userPrompt = USER_PROMPT): Promise<ImageAnalysis> {
  try {
    return await gatewayRequest(dataUrl, token, true, userPrompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/response.?format|json.?schema|structured/i.test(message)) return gatewayRequest(dataUrl, token, false, userPrompt);
    throw error;
  }
}

export function imageGatewayToken(env: NodeJS.ProcessEnv = process.env, requestToken?: string) {
  return (env.AI_GATEWAY_API_KEY || requestToken || env.VERCEL_OIDC_TOKEN || "").trim();
}

function imageGatewayMode(env: NodeJS.ProcessEnv = process.env, requestToken?: string) {
  if ((env.AI_GATEWAY_API_KEY || "").trim()) return "vercel-ai-gateway-key";
  if ((env.VERCEL_OIDC_TOKEN || "").trim() || requestToken?.trim()) return "vercel-ai-gateway-oidc";
  return undefined;
}

export function imageAnalysisMode(requestToken?: string) {
  if (ENV.forgeApiKey) return ocrAssetsReady() ? "forge-vision+ocr-fallback" : "forge-vision";
  const gatewayMode = imageGatewayMode(process.env, requestToken);
  if (gatewayMode) return ocrAssetsReady() ? `${gatewayMode}+ocr-fallback` : gatewayMode;
  return ocrAssetsReady() ? "ocr-fallback" : "unconfigured";
}

export async function imageAnalysisRuntimeStatus(requestToken?: string) {
  const mode = imageAnalysisMode(requestToken);
  return {
    mode,
    authenticated: Boolean(ENV.forgeApiKey || imageGatewayToken(process.env, requestToken) || ocrAssetsReady()),
    ocrAssetsReady: ocrAssetsReady(),
  };
}

function merchantQuality(value: string) {
  const candidate = normalizeThaiMerchantName(value);
  if (!candidate) return -100;
  let score = Math.min(candidate.length, 80);
  if (/(ค่าสินค้า|บริการ|จำนวนเงิน|ยอด|ส่วนลด|สิทธิ|บาท|ค่าธรรมเนียม)/i.test(candidate)) score -= 80;
  if (/ร้าน|บจก|บริษัท|หจก|cj\b|cafe|amazon|อเมซอน/i.test(candidate)) score += 20;
  return score;
}

export function mergeImageAnalyses(primary: ImageAnalysis, ocr: ImageAnalysis): ImageAnalysis {
  const p = primary.proposals[0];
  const o = ocr.proposals[0];
  if (!p) return ocr;
  if (!o) return primary;

  const documentType = p.documentType !== "unknown" ? p.documentType : o.documentType;
  const preferOcrAmount = o.amount > 0 && (p.amount <= 0 || (documentType === "receipt" && o.amount !== p.amount));
  const amount = preferOcrAmount ? o.amount : (p.amount || o.amount);
  const primaryMerchant = normalizeThaiMerchantName(p.merchant);
  const ocrMerchant = normalizeThaiMerchantName(o.merchant);
  const merchant = merchantQuality(ocrMerchant) >= merchantQuality(primaryMerchant) ? ocrMerchant : primaryMerchant;

  const merged: ImageProposal = {
    ...p,
    kind: (p.kind === "expense" || o.kind === "expense") && amount > 0 ? "expense" : p.kind,
    documentType,
    merchant,
    dateText: p.dateText || o.dateText,
    timeText: p.timeText || o.timeText,
    amount,
    currency: p.currency || o.currency || "บาท",
    category: p.category && p.category !== "ทั่วไป" ? p.category : o.category,
    paymentMethod: p.paymentMethod || o.paymentMethod,
    receiptNumber: p.receiptNumber || o.receiptNumber,
    lineItems: Array.from(new Set([...(p.lineItems || []), ...(o.lineItems || [])])).slice(0, 10),
    note: p.note || o.note,
    title: documentType === "bank_slip" && o.title === "รายการโอนเงิน" && !o.note
      ? o.title
      : (p.title && p.title !== "ข้อมูลจากรูป" ? p.title : (o.title || p.title)),
  };

  const summary = merged.kind === "expense"
    ? `อ่าน${merged.documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ"}ได้ ยอด ${merged.amount.toLocaleString("th-TH")} บาท${merged.dateText ? ` วันที่ ${merged.dateText}` : " แต่วันที่ยังไม่ชัด"}`
    : primary.summary || ocr.summary;

  return { summary, confidence: Math.max(primary.confidence, ocr.confidence), proposals: [merged, ...primary.proposals.slice(1)] };
}

function mergeFocusedDateRepair(base: ImageAnalysis, repair: ImageAnalysis) {
  const b = base.proposals[0];
  const r = repair.proposals[0];
  if (!b || !r?.dateText) return base;
  return {
    ...base,
    summary: b.kind === "expense"
      ? `อ่าน${b.documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ"}ได้ ยอด ${b.amount.toLocaleString("th-TH")} บาท วันที่ ${r.dateText}`
      : base.summary,
    confidence: Math.max(base.confidence, repair.confidence),
    proposals: [{
      ...b,
      dateText: r.dateText,
      timeText: b.timeText || r.timeText,
      receiptNumber: b.receiptNumber || r.receiptNumber,
    }, ...base.proposals.slice(1)],
  };
}

export async function analyzeImage(dataUrl: string, options: { gatewayToken?: string } = {}): Promise<ImageAnalysis> {
  let providerError: unknown;
  let providerAnalysis: ImageAnalysis | undefined;

  if (ENV.forgeApiKey) {
    try {
      const analysis = await analyzeImageWithForge(dataUrl);
      if (analysis.proposals.some(item => item.kind === "reminder" && Boolean(item.dateText))) return analysis;
      providerAnalysis = analysis;
      console.warn("[Milo Image] primary vision provider returned no actionable proposal; trying OCR enrichment");
    } catch (error) {
      providerError = error;
      console.warn("[Milo Image] primary vision provider failed; using local OCR fallback", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const gatewayKey = imageGatewayToken(process.env, options.gatewayToken);
  if (gatewayKey) {
    try {
      const analysis = await analyzeImageWithGatewayKey(dataUrl, gatewayKey);
      if (analysis.proposals.some(item => item.kind === "reminder" && Boolean(item.dateText))) return analysis;
      providerAnalysis = analysis;
      console.warn("[Milo Image] AI Gateway returned no actionable proposal; trying OCR enrichment");
    } catch (error) {
      providerError = error;
      console.warn("[Milo Image] AI Gateway failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  try {
    const ocrAnalysis = await analyzeImageWithOcr(dataUrl);
    if (!providerAnalysis) return ocrAnalysis;

    const score = (analysis: ImageAnalysis) => analysis.proposals.reduce((total, item) => total
      + (item.kind === "expense" && item.amount > 0 ? 6 : 0)
      + (item.kind === "reminder" && item.dateText ? 5 : 0)
      + (item.documentType !== "unknown" ? 1 : 0)
      + (item.dateText ? 1 : 0)
      + (item.merchant ? 0.5 : 0), analysis.confidence);

    let merged = mergeImageAnalyses(providerAnalysis, ocrAnalysis);
    let selected = score(merged) >= Math.max(score(ocrAnalysis), score(providerAnalysis))
      ? merged
      : (score(ocrAnalysis) > score(providerAnalysis) ? ocrAnalysis : providerAnalysis);

    const selectedProposal = selected.proposals[0];
    if (gatewayKey && selectedProposal?.kind === "expense" && !selectedProposal.dateText && selectedProposal.timeText) {
      try {
        const repair = await analyzeImageWithGatewayKey(dataUrl, gatewayKey, RECEIPT_REPAIR_PROMPT);
        selected = mergeFocusedDateRepair(selected, repair);
      } catch (repairError) {
        console.warn("[Milo Image] focused receipt date repair failed", {
          error: repairError instanceof Error ? repairError.message : "unknown",
        });
      }
    }

    return selected;
  } catch (ocrError) {
    console.error("[Milo Image] OCR fallback failed", { error: ocrError instanceof Error ? ocrError.message : "unknown" });
    if (providerAnalysis) return providerAnalysis;
    if (providerError) {
      const providerMessage = providerError instanceof Error ? providerError.message : "unknown provider error";
      const ocrMessage = ocrError instanceof Error ? ocrError.message : "unknown OCR error";
      throw new Error(`Vision provider failed: ${providerMessage}; OCR fallback failed: ${ocrMessage}`);
    }
    throw ocrError;
  }
}
