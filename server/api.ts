import express, { Request, Response } from "express";

export const appRouter = express.Router();

appRouter.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

appRouter.post("/webhook", (req: Request, res: Response) => {
  const events = req.body?.events || [];
  const summary = events.map((e: any) => e.type).join("\n");
  res.status(200).json({ received: true, count: events.length, summary });
});

const app = express();
app.use(express.json());
app.use("/api", appRouter);

export default app;

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}