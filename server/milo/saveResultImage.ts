import type { Express, Request, Response } from "express";
import sharp from "sharp";

const money = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const thaiDateTime = (value: Date) => new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
}).format(value);

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;" }[char]!));
}

function parseDate(value: string | null) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function registerSaveResultImageRoute(app: Express) {
  app.get("/api/milo/save-result.png", async (req: Request, res: Response) => {
    try {
      const item = String(req.query.item ?? "รายการ").trim().slice(0, 80) || "รายการ";
      const category = String(req.query.category ?? "อาหาร").trim().slice(0, 50) || "อาหาร";
      const amount = Number(req.query.amount ?? 0);
      const budgetSpent = Number(req.query.budgetSpent ?? 0);
      const budgetLimit = Number(req.query.budgetLimit ?? 0);
      const budgetPercent = Number.isFinite(Number(req.query.budgetPercent))
        ? Number(req.query.budgetPercent)
        : budgetLimit > 0 ? Math.round((budgetSpent / budgetLimit) * 100) : 0;
      const occurredAt = parseDate(typeof req.query.occurredAt === "string" ? req.query.occurredAt : null);
      const percent = Math.max(0, Math.min(100, Math.round(budgetPercent)));

      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).type("text/plain").send("Invalid amount");

      const baseUrl = (process.env.MILO_RICH_MENU_IMAGE_BASE_URL ?? "https://milo-line-app.vercel.app/milo-richmenu").replace(/\/+$/, "");
      const templateResponse = await fetch(`${baseUrl}/save-complete.png`, { cache: "no-store" });
      if (!templateResponse.ok) return res.status(502).type("text/plain").send("Save result template unavailable");
      const template = Buffer.from(await templateResponse.arrayBuffer());

      const svg = `<svg width="933" height="1085" viewBox="0 0 933 1085" xmlns="http://www.w3.org/2000/svg">
        <defs><filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity=".12"/></filter></defs>
        <rect x="245" y="390" width="640" height="165" rx="24" fill="#F7FFFB" opacity=".97" filter="url(#shadow)"/>
        <text x="280" y="435" font-family="sans-serif" font-size="25" font-weight="700" fill="#24977B">รายการ</text>
        <text x="280" y="492" font-family="sans-serif" font-size="48" font-weight="800" fill="#25425A">${escapeXml(item)}</text>
        <rect x="245" y="555" width="640" height="145" rx="24" fill="#FFF5FA" opacity=".98" filter="url(#shadow)"/>
        <text x="280" y="600" font-family="sans-serif" font-size="24" font-weight="700" fill="#D74475">หมวดหมู่</text>
        <text x="280" y="655" font-family="sans-serif" font-size="45" font-weight="800" fill="#D74475">${escapeXml(category)}</text>
        <rect x="245" y="700" width="640" height="145" rx="24" fill="#F2FCF8" opacity=".98" filter="url(#shadow)"/>
        <text x="280" y="745" font-family="sans-serif" font-size="24" font-weight="700" fill="#168C70">จำนวนเงิน</text>
        <text x="280" y="802" font-family="sans-serif" font-size="46" font-weight="800" fill="#168C70">฿${money(amount)} บาท</text>
        <rect x="245" y="845" width="640" height="145" rx="24" fill="#F5F4FF" opacity=".98" filter="url(#shadow)"/>
        <text x="280" y="890" font-family="sans-serif" font-size="24" font-weight="700" fill="#7567A7">วันที่ - เวลา</text>
        <text x="280" y="944" font-family="sans-serif" font-size="31" font-weight="700" fill="#2F4055">${escapeXml(thaiDateTime(occurredAt))}</text>
        ${budgetLimit > 0 ? `<rect x="155" y="990" width="730" height="78" rx="20" fill="#F3FBF8" stroke="#B8E9D9"/>
          <text x="190" y="1025" font-family="sans-serif" font-size="20" font-weight="700" fill="#267C68">${escapeXml(category)} · ใช้ไป ${percent}%</text>
          <text x="190" y="1052" font-family="sans-serif" font-size="17" fill="#58706A">(${money(budgetSpent)} / ${money(budgetLimit)} บาท) · ${percent <= 80 ? "ยังอยู่ในเกณฑ์ที่ดีอยู่จ้า น่ะจ๊ะ" : percent <= 100 ? "ใกล้เต็มงบแล้วนะ น่ะจ๊ะ" : "เกินงบแล้วนะ น่ะจ๊ะ"}</text>` : ""}
      </svg>`;

      const output = await sharp(template).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
      res.set({ "Content-Type": "image/png", "Cache-Control": "private, no-store, max-age=0" });
      return res.status(200).send(output);
    } catch (error) {
      console.error("[Milo Save Image] render failed", error);
      return res.status(500).type("text/plain").send("Unable to render save result");
    }
  });
}
