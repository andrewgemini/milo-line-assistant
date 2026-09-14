import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { analyzeImageWithOcr, buildReceiptHeaderDataUrl, ocrAssetsReady } from "./ocrImageAnalysis";
import { extractThaiSlipDateTime, normalizeThaiMerchantName } from "./thaiReceiptParser";

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

type ReceiptDateRepair = { dateText: string; timeText: string; evidence: string };

const receiptDateSchema = {
  type: "object",
  properties: {
    dateText: { type: "string" },
    timeText: { type: "string" },
    evidence: { type: "string" },
  },
  required: ["dateText", "timeText", "evidence"],
  additionalProperties: false,
} as const;

function parseReceiptDateRepairContent(content: unknown): ReceiptDateRepair {
  if (typeof content !== "string" || !content.trim()) throw new Error("Receipt date repair returned empty content");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const json = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
  const parsed = JSON.parse(json) as Partial<ReceiptDateRepair>;
  const rawDate = String(parsed.dateText || "").trim();
  const rawTime = String(parsed.timeText || "").trim();
  const evidence = String(parsed.evidence || "").trim();
  const dt = extractThaiSlipDateTime([rawDate, rawTime, evidence].filter(Boolean).join(" "));
  return {
    dateText: /^20\d{2}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : dt.dateText,
    timeText: /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : dt.timeText,
    evidence,
  };
}

async function receiptDateRepairRequest(dataUrl: string, token: string): Promise<ReceiptDateRepair> {
  const body: Record<string, unknown> = {
    model: process.env.MILO_VISION_MODEL || "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: "à¸„à¸¸à¸“à¹€à¸›à¹‡à¸™ OCR verifier à¸ªà¸³à¸«à¸£à¸±à¸šà¹ƒà¸šà¹€à¸ªà¸£à¹‡à¸ˆà¹„à¸—à¸¢ à¸‡à¸²à¸™à¹€à¸”à¸µà¸¢à¸§à¸„à¸·à¸­à¸­à¹ˆà¸²à¸™à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸§à¸±à¸™à¸—à¸³à¸£à¸²à¸¢à¸à¸²à¸£à¹à¸¥à¸°à¹€à¸§à¸¥à¸²à¸—à¸µà¹ˆà¸žà¸´à¸¡à¸žà¹Œà¸­à¸¢à¸¹à¹ˆà¹ƒà¸™à¸ à¸²à¸žà¸ˆà¸£à¸´à¸‡ à¸«à¹‰à¸²à¸¡à¹€à¸”à¸²à¸ˆà¸²à¸à¹€à¸§à¸¥à¸²à¸ªà¹ˆà¸‡à¸£à¸¹à¸› à¸§à¸±à¸™à¸—à¸µà¹ˆà¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™ à¸«à¸£à¸·à¸­à¸šà¸£à¸´à¸šà¸—à¸­à¸·à¹ˆà¸™ à¸–à¹‰à¸²à¸­à¹ˆà¸²à¸™à¸§à¸±à¸™à¹€à¸”à¸·à¸­à¸™à¸›à¸µà¹„à¸¡à¹ˆà¸Šà¸±à¸”à¹ƒà¸«à¹‰ dateText à¹€à¸›à¹‡à¸™à¸ªà¸•à¸£à¸´à¸‡à¸§à¹ˆà¸²à¸‡ à¸–à¹‰à¸²à¸­à¹ˆà¸²à¸™à¹€à¸§à¸¥à¸²à¹„à¸¡à¹ˆà¸Šà¸±à¸”à¹ƒà¸«à¹‰ timeText à¹€à¸›à¹‡à¸™à¸ªà¸•à¸£à¸´à¸‡à¸§à¹ˆà¸²à¸‡ dateText à¸•à¹‰à¸­à¸‡à¹€à¸›à¹‡à¸™ YYYY-MM-DD à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ à¹à¸¥à¸° evidence à¹ƒà¸«à¹‰à¸„à¸±à¸”à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸ªà¸±à¹‰à¸™à¹† à¸—à¸µà¹ˆà¸¡à¸­à¸‡à¹€à¸«à¹‡à¸™à¸‹à¸¶à¹ˆà¸‡à¸£à¸­à¸‡à¸£à¸±à¸šà¸§à¸±à¸™à¸—à¸µà¹ˆ/à¹€à¸§à¸¥à¸²" },
      { role: "user", content: [{ type: "text", text: "à¸•à¸£à¸§à¸ˆà¹€à¸‰à¸žà¸²à¸°à¸§à¸±à¸™à¸—à¸³à¸£à¸²à¸¢à¸à¸²à¸£à¹à¸¥à¸°à¹€à¸§à¸¥à¸²à¹ƒà¸™à¹€à¸­à¸à¸ªà¸²à¸£à¸™à¸µà¹‰ à¸¡à¸­à¸‡à¸—à¸±à¹‰à¸‡à¸«à¸±à¸§à¹€à¸­à¸à¸ªà¸²à¸£ à¸šà¸£à¸£à¸—à¸±à¸”à¹ƒà¸à¸¥à¹‰à¸„à¸³à¸§à¹ˆà¸² à¸—à¸³à¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸³à¹€à¸£à¹‡à¸ˆ/à¸§à¸±à¸™à¸—à¸µà¹ˆ/à¹€à¸§à¸¥à¸² à¹à¸¥à¸°à¸šà¸£à¸´à¹€à¸§à¸“à¸£à¸­à¸šà¸¢à¸­à¸”à¹€à¸‡à¸´à¸™ à¸§à¸±à¸™à¸—à¸µà¹ˆà¸­à¸²à¸ˆà¹€à¸›à¹‡à¸™ à¸ž.à¸¨. à¹€à¸Šà¹ˆà¸™ 14 à¸.à¸¢. 2569, 14 à¸à¸±à¸™à¸¢à¸²à¸¢à¸™ 2569, 14/09/2569, 14.09.69 à¸«à¸²à¸à¸¡à¸­à¸‡à¹„à¸¡à¹ˆà¹€à¸«à¹‡à¸™à¸§à¸±à¸™à¹€à¸”à¸·à¸­à¸™à¸›à¸µà¸ˆà¸£à¸´à¸‡à¹ƒà¸«à¹‰à¸„à¸·à¸™ dateText à¸§à¹ˆà¸²à¸‡" }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] },
    ],
    stream: false,
    temperature: 0,
    response_format: { type: "json_schema", json_schema: { name: "milo_receipt_date_repair", strict: true, schema: receiptDateSchema } },
  };
  const run = async (structured: boolean) => {
    const requestBody = { ...body };
    if (!structured) delete (requestBody as any).response_format;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || `AI Gateway returned HTTP ${response.status}`);
      return parseReceiptDateRepairContent(payload.choices?.[0]?.message?.content);
    } finally {
      clearTimeout(timeout);
    }
  };
  try {
    return await run(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/response.?format|json.?schema|structured|invalid.*schema/i.test(message)) return run(false);
    throw error;
  }
}

