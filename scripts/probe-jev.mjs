import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const apiKey = (process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY || "").trim();
const baseURL = (process.env.JEV_BASE_URL || process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai").trim().replace(/\/+$/, "");
const model = (process.env.JEV_MODEL || process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest").trim() || "jev-latest";

if (!apiKey) {
  console.error("Jev probe: missing JEV_API_KEY or TYPESAFE_API_KEY");
  process.exit(2);
}

try {
  const client = new TypeSafeClient({ apiKey, baseURL, defaultModel: model, logLevel: "warn" });
  const response = await client.systemOne({
    model,
    state: { probe: "milo-jev-credential-check" },
    questions: {
      ok: choice("ตอบเลือกสถานะ credential สำหรับ probe นี้", { ok: "credential ใช้งานได้", unavailable: "credential ใช้งานไม่ได้" }),
    },
  });
  console.log(JSON.stringify({ ok: response.answers.ok.choice === "ok", model: response.model }));
  process.exit(response.answers.ok.choice === "ok" ? 0 : 1);
} catch (error) {
  console.error("Jev probe failed:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
}
