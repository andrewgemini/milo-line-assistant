import { readFile } from "node:fs/promises";
import path from "node:path";
import { RICH_MENU_ARTWORK, type RichMenuArtwork } from "./richMenuArtwork";

export async function loadRichMenuReference(key: RichMenuArtwork) {
  const file = RICH_MENU_ARTWORK[key].file;
  const candidates = [
    path.join(process.cwd(), "client", "public", "richmenu", file),
    path.join(process.cwd(), "dist", "public", "richmenu", file),
    path.join(process.cwd(), "richmenu", file),
  ];
  let lastError;
  for (const candidate of candidates) {
    try { return await readFile(candidate); }
    catch (error) { lastError = error; }
  }
  throw new Error(`Milo reference artwork not found for ${key}: ${lastError instanceof Error ? lastError.message : "unknown"}`);
}
