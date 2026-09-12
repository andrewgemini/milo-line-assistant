import type { ImageAnalysis, ImageProposal } from "./imageAnalysis";
import { parseExtractedDate } from "./receiptUtils";

export type ImageExpenseEdit =
  | { field: "amount"; value: number }
  | { field: "category" | "date" | "merchant" | "note"; value: string };

export function applyImageExpenseEdit(analysis: ImageAnalysis, edit: ImageExpenseEdit) {
  const index = analysis.proposals.findIndex(item => item.kind === "expense" && Number(item.amount) > 0);
  if (index < 0) throw new Error("ยังไม่พบรายการค่าใช้จ่ายจากรูปที่แก้ไขได้");
  const proposal = { ...analysis.proposals[index] } as ImageProposal;
  if (proposal.kind !== "expense") throw new Error("รายการจากรูปนี้ไม่ใช่ค่าใช้จ่ายที่แก้ไขได้");

  if (edit.field === "amount") {
    if (!Number.isFinite(edit.value) || edit.value <= 0 || edit.value > 1_000_000_000) throw new Error("ยอดที่แก้ไขต้องมากกว่า 0 บาท");
    proposal.amount = Math.round(edit.value * 100) / 100;
  } else if (edit.field === "category") {
    const category = edit.value.trim();
    if (!category || category.length > 100) throw new Error("กรุณาระบุหมวดที่ต้องการแก้ไข");
    proposal.category = category;
  } else if (edit.field === "date") {
    const parsed = parseExtractedDate(edit.value);
    if (!parsed) throw new Error("รูปแบบวันที่ไม่ถูกต้อง เช่น 27/08/2569 หรือ 2026-08-27");
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(parsed);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
    proposal.dateText = `${part("year")}-${part("month")}-${part("day")}`;
  } else if (edit.field === "merchant") {
    const merchant = edit.value.trim();
    if (!merchant || merchant.length > 200) throw new Error("กรุณาระบุร้านค้าหรือผู้รับที่ต้องการแก้ไข");
    proposal.merchant = merchant;
  } else {
    proposal.note = edit.value.trim().slice(0, 1000);
  }

  const proposals = [...analysis.proposals];
  proposals[index] = proposal;
  return { ...analysis, proposals, editedProposal: proposal };
}
