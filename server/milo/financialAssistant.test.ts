import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));

import { generateFinancialInsight, suggestExpenseCategory } from "./financialAssistant";

describe("financialAssistant", () => {
  it("uses the approved workhorse model with structured output and returns the supplied analysis", async () => {
    mocks.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ dataSufficiency: "limited", summary: "มีข้อมูล 2 รายการ", highlights: ["รายจ่ายอาหาร"], categoryObservations: [{ category: "อาหาร", observation: "เป็นหมวดรายจ่ายเดียว" }], suggestedActions: ["ติดตามงบอาหาร"] }) } }] });
    await expect(generateFinancialInsight({ period: "month", income: 1000, expense: 200, balance: 800, transactionCount: 2, categories: { อาหาร: 200 }, rows: [{ transactionType: "income", amount: "1000", category: "รายรับ" }, { transactionType: "expense", amount: "200", category: "อาหาร" }] })).resolves.toMatchObject({ dataSufficiency: "limited", summary: "มีข้อมูล 2 รายการ" });
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5-mini", response_format: expect.objectContaining({ type: "json_schema" }) }));
  });

  it("does not accept a category outside the allowed categories", async () => {
    mocks.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ category: "ลงทุน", confidence: 0.8, reason: "ข้อความสั้น" }) } }] });
    await expect(suggestExpenseCategory("ซื้อของ", ["อาหาร", "ทั่วไป"])).resolves.toMatchObject({ category: "ทั่วไป", confidence: 0.8 });
  });
});
