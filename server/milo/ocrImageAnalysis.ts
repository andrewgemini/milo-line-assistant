import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import type { ImageAnalysis, ImageProposal } from "./imageAnalysis";

const DATA_DIR = path.join(process.cwd(), "api", "tessdata");
const CACHE_DIR = path.join(os.tmpdir(), "milo-tesscache");
const requireOcr = createRequire(import.meta.url);

export async function withOcrDeadline<T>(work: Promise<T>, stage: string, timeoutMs = 30_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`OCR ${stage} timed out after ${timeoutMs}ms`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer!); }
}

const thaiDigitMap: Record<string, string> = {
  "๐": "0", "๑": "1", "๒": "2", "๓": "3", "๔": "4",
  "๕": "5", "๖": "6", "๗": "7", "๘": "8", "๙": "9",
};

const thaiMonths: Record<string, number> = {
  "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
  "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
};

export function ocrAssetsReady() {
  return fs.existsSync(path.join(DATA_DIR, "tha.traineddata.gz")) && fs.existsSync(path.join(DATA_DIR, "eng.traineddata.gz"));
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("OCR expects a base64 data URL");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) throw new Error("OCR received an empty image");
  return bytes;
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
    .split("\n").map(line => {
      const tokens = line.trim().split(/[ \t]+/).filter(token => /^[\u0E00-\u0E7F]+$/.test(token));
      if (tokens.length < 3 || tokens.filter(token => token.length <= 2).length / tokens.length < 0.6) return line;
      return line.replace(/([\u0E00-\u0E7F])[ \t]+(?=[\u0E00-\u0E7F])/g, "$1");
    }).join("\n")
    .replace(/ํา/g, "ำ")
    .trim();
}

function parseMoney(raw: string) {
  const cleaned = raw.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function extractAmount(text: string) {
  const flat = text.replace(/\s+/g, " ");
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const preferred = /(จำนวน(?:เงิน)?|ยอด(?:โอน|ชำระ|สุทธิ|รวม)|amount|total)/i;
  const fee = /(ค่าธรรมเนียม|fee)/i;
  const currency = /(บาท|thb|฿)/i;
  const token = "([0-9]{1,3}(?:,[0-9]{3})*(?:\\.\\d{1,2})|[0-9]+(?:\\.\\d{1,2})?)";
  const candidates: Array<{ amount: number; score: number }> = [];

  const add = (raw: string, score: number, context: string) => {
    const amount = parseMoney(raw);
    if (amount <= 0 || amount > 100_000_000) return;
    if (fee.test(context) && !preferred.test(context.replace(fee, ""))) return;
    candidates.push({ amount, score });
  };

  const keyed = new RegExp(`(?:จำนวน(?:เงิน)?|ยอด(?:โอน|ชำระ|สุทธิ|รวม)|amount|total)\\s*[:：=\-]?\\s*(?:฿|THB)?\\s*${token}`, "ig");
  let keyedMatch: RegExpExecArray | null;
  while ((keyedMatch = keyed.exec(flat)) !== null) {
    const context = flat.slice(Math.max(0, keyedMatch.index - 18), Math.min(flat.length, keyed.lastIndex + 25));
    add(keyedMatch[1], 30, context);
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (!preferred.test(lines[i])) continue;
    const window = [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean).join(" ");
    const m = window.match(new RegExp(token));
    if (m) add(m[1], 24, window);
  }

  const baht = new RegExp(`${token}\\s*(?:บาท|THB|฿)`, "ig");
  let bahtMatch: RegExpExecArray | null;
  while ((bahtMatch = baht.exec(flat)) !== null) {
    const context = flat.slice(Math.max(0, bahtMatch.index - 45), Math.min(flat.length, baht.lastIndex + 30));
    if (/ยอดคงเหลือ|balance/i.test(context)) continue;
    add(bahtMatch[1], preferred.test(context) ? 18 : 8, context);
  }

  const numberRe = /(?:฿|THB)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})|[0-9]+(?:\.\d{1,2})?)\s*(?:บาท|THB|฿)?/ig;
  for (const line of lines) {
    if (fee.test(line) || /ยอดคงเหลือ|balance/i.test(line)) continue;
    const score = preferred.test(line) ? 14 : currency.test(line) ? 6 : 0;
    if (!score) continue;
    numberRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = numberRe.exec(line)) !== null) add(m[1], score, line);
  }

  candidates.sort((a, b) => b.score - a.score || b.amount - a.amount);
  return candidates[0]?.amount ?? 0;
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
    for (const [monthName, month] of Object.entries(thaiMonths)) {
      const escaped = monthName.split("").map(char => char === "." ? "\\.?" : char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
      const match = normalized.match(new RegExp(`(?:^|\\s)([0-3]?\\d)\\s*${escaped}\\s*(\\d{2,4})(?=\\s|$)`));
      if (match) {
        dateText = formatIsoDate(normalizeYear(Number(match[2])), month, Number(match[1]));
        break;
      }
    }
  }
  const time = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/) || normalized.match(/\b([01]?\d|2[0-3])\.([0-5]\d)\s*น\./);
  if (time) timeText = `${String(Number(time[1])).padStart(2, "0")}:${time[2]}`;
  return { dateText, timeText };
}

