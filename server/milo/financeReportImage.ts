import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import sharp from "sharp";
import { vectorTextSvg } from "./vectorText";
import { loadRichMenuReference } from "./referenceArtwork";
import type { RichMenuArtwork } from "./richMenuArtwork";

export type FinanceReportImageRow = {
  transactionType: "income" | "expense";
  amount: number;
  category: string;
  note?: string;
  occurredAt?: string;
};

export type FinanceReportImageInput = {
  period: "day" | "week" | "month" | "year";
  income: number;
  expense: number;
  balance: number;
  categories: Record<string, number>;
  transactionCount?: number;
  start?: string | Date;
  end?: string | Date;
  rows?: Array<{
    transactionType: "income" | "expense";
    amount: string | number;
    category: string;
    note?: string | null;
    occurredAt?: string | Date | null;
  }>;
  title?: string;
  subtitle?: string;
};

const WIDTH = 1080;
const HEIGHT = 1350;
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

function iso(value: string | Date | null | undefined) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function encodePayload(input: FinanceReportImageInput) {
  const categories = Object.fromEntries(Object.entries(input.categories)
    .filter(([name, amount]) => name.trim() && Number.isFinite(Number(amount)) && Number(amount) >= 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 6)
    .map(([name, amount]) => [name.slice(0, 40), Number(amount)]));
  const rows: FinanceReportImageRow[] = (input.rows ?? []).slice(0, 5).map(row => ({
    transactionType: row.transactionType,
    amount: Number(row.amount),
    category: String(row.category ?? "ทั่วไป").slice(0, 36),
    note: row.note ? String(row.note).slice(0, 48) : undefined,
    occurredAt: iso(row.occurredAt),
  })).filter(row => Number.isFinite(row.amount) && row.amount >= 0);
  return Buffer.from(JSON.stringify({
    period: input.period,
    income: Number(input.income),
    expense: Number(input.expense),
    balance: Number(input.balance),
    categories,
    transactionCount: Number(input.transactionCount ?? input.rows?.length ?? 0),
    start: iso(input.start),
    end: iso(input.end),
    rows,
    title: input.title?.slice(0, 80),
    subtitle: input.subtitle?.slice(0, 120),
  })).toString("base64url");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function buildFinanceReportImageUrl(input: FinanceReportImageInput) {
  const base = (process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? process.env.MILO_APP_BASE_URL ?? "https://milo-line-assistant.onrender.com").replace(/\/+$/, "");
  const data = encodePayload(input);
  return `${base}/api/milo/finance-report.png?data=${encodeURIComponent(data)}&sig=${sign(data)}&render=summary-v4`;
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
    const rows: FinanceReportImageRow[] = (parsed.rows ?? []).slice(0, 5).flatMap(raw => {
      const amount = validNumber(raw.amount);
      if (amount === undefined || amount < 0 || (raw.transactionType !== "income" && raw.transactionType !== "expense")) return [];
      return [{ transactionType: raw.transactionType, amount, category: String(raw.category ?? "ทั่วไป").slice(0, 36), note: raw.note ? String(raw.note).slice(0, 48) : undefined, occurredAt: iso(raw.occurredAt) }];
    });
    return {
      period: parsed.period,
      income,
      expense,
      balance,
      categories,
      transactionCount: Math.max(0, Math.floor(Number(parsed.transactionCount ?? rows.length) || 0)),
      start: iso(parsed.start),
      end: iso(parsed.end),
      rows,
      title: parsed.title?.slice(0, 80),
      subtitle: parsed.subtitle?.slice(0, 120),
    };
  } catch {
    return undefined;
  }
}

type Layer = { left: number; top: number; width: number; fontSize: number; color: string; bold?: boolean; align?: "left" | "center" | "right" };
function textLayer(text: string, options: Layer) {
  return { input: vectorTextSvg(text, { width: options.width, fontSize: options.fontSize, color: options.color, bold: options.bold, align: options.align }), left: options.left, top: options.top, blend: "over" as const };
}

