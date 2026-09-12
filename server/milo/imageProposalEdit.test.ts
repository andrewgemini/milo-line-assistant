import { describe, expect, it } from "vitest";
import { parseMiloCommand } from "./commandParser";
import { applyImageExpenseEdit } from "./imageProposalEdit";
import type { ImageAnalysis } from "./imageAnalysis";

const analysis = (): ImageAnalysis => ({
  summary: "พบใบเสร็จ",
  confidence: 0.9,
  proposals: [{
    kind: "expense",
    documentType: "receipt",
    title: "กาแฟ",
    merchant: "ร้านเดิม",
    dateText: "2026-09-12",
    timeText: "10:00",
    amount: 80,
    currency: "บาท",
    category: "อาหาร",
    paymentMethod: "PromptPay",
    receiptNumber: "R1",
    lineItems: ["ลาเต้"],
    note: "ยอดสุทธิ",
  }],
});

describe("receipt edit before save UAT", () => {
  it("parses conversational receipt edits without requiring an accounting form", () => {
    expect(parseMiloCommand("แก้ใบเสร็จ ยอด 150 บาท")).toEqual({ type: "imageEdit", field: "amount", value: 150 });
    expect(parseMiloCommand("แก้สลิป หมวด เดินทาง")).toEqual({ type: "imageEdit", field: "category", value: "เดินทาง" });
    expect(parseMiloCommand("แก้ใบเสร็จ วันที่ 27/08/2569")).toEqual({ type: "imageEdit", field: "date", value: "27/08/2569" });
    expect(parseMiloCommand("แก้ใบเสร็จ ร้านค้า Milo Cafe")).toEqual({ type: "imageEdit", field: "merchant", value: "Milo Cafe" });
  });

  it("updates only the proposed expense data and normalizes an edited Thai date", () => {
    const amountEdited = applyImageExpenseEdit(analysis(), { field: "amount", value: 150 });
    expect(amountEdited.editedProposal.amount).toBe(150);
    expect(amountEdited.proposals[0].merchant).toBe("ร้านเดิม");

    const dateEdited = applyImageExpenseEdit(analysis(), { field: "date", value: "27/08/2569" });
    expect(dateEdited.editedProposal.dateText).toBe("2026-08-27");
  });

  it("rejects unsafe values instead of silently corrupting the proposal", () => {
    expect(() => applyImageExpenseEdit(analysis(), { field: "amount", value: 0 })).toThrow("มากกว่า 0");
    expect(() => applyImageExpenseEdit(analysis(), { field: "date", value: "31/02/2569" })).toThrow("รูปแบบวันที่ไม่ถูกต้อง");
  });
});
