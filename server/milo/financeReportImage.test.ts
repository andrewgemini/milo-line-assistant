import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildFinanceReportImageUrl, renderFinanceReportImage } from "./financeReportImage";

describe("dynamic finance report image UAT", () => {
  it("renders the new Milo summary-v4 layout from real finance values and recent transactions", async () => {
    const png = await renderFinanceReportImage({
      period: "month",
      income: 48_750,
      expense: 32_680,
      balance: 16_070,
      transactionCount: 11,
      start: new Date("2026-08-31T17:00:00.000Z"),
      end: new Date("2026-09-30T17:00:00.000Z"),
      categories: { อาหาร: 12_450, เดินทาง: 8_200, ช้อปปิ้ง: 6_200, ที่อยู่อาศัย: 5_830 },
      rows: [
        { transactionType: "income", amount: 35_000, category: "เงินเดือน", note: "เงินเดือน", occurredAt: new Date("2026-09-26T02:00:00.000Z") },
        { transactionType: "expense", amount: 150, category: "อาหาร", note: "กินข้าว", occurredAt: new Date("2026-09-25T05:45:00.000Z") },
      ],
    });
    const metadata = await sharp(png).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1350);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });

  it("builds a signed summary-v4 dynamic URL instead of serving the static mockup with example numbers", () => {
    const url = buildFinanceReportImageUrl({ period: "week", income: 1000, expense: 250, balance: 750, transactionCount: 2, categories: { อาหาร: 250 } });
    expect(url).toContain("/api/milo/finance-report.png?");
    expect(url).toContain("data=");
    expect(url).toContain("sig=");
    expect(url).toContain("render=summary-v4");
    expect(url).not.toContain("report-week.png");
  });
});
