import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { findMissingGlyphs, normalizeRenderText, vectorTextSvg } from "./vectorText";

const productionSamples = [
  "รายจ่าย",
  "• ค่าอาหาร",
  "กินกาแฟ",
  "80",
  "฿80",
  "13 ก.ย. 2569 • 01:27",
  "กินกาแฟ • ค่าอาหาร • 80 บาท",
  "0123456789",
  "฿•:/-,.%()",
  "MILO • FINANCE",
];

describe("Milo vector text glyph coverage", () => {
  it("covers all Thai, Latin digits and punctuation used by save-result images", () => {
    for (const bold of [false, true]) {
      for (const sample of productionSamples) {
        expect(findMissingGlyphs(sample, bold), `${bold ? "bold" : "regular"}: ${sample}`).toEqual([]);
      }
    }
  });

  it("normalizes non-breaking and zero-width characters before shaping", () => {
    expect(normalizeRenderText("80\u00A0บาท\u200B")).toBe("80 บาท");
  });

  it("renders the exact failing UAT footer to a rasterizable SVG without .notdef glyphs", async () => {
    const svg = vectorTextSvg("กินกาแฟ • ค่าอาหาร • 80 บาท", {
      width: 700,
      fontSize: 30,
      color: "#3D5870",
    });
    const png = await sharp(svg).png().toBuffer();
    const metadata = await sharp(png).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(700);
    expect(svg.toString("utf8")).not.toContain(".notdef");
  });

  it("reports unsupported glyphs instead of silently rendering tofu", () => {
    const missing = findMissingGlyphs("🧪");
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0]?.codePoint).toBe("U+1F9EA");
  });
});
