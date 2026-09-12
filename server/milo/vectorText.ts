import * as fontkit from "fontkit";
import { MILO_LATIN_FONT_400_BASE64, MILO_LATIN_FONT_700_BASE64 } from "./latinFontData";
import { MILO_THAI_FONT_400_BASE64, MILO_THAI_FONT_700_BASE64 } from "./thaiFontData";

const thaiRegularFont = fontkit.create(Buffer.from(MILO_THAI_FONT_400_BASE64, "base64")) as fontkit.Font;
const thaiBoldFont = fontkit.create(Buffer.from(MILO_THAI_FONT_700_BASE64, "base64")) as fontkit.Font;
const latinRegularFont = fontkit.create(Buffer.from(MILO_LATIN_FONT_400_BASE64, "base64")) as fontkit.Font;
const latinBoldFont = fontkit.create(Buffer.from(MILO_LATIN_FONT_700_BASE64, "base64")) as fontkit.Font;
const graphemeSegmenter = new Intl.Segmenter("th", { granularity: "grapheme" });

export type VectorTextOptions = {
  width: number;
  height?: number;
  fontSize: number;
  color: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
};

export type MissingGlyph = { char: string; codePoint: string };

type FontChoice = { key: "thai" | "latin"; font: fontkit.Font };
type TextRun = FontChoice & { text: string };

function esc(value: string) {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]!));
}

export function normalizeRenderText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}

function fontsFor(bold: boolean): FontChoice[] {
  return bold
    ? [{ key: "thai", font: thaiBoldFont }, { key: "latin", font: latinBoldFont }]
    : [{ key: "thai", font: thaiRegularFont }, { key: "latin", font: latinRegularFont }];
}

function codePoints(value: string) {
  return Array.from(value).map(char => ({ char, value: char.codePointAt(0)! }));
}

function fontSupports(font: fontkit.Font, value: string) {
  return codePoints(value).every(({ char, value: cp }) => /^\s$/.test(char) || font.glyphForCodePoint(cp).id !== 0);
}

function selectFont(value: string, bold: boolean): FontChoice | undefined {
  return fontsFor(bold).find(candidate => fontSupports(candidate.font, value));
}

export function findMissingGlyphs(text: string, bold = false): MissingGlyph[] {
  const normalized = normalizeRenderText(text);
  const missing = new Map<string, MissingGlyph>();
  for (const { segment } of Array.from(graphemeSegmenter.segment(normalized))) {
    if (/^\s+$/.test(segment) || selectFont(segment, bold)) continue;
    for (const { char, value: cp } of codePoints(segment)) {
      if (/^\s$/.test(char)) continue;
      if (fontsFor(bold).some(candidate => candidate.font.glyphForCodePoint(cp).id !== 0)) continue;
      const codePoint = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
      missing.set(`${char}:${codePoint}`, { char, codePoint });
    }
  }
  return Array.from(missing.values());
}

export function assertRenderableText(text: string, bold = false, field = "text") {
  const missing = findMissingGlyphs(text, bold);
  if (!missing.length) return;
  const codes = missing.map(item => `${item.codePoint}(${JSON.stringify(item.char)})`).join(", ");
  throw new Error(`Missing render glyph in ${field}: ${codes}`);
}

function splitRuns(text: string, bold: boolean): TextRun[] {
  const normalized = normalizeRenderText(text);
  const runs: TextRun[] = [];
  for (const { segment } of Array.from(graphemeSegmenter.segment(normalized))) {
    let choice: FontChoice | undefined;
    if (/^\s+$/.test(segment)) {
      const previous = runs.at(-1);
      choice = previous ? { key: previous.key, font: previous.font } : fontsFor(bold)[1];
    } else {
      choice = selectFont(segment, bold);
    }
    if (!choice) {
      assertRenderableText(segment, bold, "text-run");
      continue;
    }
    const previous = runs.at(-1);
    if (previous?.key === choice.key) previous.text += segment;
    else runs.push({ ...choice, text: segment });
  }
  return runs;
}

function runMetrics(runs: TextRun[], fontSize: number) {
  const shaped = runs.map(run => {
    const scale = fontSize / run.font.unitsPerEm;
    const layout = run.font.layout(run.text);
    return { ...run, scale, layout, width: layout.advanceWidth * scale };
  });
  const advance = shaped.reduce((sum, run) => sum + run.width, 0);
  const ascent = Math.max(...shaped.map(run => run.font.ascent * run.scale), fontSize * 0.8);
  const descent = Math.max(...shaped.map(run => Math.abs(run.font.descent * run.scale)), fontSize * 0.2);
  return { shaped, advance, ascent, descent };
}

export function vectorTextSvg(text: string, options: VectorTextOptions) {
  const normalized = normalizeRenderText(text);
  assertRenderableText(normalized, Boolean(options.bold));
  const runs = splitRuns(normalized, Boolean(options.bold));
  const { shaped, advance, ascent, descent } = runMetrics(runs, options.fontSize);
  const align = options.align ?? "left";
  const startX = align === "right" ? Math.max(0, options.width - advance) : align === "center" ? Math.max(0, (options.width - advance) / 2) : 0;
  const height = options.height ?? Math.ceil(ascent + descent + options.fontSize * 0.18);
  const baseline = Math.ceil(ascent + options.fontSize * 0.06);
  let x = startX;
  const paths: string[] = [];

  for (const run of shaped) {
    let runX = x;
    for (let i = 0; i < run.layout.glyphs.length; i += 1) {
      const glyph = run.layout.glyphs[i];
      const pos = run.layout.positions[i];
      if (glyph.id === 0) throw new Error(`Unexpected .notdef glyph while rendering ${JSON.stringify(run.text)}`);
      const d = glyph.path.toSVG();
      const gx = runX + pos.xOffset * run.scale;
      const gy = baseline - pos.yOffset * run.scale;
      paths.push(`<path d="${esc(d)}" transform="translate(${gx.toFixed(3)} ${gy.toFixed(3)}) scale(${run.scale.toFixed(6)} ${(-run.scale).toFixed(6)})" fill="${options.color}"/>`);
      runX += pos.xAdvance * run.scale;
    }
    x += run.width;
  }

  return Buffer.from(`<svg width="${options.width}" height="${height}" viewBox="0 0 ${options.width} ${height}" xmlns="http://www.w3.org/2000/svg"><g>${paths.join("")}</g></svg>`);
}

export function measureVectorText(text: string, fontSize: number, bold = false) {
  const normalized = normalizeRenderText(text);
  assertRenderableText(normalized, bold);
  return runMetrics(splitRuns(normalized, bold), fontSize).advance;
}
