import { and, desc, eq, gte, inArray, like, lte, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  budgets,
  expenseCategories,
  financeAccountMembers,
  financeAccounts,
  automationSettings,
  financeDigestDeliveries,
  financeOpeningBalances,
  imageExtractions,
  lineAccountLinks,
  lineChats,
  lineMembers,
  notes,
  reminders,
  reminderDeliveryAttempts,
  recurringTransactionRuns,
  recurringTransactions,
  todoItems,
  transactionAttachments,
  transactions,
  users,
  vaultItems,
  voiceTranscriptions,
  webhookEvents,
  type InsertUser,
  type Reminder,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { buildFinanceAnalytics } from "./milo/financeAnalytics";
import { buildFinanceReport, financeReportWindow, summarizeFinanceRows, type FinancePeriod } from "./milo/financeReport";
import { budgetCycleWindow, normalizeBudgetCycleStartDay } from "./milo/budgetCycle";

import mysql from "mysql2/promise";

let database: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!database && process.env.DATABASE_URL) {
    try {
      const pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: {
          minVersion: "TLSv1.2",
          rejectUnauthorized: true,
        },
      });
      // mysql2 exposes two compatible Pool declarations in the current pnpm graph.
      // Drizzle accepts the runtime pool; this assertion keeps TypeScript from treating
      // the duplicate declarations as unrelated structural types.
      database = drizzle(pool as any) as any;
    } catch (e) {
      console.error("[DB Pool Error]", e);
      database = drizzle(process.env.DATABASE_URL);
    }
  }
  return database;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export function initialUserRole(user: Pick<InsertUser, "openId" | "role">) {
  return user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
}

export function userProfileUpdateValues(user: InsertUser) {
  return {
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };
}

