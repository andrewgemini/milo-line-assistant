import { PDFParse } from "pdf-parse";
import { invokeLLM } from "../_core/llm";
import type { ImageAnalysis, ImageProposal } from "./imageAnalysis";

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
          kind: { type: "string", enum: ["expense", "unknown"] },
          documentType: { type: "string", enum: ["receipt", "bank_slip", "unknown"] },
          title: { type: "string" }, merchant: { type: "string" }, dateText: { type: "string" }, timeText: { type: "string" }, amount: { type: "number" }, currency: { type: "string" }, category: { type: "string" }, paymentMethod: { type: "string" }, receiptNumber: { type: "string" }, lineItems: { type: "array", items: { type: "string" } }, note: { type: "string" },
        },
        required: ["kind", "documentType", "title", "merchant", "dateText", "timeText", "amount", "currency", "category", "paymentMethod", "receiptNumber", "lineItems", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "confidence", "proposals"],
  additionalProperties: false,
} as const;

export async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ first: 20 });
    return result.text.replace(/\u0000/g, "").trim().slice(0, 60_000);
  } finally {
    await parser.destroy();
  }
}

export async function analyzePdfBuffer(buffer: Buffer): Promise<ImageAnalysis> {
  const text = await extractPdfText(buffer);
  if (!text) throw new Error("PDF does not contain readable text");
  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    messages: [
      { role: "system", content: "คุณคือ Milo ผู้ช่วยการเงินภาษาไทย วิเคราะห์ข้อความที่ดึงจาก PDF เช่น ใบเสร็จ ใบแจ้งยอด หรือ statement ให้คืน JSON ตาม schema เท่านั้น ห้ามเดาตัวเลข วันที่ หรือรายการที่ไม่ปรากฏในเอกสาร ให้สร้าง proposal เฉพาะรายจ่ายที่เห็นชัดเจน สูงสุด 100 รายการ ถ้าเป็น statement ให้แยกแต่ละบรรทัดธุรกรรมเป็นคนละ proposal โดยใช้ dateText รูปแบบ YYYY-MM-DD ถ้าระบุวันได้ชัดเจน เลือก category จาก อาหาร, เดินทาง, ค่าสาธารณูปโภค, สุขภาพ, การศึกษา, บันเทิง, ช้อปปิ้ง, ท่องเที่ยว, ทั่วไป และ amount ต้องเป็นยอดรายจ่ายจริงต่อรายการ ไม่ใช่ยอดคงเหลือ" },
      { role: "user", content: `วิเคราะห์ PDF นี้เพื่อเตรียมรายการรายจ่ายให้ผู้ใช้ตรวจและยืนยันก่อนบันทึก\n\n${text}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_pdf_analysis", strict: true, schema } },
  });
  const content = response.choices[0]?.message.content;
  if (!content || typeof content !== "string") throw new Error("PDF model did not return JSON");
  const parsed = JSON.parse(content) as ImageAnalysis;
  parsed.proposals = parsed.proposals.filter((item: ImageProposal) => item.kind === "expense" && Number(item.amount) > 0).slice(0, 100);
  return parsed;
}
