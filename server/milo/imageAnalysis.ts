import { invokeLLM } from "../_core/llm";
import { generateGoogleGeminiJson, googleGeminiConfigured } from "../_core/googleGemini";
import { ENV } from "../_core/env";
import { analyzeImageWithOcr, buildReceiptHeaderDataUrl, ocrAssetsReady } from "./ocrImageAnalysis";
import { extractThaiSlipDateTime, isPlausibleReceiptMerchant, normalizeThaiMerchantName, receiptMerchantQuality } from "./thaiReceiptParser";

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

const SYSTEM_PROMPT = "คุณคือไมโล ผู้ช่วยภาษาไทย อ่านภาพใบนัด ตาราง สลิปโอนเงิน และใบเสร็จอย่างระมัดระวัง คืน JSON ตาม schema เท่านั้น ห้ามเดาหรือแต่งข้อความ/ตัวเลขที่อ่านไม่ชัด สำหรับสลิปให้ใช้ยอดโอนจริง ไม่ใช้ยอดคงเหลือหรือค่าธรรมเนียม สำหรับใบเสร็จ POS ให้ตรวจตั้งแต่หัวใบเสร็จถึงท้ายใบ: merchant ต้องเป็นชื่อร้านจริงที่พิมพ์ข้างโลโก้หรือข้อมูลร้านเท่านั้น (เช่น INDI Coffee) ห้ามใช้หัวข้อสถานะ รหัส Wallet เลขอ้างอิง หรือข้อความที่มีอักขระเพี้ยน, receiptNumber ต้องอ่านจากเลขที่ใบเสร็จ, dateText/timeText ต้องมาจากวันที่และเวลาที่พิมพ์บนเอกสาร, paymentMethod ให้อ่านจากเงินสด/QR/บัตร/โอนเงิน และ lineItems ต้องถอดทุกรายการในตารางสินค้าเท่าที่อ่านได้ โดยเก็บชื่อสินค้า จำนวน และยอดของแถวนั้น ไม่เอาหัวตาราง ยอดรวม เงินสด เงินทอน หรือ footer มาเป็นสินค้า สำหรับยอด amount ให้ใช้ยอดที่จ่ายจริงหลังส่วนลดหรือสิทธิช่วยเหลือ โดยให้ความสำคัญกับ จำนวนเงินที่ชำระ, ยอดที่ชำระ, ยอดสุทธิ, ทั้งหมด, Grand Total มากกว่าค่าสินค้า/บริการก่อนส่วนลด หากวันที่อ่านได้แน่ชัดให้ส่ง dateText รูปแบบ YYYY-MM-DD มิฉะนั้นเป็นสตริงว่าง สำหรับค่าใช้จ่ายให้เลือก category ภาษาไทยจาก อาหาร, เดินทาง, ค่าสาธารณูปโภค, สุขภาพ, การศึกษา, บันเทิง, ช้อปปิ้ง, ท่องเที่ยว, ทั่วไป หากไม่พบข้อมูลที่บันทึกได้ให้ใช้ kind=unknown และ amount=0";
const USER_PROMPT = "วิเคราะห์ภาพเพื่อหาใบนัดหรือธุรกรรมค่าใช้จ่ายจากสลิป/ใบเสร็จ โดยเสนอข้อมูลเพื่อให้ผู้ใช้ยืนยันก่อนบันทึกเท่านั้น";
const RECEIPT_DETAIL_PROMPT = "ตรวจใบเสร็จนี้ซ้ำแบบละเอียดเหมือนผู้ตรวจเอกสาร POS: อ่านชื่อร้านจากหัวเอกสาร, เลขที่ใบเสร็จ, ประเภทการซื้อ, พนักงานถ้ามี, วันที่/เวลา, วิธีชำระ, ยอดทั้งหมดที่จ่ายจริง และถอดรายการสินค้าในตารางให้ครบทุกแถวที่มองเห็น โดย lineItems แต่ละรายการควรมีชื่อสินค้า ×จำนวน ยอดบาท ห้ามเอา Qty/ราคา/ยอดรวม/ทั้งหมด/เงินสด/Powered by มาเป็นสินค้า ถ้าตัวอักษรแถวใดอ่านไม่ชัดให้เว้นส่วนนั้นแทนการเดา";

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