function periodRange(input: FinanceReportImageInput) {
  if (!input.start) return `ภาพรวมรายรับ - รายจ่าย${periodLabel[input.period]}`;
  const start = new Date(input.start);
  if (!Number.isFinite(start.getTime())) return `ภาพรวมรายรับ - รายจ่าย${periodLabel[input.period]}`;
  const formatter = new Intl.DateTimeFormat("th-TH-u-nu-latn", input.period === "year"
    ? { year: "numeric", timeZone: "Asia/Bangkok" }
    : input.period === "month"
      ? { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }
      : { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  if (input.period === "day" || input.period === "month" || input.period === "year") return formatter.format(start);
  const end = input.end ? new Date(new Date(input.end).getTime() - 1) : undefined;
  return end && Number.isFinite(end.getTime()) ? `${formatter.format(start)} – ${formatter.format(end)}` : formatter.format(start);
}

function insightCopy(input: FinanceReportImageInput) {
  if ((input.transactionCount ?? 0) === 0) return "เริ่มจดรายการ แล้วไมโลจะช่วยสรุปให้เห็นภาพชัดขึ้นครับ";
  if (input.balance < 0) return `รายจ่ายมากกว่ารายรับ ${money(Math.abs(input.balance))} บาท ลองดูหมวดที่ใช้สูงสุดก่อนนะครับ`;
  if (input.income > 0) {
    const rate = Math.max(0, Math.round((input.balance / input.income) * 100));
    return `ช่วงนี้ยังเหลือ ${money(input.balance)} บาท คิดเป็นประมาณ ${rate}% ของรายรับครับ`;
  }
  return `ช่วงนี้มีรายจ่าย ${money(input.expense)} บาท ไมโลช่วยแยกหมวดไว้ให้แล้วครับ`;
}

function displayRowDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH-u-nu-latn", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(date);
}

export function financeReportShapesSvg(input: FinanceReportImageInput) {
  const categories = Object.entries(input.categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCategory = Math.max(...categories.map(([, amount]) => amount), 1);
  const categoryBars = categories.map(([, amount], index) => {
    const y = 594 + index * 58;
    const width = Math.max(12, Math.round(350 * Math.min(1, amount / maxCategory)));
    return `<rect x="132" y="${y + 28}" width="350" height="14" rx="7" fill="#EAF4EF"/><rect x="132" y="${y + 28}" width="${width}" height="14" rx="7" fill="${index===0?'#32C88A':'#8EDDBF'}"/>`;
  }).join("");
  const total=Math.max(input.income+input.expense,1);
  const incomeWidth=Math.max(8,Math.round(255*input.income/total));
  const expenseWidth=Math.max(8,Math.round(255*input.expense/total));
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#3E8A69" flood-opacity=".16"/></filter></defs>
    <rect x="60" y="188" width="960" height="1012" rx="38" fill="#FFFDF8" fill-opacity=".97" filter="url(#shadow)"/>
    <rect x="92" y="282" width="276" height="150" rx="28" fill="#E6FFF2"/>
    <rect x="402" y="282" width="276" height="150" rx="28" fill="#FFE9F1"/>
    <rect x="712" y="282" width="276" height="150" rx="28" fill="#EEE8FF"/>
    <rect x="92" y="466" width="522" height="402" rx="30" fill="#F8FFFB" stroke="#BDEDD7" stroke-width="2"/>
    <rect x="642" y="466" width="346" height="402" rx="30" fill="#FFF8FC" stroke="#F1C8D8" stroke-width="2"/>
    <rect x="92" y="892" width="896" height="232" rx="30" fill="#FBF9FF" stroke="#DDD1F3" stroke-width="2"/>
    <rect x="92" y="1140" width="896" height="44" rx="22" fill="#E7FAF1"/>
    <circle cx="815" cy="616" r="88" fill="none" stroke="#E4F5EE" stroke-width="24"/>
    <circle cx="815" cy="616" r="88" fill="none" stroke="#39C98D" stroke-width="24" stroke-linecap="round" stroke-dasharray="350 560" transform="rotate(-90 815 616)"/>
    <rect x="690" y="742" width="255" height="14" rx="7" fill="#E5F2ED"/><rect x="690" y="742" width="${incomeWidth}" height="14" rx="7" fill="#35C78C"/>
    <rect x="690" y="792" width="255" height="14" rx="7" fill="#F8E4EC"/><rect x="690" y="792" width="${expenseWidth}" height="14" rx="7" fill="#EB78A1"/>
    ${categoryBars}
  </svg>`);
}

export async function renderFinanceReportImage(input: FinanceReportImageInput) {
  const referenceKey = (`report-${input.period}`) as RichMenuArtwork;
  const reference = await loadRichMenuReference(referenceKey);
  const title = input.title?.trim() || `สรุปการเงิน${periodLabel[input.period]}`;
  const subtitle = input.subtitle?.trim() || periodRange(input);
  const categories = Object.entries(input.categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rows = (input.rows ?? []).slice(0, 4).map(row => ({ ...row, amount: Number(row.amount), occurredAt: iso(row.occurredAt) }));
  const transactionCount = input.transactionCount ?? input.rows?.length ?? 0;
  const savingsRate = input.income > 0 ? Math.round((input.balance / input.income) * 100) : 0;
  const topCategory = categories[0];
  const layers: ReturnType<typeof textLayer>[] = [
    textLayer(title, { left: 108, top: 210, width: 650, fontSize: 38, color: "#214A3D", bold: true }),
    textLayer(subtitle, { left: 108, top: 250, width: 760, fontSize: 20, color: "#6D8C81" }),
    textLayer("รายรับ", { left: 112, top: 310, width: 220, fontSize: 20, color: "#548B7B" }),
    textLayer(`${money(input.income)} บาท`, { left: 112, top: 350, width: 230, fontSize: 34, color: "#16875F", bold: true }),
    textLayer("รายจ่าย", { left: 422, top: 310, width: 220, fontSize: 20, color: "#A46A82" }),
    textLayer(`${money(input.expense)} บาท`, { left: 422, top: 350, width: 230, fontSize: 34, color: "#CF4F80", bold: true }),
    textLayer("คงเหลือ", { left: 732, top: 310, width: 220, fontSize: 20, color: "#74668D" }),
    textLayer(`${money(input.balance)} บาท`, { left: 732, top: 350, width: 230, fontSize: 34, color: input.balance >= 0 ? "#3C7562" : "#C05076", bold: true }),
    textLayer("สัดส่วนรายจ่ายตามหมวด", { left: 112, top: 494, width: 450, fontSize: 26, color: "#355E50", bold: true }),
    textLayer("ภาพรวม", { left: 682, top: 494, width: 250, fontSize: 26, color: "#624F76", bold: true }),
    textLayer("อัตราคงเหลือ", { left: 706, top: 540, width: 220, fontSize: 19, color: "#8B7895" }),
    textLayer(`${savingsRate}%`, { left: 706, top: 574, width: 220, fontSize: 48, color: savingsRate >= 0 ? "#25936D" : "#C45F82", bold: true }),
    textLayer("รายรับ", { left: 690, top: 704, width: 100, fontSize: 18, color: "#508B7B" }),
    textLayer("รายจ่าย", { left: 690, top: 754, width: 100, fontSize: 18, color: "#A96B83" }),
    textLayer("จำนวนรายการ", { left: 690, top: 814, width: 230, fontSize: 18, color: "#85758F" }),
    textLayer(`${transactionCount.toLocaleString("th-TH-u-nu-latn")} รายการ`, { left: 690, top: 840, width: 230, fontSize: 28, color: "#4E435F", bold: true }),
    textLayer(topCategory ? `หมวดสูงสุด: ${topCategory[0]}` : "ยังไม่มีรายจ่าย", { left: 690, top: 866, width: 250, fontSize: 18, color: "#765F72", bold: true }),
    textLayer("รายการล่าสุด", { left: 112, top: 914, width: 330, fontSize: 26, color: "#4B4260", bold: true }),
  ];

  if (!categories.length) {
    layers.push(textLayer("ยังไม่มีรายจ่ายในช่วงนี้", { left: 105, top: 620, width: 470, fontSize: 27, color: "#849B96" }));
  } else {
    categories.forEach(([name, amount], index) => {
      const y = 540 + index * 58;
      const share = input.expense > 0 ? Math.round(amount / input.expense * 100) : 0;
      layers.push(
        textLayer(name, { left: 112, top: y, width: 180, fontSize: 21, color: "#5E716C", bold: index === 0 }),
        textLayer(`${money(amount)} บาท • ${share}%`, { left: 350, top: y, width: 220, fontSize: 20, color: "#A45A75", bold: true, align: "right" }),
      );
    });
  }

  if (!rows.length) {
    layers.push(textLayer("ยังไม่มีรายการในช่วงเวลานี้", { left: 112, top: 970, width: 760, fontSize: 25, color: "#8A8097" }));
  } else {
    rows.forEach((row, index) => {
      const y = 960 + index * 40;
      const label = (row.note?.trim() || row.category).slice(0, 34);
      const signed = row.transactionType === "income" ? "+" : "-";
      layers.push(
        textLayer(label, { left: 112, top: y, width: 410, fontSize: 20, color: "#5D536B", bold: index === 0 }),
        textLayer(`${signed}${money(Number(row.amount))} บาท`, { left: 530, top: y, width: 185, fontSize: 20, color: row.transactionType === "income" ? "#2E9577" : "#C35F82", bold: true, align: "right" }),
        textLayer(displayRowDate(row.occurredAt), { left: 742, top: y, width: 210, fontSize: 18, color: "#94879E", align: "right" }),
      );
    });
  }

  layers.push(
    textLayer("Milo แนะนำ", { left: 112, top: 1150, width: 140, fontSize: 17, color: "#2E9577", bold: true }),
    textLayer(insightCopy({ ...input, transactionCount }), { left: 252, top: 1150, width: 700, fontSize: 16, color: "#5A6B66" }),
  );

  return sharp(reference).resize(WIDTH, HEIGHT, { fit: "fill" }).composite([{ input: financeReportShapesSvg({ ...input, transactionCount }), blend: "over" }, ...layers]).png().toBuffer();
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
