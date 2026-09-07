import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { registerLineWebhook, registerMiloCron } from "../server/milo/routes";

const app = express();

registerLineWebhook(app);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ตั้งค่า tRPC Middleware
const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
  onError({ error, path }) {
    console.error(`[tRPC Error on ${path}]:`, error);
  },
});

// รองรับทุกรูปแบบของเส้นทางที่ Vercel อาจ Rewrite เข้ามา
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);
app.use("/", trpcMiddleware);

registerMiloCron(app);

// ป้องกันการส่งค่าว่าง: ถ้าหา Route ไม่เจอ ให้ตอบกลับเป็น JSON เสมอ
app.use((req, res) => {
  console.warn("[API 404]", req.method, req.url);
  res.status(404).json({ error: `Not found: ${req.method} ${req.url}` });
});

// ดักจับ Error ทั้งหมดและตอบกลับเป็น JSON เสมอ
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[API Error]", err);
  if (!res.headersSent) {
    res.status(500).json({ error: err?.message || "Internal Server Error" });
  }
});

export default app;