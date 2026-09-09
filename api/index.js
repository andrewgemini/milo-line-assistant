// server/api.ts
import express from "express";
var appRouter = express.Router();
appRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
appRouter.post("/webhook", (req, res) => {
  const events = req.body?.events || [];
  const summary = events.map((e) => e.type).join("\n");
  res.status(200).json({ received: true, count: events.length, summary });
});
var app = express();
app.use(express.json());
app.use("/api", appRouter);
var api_default = app;
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3e3;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
export {
  appRouter,
  api_default as default
};