export async function upsertUser(user: InsertUser) {
  const db = await requireDb();
  const role = initialUserRole(user);
  const profile = userProfileUpdateValues(user);
  await db.insert(users).values({
    openId: user.openId,
    name: profile.name,
    email: profile.email,
    loginMethod: profile.loginMethod,
    role,
    lastSignedIn: profile.lastSignedIn,
  }).onDuplicateKeyUpdate({ set: profile });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function upsertLineChat(lineChatId: string, scope: "user" | "group" | "room", displayName?: string) {
  const db = await requireDb();
  await db.insert(lineChats).values({ lineChatId, scope, displayName: displayName ?? null, isActive: true })
    .onDuplicateKeyUpdate({ set: { scope, displayName: displayName ?? null, isActive: true } });
}

export async function upsertLineMember(lineChatId: string, lineUserId: string, displayName?: string) {
  const db = await requireDb();
  await db.insert(lineMembers).values({ lineChatId, lineUserId, displayName: displayName ?? null })
    .onDuplicateKeyUpdate({ set: { displayName: displayName ?? null } });
}

export async function findLineMemberByName(lineChatId: string, displayName: string) {
  const db = await requireDb();
  return (await db.select().from(lineMembers)
    .where(and(eq(lineMembers.lineChatId, lineChatId), like(lineMembers.displayName, `%${displayName.trim()}%`)))
    .limit(1))[0];
}

export async function listLineGroups(lineUserId: string) {
  const db = await requireDb();
  return db.select({ chat: lineChats }).from(lineMembers)
    .innerJoin(lineChats, eq(lineMembers.lineChatId, lineChats.lineChatId))
    .where(and(eq(lineMembers.lineUserId, lineUserId), eq(lineChats.scope, "group")));
}

export type FinanceAccountRole = "owner" | "manager" | "contributor" | "viewer";
export type FinanceAccountType = "personal" | "group";

export const financeAccountPermissions: Record<FinanceAccountRole, { read: true; createTransaction: boolean; manageTransactions: boolean; manageSettings: boolean; manageMembers: boolean }> = {
  owner: { read: true, createTransaction: true, manageTransactions: true, manageSettings: true, manageMembers: true },
  manager: { read: true, createTransaction: true, manageTransactions: true, manageSettings: true, manageMembers: false },
  contributor: { read: true, createTransaction: true, manageTransactions: false, manageSettings: false, manageMembers: false },
  viewer: { read: true, createTransaction: false, manageTransactions: false, manageSettings: false, manageMembers: false },
};

export function canManageFinanceAccountMembers(role: FinanceAccountRole) { return financeAccountPermissions[role].manageMembers; }
export function canCreateFinanceTransaction(role: FinanceAccountRole) { return financeAccountPermissions[role].createTransaction; }
export function canManageFinanceTransactions(role: FinanceAccountRole) { return financeAccountPermissions[role].manageTransactions; }
export function canManageFinanceSettings(role: FinanceAccountRole) { return financeAccountPermissions[role].manageSettings; }

export async function getOrCreatePersonalFinanceAccount(lineUserId: string) {
  const db = await requireDb();
  const existing = (await db.select().from(financeAccounts).where(and(eq(financeAccounts.accountType, "personal"), eq(financeAccounts.ownerLineUserId, lineUserId))).limit(1))[0];
  if (existing) {
    await db.insert(financeAccountMembers).values({ financeAccountId: existing.id, lineUserId, role: "owner" }).onDuplicateKeyUpdate({ set: { role: "owner" } });
    return existing;
  }
  try {
    const result = await db.insert(financeAccounts).values({ accountType: "personal", name: "บัญชีส่วนตัว", ownerLineUserId: lineUserId, lineChatId: lineUserId });
    const id = Number(result[0].insertId);
    await db.insert(financeAccountMembers).values({ financeAccountId: id, lineUserId, role: "owner" });
    return (await db.select().from(financeAccounts).where(eq(financeAccounts.id, id)).limit(1))[0]!;
  } catch {
    const created = (await db.select().from(financeAccounts).where(and(eq(financeAccounts.accountType, "personal"), eq(financeAccounts.ownerLineUserId, lineUserId))).limit(1))[0];
    if (!created) throw new Error("ไม่สามารถสร้างบัญชีส่วนตัวได้");
    await db.insert(financeAccountMembers).values({ financeAccountId: created.id, lineUserId, role: "owner" }).onDuplicateKeyUpdate({ set: { role: "owner" } });
    return created;
  }
}

export async function getFinanceAccountBudgetCycleStartDay(financeAccountId: number) {
  const db = await requireDb();
  const row = (await db.select({ budgetCycleStartDay: financeAccounts.budgetCycleStartDay }).from(financeAccounts).where(eq(financeAccounts.id, financeAccountId)).limit(1))[0];
  return normalizeBudgetCycleStartDay(row?.budgetCycleStartDay ?? 1);
}

export async function updateFinanceAccountBudgetCycleStartDay(financeAccountId: number, day: number) {
  const db = await requireDb();
  const normalized = normalizeBudgetCycleStartDay(day);
  const result = await db.update(financeAccounts).set({ budgetCycleStartDay: normalized }).where(eq(financeAccounts.id, financeAccountId));
  return result[0].affectedRows > 0 ? normalized : undefined;
}

export async function listFinanceAccounts(lineUserId: string) {
  const db = await requireDb();
  return db.select({ account: financeAccounts, membership: financeAccountMembers }).from(financeAccountMembers)
    .innerJoin(financeAccounts, eq(financeAccountMembers.financeAccountId, financeAccounts.id))
    .where(and(eq(financeAccountMembers.lineUserId, lineUserId), eq(financeAccounts.isActive, true)))
    .orderBy(financeAccounts.accountType, financeAccounts.name);
}

export async function getFinanceAccountAccess(financeAccountId: number, lineUserId: string) {
  const db = await requireDb();
  return (await db.select({ account: financeAccounts, membership: financeAccountMembers }).from(financeAccountMembers)
    .innerJoin(financeAccounts, eq(financeAccountMembers.financeAccountId, financeAccounts.id))
    .where(and(eq(financeAccountMembers.financeAccountId, financeAccountId), eq(financeAccountMembers.lineUserId, lineUserId), eq(financeAccounts.isActive, true))).limit(1))[0];
}

export async function resolveFinanceAccountForLineEvent(lineUserId: string, lineChatId: string, scope: "user" | "group" | "room") {
  if (scope === "user") {
    const account = await getOrCreatePersonalFinanceAccount(lineUserId);
    return { account, membership: { role: "owner" as const } };
  }
  const db = await requireDb();
  return (await db.select({ account: financeAccounts, membership: financeAccountMembers }).from(financeAccounts)
    .innerJoin(financeAccountMembers, eq(financeAccountMembers.financeAccountId, financeAccounts.id))
    .where(and(eq(financeAccounts.accountType, "group"), eq(financeAccounts.lineChatId, lineChatId), eq(financeAccounts.isActive, true), eq(financeAccountMembers.lineUserId, lineUserId))).limit(1))[0];
}

export async function createGroupFinanceAccount(input: { ownerLineUserId: string; lineChatId: string; name: string }) {
  const db = await requireDb();
  const group = (await db.select({ id: lineChats.id }).from(lineChats)
    .innerJoin(lineMembers, eq(lineMembers.lineChatId, lineChats.lineChatId))
    .where(and(eq(lineChats.lineChatId, input.lineChatId), eq(lineChats.scope, "group"), eq(lineMembers.lineUserId, input.ownerLineUserId))).limit(1))[0];
  if (!group) throw new Error("ไม่พบสิทธิ์ของคุณในกลุ่ม LINE นี้ กรุณาให้ไมโลเห็นข้อความจากกลุ่มก่อน");
  const exists = (await db.select({ id: financeAccounts.id }).from(financeAccounts).where(eq(financeAccounts.lineChatId, input.lineChatId)).limit(1))[0];
  if (exists) throw new Error("กลุ่มนี้มีสมุดบัญชีอยู่แล้ว");
  const result = await db.insert(financeAccounts).values({ accountType: "group", name: input.name.trim(), ownerLineUserId: input.ownerLineUserId, lineChatId: input.lineChatId });
  const id = Number(result[0].insertId);
  await db.insert(financeAccountMembers).values({ financeAccountId: id, lineUserId: input.ownerLineUserId, role: "owner" });
  await writeAuditLog({ action: "finance_account.create", entityType: "finance_account", entityId: id, actorLineUserId: input.ownerLineUserId, lineChatId: input.lineChatId, details: { accountType: "group" } });
  return id;
}

export async function listFinanceAccountMembers(financeAccountId: number) {
  const db = await requireDb();
  return db.select().from(financeAccountMembers).where(eq(financeAccountMembers.financeAccountId, financeAccountId)).orderBy(financeAccountMembers.role, financeAccountMembers.lineUserId);
}

export async function isEligibleGroupFinanceAccountMember(financeAccountId: number, lineUserId: string) {
  const db = await requireDb();
  const row = (await db.select({ id: financeAccounts.id }).from(financeAccounts)
    .innerJoin(lineMembers, eq(lineMembers.lineChatId, financeAccounts.lineChatId))
    .where(and(eq(financeAccounts.id, financeAccountId), eq(financeAccounts.accountType, "group"), eq(lineMembers.lineUserId, lineUserId))).limit(1))[0];
  return Boolean(row);
}

export async function upsertFinanceAccountMember(input: { financeAccountId: number; lineUserId: string; role: Exclude<FinanceAccountRole, "owner"> }) {
  const db = await requireDb();
  await db.insert(financeAccountMembers).values(input).onDuplicateKeyUpdate({ set: { role: input.role } });
}

export async function removeFinanceAccountMember(financeAccountId: number, lineUserId: string) {
  const db = await requireDb();
  const result = await db.delete(financeAccountMembers).where(and(eq(financeAccountMembers.financeAccountId, financeAccountId), eq(financeAccountMembers.lineUserId, lineUserId), ne(financeAccountMembers.role, "owner")));
  return result[0].affectedRows > 0;
}

export async function registerWebhookEvent(input: { webhookEventId: string; eventType: string; lineChatId?: string; occurredAt: Date; rawPayload: string }) {
  const db = await requireDb();
  try {
    await db.insert(webhookEvents).values({ ...input, lineChatId: input.lineChatId ?? null });
    return true;
  } catch {
    return false;
  }
}

export async function finishWebhookEvent(webhookEventId: string, status: "processed" | "ignored" | "failed", errorMessage?: string) {
  const db = await requireDb();
  await db.update(webhookEvents).set({ status, errorMessage: errorMessage ?? null, processedAt: new Date() }).where(eq(webhookEvents.webhookEventId, webhookEventId));
}

export async function createReminder(input: {
  lineChatId: string; createdByLineUserId: string; title: string; detail?: string;
  recurrenceType: "once" | "minute" | "day" | "week" | "month"; recurrenceInterval: number;
  recurrenceWeekdays?: string; recurrenceDayOfMonth?: number; dueAt: Date; nextRunAt: Date; sourceMessageId?: string; sourceImageKey?: string;
}) {
  const db = await requireDb();
  const result = await db.insert(reminders).values({
    ...input, detail: input.detail ?? null, recurrenceWeekdays: input.recurrenceWeekdays ?? null,
    recurrenceDayOfMonth: input.recurrenceDayOfMonth ?? null, sourceMessageId: input.sourceMessageId ?? null, sourceImageKey: input.sourceImageKey ?? null,
  });
  return Number(result[0].insertId);
}

export async function listReminders(lineUserId: string) {
  const db = await requireDb();
  return db.select().from(reminders).where(and(eq(reminders.createdByLineUserId, lineUserId), or(eq(reminders.status, "active"), eq(reminders.status, "paused")))).orderBy(reminders.nextRunAt);
}

export async function deleteReminder(id: number, lineUserId: string) {
  const db = await requireDb();
  await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.createdByLineUserId, lineUserId)));
}

