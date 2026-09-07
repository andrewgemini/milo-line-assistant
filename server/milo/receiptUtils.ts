import type { ImageProposal } from "./imageAnalysis";

type ProposalLike = Partial<ImageProposal>;

const categoryRules: Array<[RegExp, string]> = [
  [/อาหาร|กาแฟ|ร้านอาหาร|restaurant|cafe|food/i, "อาหาร"],
  [/รถ|เดินทาง|grab|taxi|bts|mrt|fuel|น้ำมัน/i, "เดินทาง"],
  [/ค่าไฟ|ค่าน้ำ|ค่าเน็ต|โทรศัพท์|มือถือ|utility|internet/i, "ค่าสาธารณูปโภค"],
  [/ยา|โรงพยาบาล|คลินิก|health/i, "สุขภาพ"],
  [/หนังสือ|คอร์ส|เรียน|ศึกษา|education/i, "การศึกษา"],
  [/หนัง|เกม|คอนเสิร์ต|บันเทิง|entertainment/i, "บันเทิง"],
  [/เสื้อ|รองเท้า|ช้อป|shopping/i, "ช้อปปิ้ง"],
  [/โรงแรม|เที่ยว|ท่องเที่ยว|travel/i, "ท่องเที่ยว"],
];

export function normalizeExpenseCategory(value?: string, context = "") {
  const text = `${value ?? ""} ${context}`.trim();
  if (!text) return "ทั่วไป";
  return categoryRules.find(([pattern]) => pattern.test(text))?.[1] ?? (value?.trim() || "ทั่วไป");
}

export function parseExtractedDate(value?: string) {
  const text = value?.trim();
  if (!text) return undefined;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const thaiNumeric = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  const thaiWords = text.match(/^\s*(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})\s*$/);
  const months: Record<string, number> = { "ม.ค.": 0, "ก.พ.": 1, "มี.ค.": 2, "เม.ย.": 3, "พ.ค.": 4, "มิ.ย.": 5, "ก.ค.": 6, "ส.ค.": 7, "ก.ย.": 8, "ต.ค.": 9, "พ.ย.": 10, "ธ.ค.": 11 };
  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;
  if (iso) { year = Number(iso[1]); month = Number(iso[2]) - 1; day = Number(iso[3]); }
  if (thaiNumeric) { year = Number(thaiNumeric[3]); month = Number(thaiNumeric[2]) - 1; day = Number(thaiNumeric[1]); }
  if (thaiWords) { year = Number(thaiWords[3]); month = months[thaiWords[2]]; day = Number(thaiWords[1]); }
  if (year === undefined || month === undefined || day === undefined) return undefined;
  if (year > 2400) year -= 543;
  const result = new Date(year, month, day, 12, 0, 0, 0);
  return result.getFullYear() === year && result.getMonth() === month && result.getDate() === day ? result : undefined;
}

export function selectImageProposal(proposals: ProposalLike[] = []) {
  return proposals.find(item => item.kind === "expense" && Number(item.amount) > 0)
    ?? proposals.find(item => item.kind === "reminder");
}

export function buildExpenseNote(proposal: ProposalLike) {
  const entries = [
    proposal.merchant ? `ร้านค้า/คู่ค้า: ${proposal.merchant}` : "",
    proposal.title ? `รายการ: ${proposal.title}` : "",
    proposal.paymentMethod ? `ชำระ: ${proposal.paymentMethod}` : "",
    proposal.receiptNumber ? `เลขที่: ${proposal.receiptNumber}` : "",
    proposal.lineItems?.length ? `รายละเอียด: ${proposal.lineItems.join(", ")}` : "",
    proposal.note?.trim(),
  ].filter(Boolean);
  return entries.join(" | ").slice(0, 2000);
}

export function formatImageProposal(proposal: ProposalLike) {
  if (proposal.kind === "expense") {
    const source = proposal.documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ";
    const merchant = proposal.merchant ? ` · ${proposal.merchant}` : "";
    return `${source}${merchant}\nยอด ${Number(proposal.amount || 0).toLocaleString("th-TH")} ${proposal.currency || "บาท"} · หมวด${normalizeExpenseCategory(proposal.category, `${proposal.title ?? ""} ${proposal.merchant ?? ""}`)}`;
  }
  return proposal.title || proposal.note || "ไม่พบข้อมูลที่ยืนยันได้";
}
