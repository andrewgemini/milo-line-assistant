import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { registerLineWebhook, registerMiloCron } from "./milo/routes";

const app = express();

app.set("trust proxy", 1);

// Webhook routes verify their own payload/signature and therefore must be
// registered before the generic JSON parser.
registerLineWebhook(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

const healthHandler = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
};

// Keep both paths available. Vercel normally preserves the /api prefix, while
// some serverless/proxy configurations expose the function with the prefix
// stripped. Having the alias prevents the browser from receiving the SPA HTML
// document where JSON was expected (the source of `Unexpected token '<'`).
app.get("/api/health", healthHandler);
app.get("/health", healthHandler);

const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);

// cron-job.org sends a normal GET request and supports custom Authorization
// headers, but its User-Agent cannot be customized. The legacy scheduler route
// still performs the CRON_SECRET check; this adapter only makes the request
// compatible with that route's existing GET gate.
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
