import express, { Request, Response } from "express";

// ==========================================
// 1. Router & Logic Definition
// ==========================================
export const appRouter = express.Router();

// ตัวอย่างจำลอง logic หรือ handler ของ Milo Assistant
appRouter.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

appRouter.post("/webhook", (req: Request, res: Response) => {
  // Logic สำหรับรับ LINE Webhook event
  const events = req.body?.events || [];
  
  // จุดที่เคยเกิด Syntax Error (unterminated string):
  // ตรวจสอบให้แน่ใจว่า string ปิดสมบูรณ์ เช่น .join("\n") หรือ .join(", ")
  const summary = events.map((e: any) => e.type).join("\n");

  res.status(200).json({ received: true, count: events.length, summary });
});

// ==========================================
// 2. Main Server Application
// ==========================================
const app = express();

app.use(express.json());

// ใช้งาน router ภายในไฟล์เดียวกัน
app.use("/api", appRouter);

// Handler สำหรับ Vercel Serverless / Node HTTP Server
export default app;

// หากรันแบบ standalone server
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}