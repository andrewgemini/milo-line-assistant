import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { registerLineWebhook, registerMiloCron } from "../server/milo/routes";

const app = express();

app.use((req, res, next) => {
  if (!req.url.startsWith("/api")) {
    req.url = "/api" + req.url;
  }
  next();
});

registerLineWebhook(app);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

registerMiloCron(app);

export default app;