export async function listDueReminders(now = new Date()) {
  const db = await requireDb();
  return db.select().from(reminders).where(and(eq(reminders.status, "active"), lte(reminders.nextRunAt, now))).orderBy(reminders.nextRunAt).limit(50);
}

export async function markReminderDelivered(reminder: Reminder) {
  const db = await requireDb();
  const deliveredAt = new Date();
  let nextRunAt: Date | null = null;
  if (reminder.recurrenceType === "minute") nextRunAt = new Date(deliveredAt.getTime() + reminder.recurrenceInterval * 60_000);
  if (reminder.recurrenceType === "day") nextRunAt = new Date(deliveredAt.getTime() + reminder.recurrenceInterval * 86_400_000);
  if (reminder.recurrenceType === "week") nextRunAt = new Date(deliveredAt.getTime() + reminder.recurrenceInterval * 7 * 86_400_000);
  if (reminder.recurrenceType === "month") {
    nextRunAt = new Date(deliveredAt);
    nextRunAt.setMonth(nextRunAt.getMonth() + reminder.recurrenceInterval);
    nextRunAt.setDate(Math.min(reminder.recurrenceDayOfMonth ?? deliveredAt.getDate(), 28));
  }
  await db.update(reminders).set({
    status: nextRunAt ? "active" : "completed", nextRunAt, lastDeliveredAt: deliveredAt, lastDeliveryResult: "sent",
  }).where(eq(reminders.id, reminder.id));
}

export async function markReminderFailed(id: number) {
  const db = await requireDb();
  await db.update(reminders).set({ lastDeliveryResult: "failed" }).where(eq(reminders.id, id));
}

export async function createReminderDeliveryAttempt(input: { reminderId: number; runner: "heartbeat" | "manual"; taskUid?: string }) {
  const db = await requireDb();
  const result = await db.insert(reminderDeliveryAttempts).values({ reminderId: input.reminderId, runner: input.runner, taskUid: input.taskUid ?? null });
  return Number(result[0].insertId);
}

export async function finishReminderDeliveryAttempt(id: number, status: "sent" | "failed", errorMessage?: string) {
  const db = await requireDb();
  await db.update(reminderDeliveryAttempts).set({ status, errorMessage: errorMessage ?? null, finishedAt: new Date() }).where(eq(reminderDeliveryAttempts.id, id));
}

export async function createVaultItem(input: {
  lineChatId: string; createdByLineUserId: string; itemType: "text" | "link" | "image" | "file"; title: string;
  searchableText?: string; tagsText?: string; originalFilename?: string; mimeType?: string; sourceUrl?: string; storageKey?: string; storageUrl?: string; lineMessageId?: string;
}) {
  const db = await requireDb();
  const result = await db.insert(vaultItems).values({
    ...input, searchableText: input.searchableText ?? null, tagsText: input.tagsText ?? null, originalFilename: input.originalFilename ?? null,
    mimeType: input.mimeType ?? null, sourceUrl: input.sourceUrl ?? null, storageKey: input.storageKey ?? null, storageUrl: input.storageUrl ?? null, lineMessageId: input.lineMessageId ?? null,
  });
  return Number(result[0].insertId);
}

