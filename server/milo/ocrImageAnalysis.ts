import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import thaData from "@tesseract.js-data/tha";
import engData from "@tesseract.js-data/eng";
import type { ImageAnalysis, ImageProposal } from "./imageAnalysis";

const DATA_DIR = path.join(os.tmpdir(), "milo-tessdata");
const CACHE_DIR = path.join(os.tmpdir(), "milo-tesscache");

const thaiDigitMap: Record<string, string> = {
  "๐": "0", "๑": "1", "๒": "2", "๓": "3", "๔": "4",
  "๕": "5", "๖": "6", "๗": "7", "๘": "8", "๙": "9",
};

const thaiMonths: Record<string, number> = {
  "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
  "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
};

function ensureTessData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const files = [
    { src: path.join(thaData.langPath, "tha.traineddata.gz"), dst: path.join(DATA_DIR, "tha.traineddata.gz") },
    { src: path.join(engData.langPath, "eng.traineddata.gz"), dst: path.join(DATA_DIR, "eng.traineddata.gz") },
  ];
  for (const file of files) if (!fs.existsSync(file.dst)) fs.copyFileSync(file.src, file.dst);
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("OCR expects a base64 data URL");
  return Buffer.from(match[2], "base64");
}

function normalizeDigits(text: string) {
  return text.replace(/[๐-๙]/g, digit => thaiDigitMap[digit] || digit);
}

export function normalizeOcrText(text: string) {
  return normalizeDigits(text)
    .replace(/\u00a0/g, " ")
    .replace(/[|¦]/g, "I")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .trim();
}

function parseMoney(raw: string) {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function extractAmount(text: string) {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const preferred = /(จำนวน(?:เงิน)?|ยอด(?:โอน|ชำระ|สุทธิ|รวม)|amount|total)/i;
  const fee = /(ค่าธรรมเนียม|fee)/i;
  const currency = /(บาท|thb|฿)/i;
  const numberRe = /(?:฿|THB)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})|[0-9]+(?:\.\d{1,2})?)\s*(?:บาท|THB|฿)?/ig;
  const candidates: Array<{ amount: number; score: number }> = [];

  for (const line of lines) {
    if (fee.test(line)) continue;
    const contextScore = preferred.test(line) ? 10 : currency.test(line) ? 4 : 0;
    if (!contextScore) continue;
    numberRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = numberRe.exec(line)) !== null) {
      const amount = parseMoney(match[1]);
      if (amount <= 0 || amount > 100_000_000) continue;
      candidates.push({ amount, score: contextScore + (currency.test(line) ? 2 : 0) });
      if (match.index === numberRe.lastIndex) numberRe.lastIndex += 1;
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.amount - a.amount);
  return candidates.length ? candidates[0].amount : 0;
}

function normalizeYear(raw: number) {
  if (raw >= 2400) return raw - 543;
  if (raw >= 1000) return raw;
  if (raw >= 50) return raw + 2500 - 543;
  return raw + 2000;
}

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatIsoDate(year: number, month: number, day: number) {
  if (!validDateParts(year, month, day)) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDateTime(text: string) {
  const normalized = text.replace(/\s+/g, " ");
  let dateText = "";
  let timeText = "";

  const iso = normalized.match(/\b(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)\b/);
  if (iso) dateText = formatIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  if (!dateText) {
    const numeric = normalized.match(/\b([0-3]?\d)[\/-]([01]?\d)[\/-](\d{2,4})\b/);
    if (numeric) dateText = formatIsoDate(normalizeYear(Number(numeric[3])), Number(numeric[2]), Number(numeric[1]));
  }

  if (!dateText) {
    const monthEntries = Object.entries(thaiMonths);
    for (let i = 0; i < monthEntries.length; i += 1) {
      const monthName = monthEntries[i][0];
      const month = monthEntries[i][1];
      const escaped = monthName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = normalized.match(new RegExp(`\\b([0-3]?\\d)\\s*${escaped}\\s*(\\d{2,4})\\b`));
      if (match) {
        dateText = formatIsoDate(normalizeYear(Number(match[2])), month, Number(match[1]));
        break;
      }
    }
  }

  const time = normalized.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:น\.)?/);
  if (time) timeText = `${String(Number(time[1])).padStart(2, "0")}:${time[2]}`;
  return { dateText, timeText };
}

function extractMerchant(text: string) {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const direct = lines.find(line => /^(?:ผู้รับ|ไปยัง|ชื่อผู้รับ|recipient|merchant)\s*[:：-]?\s*.+/i.test(line));
  if (direct) return direct.replace(/^(?:ผู้รับ|ไปยัง|ชื่อผู้รับ|recipient|merchant)\s*[:：-]?\s*/i, "").trim().slice(0, 120);
  const markerIndex = lines.findIndex(line => /^(?:ผู้รับ|ไปยัง|ชื่อผู้รับ|recipient|merchant)\s*[:：-]?$/i.test(line));
  if (markerIndex >= 0 && lines[markerIndex + 1]) return lines[markerIndex + 1].slice(0, 120);
  return "";
}

