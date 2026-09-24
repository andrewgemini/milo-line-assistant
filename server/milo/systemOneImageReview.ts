import {
  openThaiSystemOneApiKey,
  openThaiSystemOneConfigured,
  openThaiSystemOneModel,
  openThaiSystemOneUrl,
} from "../_core/typeSafe";
import type { ImageAnalysis } from "./imageAnalysis";

export type SystemOneOcrReview = {
  accepted: boolean;
  needsVision: boolean;
  confidence: number;
  documentType: "bank_slip" | "receipt" | "appointment" | "unknown";
  category: "อาหาร" | "เดินทาง" | "ค่าสาธารณูปโภค" | "สุขภาพ" | "การศึกษา" | "บันเทิง" | "ช้อปปิ้ง" | "ท่องเที่ยว" | "ทั่วไป";
  model: string;
};

type RawChoiceAnswer = { choice?: string; confidence?: number };
type RawResponse = { model?: string; answers?: Record<string, RawChoiceAnswer> };

const categories = {
  อาหาร: "อาหาร เครื่องดื่ม ร้านอาหาร คาเฟ่",
  เดินทาง: "ค่าเดินทาง น้ำมัน รถไฟ รถโดยสาร ทางด่วน",
  ค่าสาธารณูปโภค: "ค่าไฟ ค่าน้ำ โทรศัพท์ อินเทอร์เน็ต",
  สุขภาพ: "โรงพยาบาล คลินิก ยา สุขภาพ",
  การศึกษา: "ค่าเรียน หนังสือ คอร์สการศึกษา",
  บันเทิง: "ภาพยนตร์ เกม เพลง บริการบันเทิง",
  ช้อปปิ้ง: "ซื้อสินค้า ห้าง ร้านค้าปลีก ของใช้",
  ท่องเที่ยว: "โรงแรม เที่ยวบิน การท่องเที่ยว",
  ทั่วไป: "ค่าใช้จ่ายที่ไม่เข้าหมวดอื่น",
};

function timeoutMs(env: NodeJS.ProcessEnv) {
  const parsed = Number(env.MILO_SYSTEMONE_IMAGE_TIMEOUT_MS || "9000");
  return Number.isFinite(parsed) ? Math.max(2_000, Math.min(parsed, 20_000)) : 9_000;
}

export function systemOneImageReviewConfigured(env: NodeJS.ProcessEnv = process.env) {
  return openThaiSystemOneConfigured(env);
}

export async function reviewOcrAnalysisWithSystemOne(
  analysis: ImageAnalysis,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SystemOneOcrReview> {
  if (!openThaiSystemOneConfigured(env)) throw new Error("OpenThai-SystemOne is not configured");

  const p = analysis.proposals[0];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(env));
  try {
    const key = openThaiSystemOneApiKey(env);
    const response = await fetch(openThaiSystemOneUrl(env), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { apikey: key } : {}),
      },
      body: JSON.stringify({
        state: {
          product: "Milo LINE finance assistant",
          source: "local OCR result from a user-supplied image",
          ocr_summary: analysis.summary.slice(0, 1200),
          ocr_confidence: analysis.confidence,
          proposed_kind: p?.kind || "unknown",
          proposed_document_type: p?.documentType || "unknown",
          merchant: p?.merchant || "",
          date: p?.dateText || "",
          time: p?.timeText || "",
          amount: p?.amount || 0,
          currency: p?.currency || "",
          category: p?.category || "",
          payment_method: p?.paymentMethod || "",
          reference: p?.receiptNumber || "",
          line_items: (p?.lineItems || []).slice(0, 12),
          rule: "Do not invent missing values. Validate only what OCR already extracted. Choose needs_vision whenever important financial fields look incomplete or contradictory.",
        },
        model: openThaiSystemOneModel(env),
        questions: {
          document_type: {
            type: "choice",
            instructions: "ตรวจประเภทเอกสารจากข้อมูล OCR ที่มีอยู่ ห้ามเดาจากข้อมูลที่ไม่มี",
            criteria: {
              bank_slip: "สลิปโอนหรือชำระเงินจากธนาคาร/PromptPay และมีหลักฐานธุรกรรม",
              receipt: "ใบเสร็จหรือหลักฐานซื้อสินค้า/บริการ",
              appointment: "ใบนัดหรือตารางนัดหมาย",
              unknown: "ข้อมูลไม่พอหรือไม่เข้าประเภทข้างต้น",
            },
          },
          category: {
            type: "choice",
            instructions: "ถ้าเป็นค่าใช้จ่าย เลือกหมวดที่เหมาะที่สุดจากข้อมูล OCR เท่านั้น",
            criteria: categories,
          },
          quality: {
            type: "choice",
            instructions: "ตัดสินว่าข้อมูล OCR เพียงพอให้สร้างข้อเสนอเพื่อรอผู้ใช้ยืนยันหรือควรใช้ Vision อ่านภาพซ้ำ",
            criteria: {
              accept_ocr: "ข้อมูลสำคัญที่จำเป็นสอดคล้องและครบพอสำหรับเสนอให้ผู้ใช้ตรวจยืนยัน โดยไม่ต้องเดา",
              needs_vision: "ข้อมูลสำคัญหาย ขัดแย้ง ความมั่นใจต่ำ หรือควรดูภาพจริงก่อนเสนอข้อมูลการเงิน",
            },
          },
        },
        permutations: Number(env.OPENTHAI_SYSTEMONE_PERMUTATIONS || "1"),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`OpenThai-SystemOne image review HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const payload = await response.json() as RawResponse;
    const docAnswer = payload.answers?.document_type;
    const categoryAnswer = payload.answers?.category;
    const qualityAnswer = payload.answers?.quality;
    const documentType = ["bank_slip", "receipt", "appointment", "unknown"].includes(docAnswer?.choice || "")
      ? docAnswer!.choice as SystemOneOcrReview["documentType"]
      : "unknown";
    const category = Object.prototype.hasOwnProperty.call(categories, categoryAnswer?.choice || "")
      ? categoryAnswer!.choice as SystemOneOcrReview["category"]
      : "ทั่วไป";
    const qualityConfidence = Number(qualityAnswer?.confidence || 0);
    const documentConfidence = Number(docAnswer?.confidence || 0);
    const confidence = Math.min(1, Math.max(0, Math.min(qualityConfidence || 0, documentConfidence || qualityConfidence || 0)));
    const accepted = qualityAnswer?.choice === "accept_ocr" && confidence >= 0.72 && documentType !== "unknown";

    return {
      accepted,
      needsVision: !accepted,
      confidence,
      documentType,
      category,
      model: payload.model || openThaiSystemOneModel(env),
    };
  } finally {
    clearTimeout(timer);
  }
}