export async function searchVault(lineUserId: string, term = "") {
  const db = await requireDb();
  const base = and(eq(vaultItems.createdByLineUserId, lineUserId), eq(vaultItems.status, "active"));
  const where = term.trim() ? and(base, or(like(vaultItems.title, `%${term}%`), like(vaultItems.searchableText, `%${term}%`), like(vaultItems.tagsText, `%${term}%`))) : base;
  return db.select().from(vaultItems).where(where).orderBy(desc(vaultItems.createdAt)).limit(100);
}

export async function updateVaultMetadata(id: number, lineUserId: string, input: { tagsText?: string | null; sourceUrl?: string | null }) {
  const db = await requireDb();
  await db.update(vaultItems).set({ tagsText: input.tagsText ?? null, sourceUrl: input.sourceUrl ?? null })
    .where(and(eq(vaultItems.id, id), eq(vaultItems.createdByLineUserId, lineUserId)));
}

export async function createNote(lineChatId: string, lineUserId: string, title: string, content: string) {
  const db = await requireDb();
  return db.insert(notes).values({ lineChatId, createdByLineUserId: lineUserId, title, content });
}

export async function listNotes(lineUserId: string) {
  const db = await requireDb();
  return db.select().from(notes).where(and(eq(notes.createdByLineUserId, lineUserId), eq(notes.status, "active"))).orderBy(desc(notes.updatedAt)).limit(100);
}

export async function createTodo(lineChatId: string, lineUserId: string, title: string, dueAt?: Date) {
  const db = await requireDb();
  return db.insert(todoItems).values({ lineChatId, createdByLineUserId: lineUserId, title, dueAt: dueAt ?? null });
}

export async function listTodos(lineUserId: string) {
  const db = await requireDb();
  return db.select().from(todoItems).where(and(eq(todoItems.createdByLineUserId, lineUserId), eq(todoItems.status, "todo"))).orderBy(todoItems.dueAt).limit(100);
}

export async function completeTodo(id: number, lineUserId: string) {
  const db = await requireDb();
  await db.update(todoItems).set({ status: "done", completedAt: new Date() }).where(and(eq(todoItems.id, id), eq(todoItems.createdByLineUserId, lineUserId)));
}

export async function writeAuditLog(input: { action: string; entityType: string; entityId?: number; dashboardUserId?: number; actorLineUserId?: string; lineChatId?: string; details?: Record<string, unknown> }) {
  const db = await requireDb();
  await db.insert(auditLogs).values({
    action: input.action, entityType: input.entityType, entityId: input.entityId ?? null,
    dashboardUserId: input.dashboardUserId ?? null, actorLineUserId: input.actorLineUserId ?? null,
    lineChatId: input.lineChatId ?? null, detailsJson: input.details ? JSON.stringify(input.details) : null,
  });
}

export async function createTransaction(input: { lineChatId: string; lineUserId: string; financeAccountId?: number; transactionType: "income" | "expense"; amount: number; category: string; note?: string; occurredAt?: Date; source?: string; sourceMessageId?: string }) {
  const db = await requireDb();
  const result = await db.insert(transactions).values({ ...input, amount: String(input.amount), note: input.note ?? null, occurredAt: input.occurredAt ?? new Date(), source: input.source ?? "line_text", sourceMessageId: input.sourceMessageId ?? null });
  const id = Number(result[0].insertId);
  await writeAuditLog({ action: "transaction.create", entityType: "transaction", entityId: id, actorLineUserId: input.lineUserId, lineChatId: input.lineChatId, details: { transactionType: input.transactionType, amount: input.amount, category: input.category, source: input.source ?? "line_text" } });
  return id;
}

export async function linkTransactionAttachment(input: { transactionId: number; vaultItemId: number; lineUserId: string; label?: string }) {
  const db = await requireDb();
  const [transaction] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.id, input.transactionId), eq(transactions.lineUserId, input.lineUserId))).limit(1);
  const [vault] = await db.select({ id: vaultItems.id }).from(vaultItems).where(and(eq(vaultItems.id, input.vaultItemId), eq(vaultItems.createdByLineUserId, input.lineUserId), eq(vaultItems.status, "active"))).limit(1);
  if (!transaction || !vault) return false;
  await db.insert(transactionAttachments).values({ ...input, label: input.label ?? null }).onDuplicateKeyUpdate({ set: { label: input.label ?? null } });
  await writeAuditLog({ action: "transaction.attachment.link", entityType: "transaction_attachment", entityId: input.transactionId, actorLineUserId: input.lineUserId, details: { vaultItemId: input.vaultItemId } });
  return true;
}

export async function listTransactionAttachments(transactionId: number, lineUserId: string) {
  const db = await requireDb();
  return db.select({ attachment: transactionAttachments, vault: vaultItems }).from(transactionAttachments).innerJoin(vaultItems, eq(transactionAttachments.vaultItemId, vaultItems.id)).where(and(eq(transactionAttachments.transactionId, transactionId), eq(transactionAttachments.lineUserId, lineUserId))).orderBy(desc(transactionAttachments.createdAt));
}

export async function listTransactionAttachmentsForFinanceAccount(transactionIds: number[], financeAccountId: number) {
  if (!transactionIds.length) return [];
  const db = await requireDb();
  return db.select({ transactionId: transactionAttachments.transactionId, id: transactionAttachments.id, label: transactionAttachments.label, createdAt: transactionAttachments.createdAt, vaultItemId: vaultItems.id, title: vaultItems.title, itemType: vaultItems.itemType, mimeType: vaultItems.mimeType, originalFilename: vaultItems.originalFilename, storageUrl: vaultItems.storageUrl, sourceUrl: vaultItems.sourceUrl }).from(transactionAttachments).innerJoin(transactions, eq(transactionAttachments.transactionId, transactions.id)).innerJoin(vaultItems, eq(transactionAttachments.vaultItemId, vaultItems.id)).where(and(inArray(transactionAttachments.transactionId, transactionIds), eq(transactions.financeAccountId, financeAccountId), eq(transactions.status, "active"), eq(vaultItems.status, "active"))).orderBy(desc(transactionAttachments.createdAt));
}

