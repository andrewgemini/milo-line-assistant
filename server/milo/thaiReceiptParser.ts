import type { ImageProposal } from "./imageAnalysis";

const monthNumbers: Record<string, number> = {
  "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
  "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
  "มกราคม": 1, "กุมภาพันธ์": 2, "มีนาคม": 3, "เมษายน": 4, "พฤษภาคม": 5, "มิถุนายน": 6,
  "กรกฎาคม": 7, "สิงหาคม": 8, "กันยายน": 9, "ตุลาคม": 10, "พฤศจิกายน": 11, "ธันวาคม": 12,
};

const thaiDigits: Record<string, string> = {
  "๐": "0", "๑": "1", "๒": "2", "๓": "3", "๔": "4",
  "๕": "5", "๖": "6", "๗": "7", "๘": "8", "๙": "9",
};

function compact(value: string) {
  return value
    .replace(/[๐-๙]/g, digit => thaiDigits[digit] || digit)
    .replace(/[\t ]+/g, " ")
    .trim();
}

function normalizeYear(value: number) {
  if (value >= 2400) return value - 543;
  if (value >= 1000) return value;
  return value >= 50 ? value + 2500 - 543 : value + 2000;
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function valueNearLabel(lines: string[], pattern: RegExp) {
  for (let i = 0; i < lines.length; i += 1) {
    if (!pattern.test(lines[i])) continue;
    const window = [lines[i], lines[i + 1]].filter(Boolean).join(" ");
    const matches = Array.from(window.matchAll(/-?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})|[0-9]+(?:\.\d{1,2})?)/g));
    if (!matches.length) continue;
    const raw = matches[matches.length - 1][1].replace(/,/g, "");
    const amount = Number(raw);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

export function extractThaiPayableAmount(text: string) {
  const lines = text.split(/\n+/).map(compact).filter(Boolean);
  const rules = [
    /จำนวนเงินที่ชำระ|จำนวนเงินชำระ|ยอดที่ชำระ|ยอดชำระสุทธิ|ยอดสุทธิ|รวมสุทธิ/i,
    /^ยอดชำระ\b/i,
    /^ยอดรวม\b|^total\b/i,
    /ค่าสินค้า\s*\/\s*บริการ/i,
  ];
  for (const rule of rules) {
    const amount = valueNearLabel(lines, rule);
    if (amount > 0) return amount;
  }
  return 0;
}

