import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

vi.mock("../db", () => ({
  getFinanceAccountAccess: vi.fn(),
  listTransactionsForExport: vi.fn(),
}));

import * as db from "../db";
import { buildFinanceExportUrl, registerFinanceExportRoute } from "./financeExport";

const oldSecret = process.env.LINE_CHANNEL_SECRET;
const oldBase = process.env.MILO_APP_BASE_URL;

describe("finance export UAT route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINE_CHANNEL_SECRET = "uat-export-secret";
    vi.mocked(db.getFinanceAccountAccess).mockResolvedValue({ account: { id: 7 }, membership: { role: "owner" } } as never);
    vi.mocked(db.listTransactionsForExport).mockResolvedValue([
      { id: 1, occurredAt: new Date("2026-09-12T02:30:00.000Z"), transactionType: "income", category: "เงินเดือน", note: "เงินเดือน", amount: "35000.00", source: "line_text" },
      { id: 2, occurredAt: new Date("2026-09-12T05:00:00.000Z"), transactionType: "expense", category: "อาหาร", note: "กาแฟ", amount: "80.00", source: "line_text" },
    ] as never);
  });

  afterEach(() => {
    if (oldSecret === undefined) delete process.env.LINE_CHANNEL_SECRET; else process.env.LINE_CHANNEL_SECRET = oldSecret;
    if (oldBase === undefined) delete process.env.MILO_APP_BASE_URL; else process.env.MILO_APP_BASE_URL = oldBase;
  });

  async function withServer(run: (base: string) => Promise<void>) {
    const app = express();
    registerFinanceExportRoute(app);
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      await run(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  it("downloads a signed CSV containing real transaction rows for the authorized account", async () => {
    await withServer(async base => {
      process.env.MILO_APP_BASE_URL = base;
      const response = await fetch(buildFinanceExportUrl({ lineUserId: "U123", financeAccountId: 7, format: "csv" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("content-disposition")).toContain("milo-transactions-");
      const text = await response.text();
      expect(text).toContain("วันที่-เวลา,ประเภท,หมวด,รายการ,จำนวนเงิน,แหล่งที่มา");
      expect(text).toContain("รายรับ,เงินเดือน,เงินเดือน,35000,line_text");
      expect(text).toContain("รายจ่าย,อาหาร,กาแฟ,80,line_text");
      expect(db.listTransactionsForExport).toHaveBeenCalledWith("U123", 7);
    });
  });

  it("downloads a valid XLSX workbook with the same real account rows", async () => {
    await withServer(async base => {
      process.env.MILO_APP_BASE_URL = base;
      const response = await fetch(buildFinanceExportUrl({ lineUserId: "U123", financeAccountId: 7, format: "xlsx" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
      const buffer = Buffer.from(await response.arrayBuffer());
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ "ประเภท": "รายรับ", "หมวด": "เงินเดือน", "รายการ": "เงินเดือน", "จำนวนเงิน": 35000 });
      expect(rows[1]).toMatchObject({ "ประเภท": "รายจ่าย", "หมวด": "อาหาร", "รายการ": "กาแฟ", "จำนวนเงิน": 80 });
    });
  });

  it("rejects a signed link when the requested finance account is not accessible", async () => {
    vi.mocked(db.getFinanceAccountAccess).mockResolvedValue(undefined);
    await withServer(async base => {
      process.env.MILO_APP_BASE_URL = base;
      const response = await fetch(buildFinanceExportUrl({ lineUserId: "U123", financeAccountId: 99, format: "csv" }));
      expect(response.status).toBe(403);
      expect(db.listTransactionsForExport).not.toHaveBeenCalled();
    });
  });
});