export async function listTransactions(lineUserId: string, start?: Date, end?: Date, includeDeleted = false, financeAccountId?: number) {
  const db = await requireDb();
  const conditions = [financeAccountId === undefined ? eq(transactions.lineUserId, lineUserId) : eq(transactions.financeAccountId, financeAccountId)];
  if (!includeDeleted) conditions.push(eq(transactions.status, "active"));
  if (start) conditions.push(gte(transactions.occurredAt, start));
  if (end) conditions.push(lte(transactions.occurredAt, end));
  return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.occurredAt)).limit(250);
}

export async function listTransactionsForExport(lineUserId: string, financeAccountId?: number, start?: Date, end?: Date) {
  const db = await requireDb();
  const conditions = [financeAccountId === undefined ? eq(transactions.lineUserId, lineUserId) : eq(transactions.financeAccountId, financeAccountId), eq(transactions.status, "active")];
  if (start) conditions.push(gte(transactions.occurredAt, start));
  if (end) conditions.push(lte(transactions.occurredAt, end));
  return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.occurredAt)).limit(10_000);
}

export async function searchTransactions(lineUserId: string, query: string, limit = 10, financeAccountId?: number) {
  const db = await requireDb();
  const term = query.trim();
  const filters = [financeAccountId === undefined ? eq(transactions.lineUserId, lineUserId) : eq(transactions.financeAccountId, financeAccountId), eq(transactions.status, "active")];
  if (term) filters.push(or(like(transactions.category, `%${term}%`), like(transactions.note, `%${term}%`))!);
  return db.select().from(transactions).where(and(...filters)).orderBy(desc(transactions.occurredAt)).limit(Math.min(Math.max(limit, 1), 50));
}

export async function updateTransaction(input: { id: number; lineUserId: string; financeAccountId?: number; amount?: number; category?: string; note?: string | null; occurredAt?: Date; transactionType?: "income" | "expense"; actorDashboardUserId?: number }) {
  const db = await requireDb();
  const scope = input.financeAccountId === undefined ? eq(transactions.lineUserId, input.lineUserId) : eq(transactions.financeAccountId, input.financeAccountId);
  const current = (await db.select().from(transactions).where(and(eq(transactions.id, input.id), scope, eq(transactions.status, "active"))).limit(1))[0];
  if (!current) return false;
  const values = { amount: input.amount === undefined ? undefined : String(input.amount), category: input.category, note: input.note, occurredAt: input.occurredAt, transactionType: input.transactionType };
  await db.update(transactions).set(values).where(eq(transactions.id, input.id));
  await writeAuditLog({ action: "transaction.update", entityType: "transaction", entityId: input.id, actorLineUserId: input.lineUserId, dashboardUserId: input.actorDashboardUserId, lineChatId: current.lineChatId, details: { before: { amount: current.amount, category: current.category, note: current.note, transactionType: current.transactionType, occurredAt: current.occurredAt }, after: { amount: input.amount, category: input.category, note: input.note, transactionType: input.transactionType, occurredAt: input.occurredAt } } });
  return true;
}

export async function deleteTransaction(input: { id: number; lineUserId: string; financeAccountId?: number; actorDashboardUserId?: number }) {
  const db = await requireDb();
  const scope = input.financeAccountId === undefined ? eq(transactions.lineUserId, input.lineUserId) : eq(transactions.financeAccountId, input.financeAccountId);
  const current = (await db.select().from(transactions).where(and(eq(transactions.id, input.id), scope, eq(transactions.status, "active"))).limit(1))[0];
  if (!current) return false;
  await db.update(transactions).set({ status: "deleted", deletedAt: new Date() }).where(eq(transactions.id, input.id));
  await writeAuditLog({ action: "transaction.delete", entityType: "transaction", entityId: input.id, dashboardUserId: input.actorDashboardUserId, actorLineUserId: input.lineUserId, lineChatId: current.lineChatId, details: { amount: current.amount, category: current.category, note: current.note, transactionType: current.transactionType } });
  return true;
}

export async function saveVoiceTranscription(input: { vaultItemId: number; lineChatId: string; lineUserId: string; transcript: string; language?: string; durationSeconds?: number; proposalJson?: string }) {
  const db = await requireDb();
  const result = await db.insert(voiceTranscriptions).values({ ...input, language: input.language ?? null, durationSeconds: input.durationSeconds === undefined ? null : String(input.durationSeconds), proposalJson: input.proposalJson ?? null });
  const id = Number(result[0].insertId);
  await writeAuditLog({ action: "voice.transcribe", entityType: "voice_transcription", entityId: id, actorLineUserId: input.lineUserId, lineChatId: input.lineChatId, details: { vaultItemId: input.vaultItemId, language: input.language ?? null } });
  return id;
}

export async function latestVoiceTranscription(lineUserId: string, lineChatId?: string) {
  const db = await requireDb();
  const scope = lineChatId ? and(eq(voiceTranscriptions.lineUserId, lineUserId), eq(voiceTranscriptions.lineChatId, lineChatId)) : eq(voiceTranscriptions.lineUserId, lineUserId);
  return (await db.select().from(voiceTranscriptions).where(scope).orderBy(desc(voiceTranscriptions.createdAt)).limit(1))[0];
}

export async function latestProposedVoiceTranscription(lineUserId: string, lineChatId?: string) {
  const db = await requireDb();
  const chatScope = lineChatId ? eq(voiceTranscriptions.lineChatId, lineChatId) : undefined;
  return (await db.select().from(voiceTranscriptions).where(and(eq(voiceTranscriptions.lineUserId, lineUserId), eq(voiceTranscriptions.status, "proposed"), chatScope)).orderBy(desc(voiceTranscriptions.createdAt)).limit(1))[0];
}

