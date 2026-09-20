import crypto from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { Express, Request, Response } from "express";
import sharp from "sharp";
import { vectorTextSvg } from "./vectorText";
import type { RichMenuArtwork } from "./richMenuArtwork";
import { loadRichMenuReference } from "./referenceArtwork";

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
  const normalized = clean(value).slice(0, 1000);
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
  const base = (process.env.MILO_APP_BASE_URL ?? process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? "https://milo-line-assistant.onrender.com").replace(/\/+$/, "");
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

function shapes(key: RichMenuArtwork, lineCount = 0) {
  const accent = key === "analysis" ? "#27C88B" : key === "budget" ? "#28B875" : key === "transactions" ? "#E96F9B" : "#6B8FDF";
  const soft = key === "analysis" ? "#E8FFF4" : key === "budget" ? "#EDFFF4" : key === "transactions" ? "#FFF0F5" : "#F0F4FF";
  const rows = Array.from({ length: Math.min(Math.max(lineCount, 1), 14) }, (_, i) => {
    const y=366+i*48;
    const fill=i%2===0?'#FFFFFF':'#FAFFFC';
    return `<rect x="112" y="${y}" width="856" height="40" rx="14" fill="${fill}" fill-opacity=".96"/>`;
  }).join('');
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="13" flood-color="#3D8066" flood-opacity=".15"/></filter></defs>
    <rect x="76" y="188" width="928" height="962" rx="38" fill="#FFFDF9" fill-opacity=".94" filter="url(#shadow)"/>
    <rect x="100" y="214" width="880" height="116" rx="28" fill="${soft}" fill-opacity=".98"/>
    <circle cx="154" cy="272" r="30" fill="${accent}"/>
    <circle cx="143" cy="262" r="6" fill="#fff"/><circle cx="165" cy="262" r="6" fill="#fff"/>
    <path d="M140 283 Q154 296 168 283" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    ${rows}
    <rect x="100" y="1092" width="880" height="42" rx="21" fill="#E8FAF2"/>
  </svg>`);
}

export async function renderRichMenuDataImage(key: RichMenuArtwork, text: string) {
  if (!isDynamicRichMenuArtwork(key)) throw new Error(`Artwork ${key} is not data-driven`);
  const title = titleByKey[key] ?? "Milo";
  const lines = wrappedLines(text);
  const reference = await loadRichMenuReference(key);
  const layers = [
    layer(title, 208, 228, 650, 38, "#3F3552", true),
    layer("ข้อมูลจริงล่าสุดจากบัญชีของคุณ", 208, 276, 650, 20, "#6F8D82"),
  ];
  lines.forEach((lineText, index) => {
    const bold = index === 0 || /^สรุป|^หมวด|^รายการ|^รายรับ|^รายจ่าย|^ข้อมูล|^ข้อสังเกต|^แนวทาง/.test(lineText);
    layers.push(layer(lineText || " ", 132, 374 + index * 48, 812, 20, bold ? "#3E594F" : "#625971", bold));
  });
  layers.push(
    layer("Milo • ข้อมูลจริงของคุณบนดีไซน์ต้นฉบับ", 132, 1100, 800, 17, "#3B7F69", true),
  );
  return sharp(reference).resize(WIDTH, HEIGHT, { fit: "fill" }).composite([{ input: shapes(key, lines.length), blend: "over" }, ...layers]).png().toBuffer();
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
