import type { Express, Request, Response } from "express";
import sharp from "sharp";
import { budgetStatusCopy, getBudgetMetrics } from "./budgetStatus";
import { MILO_THAI_FONT_400_BASE64, MILO_THAI_FONT_700_BASE64 } from "./thaiFontData";

const money = (value: number) => value.toLocaleString("th-TH-u-nu-latn", { maximumFractionDigits: 2 });
const thaiDateTime = (value: Date) => new Intl.DateTimeFormat("th-TH-u-nu-latn", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
}).format(value);

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;" }[char]!));
}

function parseDate(value: string | null) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function compact(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(1, maxLength - 1))}…` : normalized;
}

function displayCategory(category: string, transactionType: "expense" | "income") {
  if (transactionType === "expense" && category === "อาหาร") return "ค่าอาหาร";
  return category;
}

export function buildSaveResultSvg(input: {
  transactionType: "expense" | "income";
  item: string;
  category: string;
  amount: number;
  occurredAt: Date;
  budgetSpent: number;
  budgetLimit: number;
}) {
  const { transactionType, amount, occurredAt, budgetSpent, budgetLimit } = input;
  const item = compact(input.item, 34) || "รายการ";
  const category = compact(input.category, 24) || "ทั่วไป";
  const categoryLabel = displayCategory(category, transactionType);
  const isExpense = transactionType === "expense";
  const metrics = getBudgetMetrics(budgetSpent, budgetLimit);
  const usageWidth = budgetLimit > 0 ? Math.max(0, Math.min(660, Math.round(660 * Math.min(metrics.usagePercent, 100) / 100))) : 0;
  const budgetNotice = budgetStatusCopy(category, budgetSpent, budgetLimit);
  const remainingLabel = metrics.isOverBudget ? "เกินงบ" : "คงเหลือ";
  const remainingAmount = Math.abs(metrics.remaining);
  const typeLabel = isExpense ? "รายจ่าย" : "รายรับ";
  const accent = isExpense ? "#F51D72" : "#139A68";
  const softAccent = isExpense ? "#FFF0F6" : "#EEFBF5";

  return `<svg width="933" height="1085" viewBox="0 0 933 1085" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style><![CDATA[
        @font-face { font-family: MiloThai; font-style: normal; font-weight: 400; src: url(data:font/woff2;base64,${MILO_THAI_FONT_400_BASE64}) format('woff2'); }
        @font-face { font-family: MiloThai; font-style: normal; font-weight: 700; src: url(data:font/woff2;base64,${MILO_THAI_FONT_700_BASE64}) format('woff2'); }
        text { font-family: MiloThai, Arial, sans-serif; }
      ]]></style>
      <filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="9" flood-color="#7BD9B5" flood-opacity=".18"/></filter>
      <linearGradient id="progress" x1="0" x2="1"><stop offset="0" stop-color="#22D66D"/><stop offset="1" stop-color="#FF3B83"/></linearGradient>
    </defs>

    <!-- Clean slate: hides all transaction-specific sample text baked into the reusable PNG. -->
    <rect x="0" y="292" width="933" height="793" fill="#ECFFF7"/>
    <rect x="38" y="312" width="857" height="572" rx="36" fill="#FBFFFD" stroke="#D8F7E9" stroke-width="2" filter="url(#shadow)"/>

    <rect x="78" y="348" width="170" height="54" rx="27" fill="${accent}"/>
    <text x="163" y="384" text-anchor="middle" font-family="MiloThai, Arial, sans-serif" font-size="27" font-weight="800" fill="#FFFFFF">${typeLabel}</text>
    <text x="273" y="385" font-family="MiloThai, Arial, sans-serif" font-size="34" font-weight="800" fill="#183D3A">• ${escapeXml(categoryLabel)}</text>

    <text x="80" y="444" font-family="MiloThai, Arial, sans-serif" font-size="24" font-weight="600" fill="#4B6173">${escapeXml(thaiDateTime(occurredAt))}</text>
    <text x="80" y="510" font-family="MiloThai, Arial, sans-serif" font-size="47" font-weight="800" fill="#163D3C">${escapeXml(item)}</text>
    <text x="844" y="510" text-anchor="end" font-family="MiloThai, Arial, sans-serif" font-size="55" font-weight="900" fill="${accent}">฿${money(amount)}</text>
    <line x1="78" y1="535" x2="855" y2="535" stroke="#8ADDC0" stroke-width="3"/>

    ${budgetLimit > 0 ? `
      <rect x="70" y="576" width="792" height="292" rx="28" fill="${softAccent}" stroke="#CFF3E3" stroke-width="2"/>
      <circle cx="111" cy="630" r="25" fill="#149A68"/>
      <text x="111" y="629" text-anchor="middle" font-family="MiloThai, Arial, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">฿</text>
      <text x="150" y="630" font-family="MiloThai, Arial, sans-serif" font-size="30" font-weight="800" fill="#173F3B">งบหมวด${escapeXml(category)}</text>

      <text x="90" y="681" font-family="MiloThai, Arial, sans-serif" font-size="19" fill="#526979">ใช้ไป</text>
      <text x="90" y="725" font-family="MiloThai, Arial, sans-serif" font-size="39" font-weight="900" fill="${accent}">฿${money(budgetSpent)}</text>
      <text x="378" y="681" font-family="MiloThai, Arial, sans-serif" font-size="19" fill="#526979">งบทั้งหมด</text>
      <text x="378" y="725" font-family="MiloThai, Arial, sans-serif" font-size="34" font-weight="800" fill="#149A68">฿${money(budgetLimit)}</text>
      <text x="646" y="681" font-family="MiloThai, Arial, sans-serif" font-size="19" fill="#526979">${remainingLabel}</text>
      <text x="646" y="725" font-family="MiloThai, Arial, sans-serif" font-size="34" font-weight="800" fill="${metrics.isOverBudget ? "#F51D72" : "#149A68"}">฿${money(remainingAmount)}</text>

      <rect x="90" y="760" width="660" height="24" rx="12" fill="#DDEFE8"/>
      <rect x="90" y="760" width="${usageWidth}" height="24" rx="12" fill="url(#progress)"/>
      <text x="90" y="819" font-family="MiloThai, Arial, sans-serif" font-size="23" font-weight="800" fill="${metrics.isOverBudget ? "#D94A6E" : "#32685C"}">${escapeXml(budgetNotice)}</text>
    ` : `
      <rect x="70" y="590" width="792" height="184" rx="28" fill="#F1FBF7" stroke="#CFF3E3" stroke-width="2"/>
      <text x="100" y="650" font-family="MiloThai, Arial, sans-serif" font-size="29" font-weight="800" fill="#173F3B">ยังไม่ได้ตั้งงบหมวด${escapeXml(category)}</text>
      <text x="100" y="698" font-family="MiloThai, Arial, sans-serif" font-size="22" fill="#526979">รายการนี้ถูกบันทึกด้วยยอดและเวลาจริงเรียบร้อยแล้ว</text>
    `}

    <!-- Clean helper bubble: masks sample item text in the original artwork before inserting real values. -->
    <rect x="70" y="910" width="792" height="132" rx="34" fill="#FFFFFF" stroke="#D4F3E5" stroke-width="2" filter="url(#shadow)"/>
    <text x="108" y="958" font-family="MiloThai, Arial, sans-serif" font-size="27" font-weight="700" fill="#3D5870">บันทึกให้แล้วน่ะจ๊ะ 💚</text>
    <text x="108" y="1004" font-family="MiloThai, Arial, sans-serif" font-size="25" fill="#3D5870">${escapeXml(item)} • ${escapeXml(categoryLabel)} • ${money(amount)} บาท</text>
  </svg>`;
}

export function registerSaveResultImageRoute(app: Express) {
  app.get("/api/milo/save-result.png", async (req: Request, res: Response) => {
    try {
      const transactionType = req.query.transactionType === "income" ? "income" : "expense";
      const item = String(req.query.item ?? "รายการ").trim().slice(0, 80) || "รายการ";
      const category = String(req.query.category ?? "ทั่วไป").trim().slice(0, 50) || "ทั่วไป";
      const amount = Number(req.query.amount ?? 0);
      const budgetSpent = Number(req.query.budgetSpent ?? 0);
      const budgetLimit = Number(req.query.budgetLimit ?? 0);
      const occurredAt = parseDate(typeof req.query.occurredAt === "string" ? req.query.occurredAt : null);

      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).type("text/plain").send("Invalid amount");

      const baseUrl = (process.env.MILO_RICH_MENU_IMAGE_BASE_URL ?? "https://milo-line-app.vercel.app/milo-richmenu").replace(/\/+$/, "");
      const templateResponse = await fetch(`${baseUrl}/save-complete.png`, { cache: "no-store" });
      if (!templateResponse.ok) return res.status(502).type("text/plain").send("Save result template unavailable");
      const template = Buffer.from(await templateResponse.arrayBuffer());

      const svg = buildSaveResultSvg({ transactionType, item, category, amount, occurredAt, budgetSpent, budgetLimit });
      const output = await sharp(template).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
      res.set({ "Content-Type": "image/png", "Cache-Control": "private, no-store, max-age=0" });
      return res.status(200).send(output);
    } catch (error) {
      console.error("[Milo Save Image] render failed", error);
      return res.status(500).type("text/plain").send("Unable to render save result");
    }
  });
}
