import type { Express, Request, Response } from "express";
import { storageGetGoogleDriveResponse, storageGetSignedUrl } from "../storage";

function decodeStorageKey(raw: string) {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export function registerMiloStorageRoute(app: Express) {
  app.get("/api/milo/storage/:key", async (req: Request, res: Response) => {
    const key = decodeStorageKey(req.params.key);
    if (!key) return res.status(400).type("text/plain").send("missing storage key");
    try {
      if (key.startsWith("gdrive:")) {
        const upstream = await storageGetGoogleDriveResponse(key);
        if (!upstream) return res.status(404).type("text/plain").send("storage object not found");
        if (!upstream.ok) return res.status(upstream.status).type("text/plain").send("storage download failed");
        const contentType = upstream.headers.get("content-type");
        const contentLength = upstream.headers.get("content-length");
        if (contentType) res.setHeader("Content-Type", contentType);
        if (contentLength) res.setHeader("Content-Length", contentLength);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
      }
      const url = await storageGetSignedUrl(key);
      res.setHeader("Cache-Control", "private, no-store");
      return res.redirect(307, url);
    } catch (error) {
      console.error("[Milo Storage] download failed", { error: error instanceof Error ? error.message : "unknown" });
      return res.status(503).type("text/plain").send("storage unavailable");
    }
  });
}
