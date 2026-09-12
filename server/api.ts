import express from "express";
import sharp from "sharp";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { registerLineWebhook, registerMiloCron } from "./milo/routes";
import { registerSaveResultImageRoute } from "./milo/saveResultImage";
import { registerFinanceExportRoute } from "./milo/financeExport";
import { analyzeImage, imageAnalysisRuntimeStatus } from "./milo/imageAnalysis";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { changeAdminPassword } from "./adminPassword";
import * as db from "./db";

const app = express();

app.set("trust proxy", 1);

// Webhook routes verify their own payload/signature and therefore must be
// registered before the generic JSON parser.
registerSaveResultImageRoute(app);
registerFinanceExportRoute(app);
registerLineWebhook(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

const healthHandler = async (_req: express.Request, res: express.Response) => {
  const runtime = await imageAnalysisRuntimeStatus();
  const mode = runtime.mode;
  res.status(200).json({
    status: "ok",
    service: "milo",
    release: "slip-ocr-fallback-2026-09-12",
    visionConfigured: runtime.authenticated,
    imageAnalysisMode: mode,
    visionModel: mode === "ocr-fallback" ? "tesseract-tha+eng" : process.env.MILO_VISION_MODEL || (mode.startsWith("vercel-ai-gateway") ? "google/gemini-2.5-flash" : mode.startsWith("forge-vision") ? "gemini-3-flash-preview" : "unconfigured"),
    ocrAssetsReady: runtime.ocrAssetsReady,
    timestamp: new Date().toISOString(),
  });
};

app.get("/api/health", healthHandler);
app.get("/health", healthHandler);

// Temporary production-only smoke endpoint. It uses a random one-time path,
// returns no credentials, and is removed immediately after the E2E check.
app.get("/api/internal/vision-smoke-c4b1e22134121301d0a33e9e38df49ff", async (_req, res) => {
  try {
    const svg = `<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="70" y="110" font-size="54" font-family="Arial, sans-serif" font-weight="700" fill="black">BANK TRANSFER SUCCESS</text>
      <text x="70" y="230" font-size="42" font-family="Arial, sans-serif" fill="black">Date: 12/09/2026</text>
      <text x="70" y="300" font-size="42" font-family="Arial, sans-serif" fill="black">Time: 14:30</text>
      <text x="70" y="420" font-size="42" font-family="Arial, sans-serif" fill="black">From: TEST USER</text>
      <text x="70" y="500" font-size="42" font-family="Arial, sans-serif" fill="black">To: TEST COFFEE SHOP</text>
      <text x="70" y="650" font-size="58" font-family="Arial, sans-serif" font-weight="700" fill="black">Amount: THB 123.45</text>
      <text x="70" y="740" font-size="38" font-family="Arial, sans-serif" fill="black">Fee: THB 15.00</text>
      <text x="70" y="860" font-size="38" font-family="Arial, sans-serif" fill="black">Reference: SMOKE123456</text>
      <text x="70" y="970" font-size="38" font-family="Arial, sans-serif" fill="black">PromptPay</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const analysis = await analyzeImage(`data:image/png;base64,${png.toString("base64")}`);
    const proposal = analysis.proposals.find(item => item.kind === "expense") ?? analysis.proposals[0];
    const amountOk = Math.abs(Number(proposal?.amount ?? 0) - 123.45) < 0.001;
    const dateOk = proposal?.dateText === "2026-09-12";
    const typeOk = proposal?.documentType === "bank_slip";
    const merchantOk = /TEST COFFEE SHOP/i.test(proposal?.merchant ?? "");
    return res.status(200).json({
      ok: amountOk && dateOk && typeOk && merchantOk,
      assertions: { amountOk, dateOk, typeOk, merchantOk },
      analysis,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "vision smoke failed" });
  }
});

app.post("/api/admin/password", async (req, res) => {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "เฉพาะผู้ดูแลระบบเท่านั้น" });

    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";
    if (!currentPassword || !newPassword || !confirmPassword) return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบทุกช่อง" });
    if (newPassword !== confirmPassword) return res.status(400).json({ error: "รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน" });

    const username = (process.env.ADMIN_USERNAME ?? "").trim();
    const result = await changeAdminPassword({ username, currentPassword, newPassword });
    await db.writeAuditLog({ action: "admin.password.change", entityType: "admin_credential", entityId: result.userId, dashboardUserId: user.id, details: { username } });

    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.status(200).json({ success: true, requiresRelogin: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถเปลี่ยนรหัสผ่านได้";
    return res.status(400).json({ error: message });
  }
});

const trpcMiddleware = createExpressMiddleware({ router: appRouter, createContext });
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);

app.use("/api/scheduled/reminders", (req, _res, next) => {
  if (req.method === "GET") req.headers["user-agent"] = "vercel-cron/1.0";
  next();
});
app.use("/scheduled/reminders", (req, _res, next) => {
  if (req.method === "GET") req.headers["user-agent"] = "vercel-cron/1.0";
  next();
});

registerMiloCron(app);

export default app;
