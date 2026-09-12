import { describe, expect, it } from "vitest";
import { parseMiloCommand } from "./commandParser";
import { budgetStatusCopy, getBudgetMetrics } from "./budgetStatus";
import { buildSaveResultSvg } from "./saveResultImage";

describe("Milo save-result behavior", () => {
  it("records ค่ากาแฟ 80 บาท as coffee in the food-expense category", () => {
    expect(parseMiloCommand("ค่ากาแฟ 80 บาท")).toEqual({
      type: "expense",
      amount: 80,
      category: "อาหาร",
      note: "กาแฟ",
    });
    expect(parseMiloCommand("จ่ายค่ากาแฟ 80 บาท")).toEqual({
      type: "expense",
      amount: 80,
      category: "อาหาร",
      note: "กาแฟ",
    });
  });

  it("distinguishes percent used from percent over budget", () => {
    expect(getBudgetMetrics(40, 1000)).toMatchObject({ usagePercent: 4, overPercent: 0, isOverBudget: false });
    expect(budgetStatusCopy("อาหาร", 40, 1000)).toBe("หมวดอาหารใช้ไป 4% ของงบแล้วน่ะจ๊ะ");

    expect(getBudgetMetrics(1040, 1000)).toMatchObject({ usagePercent: 104, overPercent: 4, isOverBudget: true });
    expect(budgetStatusCopy("อาหาร", 1040, 1000)).toBe("หมวดอาหารเกินงบ 4% แล้วน่ะจ๊ะ");
  });

  it("builds the dynamic save image from real transaction data only", () => {
    const svg = buildSaveResultSvg({
      transactionType: "expense",
      item: "กาแฟ",
      category: "อาหาร",
      amount: 80,
      occurredAt: new Date("2026-09-12T09:18:00.000Z"),
      budgetSpent: 1040,
      budgetLimit: 1000,
    });

    expect(svg).toContain("กาแฟ");
    expect(svg).toContain("ค่าอาหาร");
    expect(svg).toContain("฿80");
    expect(svg).toContain("12 ก.ย. 2569");
    expect(svg).toContain("16:18");
    expect(svg).toContain("หมวดอาหารเกินงบ 4% แล้วน่ะจ๊ะ");
    expect(svg).not.toContain("น่ะลูก");
    expect(svg).not.toContain("กินกาแฟ");
    expect(svg).not.toContain("฿220");
  });
});
