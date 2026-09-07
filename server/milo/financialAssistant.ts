import { invokeLLM } from "../_core/llm";
import type { FinancePeriod, ReportTransaction } from "./financeReport";

export type FinancialInsight = {
  dataSufficiency: "insufficient" | "limited" | "adequate";
  summary: string;
  highlights: string[];
  categoryObservations: Array<{ category: string; observation: string }>;
  suggestedActions: string[];
};

const categorySchema = {
  type: "object", properties: {
    category: { type: "string" }, confidence: { type: "number" }, reason: { type: "string" },
  }, required: ["category", "confidence", "reason"], additionalProperties: false,
} as const;

export async function suggestExpenseCategory(note: string, allowedCategories: string[]) {
  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: "จัดหมวดรายจ่ายภาษาไทยจากข้อความสั้น เลือกได้เฉพาะ allowedCategories เท่านั้น หากไม่มั่นใจให้เลือก ทั่วไป ห้ามเดารายละเอียดที่ไม่มีในข้อความ" },
      { role: "user", content: JSON.stringify({ note, allowedCategories }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_expense_category", strict: true, schema: categorySchema } },
  });
  const content = response.choices[0]?.message.content;
  if (!content || typeof content !== "string") throw new Error("AI ไม่สามารถจัดหมวดได้");
  const result = JSON.parse(content) as { category: string; confidence: number; reason: string };
  return { ...result, category: allowedCategories.includes(result.category) ? result.category : "ทั่วไป" };
}

const schema = {
  type: "object", properties: {
    dataSufficiency: { type: "string", enum: ["insufficient", "limited", "adequate"] },
    summary: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    categoryObservations: { type: "array", items: { type: "object", properties: { category: { type: "string" }, observation: { type: "string" } }, required: ["category", "observation"], additionalProperties: false } },
    suggestedActions: { type: "array", items: { type: "string" } },
  }, required: ["dataSufficiency", "summary", "highlights", "categoryObservations", "suggestedActions"], additionalProperties: false,
} as const;

export async function generateFinancialInsight(input: { period: FinancePeriod; income: number; expense: number; balance: number; transactionCount: number; categories: Record<string, number>; rows: ReportTransaction[] }): Promise<FinancialInsight> {
  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: "คุณคือไมโล ผู้ช่วยวิเคราะห์รายรับรายจ่ายภาษาไทย ใช้เฉพาะข้อมูลที่ได้รับเท่านั้น ห้ามแต่งข้อมูลหรืออ้างว่าเห็นแนวโน้มหากข้อมูลไม่เพียงพอ ระบุ dataSufficiency=insufficient เมื่อไม่มีธุรกรรม, limited เมื่อมีน้อยกว่า 5 ธุรกรรม, adequate เมื่อมีอย่างน้อย 5 ธุรกรรม คำแนะนำต้องเป็นการจัดการงบประมาณเชิงปฏิบัติ ไม่ใช่คำแนะนำลงทุนหรือภาษี" },
      { role: "user", content: JSON.stringify({ period: input.period, income: input.income, expense: input.expense, balance: input.balance, transactionCount: input.transactionCount, categories: input.categories, transactions: input.rows.map(row => ({ type: row.transactionType, amount: Number(row.amount), category: row.category })) }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_financial_insight", strict: true, schema } },
  });
  const content = response.choices[0]?.message.content;
  if (!content || typeof content !== "string") throw new Error("AI ไม่สามารถสร้างสรุปการเงินได้");
  return JSON.parse(content) as FinancialInsight;
}