async function analyzeImageWithGoogle(dataUrl: string, userPrompt = USER_PROMPT): Promise<ImageAnalysis> {
  return generateGoogleGeminiJson<ImageAnalysis>({
    kind: "vision",
    imageDataUrl: dataUrl,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    schema,
  });
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

async function repairReceiptDateWithGoogle(dataUrl: string): Promise<ReceiptDateRepair> {
  const repair = await generateGoogleGeminiJson<ReceiptDateRepair>({
    kind: "vision",
    imageDataUrl: dataUrl,
    system: "คุณเป็นตัวตรวจวันที่ใบเสร็จไทย อ่านเฉพาะวันที่และเวลาในภาพจริง ห้ามใช้วันที่ปัจจุบันหรือวันที่ส่งรูป ห้ามเดา",
    prompt: "อ่านบรรทัดวันที่และเวลาที่พิมพ์บนใบเสร็จจริงจากพิกเซล ถ้าเห็นวันที่แบบ 17 ก.ย. 2569 10:58 ให้คืน dateText=2026-09-17 และ timeText=10:58",
    schema: receiptDateSchema,
  });
  return parseReceiptDateRepairContent(JSON.stringify(repair));
}

async function receiptDateRepairRequest(dataUrl: string, token: string): Promise<ReceiptDateRepair> {
  const body: Record<string, unknown> = {
    model: process.env.MILO_VISION_MODEL || "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: "คุณคือ OCR verifier สำหรับใบเสร็จไทย งานเดียวคืออ่านวันที่ทำรายการและเวลาที่พิมพ์อยู่ในภาพจริง ห้ามเดาจากเวลาส่งรูป วันที่ปัจจุบัน หรือบริบทอื่น ถ้าอ่านวันเดือนปีไม่ชัดให้ dateText เป็นสตริงว่าง ถ้าอ่านเวลาไม่ชัดให้ timeText เป็นสตริงว่าง dateText ต้องเป็น YYYY-MM-DD เท่านั้น และ evidence ให้คัดข้อความสั้นๆ ที่มองเห็นซึ่งรองรับวันที่/เวลา" },
      {
        role: "user",
        content: [
          { type: "text", text: "ตรวจเฉพาะวันที่ทำรายการและเวลาในเอกสารนี้ มองทั้งหัวเอกสาร บรรทัดใกล้คำว่า วันที่/เวลา และบริเวณรอบยอดเงิน วันที่อาจเป็น พ.ศ. เช่น 14 ก.ย. 2569, 14 กันยายน 2569, 14/09/2569, 14.09.69 หากมองไม่เห็นวันเดือนปีจริงให้คืน dateText ว่าง" },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
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

async function receiptDateRepairWithGoogle(dataUrl: string): Promise<ReceiptDateRepair> {
  return generateGoogleGeminiJson<ReceiptDateRepair>({
    kind: "vision",
    imageDataUrl: dataUrl,
    system: "คุณคือ OCR verifier สำหรับใบเสร็จไทย อ่านเฉพาะวันที่ทำรายการและเวลาที่พิมพ์อยู่ในภาพจริง ห้ามเดาจากเวลาส่งรูป วันที่ปัจจุบัน หรือบริบทอื่น ถ้าอ่านวันเดือนปีไม่ชัดให้ dateText ว่าง และ evidence ต้องคัดข้อความสั้นๆ ที่เห็นจริง",
    prompt: "อ่านเฉพาะบรรทัดวันที่และเวลาในใบเสร็จจริงจากพิกเซล ถ้าเห็นวันที่แบบ 17 ก.ย. 2569 10:58 ให้คืน dateText=2026-09-17 และ timeText=10:58",
    schema: receiptDateSchema,
  });
}

async function receiptDateRepairWithForge(dataUrl: string): Promise<ReceiptDateRepair> {
  const response = await invokeLLM({
    model: ENV.visionModel,
    messages: [
      { role: "system", content: "คุณคือ OCR verifier สำหรับใบเสร็จไทย งานเดียวคืออ่านวันที่ทำรายการและเวลาที่พิมพ์อยู่ในภาพจริง ห้ามเดาจากเวลาส่งรูป วันที่ปัจจุบัน หรือบริบทอื่น ถ้าอ่านวันเดือนปีไม่ชัดให้ dateText เป็นสตริงว่าง และ dateText ต้องเป็น YYYY-MM-DD เท่านั้น evidence ต้องคัดข้อความสั้นๆ ที่เห็นจริง" },
      {
        role: "user",
        content: [
          { type: "text", text: "อ่านเฉพาะบรรทัดวันที่และเวลาในใบเสร็จนี้ โดยขยายดูหัวใบเสร็จและบริเวณใกล้ยอดเงิน วันที่อาจเป็น พ.ศ. เช่น 16 ก.ย. 2569 10:34 ห้ามเดา ถ้าเห็นให้แปลงเป็น ค.ศ." },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_receipt_date_repair_forge", strict: true, schema: receiptDateSchema } },
  });
  return parseReceiptDateRepairContent(response.choices[0]?.message.content);
}

async function repairMissingReceiptDate(analysis: ImageAnalysis, dataUrl: string, gatewayKey?: string) {
  const proposal = analysis.proposals[0];
  if (!proposal || proposal.documentType !== "receipt" || proposal.kind !== "expense" || proposal.dateText) return analysis;
  if (googleGeminiConfigured()) {
    try {
      const header = await buildReceiptHeaderDataUrl(dataUrl).catch(() => dataUrl);
      const normalized = await repairReceiptDateWithGoogle(header);
      if (normalized.dateText) return mergeDedicatedDateRepair(analysis, normalized);
    } catch (error) {
      console.warn("[Milo Image] Google focused date repair failed", { error: error instanceof Error ? error.message : "unknown" });
    }
  }
  const headerDataUrl = await buildReceiptHeaderDataUrl(dataUrl).catch(() => dataUrl);
  try {
    if (ENV.forgeApiKey) {
      const repair = await receiptDateRepairWithForge(headerDataUrl);
      if (repair.dateText) return mergeDedicatedDateRepair(analysis, repair);
    }
  } catch (error) {
    console.warn("[Milo Image] Forge focused date repair failed", { error: error instanceof Error ? error.message : "unknown" });
  }
  if (gatewayKey) {
    try {
      const repair = await receiptDateRepairRequest(headerDataUrl, gatewayKey);
      return mergeDedicatedDateRepair(analysis, repair);
    } catch (error) {
      console.warn("[Milo Image] Gateway focused date repair failed", { error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return analysis;
}

function mergeDedicatedDateRepair(base: ImageAnalysis, repair: ReceiptDateRepair) {
  const b = base.proposals[0];
  if (!b || !repair.dateText) return base;
  return {
    ...base,
    summary: b.kind === "expense"
      ? `อ่าน${b.documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ"}ได้ ยอด ${b.amount.toLocaleString("th-TH")} บาท วันที่ ${repair.dateText}`
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
  if (googleGeminiConfigured()) return ocrAssetsReady() ? "google-gemini-vision+ocr-fallback" : "google-gemini-vision";
  if (ENV.forgeApiKey) return ocrAssetsReady() ? "forge-vision+ocr-fallback" : "forge-vision";
  const gatewayMode = imageGatewayMode(process.env, requestToken);
  if (gatewayMode) return ocrAssetsReady() ? `${gatewayMode}+ocr-fallback` : gatewayMode;
  return ocrAssetsReady() ? "ocr-fallback" : "unconfigured";
}

export async function imageAnalysisRuntimeStatus(requestToken?: string) {
  const mode = imageAnalysisMode(requestToken);
  return {
    mode,
    authenticated: Boolean(googleGeminiConfigured() || ENV.forgeApiKey || imageGatewayToken(process.env, requestToken) || ocrAssetsReady()),
    ocrAssetsReady: ocrAssetsReady(),
  };
}

function receiptNeedsDetailRepair(analysis: ImageAnalysis) {
  const proposal = analysis.proposals[0];
  if (!proposal || proposal.documentType !== "receipt" || proposal.kind !== "expense" || proposal.amount <= 0) return false;
  const merchant = normalizeThaiMerchantName(proposal.merchant);
  const merchantLooksOperational = !isPlausibleReceiptMerchant(merchant) || /^(?:ประเภท|พนักงาน|เวลา|วันที่|สินค้า|qty|ราคา|รวม)/i.test(merchant);
  return merchantLooksOperational || !proposal.lineItems?.length || proposal.lineItems.length < 2 || !proposal.receiptNumber;
}

async function refineReceiptDetails(analysis: ImageAnalysis, dataUrl: string, gatewayKey: string) {
  if (!receiptNeedsDetailRepair(analysis)) return analysis;
  try {
    const repaired = await analyzeImageWithGatewayKey(dataUrl, gatewayKey, RECEIPT_DETAIL_PROMPT);
    const repairedProposal = repaired.proposals[0];
    if (!repairedProposal || repairedProposal.documentType !== "receipt") return analysis;
    const merged = mergeImageAnalyses(analysis, repaired);
    console.info("[Milo Image] receipt detail repair", {
      merchant: merged.proposals[0]?.merchant,
      receiptNumber: merged.proposals[0]?.receiptNumber,
      lineItems: merged.proposals[0]?.lineItems?.length ?? 0,
      amount: merged.proposals[0]?.amount,
    });
    return merged;
  } catch (error) {
    console.warn("[Milo Image] receipt detail repair failed", { error: error instanceof Error ? error.message : "unknown" });
    return analysis;
  }
}

export function mergeImageAnalyses(primary: ImageAnalysis, ocr: ImageAnalysis): ImageAnalysis {
  const p = primary.proposals[0];
  const o = ocr.proposals[0];
  if (!p) return ocr;
  if (!o) return primary;

  const documentType = p.documentType !== "unknown" ? p.documentType : o.documentType;
  const preferOcrAmount = o.amount > 0 && (p.amount <= 0 || (documentType === "receipt" && o.amount !== p.amount));
  const amount = preferOcrAmount ? o.amount : (p.amount || o.amount);
  const primaryMerchant = isPlausibleReceiptMerchant(p.merchant) ? normalizeThaiMerchantName(p.merchant) : "";
  const ocrMerchant = isPlausibleReceiptMerchant(o.merchant) ? normalizeThaiMerchantName(o.merchant) : "";
  const merchant = receiptMerchantQuality(ocrMerchant) >= receiptMerchantQuality(primaryMerchant) ? ocrMerchant : primaryMerchant;

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
    lineItems: Array.from(new Set([...(p.lineItems || []), ...(o.lineItems || [])])).slice(0, 20),
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

function sanitizeAnalysisMerchants(analysis: ImageAnalysis): ImageAnalysis {
  return {
    ...analysis,
    proposals: analysis.proposals.map(proposal => ({
      ...proposal,
      merchant: isPlausibleReceiptMerchant(proposal.merchant) ? normalizeThaiMerchantName(proposal.merchant) : "",
    })),
  };
}

function trustedOcrBankSlipFallback(analysis: ImageAnalysis) {
  const proposal = analysis.proposals[0];
  if (!proposal || proposal.kind !== "expense" || proposal.documentType !== "bank_slip" || proposal.amount <= 0) return false;
  const hasTransactionIdentity = Boolean(proposal.receiptNumber || (proposal.merchant && proposal.timeText));
  return analysis.confidence >= 0.75 && Boolean(proposal.dateText) && hasTransactionIdentity;
}

export async function analyzeImage(dataUrl: string, options: { gatewayToken?: string } = {}): Promise<ImageAnalysis> {
  let providerError: unknown;
  let providerAnalysis: ImageAnalysis | undefined;
  let directVisionAnalysis: ImageAnalysis | undefined;

  if (googleGeminiConfigured()) {
    try {
      const analysis = await analyzeImageWithGoogle(dataUrl);
      directVisionAnalysis = analysis;
      providerAnalysis = analysis;
      console.info("[Milo Image] Google Gemini direct vision selected", {
        proposals: analysis.proposals.length,
        firstDate: analysis.proposals[0]?.dateText || "",
        firstTime: analysis.proposals[0]?.timeText || "",
      });
      const first = analysis.proposals[0];
      if (first?.kind === "expense" && first.documentType === "receipt" && !first.dateText) {
        try {
          const headerDataUrl = await buildReceiptHeaderDataUrl(dataUrl).catch(() => dataUrl);
          const repair = await receiptDateRepairWithGoogle(headerDataUrl);
          providerAnalysis = mergeDedicatedDateRepair(providerAnalysis, repair);
          console.info("[Milo Image] Google Gemini focused date repair", {
            dateText: repair.dateText,
            timeText: repair.timeText,
            evidence: repair.evidence.slice(0, 120),
          });
        } catch (repairError) {
          console.warn("[Milo Image] Google Gemini focused date repair failed", {
            error: repairError instanceof Error ? repairError.message : "unknown",
          });
        }
      }
      // OCR is a repair for missing fields. Running it for every receipt delays
      // replies and can replace the printed time with the phone screenshot clock.
      if (providerAnalysis.proposals.some(item => item.documentType === "receipt" && item.kind === "expense" && (!item.dateText || !item.timeText))) {
        try {
          const ocrDate = await analyzeImageWithOcr(dataUrl);
          const gp = providerAnalysis.proposals[0];
          const op = ocrDate.proposals[0];
          if (gp && op?.documentType === "receipt" && op.dateText) {
            providerAnalysis = {
              ...providerAnalysis,
              summary: gp.amount > 0
                ? `อ่านใบเสร็จได้ ยอด ${gp.amount.toLocaleString("th-TH")} บาท วันที่ ${gp.dateText || op.dateText}`
                : providerAnalysis.summary,
              proposals: [{ ...gp, dateText: gp.dateText || op.dateText, timeText: gp.timeText || op.timeText }, ...providerAnalysis.proposals.slice(1)],
            };
            console.info("[Milo Image] OCR date verified Gemini receipt", {
              geminiDate: gp.dateText,
              ocrDate: op.dateText,
              ocrTime: op.timeText,
            });
          } else {
            console.info("[Milo Image] OCR date verifier found no usable receipt date");
          }
        } catch (ocrVerifyError) {
          console.warn("[Milo Image] OCR date verification skipped", {
            error: ocrVerifyError instanceof Error ? ocrVerifyError.message : "unknown",
          });
        }
      }
      return sanitizeAnalysisMerchants(providerAnalysis);
    } catch (error) {
      providerError = error;
      console.warn("[Milo Image] Google Gemini direct vision failed; using fallbacks", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  if (ENV.forgeApiKey && !directVisionAnalysis) {
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
  if (gatewayKey && !directVisionAnalysis) {
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
    if (googleGeminiConfigured()) {
      try {
        const direct = await analyzeImageWithGoogle(dataUrl);
        providerAnalysis = direct;
        directVisionAnalysis = direct;
        console.info("[Milo Image] Google Gemini direct vision applied before OCR merge");
        return sanitizeAnalysisMerchants(direct);
      } catch (error) {
        console.warn("[Milo Image] Google Gemini direct vision retry failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    const ocrAnalysis = await analyzeImageWithOcr(dataUrl);
    if (!providerAnalysis) {
      // During a temporary Gemini outage, only accept OCR-only financial data when
      // the document is a strongly identified bank slip. The webhook still saves
      // this as a proposal and requires an explicit user confirmation before any
      // transaction is created.
      if (googleGeminiConfigured() && !trustedOcrBankSlipFallback(ocrAnalysis)) {
        throw new Error("Image AI temporarily unavailable; OCR could not verify this slip strongly enough");
      }
      let selected = ocrAnalysis;
      selected = await repairMissingReceiptDate(selected, dataUrl, gatewayKey);
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
      if (gatewayKey) selected = await refineReceiptDetails(selected, dataUrl, gatewayKey);
      if (providerError && trustedOcrBankSlipFallback(selected)) {
        selected = {
          ...selected,
          summary: `AI อ่านภาพหลักไม่พร้อมชั่วคราว จึงอ่านสลิปด้วย OCR แทน — ${selected.summary} กรุณาตรวจสอบก่อนยืนยันบันทึก`,
        };
        console.warn("[Milo Image] trusted OCR bank-slip fallback selected after vision outage", {
          confidence: selected.confidence,
          amount: selected.proposals[0]?.amount,
          dateText: selected.proposals[0]?.dateText,
          receiptNumber: selected.proposals[0]?.receiptNumber,
        });
      }
      return sanitizeAnalysisMerchants(selected);
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
    selected = await repairMissingReceiptDate(selected, dataUrl, gatewayKey);
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

    if (gatewayKey) selected = await refineReceiptDetails(selected, dataUrl, gatewayKey);
    return sanitizeAnalysisMerchants(selected);
  } catch (ocrError) {
    console.error("[Milo Image] OCR fallback failed", { error: ocrError instanceof Error ? ocrError.message : "unknown" });
    if (providerAnalysis) {
      const fallback = gatewayKey ? await refineReceiptDetails(providerAnalysis, dataUrl, gatewayKey) : providerAnalysis;
      return sanitizeAnalysisMerchants(fallback);
    }
    if (providerError) {
      const providerMessage = providerError instanceof Error ? providerError.message : "unknown provider error";
      const ocrMessage = ocrError instanceof Error ? ocrError.message : "unknown OCR error";
      throw new Error(`Vision provider failed: ${providerMessage}; OCR fallback failed: ${ocrMessage}`);
    }
    throw ocrError;
  }
}
