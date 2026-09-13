import crypto from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { Express, Request, Response } from "express";
import sharp from "sharp";
import { vectorTextSvg } from "./vectorText";
import type { RichMenuArtwork } from "./richMenuArtwork";

const WIDTH = 1080;
const HEIGHT = 1350;
const DATA_KEYS = new Set<RichMenuArtwork>(["analysis", "budget", "transactions", "categories"]);
const titleByKey: Partial<Record<RichMenuArtwork, string>> = {
  analysis: "วิเคราะห์การเงิน",
  budget: "งบประมาณ",
  transactions: "รายการล่าสุด",
  categories: "หมวดหมู่",
};

function secret() {
  return process.env.LINE_CHANNEL_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || "milo-richmenu-data-image-v1";
}

function clean(value: string) {
  const withoutPictographs = Array.from(value.normalize("NFC")).filter(char => {
    const cp = char.codePointAt(0) ?? 0;
    return cp !== 0xfe0f && !(cp >= 0x1f000 && cp <= 0x1faff) && !(cp >= 0x2600 && cp <= 0x27bf);
  }).join("");
  return withoutPictographs
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\r/g, "")
    .trim();
}

function compactText(value: string) {
  const normalized = clean(value).slice(0, 1600);
  return normalized || "ยังไม่มีข้อมูลสำหรับแสดงผล";
}

function encode(key: RichMenuArtwork, text: string) {
  const payload = JSON.stringify({ key, text: compactText(text) });
  return deflateRawSync(Buffer.from(payload, "utf8"), { level: 9 }).toString("base64url");
}

function sign(data: string) {
  return crypto.createHmac("sha256", secret()).update(data).digest("hex");
}

export function isDynamicRichMenuArtwork(key: RichMenuArtwork) {
  return DATA_KEYS.has(key);
}

export function buildRichMenuDataImageUrl(key: RichMenuArtwork, text: string) {
  if (!isDynamicRichMenuArtwork(key)) throw new Error(`Artwork ${key} is not data-driven`);
  const base = (process.env.MILO_APP_BASE_URL ?? process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? "https://milo-line-app.vercel.app").replace(/\/+$/, "");
  const data = encode(key, text);
  return `${base}/api/milo/rich-menu-card.png?data=${encodeURIComponent(data)}&sig=${sign(data)}&render=richmenu-data-v1`;
}

function decode(req: Request) {
  const data = typeof req.query.data === "string" ? req.query.data : "";
  const supplied = typeof req.query.sig === "string" ? req.query.sig : "";
  if (!data || data.length > 3500 || !supplied) return undefined;
  const expected = sign(data);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return undefined;
  try {
    const parsed = JSON.parse(inflateRawSync(Buffer.from(data, "base64url")).toString("utf8")) as { key?: RichMenuArtwork; text?: string };
    if (!parsed.key || !isDynamicRichMenuArtwork(parsed.key) || typeof parsed.text !== "string") return undefined;
    return { key: parsed.key, text: compactText(parsed.text) };
  } catch {
    return undefined;
  }
}

const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
function wrapLine(value: string, max = 42) {
  const parts = Array.from(segmenter.segment(value)).map(item => item.segment);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += max) lines.push(parts.slice(i, i + max).join(""));
  return lines.length ? lines : [""];
}

function wrappedLines(text: string) {
  const lines = clean(text).split("\n").flatMap(line => wrapLine(line.trim(), 42));
  const maxLines = 24;
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), "…"];
}

function layer(text: string, left: number, top: number, width: number, fontSize: number, color: string, bold = false) {
  return { input: vectorTextSvg(text, { width, fontSize, color, bold }), left, top, blend: "over" as const };
}

function shapes(key: RichMenuArtwork) {
  const accent = key === "analysis" ? "#7556A8" : key === "budget" ? "#21A77B" : key === "transactions" ? "#D45B88" : "#5B80C8";
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#F1FFF8"/><stop offset=".52" stop-color="#FFF9F0"/><stop offset="1" stop-color="#F5EFFF"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#45695E" flood-opacity=".12"/></filter>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <rect x="42" y="38" width="996" height="1274" rx="42" fill="#FFFEFB" filter="url(#shadow)"/>
    <rect x="70" y="68" width="940" height="170" rx="34" fill="#ECF9F4"/>
    <circle cx="130" cy="126" r="32" fill="${accent}"/>
    <circle cx="118" cy="116" r="7" fill="#FFFFFF"/><circle cx="142" cy="116" r="7" fill="#FFFFFF"/>
    <path d="M115 136 Q130 148 145 136" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
    <rect x="70" y="270" width="940" height="900" rx="32" fill="#FBFAFF" stroke="#E9E2F4" stroke-width="2"/>
    <rect x="70" y="1202" width="940" height="72" rx="30" fill="#EAFBF5"/>
  </svg>`);
}

export async function renderRichMenuDataImage(key: RichMenuArtwork, text: string) {
  if (!isDynamicRichMenuArtwork(key)) throw new Error(`Artwork ${key} is not data-driven`);
  const title = titleByKey[key] ?? "Milo";
  const lines = wrappedLines(text);
  const layers = [
    layer("Milo", 185, 90, 180, 42, "#2F9C7D", true),
    layer(title, 185, 142, 720, 44, "#3F3552", true),
    layer("ข้อมูลจริงล่าสุดจากบัญชีของคุณ", 185, 198, 720, 22, "#78928D"),
  ];
  lines.forEach((lineText, index) => {
    const bold = index === 0 || /^สรุป|^หมวด|^รายการ|^รายรับ|^รายจ่าย/.test(lineText);
    layers.push(layer(lineText || " ", 112, 308 + index * 35, 850, 23, bold ? "#4B4260" : "#625971", bold));
  });
  layers.push(
    layer("Milo • แสดงผลเป็นภาพเดียว ไม่มีข้อความซ้ำตามหลัง", 118, 1222, 830, 19, "#4E7F70", true),
  );
  return sharp(shapes(key)).composite(layers).png().toBuffer();
}

export function registerRichMenuDataImageRoute(app: Express) {
  app.get("/api/milo/rich-menu-card.png", async (req: Request, res: Response) => {
    const input = decode(req);
    if (!input) return res.status(401).type("text/plain").send("Invalid rich-menu image link");
    try {
      const image = await renderRichMenuDataImage(input.key, input.text);
      res.set({ "Content-Type": "image/png", "Cache-Control": "private, no-store, max-age=0" });
      return res.status(200).send(image);
    } catch (error) {
      console.error("[Milo Rich Menu Image] render failed", error);
      return res.status(500).type("text/plain").send("Unable to render rich-menu image");
    }
  });
}