export function extractThaiSlipDateTime(text: string) {
  const flat = compact(text.replace(/\r?\n/g, " "));
  let dateText = "";

  const iso = flat.match(/(?:^|[^0-9])(2\s*0\s*\d\s*\d)\s*[\/.-]\s*([01]?\s*\d)\s*[\/.-]\s*([0-3]?\s*\d)(?=$|[^0-9])/);
  if (iso) {
    const year = Number(iso[1].replace(/\s+/g, ""));
    const month = Number(iso[2].replace(/\s+/g, ""));
    const day = Number(iso[3].replace(/\s+/g, ""));
    dateText = isoDate(year, month, day);
  }

  if (!dateText) {
    const numericPatterns = [
      /(?:^|[^0-9])([0-3]?\s*\d)\s*[\/.-]\s*([01]?\s*\d)\s*[\/.-]\s*(2\s*[05]\s*\d\s*\d|\d\s*\d)(?=$|[^0-9])/,
      /(?:วันที่|date)\s*[:：-]?\s*([0-3]?\s*\d)\s+([01]?\s*\d)\s+(2\s*[05]\s*\d\s*\d|\d\s*\d)(?=$|[^0-9])/i,
    ];
    for (const pattern of numericPatterns) {
      const match = flat.match(pattern);
      if (!match) continue;
      const day = Number(match[1].replace(/\s+/g, ""));
      const month = Number(match[2].replace(/\s+/g, ""));
      const year = Number(match[3].replace(/\s+/g, ""));
      dateText = isoDate(normalizeYear(year), month, day);
      if (dateText) break;
    }
  }

  if (!dateText) {
    for (const [name, month] of Object.entries(monthNumbers)) {
      const escaped = name
        .split("")
        .map(char => char === "." ? "\\s*\\.?\\s*" : char.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&") + "\\s*")
        .join("");
      const pattern = new RegExp("(?:^|\\s)([0-3]?\\s*\\d)\\s*" + escaped + "(2\\s*[05]\\s*\\d\\s*\\d|\\d\\s*\\d)(?=\\s|$)");
      const match = flat.match(pattern);
      if (!match) continue;
      const day = Number(match[1].replace(/\s+/g, ""));
      const year = Number(match[2].replace(/\s+/g, ""));
      dateText = isoDate(normalizeYear(year), month, day);
      if (dateText) break;
    }
  }

  const time = flat.match(/(?:^|[^0-9])([01]?\s*\d|2\s*[0-3])\s*:\s*([0-5]\s*\d)(?=$|[^0-9])/)
    || flat.match(/(?:เวลา\s*)?([01]?\s*\d|2\s*[0-3])\s*\.\s*([0-5]\s*\d)\s*(?:น\.)/);

  return {
    dateText,
    timeText: time ? String(Number(time[1].replace(/\s+/g, ""))).padStart(2, "0") + ":" + time[2].replace(/\s+/g, "") : "",
  };
}

function isKbankNoise(line: string) {
  const value = compact(line);
  if (!value) return true;
  if (/^(?:ชำระเงินสำเร็จ|โอนเงินสำเร็จ|นาย\s|นาง\s|น\.ส\.|ธ\.?กสิกรไทย|ธนาคาร|k\+|xxx|x{3,}|เลขที่รายการ|เลขอ้างอิง|จำนวน|ค่าธรรมเนียม|บันทึกช่วยจำ|หมายเหตุ|สแกน)/i.test(value)) return true;
  if (/^\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/i.test(value)) return true;
  const compactValue = value.replace(/\s+/g, "");
  if (/^(?:[A-Z0-9-]{14,}|\d{10,})$/i.test(compactValue)) return true;
  if (/^(?:จำนวน|ค่าธรรมเนียม|ยอด).*(?:บาท|\d)/i.test(value)) return true;
  return false;
}

export function normalizeThaiMerchantName(value: string) {
  let cleaned = compact(value)
    .replace(/^[=•·|:;._\-–—>]+\s*/, "")
    .replace(/^[A-Za-zก-๙]{1,2}\s+(?=ร้าน)/, "")
    .replace(/^[A-Za-z0-9]{1,4}[\s|:;._-]+(?=[ก-๙])/, "")
    .replace(/คาเฟ[่]?\s*อเมซอน/gi, "คาเฟ่ อเมซอน")
    .replace(/cafe\s*amazon/gi, "Cafe Amazon")
    .replace(/([ก-๙])\s+(เฮ้าส์)/g, "$1$2")
    .replace(/เพชรเกษม\s*(\d)\s+(\d{2})(?=\b|\s|$)/gi, "เพชรเกษม$1$2")
    .replace(/เอกซ์เพรส/g, "เอ็กซ์เพรส")
    .replace(/\s+(?:ถุง|ของหวาน|เครื่อง(?:ดื่ม|คื่ม))(?=\s|$)[\s\S]*$/i, "")
    .replace(/\s+(?:ค่าสินค้า\s*\/\s*บริการ|จำนวนเงินที่ชำระ|ยอด(?:ที่)?ชำระ|สิทธิไทยช่วยไทยพลัส)[\s\S]*$/i, "")
    .replace(/\s+(?:[A-Z0-9]{14,}|\d{10,})\s*$/i, "")
    .trim();

  // CJ has a stable legal merchant name, while OCR often corrupts only the
  // company suffix (for example "กรป2รว"). Preserve the readable store code
  // and branch, then canonicalize the fixed legal suffix.
  if (/^CJ\s*\d{3,5}\b/i.test(cleaned)) {
    const match = cleaned.match(/^CJ\s*(\d{3,5})\s*(.*)$/i);
    if (match) {
      let branch = match[2]
        .replace(/\s+(?:บจก\.?|บริษัท|ซี\.?\s*เจ\.?|เอกซ์เพรส|เอ็กซ์เพรส|กรุ๊ป|กรป).*$/i, "")
        .replace(/\s+[0-9][A-Za-zก-๙]{1,5}\s*$/i, "")
        .trim();
      branch = branch.replace(/เพชรเกษม\s*(\d)\s+(\d{2})(?=\b|\s|$)/gi, "เพชรเกษม$1$2");
      cleaned = `CJ ${match[1]}${branch ? ` ${branch}` : ""} บจก. ซี.เจ. เอ็กซ์เพรส กรุ๊ป`;
    }
  } else {
    cleaned = cleaned.replace(/((?:กรุ๊ป|จำกัด|ลิมิเต็ด))\s+[0-9][A-Za-zก-๙]{1,5}\s*$/i, "$1");
  }

  return compact(cleaned);
}

function cleanMerchant(value: string) {
  return normalizeThaiMerchantName(value);
}

export function extractKbankMerchant(text: string) {
  const lines = text.split(/\n+/).map(compact).filter(Boolean);
  const refIndex = lines.findIndex(line => /^(?:เลขที่รายการ|เลขอ้างอิง|จำนวน|ค่าธรรมเนียม|บันทึกช่วยจำ)/i.test(line));
  const end = refIndex >= 0 ? refIndex : lines.length;
  const accountIndex = lines.findIndex(line => /(?:xxx|x{3,})[-x\d]*|ธ\.?กสิกรไทย/i.test(line));
  const start = accountIndex >= 0 ? accountIndex + 1 : Math.max(0, end - 5);
  const candidates: string[] = [];

  for (let i = start; i < end && candidates.length < 3; i += 1) {
    const line = lines[i];
    if (isKbankNoise(line)) continue;
    const cleaned = cleanMerchant(line);
    if (!cleaned || !/[A-Za-zก-๙]/.test(cleaned)) continue;
    const fingerprint = cleaned.toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");
    const combined = candidates.join("").toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");
    if (fingerprint.length >= 5 && combined.includes(fingerprint)) continue;
    candidates.push(cleaned);
  }

  return cleanMerchant(candidates.join(" ")).slice(0, 180);
}

export function extractReceiptMerchant(text: string) {
  const lines = text.split(/\n+/).map(compact).filter(Boolean);
  const cleanedLines = lines.map(cleanMerchant);
  const candidate = cleanedLines.find(line => /^(?:ร้าน|บจก\.?|หจก\.?|บริษัท|cj\b|cafe\b)/i.test(line)
    && !/(ค่าสินค้า|ยอด|จำนวนเงิน|ส่วนลด|สิทธิ|บาท|ค่าธรรมเนียม)/i.test(line));
  if (!candidate) return "";
  return candidate.trim().slice(0, 180);
}

export function extractReceiptLineItems(text: string) {
  const lines = text.split(/\n+/).map(compact).filter(Boolean);
  const labels = /ค่าสินค้า\s*\/\s*บริการ|สิทธิ.*(?:พลัส|ช่วย)|ส่วนลด|จำนวนเงินที่ชำระ|ยอดที่ชำระ|ยอดสุทธิ/i;
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!labels.test(lines[i])) continue;
    const joined = /\d/.test(lines[i]) ? lines[i] : [lines[i], lines[i + 1]].filter(Boolean).join(" ");
    const cleaned = compact(joined);
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
  }

  return out.slice(0, 6);
}

