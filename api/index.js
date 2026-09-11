// server/api.ts
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/routers.ts
import { z as z2 } from "zod";
import { parse as parseCookie } from "cookie";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";

// server/db.ts
import { and, desc, eq, gte, inArray, like, lte, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { boolean, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["viewer", "user", "manager", "admin"]).default("user").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var lineChats = mysqlTable("line_chats", {
  id: int("id").autoincrement().primaryKey(),
  scope: mysqlEnum("scope", ["user", "group", "room"]).notNull(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull().unique(),
  displayName: varchar("displayName", { length: 255 }),
  pictureUrl: text("pictureUrl"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [index("line_chats_scope_idx").on(table.scope)]);
var lineMembers = mysqlTable("line_members", {
  id: int("id").autoincrement().primaryKey(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  pictureUrl: text("pictureUrl"),
  isBot: boolean("isBot").default(false).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [unique("line_members_chat_user_unique").on(table.lineChatId, table.lineUserId), index("line_members_user_idx").on(table.lineUserId)]);
var lineAccountLinks = mysqlTable("line_account_links", {
  id: int("id").autoincrement().primaryKey(),
  dashboardUserId: int("dashboardUserId").notNull().unique(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull().unique(),
  linkedAt: timestamp("linkedAt").defaultNow().notNull()
});
var financeAccounts = mysqlTable("finance_accounts", {
  id: int("id").autoincrement().primaryKey(),
  accountType: mysqlEnum("accountType", ["personal", "group"]).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  ownerLineUserId: varchar("ownerLineUserId", { length: 128 }).notNull(),
  lineChatId: varchar("lineChatId", { length: 128 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  unique("finance_accounts_group_chat_unique").on(table.lineChatId),
  index("finance_accounts_owner_idx").on(table.ownerLineUserId, table.isActive)
]);
var financeAccountMembers = mysqlTable("finance_account_members", {
  id: int("id").autoincrement().primaryKey(),
  financeAccountId: int("financeAccountId").notNull(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  role: mysqlEnum("role", ["owner", "manager", "contributor", "viewer"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  unique("finance_account_members_unique").on(table.financeAccountId, table.lineUserId),
  index("finance_account_members_user_idx").on(table.lineUserId, table.financeAccountId)
]);
var webhookEvents = mysqlTable("webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  webhookEventId: varchar("webhookEventId", { length: 128 }).notNull().unique(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  lineChatId: varchar("lineChatId", { length: 128 }),
  occurredAt: timestamp("occurredAt").notNull(),
  rawPayload: text("rawPayload").notNull(),
  status: mysqlEnum("status", ["received", "processed", "ignored", "failed"]).default("received").notNull(),
  errorMessage: text("errorMessage"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [index("webhook_events_status_idx").on(table.status, table.createdAt)]);
var reminders = mysqlTable("reminders", {
  id: int("id").autoincrement().primaryKey(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  createdByLineUserId: varchar("createdByLineUserId", { length: 128 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  detail: text("detail"),
  status: mysqlEnum("status", ["active", "paused", "completed", "cancelled"]).default("active").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Bangkok").notNull(),
  recurrenceType: mysqlEnum("recurrenceType", ["once", "minute", "day", "week", "month"]).default("once").notNull(),
  recurrenceInterval: int("recurrenceInterval").default(1).notNull(),
  recurrenceWeekdays: varchar("recurrenceWeekdays", { length: 32 }),
  recurrenceDayOfMonth: int("recurrenceDayOfMonth"),
  dueAt: timestamp("dueAt"),
  nextRunAt: timestamp("nextRunAt"),
  lastDeliveredAt: timestamp("lastDeliveredAt"),
  lastDeliveryResult: mysqlEnum("lastDeliveryResult", ["pending", "sent", "failed"]).default("pending").notNull(),
  sourceMessageId: varchar("sourceMessageId", { length: 128 }),
  sourceImageKey: varchar("sourceImageKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [index("reminders_due_idx").on(table.status, table.nextRunAt), index("reminders_user_idx").on(table.createdByLineUserId)]);
var reminderDeliveryAttempts = mysqlTable("reminder_delivery_attempts", {
  id: int("id").autoincrement().primaryKey(),
  reminderId: int("reminderId").notNull(),
  runner: mysqlEnum("runner", ["heartbeat", "manual"]).notNull(),
  taskUid: varchar("taskUid", { length: 65 }),
  status: mysqlEnum("status", ["sending", "sent", "failed"]).default("sending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt")
}, (table) => [index("reminder_delivery_attempts_reminder_idx").on(table.reminderId, table.createdAt), index("reminder_delivery_attempts_status_idx").on(table.status, table.createdAt)]);
var vaultItems = mysqlTable("vault_items", {
  id: int("id").autoincrement().primaryKey(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  createdByLineUserId: varchar("createdByLineUserId", { length: 128 }).notNull(),
  itemType: mysqlEnum("itemType", ["text", "link", "image", "file"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  searchableText: text("searchableText"),
  tagsText: varchar("tagsText", { length: 512 }),
  originalFilename: varchar("originalFilename", { length: 255 }),
  mimeType: varchar("mimeType", { length: 128 }),
  sourceUrl: text("sourceUrl"),
  storageKey: varchar("storageKey", { length: 512 }),
  storageUrl: text("storageUrl"),
  lineMessageId: varchar("lineMessageId", { length: 128 }).unique(),
  status: mysqlEnum("status", ["active", "deleted"]).default("active").notNull(),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [index("vault_items_user_idx").on(table.createdByLineUserId, table.createdAt), index("vault_items_chat_idx").on(table.lineChatId, table.itemType)]);
var notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  createdByLineUserId: varchar("createdByLineUserId", { length: 128 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [index("notes_user_idx").on(table.createdByLineUserId, table.updatedAt)]);
var todoItems = mysqlTable("todo_items", {
  id: int("id").autoincrement().primaryKey(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  createdByLineUserId: varchar("createdByLineUserId", { length: 128 }).notNull(),
  assigneeLineUserId: varchar("assigneeLineUserId", { length: 128 }),
  title: varchar("title", { length: 255 }).notNull(),
  detail: text("detail"),
  status: mysqlEnum("status", ["todo", "done", "cancelled"]).default("todo").notNull(),
  dueAt: timestamp("dueAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [index("todo_items_user_idx").on(table.createdByLineUserId, table.status)]);
var transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  financeAccountId: int("financeAccountId"),
  transactionType: mysqlEnum("transactionType", ["income", "expense"]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  note: text("note"),
  status: mysqlEnum("status", ["active", "deleted"]).default("active").notNull(),
  source: varchar("source", { length: 32 }).default("line_text").notNull(),
  sourceMessageId: varchar("sourceMessageId", { length: 128 }),
  occurredAt: timestamp("occurredAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt")
}, (table) => [index("transactions_user_idx").on(table.lineUserId, table.status, table.occurredAt), index("transactions_account_idx").on(table.financeAccountId, table.status, table.occurredAt), index("transactions_source_message_idx").on(table.sourceMessageId)]);
var transactionAttachments = mysqlTable("transaction_attachments", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull(),
  vaultItemId: int("vaultItemId").notNull(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  label: varchar("label", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [unique("transaction_attachments_unique").on(table.transactionId, table.vaultItemId), index("transaction_attachments_user_idx").on(table.lineUserId, table.transactionId)]);
var voiceTranscriptions = mysqlTable("voice_transcriptions", {
  id: int("id").autoincrement().primaryKey(),
  vaultItemId: int("vaultItemId").notNull().unique(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  transcript: text("transcript").notNull(),
  language: varchar("language", { length: 16 }),
  durationSeconds: decimal("durationSeconds", { precision: 10, scale: 2 }),
  proposalJson: text("proposalJson"),
  status: mysqlEnum("status", ["proposed", "accepted", "rejected", "failed"]).default("proposed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [index("voice_transcriptions_user_idx").on(table.lineUserId, table.createdAt)]);
var auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: int("entityId"),
  dashboardUserId: int("dashboardUserId"),
  actorLineUserId: varchar("actorLineUserId", { length: 128 }),
  lineChatId: varchar("lineChatId", { length: 128 }),
  detailsJson: text("detailsJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt), index("audit_logs_actor_idx").on(table.actorLineUserId, table.createdAt)]);
var budgets = mysqlTable("budgets", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  financeAccountId: int("financeAccountId"),
  category: varchar("category", { length: 100 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  alertAtPercent: int("alertAtPercent").default(80).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [unique("budgets_account_period_unique").on(table.financeAccountId, table.category, table.monthKey), index("budgets_account_month_idx").on(table.financeAccountId, table.monthKey)]);
var imageExtractions = mysqlTable("image_extractions", {
  id: int("id").autoincrement().primaryKey(),
  vaultItemId: int("vaultItemId").notNull(),
  purpose: mysqlEnum("purpose", ["reminder", "expense", "file"]).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  extractedJson: text("extractedJson").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["proposed", "accepted", "rejected", "failed"]).default("proposed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var automationSettings = mysqlTable("automation_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 100 }).notNull().unique(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var financeDigestDeliveries = mysqlTable("finance_digest_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 100 }).notNull(),
  taskUid: varchar("taskUid", { length: 65 }).notNull(),
  targetLineUserId: varchar("targetLineUserId", { length: 128 }).notNull(),
  digestType: mysqlEnum("digestType", ["daily", "weekly"]).notNull(),
  periodKey: varchar("periodKey", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["sending", "sent", "failed"]).default("sending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt")
}, (table) => [
  unique("finance_digest_delivery_period_unique").on(table.settingKey, table.periodKey),
  index("finance_digest_delivery_task_idx").on(table.taskUid, table.createdAt)
]);
var financeOpeningBalances = mysqlTable("finance_opening_balances", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  financeAccountId: int("financeAccountId"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  effectiveAt: timestamp("effectiveAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [unique("finance_opening_balances_account_unique").on(table.financeAccountId)]);
var recurringTransactions = mysqlTable("recurring_transactions", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  financeAccountId: int("financeAccountId"),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  transactionType: mysqlEnum("transactionType", ["income", "expense"]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  note: text("note"),
  recurrenceType: mysqlEnum("recurrenceType", ["day", "week", "month"]).notNull(),
  recurrenceInterval: int("recurrenceInterval").default(1).notNull(),
  recurrenceWeekday: int("recurrenceWeekday"),
  recurrenceDayOfMonth: int("recurrenceDayOfMonth"),
  nextRunAt: timestamp("nextRunAt").notNull(),
  lastCreatedAt: timestamp("lastCreatedAt"),
  status: mysqlEnum("status", ["active", "paused", "cancelled"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [index("recurring_transactions_due_idx").on(table.status, table.nextRunAt), index("recurring_transactions_user_idx").on(table.lineUserId, table.status), index("recurring_transactions_account_idx").on(table.financeAccountId, table.status)]);
var recurringTransactionRuns = mysqlTable("recurring_transaction_runs", {
  id: int("id").autoincrement().primaryKey(),
  recurringTransactionId: int("recurringTransactionId").notNull(),
  periodKey: varchar("periodKey", { length: 48 }).notNull(),
  status: mysqlEnum("status", ["creating", "created", "failed"]).default("creating").notNull(),
  transactionId: int("transactionId"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt")
}, (table) => [unique("recurring_transaction_run_unique").on(table.recurringTransactionId, table.periodKey), index("recurring_transaction_runs_status_idx").on(table.status, table.createdAt)]);
var expenseCategories = mysqlTable("expense_categories", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  financeAccountId: int("financeAccountId"),
  transactionType: mysqlEnum("transactionType", ["income", "expense"]).default("expense").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [unique("expense_categories_account_type_name_unique").on(table.financeAccountId, table.transactionType, table.name), index("expense_categories_account_idx").on(table.financeAccountId, table.transactionType)]);

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/milo/financeAnalytics.ts
var thaiDateKey = (value) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
function buildFinanceAnalytics(rows, now = /* @__PURE__ */ new Date()) {
  const todayKey = thaiDateKey(now);
  const todayAtNoon = /* @__PURE__ */ new Date(`${todayKey}T12:00:00.000Z`);
  const days = Array.from({ length: 7 }, (_, index2) => {
    const date = new Date(todayAtNoon);
    date.setUTCDate(todayAtNoon.getUTCDate() - (6 - index2));
    return { dateKey: thaiDateKey(date), income: 0, expense: 0 };
  });
  const dayMap = new Map(days.map((day) => [day.dateKey, day]));
  for (const row of rows) {
    const day = dayMap.get(thaiDateKey(row.occurredAt));
    if (!day) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    if (row.transactionType === "income") day.income += amount;
    else day.expense += amount;
  }
  return {
    daily: days,
    transactionCount: rows.length,
    sevenDayIncome: days.reduce((sum, day) => sum + day.income, 0),
    sevenDayExpense: days.reduce((sum, day) => sum + day.expense, 0)
  };
}

// server/milo/financeReport.ts
function bangkokCalendarParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((item) => item.type !== "literal").map((item) => [item.type, item.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}
function atBangkokMidnight(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0));
}
function financeReportWindow(period, reference = /* @__PURE__ */ new Date()) {
  const calendar = bangkokCalendarParts(reference);
  if (period === "day") {
    const start = atBangkokMidnight(calendar.year, calendar.month, calendar.day);
    return { start, end: new Date(start.getTime() + 864e5) };
  }
  if (period === "week") {
    const weekday = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day)).getUTCDay() || 7;
    const start = atBangkokMidnight(calendar.year, calendar.month, calendar.day - (weekday - 1));
    return { start, end: new Date(start.getTime() + 7 * 864e5) };
  }
  if (period === "month") return { start: atBangkokMidnight(calendar.year, calendar.month, 1), end: atBangkokMidnight(calendar.year, calendar.month + 1, 1) };
  return { start: atBangkokMidnight(calendar.year, 1, 1), end: atBangkokMidnight(calendar.year + 1, 1, 1) };
}
function summarizeFinanceRows(rows) {
  const income = rows.filter((row) => row.transactionType === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = rows.filter((row) => row.transactionType === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const categories = rows.filter((row) => row.transactionType === "expense").reduce((all, row) => ({ ...all, [row.category]: (all[row.category] ?? 0) + Number(row.amount) }), {});
  return { income, expense, balance: income - expense, transactionCount: rows.length, categories };
}
function buildFinanceReport(rows, period, reference = /* @__PURE__ */ new Date()) {
  const { start, end } = financeReportWindow(period, reference);
  return { period, start, end, ...summarizeFinanceRows(rows) };
}

// server/db.ts
import mysql from "mysql2/promise";
var database = null;
async function getDb() {
  if (!database && process.env.DATABASE_URL) {
    try {
      const pool2 = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: {
          minVersion: "TLSv1.2",
          rejectUnauthorized: true
        }
      });
      database = drizzle(pool2);
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
function initialUserRole(user) {
  return user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
}
function userProfileUpdateValues(user) {
  return {
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: user.lastSignedIn ?? /* @__PURE__ */ new Date()
  };
}
async function upsertUser(user) {
  const db = await requireDb();
  const role = initialUserRole(user);
  const profile = userProfileUpdateValues(user);
  await db.insert(users).values({
    openId: user.openId,
    name: profile.name,
    email: profile.email,
    loginMethod: profile.loginMethod,
    role,
    lastSignedIn: profile.lastSignedIn
  }).onDuplicateKeyUpdate({ set: profile });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}
async function upsertLineChat(lineChatId, scope, displayName) {
  const db = await requireDb();
  await db.insert(lineChats).values({ lineChatId, scope, displayName: displayName ?? null, isActive: true }).onDuplicateKeyUpdate({ set: { scope, displayName: displayName ?? null, isActive: true } });
}
async function upsertLineMember(lineChatId, lineUserId, displayName) {
  const db = await requireDb();
  await db.insert(lineMembers).values({ lineChatId, lineUserId, displayName: displayName ?? null }).onDuplicateKeyUpdate({ set: { displayName: displayName ?? null } });
}
async function findLineMemberByName(lineChatId, displayName) {
  const db = await requireDb();
  return (await db.select().from(lineMembers).where(and(eq(lineMembers.lineChatId, lineChatId), like(lineMembers.displayName, `%${displayName.trim()}%`))).limit(1))[0];
}
async function listLineGroups(lineUserId) {
  const db = await requireDb();
  return db.select({ chat: lineChats }).from(lineMembers).innerJoin(lineChats, eq(lineMembers.lineChatId, lineChats.lineChatId)).where(and(eq(lineMembers.lineUserId, lineUserId), eq(lineChats.scope, "group")));
}
var financeAccountPermissions = {
  owner: { read: true, createTransaction: true, manageTransactions: true, manageSettings: true, manageMembers: true },
  manager: { read: true, createTransaction: true, manageTransactions: true, manageSettings: true, manageMembers: false },
  contributor: { read: true, createTransaction: true, manageTransactions: false, manageSettings: false, manageMembers: false },
  viewer: { read: true, createTransaction: false, manageTransactions: false, manageSettings: false, manageMembers: false }
};
function canManageFinanceAccountMembers(role) {
  return financeAccountPermissions[role].manageMembers;
}
function canCreateFinanceTransaction(role) {
  return financeAccountPermissions[role].createTransaction;
}
function canManageFinanceTransactions(role) {
  return financeAccountPermissions[role].manageTransactions;
}
function canManageFinanceSettings(role) {
  return financeAccountPermissions[role].manageSettings;
}
async function getOrCreatePersonalFinanceAccount(lineUserId) {
  const db = await requireDb();
  const existing = (await db.select().from(financeAccounts).where(and(eq(financeAccounts.accountType, "personal"), eq(financeAccounts.ownerLineUserId, lineUserId))).limit(1))[0];
  if (existing) {
    await db.insert(financeAccountMembers).values({ financeAccountId: existing.id, lineUserId, role: "owner" }).onDuplicateKeyUpdate({ set: { role: "owner" } });
    return existing;
  }
  try {
    const result = await db.insert(financeAccounts).values({ accountType: "personal", name: "\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27", ownerLineUserId: lineUserId, lineChatId: lineUserId });
    const id = Number(result[0].insertId);
    await db.insert(financeAccountMembers).values({ financeAccountId: id, lineUserId, role: "owner" });
    return (await db.select().from(financeAccounts).where(eq(financeAccounts.id, id)).limit(1))[0];
  } catch {
    const created = (await db.select().from(financeAccounts).where(and(eq(financeAccounts.accountType, "personal"), eq(financeAccounts.ownerLineUserId, lineUserId))).limit(1))[0];
    if (!created) throw new Error("\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27\u0E44\u0E14\u0E49");
    await db.insert(financeAccountMembers).values({ financeAccountId: created.id, lineUserId, role: "owner" }).onDuplicateKeyUpdate({ set: { role: "owner" } });
    return created;
  }
}
async function listFinanceAccounts(lineUserId) {
  const db = await requireDb();
  return db.select({ account: financeAccounts, membership: financeAccountMembers }).from(financeAccountMembers).innerJoin(financeAccounts, eq(financeAccountMembers.financeAccountId, financeAccounts.id)).where(and(eq(financeAccountMembers.lineUserId, lineUserId), eq(financeAccounts.isActive, true))).orderBy(financeAccounts.accountType, financeAccounts.name);
}
async function getFinanceAccountAccess(financeAccountId, lineUserId) {
  const db = await requireDb();
  return (await db.select({ account: financeAccounts, membership: financeAccountMembers }).from(financeAccountMembers).innerJoin(financeAccounts, eq(financeAccountMembers.financeAccountId, financeAccounts.id)).where(and(eq(financeAccountMembers.financeAccountId, financeAccountId), eq(financeAccountMembers.lineUserId, lineUserId), eq(financeAccounts.isActive, true))).limit(1))[0];
}
async function resolveFinanceAccountForLineEvent(lineUserId, lineChatId, scope) {
  if (scope === "user") {
    const account = await getOrCreatePersonalFinanceAccount(lineUserId);
    return { account, membership: { role: "owner" } };
  }
  const db = await requireDb();
  return (await db.select({ account: financeAccounts, membership: financeAccountMembers }).from(financeAccounts).innerJoin(financeAccountMembers, eq(financeAccountMembers.financeAccountId, financeAccounts.id)).where(and(eq(financeAccounts.accountType, "group"), eq(financeAccounts.lineChatId, lineChatId), eq(financeAccounts.isActive, true), eq(financeAccountMembers.lineUserId, lineUserId))).limit(1))[0];
}
async function createGroupFinanceAccount(input) {
  const db = await requireDb();
  const group = (await db.select({ id: lineChats.id }).from(lineChats).innerJoin(lineMembers, eq(lineMembers.lineChatId, lineChats.lineChatId)).where(and(eq(lineChats.lineChatId, input.lineChatId), eq(lineChats.scope, "group"), eq(lineMembers.lineUserId, input.ownerLineUserId))).limit(1))[0];
  if (!group) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E43\u0E19\u0E01\u0E25\u0E38\u0E48\u0E21 LINE \u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E43\u0E2B\u0E49\u0E44\u0E21\u0E42\u0E25\u0E40\u0E2B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E08\u0E32\u0E01\u0E01\u0E25\u0E38\u0E48\u0E21\u0E01\u0E48\u0E2D\u0E19");
  const exists = (await db.select({ id: financeAccounts.id }).from(financeAccounts).where(eq(financeAccounts.lineChatId, input.lineChatId)).limit(1))[0];
  if (exists) throw new Error("\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49\u0E21\u0E35\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27");
  const result = await db.insert(financeAccounts).values({ accountType: "group", name: input.name.trim(), ownerLineUserId: input.ownerLineUserId, lineChatId: input.lineChatId });
  const id = Number(result[0].insertId);
  await db.insert(financeAccountMembers).values({ financeAccountId: id, lineUserId: input.ownerLineUserId, role: "owner" });
  await writeAuditLog({ action: "finance_account.create", entityType: "finance_account", entityId: id, actorLineUserId: input.ownerLineUserId, lineChatId: input.lineChatId, details: { accountType: "group" } });
  return id;
}
async function listFinanceAccountMembers(financeAccountId) {
  const db = await requireDb();
  return db.select().from(financeAccountMembers).where(eq(financeAccountMembers.financeAccountId, financeAccountId)).orderBy(financeAccountMembers.role, financeAccountMembers.lineUserId);
}
async function isEligibleGroupFinanceAccountMember(financeAccountId, lineUserId) {
  const db = await requireDb();
  const row = (await db.select({ id: financeAccounts.id }).from(financeAccounts).innerJoin(lineMembers, eq(lineMembers.lineChatId, financeAccounts.lineChatId)).where(and(eq(financeAccounts.id, financeAccountId), eq(financeAccounts.accountType, "group"), eq(lineMembers.lineUserId, lineUserId))).limit(1))[0];
  return Boolean(row);
}
async function upsertFinanceAccountMember(input) {
  const db = await requireDb();
  await db.insert(financeAccountMembers).values(input).onDuplicateKeyUpdate({ set: { role: input.role } });
}
async function removeFinanceAccountMember(financeAccountId, lineUserId) {
  const db = await requireDb();
  const result = await db.delete(financeAccountMembers).where(and(eq(financeAccountMembers.financeAccountId, financeAccountId), eq(financeAccountMembers.lineUserId, lineUserId), ne(financeAccountMembers.role, "owner")));
  return result[0].affectedRows > 0;
}
async function registerWebhookEvent(input) {
  const db = await requireDb();
  try {
    await db.insert(webhookEvents).values({ ...input, lineChatId: input.lineChatId ?? null });
    return true;
  } catch {
    return false;
  }
}
async function finishWebhookEvent(webhookEventId, status, errorMessage) {
  const db = await requireDb();
  await db.update(webhookEvents).set({ status, errorMessage: errorMessage ?? null, processedAt: /* @__PURE__ */ new Date() }).where(eq(webhookEvents.webhookEventId, webhookEventId));
}
async function createReminder(input) {
  const db = await requireDb();
  const result = await db.insert(reminders).values({
    ...input,
    detail: input.detail ?? null,
    recurrenceWeekdays: input.recurrenceWeekdays ?? null,
    recurrenceDayOfMonth: input.recurrenceDayOfMonth ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    sourceImageKey: input.sourceImageKey ?? null
  });
  return Number(result[0].insertId);
}
async function listReminders(lineUserId) {
  const db = await requireDb();
  return db.select().from(reminders).where(and(eq(reminders.createdByLineUserId, lineUserId), or(eq(reminders.status, "active"), eq(reminders.status, "paused")))).orderBy(reminders.nextRunAt);
}
async function deleteReminder(id, lineUserId) {
  const db = await requireDb();
  await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.createdByLineUserId, lineUserId)));
}
async function listDueReminders(now = /* @__PURE__ */ new Date()) {
  const db = await requireDb();
  return db.select().from(reminders).where(and(eq(reminders.status, "active"), lte(reminders.nextRunAt, now))).orderBy(reminders.nextRunAt).limit(50);
}
async function markReminderDelivered(reminder) {
  const db = await requireDb();
  const deliveredAt = /* @__PURE__ */ new Date();
  let nextRunAt = null;
  if (reminder.recurrenceType === "minute") nextRunAt = new Date(deliveredAt.getTime() + reminder.recurrenceInterval * 6e4);
  if (reminder.recurrenceType === "day") nextRunAt = new Date(deliveredAt.getTime() + reminder.recurrenceInterval * 864e5);
  if (reminder.recurrenceType === "week") nextRunAt = new Date(deliveredAt.getTime() + reminder.recurrenceInterval * 7 * 864e5);
  if (reminder.recurrenceType === "month") {
    nextRunAt = new Date(deliveredAt);
    nextRunAt.setMonth(nextRunAt.getMonth() + reminder.recurrenceInterval);
    nextRunAt.setDate(Math.min(reminder.recurrenceDayOfMonth ?? deliveredAt.getDate(), 28));
  }
  await db.update(reminders).set({
    status: nextRunAt ? "active" : "completed",
    nextRunAt,
    lastDeliveredAt: deliveredAt,
    lastDeliveryResult: "sent"
  }).where(eq(reminders.id, reminder.id));
}
async function markReminderFailed(id) {
  const db = await requireDb();
  await db.update(reminders).set({ lastDeliveryResult: "failed" }).where(eq(reminders.id, id));
}
async function createReminderDeliveryAttempt(input) {
  const db = await requireDb();
  const result = await db.insert(reminderDeliveryAttempts).values({ reminderId: input.reminderId, runner: input.runner, taskUid: input.taskUid ?? null });
  return Number(result[0].insertId);
}
async function finishReminderDeliveryAttempt(id, status, errorMessage) {
  const db = await requireDb();
  await db.update(reminderDeliveryAttempts).set({ status, errorMessage: errorMessage ?? null, finishedAt: /* @__PURE__ */ new Date() }).where(eq(reminderDeliveryAttempts.id, id));
}
async function createVaultItem(input) {
  const db = await requireDb();
  const result = await db.insert(vaultItems).values({
    ...input,
    searchableText: input.searchableText ?? null,
    tagsText: input.tagsText ?? null,
    originalFilename: input.originalFilename ?? null,
    mimeType: input.mimeType ?? null,
    sourceUrl: input.sourceUrl ?? null,
    storageKey: input.storageKey ?? null,
    storageUrl: input.storageUrl ?? null,
    lineMessageId: input.lineMessageId ?? null
  });
  return Number(result[0].insertId);
}
async function searchVault(lineUserId, term = "") {
  const db = await requireDb();
  const base = and(eq(vaultItems.createdByLineUserId, lineUserId), eq(vaultItems.status, "active"));
  const where = term.trim() ? and(base, or(like(vaultItems.title, `%${term}%`), like(vaultItems.searchableText, `%${term}%`), like(vaultItems.tagsText, `%${term}%`))) : base;
  return db.select().from(vaultItems).where(where).orderBy(desc(vaultItems.createdAt)).limit(100);
}
async function updateVaultMetadata(id, lineUserId, input) {
  const db = await requireDb();
  await db.update(vaultItems).set({ tagsText: input.tagsText ?? null, sourceUrl: input.sourceUrl ?? null }).where(and(eq(vaultItems.id, id), eq(vaultItems.createdByLineUserId, lineUserId)));
}
async function createNote(lineChatId, lineUserId, title, content) {
  const db = await requireDb();
  return db.insert(notes).values({ lineChatId, createdByLineUserId: lineUserId, title, content });
}
async function listNotes(lineUserId) {
  const db = await requireDb();
  return db.select().from(notes).where(and(eq(notes.createdByLineUserId, lineUserId), eq(notes.status, "active"))).orderBy(desc(notes.updatedAt)).limit(100);
}
async function createTodo(lineChatId, lineUserId, title, dueAt) {
  const db = await requireDb();
  return db.insert(todoItems).values({ lineChatId, createdByLineUserId: lineUserId, title, dueAt: dueAt ?? null });
}
async function listTodos(lineUserId) {
  const db = await requireDb();
  return db.select().from(todoItems).where(and(eq(todoItems.createdByLineUserId, lineUserId), eq(todoItems.status, "todo"))).orderBy(todoItems.dueAt).limit(100);
}
async function completeTodo(id, lineUserId) {
  const db = await requireDb();
  await db.update(todoItems).set({ status: "done", completedAt: /* @__PURE__ */ new Date() }).where(and(eq(todoItems.id, id), eq(todoItems.createdByLineUserId, lineUserId)));
}
async function writeAuditLog(input) {
  const db = await requireDb();
  await db.insert(auditLogs).values({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    dashboardUserId: input.dashboardUserId ?? null,
    actorLineUserId: input.actorLineUserId ?? null,
    lineChatId: input.lineChatId ?? null,
    detailsJson: input.details ? JSON.stringify(input.details) : null
  });
}
async function createTransaction(input) {
  const db = await requireDb();
  const result = await db.insert(transactions).values({ ...input, amount: String(input.amount), note: input.note ?? null, occurredAt: input.occurredAt ?? /* @__PURE__ */ new Date(), source: input.source ?? "line_text", sourceMessageId: input.sourceMessageId ?? null });
  const id = Number(result[0].insertId);
  await writeAuditLog({ action: "transaction.create", entityType: "transaction", entityId: id, actorLineUserId: input.lineUserId, lineChatId: input.lineChatId, details: { transactionType: input.transactionType, amount: input.amount, category: input.category, source: input.source ?? "line_text" } });
  return id;
}
async function linkTransactionAttachment(input) {
  const db = await requireDb();
  const [transaction] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.id, input.transactionId), eq(transactions.lineUserId, input.lineUserId))).limit(1);
  const [vault] = await db.select({ id: vaultItems.id }).from(vaultItems).where(and(eq(vaultItems.id, input.vaultItemId), eq(vaultItems.createdByLineUserId, input.lineUserId), eq(vaultItems.status, "active"))).limit(1);
  if (!transaction || !vault) return false;
  await db.insert(transactionAttachments).values({ ...input, label: input.label ?? null }).onDuplicateKeyUpdate({ set: { label: input.label ?? null } });
  await writeAuditLog({ action: "transaction.attachment.link", entityType: "transaction_attachment", entityId: input.transactionId, actorLineUserId: input.lineUserId, details: { vaultItemId: input.vaultItemId } });
  return true;
}
async function listTransactionAttachmentsForFinanceAccount(transactionIds, financeAccountId) {
  if (!transactionIds.length) return [];
  const db = await requireDb();
  return db.select({ transactionId: transactionAttachments.transactionId, id: transactionAttachments.id, label: transactionAttachments.label, createdAt: transactionAttachments.createdAt, vaultItemId: vaultItems.id, title: vaultItems.title, itemType: vaultItems.itemType, mimeType: vaultItems.mimeType, originalFilename: vaultItems.originalFilename, storageUrl: vaultItems.storageUrl, sourceUrl: vaultItems.sourceUrl }).from(transactionAttachments).innerJoin(transactions, eq(transactionAttachments.transactionId, transactions.id)).innerJoin(vaultItems, eq(transactionAttachments.vaultItemId, vaultItems.id)).where(and(inArray(transactionAttachments.transactionId, transactionIds), eq(transactions.financeAccountId, financeAccountId), eq(transactions.status, "active"), eq(vaultItems.status, "active"))).orderBy(desc(transactionAttachments.createdAt));
}
async function listTransactions(lineUserId, start, end, includeDeleted = false, financeAccountId) {
  const db = await requireDb();
  const conditions = [financeAccountId === void 0 ? eq(transactions.lineUserId, lineUserId) : eq(transactions.financeAccountId, financeAccountId)];
  if (!includeDeleted) conditions.push(eq(transactions.status, "active"));
  if (start) conditions.push(gte(transactions.occurredAt, start));
  if (end) conditions.push(lte(transactions.occurredAt, end));
  return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.occurredAt)).limit(250);
}
async function searchTransactions(lineUserId, query, limit = 10, financeAccountId) {
  const db = await requireDb();
  const term = query.trim();
  const filters = [financeAccountId === void 0 ? eq(transactions.lineUserId, lineUserId) : eq(transactions.financeAccountId, financeAccountId), eq(transactions.status, "active")];
  if (term) filters.push(or(like(transactions.category, `%${term}%`), like(transactions.note, `%${term}%`)));
  return db.select().from(transactions).where(and(...filters)).orderBy(desc(transactions.occurredAt)).limit(Math.min(Math.max(limit, 1), 50));
}
async function updateTransaction(input) {
  const db = await requireDb();
  const scope = input.financeAccountId === void 0 ? eq(transactions.lineUserId, input.lineUserId) : eq(transactions.financeAccountId, input.financeAccountId);
  const current = (await db.select().from(transactions).where(and(eq(transactions.id, input.id), scope, eq(transactions.status, "active"))).limit(1))[0];
  if (!current) return false;
  const values = { amount: input.amount === void 0 ? void 0 : String(input.amount), category: input.category, note: input.note, occurredAt: input.occurredAt, transactionType: input.transactionType };
  await db.update(transactions).set(values).where(eq(transactions.id, input.id));
  await writeAuditLog({ action: "transaction.update", entityType: "transaction", entityId: input.id, actorLineUserId: input.lineUserId, dashboardUserId: input.actorDashboardUserId, lineChatId: current.lineChatId, details: { before: { amount: current.amount, category: current.category, note: current.note, transactionType: current.transactionType, occurredAt: current.occurredAt }, after: { amount: input.amount, category: input.category, note: input.note, transactionType: input.transactionType, occurredAt: input.occurredAt } } });
  return true;
}
async function deleteTransaction(input) {
  const db = await requireDb();
  const scope = input.financeAccountId === void 0 ? eq(transactions.lineUserId, input.lineUserId) : eq(transactions.financeAccountId, input.financeAccountId);
  const current = (await db.select().from(transactions).where(and(eq(transactions.id, input.id), scope, eq(transactions.status, "active"))).limit(1))[0];
  if (!current) return false;
  await db.update(transactions).set({ status: "deleted", deletedAt: /* @__PURE__ */ new Date() }).where(eq(transactions.id, input.id));
  await writeAuditLog({ action: "transaction.delete", entityType: "transaction", entityId: input.id, dashboardUserId: input.actorDashboardUserId, actorLineUserId: input.lineUserId, lineChatId: current.lineChatId, details: { amount: current.amount, category: current.category, note: current.note, transactionType: current.transactionType } });
  return true;
}
async function saveVoiceTranscription(input) {
  const db = await requireDb();
  const result = await db.insert(voiceTranscriptions).values({ ...input, language: input.language ?? null, durationSeconds: input.durationSeconds === void 0 ? null : String(input.durationSeconds), proposalJson: input.proposalJson ?? null });
  const id = Number(result[0].insertId);
  await writeAuditLog({ action: "voice.transcribe", entityType: "voice_transcription", entityId: id, actorLineUserId: input.lineUserId, lineChatId: input.lineChatId, details: { vaultItemId: input.vaultItemId, language: input.language ?? null } });
  return id;
}
async function latestProposedVoiceTranscription(lineUserId, lineChatId) {
  const db = await requireDb();
  const chatScope = lineChatId ? eq(voiceTranscriptions.lineChatId, lineChatId) : void 0;
  return (await db.select().from(voiceTranscriptions).where(and(eq(voiceTranscriptions.lineUserId, lineUserId), eq(voiceTranscriptions.status, "proposed"), chatScope)).orderBy(desc(voiceTranscriptions.createdAt)).limit(1))[0];
}
async function updateVoiceTranscript(input) {
  const db = await requireDb();
  const current = (await db.select().from(voiceTranscriptions).where(and(eq(voiceTranscriptions.id, input.id), eq(voiceTranscriptions.lineUserId, input.lineUserId), eq(voiceTranscriptions.status, "proposed"))).limit(1))[0];
  if (!current) return false;
  await db.update(voiceTranscriptions).set({ transcript: input.transcript, proposalJson: input.proposalJson }).where(eq(voiceTranscriptions.id, input.id));
  await writeAuditLog({ action: "voice.transcript.update", entityType: "voice_transcription", entityId: input.id, actorLineUserId: input.lineUserId, lineChatId: current.lineChatId, details: { changed: true } });
  return true;
}
async function updateVoiceTranscriptionStatus(id, status) {
  const db = await requireDb();
  await db.update(voiceTranscriptions).set({ status }).where(eq(voiceTranscriptions.id, id));
}
async function listAuditLogs(limit = 100) {
  const db = await requireDb();
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(Math.min(Math.max(limit, 1), 250));
}
async function listDashboardUsers() {
  const db = await requireDb();
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt }).from(users).orderBy(desc(users.lastSignedIn)).limit(250);
}
async function updateDashboardUserRole(id, role, actorDashboardUserId) {
  const db = await requireDb();
  await db.update(users).set({ role }).where(eq(users.id, id));
  await writeAuditLog({ action: "user.role.update", entityType: "user", entityId: id, dashboardUserId: actorDashboardUserId, details: { role } });
}
async function financeSummary(lineUserId, financeAccountId) {
  const now = /* @__PURE__ */ new Date();
  const rows = await listTransactions(lineUserId, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1), false, financeAccountId);
  const income = rows.filter((row) => row.transactionType === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const expense = rows.filter((row) => row.transactionType === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const categories = rows.filter((row) => row.transactionType === "expense").reduce((all, row) => ({ ...all, [row.category]: (all[row.category] ?? 0) + Number(row.amount) }), {});
  const balanceSnapshot = await getBalanceSnapshot(lineUserId, financeAccountId);
  return { income, expense, balance: income - expense, openingBalance: balanceSnapshot.openingBalance, availableBalance: balanceSnapshot.availableBalance, categories };
}
async function getOpeningBalance(lineUserId, financeAccountId) {
  const db = await requireDb();
  return (await db.select().from(financeOpeningBalances).where(financeAccountId === void 0 ? eq(financeOpeningBalances.lineUserId, lineUserId) : eq(financeOpeningBalances.financeAccountId, financeAccountId)).limit(1))[0];
}
async function upsertOpeningBalance(lineUserId, amount, effectiveAt = /* @__PURE__ */ new Date(), financeAccountId) {
  const db = await requireDb();
  await db.insert(financeOpeningBalances).values({ lineUserId, financeAccountId, amount: String(amount), effectiveAt }).onDuplicateKeyUpdate({ set: { amount: String(amount), effectiveAt } });
}
function calculateAvailableBalance(openingBalance, rows) {
  const numericAmount = (amount) => Number(String(amount).replace(/,/g, ""));
  const income = rows.filter((row) => row.transactionType === "income").reduce((sum, row) => sum + numericAmount(row.amount), 0);
  const expense = rows.filter((row) => row.transactionType === "expense").reduce((sum, row) => sum + numericAmount(row.amount), 0);
  return { openingBalance, income, expense, availableBalance: openingBalance + income - expense };
}
async function getBalanceSnapshot(lineUserId, financeAccountId) {
  const db = await requireDb();
  const opening = await getOpeningBalance(lineUserId, financeAccountId);
  const conditions = [financeAccountId === void 0 ? eq(transactions.lineUserId, lineUserId) : eq(transactions.financeAccountId, financeAccountId), eq(transactions.status, "active")];
  if (opening) conditions.push(gte(transactions.occurredAt, opening.effectiveAt));
  const rows = await db.select({ transactionType: transactions.transactionType, amount: transactions.amount }).from(transactions).where(and(...conditions));
  const openingBalance = Number(opening?.amount ?? 0);
  return { ...calculateAvailableBalance(openingBalance, rows), effectiveAt: opening?.effectiveAt ?? null };
}
function nextRecurringRunAt(runAt, recurrenceType, recurrenceInterval = 1) {
  const next = new Date(runAt);
  if (recurrenceType === "day") next.setUTCDate(next.getUTCDate() + recurrenceInterval);
  if (recurrenceType === "week") next.setUTCDate(next.getUTCDate() + recurrenceInterval * 7);
  if (recurrenceType === "month") next.setUTCMonth(next.getUTCMonth() + recurrenceInterval);
  return next;
}
async function createRecurringTransaction(input) {
  const db = await requireDb();
  const result = await db.insert(recurringTransactions).values({ ...input, amount: String(input.amount), note: input.note ?? null, recurrenceInterval: input.recurrenceInterval ?? 1, recurrenceWeekday: input.recurrenceWeekday ?? null, recurrenceDayOfMonth: input.recurrenceDayOfMonth ?? null });
  return Number(result[0].insertId);
}
async function listRecurringTransactions(lineUserId, financeAccountId) {
  const db = await requireDb();
  return db.select().from(recurringTransactions).where(financeAccountId === void 0 ? eq(recurringTransactions.lineUserId, lineUserId) : eq(recurringTransactions.financeAccountId, financeAccountId)).orderBy(recurringTransactions.nextRunAt);
}
async function updateRecurringTransactionStatus(id, lineUserId, status, financeAccountId) {
  const db = await requireDb();
  const scope = financeAccountId === void 0 ? eq(recurringTransactions.lineUserId, lineUserId) : eq(recurringTransactions.financeAccountId, financeAccountId);
  const result = await db.update(recurringTransactions).set({ status }).where(and(eq(recurringTransactions.id, id), scope));
  return result[0].affectedRows > 0;
}
async function listDueRecurringTransactions(now = /* @__PURE__ */ new Date()) {
  const db = await requireDb();
  return db.select().from(recurringTransactions).where(and(eq(recurringTransactions.status, "active"), lte(recurringTransactions.nextRunAt, now))).orderBy(recurringTransactions.nextRunAt).limit(100);
}
async function claimRecurringTransactionRun(input) {
  const db = await requireDb();
  try {
    const result = await db.insert(recurringTransactionRuns).values({ ...input, status: "creating" });
    return Number(result[0].insertId);
  } catch {
    const existing = (await db.select().from(recurringTransactionRuns).where(and(eq(recurringTransactionRuns.recurringTransactionId, input.recurringTransactionId), eq(recurringTransactionRuns.periodKey, input.periodKey))).limit(1))[0];
    if (!existing || existing.status !== "failed") return void 0;
    const result = await db.update(recurringTransactionRuns).set({ status: "creating", transactionId: null, errorMessage: null, finishedAt: null }).where(and(eq(recurringTransactionRuns.id, existing.id), eq(recurringTransactionRuns.status, "failed")));
    return result[0].affectedRows > 0 ? existing.id : void 0;
  }
}
async function completeRecurringTransactionRun(input) {
  const db = await requireDb();
  await db.update(recurringTransactionRuns).set({ status: "created", transactionId: input.transactionId, finishedAt: /* @__PURE__ */ new Date() }).where(eq(recurringTransactionRuns.id, input.runId));
  await db.update(recurringTransactions).set({ nextRunAt: input.nextRunAt, lastCreatedAt: /* @__PURE__ */ new Date() }).where(eq(recurringTransactions.id, input.recurringTransactionId));
}
async function failRecurringTransactionRun(runId, errorMessage) {
  const db = await requireDb();
  await db.update(recurringTransactionRuns).set({ status: "failed", errorMessage: errorMessage.slice(0, 1e3), finishedAt: /* @__PURE__ */ new Date() }).where(eq(recurringTransactionRuns.id, runId));
}
async function financeReport(lineUserId, period, reference = /* @__PURE__ */ new Date(), financeAccountId) {
  const { start, end } = financeReportWindow(period, reference);
  const rows = await listTransactions(lineUserId, start, new Date(end.getTime() - 1), false, financeAccountId);
  return { ...buildFinanceReport(rows, period, reference), rows };
}
async function financeReportRange(lineUserId, start, end, financeAccountId) {
  if (end < start) throw new Error("\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E01\u0E48\u0E2D\u0E19\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19");
  const rows = await listTransactions(lineUserId, start, end, false, financeAccountId);
  return { period: "custom", start, end, ...summarizeFinanceRows(rows), rows };
}
async function financeAnalytics(lineUserId, financeAccountId) {
  const rows = await listTransactions(lineUserId, new Date(Date.now() - 6 * 864e5), void 0, false, financeAccountId);
  return buildFinanceAnalytics(rows);
}
async function upsertBudget(lineUserId, category, amount, monthKey, financeAccountId) {
  const db = await requireDb();
  await db.insert(budgets).values({ lineUserId, financeAccountId, category, amount: String(amount), monthKey }).onDuplicateKeyUpdate({ set: { amount: String(amount) } });
}
async function listBudgets(lineUserId, monthKey, financeAccountId) {
  const db = await requireDb();
  const currentMonth = monthKey ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(/* @__PURE__ */ new Date()).slice(0, 7);
  const scope = financeAccountId === void 0 ? eq(budgets.lineUserId, lineUserId) : eq(budgets.financeAccountId, financeAccountId);
  return db.select().from(budgets).where(and(scope, eq(budgets.monthKey, currentMonth))).orderBy(budgets.category);
}
async function addExpenseCategory(lineUserId, name, transactionType = "expense", financeAccountId) {
  const db = await requireDb();
  await db.insert(expenseCategories).values({ lineUserId, financeAccountId, name, transactionType }).onDuplicateKeyUpdate({ set: { name } });
}
async function removeExpenseCategory(lineUserId, name, transactionType = "expense", financeAccountId) {
  const db = await requireDb();
  const scope = financeAccountId === void 0 ? eq(expenseCategories.lineUserId, lineUserId) : eq(expenseCategories.financeAccountId, financeAccountId);
  const result = await db.delete(expenseCategories).where(and(scope, eq(expenseCategories.transactionType, transactionType), eq(expenseCategories.name, name)));
  return result[0].affectedRows > 0;
}
async function listExpenseCategories(lineUserId, transactionType = "expense", financeAccountId) {
  const db = await requireDb();
  const scope = financeAccountId === void 0 ? eq(expenseCategories.lineUserId, lineUserId) : eq(expenseCategories.financeAccountId, financeAccountId);
  return db.select().from(expenseCategories).where(and(scope, eq(expenseCategories.transactionType, transactionType))).orderBy(expenseCategories.name);
}
async function listTransactionCategories(lineUserId, financeAccountId) {
  const db = await requireDb();
  return db.select().from(expenseCategories).where(financeAccountId === void 0 ? eq(expenseCategories.lineUserId, lineUserId) : eq(expenseCategories.financeAccountId, financeAccountId)).orderBy(expenseCategories.transactionType, expenseCategories.name);
}
async function getLinkedLineUser(dashboardUserId) {
  const db = await requireDb();
  return (await db.select().from(lineAccountLinks).where(eq(lineAccountLinks.dashboardUserId, dashboardUserId)).limit(1))[0]?.lineUserId;
}
async function getOwnerLinkedLineUser() {
  const db = await requireDb();
  const owner = (await db.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1))[0];
  return owner ? getLinkedLineUser(owner.id) : void 0;
}
async function linkLineUser(dashboardUserId, lineUserId) {
  const db = await requireDb();
  await db.insert(lineAccountLinks).values({ dashboardUserId, lineUserId }).onDuplicateKeyUpdate({ set: { lineUserId } });
}
async function saveImageExtraction(vaultItemId, purpose, extractedJson, confidence) {
  const db = await requireDb();
  return db.insert(imageExtractions).values({ vaultItemId, purpose, model: "gemini-3-flash-preview", extractedJson, confidence: confidence === void 0 ? null : String(confidence) });
}
async function latestImageExtraction(lineUserId, lineChatId) {
  const db = await requireDb();
  const scope = lineChatId ? and(eq(vaultItems.createdByLineUserId, lineUserId), eq(vaultItems.lineChatId, lineChatId)) : eq(vaultItems.createdByLineUserId, lineUserId);
  return (await db.select({ extraction: imageExtractions, vault: vaultItems }).from(imageExtractions).innerJoin(vaultItems, eq(imageExtractions.vaultItemId, vaultItems.id)).where(scope).orderBy(desc(imageExtractions.createdAt)).limit(1))[0];
}
async function setImageExtractionStatus(id, status) {
  const db = await requireDb();
  await db.update(imageExtractions).set({ status }).where(eq(imageExtractions.id, id));
}
async function getAutomationSetting(settingKey) {
  const db = await requireDb();
  return (await db.select().from(automationSettings).where(eq(automationSettings.settingKey, settingKey)).limit(1))[0];
}
async function getAutomationSettingByTaskUid(taskUid) {
  const db = await requireDb();
  return (await db.select().from(automationSettings).where(eq(automationSettings.scheduleCronTaskUid, taskUid)).limit(1))[0];
}
async function saveAutomationSetting(input) {
  const db = await requireDb();
  await db.insert(automationSettings).values({ settingKey: input.settingKey, scheduleCronTaskUid: input.scheduleCronTaskUid ?? null, isEnabled: input.isEnabled ?? true, lastRunAt: input.lastRunAt ?? null }).onDuplicateKeyUpdate({ set: { scheduleCronTaskUid: input.scheduleCronTaskUid ?? null, isEnabled: input.isEnabled ?? true, lastRunAt: input.lastRunAt ?? null } });
}
async function claimFinanceDigestDelivery(input) {
  const db = await requireDb();
  try {
    const result = await db.insert(financeDigestDeliveries).values({ ...input, status: "sending" });
    return Number(result[0].insertId);
  } catch {
    const current = (await db.select().from(financeDigestDeliveries).where(and(eq(financeDigestDeliveries.settingKey, input.settingKey), eq(financeDigestDeliveries.periodKey, input.periodKey))).limit(1))[0];
    if (!current || current.status !== "failed") return void 0;
    const result = await db.update(financeDigestDeliveries).set({ status: "sending", errorMessage: null, finishedAt: null, taskUid: input.taskUid, targetLineUserId: input.targetLineUserId }).where(and(eq(financeDigestDeliveries.id, current.id), eq(financeDigestDeliveries.status, "failed")));
    return result[0].affectedRows > 0 ? current.id : void 0;
  }
}
async function finishFinanceDigestDelivery(id, status, errorMessage) {
  const db = await requireDb();
  await db.update(financeDigestDeliveries).set({ status, errorMessage: errorMessage ?? null, finishedAt: /* @__PURE__ */ new Date() }).where(eq(financeDigestDeliveries.id, id));
}

// server/_core/sdk.ts
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "milo-app",
        name: options.name || "\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A (Admin)"
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      const finalAppId = isNonEmptyString(appId) ? appId : "milo-app";
      const finalName = isNonEmptyString(name) ? name : "\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A (Admin)";
      if (!isNonEmptyString(openId)) {
        console.warn("[Auth] Session payload missing openId");
        return null;
      }
      return {
        openId,
        appId: finalAppId,
        name: finalName
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    if (session.openId.startsWith("admin_")) {
      let dbUser;
      try {
        dbUser = await getUserByOpenId(session.openId);
      } catch {
      }
      return dbUser || {
        id: 1,
        openId: session.openId,
        name: session.name || "\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A (Admin)",
        email: "admin@milo.internal",
        loginMethod: "admin_password",
        role: "admin",
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        lastSignedIn: signedInAt
      };
    }
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/milo/line.ts
import crypto2 from "node:crypto";
function lineCredentials() {
  return { channelSecret: process.env.LINE_CHANNEL_SECRET ?? "", channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "" };
}
function verifyLineSignature(body, signature, secret) {
  if (!signature || !secret) return false;
  const computed = Buffer.from(crypto2.createHmac("sha256", secret).update(body).digest("base64"));
  const supplied = Buffer.from(signature);
  return computed.length === supplied.length && crypto2.timingSafeEqual(computed, supplied);
}
function sourceIdentity(source) {
  if (source.type === "user") return { lineChatId: source.userId, lineUserId: source.userId, scope: "user" };
  if (source.type === "group") return { lineChatId: source.groupId, lineUserId: source.userId, scope: "group" };
  return { lineChatId: source.roomId, lineUserId: source.userId, scope: "room" };
}
async function callLine(path, credentials, init) {
  const response = await fetch(`https://api.line.me${path}`, { ...init, headers: { Authorization: `Bearer ${credentials.channelAccessToken}`, ...init.headers } });
  if (!response.ok) throw new Error(`LINE API ${response.status}: ${await response.text()}`);
  console.info("[Milo LINE] message delivered", { endpoint: path, status: response.status });
  return response;
}
async function replyText(replyToken, text2, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text2.slice(0, 5e3) }] }) });
}
var MILO_VOICE_CAT_IMAGE_URL = "https://miloassist-suwp6bg2.manus.space/manus-storage/milo-voice-proposal-cat_9d143831.png";
function voiceQuickReply() {
  return {
    items: [
      { type: "action", action: { type: "message", label: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01", text: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E2A\u0E35\u0E22\u0E07" } },
      { type: "action", action: { type: "message", label: "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21", text: "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07" } }
    ]
  };
}
function voiceProposalText(proposal) {
  const financialLine = proposal.transactionType && proposal.amount ? `
\u0E40\u0E2A\u0E19\u0E2D${proposal.transactionType === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"} ${proposal.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E2B\u0E21\u0E27\u0E14${proposal.category ?? "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B"}` : "\n\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A/\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E17\u0E35\u0E48\u0E41\u0E19\u0E48\u0E0A\u0E31\u0E14";
  return `\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07
\u201C${proposal.transcript.slice(0, 900)}\u201D${financialLine}
\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E08\u0E19\u0E01\u0E27\u0E48\u0E32\u0E08\u0E30\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19`;
}
function mascotExpenseCopy(transactionType, amount) {
  if (transactionType === "income") return "\u0E19\u0E49\u0E2D\u0E07\u0E41\u0E21\u0E27\u0E40\u0E01\u0E47\u0E1A\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E44\u0E27\u0E49\u0E43\u0E2B\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E40\u0E21\u0E35\u0E49\u0E22\u0E27";
  if (amount <= 100) return "\u0E19\u0E49\u0E2D\u0E07\u0E41\u0E21\u0E27\u0E40\u0E01\u0E47\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E25\u0E47\u0E01 \u0E46 \u0E44\u0E27\u0E49\u0E43\u0E2B\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E40\u0E21\u0E35\u0E49\u0E22\u0E27";
  if (amount <= 500) return "\u0E40\u0E0A\u0E47\u0E01\u0E22\u0E2D\u0E14\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49\u0E44\u0E14\u0E49\u0E17\u0E31\u0E19\u0E17\u0E35\u0E19\u0E30\u0E40\u0E21\u0E35\u0E49\u0E22\u0E27";
  return "\u0E22\u0E2D\u0E14\u0E19\u0E35\u0E49\u0E44\u0E21\u0E42\u0E25\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E27\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E25\u0E2D\u0E07\u0E14\u0E39\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22";
}
function postSaveSummaryText(summary) {
  const label = summary.transactionType === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A";
  return `\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01${label} ${summary.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E2B\u0E21\u0E27\u0E14${summary.category}\u0E41\u0E25\u0E49\u0E27
${mascotExpenseCopy(summary.transactionType, summary.amount)}
\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49: \u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A ${summary.dailyIncome.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \xB7 \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 ${summary.dailyExpense.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \xB7 \u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D ${summary.dailyBalance.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17`;
}
function financeReportCardText(report) {
  const periodLabel = { day: "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", week: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49", month: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", year: "\u0E1B\u0E35\u0E19\u0E35\u0E49" };
  const money = (amount) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => `\u2022 ${name} ${money(amount)} \u0E1A\u0E32\u0E17`).join("\n");
  return `${report.title ?? `\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19${periodLabel[report.period]}`}
${report.subtitle ? `${report.subtitle}
` : ""}\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A ${money(report.income)} \u0E1A\u0E32\u0E17
\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 ${money(report.expense)} \u0E1A\u0E32\u0E17
\u0E01\u0E33\u0E44\u0E23/\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D ${money(report.balance)} \u0E1A\u0E32\u0E17
${categories ? `
\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E15\u0E32\u0E21\u0E2B\u0E21\u0E27\u0E14
${categories}` : "\n\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E19\u0E35\u0E49"}`;
}
function miloFinanceBrandStrip() {
  return { type: "box", layout: "horizontal", alignItems: "center", spacing: "sm", paddingAll: "9px", cornerRadius: "md", backgroundColor: "#FCEAF4", contents: [
    { type: "image", url: MILO_VOICE_CAT_IMAGE_URL, size: "xs", aspectRatio: "1:1", aspectMode: "cover", flex: 0 },
    { type: "box", layout: "vertical", flex: 1, contents: [
      { type: "text", text: "MILO  \u2022  FINANCE", size: "xxs", weight: "bold", color: "#7657AA" },
      { type: "text", text: "\u0E19\u0E49\u0E2D\u0E07\u0E41\u0E21\u0E27\u0E0A\u0E48\u0E27\u0E22\u0E14\u0E39\u0E41\u0E25\u0E22\u0E2D\u0E14\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13", size: "xxs", color: "#9A7390", wrap: true }
    ] },
    { type: "text", text: "\u2726", size: "sm", color: "#5AC6AD", flex: 0 }
  ] };
}
async function replyFinanceReportCard(replyToken, report, credentials = lineCredentials()) {
  const periodLabel = { day: "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", week: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49", month: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", year: "\u0E1B\u0E35\u0E19\u0E35\u0E49" };
  const title = report.title ?? `\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19${periodLabel[report.period]}`;
  const subtitle = report.subtitle ?? "\u0E22\u0E2D\u0E14\u0E23\u0E27\u0E21\u0E08\u0E32\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E27\u0E49";
  const money = (amount) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const categoryRows = categories.length ? categories.map(([name, amount]) => ({ type: "box", layout: "horizontal", margin: "sm", contents: [
    { type: "text", text: name, size: "xs", color: "#675B7C", flex: 1, wrap: true },
    { type: "text", text: `${money(amount)} \u0E1A\u0E32\u0E17`, size: "xs", weight: "bold", color: "#B9517B", align: "end" }
  ] })) : [{ type: "text", text: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E19\u0E35\u0E49", size: "xs", color: "#8A8097" }];
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{
      type: "flex",
      altText: financeReportCardText(report),
      contents: {
        type: "bubble",
        size: "mega",
        hero: { type: "image", url: MILO_VOICE_CAT_IMAGE_URL, size: "full", aspectRatio: "20:9", aspectMode: "cover" },
        body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", backgroundColor: "#F2F0FF", contents: [
          { type: "box", layout: "horizontal", alignItems: "center", spacing: "md", paddingAll: "12px", cornerRadius: "md", backgroundColor: "#E4F8F2", contents: [
            { type: "box", layout: "vertical", justifyContent: "center", alignItems: "center", width: "38px", height: "38px", cornerRadius: "md", backgroundColor: "#5AC6AD", contents: [{ type: "text", text: "\u0E3F", align: "center", weight: "bold", size: "xl", color: "#FFFFFF" }] },
            { type: "box", layout: "vertical", flex: 1, contents: [
              { type: "text", text: title, weight: "bold", size: "lg", color: "#4B3D69", wrap: true },
              { type: "text", text: subtitle, size: "xs", color: "#7B6E97", wrap: true }
            ] }
          ] },
          miloFinanceBrandStrip(),
          { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", cornerRadius: "md", backgroundColor: "#FFFEFB", contents: [
            { type: "text", text: "\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19", size: "xs", weight: "bold", color: "#76688E" },
            { type: "box", layout: "horizontal", spacing: "sm", contents: [
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#EAF8F4", contents: [{ type: "text", text: "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A", size: "xxs", color: "#5B8E81" }, { type: "text", text: `${money(report.income)} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#267C68", wrap: true }] },
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FDECF2", contents: [{ type: "text", text: "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22", size: "xxs", color: "#A57086" }, { type: "text", text: `${money(report.expense)} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#BB527C", wrap: true }] }
            ] },
            { type: "box", layout: "horizontal", alignItems: "center", paddingAll: "11px", cornerRadius: "md", backgroundColor: "#EEEAF8", contents: [
              { type: "text", text: "\u0E01\u0E33\u0E44\u0E23 / \u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D", size: "xs", color: "#6B6080", flex: 1 },
              { type: "text", text: `${money(report.balance)} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#4D4263", align: "end" }
            ] },
            { type: "separator", color: "#E9E4F1" },
            { type: "text", text: "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E15\u0E32\u0E21\u0E2B\u0E21\u0E27\u0E14", size: "xs", weight: "bold", color: "#76688E" },
            { type: "box", layout: "vertical", paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FFF7FA", contents: categoryRows }
          ] }
        ] },
        footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", backgroundColor: "#F2F0FF", contents: [
          { type: "button", style: "primary", color: "#7657AA", height: "sm", action: { type: "message", label: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49" } },
          { type: "box", layout: "horizontal", spacing: "sm", contents: [
            { type: "button", style: "secondary", color: "#9A7DB7", flex: 1, height: "sm", action: { type: "message", label: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49" } },
            { type: "button", style: "secondary", color: "#9A7DB7", flex: 1, height: "sm", action: { type: "message", label: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49" } }
          ] }
        ] }
      }
    }] })
  });
}
async function replyFinanceReportCardFallback(replyToken, report, credentials = lineCredentials()) {
  return replyText(replyToken, financeReportCardText(report), credentials);
}
async function pushFinanceReportCard(to, report, credentials = lineCredentials()) {
  const money = (amount) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const categoryRows = categories.length ? categories.map(([name, amount]) => ({ type: "box", layout: "horizontal", margin: "sm", contents: [
    { type: "text", text: name, size: "xs", color: "#675B7C", flex: 1, wrap: true },
    { type: "text", text: `${money(amount)} \u0E1A\u0E32\u0E17`, size: "xs", weight: "bold", color: "#B9517B", align: "end" }
  ] })) : [{ type: "text", text: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32\u0E19\u0E35\u0E49", size: "xs", color: "#8A8097" }];
  const title = report.title ?? "\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E08\u0E32\u0E01\u0E44\u0E21\u0E42\u0E25";
  return callLine("/v2/bot/message/push", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, messages: [{
      type: "flex",
      altText: financeReportCardText(report),
      contents: {
        type: "bubble",
        size: "mega",
        hero: { type: "image", url: MILO_VOICE_CAT_IMAGE_URL, size: "full", aspectRatio: "20:9", aspectMode: "cover" },
        body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", backgroundColor: "#F2F0FF", contents: [
          { type: "box", layout: "horizontal", alignItems: "center", spacing: "md", paddingAll: "12px", cornerRadius: "md", backgroundColor: "#E4F8F2", contents: [
            { type: "box", layout: "vertical", justifyContent: "center", alignItems: "center", width: "38px", height: "38px", cornerRadius: "md", backgroundColor: "#5AC6AD", contents: [{ type: "text", text: "\u0E3F", align: "center", weight: "bold", size: "xl", color: "#FFFFFF" }] },
            { type: "box", layout: "vertical", flex: 1, contents: [{ type: "text", text: title, weight: "bold", size: "lg", color: "#4B3D69", wrap: true }, { type: "text", text: report.subtitle ?? "\u0E2A\u0E23\u0E38\u0E1B\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E15\u0E32\u0E21\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E15\u0E31\u0E49\u0E07\u0E44\u0E27\u0E49", size: "xs", color: "#7B6E97", wrap: true }] }
          ] },
          miloFinanceBrandStrip(),
          { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", cornerRadius: "md", backgroundColor: "#FFFEFB", contents: [
            { type: "box", layout: "horizontal", spacing: "sm", contents: [
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#EAF8F4", contents: [{ type: "text", text: "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A", size: "xxs", color: "#5B8E81" }, { type: "text", text: `${money(report.income)} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#267C68", wrap: true }] },
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FDECF2", contents: [{ type: "text", text: "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22", size: "xxs", color: "#A57086" }, { type: "text", text: `${money(report.expense)} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#BB527C", wrap: true }] }
            ] },
            { type: "box", layout: "horizontal", paddingAll: "10px", cornerRadius: "md", backgroundColor: "#EEEAF8", contents: [{ type: "text", text: "\u0E01\u0E33\u0E44\u0E23 / \u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D", size: "xs", color: "#6B6080", flex: 1 }, { type: "text", text: `${money(report.balance)} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#4D4263", align: "end" }] },
            { type: "separator", color: "#E9E4F1" },
            { type: "text", text: "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E15\u0E32\u0E21\u0E2B\u0E21\u0E27\u0E14", size: "xs", weight: "bold", color: "#76688E" },
            { type: "box", layout: "vertical", paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FFF7FA", contents: categoryRows }
          ] }
        ] }
      }
    }] })
  });
}
async function replyPostSaveSummary(replyToken, summary, credentials = lineCredentials()) {
  const isExpense = summary.transactionType === "expense";
  const label = isExpense ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A";
  const accent = isExpense ? "#C9578A" : "#24977B";
  const softAccent = isExpense ? "#FDE9F1" : "#E2F8F0";
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{
      type: "flex",
      altText: postSaveSummaryText(summary),
      contents: {
        type: "bubble",
        size: "mega",
        hero: { type: "image", url: MILO_VOICE_CAT_IMAGE_URL, size: "full", aspectRatio: "20:9", aspectMode: "cover" },
        body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", backgroundColor: "#F2F0FF", contents: [
          { type: "box", layout: "horizontal", alignItems: "center", spacing: "md", paddingAll: "12px", cornerRadius: "md", backgroundColor: "#E4F8F2", contents: [
            { type: "box", layout: "vertical", justifyContent: "center", alignItems: "center", width: "38px", height: "38px", cornerRadius: "md", backgroundColor: "#5AC6AD", contents: [{ type: "text", text: "\u2713", align: "center", weight: "bold", size: "xl", color: "#FFFFFF" }] },
            { type: "box", layout: "vertical", flex: 1, contents: [
              { type: "text", text: "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08", weight: "bold", size: "lg", color: "#4B3D69" },
              { type: "text", text: mascotExpenseCopy(summary.transactionType, summary.amount), size: "xs", wrap: true, color: "#7B6E97" }
            ] }
          ] },
          { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", cornerRadius: "md", backgroundColor: "#FFFEFB", contents: [
            { type: "box", layout: "horizontal", alignItems: "center", contents: [
              { type: "text", text: `${isExpense ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"}  \u2022  ${summary.category}`, size: "sm", weight: "bold", color: accent, flex: 1 },
              { type: "text", text: "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E41\u0E25\u0E49\u0E27", size: "xxs", color: "#8B809B", align: "end" }
            ] },
            { type: "text", text: `${summary.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17`, size: "xxl", weight: "bold", color: "#3F3552" },
            { type: "separator", color: "#E9E4F1" },
            { type: "text", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E22\u0E2D\u0E14\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", size: "xs", weight: "bold", color: "#76688E" },
            { type: "box", layout: "horizontal", spacing: "sm", contents: [
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#EAF8F4", contents: [{ type: "text", text: "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A", size: "xxs", color: "#5B8E81" }, { type: "text", text: `${summary.dailyIncome.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#267C68" }] },
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FDECF2", contents: [{ type: "text", text: "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22", size: "xxs", color: "#A57086" }, { type: "text", text: `${summary.dailyExpense.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#BB527C" }] }
            ] },
            { type: "box", layout: "horizontal", alignItems: "center", paddingAll: "11px", cornerRadius: "md", backgroundColor: softAccent, contents: [
              { type: "text", text: "\u0E22\u0E2D\u0E14\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", size: "xs", color: "#6B6080", flex: 1 },
              { type: "text", text: `${summary.dailyBalance.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#4D4263", align: "end" }
            ] }
          ] }
        ] },
        footer: { type: "box", layout: "vertical", paddingAll: "16px", backgroundColor: "#F2F0FF", contents: [
          { type: "button", style: "primary", color: "#7657AA", height: "sm", action: { type: "message", label: "\u0E14\u0E39\u0E2A\u0E23\u0E38\u0E1B\u0E22\u0E2D\u0E14\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49" } }
        ] }
      }
    }] })
  });
}
async function replyPostSaveSummaryFallback(replyToken, summary, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "text", text: postSaveSummaryText(summary).slice(0, 5e3), quickReply: { items: [{ type: "action", action: { type: "message", label: "\u0E14\u0E39\u0E2A\u0E23\u0E38\u0E1B\u0E22\u0E2D\u0E14\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49" } }] } }] }) });
}
async function replyVoiceCategoryChoices(replyToken, credentials = lineCredentials()) {
  const popular = ["\u0E2D\u0E32\u0E2B\u0E32\u0E23", "\u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07", "\u0E04\u0E48\u0E32\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E39\u0E1B\u0E42\u0E20\u0E04", "\u0E0A\u0E49\u0E2D\u0E1B\u0E1B\u0E34\u0E49\u0E07", "\u0E2A\u0E38\u0E02\u0E20\u0E32\u0E1E"];
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "text", text: "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E2B\u0E21\u0E27\u0E14\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22 \u0E2B\u0E23\u0E37\u0E2D\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E41\u0E01\u0E49\u0E44\u0E02\u0E40\u0E2A\u0E35\u0E22\u0E07 <\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E43\u0E2B\u0E21\u0E48>\u201D \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E41\u0E01\u0E49\u0E17\u0E31\u0E49\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21", quickReply: { items: popular.map((category) => ({ type: "action", action: { type: "message", label: category, text: `\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E2B\u0E21\u0E27\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07 ${category}` } })) } }] }) });
}
async function replyVoiceProposal(replyToken, proposal, credentials = lineCredentials()) {
  const isExpense = proposal.transactionType === "expense";
  const financialLine = proposal.transactionType && proposal.amount ? `${isExpense ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"} ${proposal.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17` : "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E17\u0E35\u0E48\u0E41\u0E19\u0E48\u0E0A\u0E31\u0E14";
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "flex",
        altText: "\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01",
        contents: {
          type: "bubble",
          size: "kilo",
          hero: {
            type: "image",
            url: MILO_VOICE_CAT_IMAGE_URL,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover"
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            backgroundColor: "#FFF9F2",
            contents: [
              { type: "text", text: "\u0E44\u0E21\u0E42\u0E25\u0E1F\u0E31\u0E07\u0E43\u0E2B\u0E49\u0E41\u0E25\u0E49\u0E27", weight: "bold", size: "lg", color: "#563F79" },
              { type: "text", text: "\u0E15\u0E23\u0E27\u0E08\u0E40\u0E0A\u0E47\u0E01\u0E01\u0E48\u0E2D\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E19\u0E30\u0E40\u0E21\u0E35\u0E49\u0E22\u0E27", size: "xs", color: "#9A7DB7" },
              { type: "box", layout: "vertical", margin: "md", paddingAll: "md", cornerRadius: "md", backgroundColor: isExpense ? "#FFE8EF" : "#E3F8F0", contents: [
                { type: "text", text: financialLine, wrap: true, size: "xl", weight: "bold", color: isExpense ? "#D74475" : "#0F8D6C" },
                ...proposal.category ? [{ type: "text", text: `\u0E2B\u0E21\u0E27\u0E14 \u2022 ${proposal.category}`, wrap: true, size: "sm", margin: "sm", color: "#6E597D" }] : []
              ] },
              { type: "text", text: `\u201C${proposal.transcript.slice(0, 700)}\u201D`, wrap: true, size: "sm", margin: "md", color: "#554E62" },
              { type: "box", layout: "horizontal", spacing: "sm", margin: "md", paddingAll: "sm", cornerRadius: "md", backgroundColor: "#F2ECFF", contents: [
                { type: "text", text: "\u{1F43E}", size: "sm", flex: 0 },
                { type: "text", text: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01 \u0E08\u0E19\u0E01\u0E27\u0E48\u0E32\u0E08\u0E30\u0E01\u0E14\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19", wrap: true, size: "xs", color: "#6B5B8E" }
              ] }
            ]
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            backgroundColor: "#FFF9F2",
            contents: [
              { type: "button", style: "primary", color: "#D74475", action: { type: "message", label: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01", text: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E2A\u0E35\u0E22\u0E07" } },
              { type: "button", style: "secondary", color: "#9A7DB7", action: { type: "message", label: "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21", text: "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07" } }
            ]
          }
        }
      }]
    })
  });
}
async function replyVoiceProposalFallback(replyToken, proposal, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: voiceProposalText(proposal).slice(0, 5e3), quickReply: voiceQuickReply() }] })
  });
}
async function pushText(to, text2, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/push", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, messages: [{ type: "text", text: text2.slice(0, 5e3) }] }) });
}
async function replyMention(replyToken, message, lineUserId, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "textV2",
        text: "{member} " + message.slice(0, 4800),
        substitution: { member: { type: "mention", mentionee: { type: "user", userId: lineUserId } } }
      }]
    })
  });
}
async function getMessageContent(messageId, credentials = lineCredentials()) {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    method: "GET",
    headers: { Authorization: `Bearer ${credentials.channelAccessToken}` }
  });
  if (!response.ok) throw new Error(`LINE data API ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}
async function getProfile(source, credentials = lineCredentials()) {
  if (source.type === "user") {
    const response2 = await callLine(`/v2/bot/profile/${source.userId}`, credentials, { method: "GET" });
    return await response2.json();
  }
  if (!source.userId) return void 0;
  const path = source.type === "group" ? `/v2/bot/group/${source.groupId}/member/${source.userId}` : `/v2/bot/room/${source.roomId}/member/${source.userId}`;
  const response = await callLine(path, credentials, { method: "GET" });
  return await response.json();
}

// server/milo/reminderDelivery.ts
async function deliverDueReminders(context = {}) {
  const due = await listDueReminders();
  let sent = 0;
  let failed = 0;
  for (const reminder of due) {
    const attemptId = await createReminderDeliveryAttempt({ reminderId: reminder.id, runner: context.runner ?? "manual", taskUid: context.taskUid });
    try {
      await pushText(reminder.lineChatId, `\u{1F514} ${reminder.title}${reminder.detail ? `
${reminder.detail}` : ""}`);
      await markReminderDelivered(reminder);
      await finishReminderDeliveryAttempt(attemptId, "sent");
      sent += 1;
    } catch (error) {
      await markReminderFailed(reminder.id);
      await finishReminderDeliveryAttempt(attemptId, "failed", error instanceof Error ? error.message.slice(0, 1e3) : "LINE delivery failed");
      failed += 1;
    }
  }
  return { sent, failed, checked: due.length };
}

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema3 = outputSchema || output_schema;
  if (!schema3) return void 0;
  if (!schema3.name || !schema3.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema3.name,
      schema: schema3.schema,
      ...typeof schema3.strict === "boolean" ? { strict: schema3.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/milo/financialAssistant.ts
var categorySchema = {
  type: "object",
  properties: {
    category: { type: "string" },
    confidence: { type: "number" },
    reason: { type: "string" }
  },
  required: ["category", "confidence", "reason"],
  additionalProperties: false
};
async function suggestExpenseCategory(note, allowedCategories) {
  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: "\u0E08\u0E31\u0E14\u0E2B\u0E21\u0E27\u0E14\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22\u0E08\u0E32\u0E01\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E31\u0E49\u0E19 \u0E40\u0E25\u0E37\u0E2D\u0E01\u0E44\u0E14\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30 allowedCategories \u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19 \u0E2B\u0E32\u0E01\u0E44\u0E21\u0E48\u0E21\u0E31\u0E48\u0E19\u0E43\u0E08\u0E43\u0E2B\u0E49\u0E40\u0E25\u0E37\u0E2D\u0E01 \u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B \u0E2B\u0E49\u0E32\u0E21\u0E40\u0E14\u0E32\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E21\u0E35\u0E43\u0E19\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21" },
      { role: "user", content: JSON.stringify({ note, allowedCategories }) }
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_expense_category", strict: true, schema: categorySchema } }
  });
  const content = response.choices[0]?.message.content;
  if (!content || typeof content !== "string") throw new Error("AI \u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E08\u0E31\u0E14\u0E2B\u0E21\u0E27\u0E14\u0E44\u0E14\u0E49");
  const result = JSON.parse(content);
  return { ...result, category: allowedCategories.includes(result.category) ? result.category : "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B" };
}
var schema = {
  type: "object",
  properties: {
    dataSufficiency: { type: "string", enum: ["insufficient", "limited", "adequate"] },
    summary: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    categoryObservations: { type: "array", items: { type: "object", properties: { category: { type: "string" }, observation: { type: "string" } }, required: ["category", "observation"], additionalProperties: false } },
    suggestedActions: { type: "array", items: { type: "string" } }
  },
  required: ["dataSufficiency", "summary", "highlights", "categoryObservations", "suggestedActions"],
  additionalProperties: false
};
async function generateFinancialInsight(input) {
  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: "\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D\u0E44\u0E21\u0E42\u0E25 \u0E1C\u0E39\u0E49\u0E0A\u0E48\u0E27\u0E22\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22 \u0E43\u0E0A\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19 \u0E2B\u0E49\u0E32\u0E21\u0E41\u0E15\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2B\u0E23\u0E37\u0E2D\u0E2D\u0E49\u0E32\u0E07\u0E27\u0E48\u0E32\u0E40\u0E2B\u0E47\u0E19\u0E41\u0E19\u0E27\u0E42\u0E19\u0E49\u0E21\u0E2B\u0E32\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E40\u0E1E\u0E35\u0E22\u0E07\u0E1E\u0E2D \u0E23\u0E30\u0E1A\u0E38 dataSufficiency=insufficient \u0E40\u0E21\u0E37\u0E48\u0E2D\u0E44\u0E21\u0E48\u0E21\u0E35\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21, limited \u0E40\u0E21\u0E37\u0E48\u0E2D\u0E21\u0E35\u0E19\u0E49\u0E2D\u0E22\u0E01\u0E27\u0E48\u0E32 5 \u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21, adequate \u0E40\u0E21\u0E37\u0E48\u0E2D\u0E21\u0E35\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E19\u0E49\u0E2D\u0E22 5 \u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21 \u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E01\u0E32\u0E23\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E40\u0E0A\u0E34\u0E07\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34 \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33\u0E25\u0E07\u0E17\u0E38\u0E19\u0E2B\u0E23\u0E37\u0E2D\u0E20\u0E32\u0E29\u0E35" },
      { role: "user", content: JSON.stringify({ period: input.period, income: input.income, expense: input.expense, balance: input.balance, transactionCount: input.transactionCount, categories: input.categories, transactions: input.rows.map((row) => ({ type: row.transactionType, amount: Number(row.amount), category: row.category })) }) }
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_financial_insight", strict: true, schema } }
  });
  const content = response.choices[0]?.message.content;
  if (!content || typeof content !== "string") throw new Error("AI \u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E44\u0E14\u0E49");
  return JSON.parse(content);
}

// server/adminPassword.ts
import crypto3 from "node:crypto";
import mysql2 from "mysql2/promise";
var SCRYPT_N = 16384;
var SCRYPT_R = 8;
var SCRYPT_P = 1;
var KEYLEN = 64;
var SALT_BYTES = 16;
var pool = null;
var passwordColumnReady = null;
function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = mysql2.createPool({
      uri: process.env.DATABASE_URL,
      ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionLimit: 5
    });
  }
  if (!pool) throw new Error("Database unavailable");
  return pool;
}
async function ensurePasswordColumn(db) {
  if (!passwordColumnReady) {
    passwordColumnReady = db.query("ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `passwordHash` VARCHAR(255) NULL AFTER `role`").then(() => void 0).catch((error) => {
      passwordColumnReady = null;
      throw error;
    });
  }
  await passwordColumnReady;
}
function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto3.scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}
async function hashAdminPassword(password) {
  const salt = crypto3.randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}
async function verifyAdminPassword(password, encoded) {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const costN = Number(n);
  const costR = Number(r);
  const costP = Number(p);
  if (!salt.length || !expected.length || !Number.isInteger(costN) || !Number.isInteger(costR) || !Number.isInteger(costP) || costN < 1024 || costR < 1 || costP < 1 || expected.length !== KEYLEN) return false;
  const derived = await new Promise((resolve, reject) => {
    crypto3.scrypt(password, salt, expected.length, { N: costN, r: costR, p: costP }, (error, value) => error ? reject(error) : resolve(value));
  });
  return crypto3.timingSafeEqual(expected, derived);
}
function configuredUsername() {
  const username = (process.env.ADMIN_USERNAME ?? "").trim();
  if (!username) throw new Error("ADMIN_USERNAME is not configured");
  return username;
}
function configuredBootstrapPassword() {
  const password = (process.env.ADMIN_PASSWORD ?? "").trim();
  if (!password) throw new Error("Admin password has not been configured");
  return password;
}
function adminOpenId(username) {
  return `admin_${username}`;
}
async function authenticateAdminPassword(username, password) {
  const expectedUsername = configuredUsername();
  if (username !== expectedUsername) return false;
  const db = getPool();
  await ensurePasswordColumn(db);
  const openId = adminOpenId(expectedUsername);
  const [rows] = await db.query("SELECT id, passwordHash FROM users WHERE openId = ? AND role = 'admin' LIMIT 1", [openId]);
  const row = rows[0];
  if (row?.passwordHash) return verifyAdminPassword(password, row.passwordHash);
  const bootstrapPassword = configuredBootstrapPassword();
  if (password !== bootstrapPassword) return false;
  const passwordHash = await hashAdminPassword(password);
  if (row) {
    await db.query("UPDATE users SET passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [passwordHash, row.id]);
  } else {
    await db.query(
      "INSERT INTO users (openId, name, email, loginMethod, role, passwordHash, lastSignedIn) VALUES (?, ?, ?, ?, 'admin', ?, CURRENT_TIMESTAMP)",
      [openId, "\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A (Admin)", "admin@milo.internal", "admin_password", passwordHash]
    );
  }
  return true;
}
async function changeAdminPassword(input) {
  const expectedUsername = configuredUsername();
  if (input.username !== expectedUsername) throw new Error("\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E19\u0E35\u0E49\u0E44\u0E14\u0E49");
  if (input.newPassword.length < 10) throw new Error("\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E43\u0E2B\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E35\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E19\u0E49\u0E2D\u0E22 10 \u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23");
  if (input.currentPassword === input.newPassword) throw new Error("\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E43\u0E2B\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E41\u0E15\u0E01\u0E15\u0E48\u0E32\u0E07\u0E08\u0E32\u0E01\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E40\u0E14\u0E34\u0E21");
  const db = getPool();
  await ensurePasswordColumn(db);
  const openId = adminOpenId(expectedUsername);
  const [rows] = await db.query("SELECT id, passwordHash FROM users WHERE openId = ? AND role = 'admin' LIMIT 1", [openId]);
  const row = rows[0];
  if (!row) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A");
  const validCurrent = row.passwordHash ? await verifyAdminPassword(input.currentPassword, row.passwordHash) : input.currentPassword === configuredBootstrapPassword();
  if (!validCurrent) throw new Error("\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E40\u0E14\u0E34\u0E21\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07");
  const passwordHash = await hashAdminPassword(input.newPassword);
  await db.query("UPDATE users SET passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [passwordHash, row.id]);
  return { userId: row.id };
}

// server/routers.ts
async function requireLinkedLineUser(dashboardUserId) {
  const lineUserId = await getLinkedLineUser(dashboardUserId);
  if (!lineUserId) throw new Error("\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E1A\u0E31\u0E0D\u0E0A\u0E35 LINE \u0E01\u0E31\u0E1A\u0E44\u0E21\u0E42\u0E25");
  return lineUserId;
}
async function requireFinanceAccountScope(dashboardUserId, financeAccountId) {
  const lineUserId = await requireLinkedLineUser(dashboardUserId);
  const access = financeAccountId === void 0 ? { account: await getOrCreatePersonalFinanceAccount(lineUserId), membership: { role: "owner" } } : await getFinanceAccountAccess(financeAccountId, lineUserId);
  if (!access) throw new Error("\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49");
  return { lineUserId, financeAccountId: access.account.id, account: access.account, role: access.membership.role };
}
function requireFinancePermission(allowed, message) {
  if (!allowed) throw new Error(message);
}
function requireAdminRole(role) {
  if (role !== "admin") throw new Error("\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E2A\u0E48\u0E27\u0E19\u0E19\u0E35\u0E49\u0E44\u0E14\u0E49");
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
    adminLogin: publicProcedure.input(z2.object({ username: z2.string().trim().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E23\u0E2D\u0E01\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49 (Username)"), password: z2.string().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E23\u0E2D\u0E01\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19 (Password)") })).mutation(async ({ ctx, input }) => {
      const username = input.username.trim();
      const valid = await authenticateAdminPassword(username, input.password);
      if (!valid) throw new Error("\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07");
      const safeOpenId = `admin_${username}`;
      const name = "\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A (Admin)";
      try {
        await upsertUser({ openId: safeOpenId, name, email: "admin@milo.internal", role: "admin", loginMethod: "admin_password", lastSignedIn: /* @__PURE__ */ new Date() });
      } catch (dbErr) {
        console.warn("[AdminLogin] DB user upsert skipped/warning:", dbErr);
      }
      const sessionToken = await sdk.createSessionToken(safeOpenId, { name, expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true, user: { openId: safeOpenId, name, role: "admin" } };
    })
  }),
  milo: router({
    linkLineAccount: protectedProcedure.input(z2.object({ lineUserId: z2.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID \u0E15\u0E49\u0E2D\u0E07\u0E02\u0E36\u0E49\u0E19\u0E15\u0E49\u0E19\u0E14\u0E49\u0E27\u0E22 U \u0E41\u0E25\u0E30\u0E15\u0E32\u0E21\u0E14\u0E49\u0E27\u0E22\u0E2D\u0E31\u0E01\u0E02\u0E23\u0E30 32 \u0E15\u0E31\u0E27") })).mutation(async ({ ctx, input }) => {
      await linkLineUser(ctx.user.id, input.lineUserId.trim());
      await writeAuditLog({ action: "line_account.link", entityType: "line_account_link", dashboardUserId: ctx.user.id, actorLineUserId: input.lineUserId.trim(), details: { lineUserId: input.lineUserId.trim() } });
      return { success: true };
    }),
    connection: protectedProcedure.query(async ({ ctx }) => ({ lineUserId: await getLinkedLineUser(ctx.user.id) ?? null })),
    financeAccounts: router({
      list: protectedProcedure.query(async ({ ctx }) => listFinanceAccounts(await requireLinkedLineUser(ctx.user.id))),
      members: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive() })).query(async ({ ctx, input }) => {
        await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        return listFinanceAccountMembers(input.financeAccountId);
      }),
      createGroup: protectedProcedure.input(z2.object({ lineChatId: z2.string().trim().min(1).max(128), name: z2.string().trim().min(1).max(120) })).mutation(async ({ ctx, input }) => {
        const lineUserId = await requireLinkedLineUser(ctx.user.id);
        return { id: await createGroupFinanceAccount({ ownerLineUserId: lineUserId, lineChatId: input.lineChatId, name: input.name }) };
      }),
      upsertMember: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive(), lineUserId: z2.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID \u0E15\u0E49\u0E2D\u0E07\u0E02\u0E36\u0E49\u0E19\u0E15\u0E49\u0E19\u0E14\u0E49\u0E27\u0E22 U \u0E41\u0E25\u0E30\u0E15\u0E32\u0E21\u0E14\u0E49\u0E27\u0E22\u0E2D\u0E31\u0E01\u0E02\u0E23\u0E30 32 \u0E15\u0E31\u0E27"), role: z2.enum(["manager", "contributor", "viewer"]) })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(canManageFinanceAccountMembers(scope.role), "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E08\u0E49\u0E32\u0E02\u0E2D\u0E07\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E44\u0E14\u0E49");
        if (!await isEligibleGroupFinanceAccountMember(input.financeAccountId, input.lineUserId)) throw new Error("\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E19\u0E35\u0E49\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E01\u0E32\u0E23\u0E40\u0E1B\u0E47\u0E19\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E43\u0E19\u0E01\u0E25\u0E38\u0E48\u0E21 LINE \u0E19\u0E35\u0E49");
        await upsertFinanceAccountMember(input);
        await writeAuditLog({ action: "finance_account.member.upsert", entityType: "finance_account_member", entityId: input.financeAccountId, dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? void 0, details: { memberLineUserId: input.lineUserId, role: input.role } });
        return { success: true };
      }),
      removeMember: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive(), lineUserId: z2.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID \u0E15\u0E49\u0E2D\u0E07\u0E02\u0E36\u0E49\u0E19\u0E15\u0E49\u0E19\u0E14\u0E49\u0E27\u0E22 U \u0E41\u0E25\u0E30\u0E15\u0E32\u0E21\u0E14\u0E49\u0E27\u0E22\u0E2D\u0E31\u0E01\u0E02\u0E23\u0E30 32 \u0E15\u0E31\u0E27") })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(canManageFinanceAccountMembers(scope.role), "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E08\u0E49\u0E32\u0E02\u0E2D\u0E07\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E44\u0E14\u0E49");
        const removed = await removeFinanceAccountMember(input.financeAccountId, input.lineUserId);
        if (!removed) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E17\u0E35\u0E48\u0E25\u0E1A\u0E44\u0E14\u0E49 \u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E25\u0E1A\u0E40\u0E08\u0E49\u0E32\u0E02\u0E2D\u0E07\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35");
        await writeAuditLog({ action: "finance_account.member.remove", entityType: "finance_account_member", entityId: input.financeAccountId, dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? void 0, details: { memberLineUserId: input.lineUserId } });
        return { success: true };
      })
    }),
    overview: adminProcedure.query(async ({ ctx }) => {
      const lineUserId = await getLinkedLineUser(ctx.user.id);
      if (!lineUserId) return { lineUserId: null, reminders: [], todos: [], notes: [], vault: [], groups: [], budgets: [], finance: { income: 0, expense: 0, balance: 0, categories: {} }, financeAnalytics: { daily: [], transactionCount: 0, sevenDayIncome: 0, sevenDayExpense: 0 } };
      const personalAccount = await getOrCreatePersonalFinanceAccount(lineUserId);
      const [reminders2, todos, notes2, vault, groups, budgets2, finance, financeAnalytics2, financeAccounts2] = await Promise.all([listReminders(lineUserId), listTodos(lineUserId), listNotes(lineUserId), searchVault(lineUserId), listLineGroups(lineUserId), listBudgets(lineUserId, void 0, personalAccount.id), financeSummary(lineUserId, personalAccount.id), financeAnalytics(lineUserId, personalAccount.id), listFinanceAccounts(lineUserId)]);
      return { lineUserId, reminders: reminders2, todos, notes: notes2, vault, groups, budgets: budgets2, finance, financeAnalytics: financeAnalytics2, financeAccounts: financeAccounts2, personalFinanceAccountId: personalAccount.id };
    }),
    reminders: router({
      list: protectedProcedure.query(async ({ ctx }) => listReminders(await requireLinkedLineUser(ctx.user.id))),
      create: protectedProcedure.input(z2.object({ title: z2.string().min(1).max(255), dueAt: z2.coerce.date(), recurrenceType: z2.enum(["once", "minute", "day", "week", "month"]).default("once"), recurrenceInterval: z2.number().int().min(1).default(1) })).mutation(async ({ ctx, input }) => {
        const lineUserId = await requireLinkedLineUser(ctx.user.id);
        return { id: await createReminder({ lineChatId: lineUserId, createdByLineUserId: lineUserId, title: input.title, dueAt: input.dueAt, nextRunAt: input.dueAt, recurrenceType: input.recurrenceType, recurrenceInterval: input.recurrenceInterval }) };
      }),
      delete: protectedProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await deleteReminder(input.id, await requireLinkedLineUser(ctx.user.id));
        return { success: true };
      })
    }),
    vault: router({ search: protectedProcedure.input(z2.object({ query: z2.string().max(255).default("") })).query(async ({ ctx, input }) => searchVault(await requireLinkedLineUser(ctx.user.id), input.query)), updateMetadata: protectedProcedure.input(z2.object({ id: z2.number().int().positive(), tagsText: z2.string().max(500).nullable().optional(), sourceUrl: z2.string().url().max(2e3).nullable().optional() })).mutation(async ({ ctx, input }) => {
      await updateVaultMetadata(input.id, await requireLinkedLineUser(ctx.user.id), { tagsText: input.tagsText, sourceUrl: input.sourceUrl });
      return { success: true };
    }) }),
    todos: router({ list: protectedProcedure.query(async ({ ctx }) => listTodos(await requireLinkedLineUser(ctx.user.id))), complete: protectedProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await completeTodo(input.id, await requireLinkedLineUser(ctx.user.id));
      return { success: true };
    }) }),
    finance: router({
      summary: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        return financeSummary(scope.lineUserId, scope.financeAccountId);
      }),
      balanceSnapshot: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        return getBalanceSnapshot(scope.lineUserId, scope.financeAccountId);
      }),
      analytics: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        return financeAnalytics(scope.lineUserId, scope.financeAccountId);
      }),
      budgets: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive().optional(), monthKey: z2.string().regex(/^\d{4}-\d{2}$/).optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        return listBudgets(scope.lineUserId, input?.monthKey, scope.financeAccountId);
      }),
      openingBalance: protectedProcedure.input(z2.object({ amount: z2.number().min(0), effectiveAt: z2.coerce.date().optional(), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(canManageFinanceSettings(scope.role), "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E22\u0E2D\u0E14\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
        await upsertOpeningBalance(scope.lineUserId, input.amount, input.effectiveAt, scope.financeAccountId);
        await writeAuditLog({ action: "finance_opening_balance.set", entityType: "finance_opening_balance", dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? void 0, details: { financeAccountId: scope.financeAccountId, amount: input.amount, effectiveAt: input.effectiveAt?.toISOString() ?? null } });
        return { success: true };
      }),
      recurring: router({
        list: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
          return listRecurringTransactions(scope.lineUserId, scope.financeAccountId);
        }),
        create: protectedProcedure.input(z2.object({ transactionType: z2.enum(["income", "expense"]), amount: z2.number().positive(), category: z2.string().trim().min(1).max(100), note: z2.string().trim().max(1e3).optional(), recurrenceType: z2.enum(["day", "week", "month"]), recurrenceInterval: z2.number().int().min(1).max(365).default(1), recurrenceWeekday: z2.number().int().min(0).max(6).optional(), recurrenceDayOfMonth: z2.number().int().min(1).max(28).optional(), nextRunAt: z2.coerce.date(), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
          requireFinancePermission(canManageFinanceSettings(scope.role), "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
          const id = await createRecurringTransaction({ ...input, financeAccountId: scope.financeAccountId, lineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? scope.lineUserId });
          await writeAuditLog({ action: "recurring_transaction.create", entityType: "recurring_transaction", entityId: id, dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? scope.lineUserId, details: { financeAccountId: scope.financeAccountId, transactionType: input.transactionType, category: input.category, amount: input.amount, recurrenceType: input.recurrenceType } });
          return { id };
        }),
        updateStatus: protectedProcedure.input(z2.object({ id: z2.number().int().positive(), status: z2.enum(["active", "paused", "cancelled"]), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
          requireFinancePermission(canManageFinanceSettings(scope.role), "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E1B\u0E23\u0E31\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
          const updated = await updateRecurringTransactionStatus(input.id, scope.lineUserId, input.status, scope.financeAccountId);
          if (!updated) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E1B\u0E23\u0E31\u0E1A\u0E2A\u0E16\u0E32\u0E19\u0E30");
          await writeAuditLog({ action: "recurring_transaction.status.update", entityType: "recurring_transaction", entityId: input.id, dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? scope.lineUserId, details: { financeAccountId: scope.financeAccountId, status: input.status } });
          return { success: true };
        })
      }),
      report: protectedProcedure.input(z2.object({ period: z2.enum(["day", "week", "month", "year"]), reference: z2.coerce.date().optional(), financeAccountId: z2.number().int().positive().optional() })).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        return financeReport(scope.lineUserId, input.period, input.reference, scope.financeAccountId);
      }),
      reportRange: protectedProcedure.input(z2.object({ start: z2.coerce.date(), end: z2.coerce.date(), financeAccountId: z2.number().int().positive().optional() })).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        return financeReportRange(scope.lineUserId, input.start, input.end, scope.financeAccountId);
      }),
      aiSummary: protectedProcedure.input(z2.object({ period: z2.enum(["day", "week", "month", "year"]).default("month"), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        const report = await financeReport(scope.lineUserId, input.period, /* @__PURE__ */ new Date(), scope.financeAccountId);
        return generateFinancialInsight(report);
      }),
      transactions: protectedProcedure.input(z2.object({ start: z2.coerce.date().optional(), end: z2.coerce.date().optional(), financeAccountId: z2.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        return listTransactions(scope.lineUserId, input?.start, input?.end, false, scope.financeAccountId);
      }),
      attachments: protectedProcedure.input(z2.object({ transactionIds: z2.array(z2.number().int().positive()).min(1).max(20), financeAccountId: z2.number().int().positive().optional() })).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        return listTransactionAttachmentsForFinanceAccount(input.transactionIds, scope.financeAccountId);
      }),
      create: protectedProcedure.input(z2.object({ transactionType: z2.enum(["income", "expense"]), amount: z2.number().positive(), category: z2.string().trim().min(1).max(100), note: z2.string().trim().max(2e3).optional(), occurredAt: z2.coerce.date().optional(), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(canCreateFinanceTransaction(scope.role), "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E1C\u0E39\u0E49\u0E14\u0E39 \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
        return { id: await createTransaction({ lineChatId: scope.account.lineChatId ?? scope.lineUserId, lineUserId: scope.lineUserId, ...input, financeAccountId: scope.financeAccountId, source: "dashboard" }) };
      }),
      search: protectedProcedure.input(z2.object({ query: z2.string().trim().max(255), limit: z2.number().int().min(1).max(50).default(10), financeAccountId: z2.number().int().positive().optional() })).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        return searchTransactions(scope.lineUserId, input.query, input.limit, scope.financeAccountId);
      }),
      update: protectedProcedure.input(z2.object({ id: z2.number().int().positive(), transactionType: z2.enum(["income", "expense"]).optional(), amount: z2.number().positive().optional(), category: z2.string().trim().min(1).max(100).optional(), note: z2.string().trim().max(2e3).nullable().optional(), occurredAt: z2.coerce.date().optional(), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(canManageFinanceTransactions(scope.role), "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E41\u0E01\u0E49\u0E44\u0E02\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
        const updated = await updateTransaction({ ...input, lineUserId: scope.lineUserId, financeAccountId: scope.financeAccountId, actorDashboardUserId: ctx.user.id });
        if (!updated) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E41\u0E01\u0E49\u0E44\u0E02 \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E16\u0E39\u0E01\u0E25\u0E1A\u0E41\u0E25\u0E49\u0E27");
        return { success: true };
      }),
      delete: protectedProcedure.input(z2.object({ id: z2.number().int().positive(), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(canManageFinanceTransactions(scope.role), "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E25\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
        const deleted = await deleteTransaction({ ...input, lineUserId: scope.lineUserId, financeAccountId: scope.financeAccountId, actorDashboardUserId: ctx.user.id });
        if (!deleted) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E25\u0E1A \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E16\u0E39\u0E01\u0E25\u0E1A\u0E41\u0E25\u0E49\u0E27");
        return { success: true };
      }),
      budget: protectedProcedure.input(z2.object({ category: z2.string().min(1).max(100), amount: z2.number().positive(), monthKey: z2.string().regex(/^\d{4}-\d{2}$/), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(canManageFinanceSettings(scope.role), "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
        await upsertBudget(scope.lineUserId, input.category, input.amount, input.monthKey, scope.financeAccountId);
        return { success: true };
      }),
      categories: router({
        list: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
          return listTransactionCategories(scope.lineUserId, scope.financeAccountId);
        }),
        create: protectedProcedure.input(z2.object({ name: z2.string().trim().min(1).max(100), transactionType: z2.enum(["income", "expense"]), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
          requireFinancePermission(canManageFinanceSettings(scope.role), "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E2B\u0E21\u0E27\u0E14\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
          await addExpenseCategory(scope.lineUserId, input.name, input.transactionType, scope.financeAccountId);
          await writeAuditLog({ action: "finance_category.create", entityType: "expense_category", dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? void 0, details: { financeAccountId: scope.financeAccountId, name: input.name, transactionType: input.transactionType } });
          return { success: true };
        }),
        remove: protectedProcedure.input(z2.object({ name: z2.string().trim().min(1).max(100), transactionType: z2.enum(["income", "expense"]), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
          requireFinancePermission(canManageFinanceSettings(scope.role), "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E08\u0E49\u0E32\u0E02\u0E2D\u0E07\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E2B\u0E21\u0E27\u0E14\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
          const removed = await removeExpenseCategory(scope.lineUserId, input.name, input.transactionType, scope.financeAccountId);
          if (!removed) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2B\u0E21\u0E27\u0E14\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E25\u0E1A");
          await writeAuditLog({ action: "finance_category.delete", entityType: "expense_category", dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? void 0, details: { financeAccountId: scope.financeAccountId, name: input.name, transactionType: input.transactionType } });
          return { success: true };
        })
      })
    }),
    admin: router({ auditLogs: protectedProcedure.input(z2.object({ limit: z2.number().int().min(1).max(250).default(100) }).optional()).query(async ({ ctx, input }) => {
      requireAdminRole(ctx.user.role);
      return listAuditLogs(input?.limit ?? 100);
    }), users: protectedProcedure.query(async ({ ctx }) => {
      requireAdminRole(ctx.user.role);
      return listDashboardUsers();
    }), updateUserRole: protectedProcedure.input(z2.object({ id: z2.number().int().positive(), role: z2.enum(["viewer", "user", "manager", "admin"]) })).mutation(async ({ ctx, input }) => {
      requireAdminRole(ctx.user.role);
      await updateDashboardUserRole(input.id, input.role, ctx.user.id);
      return { success: true };
    }) }),
    automation: router({
      runDueNow: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") throw new Error("\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E48\u0E07\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25 reminder \u0E44\u0E14\u0E49");
        return deliverDueReminders({ runner: "manual" });
      }),
      setupReminderDelivery: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") throw new Error("\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E15\u0E31\u0E49\u0E07\u0E07\u0E32\u0E19\u0E2A\u0E48\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E44\u0E14\u0E49");
        if (!ENV.isProduction) throw new Error("\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1C\u0E22\u0E41\u0E1E\u0E23\u0E48\u0E40\u0E27\u0E47\u0E1A\u0E44\u0E0B\u0E15\u0E4C\u0E01\u0E48\u0E2D\u0E19 \u0E08\u0E36\u0E07\u0E08\u0E30\u0E15\u0E31\u0E49\u0E07\u0E07\u0E32\u0E19\u0E2A\u0E48\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E44\u0E14\u0E49");
        const key = "reminder-delivery-primary";
        const taskUid = "external-cron-reminders";
        const current = await getAutomationSetting(key);
        await saveAutomationSetting({ settingKey: key, scheduleCronTaskUid: taskUid, isEnabled: true });
        console.info("[Milo Scheduler] External Cron configured", { taskUid, wasEnabled: Boolean(current?.isEnabled) });
        return { taskUid, status: current?.isEnabled ? "already-active" : "configured", nextExecutionAt: null };
      })
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/milo/routes.ts
import express from "express";

// server/_core/voiceTranscription.ts
async function transcribeAudio(options) {
  try {
    if (!ENV.forgeApiUrl) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_URL is not set"
      };
    }
    if (!ENV.forgeApiKey) {
      return {
        error: "Voice transcription service authentication is missing",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_KEY is not set"
      };
    }
    let audioBuffer;
    let mimeType;
    try {
      const response2 = await fetch(options.audioUrl);
      if (!response2.ok) {
        return {
          error: "Failed to download audio file",
          code: "INVALID_FORMAT",
          details: `HTTP ${response2.status}: ${response2.statusText}`
        };
      }
      audioBuffer = Buffer.from(await response2.arrayBuffer());
      mimeType = response2.headers.get("content-type") || "audio/mpeg";
      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 16) {
        return {
          error: "Audio file exceeds maximum size limit",
          code: "FILE_TOO_LARGE",
          details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`
        };
      }
    } catch (error) {
      return {
        error: "Failed to fetch audio file",
        code: "SERVICE_ERROR",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
    const formData = new FormData();
    const filename = `audio.${getFileExtension(mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", audioBlob, filename);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    const prompt = options.prompt || (options.language ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}` : "Transcribe the user's voice to text");
    formData.append("prompt", prompt);
    const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
    const fullUrl = new URL(
      "v1/audio/transcriptions",
      baseUrl
    ).toString();
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "Accept-Encoding": "identity"
      },
      body: formData
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`
      };
    }
    const whisperResponse = await response.json();
    if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Transcription service returned an invalid response format"
      };
    }
    return whisperResponse;
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred"
    };
  }
}
function getFileExtension(mimeType) {
  const mimeToExt = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a"
  };
  return mimeToExt[mimeType] || "audio";
}
function getLanguageName(langCode) {
  const langMap = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
    "hi": "Hindi",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "sv": "Swedish",
    "da": "Danish",
    "no": "Norwegian",
    "fi": "Finnish"
  };
  return langMap[langCode] || langCode;
}

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}
async function storageGetSignedUrl(relKey) {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = await resp.json();
  return url;
}

// server/milo/imageAnalysis.ts
var schema2 = {
  type: "object",
  properties: {
    summary: { type: "string" },
    confidence: { type: "number" },
    proposals: { type: "array", items: { type: "object", properties: {
      kind: { type: "string", enum: ["reminder", "expense", "unknown"] },
      documentType: { type: "string", enum: ["appointment", "receipt", "bank_slip", "unknown"] },
      title: { type: "string" },
      merchant: { type: "string" },
      dateText: { type: "string" },
      timeText: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string" },
      category: { type: "string" },
      paymentMethod: { type: "string" },
      receiptNumber: { type: "string" },
      lineItems: { type: "array", items: { type: "string" } },
      note: { type: "string" }
    }, required: ["kind", "documentType", "title", "merchant", "dateText", "timeText", "amount", "currency", "category", "paymentMethod", "receiptNumber", "lineItems", "note"], additionalProperties: false } }
  },
  required: ["summary", "confidence", "proposals"],
  additionalProperties: false
};
async function analyzeImage(dataUrl) {
  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    messages: [
      { role: "system", content: "\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D\u0E44\u0E21\u0E42\u0E25 \u0E1C\u0E39\u0E49\u0E0A\u0E48\u0E27\u0E22\u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22 \u0E2D\u0E48\u0E32\u0E19\u0E20\u0E32\u0E1E\u0E43\u0E1A\u0E19\u0E31\u0E14 \u0E15\u0E32\u0E23\u0E32\u0E07 \u0E2A\u0E25\u0E34\u0E1B\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19 \u0E41\u0E25\u0E30\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E23\u0E30\u0E21\u0E31\u0E14\u0E23\u0E30\u0E27\u0E31\u0E07 \u0E04\u0E37\u0E19 JSON \u0E15\u0E32\u0E21 schema \u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19 \u0E2B\u0E49\u0E32\u0E21\u0E40\u0E14\u0E32\u0E2B\u0E23\u0E37\u0E2D\u0E41\u0E15\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21/\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E2D\u0E48\u0E32\u0E19\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E2A\u0E25\u0E34\u0E1B\u0E43\u0E2B\u0E49\u0E43\u0E0A\u0E49\u0E22\u0E2D\u0E14\u0E42\u0E2D\u0E19\u0E08\u0E23\u0E34\u0E07 \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E49\u0E22\u0E2D\u0E14\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E43\u0E2B\u0E49\u0E43\u0E0A\u0E49\u0E22\u0E2D\u0E14\u0E23\u0E27\u0E21\u0E2A\u0E38\u0E17\u0E18\u0E34\u0E17\u0E35\u0E48\u0E0A\u0E33\u0E23\u0E30\u0E41\u0E25\u0E49\u0E27 \u0E2B\u0E32\u0E01\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E2D\u0E48\u0E32\u0E19\u0E44\u0E14\u0E49\u0E41\u0E19\u0E48\u0E0A\u0E31\u0E14\u0E43\u0E2B\u0E49\u0E2A\u0E48\u0E07 dateText \u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A YYYY-MM-DD \u0E21\u0E34\u0E09\u0E30\u0E19\u0E31\u0E49\u0E19\u0E40\u0E1B\u0E47\u0E19\u0E2A\u0E15\u0E23\u0E34\u0E07\u0E27\u0E48\u0E32\u0E07 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u0E43\u0E2B\u0E49\u0E41\u0E22\u0E01 merchant, paymentMethod, receiptNumber, \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E33\u0E04\u0E31\u0E0D \u0E41\u0E25\u0E30\u0E40\u0E25\u0E37\u0E2D\u0E01 category \u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22\u0E08\u0E32\u0E01 \u0E2D\u0E32\u0E2B\u0E32\u0E23, \u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07, \u0E04\u0E48\u0E32\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E39\u0E1B\u0E42\u0E20\u0E04, \u0E2A\u0E38\u0E02\u0E20\u0E32\u0E1E, \u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32, \u0E1A\u0E31\u0E19\u0E40\u0E17\u0E34\u0E07, \u0E0A\u0E49\u0E2D\u0E1B\u0E1B\u0E34\u0E49\u0E07, \u0E17\u0E48\u0E2D\u0E07\u0E40\u0E17\u0E35\u0E48\u0E22\u0E27, \u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B \u0E2B\u0E32\u0E01\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E14\u0E49\u0E43\u0E2B\u0E49\u0E43\u0E0A\u0E49 kind=unknown \u0E41\u0E25\u0E30 amount=0" },
      { role: "user", content: [{ type: "text", text: "\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E20\u0E32\u0E1E\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E2B\u0E32\u0E43\u0E1A\u0E19\u0E31\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u0E08\u0E32\u0E01\u0E2A\u0E25\u0E34\u0E1B/\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08 \u0E42\u0E14\u0E22\u0E40\u0E2A\u0E19\u0E2D\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E2B\u0E49\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E48\u0E2D\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19" }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] }
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_image_analysis", strict: true, schema: schema2 } }
  });
  const content = response.choices[0]?.message.content;
  if (!content || typeof content !== "string") throw new Error("Image model did not return JSON");
  return JSON.parse(content);
}

// server/milo/financeCategories.ts
var STANDARD_EXPENSE_CATEGORIES = [
  "\u0E2D\u0E32\u0E2B\u0E32\u0E23",
  "\u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07",
  "\u0E04\u0E48\u0E32\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E39\u0E1B\u0E42\u0E20\u0E04",
  "\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E2D\u0E32\u0E28\u0E31\u0E22",
  "\u0E2A\u0E38\u0E02\u0E20\u0E32\u0E1E",
  "\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32",
  "\u0E1A\u0E31\u0E19\u0E40\u0E17\u0E34\u0E07",
  "\u0E0A\u0E49\u0E2D\u0E1B\u0E1B\u0E34\u0E49\u0E07",
  "\u0E17\u0E48\u0E2D\u0E07\u0E40\u0E17\u0E35\u0E48\u0E22\u0E27",
  "\u0E1B\u0E23\u0E30\u0E01\u0E31\u0E19",
  "\u0E2B\u0E19\u0E35\u0E49\u0E2A\u0E34\u0E19",
  "\u0E18\u0E38\u0E23\u0E01\u0E34\u0E08",
  "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B"
];
var STANDARD_INCOME_CATEGORIES = [
  "\u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19",
  "\u0E23\u0E32\u0E22\u0E44\u0E14\u0E49\u0E08\u0E32\u0E01\u0E07\u0E32\u0E19",
  "\u0E02\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32/\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23",
  "\u0E07\u0E32\u0E19\u0E2D\u0E34\u0E2A\u0E23\u0E30",
  "\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22/\u0E40\u0E07\u0E34\u0E19\u0E1B\u0E31\u0E19\u0E1C\u0E25",
  "\u0E40\u0E07\u0E34\u0E19\u0E04\u0E37\u0E19",
  "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E2D\u0E37\u0E48\u0E19 \u0E46"
];
function suggestStandardCategory(transactionType, note) {
  const value = note.toLowerCase();
  if (transactionType === "income") {
    if (/เงินเดือน|โบนัส/.test(value)) return "\u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19";
    if (/ขาย|ยอดขาย|ลูกค้า/.test(value)) return "\u0E02\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32/\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23";
    if (/ฟรีแลนซ์|ค่าจ้าง|งานจ้าง/.test(value)) return "\u0E07\u0E32\u0E19\u0E2D\u0E34\u0E2A\u0E23\u0E30";
    if (/ดอกเบี้ย|ปันผล/.test(value)) return "\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22/\u0E40\u0E07\u0E34\u0E19\u0E1B\u0E31\u0E19\u0E1C\u0E25";
    if (/คืนเงิน|refund/.test(value)) return "\u0E40\u0E07\u0E34\u0E19\u0E04\u0E37\u0E19";
    return "\u0E23\u0E32\u0E22\u0E44\u0E14\u0E49\u0E08\u0E32\u0E01\u0E07\u0E32\u0E19";
  }
  if (/กาแฟ|อาหาร|ข้าว|กิน|ร้านอาหาร/.test(value)) return "\u0E2D\u0E32\u0E2B\u0E32\u0E23";
  if (/รถ|grab|bts|mrt|แท็กซี่|น้ำมัน/.test(value)) return "\u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07";
  if (/ค่าไฟ|ค่าน้ำ|ค่าเน็ต|อินเทอร์เน็ต|โทรศัพท์/.test(value)) return "\u0E04\u0E48\u0E32\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E39\u0E1B\u0E42\u0E20\u0E04";
  if (/เช่า|คอนโด|บ้าน|ห้อง|ที่พัก/.test(value)) return "\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E2D\u0E32\u0E28\u0E31\u0E22";
  if (/ยา|หมอ|โรงพยาบาล|ฟิตเนส/.test(value)) return "\u0E2A\u0E38\u0E02\u0E20\u0E32\u0E1E";
  if (/หนังสือ|คอร์ส|เรียน|ค่าเทอม/.test(value)) return "\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32";
  if (/หนัง|เกม|คอนเสิร์ต|netflix/.test(value)) return "\u0E1A\u0E31\u0E19\u0E40\u0E17\u0E34\u0E07";
  if (/ซื้อ|ช้อป|เสื้อ|ของใช้/.test(value)) return "\u0E0A\u0E49\u0E2D\u0E1B\u0E1B\u0E34\u0E49\u0E07";
  if (/โรงแรม|ตั๋วเครื่องบิน|ทริป/.test(value)) return "\u0E17\u0E48\u0E2D\u0E07\u0E40\u0E17\u0E35\u0E48\u0E22\u0E27";
  if (/ประกัน/.test(value)) return "\u0E1B\u0E23\u0E30\u0E01\u0E31\u0E19";
  if (/หนี้|บัตรเครดิต|ผ่อน/.test(value)) return "\u0E2B\u0E19\u0E35\u0E49\u0E2A\u0E34\u0E19";
  return "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B";
}

// server/milo/commandParser.ts
var BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1e3;
function titleWithoutSchedule(text2) {
  return text2.replace(/(?:ทุก\s*\d+\s*นาที|ทุกวัน|ทุกสัปดาห์(?:วัน)?(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?|ทุกเดือน(?:วันที่)?\s*\d+|พรุ่งนี้|วันนี้|วันที่\s*\d+\/\d+(?:\/\d+)?|\d{4}-\d{1,2}-\d{1,2}|(?:เวลา\s*)?\d{1,2}(?::|\.)?\d{0,2}\s*น?\.?)/gi, "").replace(/\s+/g, " ").trim() || "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E15\u0E37\u0E2D\u0E19";
}
function clock(text2) {
  const match = text2.match(/(?:เวลา\s*)?(\d{1,2})(?:(?::|\.)(\d{2}))?\s*(?:น\.?|โมง)?/i);
  return { hour: Math.min(Math.max(Number(match?.[1] ?? 9), 0), 23), minute: Math.min(Math.max(Number(match?.[2] ?? 0), 0), 59) };
}
function bangkokParts(date) {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}
function atBangkok(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}
function addBangkokDays(parts, days) {
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: calendar.getUTCFullYear(), month: calendar.getUTCMonth() + 1, day: calendar.getUTCDate() };
}
function reminderFrom(text2, now) {
  if (!/^(?:@?ไมโล\s*)?(?:ตั้ง)?เตือน(?:ฉัน)?\s*/i.test(text2.trim())) return void 0;
  const body = text2.trim().replace(/^(?:@?ไมโล\s*)?(?:ตั้ง)?เตือน(?:ฉัน)?\s*/i, "");
  const time = clock(body);
  const title = titleWithoutSchedule(body);
  const setTime = (date) => {
    const parts2 = bangkokParts(date);
    return atBangkok(parts2.year, parts2.month, parts2.day, time.hour, time.minute);
  };
  const minutes = body.match(/ทุก\s*(\d+)\s*นาที/i);
  if (minutes) {
    const interval = Math.max(1, Number(minutes[1]));
    const run2 = new Date(now.getTime() + interval * 6e4);
    return { title, recurrenceType: "minute", recurrenceInterval: interval, dueAt: run2, nextRunAt: run2 };
  }
  if (/ทุกวัน/i.test(body)) {
    let run2 = setTime(now);
    if (run2 <= now) {
      const next = addBangkokDays(bangkokParts(now), 1);
      run2 = atBangkok(next.year, next.month, next.day, time.hour, time.minute);
    }
    return { title, recurrenceType: "day", recurrenceInterval: 1, dueAt: run2, nextRunAt: run2 };
  }
  const weekly = body.match(/ทุกสัปดาห์(?:วัน)?(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?/i);
  if (weekly) {
    const map = { "\u0E2D\u0E32\u0E17\u0E34\u0E15\u0E22\u0E4C": 0, "\u0E08\u0E31\u0E19\u0E17\u0E23\u0E4C": 1, "\u0E2D\u0E31\u0E07\u0E04\u0E32\u0E23": 2, "\u0E1E\u0E38\u0E18": 3, "\u0E1E\u0E24\u0E2B\u0E31\u0E2A": 4, "\u0E28\u0E38\u0E01\u0E23\u0E4C": 5, "\u0E40\u0E2A\u0E32\u0E23\u0E4C": 6 };
    const weekday = map[weekly[1] ?? "\u0E08\u0E31\u0E19\u0E17\u0E23\u0E4C"];
    const parts2 = bangkokParts(now);
    const days = (weekday - parts2.weekday + 7) % 7 || 7;
    const date = addBangkokDays(parts2, days);
    const run2 = atBangkok(date.year, date.month, date.day, time.hour, time.minute);
    return { title, recurrenceType: "week", recurrenceInterval: 1, recurrenceWeekdays: String(weekday), dueAt: run2, nextRunAt: run2 };
  }
  const monthly = body.match(/ทุกเดือน(?:วันที่)?\s*(\d{1,2})?/i);
  if (monthly) {
    const parts2 = bangkokParts(now);
    const day = Math.min(Math.max(Number(monthly[1] ?? parts2.day), 1), 28);
    let run2 = atBangkok(parts2.year, parts2.month, day, time.hour, time.minute);
    if (run2 <= now) run2 = atBangkok(parts2.year, parts2.month + 1, day, time.hour, time.minute);
    return { title, recurrenceType: "month", recurrenceInterval: 1, recurrenceDayOfMonth: day, dueAt: run2, nextRunAt: run2 };
  }
  const parts = bangkokParts(now);
  let run = atBangkok(parts.year, parts.month, parts.day, time.hour, time.minute);
  if (/พรุ่งนี้/i.test(body)) {
    const tomorrow = addBangkokDays(parts, 1);
    run = atBangkok(tomorrow.year, tomorrow.month, tomorrow.day, time.hour, time.minute);
  }
  const iso = body.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const thai = body.match(/วันที่\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (iso) run = atBangkok(Number(iso[1]), Number(iso[2]), Number(iso[3]), time.hour, time.minute);
  if (thai) {
    const rawYear = thai[3] ? Number(thai[3]) : parts.year;
    const year = rawYear > 2400 ? rawYear - 543 : rawYear;
    run = atBangkok(year, Number(thai[2]), Number(thai[1]), time.hour, time.minute);
    if (!thai[3] && run <= now) run = atBangkok(year + 1, Number(thai[2]), Number(thai[1]), time.hour, time.minute);
  }
  if (!/วันนี้|พรุ่งนี้|วันที่|\d{4}-/i.test(body) && run <= now) {
    const tomorrow = addBangkokDays(parts, 1);
    run = atBangkok(tomorrow.year, tomorrow.month, tomorrow.day, time.hour, time.minute);
  }
  return { title, recurrenceType: "once", recurrenceInterval: 1, dueAt: run, nextRunAt: run };
}
function parseMiloCommand(text2, now = /* @__PURE__ */ new Date()) {
  const reminder = reminderFrom(text2, now);
  if (reminder) return { type: "reminder", data: reminder };
  const value = text2.trim().replace(/^@?ไมโล\s*/i, "");
  const money = value.match(/^(จ่าย|รายจ่าย|รับ|รายรับ)\s*(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i);
  if (money) {
    const income = /รับ|รายรับ/i.test(money[1]);
    const note2 = money[2].trim();
    const transactionType = income ? "income" : "expense";
    return { type: transactionType, amount: Number(money[3].replace(/,/g, "")), category: suggestStandardCategory(transactionType, note2), note: note2 };
  }
  const transactionSearch = value.match(/^(?:ค้นหา|หา)รายการ\s+(.+)$/i);
  if (transactionSearch) return { type: "transactionSearch", query: transactionSearch[1].trim() };
  const transactionDelete = value.match(/^ลบรายการ\s*#?(\d+)$/i);
  if (transactionDelete) return { type: "transactionDelete", id: Number(transactionDelete[1]) };
  const transactionUpdate = value.match(/^แก้รายการ\s*#?(\d+)\s*(?:เป็น|ยอด)\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i);
  if (transactionUpdate) return { type: "transactionUpdate", id: Number(transactionUpdate[1]), amount: Number(transactionUpdate[2].replace(/,/g, "")) };
  const openingBalance = value.match(/^(?:ตั้ง)?ยอด(?:เงิน)?เริ่มต้น\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i);
  if (openingBalance) return { type: "openingBalance", amount: Number(openingBalance[1].replace(/,/g, "")) };
  if (/^(?:สวัสดี(?:ไมโล|ครับ|ค่ะ)?|หวัดดี(?:ไมโล)?|hello|hi|hey)$/i.test(value)) return { type: "greeting" };
  if (/^(?:เมนูไมโล|วิธีใช้งาน|คู่มือ(?:การใช้งาน)?|คำสั่ง|ช่วย|เมนู|help|\?)$/i.test(value)) return { type: "help" };
  if (/^(?:จดบันทึก|เริ่มจดบันทึก|บันทึกรายรับรายจ่าย|บันทึกรายรับ-รายจ่าย|จด)$/i.test(value)) return { type: "recordGuide" };
  if (/^(?:หมวด\s*\/?\s*งบ|งบประมาณ|คุมงบประมาณ|ดูงบ|งบ)$/i.test(value)) return { type: "budgetOverview" };
  if (/^(?:รายการ|ประวัติ|ประวัติธุรกรรม|รายการธุรกรรม|ดูย้อนหลัง)$/i.test(value)) return { type: "transactionList" };
  if (/^ตั้งค่า$/i.test(value)) return { type: "settingGuide" };
  if (/^(?:dashboard|แดชบอร์ด|เว็บแดชบอร์ด|จัดการระบบหลังบ้าน|หลังบ้าน|แดชบอร์ดหลังบ้าน)$/i.test(value)) return { type: "dashboardGuide" };
  if (/^(?:ประเภท|หมวดหมู่|หมวดหมู่รายรับ-?จ่าย|ดูหมวดหมู่)$/i.test(value)) return { type: "categoryList" };
  if (/^(?:วิเคราะห์|สุขภาพการเงิน|วิเคราะห์การเงิน|วิเคราะห์รายจ่าย|สรุปธุรกิจ)(?:ของ)?(วันนี้|สัปดาห์นี้|เดือนนี้|ปีนี้)?$/i.test(value)) {
    const m = value.match(/(วันนี้|สัปดาห์นี้|เดือนนี้|ปีนี้)/i);
    const periods = { "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49": "day", "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49": "week", "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49": "month", "\u0E1B\u0E35\u0E19\u0E35\u0E49": "year" };
    return { type: "aiSummary", period: m ? periods[m[1]] ?? "month" : "month" };
  }
  const financeReport2 = value.match(/^สรุป(?:การเงิน|รายรับรายจ่าย|ยอด(?:ประจำเดือน)?)?(?:ของ)?(วันนี้|สัปดาห์นี้|เดือนนี้|ปีนี้)?$/i);
  if (financeReport2) {
    const periodKey = financeReport2[1] ?? "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49";
    const periods = { "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49": "day", "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49": "week", "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49": "month", "\u0E1B\u0E35\u0E19\u0E35\u0E49": "year" };
    return { type: "financeReport", period: periods[periodKey] ?? "month" };
  }
  if (/^(?:ยืนยันเสียง|บันทึกจากเสียง)$/i.test(value)) return { type: "voiceConfirm" };
  if (/^แก้ไขข้อความเสียง$/i.test(value)) return { type: "voiceEditPrompt" };
  const voiceCategory = value.match(/^เปลี่ยนหมวดเสียง\s+(.+)$/i);
  if (voiceCategory) return { type: "voiceCategoryChange", category: voiceCategory[1].trim() };
  const voiceEdit = value.match(/^แก้ไข(?:ข้อความ)?เสียง\s+(.+)$/i);
  if (voiceEdit) return { type: "voiceEdit", transcript: voiceEdit[1].trim() };
  const note = value.match(/^(โน้ต|บันทึก)\s+(.+)$/i);
  if (note) return { type: "note", title: note[2].slice(0, 80), content: note[2] };
  const todo = value.match(/^(งาน|todo|ทูดู)\s+(.+)$/i);
  if (todo) return { type: "todo", title: todo[2] };
  const vault = value.match(/^(เก็บ|บันทึกไว้)\s+(.+)$/i);
  if (vault) {
    const content = vault[2].trim();
    const sourceUrl = content.match(/https?:\/\/\S+/i)?.[0];
    const tagsText = (content.match(/#[^\s#]+/g) ?? []).join(" ") || void 0;
    return { type: "vault", title: (sourceUrl ?? content).slice(0, 80), content, itemType: sourceUrl ? "link" : "text", sourceUrl, tagsText };
  }
  const search = value.match(/^(ค้นหา|หาไฟล์|ค้น)\s+(.+)$/i);
  if (search) return { type: "search", query: search[2] };
  const mention = value.match(/^แจ้ง\s*(.+?)\s*ถึง\s*@?(.+)$/i);
  if (mention) return { type: "mention", message: mention[1].trim(), memberName: mention[2].trim() };
  const categoryAdd = value.match(/^(?:เพิ่ม|ตั้ง)หมวด(?:หมู่)?\s*(?:\s*(รายรับ|รายจ่าย))?\s*(.*)$/i);
  if (categoryAdd) {
    const transactionType = categoryAdd[1] === "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A" ? "income" : "expense";
    const name = categoryAdd[2].trim();
    return name && name.length <= 100 ? { type: "categoryAdd", name, transactionType } : { type: "invalid", message: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E0A\u0E37\u0E48\u0E2D\u0E2B\u0E21\u0E27\u0E14 \u0E40\u0E0A\u0E48\u0E19 \u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2B\u0E21\u0E27\u0E14\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 \u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07" };
  }
  const categoryRemove = value.match(/^(?:ลบ|เอาออก)หมวด(?:หมู่)?\s*(?:\s*(รายรับ|รายจ่าย))?\s*(.*)$/i);
  if (categoryRemove) {
    const transactionType = categoryRemove[1] === "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A" ? "income" : "expense";
    const name = categoryRemove[2].trim();
    return name ? { type: "categoryRemove", name, transactionType } : { type: "invalid", message: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E2B\u0E21\u0E27\u0E14\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E25\u0E1A" };
  }
  const categoryList = value.match(/^(?:ดู)?หมวด(?:หมู่)?(?:\s*(รายรับ|รายจ่าย))?$/i);
  if (categoryList) return { type: "categoryList", transactionType: categoryList[1] === "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A" ? "income" : categoryList[1] === "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" ? "expense" : void 0 };
  const budget = value.match(/^(?:ตั้ง)?งบ\s+(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i);
  if (budget) {
    const category = budget[1].trim();
    const amount = Number(budget[2].replace(/,/g, ""));
    if (!category || !Number.isFinite(amount) || amount <= 0) return { type: "invalid", message: "\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E15\u0E49\u0E2D\u0E07\u0E23\u0E30\u0E1A\u0E38\u0E2B\u0E21\u0E27\u0E14\u0E41\u0E25\u0E30\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E35\u0E48\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E1A\u0E32\u0E17" };
    return { type: "budget", category, amount };
  }
  if (/^(?:ตั้ง)?งบ(?:\s|$)/i.test(value)) return { type: "invalid", message: "\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13: \u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A \u0E2D\u0E32\u0E2B\u0E32\u0E23 5000 \u0E1A\u0E32\u0E17" };
  const imageConfirm = value.match(/^(?:ยืนยันรูป|ยืนยันภาพ|บันทึกจากรูป|ยืนยันค่าใช้จ่าย|ยืนยันสลิป|ยืนยันใบเสร็จ|บันทึกสลิป|บันทึกใบเสร็จ)(?:\s+(?:วันที่\s*)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}))?$/i);
  if (imageConfirm) return imageConfirm[1] ? { type: "imageConfirm", dateText: imageConfirm[1] } : { type: "imageConfirm" };
  if (/^(ช่วย|เมนู|help)$/i.test(value)) return { type: "help" };
  return { type: "unknown" };
}

// server/milo/recurringTransactionDelivery.ts
async function deliverDueRecurringTransactions(now = /* @__PURE__ */ new Date()) {
  const due = await listDueRecurringTransactions(now);
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const rule of due) {
    const periodKey = rule.nextRunAt.toISOString();
    const runId = await claimRecurringTransactionRun({ recurringTransactionId: rule.id, periodKey });
    if (!runId) {
      skipped += 1;
      continue;
    }
    try {
      const transactionId = await createTransaction({ lineChatId: rule.lineChatId, lineUserId: rule.lineUserId, financeAccountId: rule.financeAccountId ?? void 0, transactionType: rule.transactionType, amount: Number(rule.amount), category: rule.category, note: rule.note ?? void 0, occurredAt: rule.nextRunAt, source: "recurring" });
      const nextRunAt = nextRecurringRunAt(rule.nextRunAt, rule.recurrenceType, rule.recurrenceInterval);
      await completeRecurringTransactionRun({ runId, recurringTransactionId: rule.id, transactionId, nextRunAt });
      await writeAuditLog({ action: "recurring_transaction.created", entityType: "recurring_transaction", entityId: rule.id, actorLineUserId: rule.lineUserId, lineChatId: rule.lineChatId, details: { transactionId, periodKey } });
      created += 1;
    } catch (error) {
      await failRecurringTransactionRun(runId, error instanceof Error ? error.message : "recurring transaction failed");
      await writeAuditLog({ action: "recurring_transaction.failed", entityType: "recurring_transaction", entityId: rule.id, actorLineUserId: rule.lineUserId, lineChatId: rule.lineChatId, details: { periodKey } });
      failed += 1;
    }
  }
  return { created, skipped, failed };
}

// server/milo/financeDigest.ts
function bangkokParts2(reference) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(reference);
  const value = (name) => Number(parts.find((part) => part.type === name)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}
function bangkokMidnightUtc(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, -7));
}
function shiftBangkokDate(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
function thaiDate(date) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(date);
}
function financeDigestWindow(type, reference = /* @__PURE__ */ new Date()) {
  const today = bangkokParts2(reference);
  const todayStart = bangkokMidnightUtc(today.year, today.month, today.day);
  if (type === "daily") {
    const yesterday = shiftBangkokDate(today, -1);
    const start2 = bangkokMidnightUtc(yesterday.year, yesterday.month, yesterday.day);
    return { periodKey: dateKey(yesterday), start: start2, end: new Date(todayStart.getTime() - 1), period: "day", title: "\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E27\u0E32\u0E19\u0E19\u0E35\u0E49", subtitle: `\u0E23\u0E2D\u0E1A\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${thaiDate(start2)}` };
  }
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const mondayDistance = weekday === 0 ? 6 : weekday - 1;
  const thisMonday = shiftBangkokDate(today, -mondayDistance);
  const lastMonday = shiftBangkokDate(thisMonday, -7);
  const start = bangkokMidnightUtc(lastMonday.year, lastMonday.month, lastMonday.day);
  const end = new Date(bangkokMidnightUtc(thisMonday.year, thisMonday.month, thisMonday.day).getTime() - 1);
  return { periodKey: `${dateKey(lastMonday)}_to_${dateKey(shiftBangkokDate(thisMonday, -1))}`, start, end, period: "week", title: "\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E17\u0E35\u0E48\u0E1C\u0E48\u0E32\u0E19\u0E21\u0E32", subtitle: `${thaiDate(start)} \u2013 ${thaiDate(end)}` };
}
async function deliverFinanceDigest(input) {
  const targetLineUserId = await getOwnerLinkedLineUser();
  if (!targetLineUserId) return { skipped: "no-linked-private-line-user" };
  const personalAccount = await getOrCreatePersonalFinanceAccount(targetLineUserId);
  const window = financeDigestWindow(input.digestType, input.now);
  const deliveryId = await claimFinanceDigestDelivery({ settingKey: input.settingKey, taskUid: input.taskUid, targetLineUserId, digestType: input.digestType, periodKey: window.periodKey });
  if (!deliveryId) return { skipped: "already-delivered", periodKey: window.periodKey };
  const report = await financeReportRange(targetLineUserId, window.start, window.end, personalAccount.id);
  const card = { period: window.period, title: window.title, subtitle: window.subtitle, income: report.income, expense: report.expense, balance: report.balance, categories: report.categories };
  try {
    await pushFinanceReportCard(targetLineUserId, card);
  } catch (error) {
    try {
      await pushText(targetLineUserId, financeReportCardText(card));
    } catch (fallbackError) {
      const message = fallbackError instanceof Error ? fallbackError.message : error instanceof Error ? error.message : "LINE delivery failed";
      await finishFinanceDigestDelivery(deliveryId, "failed", message.slice(0, 1e3));
      await writeAuditLog({ action: "finance_digest.failed", entityType: "finance_digest_delivery", entityId: deliveryId, actorLineUserId: targetLineUserId, lineChatId: targetLineUserId, details: { digestType: input.digestType, periodKey: window.periodKey } });
      throw fallbackError;
    }
  }
  await finishFinanceDigestDelivery(deliveryId, "sent");
  await writeAuditLog({ action: "finance_digest.sent", entityType: "finance_digest_delivery", entityId: deliveryId, actorLineUserId: targetLineUserId, lineChatId: targetLineUserId, details: { digestType: input.digestType, periodKey: window.periodKey } });
  await saveAutomationSetting({ settingKey: input.settingKey, scheduleCronTaskUid: input.taskUid, isEnabled: true, lastRunAt: /* @__PURE__ */ new Date() });
  return { delivered: true, periodKey: window.periodKey, deliveryId };
}

// server/milo/receiptUtils.ts
var categoryRules = [
  [/อาหาร|กาแฟ|ร้านอาหาร|restaurant|cafe|food/i, "\u0E2D\u0E32\u0E2B\u0E32\u0E23"],
  [/รถ|เดินทาง|grab|taxi|bts|mrt|fuel|น้ำมัน/i, "\u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07"],
  [/ค่าไฟ|ค่าน้ำ|ค่าเน็ต|โทรศัพท์|มือถือ|utility|internet/i, "\u0E04\u0E48\u0E32\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E39\u0E1B\u0E42\u0E20\u0E04"],
  [/ยา|โรงพยาบาล|คลินิก|health/i, "\u0E2A\u0E38\u0E02\u0E20\u0E32\u0E1E"],
  [/หนังสือ|คอร์ส|เรียน|ศึกษา|education/i, "\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32"],
  [/หนัง|เกม|คอนเสิร์ต|บันเทิง|entertainment/i, "\u0E1A\u0E31\u0E19\u0E40\u0E17\u0E34\u0E07"],
  [/เสื้อ|รองเท้า|ช้อป|shopping/i, "\u0E0A\u0E49\u0E2D\u0E1B\u0E1B\u0E34\u0E49\u0E07"],
  [/โรงแรม|เที่ยว|ท่องเที่ยว|travel/i, "\u0E17\u0E48\u0E2D\u0E07\u0E40\u0E17\u0E35\u0E48\u0E22\u0E27"]
];
function normalizeExpenseCategory(value, context = "") {
  const text2 = `${value ?? ""} ${context}`.trim();
  if (!text2) return "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B";
  return categoryRules.find(([pattern]) => pattern.test(text2))?.[1] ?? (value?.trim() || "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B");
}
function parseExtractedDate(value) {
  const text2 = value?.trim();
  if (!text2) return void 0;
  const iso = text2.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const thaiNumeric = text2.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  const thaiWords = text2.match(/^\s*(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})\s*$/);
  const months = { "\u0E21.\u0E04.": 0, "\u0E01.\u0E1E.": 1, "\u0E21\u0E35.\u0E04.": 2, "\u0E40\u0E21.\u0E22.": 3, "\u0E1E.\u0E04.": 4, "\u0E21\u0E34.\u0E22.": 5, "\u0E01.\u0E04.": 6, "\u0E2A.\u0E04.": 7, "\u0E01.\u0E22.": 8, "\u0E15.\u0E04.": 9, "\u0E1E.\u0E22.": 10, "\u0E18.\u0E04.": 11 };
  let year;
  let month;
  let day;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]) - 1;
    day = Number(iso[3]);
  }
  if (thaiNumeric) {
    year = Number(thaiNumeric[3]);
    month = Number(thaiNumeric[2]) - 1;
    day = Number(thaiNumeric[1]);
  }
  if (thaiWords) {
    year = Number(thaiWords[3]);
    month = months[thaiWords[2]];
    day = Number(thaiWords[1]);
  }
  if (year === void 0 || month === void 0 || day === void 0) return void 0;
  if (year > 2400) year -= 543;
  const result = new Date(year, month, day, 12, 0, 0, 0);
  return result.getFullYear() === year && result.getMonth() === month && result.getDate() === day ? result : void 0;
}
function selectImageProposal(proposals = []) {
  return proposals.find((item) => item.kind === "expense" && Number(item.amount) > 0) ?? proposals.find((item) => item.kind === "reminder");
}
function buildExpenseNote(proposal) {
  const entries = [
    proposal.merchant ? `\u0E23\u0E49\u0E32\u0E19\u0E04\u0E49\u0E32/\u0E04\u0E39\u0E48\u0E04\u0E49\u0E32: ${proposal.merchant}` : "",
    proposal.title ? `\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23: ${proposal.title}` : "",
    proposal.paymentMethod ? `\u0E0A\u0E33\u0E23\u0E30: ${proposal.paymentMethod}` : "",
    proposal.receiptNumber ? `\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48: ${proposal.receiptNumber}` : "",
    proposal.lineItems?.length ? `\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14: ${proposal.lineItems.join(", ")}` : "",
    proposal.note?.trim()
  ].filter(Boolean);
  return entries.join(" | ").slice(0, 2e3);
}
function formatImageProposal(proposal) {
  if (proposal.kind === "expense") {
    const source = proposal.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08";
    const merchant = proposal.merchant ? ` \xB7 ${proposal.merchant}` : "";
    return `${source}${merchant}
\u0E22\u0E2D\u0E14 ${Number(proposal.amount || 0).toLocaleString("th-TH")} ${proposal.currency || "\u0E1A\u0E32\u0E17"} \xB7 \u0E2B\u0E21\u0E27\u0E14${normalizeExpenseCategory(proposal.category, `${proposal.title ?? ""} ${proposal.merchant ?? ""}`)}`;
  }
  return proposal.title || proposal.note || "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E44\u0E14\u0E49";
}

// server/milo/routes.ts
function helpText() {
  return "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35\u0E04\u0E23\u0E31\u0E1A \u0E1C\u0E21\u0E44\u0E21\u0E42\u0E25 \u0E0A\u0E48\u0E27\u0E22\u0E44\u0E14\u0E49\u0E43\u0E19\u0E41\u0E0A\u0E17\u0E40\u0E14\u0E35\u0E22\u0E27\n\u2022 \u0E40\u0E15\u0E37\u0E2D\u0E19 \u0E1B\u0E23\u0E30\u0E0A\u0E38\u0E21\u0E1E\u0E23\u0E38\u0E48\u0E07\u0E19\u0E35\u0E49 10:00\n\u2022 \u0E40\u0E15\u0E37\u0E2D\u0E19\u0E14\u0E37\u0E48\u0E21\u0E19\u0E49\u0E33\u0E17\u0E38\u0E01 30 \u0E19\u0E32\u0E17\u0E35\n\u2022 \u0E08\u0E48\u0E32\u0E22\u0E01\u0E32\u0E41\u0E1F 65 / \u0E08\u0E48\u0E32\u0E22\u0E04\u0E48\u0E32\u0E44\u0E1F 1200\n\u2022 \u0E23\u0E31\u0E1A\u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19 45000 / \u0E23\u0E31\u0E1A\u0E04\u0E48\u0E32\u0E08\u0E49\u0E32\u0E07 5000\n\u2022 \u0E2A\u0E48\u0E07\u0E2A\u0E25\u0E34\u0E1B\u0E2B\u0E23\u0E37\u0E2D\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08 \u0E41\u0E25\u0E49\u0E27\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u201D\n\u2022 \u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07 \u0E41\u0E25\u0E49\u0E27\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E2A\u0E35\u0E22\u0E07\u201D\n\u2022 \u0E04\u0E49\u0E19\u0E2B\u0E32\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u0E01\u0E32\u0E41\u0E1F / \u0E41\u0E01\u0E49\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 12 \u0E40\u0E1B\u0E47\u0E19 180 / \u0E25\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 12\n\u2022 \u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49 / \u0E2A\u0E23\u0E38\u0E1B\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49 / \u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49 / \u0E2A\u0E23\u0E38\u0E1B\u0E1B\u0E35\u0E19\u0E35\u0E49\n\u2022 \u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2B\u0E21\u0E27\u0E14 \u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07 / \u0E14\u0E39\u0E2B\u0E21\u0E27\u0E14\n\u2022 \u0E42\u0E19\u0E49\u0E15 \u0E23\u0E2B\u0E31\u0E2A Wi\u2011Fi \u0E2B\u0E49\u0E2D\u0E07\u0E1B\u0E23\u0E30\u0E0A\u0E38\u0E21\n\u2022 \u0E07\u0E32\u0E19 \u0E2A\u0E48\u0E07\u0E2A\u0E23\u0E38\u0E1B\u0E23\u0E32\u0E22\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\n\u2022 \u0E40\u0E01\u0E47\u0E1A \u0E25\u0E34\u0E07\u0E01\u0E4C\u0E2B\u0E23\u0E37\u0E2D\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E33\u0E04\u0E31\u0E0D\n\u2022 \u0E04\u0E49\u0E19\u0E2B\u0E32 \u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\n\n\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21 dashboard: \u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E44\u0E2D\u0E14\u0E35\u201D \u0E43\u0E19\u0E41\u0E0A\u0E17\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27\u0E01\u0E31\u0E1A\u0E44\u0E21\u0E42\u0E25";
}
function formatDate(date) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}
function formatFinanceReport(report) {
  const money = (amount) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const label = { day: "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", week: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49", month: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", year: "\u0E1B\u0E35\u0E19\u0E35\u0E49" };
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => `\u2022 ${name} ${money(amount)} \u0E1A\u0E32\u0E17`).join("\n");
  return `\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19${label[report.period]}
\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A ${money(report.income)} \u0E1A\u0E32\u0E17
\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 ${money(report.expense)} \u0E1A\u0E32\u0E17
\u0E01\u0E33\u0E44\u0E23/\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D ${money(report.balance)} \u0E1A\u0E32\u0E17
${categories ? `
\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E15\u0E32\u0E21\u0E2B\u0E21\u0E27\u0E14
${categories}` : "\n\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E19\u0E35\u0E49"}`;
}
function formatFinancialInsight(insight) {
  const quality = insight.dataSufficiency === "adequate" ? "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E1E\u0E35\u0E22\u0E07\u0E1E\u0E2D\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E40\u0E1A\u0E37\u0E49\u0E2D\u0E07\u0E15\u0E49\u0E19" : insight.dataSufficiency === "limited" ? "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E22\u0E31\u0E07\u0E21\u0E35\u0E44\u0E21\u0E48\u0E21\u0E32\u0E01 \u0E08\u0E36\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E2A\u0E31\u0E07\u0E40\u0E01\u0E15\u0E40\u0E1A\u0E37\u0E49\u0E2D\u0E07\u0E15\u0E49\u0E19" : "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E1E\u0E35\u0E22\u0E07\u0E1E\u0E2D\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C";
  const highlights = insight.highlights.map((item) => `\u2022 ${item}`).join("\n");
  const actions = insight.suggestedActions.map((item) => `\u2022 ${item}`).join("\n");
  return `AI \u0E2A\u0E23\u0E38\u0E1B\u0E18\u0E38\u0E23\u0E01\u0E34\u0E08
${quality}
${insight.summary}${highlights ? `

\u0E02\u0E49\u0E2D\u0E2A\u0E31\u0E07\u0E40\u0E01\u0E15
${highlights}` : ""}${actions ? `

\u0E41\u0E19\u0E27\u0E17\u0E32\u0E07\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23
${actions}` : ""}`;
}
async function buildVoiceProposal(transcript, lineUserId, financeAccountId) {
  const command = parseMiloCommand(transcript);
  if (command.type !== "expense" && command.type !== "income") return { transcript };
  let category = command.category;
  if (command.type === "expense") {
    try {
      const customCategories = (await listExpenseCategories(lineUserId, "expense", financeAccountId)).map((item) => item.name);
      const allowed = Array.from(/* @__PURE__ */ new Set([...STANDARD_EXPENSE_CATEGORIES, ...customCategories]));
      category = (await suggestExpenseCategory(command.note, allowed)).category;
    } catch {
    }
  }
  return { transcript, transactionType: command.type, amount: command.amount, category, note: command.note };
}
function proposalFromStoredTranscript(transcript, proposalJson) {
  try {
    const proposal = JSON.parse(proposalJson ?? "");
    if ((proposal.transactionType === "expense" || proposal.transactionType === "income") && Number.isFinite(proposal.amount) && proposal.amount > 0) return { ...proposal, transcript };
  } catch {
  }
  const parsed = parseMiloCommand(transcript);
  return parsed.type === "expense" || parsed.type === "income" ? { transcript, transactionType: parsed.type, amount: parsed.amount, category: parsed.category, note: parsed.note } : { transcript };
}
async function sendVoiceProposal(replyToken, proposal) {
  try {
    await replyVoiceProposal(replyToken, proposal);
  } catch (error) {
    console.error("[Milo Voice] Flex proposal failed; sending Quick Reply fallback", { error: error instanceof Error ? error.message : "unknown" });
    await replyVoiceProposalFallback(replyToken, proposal);
  }
}
async function sendPostSaveSummary(replyToken, lineUserId, lineChatId, financeAccountId, transaction) {
  const report = await financeReport(lineUserId, "day", /* @__PURE__ */ new Date(), financeAccountId);
  const summary = { transactionType: transaction.transactionType, amount: transaction.amount, category: transaction.category, dailyIncome: report.income, dailyExpense: report.expense, dailyBalance: report.balance };
  try {
    await replyPostSaveSummary(replyToken, summary);
  } catch (error) {
    console.error("[Milo Save] post-save Flex failed; sending Quick Reply fallback", { error: error instanceof Error ? error.message : "unknown" });
    try {
      await replyPostSaveSummaryFallback(replyToken, summary);
    } catch (fallbackError) {
      console.error("[Milo Save] reply fallback failed; pushing text summary", { error: fallbackError instanceof Error ? fallbackError.message : "unknown" });
      await pushText(lineChatId, postSaveSummaryText(summary));
    }
  }
}
async function sendFinanceReportCard(replyToken, lineChatId, report) {
  try {
    await replyFinanceReportCard(replyToken, report);
  } catch (error) {
    console.error("[Milo Report] Flex summary failed; sending text fallback", { error: error instanceof Error ? error.message : "unknown" });
    try {
      await replyFinanceReportCardFallback(replyToken, report);
    } catch (fallbackError) {
      console.error("[Milo Report] reply fallback failed; pushing text summary", { error: fallbackError instanceof Error ? fallbackError.message : "unknown" });
      await pushText(lineChatId, financeReportCardText(report));
    }
  }
}
async function resolveFinanceScope(lineUserId, lineChatId, scope) {
  const access = await resolveFinanceAccountForLineEvent(lineUserId, lineChatId, scope);
  if (!access) return void 0;
  return { financeAccountId: access.account.id, role: access.membership.role };
}
function financeAccessMessage(scope) {
  return scope === "user" ? "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27 \u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A" : "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E1B\u0E34\u0E14\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13 \u0E08\u0E36\u0E07\u0E44\u0E21\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E2B\u0E23\u0E37\u0E2D\u0E41\u0E2A\u0E14\u0E07\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E23\u0E48\u0E27\u0E21\u0E42\u0E14\u0E22\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34 \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E1B\u0E01\u0E1B\u0E49\u0E2D\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27 \u0E43\u0E2B\u0E49\u0E40\u0E08\u0E49\u0E32\u0E02\u0E2D\u0E07\u0E01\u0E25\u0E38\u0E48\u0E21\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E41\u0E25\u0E30\u0E1A\u0E17\u0E1A\u0E32\u0E17\u0E08\u0E32\u0E01 dashboard \u0E01\u0E48\u0E2D\u0E19\u0E04\u0E23\u0E31\u0E1A";
}
async function handleText(event, lineChatId, lineUserId, scope) {
  const text2 = event.message?.text ?? "";
  if (/^(?:ไอดี|id|user\s*id)$/i.test(text2.trim())) {
    if (event.source.type === "user") {
      if (event.replyToken) await replyText(event.replyToken, `LINE User ID \u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D
${lineUserId}

\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01\u0E23\u0E2B\u0E31\u0E2A\u0E19\u0E35\u0E49\u0E44\u0E1B\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E43\u0E19\u0E41\u0E14\u0E0A\u0E1A\u0E2D\u0E23\u0E4C\u0E14\u0E44\u0E21\u0E42\u0E25\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\u0E04\u0E23\u0E31\u0E1A`);
    } else if (event.replyToken) {
      await replyText(event.replyToken, "\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E1B\u0E47\u0E19\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E44\u0E2D\u0E14\u0E35\u201D \u0E43\u0E19\u0E41\u0E0A\u0E17\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27\u0E01\u0E31\u0E1A\u0E44\u0E21\u0E42\u0E25\u0E04\u0E23\u0E31\u0E1A");
    }
    return;
  }
  const command = parseMiloCommand(text2);
  let message = "";
  const financeCommands = /* @__PURE__ */ new Set(["expense", "income", "transactionSearch", "transactionDelete", "transactionUpdate", "openingBalance", "financeReport", "aiSummary", "budgetOverview", "transactionList", "voiceConfirm", "voiceEditPrompt", "voiceCategoryChange", "voiceEdit", "budget", "categoryAdd", "categoryRemove", "categoryList", "imageConfirm"]);
  const financeScope = financeCommands.has(command.type) ? await resolveFinanceScope(lineUserId, lineChatId, scope) : void 0;
  if (financeCommands.has(command.type) && !financeScope) {
    if (event.replyToken) await replyText(event.replyToken, financeAccessMessage(scope));
    return;
  }
  if (command.type === "reminder") {
    const id = await createReminder({ lineChatId, createdByLineUserId: lineUserId, ...command.data, sourceMessageId: event.message?.id });
    message = `\u0E15\u0E31\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19 #${id} \u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22
${command.data.title}
\u0E04\u0E23\u0E31\u0E49\u0E07\u0E16\u0E31\u0E14\u0E44\u0E1B: ${formatDate(command.data.nextRunAt)}`;
  } else if (command.type === "expense" || command.type === "income") {
    if (!canCreateFinanceTransaction(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E1C\u0E39\u0E49\u0E14\u0E39 \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    let category = command.category;
    if (command.type === "expense" && category === "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B") {
      try {
        const customCategories = (await listExpenseCategories(lineUserId, "expense", financeScope.financeAccountId)).map((item) => item.name);
        const suggestion = await suggestExpenseCategory(command.note, Array.from(/* @__PURE__ */ new Set(["\u0E2D\u0E32\u0E2B\u0E32\u0E23", "\u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07", "\u0E04\u0E48\u0E32\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E39\u0E1B\u0E42\u0E20\u0E04", "\u0E2A\u0E38\u0E02\u0E20\u0E32\u0E1E", "\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32", "\u0E1A\u0E31\u0E19\u0E40\u0E17\u0E34\u0E07", "\u0E0A\u0E49\u0E2D\u0E1B\u0E1B\u0E34\u0E49\u0E07", "\u0E17\u0E48\u0E2D\u0E07\u0E40\u0E17\u0E35\u0E48\u0E22\u0E27", "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B", ...customCategories])));
        category = suggestion.category;
      } catch {
      }
    }
    await createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope.financeAccountId, transactionType: command.type, amount: command.amount, category, note: command.note, source: "line_text", sourceMessageId: event.message?.id });
    if (event.replyToken) {
      await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope.financeAccountId, { transactionType: command.type, amount: command.amount, category });
      return;
    }
    message = `\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01${command.type === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"} ${command.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E43\u0E19\u0E2B\u0E21\u0E27\u0E14${category}\u0E41\u0E25\u0E49\u0E27`;
  } else if (command.type === "transactionSearch") {
    const results = await searchTransactions(lineUserId, command.query, 10, financeScope.financeAccountId);
    message = results.length ? `\u0E1E\u0E1A ${results.length} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23
${results.map((item) => `#${item.id} \xB7 ${item.transactionType === "expense" ? "\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E31\u0E1A"} ${Number(item.amount).toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \xB7 ${item.category}${item.note ? ` \xB7 ${item.note}` : ""}`).join("\n")}` : `\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21 \u201C${command.query}\u201D`;
  } else if (command.type === "transactionDelete") {
    if (!canManageFinanceTransactions(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E25\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const deleted = await deleteTransaction({ id: command.id, lineUserId, financeAccountId: financeScope.financeAccountId });
    message = deleted ? `\u0E25\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 #${command.id} \u0E41\u0E25\u0E49\u0E27 \u0E42\u0E14\u0E22\u0E40\u0E01\u0E47\u0E1A\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E44\u0E27\u0E49` : `\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 #${command.id} \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E16\u0E39\u0E01\u0E25\u0E1A\u0E41\u0E25\u0E49\u0E27`;
  } else if (command.type === "transactionUpdate") {
    if (!canManageFinanceTransactions(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E41\u0E01\u0E49\u0E44\u0E02\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const updated = await updateTransaction({ id: command.id, lineUserId, financeAccountId: financeScope.financeAccountId, amount: command.amount });
    message = updated ? `\u0E41\u0E01\u0E49\u0E44\u0E02\u0E22\u0E2D\u0E14\u0E02\u0E2D\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 #${command.id} \u0E40\u0E1B\u0E47\u0E19 ${command.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17\u0E41\u0E25\u0E49\u0E27` : `\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 #${command.id} \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E16\u0E39\u0E01\u0E25\u0E1A\u0E41\u0E25\u0E49\u0E27`;
  } else if (command.type === "openingBalance") {
    if (!canManageFinanceSettings(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E22\u0E2D\u0E14\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    await upsertOpeningBalance(lineUserId, command.amount, /* @__PURE__ */ new Date(), financeScope.financeAccountId);
    await writeAuditLog({ action: "finance_opening_balance.set", entityType: "finance_opening_balance", actorLineUserId: lineUserId, lineChatId, details: { amount: command.amount } });
    message = `\u0E15\u0E31\u0E49\u0E07\u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19 ${command.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17\u0E41\u0E25\u0E49\u0E27 \u0E22\u0E2D\u0E14\u0E19\u0E35\u0E49\u0E08\u0E30\u0E41\u0E2A\u0E14\u0E07\u0E41\u0E22\u0E01\u0E08\u0E32\u0E01\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E41\u0E25\u0E30\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22`;
  } else if (command.type === "financeReport") {
    const report = await financeReport(lineUserId, command.period, /* @__PURE__ */ new Date(), financeScope.financeAccountId);
    if (event.replyToken) {
      await sendFinanceReportCard(event.replyToken, lineChatId, report);
      return;
    }
    message = formatFinanceReport(report);
  } else if (command.type === "aiSummary") {
    const report = await financeReport(lineUserId, command.period, /* @__PURE__ */ new Date(), financeScope.financeAccountId);
    message = formatFinancialInsight(await generateFinancialInsight(report));
  } else if (command.type === "voiceConfirm") {
    if (!canCreateFinanceTransaction(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E1C\u0E39\u0E49\u0E14\u0E39 \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const voice = await latestProposedVoiceTranscription(lineUserId, lineChatId);
    if (!voice) {
      message = "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E17\u0E35\u0E48\u0E23\u0E2D\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19 \u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E17\u0E35\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E01\u0E48\u0E2D\u0E19\u0E04\u0E23\u0E31\u0E1A";
    } else {
      const proposed = proposalFromStoredTranscript(voice.transcript, voice.proposalJson);
      if (proposed.transactionType && proposed.amount && proposed.category) {
        const transactionId = await createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope.financeAccountId, transactionType: proposed.transactionType, amount: proposed.amount, category: proposed.category, note: proposed.note, source: "line_audio" });
        await linkTransactionAttachment({ transactionId, vaultItemId: voice.vaultItemId, lineUserId, label: "\u0E44\u0E1F\u0E25\u0E4C\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A" });
        await updateVoiceTranscriptionStatus(voice.id, "accepted");
        if (event.replyToken) {
          await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope.financeAccountId, proposed);
          return;
        }
        message = `\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01${proposed.transactionType === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"}\u0E08\u0E32\u0E01\u0E40\u0E2A\u0E35\u0E22\u0E07 ${proposed.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E43\u0E19\u0E2B\u0E21\u0E27\u0E14${proposed.category}\u0E41\u0E25\u0E49\u0E27`;
      } else {
        message = `\u0E16\u0E2D\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E44\u0E14\u0E49\u0E27\u0E48\u0E32 \u201C${voice.transcript}\u201D \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A/\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 \u0E40\u0E0A\u0E48\u0E19 \u201C\u0E08\u0E48\u0E32\u0E22\u0E01\u0E32\u0E41\u0E1F 65 \u0E1A\u0E32\u0E17\u201D \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E04\u0E23\u0E31\u0E1A`;
      }
    }
  } else if (command.type === "voiceEditPrompt") {
    const voice = await latestProposedVoiceTranscription(lineUserId, lineChatId);
    if (voice && event.replyToken) {
      await replyVoiceCategoryChoices(event.replyToken);
      return;
    }
    message = voice ? "\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E43\u0E2B\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22 \u0E40\u0E0A\u0E48\u0E19 \u201C\u0E41\u0E01\u0E49\u0E44\u0E02\u0E40\u0E2A\u0E35\u0E22\u0E07 \u0E08\u0E48\u0E32\u0E22\u0E01\u0E32\u0E41\u0E1F 65 \u0E1A\u0E32\u0E17\u201D \u0E41\u0E25\u0E49\u0E27\u0E44\u0E21\u0E42\u0E25\u0E08\u0E30\u0E40\u0E2A\u0E19\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E2B\u0E49\u0E15\u0E23\u0E27\u0E08\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07" : "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E17\u0E35\u0E48\u0E23\u0E2D\u0E41\u0E01\u0E49\u0E44\u0E02 \u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "voiceCategoryChange") {
    const voice = await latestProposedVoiceTranscription(lineUserId, lineChatId);
    const allowed = /* @__PURE__ */ new Set([...STANDARD_EXPENSE_CATEGORIES, ...(await listExpenseCategories(lineUserId, "expense", financeScope.financeAccountId)).map((item) => item.name)]);
    if (!voice) message = "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E17\u0E35\u0E48\u0E23\u0E2D\u0E41\u0E01\u0E49\u0E44\u0E02 \u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E04\u0E23\u0E31\u0E1A";
    else if (!allowed.has(command.category)) message = "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E2B\u0E21\u0E27\u0E14\u0E17\u0E35\u0E48\u0E41\u0E19\u0E30\u0E19\u0E33\u0E44\u0E14\u0E49 \u0E2B\u0E23\u0E37\u0E2D\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E43\u0E2B\u0E21\u0E48\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E04\u0E23\u0E31\u0E1A";
    else {
      const proposal = proposalFromStoredTranscript(voice.transcript, voice.proposalJson);
      proposal.category = command.category;
      const updated = await updateVoiceTranscript({ id: voice.id, lineUserId, transcript: voice.transcript, proposalJson: JSON.stringify(proposal) });
      if (!updated) message = "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E44\u0E14\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E04\u0E23\u0E31\u0E1A";
      else if (event.replyToken) {
        await sendVoiceProposal(event.replyToken, proposal);
        return;
      } else message = `\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E2B\u0E21\u0E27\u0E14\u0E02\u0E49\u0E2D\u0E40\u0E2A\u0E19\u0E2D\u0E40\u0E1B\u0E47\u0E19 ${command.category} \u0E41\u0E25\u0E49\u0E27`;
    }
  } else if (command.type === "voiceEdit") {
    const voice = await latestProposedVoiceTranscription(lineUserId, lineChatId);
    if (!voice) message = "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E17\u0E35\u0E48\u0E23\u0E2D\u0E41\u0E01\u0E49\u0E44\u0E02 \u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E04\u0E23\u0E31\u0E1A";
    else {
      const proposal = await buildVoiceProposal(command.transcript, lineUserId, financeScope.financeAccountId);
      const updated = await updateVoiceTranscript({ id: voice.id, lineUserId, transcript: command.transcript, proposalJson: JSON.stringify(proposal) });
      if (!updated) message = "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E44\u0E14\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E04\u0E23\u0E31\u0E1A";
      else if (event.replyToken) {
        await sendVoiceProposal(event.replyToken, proposal);
        return;
      } else message = "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E41\u0E25\u0E49\u0E27";
    }
  } else if (command.type === "note") {
    await createNote(lineChatId, lineUserId, command.title, command.content);
    message = "\u0E40\u0E01\u0E47\u0E1A\u0E42\u0E19\u0E49\u0E15\u0E44\u0E27\u0E49\u0E43\u0E2B\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E04\u0E49\u0E19\u0E2B\u0E32\u0E44\u0E14\u0E49\u0E17\u0E38\u0E01\u0E40\u0E21\u0E37\u0E48\u0E2D";
  } else if (command.type === "todo") {
    await createTodo(lineChatId, lineUserId, command.title);
    message = `\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E07\u0E32\u0E19 \u201C${command.title}\u201D \u0E41\u0E25\u0E49\u0E27`;
  } else if (command.type === "vault") {
    await createVaultItem({ lineChatId, createdByLineUserId: lineUserId, itemType: command.itemType, title: command.title, searchableText: command.content, tagsText: command.tagsText, sourceUrl: command.sourceUrl, lineMessageId: event.message?.id });
    message = `\u0E40\u0E01\u0E47\u0E1A${command.itemType === "link" ? "\u0E25\u0E34\u0E07\u0E01\u0E4C" : "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21"}\u0E19\u0E35\u0E49\u0E44\u0E27\u0E49\u0E43\u0E19\u0E04\u0E25\u0E31\u0E07\u0E41\u0E25\u0E49\u0E27${command.tagsText ? ` \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E41\u0E17\u0E47\u0E01 ${command.tagsText}` : ""}`;
  } else if (command.type === "search") {
    const results = await searchVault(lineUserId, command.query);
    message = results.length ? `\u0E1E\u0E1A ${results.length} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23
${results.slice(0, 5).map((item, index2) => `${index2 + 1}. ${item.title}`).join("\n")}` : `\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u201C${command.query}\u201D`;
  } else if (command.type === "mention") {
    const member = await findLineMemberByName(lineChatId, command.memberName);
    if (member && event.replyToken) {
      await replyMention(event.replyToken, command.message, member.lineUserId);
      return;
    }
    message = `\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E0A\u0E37\u0E48\u0E2D \u201C${command.memberName}\u201D \u0E43\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E02\u0E2D\u0E07\u0E01\u0E25\u0E38\u0E48\u0E21 \u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E49\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E2B\u0E32\u0E44\u0E21\u0E42\u0E25\u0E01\u0E48\u0E2D\u0E19\u0E04\u0E23\u0E31\u0E1A`;
  } else if (command.type === "budget") {
    if (!canManageFinanceSettings(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await upsertBudget(lineUserId, command.category, command.amount, monthKey, financeScope.financeAccountId);
    message = `\u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A\u0E2B\u0E21\u0E27\u0E14${command.category} ${command.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49\u0E41\u0E25\u0E49\u0E27`;
  } else if (command.type === "categoryAdd") {
    if (!canManageFinanceSettings(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E2B\u0E21\u0E27\u0E14\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    await addExpenseCategory(lineUserId, command.name, command.transactionType, financeScope.financeAccountId);
    message = `\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2B\u0E21\u0E27\u0E14${command.transactionType === "income" ? "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A" : "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22"} \u201C${command.name}\u201D \u0E41\u0E25\u0E49\u0E27`;
  } else if (command.type === "categoryRemove") {
    if (!canManageFinanceSettings(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E2B\u0E21\u0E27\u0E14\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const removed = await removeExpenseCategory(lineUserId, command.name, command.transactionType, financeScope.financeAccountId);
    message = removed ? `\u0E25\u0E1A\u0E2B\u0E21\u0E27\u0E14${command.transactionType === "income" ? "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A" : "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22"} \u201C${command.name}\u201D \u0E41\u0E25\u0E49\u0E27` : `\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2B\u0E21\u0E27\u0E14 \u201C${command.name}\u201D \u0E17\u0E35\u0E48\u0E08\u0E30\u0E25\u0E1A`;
  } else if (command.type === "categoryList") {
    const categories = await listTransactionCategories(lineUserId, financeScope.financeAccountId);
    const customExpense = categories.filter((item) => item.transactionType === "expense" && !STANDARD_EXPENSE_CATEGORIES.includes(item.name));
    const customIncome = categories.filter((item) => item.transactionType === "income" && !STANDARD_INCOME_CATEGORIES.includes(item.name));
    const expenseSection = `\u0E2B\u0E21\u0E27\u0E14\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E21\u0E32\u0E15\u0E23\u0E10\u0E32\u0E19
${STANDARD_EXPENSE_CATEGORIES.map((name) => `\u2022 ${name}`).join("\n")}${customExpense.length ? `
\u0E2B\u0E21\u0E27\u0E14\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E17\u0E35\u0E48\u0E04\u0E38\u0E13\u0E40\u0E1E\u0E34\u0E48\u0E21
${customExpense.map((item) => `\u2022 ${item.name}`).join("\n")}` : ""}`;
    const incomeSection = `\u0E2B\u0E21\u0E27\u0E14\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E21\u0E32\u0E15\u0E23\u0E10\u0E32\u0E19
${STANDARD_INCOME_CATEGORIES.map((name) => `\u2022 ${name}`).join("\n")}${customIncome.length ? `
\u0E2B\u0E21\u0E27\u0E14\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E17\u0E35\u0E48\u0E04\u0E38\u0E13\u0E40\u0E1E\u0E34\u0E48\u0E21
${customIncome.map((item) => `\u2022 ${item.name}`).join("\n")}` : ""}`;
    message = command.transactionType === "income" ? incomeSection : command.transactionType === "expense" ? expenseSection : `${expenseSection}

${incomeSection}

\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2B\u0E21\u0E27\u0E14\u0E44\u0E14\u0E49\u0E14\u0E49\u0E27\u0E22 \u201C\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2B\u0E21\u0E27\u0E14\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 \u0E0A\u0E37\u0E48\u0E2D\u0E2B\u0E21\u0E27\u0E14\u201D \u0E2B\u0E23\u0E37\u0E2D \u201C\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2B\u0E21\u0E27\u0E14\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A \u0E0A\u0E37\u0E48\u0E2D\u0E2B\u0E21\u0E27\u0E14\u201D`;
  } else if (command.type === "invalid") {
    message = command.message;
  } else if (command.type === "imageConfirm") {
    if (!canCreateFinanceTransaction(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E1C\u0E39\u0E49\u0E14\u0E39 \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const latest = await latestImageExtraction(lineUserId, lineChatId);
    if (!latest || latest.extraction.status !== "proposed") {
      message = "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E1C\u0E25\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E23\u0E39\u0E1B\u0E17\u0E35\u0E48\u0E23\u0E2D\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19 \u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B\u0E43\u0E1A\u0E19\u0E31\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E01\u0E48\u0E2D\u0E19\u0E04\u0E23\u0E31\u0E1A";
    } else {
      const analysis = JSON.parse(latest.extraction.extractedJson);
      const proposal = selectImageProposal(analysis.proposals);
      if (!proposal) {
        await setImageExtractionStatus(latest.extraction.id, "rejected");
        message = "\u0E23\u0E39\u0E1B\u0E19\u0E35\u0E49\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E14\u0E49\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E21\u0E31\u0E48\u0E19\u0E43\u0E08 \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E2B\u0E49\u0E04\u0E23\u0E31\u0E1A";
      } else if (proposal.kind === "expense" && Number(proposal.amount ?? 0) > 0) {
        const amount = Number(proposal.amount ?? 0);
        const category = normalizeExpenseCategory(proposal.category, `${proposal.title ?? ""} ${proposal.merchant ?? ""} ${proposal.note ?? ""}`);
        const occurredAt = parseExtractedDate(command.dateText) ?? parseExtractedDate(proposal.dateText);
        if (!occurredAt) {
          message = `\u0E2D\u0E48\u0E32\u0E19\u0E22\u0E2D\u0E14 ${amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17\u0E44\u0E14\u0E49 \u0E41\u0E15\u0E48\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E43\u0E19${proposal.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08"}\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14 \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E1B\u0E49\u0E2D\u0E07\u0E01\u0E31\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14
\u0E01\u0E23\u0E38\u0E13\u0E32\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22 \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 27/08/2569\u201D \u0E42\u0E14\u0E22\u0E41\u0E17\u0E19\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E08\u0E23\u0E34\u0E07`;
        } else {
          const transactionId = await createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope.financeAccountId, transactionType: "expense", amount, category, note: buildExpenseNote(proposal), occurredAt, source: "line_image" });
          await linkTransactionAttachment({ transactionId, vaultItemId: latest.vault.id, lineUserId, label: proposal.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A" });
          await setImageExtractionStatus(latest.extraction.id, "accepted");
          if (event.replyToken) {
            await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope.financeAccountId, { transactionType: "expense", amount, category });
            return;
          }
          message = `\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E08\u0E32\u0E01${proposal.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08"} ${amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E43\u0E19\u0E2B\u0E21\u0E27\u0E14${category}\u0E41\u0E25\u0E49\u0E27`;
        }
      } else {
        const proposed = parseMiloCommand(`\u0E40\u0E15\u0E37\u0E2D\u0E19 ${proposal.title} ${proposal.dateText} ${proposal.timeText}`);
        if (proposed.type === "reminder") {
          const id = await createReminder({ lineChatId, createdByLineUserId: lineUserId, ...proposed.data, sourceImageKey: latest.vault.storageKey ?? void 0 });
          await setImageExtractionStatus(latest.extraction.id, "accepted");
          message = `\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B #${id} \u0E41\u0E25\u0E49\u0E27: ${proposed.data.title}`;
        } else {
          message = "\u0E2D\u0E48\u0E32\u0E19\u0E2B\u0E31\u0E27\u0E02\u0E49\u0E2D\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B\u0E44\u0E14\u0E49 \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E2D\u0E48\u0E32\u0E19\u0E27\u0E31\u0E19\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E41\u0E19\u0E48\u0E0A\u0E31\u0E14\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49 \u0E25\u0E2D\u0E07\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E40\u0E1E\u0E34\u0E48\u0E21 \u0E41\u0E25\u0E49\u0E27\u0E2A\u0E48\u0E07\u0E21\u0E32\u0E43\u0E2B\u0E21\u0E48\u0E44\u0E14\u0E49\u0E04\u0E23\u0E31\u0E1A";
        }
      }
    }
  } else if (command.type === "settingGuide") {
    message = "\u2699\uFE0F \u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 Milo\n\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E01\u0E32\u0E23\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 Milo \u0E44\u0E14\u0E49\u0E08\u0E32\u0E01\u0E40\u0E21\u0E19\u0E39\u0E41\u0E25\u0E30\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E43\u0E19 LINE \u0E04\u0E23\u0E31\u0E1A\n\u2022 \u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E0A\u0E48\u0E27\u0E22\u201D \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E39\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\n\u2022 \u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48\u201D \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48\n\u2022 \u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u201D \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E39\u0E41\u0E25\u0E30\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\n\u{1F510} \u201C\u0E41\u0E14\u0E0A\u0E1A\u0E2D\u0E23\u0E4C\u0E14\u0E2B\u0E25\u0E31\u0E07\u0E1A\u0E49\u0E32\u0E19\u201D \u0E40\u0E1B\u0E47\u0E19\u0E40\u0E21\u0E19\u0E39\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E42\u0E14\u0E22\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "dashboardGuide") {
    message = "\u{1F510} \u0E41\u0E14\u0E0A\u0E1A\u0E2D\u0E23\u0E4C\u0E14\u0E2B\u0E25\u0E31\u0E07\u0E1A\u0E49\u0E32\u0E19 Milo\nhttps://milo-line-app.vercel.app/dashboard";
  } else if (command.type === "recordGuide") {
    message = "\u{1F4DD} \u0E08\u0E14\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\n\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07: \u0E08\u0E48\u0E32\u0E22 125 \u0E04\u0E48\u0E32\u0E2D\u0E32\u0E2B\u0E32\u0E23\n\u0E2B\u0E23\u0E37\u0E2D: \u0E23\u0E31\u0E1A\u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19 30000\n\u0E41\u0E25\u0E49\u0E27\u0E1C\u0E21\u0E08\u0E30\u0E0A\u0E48\u0E27\u0E22\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E43\u0E2B\u0E49\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "budgetOverview") {
    const budgets2 = await listBudgets(lineUserId, void 0, financeScope.financeAccountId);
    message = budgets2.length ? "\u{1F4CA} \u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49\n" + budgets2.slice(0, 10).map((item) => `\u2022 ${item.category} ${Number(item.amount).toLocaleString("th-TH")} \u0E1A\u0E32\u0E17`).join("\n") : "\u{1F4CA} \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E17\u0E35\u0E48\u0E15\u0E31\u0E49\u0E07\u0E44\u0E27\u0E49\u0E04\u0E23\u0E31\u0E1A\n\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07: \u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13 \u0E04\u0E48\u0E32\u0E2D\u0E32\u0E2B\u0E32\u0E23 5000";
  } else if (command.type === "transactionList") {
    const results = await searchTransactions(lineUserId, "", 10, financeScope.financeAccountId);
    message = results.length ? "\u{1F4CB} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\n" + results.map((item) => `#${item.id} \u2022 ${item.transactionType === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"} ${Number(item.amount).toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u2022 ${item.category}`).join("\n") : "\u{1F4CB} \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "greeting") {
    message = "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35\u0E04\u0E23\u0E31\u0E1A \u{1F44B} \u0E1C\u0E21\u0E44\u0E21\u0E42\u0E25 \u0E1C\u0E39\u0E49\u0E0A\u0E48\u0E27\u0E22\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\n\u0E01\u0E14\u0E40\u0E21\u0E19\u0E39\u0E14\u0E49\u0E32\u0E19\u0E25\u0E48\u0E32\u0E07\u0E2B\u0E23\u0E37\u0E2D\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E0A\u0E48\u0E27\u0E22\u201D \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E39\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E44\u0E14\u0E49\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "help") {
    message = helpText();
  } else {
    message = "\u0E1C\u0E21\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E02\u0E49\u0E32\u0E43\u0E08 \u0E25\u0E2D\u0E07\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E0A\u0E48\u0E27\u0E22\u201D \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E39\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E44\u0E14\u0E49\u0E04\u0E23\u0E31\u0E1A";
  }
  if (event.replyToken) await replyText(event.replyToken, message);
}
async function handleMedia(event, lineChatId, lineUserId, scope) {
  const message = event.message;
  if (!message) return;
  const isImage = message.type === "image";
  const isAudio = message.type === "audio";
  const bytes = await getMessageContent(message.id);
  const mimeType = isImage ? "image/jpeg" : isAudio ? "audio/m4a" : "application/octet-stream";
  const stored = await storagePut(`milo/${lineChatId}/${message.id}`, bytes, mimeType);
  const vaultId = await createVaultItem({
    lineChatId,
    createdByLineUserId: lineUserId,
    itemType: isImage ? "image" : "file",
    title: message.fileName ?? (isImage ? "\u0E23\u0E39\u0E1B\u0E08\u0E32\u0E01 LINE" : isAudio ? "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E08\u0E32\u0E01 LINE" : "\u0E44\u0E1F\u0E25\u0E4C\u0E08\u0E32\u0E01 LINE"),
    searchableText: message.fileName,
    originalFilename: message.fileName,
    mimeType,
    storageKey: stored.key,
    storageUrl: stored.url,
    lineMessageId: message.id
  });
  if (isAudio) {
    try {
      const audioUrl = await storageGetSignedUrl(stored.key);
      const transcript = await transcribeAudio({ audioUrl, language: "th", prompt: "\u0E16\u0E2D\u0E14\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22\u0E40\u0E01\u0E35\u0E48\u0E22\u0E27\u0E01\u0E31\u0E1A\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 \u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19 \u0E41\u0E25\u0E30\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48" });
      if ("error" in transcript) throw new Error(transcript.error);
      const financeScope = await resolveFinanceScope(lineUserId, lineChatId, scope);
      const proposal = await buildVoiceProposal(transcript.text, lineUserId, financeScope?.financeAccountId);
      await saveVoiceTranscription({ vaultItemId: vaultId, lineChatId, lineUserId, transcript: transcript.text, language: transcript.language, durationSeconds: transcript.duration, proposalJson: JSON.stringify(proposal) });
      if (event.replyToken) await sendVoiceProposal(event.replyToken, proposal);
    } catch (error) {
      console.error("[Milo Voice] transcription failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
      if (event.replyToken) await replyText(event.replyToken, "\u0E40\u0E01\u0E47\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E44\u0E27\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E16\u0E2D\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E43\u0E19\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2D\u0E31\u0E14\u0E43\u0E2B\u0E21\u0E48\u0E43\u0E2B\u0E49\u0E0A\u0E31\u0E14\u0E40\u0E08\u0E19 \u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27\u0E2A\u0E31\u0E49\u0E19 \u0E46 \u0E41\u0E25\u0E30\u0E02\u0E19\u0E32\u0E14\u0E44\u0E21\u0E48\u0E40\u0E01\u0E34\u0E19 16MB \u0E04\u0E23\u0E31\u0E1A");
    }
    return;
  }
  if (!isImage) {
    if (event.replyToken) await replyText(event.replyToken, "\u0E40\u0E01\u0E47\u0E1A\u0E44\u0E1F\u0E25\u0E4C\u0E19\u0E35\u0E49\u0E44\u0E27\u0E49\u0E43\u0E19\u0E04\u0E25\u0E31\u0E07\u0E16\u0E32\u0E27\u0E23\u0E41\u0E25\u0E49\u0E27");
    return;
  }
  try {
    const analysis = await analyzeImage(`data:${mimeType};base64,${bytes.toString("base64")}`);
    await saveImageExtraction(vaultId, analysis.proposals.some((item) => item.kind === "expense") ? "expense" : "reminder", JSON.stringify(analysis), analysis.confidence);
    const proposals = analysis.proposals.slice(0, 2).map((item) => `\u2022 ${formatImageProposal(item)}`).join("\n");
    if (event.replyToken) await replyText(event.replyToken, `\u0E40\u0E01\u0E47\u0E1A\u0E23\u0E39\u0E1B\u0E44\u0E27\u0E49\u0E41\u0E25\u0E49\u0E27
${analysis.summary}
${proposals || "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E04\u0E27\u0E23\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34"}
\u0E15\u0E23\u0E27\u0E08\u0E22\u0E2D\u0E14\u0E41\u0E25\u0E30\u0E2B\u0E21\u0E27\u0E14\u0E43\u0E2B\u0E49\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E48\u0E2D\u0E19 \u0E41\u0E25\u0E49\u0E27\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u201D \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01 \u0E2B\u0E23\u0E37\u0E2D \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E23\u0E39\u0E1B\u201D \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E15\u0E37\u0E2D\u0E19`);
  } catch {
    if (event.replyToken) await replyText(event.replyToken, "\u0E40\u0E01\u0E47\u0E1A\u0E23\u0E39\u0E1B\u0E44\u0E27\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E2D\u0E48\u0E32\u0E19\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49 \u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E20\u0E32\u0E1E\u0E17\u0E35\u0E48\u0E04\u0E21\u0E0A\u0E31\u0E14\u0E02\u0E36\u0E49\u0E19\u0E44\u0E14\u0E49\u0E04\u0E23\u0E31\u0E1A");
  }
}
async function processEvent(event, rawPayload) {
  const identity = sourceIdentity(event.source);
  if (!identity.lineUserId) return;
  const accepted = await registerWebhookEvent({ webhookEventId: event.webhookEventId, eventType: event.type, lineChatId: identity.lineChatId, occurredAt: new Date(event.timestamp), rawPayload });
  if (!accepted) return;
  try {
    const profile = await getProfile(event.source).catch(() => void 0);
    await upsertLineChat(identity.lineChatId, identity.scope, profile?.displayName);
    await upsertLineMember(identity.lineChatId, identity.lineUserId, profile?.displayName);
    if (event.type !== "message" || !event.message) {
      await finishWebhookEvent(event.webhookEventId, "ignored");
      return;
    }
    const isGroup = identity.scope !== "user";
    const isMention = event.message.mention?.mentionees?.some((item) => item.isSelf) || event.message.text?.trim().startsWith("@\u0E44\u0E21\u0E42\u0E25");
    if (isGroup && event.message.type === "text" && !isMention) {
      await finishWebhookEvent(event.webhookEventId, "ignored");
      return;
    }
    if (event.message.type === "text") await handleText(event, identity.lineChatId, identity.lineUserId, identity.scope);
    else if (event.message.type === "image" || event.message.type === "file" || event.message.type === "audio") await handleMedia(event, identity.lineChatId, identity.lineUserId, identity.scope);
    await finishWebhookEvent(event.webhookEventId, "processed");
  } catch (error) {
    await finishWebhookEvent(event.webhookEventId, "failed", error instanceof Error ? error.message : "unknown error");
    throw error;
  }
}
function registerLineWebhook(app2) {
  app2.post("/api/line/webhook", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
    const raw = req.body;
    const credentials = lineCredentials();
    if (!verifyLineSignature(raw, req.header("x-line-signature"), credentials.channelSecret)) return res.status(401).json({ error: "invalid signature" });
    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid json" });
    }
    try {
      await Promise.all((payload.events ?? []).map((event) => processEvent(event, raw.toString("utf8"))));
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "event processing failed" });
    }
  });
}
function registerMiloCron(app2) {
  app2.all("/api/scheduled/reminders", async (req, res) => {
    try {
      const isVercelCron = req.method === "GET" && req.headers["user-agent"] === "vercel-cron/1.0";
      let taskUid;
      if (isVercelCron) {
        const secret = process.env.CRON_SECRET?.trim();
        const authorization = req.headers.authorization;
        const headerSecret = req.headers["x-cron-secret"];
        const bearerValid = authorization === `Bearer ${secret}`;
        const headerValid = headerSecret === secret;
        if (!secret || !bearerValid && !headerValid) return res.status(401).json({ error: "cron-unauthorized" });
        const schedule = await getAutomationSetting("reminder-delivery-primary");
        if (!schedule?.isEnabled) return res.json({ ok: true, skipped: "disabled" });
        taskUid = schedule.scheduleCronTaskUid ?? "vercel-cron-reminders";
      } else if (req.method === "POST") {
        const user = await sdk.authenticateRequest(req);
        if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
        const schedule = await getAutomationSettingByTaskUid(user.taskUid);
        if (!schedule) return res.json({ ok: true, skipped: "orphan" });
        taskUid = user.taskUid;
      } else {
        return res.status(405).json({ error: "method-not-allowed" });
      }
      const result = await deliverDueReminders({ runner: "heartbeat", taskUid });
      const recurring = await deliverDueRecurringTransactions();
      await saveAutomationSetting({ settingKey: "reminder-delivery-primary", scheduleCronTaskUid: taskUid, isEnabled: true, lastRunAt: /* @__PURE__ */ new Date() });
      return res.json({ ok: true, ...result, recurring });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "unknown", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  const registerFinanceDigestRoute = (path, settingKey, digestType) => {
    app2.post(path, async (req, res) => {
      try {
        const user = await sdk.authenticateRequest(req);
        if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
        const schedule = await getAutomationSettingByTaskUid(user.taskUid);
        if (!schedule || schedule.settingKey !== settingKey || !schedule.isEnabled) return res.json({ ok: true, skipped: "orphan-or-disabled" });
        const result = await deliverFinanceDigest({ settingKey, taskUid: user.taskUid, digestType });
        return res.json({ ok: true, ...result });
      } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : "unknown", taskUid: void 0, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      }
    });
  };
  registerFinanceDigestRoute("/api/scheduled/finance-daily", "finance-digest-daily", "daily");
  registerFinanceDigestRoute("/api/scheduled/finance-weekly", "finance-digest-weekly", "weekly");
}

// server/api.ts
var app = express2();
app.set("trust proxy", 1);
registerLineWebhook(app);
app.use(express2.json({ limit: "50mb" }));
app.use(express2.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
var healthHandler = (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
};
app.get("/api/health", healthHandler);
app.get("/health", healthHandler);
app.post("/api/admin/password", async (req, res) => {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19" });
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";
    if (!currentPassword || !newPassword || !confirmPassword) return res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E23\u0E2D\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E43\u0E2B\u0E49\u0E04\u0E23\u0E1A\u0E17\u0E38\u0E01\u0E0A\u0E48\u0E2D\u0E07" });
    if (newPassword !== confirmPassword) return res.status(400).json({ error: "\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E43\u0E2B\u0E21\u0E48\u0E41\u0E25\u0E30\u0E01\u0E32\u0E23\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E44\u0E21\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E19" });
    const username = (process.env.ADMIN_USERNAME ?? "").trim();
    const result = await changeAdminPassword({ username, currentPassword, newPassword });
    await writeAuditLog({ action: "admin.password.change", entityType: "admin_credential", entityId: result.userId, dashboardUserId: user.id, details: { username } });
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.status(200).json({ success: true, requiresRelogin: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E44\u0E14\u0E49";
    return res.status(400).json({ error: message });
  }
});
var trpcMiddleware = createExpressMiddleware({ router: appRouter, createContext });
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);
app.use("/api/scheduled/reminders", (req, _res, next) => {
  if (req.method === "GET") req.headers["user-agent"] = "vercel-cron/1.0";
  next();
});
app.use("/scheduled/reminders", (req, _res, next) => {
  if (req.method === "GET") req.headers["user-agent"] = "vercel-cron/1.0";
  next();
});
registerMiloCron(app);
var api_default = app;
export {
  api_default as default
};
