import * as fontkit from "fontkit";
import { MILO_THAI_FONT_400_BASE64, MILO_THAI_FONT_700_BASE64 } from "./thaiFontData";

const regularFont = fontkit.create(Buffer.from(MILO_THAI_FONT_400_BASE64, "base64")) as fontkit.Font;
const boldFont = fontkit.create(Buffer.from(MILO_THAI_FONT_700_BASE64, "base64")) as fontkit.Font;

export type VectorTextOptions = {
  width: number;
  height?: number;
  fontSize: number;
  color: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
};

function esc(value: string) {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]!));
}

export function vectorTextSvg(text: string, options: VectorTextOptions) {
  const font = options.bold ? boldFont : regularFont;
  const scale = options.fontSize / font.unitsPerEm;
  const run = font.layout(text);
  const advance = run.advanceWidth * scale;
  const align = options.align ?? "left";
  const startX = align === "right" ? Math.max(0, options.width - advance) : align === "center" ? Math.max(0, (options.width - advance) / 2) : 0;
  const ascent = font.ascent * scale;
  const descent = Math.abs(font.descent * scale);
  const height = options.height ?? Math.ceil(ascent + descent + options.fontSize * 0.18);
  const baseline = Math.ceil(ascent + options.fontSize * 0.06);
  let x = startX;
  const paths: string[] = [];

  for (let i = 0; i < run.glyphs.length; i += 1) {
    const glyph = run.glyphs[i];
    const pos = run.positions[i];
    const d = glyph.path.toSVG();
    const gx = x + pos.xOffset * scale;
    const gy = baseline - pos.yOffset * scale;
    paths.push(`<path d="${esc(d)}" transform="translate(${gx.toFixed(3)} ${gy.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})" fill="${options.color}"/>`);
    x += pos.xAdvance * scale;
  }

  return Buffer.from(`<svg width="${options.width}" height="${height}" viewBox="0 0 ${options.width} ${height}" xmlns="http://www.w3.org/2000/svg"><g>${paths.join("")}</g></svg>`);
}

export function measureVectorText(text: string, fontSize: number, bold = false) {
  const font = bold ? boldFont : regularFont;
  const run = font.layout(text);
  return run.advanceWidth * (fontSize / font.unitsPerEm);
}
