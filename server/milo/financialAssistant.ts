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

export function deterministicFinancialInsight(input: { period: FinancePeriod; income: number; expense: number; balance: number; transactionCount: number; categories: Record<string, number>; rows: ReportTransaction[] }): FinancialInsight {
  const periodLabel: Record<FinancePeriod, string> = { day: "วันนี้", week: "สัปดาห์นี้", month: "เดือนนี้", year: "ปีนี้" };
  const money = (value: number) => Number(value).toLocaleString("th-TH-u-nu-latn", { maximumFractionDigits: 2 });
  const categories = Object.entries(input.categories)
    .filter(([, amount]) => Number(amount) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const dataSufficiency: FinancialInsight["dataSufficiency"] = input.transactionCount === 0 ? "insufficient" : input.transactionCount < 5 ? "limited" : "adequate";

  if (input.transactionCount === 0) {
    return {
      dataSufficiency,
      summary: `${periodLabel[input.period]}ยังไม่มีธุรกรรมที่บันทึก จึงยังวิเคราะห์พฤติกรรมการเงินไม่ได้`,
      highlights: [],
      categoryObservations: [],
      suggestedActions: ["เริ่มบันทึกรายรับและรายจ่าย แล้วกลับมาพิมพ์ “วิเคราะห์” อีกครั้ง"],
    };
  }

  const top = categories[0];
  const share = top && input.expense > 0 ? Math.round((Number(top[1]) / input.expense) * 100) : 0;
  const highlights: string[] = [];
  if (input.balance < 0) highlights.push(`ยอดสุทธิเป็นลบ ${money(Math.abs(input.balance))} บาท`);
  else highlights.push(`ยอดสุทธิคงเหลือ ${money(input.balance)} บาท`);
  if (top) highlights.push(`รายจ่ายสูงสุดคือหมวด${top[0]} ${money(Number(top[1]))} บาท${share ? ` (ประมาณ ${share}% ของรายจ่าย)` : ""}`);

  const categoryObservations = categories.slice(0, 3).map(([category, amount]) => ({
    category,
    observation: input.expense > 0
      ? `${money(Number(amount))} บาท หรือประมาณ ${Math.round((Number(amount) / input.expense) * 100)}% ของรายจ่าย`
      : `${money(Number(amount))} บาท`,
  }));

  const suggestedActions: string[] = [];
  if (top) suggestedActions.push(`ตรวจงบหมวด${top[0]}เทียบกับยอดใช้จริง ${money(Number(top[1]))} บาท`);
  if (input.balance < 0) suggestedActions.push("ทบทวนรายจ่ายที่ตัดหรือลดได้ก่อนเพิ่มรายการใหม่");
  else suggestedActions.push("ติดตามรายจ่ายเทียบงบต่อเนื่องเพื่อรักษายอดคงเหลือ");

  return {
    dataSufficiency,
    summary: `${periodLabel[input.period]}มีรายรับ ${money(input.income)} บาท รายจ่าย ${money(input.expense)} บาท คงเหลือ ${money(input.balance)} บาท จาก ${input.transactionCount.toLocaleString("th-TH-u-nu-latn")} รายการ`,
    highlights,
    categoryObservations,
    suggestedActions,
  };
}

export async function generateFinancialInsight(input: { period: FinancePeriod; income: number; expense: number; balance: number; transactionCount: number; categories: Record<string, number>; rows: ReportTransaction[] }): Promise<FinancialInsight> {
  try {
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
  } catch (error) {
    console.warn("[Milo Analysis] AI unavailable; using deterministic financial insight", { error: error instanceof Error ? error.message : "unknown" });
    return deterministicFinancialInsight(input);
  }
}
