import express from "express";
import sharp from "sharp";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { findMissingGlyphs } from "./vectorText";
import { registerSaveResultImageRoute, saveResultDisplayText, saveResultPrimaryFontSize } from "./saveResultImage";

describe("save-result vector image route UAT", () => {
  it("cleans OCR category noise and drops operational fields before rendering", () => {
    const clean = saveResultDisplayText("ร้านค้า/คู่ค้า: INDI Coffee as! อาหาร | รายการ: รายการจากใบเสร็จ");
    expect(clean.primary).toBe("ร้านค้า/คู่ค้า: INDI Coffee");
    expect(clean.primaryLines.join("")).toBe("ร้านค้า/คู่ค้า: INDI Coffee");
    expect(clean.secondary).toBe("รายการ: รายการจากใบเสร็จ");

    const operational = saveResultDisplayText("ร้านค้า/คู่ค้า: ชื่อพนักงาน: จ๊ะจ๋า | รายการ: รายการจากใบเสร็จ");
    expect(operational.primary).toBe("รายการ: รายการจากใบเสร็จ");
    expect(operational.primary).not.toContain("พนักงาน");
  });

  it("wraps a long K+ merchant across two lines without losing the merchant name", () => {
    const note = "ร้านค้า/คู่ค้า: คาเฟ่ อเมซอน สน.ปตท.บจก.โรสท์บีนเฮ้าส์ | รายการ: กาแฟ | เลขที่: 016256150715DQR03239";
    const display = saveResultDisplayText(note);
    expect(display.primaryLines.length).toBe(2);
    expect(display.primaryLines.join("")).toBe("ร้านค้า/คู่ค้า: คาเฟ่ อเมซอน สน.ปตท.บจก.โรสท์บีนเฮ้าส์");
    expect(display.primaryLines.join("")).not.toContain("...");
    expect(display.secondary).toContain("รายการ: กาแฟ");
    expect(display.secondary).toContain("เลขที่: 016256150715DQR03239");
  });

  it("shrinks a medium-length Thai merchant before it reaches the amount column", () => {
    const display = saveResultDisplayText("ร้านค้า/คู่ค้า: ร้านกระเพรากลางซอย | รายการ: รายการจากใบเสร็จ");
    expect(display.primary).toBe("ร้านค้า/คู่ค้า: ร้านกระเพรากลางซอย");
    expect(display.primaryLines).toEqual(["ร้านค้า/คู่ค้า: ร้านกระเพรากลางซอย"]);
    expect(saveResultPrimaryFontSize(display.primary, display.primaryLines.length)).toBe(30);
    expect(saveResultPrimaryFontSize("กินกาแฟ", 1)).toBe(47);
  });

  it("renders the exact กินกาแฟ 80 production case without missing Thai/number/symbol glyphs", async () => {
    const expectedText = [
      "รายจ่าย",
      "• ค่าอาหาร",
      "กินกาแฟ",
      "฿80",
      "13 ก.ย. 2569 • 01:27",
      "กินกาแฟ • ค่าอาหาร • 80 บาท",
    ];
    for (const text of expectedText) {
      expect(findMissingGlyphs(text), text).toEqual([]);
      expect(findMissingGlyphs(text, true), `bold ${text}`).toEqual([]);
    }

    const app = express();
    registerSaveResultImageRoute(app);
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const params = new URLSearchParams({
        transactionType: "expense",
        item: "กินกาแฟ",
        category: "อาหาร",
        amount: "80",
        occurredAt: "2026-09-12T18:27:00.000Z",
        budgetSpent: "80",
        budgetLimit: "0",
      });
      const response = await fetch(`http://127.0.0.1:${port}/api/milo/save-result.png?${params}`, { headers: { connection: "close" } });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
      const png = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(png).metadata();
      expect(metadata.format).toBe("png");
      expect(metadata.width).toBeGreaterThanOrEqual(800);
      expect(metadata.height).toBeGreaterThanOrEqual(900);
      expect(png.subarray(1, 4).toString()).toBe("PNG");
    } finally {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  });
});