export async function updateVoiceTranscript(input: { id: number; lineUserId: string; transcript: string; proposalJson: string }) {
  const db = await requireDb();
  const current = (await db.select().from(voiceTranscriptions).where(and(eq(voiceTranscriptions.id, input.id), eq(voiceTranscriptions.lineUserId, input.lineUserId), eq(voiceTranscriptions.status, "proposed"))).limit(1))[0];
  if (!current) return false;
  await db.update(voiceTranscriptions).set({ transcript: input.transcript, proposalJson: input.proposalJson }).where(eq(voiceTranscriptions.id, input.id));
  await writeAuditLog({ action: "voice.transcript.update", entityType: "voice_transcription", entityId: input.id, actorLineUserId: input.lineUserId, lineChatId: current.lineChatId, details: { changed: true } });
  return true;
}

export async function updateVoiceTranscriptionStatus(id: number, status: "accepted" | "rejected" | "failed") {
  const db = await requireDb();
  await db.update(voiceTranscriptions).set({ status }).where(eq(voiceTranscriptions.id, id));
}

export async function listAuditLogs(limit = 100) {
  const db = await requireDb();
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(Math.min(Math.max(limit, 1), 250));
}

export async function listDashboardUsers() {
  const db = await requireDb();
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt }).from(users).orderBy(desc(users.lastSignedIn)).limit(250);
}

export async function updateDashboardUserRole(id: number, role: "viewer" | "user" | "manager" | "admin", actorDashboardUserId: number) {
  const db = await requireDb();
  await db.update(users).set({ role }).where(eq(users.id, id));
  await writeAuditLog({ action: "user.role.update", entityType: "user", entityId: id, dashboardUserId: actorDashboardUserId, details: { role } });
}