export function enrichThaiReceiptProposal(text: string, proposal: ImageProposal): ImageProposal {
  const kbank = /(?:k\+|กสิกรไทย|ธ\.?กสิกรไทย)/i.test(text);
  const receiptLike = /ใบเสร็จ|ค่าสินค้า\s*\/\s*บริการ|จำนวนเงินที่ชำระ|ยอดสุทธิ|สิทธิ.*(?:พลัส|ช่วย)/i.test(text);
  const dateTime = extractThaiSlipDateTime(text);
  const payable = extractThaiPayableAmount(text);
  const merchant = kbank ? extractKbankMerchant(text) : receiptLike ? extractReceiptMerchant(text) : "";
  const lineItems = receiptLike ? extractReceiptLineItems(text) : [];
  const documentType = proposal.documentType === "unknown" && receiptLike ? "receipt" : proposal.documentType;

  return {
    ...proposal,
    documentType,
    amount: payable > 0 ? payable : proposal.amount,
    merchant: merchant || normalizeThaiMerchantName(proposal.merchant),
    dateText: proposal.dateText || dateTime.dateText,
    timeText: proposal.timeText || dateTime.timeText,
    lineItems: lineItems.length ? Array.from(new Set([...(proposal.lineItems || []), ...lineItems])) : proposal.lineItems,
  };
}
