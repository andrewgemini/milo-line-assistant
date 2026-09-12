import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { registerLineWebhook, registerMiloCron } from "./milo/routes";
import { registerSaveResultImageRoute } from "./milo/saveResultImage";
import { registerFinanceExportRoute } from "./milo/financeExport";
import { imageAnalysisRuntimeStatus } from "./milo/imageAnalysis";
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
    release: "slip-vision-oidc-runtime-2026-09-12",
    visionConfigured: runtime.authenticated,
    imageAnalysisMode: mode,
    visionModel: process.env.MILO_VISION_MODEL || (mode.startsWith("vercel-ai-gateway") ? "google/gemini-2.5-flash" : mode === "forge-vision" ? "gemini-3-flash-preview" : "unconfigured"),
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
