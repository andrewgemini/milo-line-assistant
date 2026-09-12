import express from "express";
import sharp from "sharp";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { registerSaveResultImageRoute } from "./saveResultImage";

describe("save-result vector image route UAT", () => {
  it("renders the production PNG route with real Thai transaction text using vector glyphs", async () => {
    const app = express();
    registerSaveResultImageRoute(app);
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const params = new URLSearchParams({
        transactionType: "expense",
        item: "กาแฟ",
        category: "อาหาร",
        amount: "80",
        occurredAt: "2026-09-12T09:18:00.000Z",
        budgetSpent: "1040",
        budgetLimit: "1000",
      });
      const response = await fetch(`http://127.0.0.1:${port}/api/milo/save-result.png?${params}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
      const png = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(png).metadata();
      expect(metadata.format).toBe("png");
      expect(metadata.width).toBeGreaterThanOrEqual(800);
      expect(metadata.height).toBeGreaterThanOrEqual(900);
      expect(png.subarray(1, 4).toString()).toBe("PNG");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