export async function financeSummary(lineUserId: string, financeAccountId?: number) {
  const now = new Date();
  const rows = await listTransactions(lineUserId, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1), false, financeAccountId);
  const income = rows.filter(row => row.transactionType === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = rows.filter(row => row.transactionType === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const categories = rows.filter(row => row.transactionType === "expense").reduce<Record<string, number>>((all, row) => ({ ...all, [row.category]: (all[row.category] ?? 0) + Number(row.amount) }), {});
  const balanceSnapshot = await getBalanceSnapshot(lineUserId, financeAccountId);
  return { income, expense, balance: income - expense, openingBalance: balanceSnapshot.openingBalance, availableBalance: balanceSnapshot.availableBalance, categories };
}

export async function getOpeningBalance(lineUserId: string, financeAccountId?: number) {
  const db = await requireDb();
  return (await db.select().from(financeOpeningBalances).where(financeAccountId === undefined ? eq(financeOpeningBalances.lineUserId, lineUserId) : eq(financeOpeningBalances.financeAccountId, financeAccountId)).limit(1))[0];
}

export async function upsertOpeningBalance(lineUserId: string, amount: number, effectiveAt = new Date(), financeAccountId?: number) {
  const db = await requireDb();
  await db.insert(financeOpeningBalances).values({ lineUserId, financeAccountId, amount: String(amount), effectiveAt }).onDuplicateKeyUpdate({ set: { amount: String(amount), effectiveAt } });
}

export function calculateAvailableBalance(openingBalance: number, rows: Array<{ transactionType: "income" | "expense"; amount: string | number }>) {
  const numericAmount = (amount: string | number) => Number(String(amount).replace(/,/g, ""));
  const income = rows.filter(row => row.transactionType === "income").reduce((sum, row) => sum + numericAmount(row.amount), 0);
  const expense = rows.filter(row => row.transactionType === "expense").reduce((sum, row) => sum + numericAmount(row.amount), 0);
  return { openingBalance, income, expense, availableBalance: openingBalance + income - expense };
}

export async function getBalanceSnapshot(lineUserId: string, financeAccountId?: number) {
  const db = await requireDb();
  const opening = await getOpeningBalance(lineUserId, financeAccountId);
  const conditions = [financeAccountId === undefined ? eq(transactions.lineUserId, lineUserId) : eq(transactions.financeAccountId, financeAccountId), eq(transactions.status, "active")];
  if (opening) conditions.push(gte(transactions.occurredAt, opening.effectiveAt));
  const rows = await db.select({ transactionType: transactions.transactionType, amount: transactions.amount }).from(transactions).where(and(...conditions));
  const openingBalance = Number(opening?.amount ?? 0);
  return { ...calculateAvailableBalance(openingBalance, rows), effectiveAt: opening?.effectiveAt ?? null };
}

export function nextRecurringRunAt(runAt: Date, recurrenceType: "day" | "week" | "month", recurrenceInterval = 1) {
  const next = new Date(runAt);
  if (recurrenceType === "day") next.setUTCDate(next.getUTCDate() + recurrenceInterval);
  if (recurrenceType === "week") next.setUTCDate(next.getUTCDate() + recurrenceInterval * 7);
  if (recurrenceType === "month") next.setUTCMonth(next.getUTCMonth() + recurrenceInterval);
  return next;
}

export async function createRecurringTransaction(input: { lineUserId: string; lineChatId: string; financeAccountId?: number; transactionType: "income" | "expense"; amount: number; category: string; note?: string; recurrenceType: "day" | "week" | "month"; recurrenceInterval?: number; recurrenceWeekday?: number; recurrenceDayOfMonth?: number; nextRunAt: Date }) {
  const db = await requireDb();
  const result = await db.insert(recurringTransactions).values({ ...input, amount: String(input.amount), note: input.note ?? null, recurrenceInterval: input.recurrenceInterval ?? 1, recurrenceWeekday: input.recurrenceWeekday ?? null, recurrenceDayOfMonth: input.recurrenceDayOfMonth ?? null });
  return Number(result[0].insertId);
}

export async function listRecurringTransactions(lineUserId: string, financeAccountId?: number) {
  const db = await requireDb();
  return db.select().from(recurringTransactions).where(financeAccountId === undefined ? eq(recurringTransactions.lineUserId, lineUserId) : eq(recurringTransactions.financeAccountId, financeAccountId)).orderBy(recurringTransactions.nextRunAt);
}

export async function updateRecurringTransactionStatus(id: number, lineUserId: string, status: "active" | "paused" | "cancelled", financeAccountId?: number) {
  const db = await requireDb();
  const scope = financeAccountId === undefined ? eq(recurringTransactions.lineUserId, lineUserId) : eq(recurringTransactions.financeAccountId, financeAccountId);
  const result = await db.update(recurringTransactions).set({ status }).where(and(eq(recurringTransactions.id, id), scope));
  return result[0].affectedRows > 0;
}

export async function listDueRecurringTransactions(now = new Date()) {
  const db = await requireDb();
  return db.select().from(recurringTransactions).where(and(eq(recurringTransactions.status, "active"), lte(recurringTransactions.nextRunAt, now))).orderBy(recurringTransactions.nextRunAt).limit(100);
}

export async function claimRecurringTransactionRun(input: { recurringTransactionId: number; periodKey: string }) {
  const db = await requireDb();
  try {
    const result = await db.insert(recurringTransactionRuns).values({ ...input, status: "creating" });
    return Number(result[0].insertId);
  } catch {
    const existing = (await db.select().from(recurringTransactionRuns).where(and(eq(recurringTransactionRuns.recurringTransactionId, input.recurringTransactionId), eq(recurringTransactionRuns.periodKey, input.periodKey))).limit(1))[0];
    if (!existing || existing.status !== "failed") return undefined;
    const result = await db.update(recurringTransactionRuns).set({ status: "creating", transactionId: null, errorMessage: null, finishedAt: null }).where(and(eq(recurringTransactionRuns.id, existing.id), eq(recurringTransactionRuns.status, "failed")));
    return result[0].affectedRows > 0 ? existing.id : undefined;
  }
}

export async function completeRecurringTransactionRun(input: { runId: number; recurringTransactionId: number; transactionId: number; nextRunAt: Date }) {
  const db = await requireDb();
  await db.update(recurringTransactionRuns).set({ status: "created", transactionId: input.transactionId, finishedAt: new Date() }).where(eq(recurringTransactionRuns.id, input.runId));
  await db.update(recurringTransactions).set({ nextRunAt: input.nextRunAt, lastCreatedAt: new Date() }).where(eq(recurringTransactions.id, input.recurringTransactionId));
}

export async function failRecurringTransactionRun(runId: number, errorMessage: string) {
  const db = await requireDb();
  await db.update(recurringTransactionRuns).set({ status: "failed", errorMessage: errorMessage.slice(0, 1000), finishedAt: new Date() }).where(eq(recurringTransactionRuns.id, runId));
}

export async function financeReport(lineUserId: string, period: FinancePeriod, reference = new Date(), financeAccountId?: number) {
  const { start, end } = financeReportWindow(period, reference);
  const rows = await listTransactions(lineUserId, start, new Date(end.getTime() - 1), false, financeAccountId);
  return { ...buildFinanceReport(rows, period, reference), rows };
}

export async function financeBudgetCycleReport(lineUserId: string, reference = new Date(), financeAccountId?: number) {
  const startDay = financeAccountId === undefined ? 1 : await getFinanceAccountBudgetCycleStartDay(financeAccountId);
  const cycle = budgetCycleWindow(reference, startDay);
  const rows = await listTransactions(lineUserId, cycle.start, new Date(cycle.end.getTime() - 1), false, financeAccountId);
  return { period: "budget-cycle" as const, ...cycle, ...summarizeFinanceRows(rows), rows };
}

export async function financeReportRange(lineUserId: string, start: Date, end: Date, financeAccountId?: number) {
  if (end < start) throw new Error("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น");
  const rows = await listTransactions(lineUserId, start, end, false, financeAccountId);
  return { period: "custom" as const, start, end, ...summarizeFinanceRows(rows), rows };
}

export async function financeAnalytics(lineUserId: string, financeAccountId?: number) {
  const rows = await listTransactions(lineUserId, new Date(Date.now() - 6 * 86_400_000), undefined, false, financeAccountId);
  return buildFinanceAnalytics(rows);
}

export async function upsertBudget(lineUserId: string, category: string, amount: number, monthKey: string, financeAccountId?: number) {
  const db = await requireDb();
  await db.insert(budgets).values({ lineUserId, financeAccountId, category, amount: String(amount), monthKey }).onDuplicateKeyUpdate({ set: { amount: String(amount) } });
}

export async function listBudgets(lineUserId: string, monthKey?: string, financeAccountId?: number) {
  const db = await requireDb();
  const currentMonth = monthKey ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const scope = financeAccountId === undefined ? eq(budgets.lineUserId, lineUserId) : eq(budgets.financeAccountId, financeAccountId);
  return db.select().from(budgets).where(and(scope, eq(budgets.monthKey, currentMonth))).orderBy(budgets.category);
}

export async function addExpenseCategory(lineUserId: string, name: string, transactionType: "income" | "expense" = "expense", financeAccountId?: number) {
  const db = await requireDb();
  await db.insert(expenseCategories).values({ lineUserId, financeAccountId, name, transactionType }).onDuplicateKeyUpdate({ set: { name } });
}

export async function removeExpenseCategory(lineUserId: string, name: string, transactionType: "income" | "expense" = "expense", financeAccountId?: number) {
  const db = await requireDb();
  const scope = financeAccountId === undefined ? eq(expenseCategories.lineUserId, lineUserId) : eq(expenseCategories.financeAccountId, financeAccountId);
  const result = await db.delete(expenseCategories).where(and(scope, eq(expenseCategories.transactionType, transactionType), eq(expenseCategories.name, name)));
  return result[0].affectedRows > 0;
}

export async function listExpenseCategories(lineUserId: string, transactionType: "income" | "expense" = "expense", financeAccountId?: number) {
  const db = await requireDb();
  const scope = financeAccountId === undefined ? eq(expenseCategories.lineUserId, lineUserId) : eq(expenseCategories.financeAccountId, financeAccountId);
  return db.select().from(expenseCategories).where(and(scope, eq(expenseCategories.transactionType, transactionType))).orderBy(expenseCategories.name);
}

export async function listTransactionCategories(lineUserId: string, financeAccountId?: number) {
  const db = await requireDb();
  return db.select().from(expenseCategories).where(financeAccountId === undefined ? eq(expenseCategories.lineUserId, lineUserId) : eq(expenseCategories.financeAccountId, financeAccountId)).orderBy(expenseCategories.transactionType, expenseCategories.name);
}

export async function getLinkedLineUser(dashboardUserId: number) {
  const db = await requireDb();
  return (await db.select().from(lineAccountLinks).where(eq(lineAccountLinks.dashboardUserId, dashboardUserId)).limit(1))[0]?.lineUserId;
}

export async function getOwnerLinkedLineUser() {
  const db = await requireDb();
  const owner = (await db.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1))[0];
  return owner ? getLinkedLineUser(owner.id) : undefined;
}

