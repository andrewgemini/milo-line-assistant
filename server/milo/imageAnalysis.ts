import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { analyzeImageWithOcr } from "./ocrImageAnalysis";

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

async function analyzeImageWithVision(dataUrl: string): Promise<ImageAnalysis> {
  const response = await invokeLLM({
    model: ENV.visionModel,
    messages: [
      {
        role: "system",
        content: "คุณคือไมโล ผู้ช่วยภาษาไทย อ่านภาพใบนัด ตาราง สลิปโอนเงิน และใบเสร็จอย่างระมัดระวัง คืน JSON ตาม schema เท่านั้น ห้ามเดาหรือแต่งข้อความ/ตัวเลขที่อ่านไม่ชัด สำหรับสลิปให้ใช้ยอดโอนจริง ไม่ใช้ยอดคงเหลือ สำหรับใบเสร็จให้ใช้ยอดรวมสุทธิที่ชำระแล้ว หากวันที่อ่านได้แน่ชัดให้ส่ง dateText รูปแบบ YYYY-MM-DD มิฉะนั้นเป็นสตริงว่าง สำหรับค่าใช้จ่ายให้แยก merchant, paymentMethod, receiptNumber, รายการสำคัญ และเลือก category ภาษาไทยจาก อาหาร, เดินทาง, ค่าสาธารณูปโภค, สุขภาพ, การศึกษา, บันเทิง, ช้อปปิ้ง, ท่องเที่ยว, ทั่วไป หากไม่พบข้อมูลที่บันทึกได้ให้ใช้ kind=unknown และ amount=0",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "วิเคราะห์ภาพเพื่อหาใบนัดหรือธุรกรรมค่าใช้จ่ายจากสลิป/ใบเสร็จ โดยเสนอข้อมูลเพื่อให้ผู้ใช้ยืนยันก่อนบันทึกเท่านั้น" },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_image_analysis", strict: true, schema } },
  });
  const content = response.choices[0]?.message.content;
  if (!content || typeof content !== "string") throw new Error("Image model did not return JSON");
  return JSON.parse(content) as ImageAnalysis;
}

export async function analyzeImage(dataUrl: string): Promise<ImageAnalysis> {
  if (ENV.forgeApiKey) {
    try {
      return await analyzeImageWithVision(dataUrl);
    } catch (error) {
      console.warn("[Milo Image] vision provider failed; using OCR fallback", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return analyzeImageWithOcr(dataUrl);
}
