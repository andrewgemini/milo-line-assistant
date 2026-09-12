import type { Express, Request, Response } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
      <filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="9" flood-color="#7BD9B5" flood-opacity=".18"/></filter>
      <linearGradient id="progress" x1="0" x2="1"><stop offset="0" stop-color="#22D66D"/><stop offset="1" stop-color="#FF3B83"/></linearGradient>
    </defs>

    <rect x="0" y="292" width="933" height="793" fill="#ECFFF7"/>
    <rect x="38" y="312" width="857" height="572" rx="36" fill="#FBFFFD" stroke="#D8F7E9" stroke-width="2" filter="url(#shadow)"/>

    <rect x="78" y="348" width="170" height="54" rx="27" fill="${accent}"/>
    <text x="163" y="384" text-anchor="middle" font-size="27" font-weight="800" fill="#FFFFFF">${typeLabel}</text>
    <text x="273" y="385" font-size="34" font-weight="800" fill="#183D3A">• ${escapeXml(categoryLabel)}</text>

    <text x="80" y="444" font-size="24" font-weight="600" fill="#4B6173">${escapeXml(thaiDateTime(occurredAt))}</text>
    <text x="80" y="510" font-size="47" font-weight="800" fill="#163D3C">${escapeXml(item)}</text>
    <text x="844" y="510" text-anchor="end" font-size="55" font-weight="900" fill="${accent}">฿${money(amount)}</text>
    <line x1="78" y1="535" x2="855" y2="535" stroke="#8ADDC0" stroke-width="3"/>

    ${budgetLimit > 0 ? `
      <rect x="70" y="576" width="792" height="292" rx="28" fill="${softAccent}" stroke="#CFF3E3" stroke-width="2"/>
      <circle cx="111" cy="630" r="25" fill="#149A68"/>
      <text x="111" y="629" text-anchor="middle" font-size="24" font-weight="800" fill="#FFFFFF">฿</text>
      <text x="150" y="630" font-size="30" font-weight="800" fill="#173F3B">งบหมวด${escapeXml(category)}</text>

      <text x="90" y="681" font-size="19" fill="#526979">ใช้ไป</text>
      <text x="90" y="725" font-size="39" font-weight="900" fill="${accent}">฿${money(budgetSpent)}</text>
      <text x="378" y="681" font-size="19" fill="#526979">งบทั้งหมด</text>
      <text x="378" y="725" font-size="34" font-weight="800" fill="#149A68">฿${money(budgetLimit)}</text>
      <text x="646" y="681" font-size="19" fill="#526979">${remainingLabel}</text>
      <text x="646" y="725" font-size="34" font-weight="800" fill="${metrics.isOverBudget ? "#F51D72" : "#149A68"}">฿${money(remainingAmount)}</text>

      <rect x="90" y="760" width="660" height="24" rx="12" fill="#DDEFE8"/>
      <rect x="90" y="760" width="${usageWidth}" height="24" rx="12" fill="url(#progress)"/>
      <text x="90" y="819" font-size="23" font-weight="800" fill="${metrics.isOverBudget ? "#D94A6E" : "#32685C"}">${escapeXml(budgetNotice)}</text>
    ` : `
      <rect x="70" y="590" width="792" height="184" rx="28" fill="#F1FBF7" stroke="#CFF3E3" stroke-width="2"/>
      <text x="100" y="650" font-size="29" font-weight="800" fill="#173F3B">ยังไม่ได้ตั้งงบหมวด${escapeXml(category)}</text>
      <text x="100" y="698" font-size="22" fill="#526979">รายการนี้ถูกบันทึกด้วยยอดและเวลาจริงเรียบร้อยแล้ว</text>
    `}

    <rect x="70" y="910" width="792" height="132" rx="34" fill="#FFFFFF" stroke="#D4F3E5" stroke-width="2" filter="url(#shadow)"/>
    <text x="108" y="958" font-size="27" font-weight="700" fill="#3D5870">บันทึกให้แล้วน่ะจ๊ะ</text>
    <text x="108" y="1004" font-size="25" fill="#3D5870">${escapeXml(item)} • ${escapeXml(categoryLabel)} • ${money(amount)} บาท</text>
  </svg>`;
}

const THAI_FONT_REGULAR_FILE = path.join(os.tmpdir(), "milo-noto-sans-thai-400.woff2");
const THAI_FONT_BOLD_FILE = path.join(os.tmpdir(), "milo-noto-sans-thai-700.woff2");

function ensureThaiFonts() {
  if (!fs.existsSync(THAI_FONT_REGULAR_FILE)) {
    fs.writeFileSync(THAI_FONT_REGULAR_FILE, Buffer.from(MILO_THAI_FONT_400_BASE64, "base64"));
  }
  if (!fs.existsSync(THAI_FONT_BOLD_FILE)) {
    fs.writeFileSync(THAI_FONT_BOLD_FILE, Buffer.from(MILO_THAI_FONT_700_BASE64, "base64"));
  }
}

type TextLayerOptions = {
  left: number;
  top: number;
  width: number;
  fontSize: number;
  color: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
};

function pangoTextLayer(text: string, options: TextLayerOptions) {
  return {
    input: {
      text: {
        text: `<span foreground="${options.color}">${escapeXml(text)}</span>`,
        font: `Noto Sans Thai ${options.fontSize}`,
        fontfile: options.bold ? THAI_FONT_BOLD_FILE : THAI_FONT_REGULAR_FILE,
        width: options.width,
        align: options.align ?? "left",
        rgba: true,
        dpi: 72,
      },
    },
    left: options.left,
    top: options.top,
    blend: "over" as const,
  };
}

function buildThaiTextLayers(input: {
  transactionType: "expense" | "income";
  item: string;
  category: string;
  amount: number;
  occurredAt: Date;
  budgetSpent: number;
  budgetLimit: number;
}) {
  const item = compact(input.item, 34) || "รายการ";
  const category = compact(input.category, 24) || "ทั่วไป";
  const categoryLabel = displayCategory(category, input.transactionType);
  const metrics = getBudgetMetrics(input.budgetSpent, input.budgetLimit);
  const accent = input.transactionType === "expense" ? "#F51D72" : "#139A68";
  const typeLabel = input.transactionType === "expense" ? "รายจ่าย" : "รายรับ";
  const remainingLabel = metrics.isOverBudget ? "เกินงบ" : "คงเหลือ";
  const remainingAmount = Math.abs(metrics.remaining);
  const layers: ReturnType<typeof pangoTextLayer>[] = [
    pangoTextLayer(typeLabel, { left: 78, top: 351, width: 170, fontSize: 27, color: "#FFFFFF", bold: true, align: "center" }),
    pangoTextLayer(`• ${categoryLabel}`, { left: 273, top: 344, width: 560, fontSize: 34, color: "#183D3A", bold: true }),
    pangoTextLayer(thaiDateTime(input.occurredAt), { left: 80, top: 411, width: 760, fontSize: 24, color: "#4B6173", bold: true }),
    pangoTextLayer(item, { left: 80, top: 457, width: 470, fontSize: 47, color: "#163D3C", bold: true }),
    pangoTextLayer(`฿${money(input.amount)}`, { left: 555, top: 453, width: 289, fontSize: 55, color: accent, bold: true, align: "right" }),
  ];

  if (input.budgetLimit > 0) {
    layers.push(
      pangoTextLayer("฿", { left: 91, top: 599, width: 40, fontSize: 24, color: "#FFFFFF", bold: true, align: "center" }),
      pangoTextLayer(`งบหมวด${category}`, { left: 150, top: 593, width: 650, fontSize: 30, color: "#173F3B", bold: true }),
      pangoTextLayer("ใช้ไป", { left: 90, top: 651, width: 200, fontSize: 19, color: "#526979" }),
      pangoTextLayer(`฿${money(input.budgetSpent)}`, { left: 90, top: 683, width: 240, fontSize: 39, color: accent, bold: true }),
      pangoTextLayer("งบทั้งหมด", { left: 378, top: 651, width: 220, fontSize: 19, color: "#526979" }),
      pangoTextLayer(`฿${money(input.budgetLimit)}`, { left: 378, top: 683, width: 230, fontSize: 34, color: "#149A68", bold: true }),
      pangoTextLayer(remainingLabel, { left: 646, top: 651, width: 190, fontSize: 19, color: "#526979" }),
      pangoTextLayer(`฿${money(remainingAmount)}`, { left: 646, top: 683, width: 190, fontSize: 34, color: metrics.isOverBudget ? "#F51D72" : "#149A68", bold: true }),
      pangoTextLayer(budgetStatusCopy(category, input.budgetSpent, input.budgetLimit), { left: 90, top: 792, width: 735, fontSize: 23, color: metrics.isOverBudget ? "#D94A6E" : "#32685C", bold: true }),
    );
  } else {
    layers.push(
      pangoTextLayer(`ยังไม่ได้ตั้งงบหมวด${category}`, { left: 100, top: 611, width: 730, fontSize: 29, color: "#173F3B", bold: true }),
      pangoTextLayer("รายการนี้ถูกบันทึกด้วยยอดและเวลาจริงเรียบร้อยแล้ว", { left: 100, top: 661, width: 730, fontSize: 22, color: "#526979" }),
    );
  }

  layers.push(
    pangoTextLayer("บันทึกให้แล้วน่ะจ๊ะ", { left: 108, top: 931, width: 650, fontSize: 27, color: "#3D5870", bold: true }),
    pangoTextLayer(`${item} • ${categoryLabel} • ${money(input.amount)} บาท`, { left: 108, top: 976, width: 690, fontSize: 25, color: "#3D5870" }),
  );

  return layers;
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

      ensureThaiFonts();
      const svg = buildSaveResultSvg({ transactionType, item, category, amount, occurredAt, budgetSpent, budgetLimit });
      const shapesOnlySvg = svg.replace(/<text\b/g, '<text opacity="0"');
      const textLayers = buildThaiTextLayers({ transactionType, item, category, amount, occurredAt, budgetSpent, budgetLimit });
      const output = await sharp(template)
        .composite([{ input: Buffer.from(shapesOnlySvg), top: 0, left: 0 }, ...textLayers])
        .png()
        .toBuffer();

      res.set({ "Content-Type": "image/png", "Cache-Control": "private, no-store, max-age=0" });
      return res.status(200).send(output);
    } catch (error) {
      console.error("[Milo Save Image] render failed", error);
      return res.status(500).type("text/plain").send("Unable to render save result");
    }
  });
}