function extractMerchant(text: string) {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const direct = lines.find(line => /^(?:ผู้รับ|ผู้รับเงิน|ไปยัง|ชื่อผู้รับ|recipient|merchant|to)\s*[:：-]?\s*.+/i.test(line));
  if (direct) return direct.replace(/^(?:ผู้รับ|ผู้รับเงิน|ไปยัง|ชื่อผู้รับ|recipient|merchant|to)\s*[:：-]?\s*/i, "").trim().slice(0, 120);
  const markerIndex = lines.findIndex(line => /^(?:ผู้รับ|ผู้รับเงิน|ไปยัง|ชื่อผู้รับ|recipient|merchant|to)\s*[:：-]?$/i.test(line));
  if (markerIndex >= 0 && lines[markerIndex + 1]) return lines[markerIndex + 1].slice(0, 120);
  const merchantLike = lines.find(line => /(?:คาเฟ่|กาแฟ|coffee|cafe|amazon|อเมซอน|ร้าน|บริษัท|จำกัด|co\.?\s*ltd|company)/i.test(line) && !/(ผู้โอน|จากบัญชี|ธ\.|ธนาคาร|bank)/i.test(line));
  return merchantLike?.slice(0, 120) ?? "";
}

function extractReference(text: string) {
  const match = text.match(/(?:เลขที่รายการ|เลขอ้างอิง|หมายเลขอ้างอิง|reference(?:\s*(?:no|number))?|transaction\s*id)\s*[:：#-]?\s*([A-Z0-9-]{6,50})/i);
  return match?.[1]?.trim() ?? "";
}

function detectDocumentType(text: string): ImageProposal["documentType"] {
  if (/(โอนเงิน|โอนสำเร็จ|โอนเงินสำเร็จ|ชำระเงินสำเร็จ|พร้อมเพย์|promptpay|k\+|กสิกรไทย|ธ\.|ธนาคาร|bank transfer|transfer success(?:ful)?)/i.test(text)) return "bank_slip";
  if (/(ใบเสร็จ|ใบกำกับ|receipt|ยอดสุทธิ|ยอดรวม|total)/i.test(text)) return "receipt";
  if (/(นัด|appointment|วันนัด)/i.test(text)) return "appointment";
  return "unknown";
}

function guessCategory(text: string) {
  if (/(กาแฟ|คาเฟ่|อเมซอน|amazon|coffee|cafe|อาหาร|restaurant|ข้าว|ชา|เครื่องดื่ม|food)/i.test(text)) return "อาหาร";
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
  const receiptNumber = extractReference(text);
  let kind: ImageProposal["kind"] = "unknown";
  if (amount > 0) kind = "expense";
  else if (documentType === "appointment" && dateTime.dateText) kind = "reminder";
  const confidence = Math.min(0.97, 0.28 + (amount > 0 ? 0.34 : 0) + (dateTime.dateText ? 0.14 : 0) + (dateTime.timeText ? 0.05 : 0) + (merchant ? 0.08 : 0) + (documentType !== "unknown" ? 0.07 : 0));
  const memo = text.match(/(?:บันทึกช่วยจำ|หมายเหตุ|memo)\s*[:：]\s*([^\n]+)/i)?.[1]?.trim();
  const title = memo || (documentType === "bank_slip" ? "รายการโอนเงิน" : documentType === "receipt" ? "รายการจากใบเสร็จ" : documentType === "appointment" ? "รายการนัดหมาย" : "ข้อมูลจากรูป");
  const proposal: ImageProposal = {
    kind, documentType, title, merchant,
    dateText: dateTime.dateText, timeText: dateTime.timeText, amount,
    currency: amount > 0 ? "บาท" : "",
    category: kind === "expense" ? guessCategory(text) : "ทั่วไป",
    paymentMethod: documentType === "bank_slip" ? "โอนเงิน" : "",
    receiptNumber, lineItems: [], note: memo || "",
  };
  const summary = kind === "expense"
    ? `OCR อ่าน${documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ"}ได้ ยอด ${amount.toLocaleString("th-TH")} บาท${dateTime.dateText ? ` วันที่ ${dateTime.dateText}` : " แต่วันที่ยังไม่ชัด"}`
    : kind === "reminder"
      ? `OCR อ่านวันนัดได้ ${dateTime.dateText}${dateTime.timeText ? ` ${dateTime.timeText}` : ""}`
      : "OCR อ่านข้อความจากรูปได้ แต่ยังไม่พบยอดหรือข้อมูลที่มั่นใจพอสำหรับบันทึก";
  return { summary, confidence, proposals: [proposal] };
}

function actionable(analysis: ImageAnalysis) {
  const proposal = analysis.proposals[0];
  return Boolean(proposal && ((proposal.kind === "expense" && proposal.amount > 0 && proposal.documentType !== "unknown") || (proposal.kind === "reminder" && proposal.dateText)));
}

function scoreAnalysis(analysis: ImageAnalysis) {
  const p = analysis.proposals[0];
  if (!p) return analysis.confidence;
  return analysis.confidence + (p.amount > 0 ? 8 : 0) + (p.documentType !== "unknown" ? 3 : 0) + (p.dateText ? 2 : 0) + (p.timeText ? 0.5 : 0) + (p.merchant ? 1 : 0) + (p.receiptNumber ? 0.5 : 0);
}

export async function analyzeImageWithOcr(dataUrl: string): Promise<ImageAnalysis> {
  if (!ocrAssetsReady()) throw new Error(`OCR language data is unavailable at ${DATA_DIR}`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const input = decodeDataUrl(dataUrl);
  const base = sharp(input)
    .rotate()
    .resize({ width: 2000, fit: "inside", withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.05 });
  const variants: Array<{ label: string; bytes: Buffer }> = [
    { label: "normalized-upscaled", bytes: await base.clone().png().toBuffer() },
    { label: "medium-contrast", bytes: await base.clone().linear(1.25, -20).png().toBuffer() },
    { label: "threshold-175", bytes: await base.clone().threshold(175).png().toBuffer() },
  ];

  const workerPath = requireOcr.resolve("tesseract.js/src/worker-script/node/index.js");
  if (!fs.existsSync(workerPath)) throw new Error("OCR worker is missing from deployment");
  let expired = false;
  const initializing = createWorker(["tha", "eng"], undefined, {
    workerPath,
    langPath: DATA_DIR,
    cachePath: CACHE_DIR,
    gzip: true,
    logger: () => undefined,
  }).then(async worker => {
    if (expired) { await worker.terminate(); throw new Error("OCR initialization expired"); }
    return worker;
  });
  const worker = await withOcrDeadline(initializing, "initialization").catch(error => { expired = true; throw error; });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "6" } as never);
    const texts: string[] = [];
    let best: ImageAnalysis | undefined;
    let bestScore = -Infinity;
    for (const variant of variants) {
      const result = await withOcrDeadline(worker.recognize(variant.bytes), "recognition");
      const raw = result.data.text || "";
      texts.push(raw);
      const analysis = analyzeOcrText(texts.join("\n"));
      const score = scoreAnalysis(analysis);
      console.info("[Milo OCR] pass", { label: variant.label, chars: raw.length, confidence: analysis.confidence, documentType: analysis.proposals[0]?.documentType, amount: analysis.proposals[0]?.amount, dateText: analysis.proposals[0]?.dateText });
      if (score > bestScore) { best = analysis; bestScore = score; }
      const p = analysis.proposals[0];
      if (actionable(analysis) && p?.dateText) return analysis;
    }
    if (!best) throw new Error("OCR returned no text");
    return best;
  } finally {
    await worker.terminate();
  }
}
