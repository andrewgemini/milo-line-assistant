import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { registerLineWebhook, registerMiloCron } from "./milo/routes";
import { registerSaveResultImageRoute } from "./milo/saveResultImage";
import { registerFinanceReportImageRoute } from "./milo/financeReportImage";
import { registerRichMenuDataImageRoute } from "./milo/richMenuDataImage";
import { registerFinanceExportRoute } from "./milo/financeExport";
import { registerCalendarExportRoute } from "./milo/calendar";
import { registerMiloStorageRoute } from "./milo/storageRoute";
import { storageRuntimeStatus } from "./storage";
import { imageAnalysisRuntimeStatus } from "./milo/imageAnalysis";
import { voiceTranscriptionRuntimeStatus } from "./_core/voiceTranscription";
import { googleGeminiModel } from "./_core/googleGemini";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { changeAdminPassword } from "./adminPassword";
import * as db from "./db";

const app = express();

app.set("trust proxy", 1);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

registerSaveResultImageRoute(app);
registerFinanceReportImageRoute(app);
registerRichMenuDataImageRoute(app);
registerFinanceExportRoute(app);
registerCalendarExportRoute(app);
registerMiloStorageRoute(app);
registerLineWebhook(app);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Legacy Forge storage URLs remain supported for files stored before v1.2.
registerStorageProxy(app);
registerOAuthRoutes(app);

const healthHandler = async (req: express.Request, res: express.Response) => {
  const gatewayToken = req.header("x-vercel-oidc-token")?.trim() || undefined;
  const runtime = await imageAnalysisRuntimeStatus(gatewayToken);
  const mode = runtime.mode;
  const voice = voiceTranscriptionRuntimeStatus(gatewayToken);
  const storage = storageRuntimeStatus();
  res.status(200).json({
    status: runtime.authenticated && voice.configured && Boolean(process.env.LINE_CHANNEL_SECRET?.trim()) && Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()) && Boolean(process.env.DATABASE_URL?.trim()) ? "ok" : "degraded",
    service: "milo",
    release: "document-intelligence-v1-2026-09-16",
    visionConfigured: runtime.authenticated,
    imageAnalysisMode: mode,
    visionModel: mode === "ocr-fallback" ? "tesseract-tha+eng" : mode.startsWith("google-gemini") ? googleGeminiModel("vision") : process.env.MILO_VISION_MODEL || (mode.startsWith("vercel-ai-gateway") ? "google/gemini-2.5-flash" : mode.startsWith("forge-vision") ? "gemini-3-flash-preview" : "unconfigured"),
    ocrAssetsReady: runtime.ocrAssetsReady,
    voiceConfigured: voice.configured,
    voiceTranscriptionMode: voice.mode,
    voiceTranscriptionModel: voice.mode.startsWith("google-gemini") ? googleGeminiModel("audio") : null,
    voiceLocalBundled: voice.local?.bundled ?? false,
    voiceLocalModel: voice.local?.model ?? null,
    storage: {
      requestedProvider: storage.requested,
      activeProvider: storage.activeProvider,
      configuredProviders: storage.configuredProviders,
    },
    readiness: {
      lineConfigured: Boolean(process.env.LINE_CHANNEL_SECRET?.trim()) && Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()),
      databaseConfigured: Boolean(process.env.DATABASE_URL?.trim()),
      exportSigningConfigured: Boolean(process.env.LINE_CHANNEL_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.SESSION_SECRET?.trim()),
      cronConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      duplicateProtection: true,
      undoSupported: true,
      webhookSignatureVerification: true,
      calendarSupported: true,
      durableVaultStorageConfigured: storage.configured,
      databaseVaultStorageSupported: true,
      storageProviderChoiceSupported: true,
      googleDriveStorageSupported: true,
      s3CompatibleStorageSupported: true,
      groupSharedVaultSearch: true,
    },
    timestamp: new Date().toISOString(),
  });
};

app.get("/api/health", healthHandler);
app.get("/health", healthHandler);

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