function detectDocumentType(text: string): ImageProposal["documentType"] {
  if (/(โอนเงิน|โอนสำเร็จ|โอนเงินสำเร็จ|พร้อมเพย์|promptpay|ธ\.|ธนาคาร|bank transfer|transfer successful)/i.test(text)) return "bank_slip";
  if (/(ใบเสร็จ|ใบกำกับ|receipt|ยอดสุทธิ|ยอดรวม|total)/i.test(text)) return "receipt";
  if (/(นัด|appointment|วันนัด)/i.test(text)) return "appointment";
  return "unknown";
}

function guessCategory(text: string) {
  if (/(กาแฟ|coffee|cafe|อาหาร|restaurant|ข้าว|ชา|เครื่องดื่ม|food)/i.test(text)) return "อาหาร";
  if (/(น้ำมัน|fuel|gas station|แท็กซี่|taxi|grab|รถไฟ|bts|mrt|ทางด่วน)/i.test(text)) return "เดินทาง";
  if (/(ไฟฟ้า|ประปา|อินเทอร์เน็ต|internet|โทรศัพท์|ค่าไฟ|ค่าน้ำ)/i.test(text)) return "ค่าสาธารณูปโภค";
  if (/(โรงพยาบาล|clinic|คลินิก|ยา|pharmacy|medical)/i.test(text)) return "สุขภาพ";
  if (/(โรงเรียน|ค่าเรียน|tuition|course|หนังสือ|book)/i.test(text)) return "การศึกษา";
  if (/(movie|cinema|เกม|game|netflix|spotify|บันเทิง)/i.test(text)) return "บันเทิง";
  if (/(shop|store|ห้าง|shopping|ช้อป|สินค้า)/i.test(text)) return "ช้อปปิ้ง";
  if (/(hotel|โรงแรม|flight|เที่ยวบิน|travel|ท่องเที่ยว)/i.test(text)) return "ท่องเที่ยว";
  return "ทั่วไป";
}

export function analyzeOcrText(rawText: string): ImageAnalysis {
  const text = normalizeOcrText(rawText);
  const documentType = detectDocumentType(text);
  const amount = extractAmount(text);
  const dateTime = extractDateTime(text);
  const merchant = extractMerchant(text);

  let kind: ImageProposal["kind"] = "unknown";
  if (amount > 0) kind = "expense";
  else if (documentType === "appointment" && dateTime.dateText) kind = "reminder";

  const confidence = Math.min(0.96,
    0.28 + (amount > 0 ? 0.34 : 0) + (dateTime.dateText ? 0.14 : 0) + (dateTime.timeText ? 0.05 : 0) + (merchant ? 0.08 : 0) + (documentType !== "unknown" ? 0.07 : 0)
  );

  const title = documentType === "bank_slip" ? "รายการโอนเงิน" : documentType === "receipt" ? "รายการจากใบเสร็จ" : documentType === "appointment" ? "รายการนัดหมาย" : "ข้อมูลจากรูป";
  const proposal: ImageProposal = {
    kind,
    documentType,
    title,
    merchant,
    dateText: dateTime.dateText,
    timeText: dateTime.timeText,
    amount,
    currency: amount > 0 ? "บาท" : "",
    category: kind === "expense" ? guessCategory(text) : "ทั่วไป",
    paymentMethod: documentType === "bank_slip" ? "โอนเงิน" : "",
    receiptNumber: "",
    lineItems: [],
    note: `OCR fallback${merchant ? ` • ${merchant}` : ""}`,
  };

  const summary = kind === "expense"
    ? `OCR อ่าน${documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ"}ได้ ยอด ${amount.toLocaleString("th-TH")} บาท${dateTime.dateText ? ` วันที่ ${dateTime.dateText}` : " แต่วันที่ยังไม่ชัด"}`
    : kind === "reminder"
      ? `OCR อ่านวันนัดได้ ${dateTime.dateText}${dateTime.timeText ? ` ${dateTime.timeText}` : ""}`
      : "OCR อ่านข้อความจากรูปได้ แต่ยังไม่พบยอดหรือข้อมูลที่มั่นใจพอสำหรับบันทึก";

  return { summary, confidence, proposals: [proposal] };
}

export async function analyzeImageWithOcr(dataUrl: string): Promise<ImageAnalysis> {
  ensureTessData();
  const input = decodeDataUrl(dataUrl);
  const prepared = await sharp(input)
    .rotate()
    .resize({ width: 1800, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();

  const worker = await createWorker(["tha", "eng"], undefined, {
    langPath: DATA_DIR,
    cachePath: CACHE_DIR,
    gzip: true,
    logger: () => undefined,
  });
  try {
    const result = await worker.recognize(prepared);
    return analyzeOcrText(result.data.text || "");
  } finally {
    await worker.terminate();
  }
}
