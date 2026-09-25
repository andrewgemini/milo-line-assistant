import "dotenv/config";
import { createServer } from "node:http";
import app from "./api";
import { serveStatic } from "./_core/vite";
import { recoverPendingMediaWebhookEvents } from "./milo/routes";

serveStatic(app);

const port = Number.parseInt(process.env.PORT || "3000", 10);
const server = createServer(app);

let mediaRecoveryRunning = false;
let mediaRecoveryTimer: ReturnType<typeof setInterval> | undefined;

async function runMediaRecovery(source: "startup" | "interval") {
  if (mediaRecoveryRunning) return;
  mediaRecoveryRunning = true;
  try {
    const result = await recoverPendingMediaWebhookEvents({ limit: source === "startup" ? 5 : 2, leaseMs: 45_000 });
    if (result.scanned > 0) console.info("[Milo Media Recovery] container recovery pass", { source, ...result });
  } catch (error) {
    console.error("[Milo Media Recovery] container recovery pass failed", {
      source,
      error: error instanceof Error ? error.message : "unknown",
    });
  } finally {
    mediaRecoveryRunning = false;
  }
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Milo container listening on 0.0.0.0:${port}`);
  void runMediaRecovery("startup");
  mediaRecoveryTimer = setInterval(() => void runMediaRecovery("interval"), 60_000);
  mediaRecoveryTimer.unref();
});

function shutdown(signal: string) {
  if (mediaRecoveryTimer) clearInterval(mediaRecoveryTimer);
  console.log(`Received ${signal}; shutting down Milo container`);
  server.close(error => {
    if (error) {
      console.error("Milo container shutdown failed", error);
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
