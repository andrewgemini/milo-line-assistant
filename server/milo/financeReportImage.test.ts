import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildFinanceReportImageUrl, renderFinanceReportImage } from "./financeReportImage";

describe("dynamic finance report image UAT", () => {
  it("renders a real PNG from the supplied finance values using the Thai vector renderer", async () => {
    const png = await renderFinanceReportImage({
      period: "month",
      income: 48_750,
      expense: 32_680,
      balance: 16_070,
      categories: { อาหาร: 12_450, เดินทาง: 8_200, ช้อปปิ้ง: 6_200, ที่อยู่อาศัย: 5_830 },
    });
    const metadata = await sharp(png).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(900);
    expect(metadata.height).toBe(1200);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });

  it("builds a signed dynamic image URL instead of a static report artwork URL", () => {
    const url = buildFinanceReportImageUrl({ period: "week", income: 1000, expense: 250, balance: 750, categories: { อาหาร: 250 } });
    expect(url).toContain("/api/milo/finance-report.png?");
    expect(url).toContain("data=");
    expect(url).toContain("sig=");
    expect(url).not.toContain("report-week.png");
  });
});