function mergeDedicatedDateRepair(base: ImageAnalysis, repair: ReceiptDateRepair) {
  const b = base.proposals[0];
  if (!b || !repair.dateText) return base;
  return {
    ...base,
    summary: b.kind === "expense"
      ? `à¸­à¹ˆà¸²à¸™${b.documentType === "bank_slip" ? "à¸ªà¸¥à¸´à¸›" : "à¹ƒà¸šà¹€à¸ªà¸£à¹‡à¸ˆ"}à¹„à¸”à¹‰ à¸¢à¸­à¸” ${b.amount.toLocaleString("th-TH")} à¸šà¸²à¸— à¸§à¸±à¸™à¸—à¸µà¹ˆ ${repair.dateText}`
      : base.summary,
    confidence: Math.max(base.confidence, 0.9),
    proposals: [{ ...b, dateText: repair.dateText, timeText: b.timeText || repair.timeText }, ...base.proposals.slice(1)],
  };
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
    if (!providerAnalysis) {
      let selected = ocrAnalysis;
      const proposal = selected.proposals[0];
      if (gatewayKey && proposal?.kind === "expense" && !proposal.dateText && proposal.timeText) {
        try {
          const headerDataUrl = await buildReceiptHeaderDataUrl(dataUrl).catch(() => dataUrl);
          const repair = await receiptDateRepairRequest(headerDataUrl, gatewayKey);
          console.info("[Milo Image] focused date repair", { dateText: repair.dateText, timeText: repair.timeText, evidence: repair.evidence.slice(0, 120) });
          selected = mergeDedicatedDateRepair(selected, repair);
          if (!selected.proposals[0]?.dateText && headerDataUrl !== dataUrl) {
            const fullRepair = await receiptDateRepairRequest(dataUrl, gatewayKey);
            console.info("[Milo Image] full-image date repair", { dateText: fullRepair.dateText, timeText: fullRepair.timeText, evidence: fullRepair.evidence.slice(0, 120) });
            selected = mergeDedicatedDateRepair(selected, fullRepair);
          }
        } catch (repairError) {
          console.warn("[Milo Image] OCR-only focused receipt date repair failed", {
            error: repairError instanceof Error ? repairError.message : "unknown",
          });
        }
      }
      return selected;
    }

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
        const headerDataUrl = await buildReceiptHeaderDataUrl(dataUrl).catch(() => dataUrl);
        const repair = await receiptDateRepairRequest(headerDataUrl, gatewayKey);
          console.info("[Milo Image] focused date repair", { dateText: repair.dateText, timeText: repair.timeText, evidence: repair.evidence.slice(0, 120) });
          selected = mergeDedicatedDateRepair(selected, repair);
          if (!selected.proposals[0]?.dateText && headerDataUrl !== dataUrl) {
            const fullRepair = await receiptDateRepairRequest(dataUrl, gatewayKey);
            console.info("[Milo Image] full-image date repair", { dateText: fullRepair.dateText, timeText: fullRepair.timeText, evidence: fullRepair.evidence.slice(0, 120) });
            selected = mergeDedicatedDateRepair(selected, fullRepair);
          }
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
