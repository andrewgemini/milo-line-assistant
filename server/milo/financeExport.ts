import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import * as XLSX from "xlsx";
import * as db from "../db";

export type FinanceExportFormat = "csv" | "xlsx";

function exportSecret() {
  const value = process.env.LINE_CHANNEL_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error("Export signing secret is not configured");
  return value;
}

function signaturePayload(lineUserId: string, financeAccountId: number, format: FinanceExportFormat, expires: number) {
  return `${lineUserId}|${financeAccountId}|${format}|${expires}`;
}

function sign(lineUserId: string, financeAccountId: number, format: FinanceExportFormat, expires: number) {
  return crypto.createHmac("sha256", exportSecret()).update(signaturePayload(lineUserId, financeAccountId, format, expires)).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function buildFinanceExportUrl(input: { lineUserId: string; financeAccountId: number; format: FinanceExportFormat; ttlSeconds?: number }) {
  const expires = Math.floor(Date.now() / 1000) + Math.min(Math.max(input.ttlSeconds ?? 600, 60), 3600);
  const sig = sign(input.lineUserId, input.financeAccountId, input.format, expires);
  const base = (process.env.MILO_APP_BASE_URL ?? process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? "https://milo-line-app.vercel.app").replace(/\/+$/, "");
  const params = new URLSearchParams({ user: input.lineUserId, account: String(input.financeAccountId), format: input.format, expires: String(expires), sig });
  return `${base}/api/milo/export?${params.toString()}`;
}

function thaiDateTime(value: Date) {
  return new Intl.DateTimeFormat("th-TH-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(value);
}

function exportRows(rows: Awaited<ReturnType<typeof db.listTransactionsForExport>>) {
  return rows.map(row => ({
    "วันที่-เวลา": thaiDateTime(row.occurredAt),
    "ประเภท": row.transactionType === "income" ? "รายรับ" : "รายจ่าย",
    "หมวด": row.category,
    "รายการ": row.note ?? "",
    "จำนวนเงิน": Number(row.amount),
    "แหล่งที่มา": row.source,
  }));
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: ReturnType<typeof exportRows>) {
  const headers = ["วันที่-เวลา", "ประเภท", "หมวด", "รายการ", "จำนวนเงิน", "แหล่งที่มา"] as const;
  return `\uFEFF${headers.join(",")}\n${rows.map(row => headers.map(key => csvCell(row[key])).join(",")).join("\n")}`;
}

export function registerFinanceExportRoute(app: Express) {
  app.get("/api/milo/export", async (req: Request, res: Response) => {
    try {
      const lineUserId = String(req.query.user ?? "");
      const financeAccountId = Number(req.query.account ?? 0);
      const format: FinanceExportFormat = req.query.format === "xlsx" ? "xlsx" : "csv";
      const expires = Number(req.query.expires ?? 0);
      const supplied = String(req.query.sig ?? "");
      if (!lineUserId || !Number.isInteger(financeAccountId) || financeAccountId <= 0 || !Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000) || !supplied) return res.status(401).type("text/plain").send("Export link expired or invalid");
      const expected = sign(lineUserId, financeAccountId, format, expires);
      if (!safeEqual(supplied, expected)) return res.status(401).type("text/plain").send("Export link expired or invalid");
      const access = await db.getFinanceAccountAccess(financeAccountId, lineUserId);
      if (!access) return res.status(403).type("text/plain").send("No access to this finance account");
      const rows = exportRows(await db.listTransactionsForExport(lineUserId, financeAccountId));
      const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (format === "csv") {
        res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="milo-transactions-${stamp}.csv"`, "Cache-Control": "private, no-store" });
        return res.status(200).send(toCsv(rows));
      }
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, sheet, "Transactions");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
      res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="milo-transactions-${stamp}.xlsx"`, "Cache-Control": "private, no-store" });
      return res.status(200).send(buffer);
    } catch (error) {
      console.error("[Milo Export] failed", error);
      return res.status(500).type("text/plain").send("Unable to export transactions");
    }
  });
}
