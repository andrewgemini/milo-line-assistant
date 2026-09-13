import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildRichMenuDataImageUrl, isDynamicRichMenuArtwork, renderRichMenuDataImage } from "./richMenuDataImage";

describe("dynamic rich-menu data images", () => {
  it.each(["analysis", "budget", "transactions", "categories"] as const)("renders %s with real text as a 1080x1350 PNG", async key => {
    const image = await renderRichMenuDataImage(key, "รายรับ 12,500 บาท\nรายจ่าย 4,250 บาท\nคงเหลือ 8,250 บาท\n• อาหาร 1,250 บาท");
    const meta = await sharp(image).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  });

  it("uses signed no-cache versioned URLs for data-driven artwork only", () => {
    process.env.LINE_CHANNEL_SECRET = "test-secret";
    const url = buildRichMenuDataImageUrl("analysis", "ข้อมูลจริง");
    expect(url).toContain("/api/milo/rich-menu-card.png?");
    expect(url).toContain("sig=");
    expect(url).toContain("render=richmenu-data-v1");
    expect(isDynamicRichMenuArtwork("record")).toBe(false);
    expect(isDynamicRichMenuArtwork("analysis")).toBe(true);
  });
});
