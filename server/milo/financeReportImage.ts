import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import sharp from "sharp";
import { vectorTextSvg } from "./vectorText";

export type FinanceReportImageInput = {
  period: "day" | "week" | "month" | "year";
  income: number;
  expense: number;
  balance: number;
  categories: Record<string, number>;
  title?: string;
  subtitle?: string;
};

const money = (value: number) => value.toLocaleString("th-TH-u-nu-latn", { maximumFractionDigits: 2 });
const periodLabel: Record<FinanceReportImageInput["period"], string> = {
  day: "วันนี้",
  week: "สัปดาห์นี้",
  month: "เดือนนี้",
  year: "ปีนี้",
};

function secret() {
  return process.env.LINE_CHANNEL_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || "milo-report-image-v1";
}

function encodePayload(input: FinanceReportImageInput) {
  const categories = Object.fromEntries(Object.entries(input.categories)
    .filter(([name, amount]) => name.trim() && Number.isFinite(Number(amount)) && Number(amount) >= 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 6)
    .map(([name, amount]) => [name.slice(0, 40), Number(amount)]));
  return Buffer.from(JSON.stringify({
    period: input.period,
    income: Number(input.income),
    expense: Number(input.expense),
    balance: Number(input.balance),
    categories,
    title: input.title?.slice(0, 80),
    subtitle: input.subtitle?.slice(0, 120),
  })).toString("base64url");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function buildFinanceReportImageUrl(input: FinanceReportImageInput) {
  const base = (process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? process.env.MILO_APP_BASE_URL ?? "https://milo-line-app.vercel.app").replace(/\/+$/, "");
  const data = encodePayload(input);
  return `${base}/api/milo/finance-report.png?data=${encodeURIComponent(data)}&sig=${sign(data)}`;
}

function validNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= 1_000_000_000_000 ? n : undefined;
}

function decodeInput(req: Request): FinanceReportImageInput | undefined {
  const data = typeof req.query.data === "string" ? req.query.data : "";
  const supplied = typeof req.query.sig === "string" ? req.query.sig : "";
  if (!data || data.length > 8_000 || !supplied) return undefined;
  const expected = sign(data);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Partial<FinanceReportImageInput>;
    if (!parsed.period || !["day", "week", "month", "year"].includes(parsed.period)) return undefined;
    const income = validNumber(parsed.income);
    const expense = validNumber(parsed.expense);
    const balance = validNumber(parsed.balance);
    if (income === undefined || expense === undefined || balance === undefined) return undefined;
    const categories: Record<string, number> = {};
    for (const [name, amount] of Object.entries(parsed.categories ?? {}).slice(0, 6)) {
      const n = validNumber(amount);
      if (name.trim() && n !== undefined && n >= 0) categories[name.trim().slice(0, 40)] = n;
    }
    return { period: parsed.period, income, expense, balance, categories, title: parsed.title?.slice(0, 80), subtitle: parsed.subtitle?.slice(0, 120) };
  } catch {
    return undefined;
  }
}

type Layer = { left: number; top: number; width: number; fontSize: number; color: string; bold?: boolean; align?: "left" | "center" | "right" };
function textLayer(text: string, options: Layer) {
  return { input: vectorTextSvg(text, { width: options.width, fontSize: options.fontSize, color: options.color, bold: options.bold, align: options.align }), left: options.left, top: options.top, blend: "over" as const };
}

