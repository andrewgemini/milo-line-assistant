import crypto from "node:crypto";
import * as db from "../db";
import { pushText } from "./line";
import { bangkokDayRange } from "./todayOverview";
import { formatEveningSummary, formatMorningBrief, shouldDeliverDailyDigest, type PersonalDigestSnapshot } from "./personalDigest";

export type PersonalDigestScope = "user" | "group" | "room";
export type PersonalDigestSlot = "morning" | "evening";

export async function buildPersonalDigestSnapshot(
  lineUserId: string,
  lineChatId: string,
  scope: PersonalDigestScope,
  reference = new Date(),
  range = bangkokDayRange(reference),
): Promise<PersonalDigestSnapshot> {
  const financeScope = scope === "user"
    ? await db.resolveFinanceAccountForLineEvent(lineUserId, lineChatId, scope)
    : undefined;
  const [calendars, reminders, todos, completedTodos, bills, finance] = await Promise.all([
    db.listCalendarEventsForRange(lineUserId, lineChatId, scope, range.start, new Date(range.end.getTime() - 1)),
    db.listRemindersForChat(lineUserId, lineChatId, scope),
    db.listTodosForChat(lineUserId, lineChatId, scope),
    db.listCompletedTodosForChat(lineUserId, lineChatId, scope, range.start, new Date(range.end.getTime() - 1)),
    financeScope ? db.listPendingBillsForChat(lineUserId, lineChatId, scope, financeScope.account.id) : Promise.resolve([]),
    financeScope ? db.financeReport(lineUserId, "day", reference, financeScope.account.id) : Promise.resolve(undefined),
  ]);
  return {
    reference,
    calendars,
    reminders: reminders.filter(item => item.status === "active" && item.nextRunAt && item.nextRunAt >= range.start && item.nextRunAt < range.end),
    todos,
    completedTodos,
    // Include overdue pending bills as well as bills due today so a missed bill never disappears from a daily brief.
    bills: bills.filter(item => item.dueAt < range.end),
    finance,
  };
}

function personalDigestStateKey(settingKey: string, lineUserId: string) {
  const userHash = crypto.createHash("sha256").update(lineUserId).digest("hex").slice(0, 24);
  return `${settingKey}:${userHash}`;
}

function personalDigestFailureKey(settingKey: string, lineUserId: string) {
  return `${personalDigestStateKey(settingKey, lineUserId)}:failure`;
}

function withinFailureCooldown(lastRunAt: Date | string | null | undefined, reference: Date, cooldownMs = 15 * 60_000) {
  if (!lastRunAt) return false;
  const elapsed = reference.getTime() - new Date(lastRunAt).getTime();
  return elapsed >= 0 && elapsed < cooldownMs;
}

function bangkokHour(reference: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(reference));
}

export function personalDigestSlotForBangkok(reference = new Date()): PersonalDigestSlot | undefined {
  const hour = bangkokHour(reference);
  if (hour < 7) return undefined;
  return hour < 20 ? "morning" : "evening";
}

export async function deliverPersonalDigestBatch(input: {
  settingKey: string;
  slot: PersonalDigestSlot;
  reference?: Date;
}) {
  const reference = input.reference ?? new Date();
  const globalSetting = await db.getAutomationSetting(input.settingKey);
  if (globalSetting?.isEnabled === false) {
    return { slot: input.slot, scanned: 0, delivered: 0, skipped: 0, failed: 0, disabled: true };
  }

  const recipients = await db.listActivePrivateLineUsers();
  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  const formatter = input.slot === "morning" ? formatMorningBrief : formatEveningSummary;

  for (const targetLineUserId of recipients) {
    const stateKey = personalDigestStateKey(input.settingKey, targetLineUserId);
    const failureKey = personalDigestFailureKey(input.settingKey, targetLineUserId);
    const [state, failureState] = await Promise.all([
      db.getAutomationSetting(stateKey),
      db.getAutomationSetting(failureKey),
    ]);
    if (!shouldDeliverDailyDigest(state?.lastRunAt, reference) || withinFailureCooldown(failureState?.lastRunAt, reference)) {
      skipped += 1;
      continue;
    }
    try {
      const snapshot = await buildPersonalDigestSnapshot(targetLineUserId, targetLineUserId, "user", reference);
      await pushText(targetLineUserId, formatter(snapshot));
      await db.saveAutomationSetting({ settingKey: stateKey, isEnabled: true, lastRunAt: reference });
      delivered += 1;
    } catch (error) {
      failed += 1;
      await db.saveAutomationSetting({ settingKey: failureKey, isEnabled: true, lastRunAt: reference }).catch(() => undefined);
      await db.writeAuditLog({
        action: "personal_digest.delivery_failed",
        entityType: "personal_digest",
        actorLineUserId: targetLineUserId,
        lineChatId: targetLineUserId,
        details: {
          slot: input.slot,
          settingKey: input.settingKey,
          error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
        },
      }).catch(() => undefined);
    }
  }

  await db.saveAutomationSetting({
    settingKey: input.settingKey,
    scheduleCronTaskUid: globalSetting?.scheduleCronTaskUid ?? null,
    isEnabled: globalSetting?.isEnabled ?? true,
    lastRunAt: reference,
  });
  return { slot: input.slot, scanned: recipients.length, delivered, skipped, failed, disabled: false };
}

export async function deliverDuePersonalDigests(reference = new Date()) {
  const slot = personalDigestSlotForBangkok(reference);
  if (!slot) return { slot: null, scanned: 0, delivered: 0, skipped: 0, failed: 0, disabled: false };
  return deliverPersonalDigestBatch({
    settingKey: slot === "morning" ? "personal-digest-morning" : "personal-digest-evening",
    slot,
    reference,
  });
}
