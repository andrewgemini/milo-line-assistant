import { afterEach, describe, expect, it } from "vitest";
import { buildFinanceExportUrl } from "./financeExport";

const previousSecret = process.env.LINE_CHANNEL_SECRET;
const previousBase = process.env.MILO_APP_BASE_URL;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.LINE_CHANNEL_SECRET;
  else process.env.LINE_CHANNEL_SECRET = previousSecret;
  if (previousBase === undefined) delete process.env.MILO_APP_BASE_URL;
  else process.env.MILO_APP_BASE_URL = previousBase;
});

describe("finance export links", () => {
  it("creates a short-lived signed CSV link without exposing the signing secret", () => {
    process.env.LINE_CHANNEL_SECRET = "test-line-secret";
    process.env.MILO_APP_BASE_URL = "https://milo.example.test";
    const before = Math.floor(Date.now() / 1000);
    const url = new URL(buildFinanceExportUrl({ lineUserId: "U123", financeAccountId: 7, format: "csv", ttlSeconds: 600 }));
    expect(url.origin).toBe("https://milo.example.test");
    expect(url.pathname).toBe("/api/milo/export");
    expect(url.searchParams.get("user")).toBe("U123");
    expect(url.searchParams.get("account")).toBe("7");
    expect(url.searchParams.get("format")).toBe("csv");
    expect(Number(url.searchParams.get("expires"))).toBeGreaterThanOrEqual(before + 590);
    expect(url.searchParams.get("sig")).toMatch(/^[a-f0-9]{64}$/);
    expect(url.toString()).not.toContain("test-line-secret");
  });
});
