import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invokeLLM: vi.fn(), classifyExpenseCategory: vi.fn(), typeSafeConfigured: vi.fn(() => false) }));
vi.mock("../_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("../_core/typeSafe", () => ({ classifyExpenseCategory: mocks.classifyExpenseCategory, typeSafeConfigured: mocks.typeSafeConfigured }));

import { generateFinancialInsight, suggestExpenseCategory } from "./financialAssistant";

describe("financialAssistant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prefers Jev for expense categorization when the TypeSafe key is configured", async () => {
    mocks.typeSafeConfigured.mockReturnValueOnce(true);
    mocks.classifyExpenseCategory.mockResolvedValueOnce({ category: "อาหาร", confidence: 0.93, probabilities: { อาหาร: 0.93, เดินทาง: 0.05, ทั่วไป: 0.02 }, model: "jev-latest" });
    await expect(suggestExpenseCategory("ค่ากาแฟ 40 บาท", ["อาหาร", "เดินทาง", "ทั่วไป"])).resolves.toMatchObject({ category: "อาหาร", provider: "jev" });
    expect(mocks.classifyExpenseCategory).toHaveBeenCalledWith("ค่ากาแฟ 40 บาท", ["อาหาร", "เดินทาง", "ทั่วไป"]);
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("uses the approved workhorse model with structured output and returns the supplied analysis", async () => {
    mocks.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ dataSufficiency: "limited", summary: "มีข้อมูล 2 รายการ", highlights: ["รายจ่ายอาหาร"], categoryObservations: [{ category: "อาหาร", observation: "เป็นหมวดรายจ่ายเดียว" }], suggestedActions: ["ติดตามงบอาหาร"] }) } }] });
    await expect(generateFinancialInsight({ period: "month", income: 1000, expense: 200, balance: 800, transactionCount: 2, categories: { อาหาร: 200 }, rows: [{ transactionType: "income", amount: "1000", category: "รายรับ" }, { transactionType: "expense", amount: "200", category: "อาหาร" }] })).resolves.toMatchObject({ dataSufficiency: "limited", summary: "มีข้อมูล 2 รายการ" });
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5-mini", response_format: expect.objectContaining({ type: "json_schema" }) }));
  });

  it("falls back to grounded deterministic analysis when the AI provider is unavailable", async () => {
    mocks.invokeLLM.mockRejectedValueOnce(new Error("provider unavailable"));
    const result = await generateFinancialInsight({ period: "month", income: 0, expense: 770, balance: -770, transactionCount: 3, categories: { อาหาร: 770 }, rows: [
      { transactionType: "expense", amount: "300", category: "อาหาร" },
      { transactionType: "expense", amount: "390", category: "อาหาร" },
      { transactionType: "expense", amount: "80", category: "อาหาร" },
    ] });
    expect(result.dataSufficiency).toBe("limited");
    expect(result.summary).toContain("รายจ่าย 770 บาท");
    expect(result.summary).toContain("คงเหลือ -770 บาท");
    expect(result.highlights.join(" ")).toContain("หมวดอาหาร");
    expect(result.suggestedActions.length).toBeGreaterThan(0);
  });

  it("does not accept a category outside the allowed categories", async () => {
    mocks.invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ category: "ลงทุน", confidence: 0.8, reason: "ข้อความสั้น" }) } }] });
    await expect(suggestExpenseCategory("ซื้อของ", ["อาหาร", "ทั่วไป"])).resolves.toMatchObject({ category: "ทั่วไป", confidence: 0.8 });
  });
});