export async function linkLineUser(dashboardUserId: number, lineUserId: string) {
  const db = await requireDb();
  await db.insert(lineAccountLinks).values({ dashboardUserId, lineUserId }).onDuplicateKeyUpdate({ set: { lineUserId } });
}

export async function saveImageExtraction(vaultItemId: number, purpose: "reminder" | "expense" | "file", extractedJson: string, confidence?: number) {
  const db = await requireDb();
  return db.insert(imageExtractions).values({ vaultItemId, purpose, model: "gemini-3-flash-preview", extractedJson, confidence: confidence === undefined ? null : String(confidence) });
}

export async function latestImageExtraction(lineUserId: string, lineChatId?: string) {
  const db = await requireDb();
  const scope = lineChatId ? and(eq(vaultItems.createdByLineUserId, lineUserId), eq(vaultItems.lineChatId, lineChatId)) : eq(vaultItems.createdByLineUserId, lineUserId);
  return (await db.select({ extraction: imageExtractions, vault: vaultItems })
    .from(imageExtractions)
    .innerJoin(vaultItems, eq(imageExtractions.vaultItemId, vaultItems.id))
    .where(scope)
    .orderBy(desc(imageExtractions.createdAt))
    .limit(1))[0];
}

export async function setImageExtractionStatus(id: number, status: "accepted" | "rejected" | "failed") {
  const db = await requireDb();
  await db.update(imageExtractions).set({ status }).where(eq(imageExtractions.id, id));
}

export async function getAutomationSetting(settingKey: string) {
  const db = await requireDb();
  return (await db.select().from(automationSettings).where(eq(automationSettings.settingKey, settingKey)).limit(1))[0];
}

export async function getAutomationSettingByTaskUid(taskUid: string) {
  const db = await requireDb();
  return (await db.select().from(automationSettings).where(eq(automationSettings.scheduleCronTaskUid, taskUid)).limit(1))[0];
}

export async function saveAutomationSetting(input: { settingKey: string; scheduleCronTaskUid?: string | null; isEnabled?: boolean; lastRunAt?: Date }) {
  const db = await requireDb();
  await db.insert(automationSettings).values({ settingKey: input.settingKey, scheduleCronTaskUid: input.scheduleCronTaskUid ?? null, isEnabled: input.isEnabled ?? true, lastRunAt: input.lastRunAt ?? null }).onDuplicateKeyUpdate({ set: { scheduleCronTaskUid: input.scheduleCronTaskUid ?? null, isEnabled: input.isEnabled ?? true, lastRunAt: input.lastRunAt ?? null } });
}

export async function claimFinanceDigestDelivery(input: { settingKey: string; taskUid: string; targetLineUserId: string; digestType: "daily" | "weekly"; periodKey: string }) {
  const db = await requireDb();
  try {
    const result = await db.insert(financeDigestDeliveries).values({ ...input, status: "sending" });
    return Number(result[0].insertId);
  } catch {
    const current = (await db.select().from(financeDigestDeliveries).where(and(eq(financeDigestDeliveries.settingKey, input.settingKey), eq(financeDigestDeliveries.periodKey, input.periodKey))).limit(1))[0];
    if (!current || current.status !== "failed") return undefined;
    const result = await db.update(financeDigestDeliveries).set({ status: "sending", errorMessage: null, finishedAt: null, taskUid: input.taskUid, targetLineUserId: input.targetLineUserId }).where(and(eq(financeDigestDeliveries.id, current.id), eq(financeDigestDeliveries.status, "failed")));
    return result[0].affectedRows > 0 ? current.id : undefined;
  }
}

export async function finishFinanceDigestDelivery(id: number, status: "sent" | "failed", errorMessage?: string) {
  const db = await requireDb();
  await db.update(financeDigestDeliveries).set({ status, errorMessage: errorMessage ?? null, finishedAt: new Date() }).where(eq(financeDigestDeliveries.id, id));
}
