import * as db from "../db";
import { financeReportCardText, pushFinanceReportCard, pushText, type FinanceReportCard } from "./line";

export type FinanceDigestType = "daily" | "weekly";

type DigestWindow = { periodKey: string; start: Date; end: Date; title: string; subtitle: string; period: FinanceReportCard["period"] };

function bangkokParts(reference: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(reference);
  const value = (name: string) => Number(parts.find(part => part.type === name)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function bangkokMidnightUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, -7));
}

function shiftBangkokDate(parts: ReturnType<typeof bangkokParts>, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function dateKey(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function thaiDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(date);
}

export function financeDigestWindow(type: FinanceDigestType, reference = new Date()): DigestWindow {
  const today = bangkokParts(reference);
  const todayStart = bangkokMidnightUtc(today.year, today.month, today.day);
  if (type === "daily") {
    const yesterday = shiftBangkokDate(today, -1);
    const start = bangkokMidnightUtc(yesterday.year, yesterday.month, yesterday.day);
    return { periodKey: dateKey(yesterday), start, end: new Date(todayStart.getTime() - 1), period: "day", title: "สรุปการเงินเมื่อวานนี้", subtitle: `รอบวันที่ ${thaiDate(start)}` };
  }
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const mondayDistance = weekday === 0 ? 6 : weekday - 1;
  const thisMonday = shiftBangkokDate(today, -mondayDistance);
  const lastMonday = shiftBangkokDate(thisMonday, -7);
  const start = bangkokMidnightUtc(lastMonday.year, lastMonday.month, lastMonday.day);
  const end = new Date(bangkokMidnightUtc(thisMonday.year, thisMonday.month, thisMonday.day).getTime() - 1);
  return { periodKey: `${dateKey(lastMonday)}_to_${dateKey(shiftBangkokDate(thisMonday, -1))}`, start, end, period: "week", title: "สรุปการเงินสัปดาห์ที่ผ่านมา", subtitle: `${thaiDate(start)} – ${thaiDate(end)}` };
}

export async function deliverFinanceDigest(input: { settingKey: string; taskUid: string; digestType: FinanceDigestType; now?: Date }) {
  const targetLineUserId = await db.getOwnerLinkedLineUser();
  if (!targetLineUserId) return { skipped: "no-linked-private-line-user" as const };
  const personalAccount = await db.getOrCreatePersonalFinanceAccount(targetLineUserId);
  const window = financeDigestWindow(input.digestType, input.now);
  const deliveryId = await db.claimFinanceDigestDelivery({ settingKey: input.settingKey, taskUid: input.taskUid, targetLineUserId, digestType: input.digestType, periodKey: window.periodKey });
  if (!deliveryId) return { skipped: "already-delivered" as const, periodKey: window.periodKey };
  const report = await db.financeReportRange(targetLineUserId, window.start, window.end, personalAccount.id);
  const card: FinanceReportCard = { period: window.period, title: window.title, subtitle: window.subtitle, income: report.income, expense: report.expense, balance: report.balance, categories: report.categories };
  try {
    await pushFinanceReportCard(targetLineUserId, card);
  } catch (error) {
    try {
      await pushText(targetLineUserId, financeReportCardText(card));
    } catch (fallbackError) {
      const message = fallbackError instanceof Error ? fallbackError.message : error instanceof Error ? error.message : "LINE delivery failed";
      await db.finishFinanceDigestDelivery(deliveryId, "failed", message.slice(0, 1000));
      await db.writeAuditLog({ action: "finance_digest.failed", entityType: "finance_digest_delivery", entityId: deliveryId, actorLineUserId: targetLineUserId, lineChatId: targetLineUserId, details: { digestType: input.digestType, periodKey: window.periodKey } });
      throw fallbackError;
    }
  }
  await db.finishFinanceDigestDelivery(deliveryId, "sent");
  await db.writeAuditLog({ action: "finance_digest.sent", entityType: "finance_digest_delivery", entityId: deliveryId, actorLineUserId: targetLineUserId, lineChatId: targetLineUserId, details: { digestType: input.digestType, periodKey: window.periodKey } });
  await db.saveAutomationSetting({ settingKey: input.settingKey, scheduleCronTaskUid: input.taskUid, isEnabled: true, lastRunAt: new Date() });
  return { delivered: true as const, periodKey: window.periodKey, deliveryId };
}