export function financeReportShapesSvg(input: FinanceReportImageInput) {
  const categories = Object.entries(input.categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(input.expense, ...categories.map(([, amount]) => amount), 1);
  const rows = categories.map(([, amount], index) => {
    const y = 720 + index * 76;
    const width = Math.max(8, Math.round(520 * Math.min(1, amount / max)));
    return `<rect x="302" y="${y + 32}" width="520" height="12" rx="6" fill="#E9F1EF"/><rect x="302" y="${y + 32}" width="${width}" height="12" rx="6" fill="#67CDB1"/>`;
  }).join("");
  return Buffer.from(`<svg width="900" height="1200" viewBox="0 0 900 1200" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#E9FFF5"/><stop offset="1" stop-color="#F6EEFF"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#366E62" flood-opacity=".12"/></filter></defs>
    <rect width="900" height="1200" fill="url(#bg)"/>
    <rect x="42" y="42" width="816" height="1116" rx="42" fill="#FFFEFC" filter="url(#s)"/>
    <rect x="76" y="78" width="748" height="194" rx="32" fill="#ECFBF6"/>
    <circle cx="126" cy="132" r="30" fill="#57C6A9"/>
    <rect x="76" y="314" width="230" height="170" rx="28" fill="#EAF9F4"/>
    <rect x="335" y="314" width="230" height="170" rx="28" fill="#FDEDF3"/>
    <rect x="594" y="314" width="230" height="170" rx="28" fill="#F0ECFA"/>
    <rect x="76" y="522" width="748" height="532" rx="30" fill="#FBFFFD" stroke="#DDEFE9" stroke-width="2"/>
    <rect x="76" y="1080" width="748" height="50" rx="25" fill="#F4F0FB"/>
    ${rows}
  </svg>`);
}

export async function renderFinanceReportImage(input: FinanceReportImageInput) {
  const title = input.title?.trim() || `สรุปการเงิน${periodLabel[input.period]}`;
  const subtitle = input.subtitle?.trim() || "ยอดจริงจากรายการที่บันทึกไว้";
  const categories = Object.entries(input.categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const layers: ReturnType<typeof textLayer>[] = [
    textLayer("฿", { left: 103, top: 103, width: 46, fontSize: 36, color: "#FFFFFF", bold: true, align: "center" }),
    textLayer(title, { left: 180, top: 94, width: 600, fontSize: 43, color: "#263E3A", bold: true }),
    textLayer(subtitle, { left: 180, top: 158, width: 600, fontSize: 23, color: "#78928D" }),
    textLayer("MILO • FINANCE", { left: 92, top: 220, width: 300, fontSize: 20, color: "#7657AA", bold: true }),
    textLayer("รายรับ", { left: 102, top: 342, width: 180, fontSize: 21, color: "#628B80" }),
    textLayer(`${money(input.income)} บาท`, { left: 102, top: 386, width: 180, fontSize: 34, color: "#247D68", bold: true }),
    textLayer("รายจ่าย", { left: 361, top: 342, width: 180, fontSize: 21, color: "#9C7182" }),
    textLayer(`${money(input.expense)} บาท`, { left: 361, top: 386, width: 180, fontSize: 34, color: "#B85078", bold: true }),
    textLayer("คงเหลือ", { left: 620, top: 342, width: 180, fontSize: 21, color: "#776B8D" }),
    textLayer(`${money(input.balance)} บาท`, { left: 620, top: 386, width: 180, fontSize: 34, color: input.balance >= 0 ? "#4C6F65" : "#B85078", bold: true }),
    textLayer("รายจ่ายตามหมวด", { left: 102, top: 558, width: 500, fontSize: 29, color: "#4B5D58", bold: true }),
  ];
  if (!categories.length) {
    layers.push(textLayer("ยังไม่มีรายจ่ายในช่วงนี้", { left: 102, top: 645, width: 650, fontSize: 27, color: "#849B96" }));
  } else {
    categories.forEach(([name, amount], index) => {
      const y = 704 + index * 76;
      layers.push(
        textLayer(name, { left: 102, top: y, width: 190, fontSize: 23, color: "#5E716C", bold: index === 0 }),
        textLayer(`${money(amount)} บาท`, { left: 610, top: y, width: 190, fontSize: 23, color: "#B85078", bold: true, align: "right" }),
      );
    });
  }
  layers.push(textLayer("ข้อมูลในภาพนี้คำนวณจากธุรกรรมจริงของช่วงที่เลือก", { left: 110, top: 1090, width: 680, fontSize: 18, color: "#76688E", align: "center" }));
  return sharp(financeReportShapesSvg(input)).composite(layers).png().toBuffer();
}

export function registerFinanceReportImageRoute(app: Express) {
  app.get("/api/milo/finance-report.png", async (req: Request, res: Response) => {
    const input = decodeInput(req);
    if (!input) return res.status(401).type("text/plain").send("Invalid finance report image link");
    try {
      const image = await renderFinanceReportImage(input);
      res.set({ "Content-Type": "image/png", "Cache-Control": "private, no-store, max-age=0" });
      return res.status(200).send(image);
    } catch (error) {
      console.error("[Milo Finance Report Image] render failed", error);
      return res.status(500).type("text/plain").send("Unable to render finance report image");
    }
  });
}
