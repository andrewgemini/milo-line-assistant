import { describe, expect, it } from "vitest";
import { buildMiloFinancePdfHtml } from "./financePdf";

describe("Milo finance PDF", () => {
  it("renders only supplied financial values and escapes transaction text", () => {
    const html = buildMiloFinancePdfHtml({ income: 1000, expense: 250, balance: 750, categories: { อาหาร: 250 }, generatedAt: new Date("2026-08-27T00:00:00.000Z"), transactions: [{ transactionType: "expense", amount: 250, category: "อาหาร", note: "<script>alert(1)</script>", occurredAt: "2026-08-27T00:00:00.000Z" }] });
    expect(html).toContain("MILO • FINANCE");
    expect(html).toContain("฿1,000");
    expect(html).toContain("อาหาร");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
