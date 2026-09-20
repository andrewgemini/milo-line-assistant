// Explicit, read-only production diagnostic. Never writes transactions or sends LINE messages.
import fs from "node:fs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

function option(name: string) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const envFile = option("--env");
if (envFile) Object.assign(process.env, dotenv.parse(fs.readFileSync(envFile)));
const { analyzeImage } = await import("../server/milo/imageAnalysis");
const { transcribeAudio } = await import("../server/_core/voiceTranscription");
const imagePath = option("--image");
if (imagePath) {
  const bytes = fs.readFileSync(imagePath);
  const result = await analyzeImage(`data:image/${imagePath.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`);
  console.log("IMAGE_RESULT", JSON.stringify(result));
  if (!result.proposals.some(p => p.kind === "expense" && p.amount > 0)) process.exitCode = 1;
}
if (process.argv.includes("--latest-audio") || process.argv.includes("--latest-image")) {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const audio = process.argv.includes("--latest-audio");
    const [rows] = await conn.execute<mysql.RowDataPacket[]>("SELECT b.content, b.mimeType, b.sizeBytes FROM vault_blobs b JOIN vault_items v ON v.storageKey=b.storageKey WHERE v.mimeType LIKE ? AND v.status='active' ORDER BY v.createdAt DESC LIMIT 1", [audio ? "audio/%" : "image/%"]);
    if (!rows.length) throw new Error("No stored media available");
    if (audio) {
      const result = await transcribeAudio({ audioBuffer: rows[0].content, mimeType: rows[0].mimeType, language: "th" });
      console.log("AUDIO_RESULT", JSON.stringify(result));
      if ("error" in result) process.exitCode = 1;
    } else {
      const result = await analyzeImage(`data:${rows[0].mimeType};base64,${rows[0].content.toString("base64")}`);
      console.log("IMAGE_RESULT", JSON.stringify(result));
      if (!result.proposals.some(p => p.kind === "expense" && p.amount > 0)) process.exitCode = 1;
    }
  } finally { await conn.end(); }
}
