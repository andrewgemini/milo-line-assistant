import * as db from "../db";
import { hasMiloEntitlement, resolveMiloPlan } from "./entitlements";
import { pushText } from "./line";

export async function deliverDueReminders(context: { runner?: "heartbeat" | "manual"; taskUid?: string } = {}) {
  const due = await db.listDueReminders();
  let sent = 0;
  let failed = 0;
  for (const reminder of due) {
    const plan = resolveMiloPlan(
      reminder.createdByLineUserId,
      process.env,
      await db.isAdminLinkedLineUser(reminder.createdByLineUserId),
    );
    // A reminder created while a user had Pro access must stop delivering after downgrade.
    // Keep it pending so it can resume if the user is granted Pro again.
    if (!hasMiloEntitlement(plan, "reminders")) continue;

    const attemptId = await db.createReminderDeliveryAttempt({ reminderId: reminder.id, runner: context.runner ?? "manual", taskUid: context.taskUid });
    try {
      await pushText(reminder.lineChatId, `🔔 ${reminder.title}${reminder.detail ? `\n${reminder.detail}` : ""}`);
      await db.markReminderDelivered(reminder);
      await db.finishReminderDeliveryAttempt(attemptId, "sent");
      sent += 1;
    } catch (error) {
      await db.markReminderFailed(reminder.id);
      await db.finishReminderDeliveryAttempt(attemptId, "failed", error instanceof Error ? error.message.slice(0, 1000) : "LINE delivery failed");
      failed += 1;
    }
  }
  return { sent, failed, checked: due.length };
}
