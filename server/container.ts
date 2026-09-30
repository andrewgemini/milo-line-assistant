import "dotenv/config";
import { createServer } from "node:http";
import app from "./api";
import { serveStatic } from "./_core/vite";
import { recoverPendingMediaWebhookEvents } from "./milo/routes";
import { recoverMissingVaultMedia } from "./milo/vaultRecovery";
import { deliverDuePersonalDigests } from "./milo/personalDigestDelivery";
import { deliverDueReminders } from "./milo/reminderDelivery";
import { deliverDueRecurringTransactions } from "./milo/recurringTransactionDelivery";
import * as db from "./db";

serveStatic(app);

const port = Number.parseInt(process.env.PORT || "3000", 10);
const server = createServer(app);

let mediaRecoveryRunning = false;
let mediaRecoveryTimer: ReturnType<typeof setInterval> | undefined;
let personalDigestRunning = false;
let personalDigestTimer: ReturnType<typeof setInterval> | undefined;

async function runPersonalDigestScheduler(source: "startup" | "interval") {
  if (personalDigestRunning) return;
  personalDigestRunning = true;
  const now = new Date();
  try {
    const schedule = await db.getAutomationSetting("reminder-delivery-primary");
    const externalHeartbeatFresh = Boolean(
      schedule?.isEnabled
      && schedule.scheduleCronTaskUid
      && schedule.lastRunAt
      && now.getTime() - new Date(schedule.lastRunAt).getTime() < 5 * 60_000,
    );
    let reminders = { sent: 0, failed: 0, checked: 0 };
    let recurring = { created: 0, skipped: 0, failed: 0 };
    if (schedule?.isEnabled !== false && !externalHeartbeatFresh) {
      reminders = await deliverDueReminders({ runner: "heartbeat", taskUid: "render-container-fallback" });
      recurring = await deliverDueRecurringTransactions(now);
    }
    const digest = await deliverDuePersonalDigests(now);
    if (reminders.checked > 0 || recurring.created > 0 || recurring.failed > 0 || (digest.slot && (digest.delivered > 0 || digest.failed > 0))) {
      console.info("[Milo Scheduler] container delivery pass", { source, externalHeartbeatFresh, reminders, recurring, digest });
    }
  } catch (error) {
    console.error("[Milo Scheduler] container delivery pass failed", {
      source,
      error: error instanceof Error ? error.message : "unknown",
    });
  } finally {
    personalDigestRunning = false;
  }
}

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
  void recoverMissingVaultMedia({ limit: 50 }).then(result => {
    if (result.scanned > 0) console.info("[Milo Vault Recovery] startup backfill", result);
  }).catch(error => {
    console.error("[Milo Vault Recovery] startup backfill failed", { error: error instanceof Error ? error.message : "unknown" });
  });
  void runPersonalDigestScheduler("startup");
  mediaRecoveryTimer = setInterval(() => void runMediaRecovery("interval"), 60_000);
  mediaRecoveryTimer.unref();
  personalDigestTimer = setInterval(() => void runPersonalDigestScheduler("interval"), 60_000);
  personalDigestTimer.unref();
});

function shutdown(signal: string) {
  if (mediaRecoveryTimer) clearInterval(mediaRecoveryTimer);
  if (personalDigestTimer) clearInterval(personalDigestTimer);
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
