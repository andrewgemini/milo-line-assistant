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
import { boolean, customType, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";
var longblob = customType({
  dataType() {
    return "longblob";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return Buffer.from(value);
  }
});
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
  budgetCycleStartDay: int("budgetCycleStartDay").default(1).notNull(),
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
var calendarEvents = mysqlTable("calendar_events", {
  id: int("id").autoincrement().primaryKey(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  createdByLineUserId: varchar("createdByLineUserId", { length: 128 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  detail: text("detail"),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Bangkok").notNull(),
  status: mysqlEnum("status", ["active", "cancelled", "completed"]).default("active").notNull(),
  sourceMessageId: varchar("sourceMessageId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  index("calendar_events_chat_start_idx").on(table.lineChatId, table.status, table.startsAt),
  index("calendar_events_user_start_idx").on(table.createdByLineUserId, table.status, table.startsAt),
  index("calendar_events_source_idx").on(table.sourceMessageId)
]);
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
var vaultBlobs = mysqlTable("vault_blobs", {
  id: int("id").autoincrement().primaryKey(),
  storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  content: longblob("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [index("vault_blobs_created_idx").on(table.createdAt)]);
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
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? process.env.FORGE_API_URL ?? process.env.OPENAI_BASE_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? process.env.FORGE_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  visionModel: process.env.MILO_VISION_MODEL ?? (process.env.BUILT_IN_FORGE_API_KEY || process.env.FORGE_API_KEY ? "gemini-3-flash-preview" : process.env.OPENAI_API_KEY ? "gpt-5-mini" : "gemini-3-flash-preview")
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

// server/milo/budgetCycle.ts
var BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1e3;
function bangkokParts(date) {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}
function normalizeMonth(year, month) {
  const value = new Date(Date.UTC(year, month - 1, 1));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}
function atBangkokMidnight2(year, month, day) {
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth(), normalized.getUTCDate(), -7, 0, 0));
}
function normalizeBudgetCycleStartDay(day) {
  return Math.min(Math.max(Math.trunc(day || 1), 1), 28);
}
function budgetCycleWindow(reference = /* @__PURE__ */ new Date(), configuredStartDay = 1) {
  const startDay = normalizeBudgetCycleStartDay(configuredStartDay);
  const parts = bangkokParts(reference);
  const startMonth = parts.day >= startDay ? { year: parts.year, month: parts.month } : normalizeMonth(parts.year, parts.month - 1);
  const nextMonth = normalizeMonth(startMonth.year, startMonth.month + 1);
  const start = atBangkokMidnight2(startMonth.year, startMonth.month, startDay);
  const end = atBangkokMidnight2(nextMonth.year, nextMonth.month, startDay);
  const key = `${startMonth.year}-${String(startMonth.month).padStart(2, "0")}`;
  return { startDay, start, end, key };
}
function formatBudgetCycleLabel(reference = /* @__PURE__ */ new Date(), configuredStartDay = 1) {
  const { start, end } = budgetCycleWindow(reference, configuredStartDay);
  const endInclusive = new Date(end.getTime() - 1);
  const format = new Intl.DateTimeFormat("th-TH-u-nu-latn", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  return `${format.format(start)} \u2013 ${format.format(endInclusive)}`;
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
async function getFinanceAccountBudgetCycleStartDay(financeAccountId) {
  const db = await requireDb();
  const row = (await db.select({ budgetCycleStartDay: financeAccounts.budgetCycleStartDay }).from(financeAccounts).where(eq(financeAccounts.id, financeAccountId)).limit(1))[0];
  return normalizeBudgetCycleStartDay(row?.budgetCycleStartDay ?? 1);
}
async function updateFinanceAccountBudgetCycleStartDay(financeAccountId, day) {
  const db = await requireDb();
  const normalized = normalizeBudgetCycleStartDay(day);
  const result = await db.update(financeAccounts).set({ budgetCycleStartDay: normalized }).where(eq(financeAccounts.id, financeAccountId));
  return result[0].affectedRows > 0 ? normalized : void 0;
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
async function listRemindersForChat(lineUserId, lineChatId, scope) {
  const db = await requireDb();
  const chatScope = scope === "user" ? and(eq(reminders.createdByLineUserId, lineUserId), eq(reminders.lineChatId, lineChatId)) : eq(reminders.lineChatId, lineChatId);
  return db.select().from(reminders).where(and(chatScope, or(eq(reminders.status, "active"), eq(reminders.status, "paused")))).orderBy(reminders.nextRunAt).limit(50);
}
async function cancelReminderForChat(id, lineUserId, lineChatId) {
  const db = await requireDb();
  const current = (await db.select().from(reminders).where(and(eq(reminders.id, id), eq(reminders.lineChatId, lineChatId), eq(reminders.createdByLineUserId, lineUserId), or(eq(reminders.status, "active"), eq(reminders.status, "paused")))).limit(1))[0];
  if (!current) return false;
  await db.update(reminders).set({ status: "cancelled" }).where(eq(reminders.id, id));
  await writeAuditLog({ action: "reminder.cancel", entityType: "reminder", entityId: id, actorLineUserId: lineUserId, lineChatId, details: { title: current.title } });
  return true;
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
async function createCalendarEvent(input) {
  const db = await requireDb();
  if (input.sourceMessageId) {
    const existing = (await db.select().from(calendarEvents).where(and(eq(calendarEvents.lineChatId, input.lineChatId), eq(calendarEvents.sourceMessageId, input.sourceMessageId))).limit(1))[0];
    if (existing) return existing.id;
  }
  const result = await db.insert(calendarEvents).values({ ...input, detail: input.detail ?? null, sourceMessageId: input.sourceMessageId ?? null });
  const id = Number(result[0].insertId);
  await writeAuditLog({ action: "calendar.create", entityType: "calendar_event", entityId: id, actorLineUserId: input.createdByLineUserId, lineChatId: input.lineChatId, details: { title: input.title, startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString() } });
  return id;
}
async function getCalendarEventById(id) {
  const db = await requireDb();
  return (await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1))[0];
}
async function listCalendarEvents(lineUserId, lineChatId, from = /* @__PURE__ */ new Date(), limit = 20) {
  const db = await requireDb();
  return db.select().from(calendarEvents).where(and(eq(calendarEvents.lineChatId, lineChatId), eq(calendarEvents.status, "active"), gte(calendarEvents.endsAt, from))).orderBy(calendarEvents.startsAt).limit(Math.min(Math.max(limit, 1), 50));
}
async function cancelCalendarEvent(id, lineUserId, lineChatId) {
  const db = await requireDb();
  const current = (await db.select().from(calendarEvents).where(and(eq(calendarEvents.id, id), eq(calendarEvents.lineChatId, lineChatId), eq(calendarEvents.createdByLineUserId, lineUserId), eq(calendarEvents.status, "active"))).limit(1))[0];
  if (!current) return false;
  await db.update(calendarEvents).set({ status: "cancelled" }).where(eq(calendarEvents.id, id));
  await writeAuditLog({ action: "calendar.cancel", entityType: "calendar_event", entityId: id, actorLineUserId: lineUserId, lineChatId, details: { title: current.title } });
  return true;
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
async function findVaultItemByLineMessageId(lineMessageId, lineUserId, lineChatId) {
  const db = await requireDb();
  return (await db.select({ id: vaultItems.id }).from(vaultItems).where(and(
    eq(vaultItems.lineMessageId, lineMessageId),
    eq(vaultItems.createdByLineUserId, lineUserId),
    eq(vaultItems.lineChatId, lineChatId),
    eq(vaultItems.status, "active")
  )).limit(1))[0];
}
async function searchVault(lineUserId, term = "") {
  const db = await requireDb();
  const base = and(eq(vaultItems.createdByLineUserId, lineUserId), eq(vaultItems.status, "active"));
  const where = term.trim() ? and(base, or(like(vaultItems.title, `%${term}%`), like(vaultItems.searchableText, `%${term}%`), like(vaultItems.tagsText, `%${term}%`))) : base;
  return db.select().from(vaultItems).where(where).orderBy(desc(vaultItems.createdAt)).limit(100);
}
async function searchVaultForChat(lineUserId, lineChatId, scope, term = "") {
  const db = await requireDb();
  const base = scope === "user" ? and(eq(vaultItems.createdByLineUserId, lineUserId), eq(vaultItems.lineChatId, lineChatId), eq(vaultItems.status, "active")) : and(eq(vaultItems.lineChatId, lineChatId), eq(vaultItems.status, "active"));
  const where = term.trim() ? and(base, or(like(vaultItems.title, `%${term}%`), like(vaultItems.searchableText, `%${term}%`), like(vaultItems.tagsText, `%${term}%`))) : base;
  return db.select().from(vaultItems).where(where).orderBy(desc(vaultItems.createdAt)).limit(100);
}
async function vaultStorageStatus(lineUserId, lineChatId, scope) {
  const rows = await searchVaultForChat(lineUserId, lineChatId, scope, "");
  const durable = rows.filter((item) => item.itemType === "text" || item.itemType === "link" || Boolean(item.storageKey)).length;
  const mediaMissing = rows.filter((item) => (item.itemType === "image" || item.itemType === "file") && !item.storageKey).length;
  return { total: rows.length, durable, mediaMissing };
}
async function updateVaultMetadata(id, lineUserId, input) {
  const db = await requireDb();
  await db.update(vaultItems).set({ tagsText: input.tagsText ?? null, sourceUrl: input.sourceUrl ?? null }).where(and(eq(vaultItems.id, id), eq(vaultItems.createdByLineUserId, lineUserId)));
}
async function saveVaultBlob(input) {
  const db = await requireDb();
  await db.insert(vaultBlobs).values({ storageKey: input.storageKey, mimeType: input.mimeType, sizeBytes: input.content.byteLength, content: input.content }).onDuplicateKeyUpdate({ set: { mimeType: input.mimeType, sizeBytes: input.content.byteLength, content: input.content } });
}
async function getVaultBlob(storageKey) {
  const db = await requireDb();
  return (await db.select().from(vaultBlobs).where(eq(vaultBlobs.storageKey, storageKey)).limit(1))[0];
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
async function listTodosForChat(lineUserId, lineChatId, scope) {
  const db = await requireDb();
  const chatScope = scope === "user" ? and(eq(todoItems.createdByLineUserId, lineUserId), eq(todoItems.lineChatId, lineChatId)) : eq(todoItems.lineChatId, lineChatId);
  return db.select().from(todoItems).where(and(chatScope, eq(todoItems.status, "todo"))).orderBy(todoItems.dueAt, todoItems.createdAt).limit(100);
}
async function completeTodoForChat(id, lineUserId, lineChatId, scope) {
  const db = await requireDb();
  const chatScope = scope === "user" ? and(eq(todoItems.createdByLineUserId, lineUserId), eq(todoItems.lineChatId, lineChatId)) : eq(todoItems.lineChatId, lineChatId);
  const current = (await db.select().from(todoItems).where(and(eq(todoItems.id, id), chatScope, eq(todoItems.status, "todo"))).limit(1))[0];
  if (!current) return false;
  await db.update(todoItems).set({ status: "done", completedAt: /* @__PURE__ */ new Date() }).where(eq(todoItems.id, id));
  await writeAuditLog({ action: "todo.complete", entityType: "todo", entityId: id, actorLineUserId: lineUserId, lineChatId, details: { title: current.title } });
  return true;
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
  if (input.sourceMessageId) {
    const sourceScope = input.financeAccountId === void 0 ? eq(transactions.lineUserId, input.lineUserId) : eq(transactions.financeAccountId, input.financeAccountId);
    const existing = (await db.select({ id: transactions.id }).from(transactions).where(and(sourceScope, eq(transactions.sourceMessageId, input.sourceMessageId))).orderBy(desc(transactions.id)).limit(1))[0];
    if (existing) return existing.id;
  }
  const result = await db.insert(transactions).values({ ...input, amount: String(input.amount), note: input.note ?? null, occurredAt: input.occurredAt ?? /* @__PURE__ */ new Date(), source: input.source ?? "line_text", sourceMessageId: input.sourceMessageId ?? null });
  const id = Number(result[0].insertId);
  await writeAuditLog({ action: "transaction.create", entityType: "transaction", entityId: id, actorLineUserId: input.lineUserId, lineChatId: input.lineChatId, details: { transactionType: input.transactionType, amount: input.amount, category: input.category, source: input.source ?? "line_text", sourceMessageId: input.sourceMessageId ?? null } });
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
async function listTransactionsForExport(lineUserId, financeAccountId, start, end) {
  const db = await requireDb();
  const conditions = [financeAccountId === void 0 ? eq(transactions.lineUserId, lineUserId) : eq(transactions.financeAccountId, financeAccountId), eq(transactions.status, "active")];
  if (start) conditions.push(gte(transactions.occurredAt, start));
  if (end) conditions.push(lte(transactions.occurredAt, end));
  return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.occurredAt)).limit(1e4);
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
async function deleteLatestTransaction(input) {
  const db = await requireDb();
  const scope = input.financeAccountId === void 0 ? eq(transactions.lineUserId, input.lineUserId) : eq(transactions.financeAccountId, input.financeAccountId);
  const current = (await db.select().from(transactions).where(and(scope, eq(transactions.status, "active"))).orderBy(desc(transactions.createdAt), desc(transactions.id)).limit(1))[0];
  if (!current) return void 0;
  await db.update(transactions).set({ status: "deleted", deletedAt: /* @__PURE__ */ new Date() }).where(eq(transactions.id, current.id));
  await writeAuditLog({ action: "transaction.undo", entityType: "transaction", entityId: current.id, actorLineUserId: input.lineUserId, lineChatId: current.lineChatId, details: { amount: current.amount, category: current.category, note: current.note, transactionType: current.transactionType, source: current.source } });
  return current;
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
async function financeBudgetCycleReport(lineUserId, reference = /* @__PURE__ */ new Date(), financeAccountId) {
  const startDay = financeAccountId === void 0 ? 1 : await getFinanceAccountBudgetCycleStartDay(financeAccountId);
  const cycle = budgetCycleWindow(reference, startDay);
  const rows = await listTransactions(lineUserId, cycle.start, new Date(cycle.end.getTime() - 1), false, financeAccountId);
  return { period: "budget-cycle", ...cycle, ...summarizeFinanceRows(rows), rows };
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
async function isAdminLinkedLineUser(lineUserId) {
  const db = await requireDb();
  const row = (await db.select({ id: users.id }).from(lineAccountLinks).innerJoin(users, eq(lineAccountLinks.dashboardUserId, users.id)).where(and(eq(lineAccountLinks.lineUserId, lineUserId), eq(users.role, "admin"))).limit(1))[0];
  return Boolean(row);
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
async function updateProposedImageExtractionJson(id, extractedJson) {
  const db = await requireDb();
  const result = await db.update(imageExtractions).set({ extractedJson }).where(and(eq(imageExtractions.id, id), eq(imageExtractions.status, "proposed")));
  return result[0].affectedRows > 0;
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
async function financeDigestAutomationStatus(targetLineUserId) {
  const db = await requireDb();
  const keys = ["finance-digest-daily", "finance-digest-weekly"];
  const settings = await db.select().from(automationSettings).where(inArray(automationSettings.settingKey, keys)).orderBy(automationSettings.settingKey);
  const deliveries = await db.select().from(financeDigestDeliveries).where(eq(financeDigestDeliveries.targetLineUserId, targetLineUserId)).orderBy(desc(financeDigestDeliveries.createdAt)).limit(12);
  return { settings, deliveries };
}
async function setFinanceDigestAutomationEnabled(settingKey, isEnabled) {
  const db = await requireDb();
  const current = (await db.select().from(automationSettings).where(eq(automationSettings.settingKey, settingKey)).limit(1))[0];
  if (!current) throw new Error("\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A scheduler \u0E02\u0E2D\u0E07\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E19\u0E35\u0E49");
  await db.update(automationSettings).set({ isEnabled }).where(eq(automationSettings.settingKey, settingKey));
  return { ...current, isEnabled };
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
    const secret3 = ENV.cookieSecret;
    return new TextEncoder().encode(secret3);
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
    sameSite: "lax",
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

// server/milo/entitlements.ts
var PLAN_RANK = { free: 0, pro: 1, pro_max: 2 };
var MILO_ENTITLEMENT_MIN_PLAN = {
  reminders: "pro",
  advancedCharts: "pro",
  customBudgetCycle: "pro",
  pdf: "pro_max",
  groupAccounting: "pro_max",
  multipleAccounts: "pro_max"
};
var MILO_PLAN_CAPABILITIES = {
  free: {
    label: "Free",
    included: ["categories", "budget", "monthlySummary"]
  },
  pro: {
    label: "Pro",
    included: ["categories", "budget", "monthlySummary", "reminders", "advancedCharts", "customBudgetCycle"]
  },
  pro_max: {
    label: "Pro Max",
    included: ["categories", "budget", "monthlySummary", "reminders", "advancedCharts", "customBudgetCycle", "pdf", "groupAccounting", "multipleAccounts"]
  }
};
function parseLineUserSet(value) {
  return new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}
function resolveMiloPlan(lineUserId, env = process.env, adminLinked = false) {
  if (!lineUserId) return "free";
  if (adminLinked) return "pro_max";
  if (parseLineUserSet(env.MILO_PRO_MAX_LINE_USER_IDS).has(lineUserId)) return "pro_max";
  if (parseLineUserSet(env.MILO_PRO_LINE_USER_IDS).has(lineUserId)) return "pro";
  return "free";
}
function hasMiloEntitlement(plan, entitlement) {
  return PLAN_RANK[plan] >= PLAN_RANK[MILO_ENTITLEMENT_MIN_PLAN[entitlement]];
}
function requiredPlanFor(entitlement) {
  return MILO_ENTITLEMENT_MIN_PLAN[entitlement];
}
function entitlementMessage(entitlement) {
  const plan = requiredPlanFor(entitlement);
  const label = MILO_PLAN_CAPABILITIES[plan].label;
  return `\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C\u0E19\u0E35\u0E49\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E41\u0E1E\u0E47\u0E01\u0E40\u0E01\u0E08 ${label} \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2D\u0E31\u0E1B\u0E40\u0E01\u0E23\u0E14\u0E41\u0E1E\u0E47\u0E01\u0E40\u0E01\u0E08\u0E01\u0E48\u0E2D\u0E19\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E04\u0E23\u0E31\u0E1A`;
}
function assertMiloEntitlement(plan, entitlement) {
  if (!hasMiloEntitlement(plan, entitlement)) throw new Error(entitlementMessage(entitlement));
}

// server/milo/richMenuArtwork.ts
var RICH_MENU_ARTWORK = {
  "report-year": {
    "file": "report-year.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_32_41 PM.png"
  },
  "report-day": {
    "file": "report-day.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_32_55 PM (1).png"
  },
  "report-month": {
    "file": "report-month.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_32_55 PM (2).png"
  },
  "report-week": {
    "file": "report-week.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_32_56 PM (3).png"
  },
  "analysis": {
    "file": "analysis.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_19 PM (1).png"
  },
  "overview": {
    "file": "overview.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_19 PM (2).png"
  },
  "budget": {
    "file": "budget.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_20 PM (3).png"
  },
  "transactions": {
    "file": "transactions.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_20 PM (4).png"
  },
  "record": {
    "file": "record.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_21 PM (5).png"
  },
  "categories": {
    "file": "categories.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_21 PM (6).png"
  },
  "settings": {
    "file": "settings.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_22 PM (7).png"
  },
  "help": {
    "file": "help.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_22 PM (8).png"
  }
};
function artworkForCommand(command) {
  if (command.type === "financeReport") return "report-" + command.period;
  const keys = {
    recordGuide: "record",
    aiSummary: "analysis",
    budgetOverview: "budget",
    transactionList: "transactions",
    categoryList: "categories",
    settingGuide: "settings",
    help: "help",
    greeting: "overview",
    dashboardGuide: "overview"
  };
  return keys[command.type];
}
function artworkMessages(key) {
  const base = process.env.MILO_PUBLIC_URL || "https://milo-line-app.vercel.app";
  const url = new URL("/richmenu/" + RICH_MENU_ARTWORK[key].file, base).href;
  return [{ type: "image", originalContentUrl: url, previewImageUrl: url.replace(/\.png$/, "-preview.jpg") }];
}

// server/milo/richMenuDataImage.ts
import crypto2 from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import sharp from "sharp";

// server/milo/vectorText.ts
import * as fontkit from "fontkit";

// server/milo/latinFontData.ts
var MILO_LATIN_FONT_400_BASE64 = "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";
var MILO_LATIN_FONT_700_BASE64 = "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";

// server/milo/thaiFontData.ts
var MILO_THAI_FONT_400_BASE64 = "d09GMgABAAAAACOYABAAAAAAUAgAACM4AAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGoIoG5IcHIcoBmA/U1RBVEQAgjoRCArmbM9fC4IGAAE2AiQDhAgEIAWETgeLWAwHG19CRUaGjQOAgPqFGVExunYUZYOyKvv/mCBFjtrYX9I3UCjbKpOIf8qCsjvlZKgZi7gsKeTJz2Zfnh43OkGZBs0dRTFLzOGbZbBsF4rboV/P+4kkI7Kn3vYteE55hMY+yeWhZ79+d2YXM0miySSRTCr590/jUKEEMYk0rSpJ/M0QzVmzySYkISEiTuIkISKGhSxatOAtpXoUKmLf40StovTEetqey7cnXqDmRI/HUjEOy+CRTr03FO7iTiYIMeitIBRXnKzVWc1yEFUC4PmHw9+592+xKOCA0kDXtgALNJBJESyU6IGIZ5IKXvRiVzuor2tAAAKB+nD9bvXfNM4kjr5/OsCjnm6cJtLgnPr5C3kh3QAgUGBIGgOuqX/CT1TR67QxDlG5FUCXTOByVTdNeK/ks3Vt0Hwog0cIwYNx8wZO/59Oq53RRAG78RzyEvhd0WhZRXVNgbUyklcefSuWIdl1tBAg2cskr8NeYN9VgB2inUOgDrAiLBrubouiOayvKMuz3ut9fjP9zmKxBglpxfLBvaO1hvoqUstZGSpuNbFNLjVkHjx4Wvqcn3tVPchczqLIodRFJ3JKziRdiL9+7mU5m8CJvTY/MaxK0aSQbk4Bpcrir+soFBYMIggZBYSOC8LHBxGSgsjZoDk4QJycIC5uaF5+kJAwtIgUSL0maM06oHXpBek3AG3QOMhii6FNmAS5zhTIaquhTVsDAsECDgP2A3YCr7+o0VAqKNmAqECJMTsNog2LHHi0IKRaXASCI6dg5TQra38AFPuYo2BRqMFYyCHvQICe+qO/CXblYbYROM9WTowA53nfMitwXk30DQPnfdfkGHA+DnQNAhUYoOb5m6teQ9J67u9hsAgw3vVNjAFNi9UA2cPwNwZ4PhuGCQJQEfRVQ7BtZ5vSBqgtOacKNj0+AsxbKNZwCRQoQCQy55TnPelhz7vX7W50xPP22eF5m6yxyqQxA1uJbqt0a1NSlBblB9XhrgGo7pqrAGpe7xVQHRg0gJpPBwZQ9aNIWNYFfJeikEvCtp2b0+NMeCcn9P7JESf5jgTpD32QONuXYANtjAa5yrgSU62hBW2TIEcMdFvAeL4500gnm2N32Qz3ifPDk+0MVNHYsq5/8Ez4hra7H/WUIXgni/jL5G8Mlp6KBA9DFageXkSK0v2jsh4ycMUl3BO78VeI6552cEDXFYwX4b5m911RbrjLv1fCA4WCgwo3ApQoGIjxSlBIQF2Z3+bX+Xx+nx9J7R1EoP4GblL9AAgVqtDk5BXUkSSkMKAoWAqroGg4ioKnECLFoFAsBsVhUjQWrcCmaBxagUvxhBRLTAm8FOKjRH6KE6CVIhQr7o+SlAbpoijdtEIPReulBIMUb8gfY8Qo2DiFTPpjzFgDstapBKna2RAAHP4iMKCnkT71shyQTS4TIdcjIARfi8LOeU9ifjc2P5gaZp6ez0AWrBJYpMCrGNNwwFmAYC0ActoQkL6lITKoGoJTHE2YBzRQIPtFadYOmiQHhzxAbVm+B9UyI3L0XJ7IZ3u8B7u7W5vtUHva1oam+Yas6ERH2t8FbWlj8002nDKzNx1pzmrhirybI0pO0pKIwgKQoD/Qr9BPoW+CfBOfxQfxTrweL8aZOObTPupPcb93NpKbPeqBzsUut7jOqSzLos46lN7emjk6Us6vUH2yiScYd9iSE8bQ5LPKQhCsoOSGtnmA3x30fgkQDK6BP8FV8ENn+SpnfOISqFWdnI5yAB+Y79w5vgeMG1yeGIymzHhTRsQC3hPveeMY+RjeVL5XKhJLCh3UU0MgjHCInHwHP2o44wGugr8Nxc938D/BgCPCiVjsBlklzHuTAGZAbwU6PzzlIkQgsiC2kM3D4Int3mTCvKEQSgiXQb4zNPAmFXhhwn/exBEMuUqZAJwAUDThwxt+eKuCcx6CJ1j40BA1OQBmTcjABhCEINcEgqfl9LQUnoQqs5IIsbzxgnDGG/cBQeHf7VRVshBAcIRAqEB7PQK7WAFOmQLcAgUERQnIyxFQFyLECJYShNfsbwnwGfAW5BOQSyBvGemr5hyyOeULX8IpA24ALrnES8M7I86Jx8zb6UI36mg9evHR5vNq53r4tosP4Q56F4AK4oLIDwKYd2VuwmGgcwD+0MjsoGcxoGUJYOQyYJVxwAOREaWpKou2TxshNmIjNmIbnk0w3bpqQFD7zkYXAcb94MIuUOXBROhSON17DBwCUkvWqkID1Ot80LhPvOleR7VIE7zDqe/JFIXBiHlaQNATZXOjSCRBGRhDPIgw1qZoAMzvpayHe917EiUNHQOzGi71GiFa9VsNAhFSlQFSjQhKOOEe5WQOZOb9nIeqWz9eFDOmSlIKatX0TKxswlIaNClr0abDgFFLrAFhIpCQc7RDkn1o7vP2cPdGTJiBBXQPb4i86ahV+tmwoNntHCcACnTlMFJeQ2Y8SCZHm46lUyMDs209GzfWuyQ0lG90g0w3r+hGLzd0URgqWkYWC/tSI+6WHVF2G4J+tUM8hEhclAysxxqZDAJT3+e2wN2BNwTeFHhLMNpSqfOTmgFOw8SUJYkUBZpnIloo0wI2AWZS4jDmbsTTogCjbDkw6RJVY309gK2hSvEi5bpks38ug9uaiGXL8yJkoxAIw/IyIAlnOHv4LJGHKgM27F5BsZM1eSB7YVAwBkah4LWAfcB4ALDmqJAAJ4Apf7Cy8QPQnhKnQPYD5Ox8ETAeChTTBgZXaPJVdFwNTEIYADrOJwcg7OsjBF9eYzj1vi54rgbcA8gbAM3BB3cA9SkcqsRIlB0mfPb7kLi5z/duC4229HX3bd0jKR/Oz0vufaGqwPjK76DVr2Jz+Dx7bj5j/14FeP5wSQGQxcSeptRVj8LExsHC5YSFKxr98WYQTBh5LQzxIpo0btgYH4y4KLIIihiHaQlJYhJTunXpRSfkxxCUoZNVvJNZcm5JCKxOTklBnoBdzd3LleG14bIa1VoBSy1CU2WBTiQeaDwQqOYFgE6AaAPgJDBgA8DgZwAsAayUl1WHD4OWgAJGcxRW6jZRPZfJWBugyXpqXrttLRxQDq3Sp7qajoKGdqvqyNAAYTZoHgR0wqJEu18PSxg0PB6mifyKgNcrs/qJ1eoqItFCqNTg9XqbyBETw1R3DY0F675r+eCOj0rlIu31k0kNbCmRaA2w1BoJUVmtoxlhPSwfFXuRqToqJgiDk2VvIpWIgQvCfI+IQZXiI3QW/uizZQmxJVy8BF+jN/KCIYOfCMNkom7ha2ryHro9MktanWZap42ZUqcQQvD0DypGkZOEwDPUWKB/1+YbGUhDaop6H7ZTjeQC/4NbonZcmALSCHfpS5v3D2FLi4zVhGQgY89jJ+nElHdifVJ56B9snSAENQjBaAUVdxEmpeyAUehfA+xZwYyi7QCz+l7sddfn76Sl+tHCIHUXQB7+4z3EwGkkv7vB5CGl8IBL0FieWe6Auo1YOtMFRjceEu4tjqudxhKTO8R+rMtDv/aYdY5NwkLZKKBaCj69HDu3e6vL4Mcu8jLFbUockriVlgimmUONrWAl1Upygm34zgwTJs9I8c+aqz+1ooYNi303dhiafPIPQH/2amnuk6bcOEn4D6qMqSt2sAg25XSl/J5BJA+kYFbIOPDQ1jGdxT6uhGXTYdVSbAD0Vqk5KCn1K4TFTobcwBKB2W0SHPPzj/G2TF1fcj//qsaN8fbDldhJCW0i8TA8stByBNwADQ7jII0T91/+Oki+/Xdd+Zbo2q1ZYRu2ERrF4cjViaF9VD84FYpqSEAprLSujBe9gUfhqfKBp/NAK6oOE9Tpn0U0ZLSrfjekDXaON6YMOCcbAW8d4WNlWFRGd0oey3p4f8Fo7d4xmTzgQ4BqoW70O9CSW0gue81pyKh/mzFit0vOoDAS0NUNyOSVKxnBn2wy+u7ogIE8G+f2kEPw2R+mht5R08N7uEI0MGPSUo3jBJPYc6SCAhhH/0Y/EgPRV64l9e3BHetviEODGf7LiKPIKNE2bA4pYYDO4HBmC+jenqLQ+caTP5Rfa40Rj7oW3ieVG0HHNmapbOf3PBqnoTCNI/n0UePmEg43HSQxl/h/wBTVwTekEbbgmnkQ3ZHjshWj56hZyPLwtSgruKuhefTf1ifIx/11C7bRkucTd3m7tZYnu0SI2AWdWhoczFjq69tg9zHXiSIISQU1Q5vHrE+q6exc35jIbfpf0GLMpmWHSDAhixT17U5ty9cQA+73DMYZwdZsj2IH16/aR+OKeXnqZOK+NdhQM/y2BjvqgQtvo5lhwbhE67fDWSLjHh2CL1/2jop02AtHPbh+oa6etz6w1schMqhIGUuxfP44V1Ymh+/+L09VzTZ7vXWEO6HrKX/qljWLOXgbEzfJcRvWTieGxBQwNPXxKwq3sfxCJ9KdV4VKYEx4D7OIT2kxLRFiZLhhQnwFlNFzuTG/CU+vw2hJlT7GnzBO0qJpU4CETQ12Kw9P2tPZK3cJXr0N4KJ67aobRis4es8bPStZdqlHlodaCjiGcBg0GL6ZTzuUQTGDfn5VAJqCxzqdBTYMZlmHmfAKLCNAnBh9UHD1TolJKUbml9sJoLNhOwHxsdOkihxjUj/lTC9mE7wOKzeqDCuPcZgVBPbMCoVikc01O7RRsVlNPBHdRMU3JE2Q75LF4lb+ls1d6FPxp+mUbEsSPJN3fq4KfD62VUBq3rs9kb6RTnfs3raiLOkDOOH6yUT1zIECTrku2XW5/9SlsLinE5NOByYjijpoyxj6N5satU3EBR7s61ElYx5Exs5ZIgvWUMDZ3HcI/pdWbfpliDrYqVCln5InSAO+OzrOHnybPQxCmnmujw+q0cJUmsi83KZSroVznvkvemtc7H4H+2RZ7KmPD74on7tAEkbJSPYJQGPmPaat1y+FGXQLyb/7wxw9LOZtHEh9eYtAdWuWmSdNzR7Yy4nKzF7ZcZg4ukmrXdMS5Q39KTmIPW9U2sNy38VCjXIsWYb8qyTSk+mozLM05XHj0u5ynRaNHw8crYMfk8AnwcJw/lNFyNbzd/2vc78xEJNuSsYBMRmnP63BzknV7oJVaAocNQROR91X4PCtsvByJ6tKbqQh8dRQ9eJBabLaoiRA/GKENWzdKtsywBMZAbe9GHHQALow7lYpu6pHXvy8hG9MSZ+zQo9ARQyNAmSDu41P/1gEX/nqanpbz8gvOEWpw2+GaMA6Ufs4KAeND9s6KGPlcYJCyiv+s92q8Ppv2+p1RaucWBwS/iytu3nl1TNf7l0uXSFzGFecSmLq1maMHGxwsAwLL2huZFQ7sHGqQV7zp9MQbesEKN9mnOuPjAQtaQRtb7rozuBimsBT+zUL3uUttDrhAsxnr9IuqTsb/pN0SjovFaVzozqcNW9f3zRP5eIW8MRJYkazN2McHJFb/TDoz4IJMKuy9A2nbjRnLCo+TmHbxi1WqZmKDUJAKeNx+y3+1AD48WGWyBe8FF9bzvboJvkaAu5mZmZ1SNZIYpgmxttWMoAJHaaoiHsx+V/T+KfdpwV/oNXeawcZ0PU6OoZ4A7WNamPena5rTFbJ1cTwGQtG/r3JsqTWM+pfhyhvGhEJtl2WC94IrLzzWV7tMd9yRAny8rXPX3ddsuQKpJ6FN4WkY1Z3bbG3Or47s7Y+GLSYIu7Sqtyy4q1mS6o6P1jea/VZgR7L+oZ7O5DOSCAUiQZDkU6ko7d/GOz/NRu/5SrJ8JQQSaclrUmt31TirGx4o4vtah0Jm1a3NBtXDQTLgIbO/pZWn/WZX7FrOcwQhXjX2QA/xVBe8IqUu7G4dqXH+AZNaPVbdihZKtiF0TL72Yidm3odfnLNCvq+XGcJ4PDOepW+GNxe3lA7607kyqmWsCqRENSYW9j3Npzo5/iaBu3mhblICi7CFS1WcBIC6Y/aLn/iXtSEVqqzJbp0YWePwlcf3WWRJufUpibvYmR5T3tDztFsFcLoUnrAbL9DXhs1EhbbZ5Q5e5lVwyLIJl7TKEH/HNVdjOaig5ap//0dqXN6/AmrWuBGfWzv8iFqGgt7YxcdR3mT0e5/556mvgGtLdmnT/gXqvz1EXf8ykyELtNtYBNA/0NaRuunSEoWIc6/8kp8sSWtmMk1ycaCwRZebbHXaGryjpb7/L5g1piUaloRN6vtoI28/zFc9PeNYBpvui9Pi5XMSZOmNxuWj5aCaat25h25rFGTj+ebfWF7c7ZGf/kXd9Cse0Ig/FKleux9b488YY2n6gC8sHtkaVrVmbHFrcVNCgVJZ/hJLjr1xSLdTe8pJQVNPpkvGeO1zblibSzQzu4PyYOuUA0V+/h1oTcwzB6J2iUzxL66yGymUEpMRpxCSYDSaZ2wTlypPEsI77NiuWrW9WIQNsIe3rc2xGlD/l7p2AAbQVj8Svnb4lEMPIsBWzrkrbIfOa24nA2TuUQJ7ot8l4x8t48SvJSBndhIM835aHn0m3KLtveZYTi7fW2hRQu0KAw6bUPpyWUrli9nazIt+QechVgm01TfnClksrCa65Ev47W8b7G9bTG/bRuvHKB7e4eWBBXDTaG0Rrv7XdnkLJrIlyyGBDtpG1w/rZRiQREqpJpaFTqJYTVINFr7uydAFMiP6M9/GEDn61/956QnEWqoCQYa9boGz2lAw8jQopUMI+vN+DQjwI8Paw0hqRxpTEvakwafucRe3uDeEyOo7PWCR15WLi2UDVP9ocAnov0fi5rFrwoAFR3Z84cisOYtG5FtuQUlUHdbIh7xyVU74FmVzB+PJG5DblERubz7TE7Tc3z2v6pHJf0hjluakvqu9MuGABnf0dPaGlDb/0Tdh74VL73rRZridQMzL/qOWrn8sMZiEHo46c9u+kvuNL1xhW+btmwsb8v1lkBdR9/w0LLlQ0N9HUhHJBaORqLhyLik9Kde4dPPYhYfbbWSYLiU+sajCb/6E2M3Tjey7oU4237d8xbFm+XxsNLoucE7iIz3dLWC77lyd1ezTpAI6eyBuNvBu/bAT/EtVUINR/aIPPS2qeaqsBHtCR1kq3darRsWaKZ0nUe+uUtIRNd7l5TIuucu8KTTBscOluaQxbOHSz99+8tRPsgeC6y4FzWqlWrtyV593Jdar6PFyECk6PT4Elb1sH1GucB+DHz/1yP68vmNllfsis9OFF0peo0tI9RGXfvAdKO8RYzyEUoEePXLtz9cF3w0Enp06Q8VhzEqXNsUcxkxMhI1huoSHCumBeMyF59Df3CsqTZ1S3Pm8uz0h9IOF295aUvuEliSkrcIf+rFNqngaUFdm2Eqapm6T9mFx2AixObh7dmBryTOYJtKokcwQ2zY7WrwL27OnHubHpuBxxmxtzPnwL7R0J0xawtvc8Or3Vy/PccycOPmCTS+3FbMNqxANlcsxqb7sH3YrMVs2FpDffw0Kaw6Bx6eMyCGR47RWBU3gM3wmdpkpMWnYEvWofwBGkJ75LbLmNNYkL/U1U/+yfumO7UJnz3Zf+eTrabr0J52UyRQ0ukbfG7EHE86bLaUK6EHyzMJXmKPPHl/vl/MXjycCH4RBNPztpmLh/IT1udvy9y2weo77gOPHNWVL4LmjdKgizew6Tbw7r2a3cckrxtKE+lWHOkq/b9o5nitumkvTAgydPh2ja/S19z4NI34CYWQmHAE8GTNSzLBnO7w+Tj48Xgo+djd1Kqfqyqfp/ECnqK+rGDF7j1+cxxQyLz81OV6cuVzlTh4Usg/T+IdlZBu5tYfiQDfyVIymaNfLOmZfFNO/+iSb2Ho8eq3B1icyT3/Yv/dG+JyBuiYR+pf7TkIzsWheF+2ty5ejH7m98blcHv4rmrMFa14vR3b/sYKFr2djbnSfax4/pLoac0amfx1g/QN2W4Zi3DGiziPqK9EKFWoT+/DvPR/VFXVVSrmFvOqnig4sRAsu5PnjDodqiu1om+9H7AJQmYLbzHdvotFV9JIoSqLBHgX/P4nee5QxNCusEP/jvcC+1vUOjQXn6ZT4zRi8GkD4Du3RDLEZg9JdBmdZBWLu8Ph+1CEj+ynhH7nMGKB9qbOSN4ldd6LflYjk9i/MK0GZXywDQaWVCA+qywd1piy/P+isL6hQQPuu1fesv8dIuedK6/zey0N6Y4waf0EMx6LkK15wXNSSZ8/b1pR83KDNARu6rbeqNPfYLW+oNcdE3E20xmbOOxNDPpmcBHOiF84nqqX9YT1Zs20Ys/MOnkF0yGM1CdsL1rJwls/25Fp3dk2yaJTnyGHfG5KISnCWffjw2fsFQPS97WgOlTbLb8dsePePqPmaWnSEkQUKbiEIZWsjmxnQ/cLxYG+XWqPGip/EEl4T6NG3xAZQwa9r7jjWSTrQxRpdBHDLltLARbv55c8O/nQDOWRuGVN2aPVTzVggH3n6cT+GN10Fz9bWwolot6gzV49KsZc6SKFD31FjcXbEshYS+/ygRXD8erxtiDIZi86Su6oo15tqhG3TVTVeCqkW8vY/GPxlYgCbD0tlYolEqnELBFbwI5ueavqxyy+dQy9jRL5qjH8XSryXeNXlMg2uAPfmlX/2Notb27VDpxthb3X7y0g2jK+G65ZUdjczXjsSE9At1Eg8ifzO3h6WSZuIlH3ndQeU6vYazw7Pi/pXzVV64MdirS5kTKdqTA9I4kM8Fg7X7LMF7Q/Wao1yXY9eAgB144f87dWDFbegyMEw/ZuzxoPQeDmj98mpzS7pevcnkDAeJmVXVFNnbI+fTLVahoGQZwQ0p/tI81aTYlF3j2UrmSE8KTX6bvje9mfNwh+mL0esNHjj6k+Wv0++kFWjBdXzgTP0C/wqf9pzyLPsmtY+Jp1lUGNHZyGoLmdmwX7ulK7lnOEeoVYisu+u0sdLrp9msu1mJEHuKtid2ZW1kwcjRK8DPkFoVXqpHhBAvgGX0JMC3xM1asWNy7+ZryIFn99PscaxsDo8TPe9XpVSlwZfwnd8YPlsd5c7d3wEJeFuSU0/IWiUg6EP1N34/xcWoZVknR6o1L2kb6aUaJQ+xiMRiolod/afF7zVaiNPpNKgdylNPo0ZhOd2twXdGlqenFycao/CzHir9g7k50+/isHl4hg2GqiUrGft168pULxs1BGXykUDdLb8l2WUA34LReoZrDW4IPmBUrEgAvvx4dP/053RQPCxRk/tVGOFYuWzmKWHNQwLI/4OaKlQe3u0j6bJL4iRlVEGkUlBqc6AH7H1yKyP/oGTIaEq6EB8aS9+kMqT4pYX3tGgE/Lzf0d60Ymh5cDG+p7LfqOKIK0xEORVCoUibcgSFTf0WNhfl+Nq2WRZ4YSRLoZR/qS/nm0NlvEWeCNW0Q5e32GoiTq6f+mzHslrn6HYjZ8RAR0CnjaeNTBHZ9MVbHdp98Wh3J2KFWLtbeTn3gYblmp25LrK9Ukp1uaLTbxIrzDPWT3Rv3bPrSOymS8q90am2BM0yoKteDk59sjecS3ObaIOUYjzwDSL5ah9RQW4+vq1dGFrLEIZD6r7neqEQEqqR4lmC8G8bc0vGqFxpiCP0lKVflgXXAW2W5wSWUhw9rhG44Y3gQkfB2SlK8vLVSsiNjM0q+vh2exUlc0mjhmkSTntPq+28QewtXFtNwUbLATitfDeYvqeTb3elOt9WkGh0EpZROMrgk7ff+juMjvS0Gjwk8uwUSkJuht1Bjw/934gscU0knTJh/YvWRewtck7npQNpa5v7fPzHHsIadO++n5O1qi0fbiwcZQ7Wb6vUwuV0HHc26apjbSNu6Bd8QXoCDQwRJ80bD9bfwluezVYa0wfOji9lMFWVGje65NlIp1MIcKuEcylTqZ9i4Gk/vFc6uS3M1VZps+11UNTgL0ruJazrqZynyUFLGWNS26crvV7ek43REOChfFc+KeNwzCt2fh7o0upiPkThSaC6qLVMZdVrD8I8Qe0zOKDgqZNdJmNVTtCbGYRQcgM0dGQGaOa485TUbq3G9t0QN/LcxvUjFVe579opLPb6TjQeYhrmK+LNZ0gEYOfIKkXufck9JAJwAaGluz8g1N3YrlCYdNXnE9POuQh+LRxK3ILWo+T3ifyWnlMDXqtuEYo+tALSNs3jBfHQROlBfZbf2JsdKgTpBM6sLhkI6V1E+I/iQzXuE6CP8yKNdk/N/4WHTPv+cOU3TKDqXfGjLxnrwe/dwmHuf0ScOahLF/0F51wIHvoQlenaj4ee3wxxT80oJX/l+9pwDj6a/qv7qa2Q+P1n1o8Wi9MgWL7pM8+uEsOPdBmCfQNULlT70IP6/23Hf8ytY+uGItv7tN/uEj+bSX5bMk8kkp+XyP/N95+RCJ/JlV/ugj+ZGX5QdW/F06tlOvJW98Im0TynT9yMK+xqGyJETa+b3aWCnfOh6vWd20Ydn/wLX28s4q2Vkxo+3wXGIpSfxfXPnWA9s+KZa1l1Lhm/LY4RoMPYkV2X0g39Yda6szNuOdWxtg+/WTKvl/CbWH43iXHH1V0auXSeTyERE9RPduswrHt9fUbJ9UjiEDg0OtoOlLW08Jln4tMTSa93wuHuzfpHWasnJdIfRY/ZgxEXBXon0/4ekzaM9Lro8DuZqxdvdYQMdu8KSr/z6z8kAxvHB6GgmtSXTezgVyb138icgztY5nIguR/v6uLiDYjT1Oj09OrhgbY2tyXG78aDIcbyyW4rlwJJYrFWONAHTjmoLd4iGV1UalbtpXXahA4qzdlavuNMMXQnO0w1XZYpDxe/CaH9zBJoLqGeGwy7dH7tnhsWB+ryoVza9ArDorZNzG+YcudzdsgR5aDhAgrf+81XxHJ9n7HYdGfwPw6OXNEAC8ONj9wn+5awV0x+IKB4yaQgCf27Rap5XS+f2s5l7sr7NlHYHBjcoCr0mFtqkrg6oqDrPYYhvhtqKv/Qd4a+euYOEdlHov2jbsMd/JQGomLs9BozNVSd/+AZWuYDHA0rJwDkHI2XS+lSZ5WCitxUPGD2jGAPif42cY2ctKxPOC70YNZc0TnAy8B5Pwb7w1HV/EH/EQXfG7Nci3HxIYgBwBAP96xyLQn8C92Em4ferq562UvRWABpTVLO7rKbTdQolPT+3q8g1NW4RRuniwPvXU3PM5LYi5fokUfb3T/hp1LfD/GlWc2tVqgzdY2aXRXQ48dUUbep27OEDONdR1khfX09fLEpgv/uWmGQEoahP0i80E2qWxcjLYEgFeCRN3SlifGj6FB6KPx0MqXUIEoL4Han/1zPmBCmiuihGVYa7FdcJ1f6LYv9MJFFpo1wLSru5lm7OsjZ94NEbTCyIIrRdKVcC90PzO9YLpHe2FwbOmF5ZGeb8qDrJBIAwgYvXCAgIid/o7Amw2bsKoLiOaDeo1aUCzteoDXwiYXCu+30WWcDMpg9NjwuCOTwZuZD6YB0YKvlBLFcRlKfkk84YnH9MLNxrQZZBBvT7wpem8y/PSCibCC40bI2FlZP6GrZOwRIUl/eFIVgx4v/FIKChI8MR3W5nH5JGz6YusNCEMY8u0aW2Q20cSnCiaGPjQCfQ0s0OWislkYpRda4S1Fxr0Okt1M2bMPW6UyRgZ9AvEJOcmYzc+Ly0Ui4d3z+o//QFDOJlCpdEZTBabQ3BR0dAxMLGwcXDx8AkIiYhJSMnIKSipqGloVdPRMzAyMbOwqmFj51DLycXNw8vHLyCIQmOwODyBSCJTqDQ6g8lic7g8vkAoEkukMrlCqVJrtLqg/QajyWxhaWVtY2tn7+Do5Ozi6ubu4enl7ePr2iKF9WWzFacfNJ9rp3plWQSLybFD/YL4PRBCyxq5wFOyGBtnQVQyBSa3AiW9cTAxW+mhwVC5WeibK0891vtNhnpiW/8N3hhfTnpYv/1+fwIjE0mo0ApR4RmWSWYDK1Np0ekdXbArccAdwtF9n5OunJG867a4ZsSPKmDiE3nABEGznWGCuWUohdJBgUxIAbNWNXW55pR+ippqiB5TYKf9aLSu6BlXYm7HsO9gxkSsIQpqaCZ22v17rjHRSdENRvm1CP2EB2A/zcfkjfT29YyPdsf3f4mnT13oSbvV5bnuVojNXp6h3YBLZ6TYgXaG7Yw+4De/8cx3Ag==";
var MILO_THAI_FONT_700_BASE64 = "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";

// server/milo/vectorText.ts
var thaiRegularFont = fontkit.create(Buffer.from(MILO_THAI_FONT_400_BASE64, "base64"));
var thaiBoldFont = fontkit.create(Buffer.from(MILO_THAI_FONT_700_BASE64, "base64"));
var latinRegularFont = fontkit.create(Buffer.from(MILO_LATIN_FONT_400_BASE64, "base64"));
var latinBoldFont = fontkit.create(Buffer.from(MILO_LATIN_FONT_700_BASE64, "base64"));
var graphemeSegmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
function esc(value) {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]);
}
function normalizeRenderText(value) {
  return value.normalize("NFC").replace(/[\u00A0\u202F]/g, " ").replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}
function fontsFor(bold) {
  return bold ? [{ key: "thai", font: thaiBoldFont }, { key: "latin", font: latinBoldFont }] : [{ key: "thai", font: thaiRegularFont }, { key: "latin", font: latinRegularFont }];
}
function codePoints(value) {
  return Array.from(value).map((char) => ({ char, value: char.codePointAt(0) }));
}
function fontSupports(font, value) {
  return codePoints(value).every(({ char, value: cp }) => /^\s$/.test(char) || font.glyphForCodePoint(cp).id !== 0);
}
function selectFont(value, bold) {
  return fontsFor(bold).find((candidate) => fontSupports(candidate.font, value));
}
function findMissingGlyphs(text2, bold = false) {
  const normalized = normalizeRenderText(text2);
  const missing = /* @__PURE__ */ new Map();
  for (const { segment } of Array.from(graphemeSegmenter.segment(normalized))) {
    if (/^\s+$/.test(segment) || selectFont(segment, bold)) continue;
    for (const { char, value: cp } of codePoints(segment)) {
      if (/^\s$/.test(char)) continue;
      if (fontsFor(bold).some((candidate) => candidate.font.glyphForCodePoint(cp).id !== 0)) continue;
      const codePoint = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
      missing.set(`${char}:${codePoint}`, { char, codePoint });
    }
  }
  return Array.from(missing.values());
}
function assertRenderableText(text2, bold = false, field = "text") {
  const missing = findMissingGlyphs(text2, bold);
  if (!missing.length) return;
  const codes = missing.map((item) => `${item.codePoint}(${JSON.stringify(item.char)})`).join(", ");
  throw new Error(`Missing render glyph in ${field}: ${codes}`);
}
function splitRuns(text2, bold) {
  const normalized = normalizeRenderText(text2);
  const runs = [];
  for (const { segment } of Array.from(graphemeSegmenter.segment(normalized))) {
    let choice;
    if (/^\s+$/.test(segment)) {
      const previous2 = runs.at(-1);
      choice = previous2 ? { key: previous2.key, font: previous2.font } : fontsFor(bold)[1];
    } else {
      choice = selectFont(segment, bold);
    }
    if (!choice) {
      assertRenderableText(segment, bold, "text-run");
      continue;
    }
    const previous = runs.at(-1);
    if (previous?.key === choice.key) previous.text += segment;
    else runs.push({ ...choice, text: segment });
  }
  return runs;
}
function runMetrics(runs, fontSize) {
  const shaped = runs.map((run) => {
    const scale = fontSize / run.font.unitsPerEm;
    const layout = run.font.layout(run.text);
    return { ...run, scale, layout, width: layout.advanceWidth * scale };
  });
  const advance = shaped.reduce((sum, run) => sum + run.width, 0);
  const ascent = Math.max(...shaped.map((run) => run.font.ascent * run.scale), fontSize * 0.8);
  const descent = Math.max(...shaped.map((run) => Math.abs(run.font.descent * run.scale)), fontSize * 0.2);
  return { shaped, advance, ascent, descent };
}
function vectorTextSvg(text2, options) {
  const normalized = normalizeRenderText(text2);
  assertRenderableText(normalized, Boolean(options.bold));
  const runs = splitRuns(normalized, Boolean(options.bold));
  const { shaped, advance, ascent, descent } = runMetrics(runs, options.fontSize);
  const align = options.align ?? "left";
  const startX = align === "right" ? Math.max(0, options.width - advance) : align === "center" ? Math.max(0, (options.width - advance) / 2) : 0;
  const height = options.height ?? Math.ceil(ascent + descent + options.fontSize * 0.18);
  const baseline = Math.ceil(ascent + options.fontSize * 0.06);
  let x = startX;
  const paths = [];
  for (const run of shaped) {
    let runX = x;
    for (let i = 0; i < run.layout.glyphs.length; i += 1) {
      const glyph = run.layout.glyphs[i];
      const pos = run.layout.positions[i];
      if (glyph.id === 0) throw new Error(`Unexpected .notdef glyph while rendering ${JSON.stringify(run.text)}`);
      const d = glyph.path.toSVG();
      const gx = runX + pos.xOffset * run.scale;
      const gy = baseline - pos.yOffset * run.scale;
      paths.push(`<path d="${esc(d)}" transform="translate(${gx.toFixed(3)} ${gy.toFixed(3)}) scale(${run.scale.toFixed(6)} ${(-run.scale).toFixed(6)})" fill="${options.color}"/>`);
      runX += pos.xAdvance * run.scale;
    }
    x += run.width;
  }
  return Buffer.from(`<svg width="${options.width}" height="${height}" viewBox="0 0 ${options.width} ${height}" xmlns="http://www.w3.org/2000/svg"><g>${paths.join("")}</g></svg>`);
}

// server/milo/referenceArtwork.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
async function loadRichMenuReference(key) {
  const file = RICH_MENU_ARTWORK[key].file;
  const candidates = [
    path.join(process.cwd(), "client", "public", "richmenu", file),
    path.join(process.cwd(), "dist", "public", "richmenu", file),
    path.join(process.cwd(), "richmenu", file)
  ];
  let lastError;
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Milo reference artwork not found for ${key}: ${lastError instanceof Error ? lastError.message : "unknown"}`);
}

// server/milo/richMenuDataImage.ts
var WIDTH = 1080;
var HEIGHT = 1350;
var DATA_KEYS = /* @__PURE__ */ new Set(["analysis", "budget", "transactions", "categories"]);
var titleByKey = {
  analysis: "\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19",
  budget: "\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13",
  transactions: "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14",
  categories: "\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48"
};
function secret() {
  return process.env.LINE_CHANNEL_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || "milo-richmenu-data-image-v1";
}
function clean(value) {
  const withoutPictographs = Array.from(value.normalize("NFC")).filter((char) => {
    const cp = char.codePointAt(0) ?? 0;
    return cp !== 65039 && !(cp >= 126976 && cp <= 129791) && !(cp >= 9728 && cp <= 10175);
  }).join("");
  return withoutPictographs.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").replace(/\r/g, "").trim();
}
function compactText(value) {
  const normalized = clean(value).slice(0, 1e3);
  return normalized || "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E41\u0E2A\u0E14\u0E07\u0E1C\u0E25";
}
function encode(key, text2) {
  const payload = JSON.stringify({ key, text: compactText(text2) });
  return deflateRawSync(Buffer.from(payload, "utf8"), { level: 9 }).toString("base64url");
}
function sign(data) {
  return crypto2.createHmac("sha256", secret()).update(data).digest("hex");
}
function isDynamicRichMenuArtwork(key) {
  return DATA_KEYS.has(key);
}
function buildRichMenuDataImageUrl(key, text2) {
  if (!isDynamicRichMenuArtwork(key)) throw new Error(`Artwork ${key} is not data-driven`);
  const base = (process.env.MILO_APP_BASE_URL ?? process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? "https://milo-line-app.vercel.app").replace(/\/+$/, "");
  const data = encode(key, text2);
  return `${base}/api/milo/rich-menu-card.png?data=${encodeURIComponent(data)}&sig=${sign(data)}&render=richmenu-data-v1`;
}
function decode(req) {
  const data = typeof req.query.data === "string" ? req.query.data : "";
  const supplied = typeof req.query.sig === "string" ? req.query.sig : "";
  if (!data || data.length > 3500 || !supplied) return void 0;
  const expected = sign(data);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto2.timingSafeEqual(a, b)) return void 0;
  try {
    const parsed = JSON.parse(inflateRawSync(Buffer.from(data, "base64url")).toString("utf8"));
    if (!parsed.key || !isDynamicRichMenuArtwork(parsed.key) || typeof parsed.text !== "string") return void 0;
    return { key: parsed.key, text: compactText(parsed.text) };
  } catch {
    return void 0;
  }
}
var segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
function wrapLine(value, max = 42) {
  const parts = Array.from(segmenter.segment(value)).map((item) => item.segment);
  const lines = [];
  for (let i = 0; i < parts.length; i += max) lines.push(parts.slice(i, i + max).join(""));
  return lines.length ? lines : [""];
}
function wrappedLines(text2) {
  const lines = clean(text2).split("\n").flatMap((line) => wrapLine(line.trim(), 42));
  const maxLines = 24;
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), "\u2026"];
}
function layer(text2, left, top, width, fontSize, color, bold = false) {
  return { input: vectorTextSvg(text2, { width, fontSize, color, bold }), left, top, blend: "over" };
}
function shapes(key, lineCount = 0) {
  const accent = key === "analysis" ? "#27C88B" : key === "budget" ? "#28B875" : key === "transactions" ? "#E96F9B" : "#6B8FDF";
  const soft = key === "analysis" ? "#E8FFF4" : key === "budget" ? "#EDFFF4" : key === "transactions" ? "#FFF0F5" : "#F0F4FF";
  const rows = Array.from({ length: Math.min(Math.max(lineCount, 1), 14) }, (_, i) => {
    const y = 366 + i * 48;
    const fill = i % 2 === 0 ? "#FFFFFF" : "#FAFFFC";
    return `<rect x="112" y="${y}" width="856" height="40" rx="14" fill="${fill}" fill-opacity=".96"/>`;
  }).join("");
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="13" flood-color="#3D8066" flood-opacity=".15"/></filter></defs>
    <rect x="76" y="188" width="928" height="962" rx="38" fill="#FFFDF9" fill-opacity=".94" filter="url(#shadow)"/>
    <rect x="100" y="214" width="880" height="116" rx="28" fill="${soft}" fill-opacity=".98"/>
    <circle cx="154" cy="272" r="30" fill="${accent}"/>
    <circle cx="143" cy="262" r="6" fill="#fff"/><circle cx="165" cy="262" r="6" fill="#fff"/>
    <path d="M140 283 Q154 296 168 283" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    ${rows}
    <rect x="100" y="1092" width="880" height="42" rx="21" fill="#E8FAF2"/>
  </svg>`);
}
async function renderRichMenuDataImage(key, text2) {
  if (!isDynamicRichMenuArtwork(key)) throw new Error(`Artwork ${key} is not data-driven`);
  const title = titleByKey[key] ?? "Milo";
  const lines = wrappedLines(text2);
  const reference = await loadRichMenuReference(key);
  const layers = [
    layer(title, 208, 228, 650, 38, "#3F3552", true),
    layer("\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E23\u0E34\u0E07\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\u0E08\u0E32\u0E01\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13", 208, 276, 650, 20, "#6F8D82")
  ];
  lines.forEach((lineText, index2) => {
    const bold = index2 === 0 || /^สรุป|^หมวด|^รายการ|^รายรับ|^รายจ่าย|^ข้อมูล|^ข้อสังเกต|^แนวทาง/.test(lineText);
    layers.push(layer(lineText || " ", 132, 374 + index2 * 48, 812, 20, bold ? "#3E594F" : "#625971", bold));
  });
  layers.push(
    layer("Milo \u2022 \u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E23\u0E34\u0E07\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E1A\u0E19\u0E14\u0E35\u0E44\u0E0B\u0E19\u0E4C\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A", 132, 1100, 800, 17, "#3B7F69", true)
  );
  return sharp(reference).resize(WIDTH, HEIGHT, { fit: "fill" }).composite([{ input: shapes(key, lines.length), blend: "over" }, ...layers]).png().toBuffer();
}
function registerRichMenuDataImageRoute(app2) {
  app2.get("/api/milo/rich-menu-card.png", async (req, res) => {
    const input = decode(req);
    if (!input) return res.status(401).type("text/plain").send("Invalid rich-menu image link");
    try {
      const image = await renderRichMenuDataImage(input.key, input.text);
      res.set({ "Content-Type": "image/png", "Cache-Control": "private, no-store, max-age=0" });
      return res.status(200).send(image);
    } catch (error) {
      console.error("[Milo Rich Menu Image] render failed", error);
      return res.status(500).type("text/plain").send("Unable to render rich-menu image");
    }
  });
}

// server/milo/budgetStatus.ts
function getBudgetMetrics(spent, limit) {
  const safeSpent = Number.isFinite(spent) ? Math.max(0, spent) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 0;
  if (safeLimit <= 0) return { usagePercent: 0, overPercent: 0, remaining: 0, isOverBudget: false };
  const usagePercent = Math.max(0, Math.round(safeSpent / safeLimit * 100));
  const remaining = safeLimit - safeSpent;
  const isOverBudget = safeSpent > safeLimit;
  const rawOverPercent = isOverBudget ? (safeSpent - safeLimit) / safeLimit * 100 : 0;
  const overPercent = isOverBudget ? Math.max(1, Math.round(rawOverPercent)) : 0;
  return { usagePercent, overPercent, remaining, isOverBudget };
}
function budgetStatusCopy(category, spent, limit) {
  if (!(Number.isFinite(limit) && limit > 0)) return "";
  const metrics = getBudgetMetrics(spent, limit);
  return metrics.isOverBudget ? `\u0E2B\u0E21\u0E27\u0E14${category}\u0E17\u0E30\u0E25\u0E38\u0E44\u0E1B ${metrics.overPercent}% \u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30 \u0E40\u0E1A\u0E32\u0E44\u0E14\u0E49\u0E40\u0E1A\u0E32 \u0E40\u0E2B\u0E21\u0E35\u0E22\u0E27` : `\u0E2B\u0E21\u0E27\u0E14${category}\u0E43\u0E0A\u0E49\u0E44\u0E1B ${metrics.usagePercent}% \u0E02\u0E2D\u0E07\u0E07\u0E1A\u0E41\u0E25\u0E49\u0E27\u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30`;
}

// server/milo/financeReportImage.ts
import crypto3 from "node:crypto";
import sharp2 from "sharp";
var WIDTH2 = 1080;
var HEIGHT2 = 1350;
var money = (value) => value.toLocaleString("th-TH-u-nu-latn", { maximumFractionDigits: 2 });
var periodLabel = {
  day: "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49",
  week: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49",
  month: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49",
  year: "\u0E1B\u0E35\u0E19\u0E35\u0E49"
};
function secret2() {
  return process.env.LINE_CHANNEL_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || "milo-report-image-v1";
}
function iso(value) {
  if (!value) return void 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : void 0;
}
function encodePayload(input) {
  const categories = Object.fromEntries(Object.entries(input.categories).filter(([name, amount]) => name.trim() && Number.isFinite(Number(amount)) && Number(amount) >= 0).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 6).map(([name, amount]) => [name.slice(0, 40), Number(amount)]));
  const rows = (input.rows ?? []).slice(0, 5).map((row) => ({
    transactionType: row.transactionType,
    amount: Number(row.amount),
    category: String(row.category ?? "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B").slice(0, 36),
    note: row.note ? String(row.note).slice(0, 48) : void 0,
    occurredAt: iso(row.occurredAt)
  })).filter((row) => Number.isFinite(row.amount) && row.amount >= 0);
  return Buffer.from(JSON.stringify({
    period: input.period,
    income: Number(input.income),
    expense: Number(input.expense),
    balance: Number(input.balance),
    categories,
    transactionCount: Number(input.transactionCount ?? input.rows?.length ?? 0),
    start: iso(input.start),
    end: iso(input.end),
    rows,
    title: input.title?.slice(0, 80),
    subtitle: input.subtitle?.slice(0, 120)
  })).toString("base64url");
}
function sign2(payload) {
  return crypto3.createHmac("sha256", secret2()).update(payload).digest("hex");
}
function buildFinanceReportImageUrl(input) {
  const base = (process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? process.env.MILO_APP_BASE_URL ?? "https://milo-line-app.vercel.app").replace(/\/+$/, "");
  const data = encodePayload(input);
  return `${base}/api/milo/finance-report.png?data=${encodeURIComponent(data)}&sig=${sign2(data)}&render=summary-v4`;
}
function validNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : void 0;
}
function decodeInput(req) {
  const data = typeof req.query.data === "string" ? req.query.data : "";
  const supplied = typeof req.query.sig === "string" ? req.query.sig : "";
  if (!data || data.length > 8e3 || !supplied) return void 0;
  const expected = sign2(data);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto3.timingSafeEqual(a, b)) return void 0;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!parsed.period || !["day", "week", "month", "year"].includes(parsed.period)) return void 0;
    const income = validNumber(parsed.income);
    const expense = validNumber(parsed.expense);
    const balance = validNumber(parsed.balance);
    if (income === void 0 || expense === void 0 || balance === void 0) return void 0;
    const categories = {};
    for (const [name, amount] of Object.entries(parsed.categories ?? {}).slice(0, 6)) {
      const n = validNumber(amount);
      if (name.trim() && n !== void 0 && n >= 0) categories[name.trim().slice(0, 40)] = n;
    }
    const rows = (parsed.rows ?? []).slice(0, 5).flatMap((raw) => {
      const amount = validNumber(raw.amount);
      if (amount === void 0 || amount < 0 || raw.transactionType !== "income" && raw.transactionType !== "expense") return [];
      return [{ transactionType: raw.transactionType, amount, category: String(raw.category ?? "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B").slice(0, 36), note: raw.note ? String(raw.note).slice(0, 48) : void 0, occurredAt: iso(raw.occurredAt) }];
    });
    return {
      period: parsed.period,
      income,
      expense,
      balance,
      categories,
      transactionCount: Math.max(0, Math.floor(Number(parsed.transactionCount ?? rows.length) || 0)),
      start: iso(parsed.start),
      end: iso(parsed.end),
      rows,
      title: parsed.title?.slice(0, 80),
      subtitle: parsed.subtitle?.slice(0, 120)
    };
  } catch {
    return void 0;
  }
}
function textLayer(text2, options) {
  return { input: vectorTextSvg(text2, { width: options.width, fontSize: options.fontSize, color: options.color, bold: options.bold, align: options.align }), left: options.left, top: options.top, blend: "over" };
}
function periodRange(input) {
  if (!input.start) return `\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A - \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22${periodLabel[input.period]}`;
  const start = new Date(input.start);
  if (!Number.isFinite(start.getTime())) return `\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A - \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22${periodLabel[input.period]}`;
  const formatter = new Intl.DateTimeFormat("th-TH-u-nu-latn", input.period === "year" ? { year: "numeric", timeZone: "Asia/Bangkok" } : input.period === "month" ? { month: "long", year: "numeric", timeZone: "Asia/Bangkok" } : { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  if (input.period === "day" || input.period === "month" || input.period === "year") return formatter.format(start);
  const end = input.end ? new Date(new Date(input.end).getTime() - 1) : void 0;
  return end && Number.isFinite(end.getTime()) ? `${formatter.format(start)} \u2013 ${formatter.format(end)}` : formatter.format(start);
}
function insightCopy(input) {
  if ((input.transactionCount ?? 0) === 0) return "\u0E40\u0E23\u0E34\u0E48\u0E21\u0E08\u0E14\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u0E41\u0E25\u0E49\u0E27\u0E44\u0E21\u0E42\u0E25\u0E08\u0E30\u0E0A\u0E48\u0E27\u0E22\u0E2A\u0E23\u0E38\u0E1B\u0E43\u0E2B\u0E49\u0E40\u0E2B\u0E47\u0E19\u0E20\u0E32\u0E1E\u0E0A\u0E31\u0E14\u0E02\u0E36\u0E49\u0E19\u0E04\u0E23\u0E31\u0E1A";
  if (input.balance < 0) return `\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A ${money(Math.abs(input.balance))} \u0E1A\u0E32\u0E17 \u0E25\u0E2D\u0E07\u0E14\u0E39\u0E2B\u0E21\u0E27\u0E14\u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14\u0E01\u0E48\u0E2D\u0E19\u0E19\u0E30\u0E04\u0E23\u0E31\u0E1A`;
  if (input.income > 0) {
    const rate = Math.max(0, Math.round(input.balance / input.income * 100));
    return `\u0E0A\u0E48\u0E27\u0E07\u0E19\u0E35\u0E49\u0E22\u0E31\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D ${money(input.balance)} \u0E1A\u0E32\u0E17 \u0E04\u0E34\u0E14\u0E40\u0E1B\u0E47\u0E19\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13 ${rate}% \u0E02\u0E2D\u0E07\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E04\u0E23\u0E31\u0E1A`;
  }
  return `\u0E0A\u0E48\u0E27\u0E07\u0E19\u0E35\u0E49\u0E21\u0E35\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 ${money(input.expense)} \u0E1A\u0E32\u0E17 \u0E44\u0E21\u0E42\u0E25\u0E0A\u0E48\u0E27\u0E22\u0E41\u0E22\u0E01\u0E2B\u0E21\u0E27\u0E14\u0E44\u0E27\u0E49\u0E43\u0E2B\u0E49\u0E41\u0E25\u0E49\u0E27\u0E04\u0E23\u0E31\u0E1A`;
}
function displayRowDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH-u-nu-latn", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(date);
}
function financeReportShapesSvg(input) {
  const categories = Object.entries(input.categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCategory = Math.max(...categories.map(([, amount]) => amount), 1);
  const categoryBars = categories.map(([, amount], index2) => {
    const y = 594 + index2 * 58;
    const width = Math.max(12, Math.round(350 * Math.min(1, amount / maxCategory)));
    return `<rect x="132" y="${y + 28}" width="350" height="14" rx="7" fill="#EAF4EF"/><rect x="132" y="${y + 28}" width="${width}" height="14" rx="7" fill="${index2 === 0 ? "#32C88A" : "#8EDDBF"}"/>`;
  }).join("");
  const total = Math.max(input.income + input.expense, 1);
  const incomeWidth = Math.max(8, Math.round(255 * input.income / total));
  const expenseWidth = Math.max(8, Math.round(255 * input.expense / total));
  return Buffer.from(`<svg width="${WIDTH2}" height="${HEIGHT2}" viewBox="0 0 ${WIDTH2} ${HEIGHT2}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#3E8A69" flood-opacity=".16"/></filter></defs>
    <rect x="60" y="188" width="960" height="1012" rx="38" fill="#FFFDF8" fill-opacity=".97" filter="url(#shadow)"/>
    <rect x="92" y="282" width="276" height="150" rx="28" fill="#E6FFF2"/>
    <rect x="402" y="282" width="276" height="150" rx="28" fill="#FFE9F1"/>
    <rect x="712" y="282" width="276" height="150" rx="28" fill="#EEE8FF"/>
    <rect x="92" y="466" width="522" height="402" rx="30" fill="#F8FFFB" stroke="#BDEDD7" stroke-width="2"/>
    <rect x="642" y="466" width="346" height="402" rx="30" fill="#FFF8FC" stroke="#F1C8D8" stroke-width="2"/>
    <rect x="92" y="892" width="896" height="232" rx="30" fill="#FBF9FF" stroke="#DDD1F3" stroke-width="2"/>
    <rect x="92" y="1140" width="896" height="44" rx="22" fill="#E7FAF1"/>
    <circle cx="815" cy="616" r="88" fill="none" stroke="#E4F5EE" stroke-width="24"/>
    <circle cx="815" cy="616" r="88" fill="none" stroke="#39C98D" stroke-width="24" stroke-linecap="round" stroke-dasharray="350 560" transform="rotate(-90 815 616)"/>
    <rect x="690" y="742" width="255" height="14" rx="7" fill="#E5F2ED"/><rect x="690" y="742" width="${incomeWidth}" height="14" rx="7" fill="#35C78C"/>
    <rect x="690" y="792" width="255" height="14" rx="7" fill="#F8E4EC"/><rect x="690" y="792" width="${expenseWidth}" height="14" rx="7" fill="#EB78A1"/>
    ${categoryBars}
  </svg>`);
}
async function renderFinanceReportImage(input) {
  const referenceKey = `report-${input.period}`;
  const reference = await loadRichMenuReference(referenceKey);
  const title = input.title?.trim() || `\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19${periodLabel[input.period]}`;
  const subtitle = input.subtitle?.trim() || periodRange(input);
  const categories = Object.entries(input.categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rows = (input.rows ?? []).slice(0, 4).map((row) => ({ ...row, amount: Number(row.amount), occurredAt: iso(row.occurredAt) }));
  const transactionCount = input.transactionCount ?? input.rows?.length ?? 0;
  const savingsRate = input.income > 0 ? Math.round(input.balance / input.income * 100) : 0;
  const topCategory = categories[0];
  const layers = [
    textLayer(title, { left: 108, top: 210, width: 650, fontSize: 38, color: "#214A3D", bold: true }),
    textLayer(subtitle, { left: 108, top: 250, width: 760, fontSize: 20, color: "#6D8C81" }),
    textLayer("\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A", { left: 112, top: 310, width: 220, fontSize: 20, color: "#548B7B" }),
    textLayer(`${money(input.income)} \u0E1A\u0E32\u0E17`, { left: 112, top: 350, width: 230, fontSize: 34, color: "#16875F", bold: true }),
    textLayer("\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22", { left: 422, top: 310, width: 220, fontSize: 20, color: "#A46A82" }),
    textLayer(`${money(input.expense)} \u0E1A\u0E32\u0E17`, { left: 422, top: 350, width: 230, fontSize: 34, color: "#CF4F80", bold: true }),
    textLayer("\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D", { left: 732, top: 310, width: 220, fontSize: 20, color: "#74668D" }),
    textLayer(`${money(input.balance)} \u0E1A\u0E32\u0E17`, { left: 732, top: 350, width: 230, fontSize: 34, color: input.balance >= 0 ? "#3C7562" : "#C05076", bold: true }),
    textLayer("\u0E2A\u0E31\u0E14\u0E2A\u0E48\u0E27\u0E19\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E15\u0E32\u0E21\u0E2B\u0E21\u0E27\u0E14", { left: 112, top: 494, width: 450, fontSize: 26, color: "#355E50", bold: true }),
    textLayer("\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21", { left: 682, top: 494, width: 250, fontSize: 26, color: "#624F76", bold: true }),
    textLayer("\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D", { left: 706, top: 540, width: 220, fontSize: 19, color: "#8B7895" }),
    textLayer(`${savingsRate}%`, { left: 706, top: 574, width: 220, fontSize: 48, color: savingsRate >= 0 ? "#25936D" : "#C45F82", bold: true }),
    textLayer("\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A", { left: 690, top: 704, width: 100, fontSize: 18, color: "#508B7B" }),
    textLayer("\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22", { left: 690, top: 754, width: 100, fontSize: 18, color: "#A96B83" }),
    textLayer("\u0E08\u0E33\u0E19\u0E27\u0E19\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23", { left: 690, top: 814, width: 230, fontSize: 18, color: "#85758F" }),
    textLayer(`${transactionCount.toLocaleString("th-TH-u-nu-latn")} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23`, { left: 690, top: 840, width: 230, fontSize: 28, color: "#4E435F", bold: true }),
    textLayer(topCategory ? `\u0E2B\u0E21\u0E27\u0E14\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14: ${topCategory[0]}` : "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22", { left: 690, top: 866, width: 250, fontSize: 18, color: "#765F72", bold: true }),
    textLayer("\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14", { left: 112, top: 914, width: 330, fontSize: 26, color: "#4B4260", bold: true })
  ];
  if (!categories.length) {
    layers.push(textLayer("\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E19\u0E35\u0E49", { left: 105, top: 620, width: 470, fontSize: 27, color: "#849B96" }));
  } else {
    categories.forEach(([name, amount], index2) => {
      const y = 540 + index2 * 58;
      const share = input.expense > 0 ? Math.round(amount / input.expense * 100) : 0;
      layers.push(
        textLayer(name, { left: 112, top: y, width: 180, fontSize: 21, color: "#5E716C", bold: index2 === 0 }),
        textLayer(`${money(amount)} \u0E1A\u0E32\u0E17 \u2022 ${share}%`, { left: 350, top: y, width: 220, fontSize: 20, color: "#A45A75", bold: true, align: "right" })
      );
    });
  }
  if (!rows.length) {
    layers.push(textLayer("\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32\u0E19\u0E35\u0E49", { left: 112, top: 970, width: 760, fontSize: 25, color: "#8A8097" }));
  } else {
    rows.forEach((row, index2) => {
      const y = 960 + index2 * 40;
      const label = (row.note?.trim() || row.category).slice(0, 34);
      const signed = row.transactionType === "income" ? "+" : "-";
      layers.push(
        textLayer(label, { left: 112, top: y, width: 410, fontSize: 20, color: "#5D536B", bold: index2 === 0 }),
        textLayer(`${signed}${money(Number(row.amount))} \u0E1A\u0E32\u0E17`, { left: 530, top: y, width: 185, fontSize: 20, color: row.transactionType === "income" ? "#2E9577" : "#C35F82", bold: true, align: "right" }),
        textLayer(displayRowDate(row.occurredAt), { left: 742, top: y, width: 210, fontSize: 18, color: "#94879E", align: "right" })
      );
    });
  }
  layers.push(
    textLayer("Milo \u0E41\u0E19\u0E30\u0E19\u0E33", { left: 112, top: 1150, width: 140, fontSize: 17, color: "#2E9577", bold: true }),
    textLayer(insightCopy({ ...input, transactionCount }), { left: 252, top: 1150, width: 700, fontSize: 16, color: "#5A6B66" })
  );
  return sharp2(reference).resize(WIDTH2, HEIGHT2, { fit: "fill" }).composite([{ input: financeReportShapesSvg({ ...input, transactionCount }), blend: "over" }, ...layers]).png().toBuffer();
}
function registerFinanceReportImageRoute(app2) {
  app2.get("/api/milo/finance-report.png", async (req, res) => {
    const input = decodeInput(req);
    if (!input) return res.status(401).type("text/plain").send("Invalid finance report image link");
    try {
      const image = await renderFinanceReportImage(input);
      res.set({ "Content-Type": "image/png", "Cache-Control": "private, no-store, max-age=0" });
      return res.status(200).send(image);
    } catch (error) {
      console.error("[Milo Finance Report Image] render failed", error);
      return res.status(500).type("text/plain").send("Unable to render finance report image");
    }
  });
}

// server/milo/line.ts
import crypto4 from "node:crypto";
function lineCredentials() {
  return { channelSecret: process.env.LINE_CHANNEL_SECRET ?? "", channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "" };
}
function verifyLineSignature(body, signature, secret3) {
  if (!signature || !secret3) return false;
  const computed = Buffer.from(crypto4.createHmac("sha256", secret3).update(body).digest("base64"));
  const supplied = Buffer.from(signature);
  return computed.length === supplied.length && crypto4.timingSafeEqual(computed, supplied);
}
function sourceIdentity(source) {
  if (source.type === "user") return { lineChatId: source.userId, lineUserId: source.userId, scope: "user" };
  if (source.type === "group") return { lineChatId: source.groupId, lineUserId: source.userId, scope: "group" };
  return { lineChatId: source.roomId, lineUserId: source.userId, scope: "room" };
}
async function callLine(path4, credentials, init) {
  const response = await fetch(`https://api.line.me${path4}`, { ...init, headers: { Authorization: `Bearer ${credentials.channelAccessToken}`, ...init.headers } });
  if (!response.ok) throw new Error(`LINE API ${response.status}: ${await response.text()}`);
  console.info("[Milo LINE] message delivered", { endpoint: path4, status: response.status });
  return response;
}
var MILO_RICH_MENU_IMAGE_BASE_URL = (process.env.MILO_RICH_MENU_IMAGE_BASE_URL ?? "https://milo-line-app.vercel.app/milo-richmenu").replace(/\/+$/, "");
function miloRichMenuImageUrl(key) {
  const extension = key === "save-complete-preview" ? "jpg" : "png";
  return `${MILO_RICH_MENU_IMAGE_BASE_URL}/${key}.${extension}`;
}
function miloSaveResultImageUrl(summary) {
  const appBaseUrl = (process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? "https://milo-line-app.vercel.app").replace(/\/+$/, "");
  const params = new URLSearchParams({
    transactionType: summary.transactionType,
    item: (summary.note?.trim() || summary.category).slice(0, 300),
    category: summary.category.slice(0, 50),
    amount: String(summary.amount),
    occurredAt: summary.occurredAt.toISOString(),
    budgetSpent: String(summary.budgetSpent),
    budgetLimit: String(summary.budgetLimit),
    budgetPercent: summary.budgetPercent === void 0 ? "" : String(summary.budgetPercent),
    render: "glyph-v3"
  });
  return `${appBaseUrl}/api/milo/save-result.png?${params.toString()}`;
}
async function replyText(replyToken, text2, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text2.slice(0, 5e3) }] }) });
}
async function replyTextWithQuickReplies(replyToken, text2, actions, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text2.slice(0, 5e3), quickReply: { items: actions.slice(0, 3).map((action) => ({ type: "action", action: { type: "message", label: action.label.slice(0, 20), text: action.text.slice(0, 300) } })) } }] })
  });
}
async function replyGreetingHome(replyToken, credentials = lineCredentials()) {
  const base = process.env.MILO_PUBLIC_URL || "https://milo-line-app.vercel.app";
  const imageUrl = new URL("/richmenu/greeting-home.png", base).href;
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl }] })
  });
}
var MILO_VOICE_CAT_IMAGE_URL = (process.env.MILO_VOICE_CAT_IMAGE_URL ?? "https://milo-line-app.vercel.app/milo-voice-proposal-cat.webp").trim();
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
  if (amount <= 500) return "\u0E40\u0E0A\u0E47\u0E01\u0E22\u0E2D\u0E14\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49\u0E44\u0E14\u0E49\u0E17\u0E31\u0E19\u0E17\u0E35\u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30";
  return "\u0E22\u0E2D\u0E14\u0E19\u0E35\u0E49\u0E44\u0E21\u0E42\u0E25\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E27\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E25\u0E2D\u0E07\u0E14\u0E39\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30";
}
function postSaveSummaryText(summary) {
  const label = summary.transactionType === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A";
  const note = summary.note?.trim();
  const categoryLabel = summary.transactionType === "expense" && summary.category === "\u0E2D\u0E32\u0E2B\u0E32\u0E23" ? "\u0E04\u0E48\u0E32\u0E2D\u0E32\u0E2B\u0E32\u0E23" : summary.category;
  const budget = summary.budgetLimit > 0 ? `
${budgetStatusCopy(summary.category, summary.budgetSpent, summary.budgetLimit)}
\u0E07\u0E1A\u0E2B\u0E21\u0E27\u0E14${summary.category}: ${summary.budgetSpent.toLocaleString("th-TH")} / ${summary.budgetLimit.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17` : "";
  const timestamp2 = new Intl.DateTimeFormat("th-TH-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(summary.occurredAt);
  return `\u0E08\u0E14\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08
\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23: ${note || categoryLabel}
\u0E2B\u0E21\u0E27\u0E14: ${categoryLabel}
\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19: ${summary.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17
\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 - \u0E40\u0E27\u0E25\u0E32: ${timestamp2}${budget}
${mascotExpenseCopy(summary.transactionType, summary.amount)}
\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49: \u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A ${summary.dailyIncome.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \xB7 \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 ${summary.dailyExpense.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \xB7 \u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D ${summary.dailyBalance.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17`;
}
function financeReportCardText(report) {
  const periodLabel2 = { day: "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", week: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49", month: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", year: "\u0E1B\u0E35\u0E19\u0E35\u0E49" };
  const money3 = (amount) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => `\u2022 ${name} ${money3(amount)} \u0E1A\u0E32\u0E17`).join("\n");
  return `${report.title ?? `\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19${periodLabel2[report.period]}`}
${report.subtitle ? `${report.subtitle}
` : ""}\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A ${money3(report.income)} \u0E1A\u0E32\u0E17
\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 ${money3(report.expense)} \u0E1A\u0E32\u0E17
\u0E01\u0E33\u0E44\u0E23/\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D ${money3(report.balance)} \u0E1A\u0E32\u0E17
${categories ? `
\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E15\u0E32\u0E21\u0E2B\u0E21\u0E27\u0E14
${categories}` : "\n\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E19\u0E35\u0E49"}`;
}
function miloFinanceBrandStrip() {
  return { type: "box", layout: "horizontal", alignItems: "center", spacing: "sm", paddingAll: "9px", cornerRadius: "md", backgroundColor: "#FCEAF4", contents: [
    { type: "image", url: miloRichMenuImageUrl("summary"), size: "xs", aspectRatio: "1:1", aspectMode: "cover", flex: 0 },
    { type: "box", layout: "vertical", flex: 1, contents: [
      { type: "text", text: "MILO  \u2022  FINANCE", size: "xxs", weight: "bold", color: "#7657AA" },
      { type: "text", text: "\u0E19\u0E49\u0E2D\u0E07\u0E41\u0E21\u0E27\u0E0A\u0E48\u0E27\u0E22\u0E14\u0E39\u0E41\u0E25\u0E22\u0E2D\u0E14\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13", size: "xxs", color: "#9A7390", wrap: true }
    ] },
    { type: "text", text: "\u2726", size: "sm", color: "#5AC6AD", flex: 0 }
  ] };
}
async function replyFinanceReportCard(replyToken, report, credentials = lineCredentials()) {
  const imageUrl = buildFinanceReportImageUrl(report);
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "image",
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
        quickReply: { items: [
          { type: "action", action: { type: "message", label: "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49" } },
          { type: "action", action: { type: "message", label: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49" } },
          { type: "action", action: { type: "message", label: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49" } },
          { type: "action", action: { type: "message", label: "\u0E1B\u0E35\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E1B\u0E35\u0E19\u0E35\u0E49" } }
        ] }
      }]
    })
  });
}
async function replyFinanceReportCardFallback(replyToken, report, credentials = lineCredentials()) {
  return replyText(replyToken, financeReportCardText(report), credentials);
}
async function pushFinanceReportCard(to, report, credentials = lineCredentials()) {
  const money3 = (amount) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const categoryRows = categories.length ? categories.map(([name, amount]) => ({ type: "box", layout: "horizontal", margin: "sm", contents: [
    { type: "text", text: name, size: "xs", color: "#675B7C", flex: 1, wrap: true },
    { type: "text", text: `${money3(amount)} \u0E1A\u0E32\u0E17`, size: "xs", weight: "bold", color: "#B9517B", align: "end" }
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
        hero: { type: "image", url: miloRichMenuImageUrl("summary"), size: "full", aspectRatio: "20:9", aspectMode: "cover" },
        body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", backgroundColor: "#F2F0FF", contents: [
          { type: "box", layout: "horizontal", alignItems: "center", spacing: "md", paddingAll: "12px", cornerRadius: "md", backgroundColor: "#E4F8F2", contents: [
            { type: "box", layout: "vertical", justifyContent: "center", alignItems: "center", width: "38px", height: "38px", cornerRadius: "md", backgroundColor: "#5AC6AD", contents: [{ type: "text", text: "\u0E3F", align: "center", weight: "bold", size: "xl", color: "#FFFFFF" }] },
            { type: "box", layout: "vertical", flex: 1, contents: [{ type: "text", text: title, weight: "bold", size: "lg", color: "#4B3D69", wrap: true }, { type: "text", text: report.subtitle ?? "\u0E2A\u0E23\u0E38\u0E1B\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E15\u0E32\u0E21\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E15\u0E31\u0E49\u0E07\u0E44\u0E27\u0E49", size: "xs", color: "#7B6E97", wrap: true }] }
          ] },
          miloFinanceBrandStrip(),
          { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", cornerRadius: "md", backgroundColor: "#FFFEFB", contents: [
            { type: "box", layout: "horizontal", spacing: "sm", contents: [
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#EAF8F4", contents: [{ type: "text", text: "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A", size: "xxs", color: "#5B8E81" }, { type: "text", text: `${money3(report.income)} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#267C68", wrap: true }] },
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FDECF2", contents: [{ type: "text", text: "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22", size: "xxs", color: "#A57086" }, { type: "text", text: `${money3(report.expense)} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#BB527C", wrap: true }] }
            ] },
            { type: "box", layout: "horizontal", paddingAll: "10px", cornerRadius: "md", backgroundColor: "#EEEAF8", contents: [{ type: "text", text: "\u0E01\u0E33\u0E44\u0E23 / \u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D", size: "xs", color: "#6B6080", flex: 1 }, { type: "text", text: `${money3(report.balance)} \u0E1A\u0E32\u0E17`, size: "sm", weight: "bold", color: "#4D4263", align: "end" }] },
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
  const categoryLabel = isExpense && summary.category === "\u0E2D\u0E32\u0E2B\u0E32\u0E23" ? "\u0E04\u0E48\u0E32\u0E2D\u0E32\u0E2B\u0E32\u0E23" : summary.category;
  const accent = isExpense ? "#C9578A" : "#24977B";
  const softAccent = isExpense ? "#FDE9F1" : "#E2F8F0";
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [
      {
        type: "flex",
        altText: postSaveSummaryText(summary),
        contents: {
          type: "bubble",
          size: "mega",
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
                { type: "text", text: `${isExpense ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"}  \u2022  ${categoryLabel}`, size: "sm", weight: "bold", color: accent, flex: 1 },
                { type: "text", text: "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E41\u0E25\u0E49\u0E27", size: "xxs", color: "#8B809B", align: "end" }
              ] },
              { type: "text", text: `${summary.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17`, size: "xxl", weight: "bold", color: "#3F3552" },
              ...summary.note?.trim() ? [{ type: "text", text: `\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E08\u0E14: ${summary.note.trim()}`, size: "sm", color: "#675B7C", wrap: true }] : [],
              { type: "text", text: "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 - \u0E40\u0E27\u0E25\u0E32", size: "xs", weight: "bold", color: "#76688E", margin: "md" },
              { type: "text", text: new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(summary.occurredAt), size: "sm", color: "#4D4263" },
              ...summary.budgetLimit > 0 && summary.budgetPercent !== void 0 ? [{ type: "box", layout: "vertical", spacing: "sm", margin: "md", paddingAll: "12px", cornerRadius: "md", backgroundColor: "#F3FBF8", contents: [
                { type: "text", text: "\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48", size: "xs", weight: "bold", color: "#267C68" },
                { type: "box", layout: "horizontal", alignItems: "center", spacing: "sm", contents: [{ type: "text", text: categoryLabel, size: "sm", color: "#4D4263", flex: 1 }, { type: "text", text: `\u0E43\u0E0A\u0E49\u0E44\u0E1B ${summary.budgetPercent}%`, size: "sm", weight: "bold", color: "#267C68", align: "end" }] },
                { type: "text", text: `(${summary.budgetSpent.toLocaleString("th-TH")} / ${summary.budgetLimit.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17)`, size: "xxs", color: "#6B6080", align: "end" },
                { type: "text", text: budgetStatusCopy(summary.category, summary.budgetSpent, summary.budgetLimit), size: "xxs", color: "#A85C74", wrap: true }
              ] }] : [],
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
      }
    ] })
  });
}
async function replyPostSaveSummaryImage(replyToken, summary, credentials = lineCredentials()) {
  const imageUrl = miloSaveResultImageUrl(summary);
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{
      type: "image",
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl,
      quickReply: { items: [
        { type: "action", action: { type: "message", label: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14", text: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14" } },
        { type: "action", action: { type: "message", label: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49" } }
      ] }
    }] })
  });
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
async function pushTextWithQuickReplies(to, text2, actions, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/push", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      to,
      messages: [{
        type: "text",
        text: text2.slice(0, 5e3),
        quickReply: { items: actions.slice(0, 6).map((action) => ({ type: "action", action: { type: "message", label: action.label.slice(0, 20), text: action.text.slice(0, 300) } })) }
      }]
    })
  });
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
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${credentials.channelAccessToken}` }
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 0) return bytes;
        lastError = "LINE returned an empty media body";
      } else {
        const body = await response.text().catch(() => "");
        lastError = `LINE data API ${response.status}: ${body || response.statusText}`;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "LINE media download failed";
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 250 : 700));
  }
  throw new Error(lastError);
}
async function getProfile(source, credentials = lineCredentials()) {
  if (source.type === "user") {
    const response2 = await callLine(`/v2/bot/profile/${source.userId}`, credentials, { method: "GET" });
    return await response2.json();
  }
  if (!source.userId) return void 0;
  const path4 = source.type === "group" ? `/v2/bot/group/${source.groupId}/member/${source.userId}` : `/v2/bot/room/${source.roomId}/member/${source.userId}`;
  const response = await callLine(path4, credentials, { method: "GET" });
  return await response.json();
}
async function replyRichMenu(replyToken, text2, artwork, credentials = lineCredentials()) {
  const [staticImage] = artworkMessages(artwork);
  if (!staticImage) throw new Error("Milo rich-menu artwork is unavailable");
  const image = isDynamicRichMenuArtwork(artwork) ? { type: "image", originalContentUrl: buildRichMenuDataImageUrl(artwork, text2), previewImageUrl: buildRichMenuDataImageUrl(artwork, text2) } : staticImage;
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        ...image,
        quickReply: { items: [
          { type: "action", action: { type: "message", label: "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49" } },
          { type: "action", action: { type: "message", label: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49" } },
          { type: "action", action: { type: "message", label: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49" } },
          { type: "action", action: { type: "message", label: "\u0E1B\u0E35\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E1B\u0E35\u0E19\u0E35\u0E49" } },
          { type: "action", action: { type: "uri", label: "\u0E40\u0E1B\u0E34\u0E14\u0E41\u0E14\u0E0A\u0E1A\u0E2D\u0E23\u0E4C\u0E14", uri: new URL("/dashboard", process.env.MILO_PUBLIC_URL || "https://milo-line-app.vercel.app").href } }
        ] }
      }]
    })
  });
}

// server/milo/reminderDelivery.ts
async function deliverDueReminders(context = {}) {
  const due = await listDueReminders();
  let sent = 0;
  let failed = 0;
  for (const reminder of due) {
    const plan = resolveMiloPlan(
      reminder.createdByLineUserId,
      process.env,
      await isAdminLinkedLineUser(reminder.createdByLineUserId)
    );
    if (!hasMiloEntitlement(plan, "reminders")) continue;
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
    throw new Error("AI vision provider is not configured: set BUILT_IN_FORGE_API_KEY, FORGE_API_KEY, or OPENAI_API_KEY");
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
  const schema4 = outputSchema || output_schema;
  if (!schema4) return void 0;
  if (!schema4.name || !schema4.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema4.name,
      schema: schema4.schema,
      ...typeof schema4.strict === "boolean" ? { strict: schema4.strict } : {}
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
function deterministicFinancialInsight(input) {
  const periodLabel2 = { day: "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", week: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49", month: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", year: "\u0E1B\u0E35\u0E19\u0E35\u0E49" };
  const money3 = (value) => Number(value).toLocaleString("th-TH-u-nu-latn", { maximumFractionDigits: 2 });
  const categories = Object.entries(input.categories).filter(([, amount]) => Number(amount) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  const dataSufficiency = input.transactionCount === 0 ? "insufficient" : input.transactionCount < 5 ? "limited" : "adequate";
  if (input.transactionCount === 0) {
    return {
      dataSufficiency,
      summary: `${periodLabel2[input.period]}\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E17\u0E35\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01 \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E1E\u0E24\u0E15\u0E34\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49`,
      highlights: [],
      categoryObservations: [],
      suggestedActions: ["\u0E40\u0E23\u0E34\u0E48\u0E21\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E41\u0E25\u0E30\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 \u0E41\u0E25\u0E49\u0E27\u0E01\u0E25\u0E31\u0E1A\u0E21\u0E32\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u201D \u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07"]
    };
  }
  const top = categories[0];
  const share = top && input.expense > 0 ? Math.round(Number(top[1]) / input.expense * 100) : 0;
  const highlights = [];
  if (input.balance < 0) highlights.push(`\u0E22\u0E2D\u0E14\u0E2A\u0E38\u0E17\u0E18\u0E34\u0E40\u0E1B\u0E47\u0E19\u0E25\u0E1A ${money3(Math.abs(input.balance))} \u0E1A\u0E32\u0E17`);
  else highlights.push(`\u0E22\u0E2D\u0E14\u0E2A\u0E38\u0E17\u0E18\u0E34\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D ${money3(input.balance)} \u0E1A\u0E32\u0E17`);
  if (top) highlights.push(`\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14\u0E04\u0E37\u0E2D\u0E2B\u0E21\u0E27\u0E14${top[0]} ${money3(Number(top[1]))} \u0E1A\u0E32\u0E17${share ? ` (\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13 ${share}% \u0E02\u0E2D\u0E07\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22)` : ""}`);
  const categoryObservations = categories.slice(0, 3).map(([category, amount]) => ({
    category,
    observation: input.expense > 0 ? `${money3(Number(amount))} \u0E1A\u0E32\u0E17 \u0E2B\u0E23\u0E37\u0E2D\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13 ${Math.round(Number(amount) / input.expense * 100)}% \u0E02\u0E2D\u0E07\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22` : `${money3(Number(amount))} \u0E1A\u0E32\u0E17`
  }));
  const suggestedActions = [];
  if (top) suggestedActions.push(`\u0E15\u0E23\u0E27\u0E08\u0E07\u0E1A\u0E2B\u0E21\u0E27\u0E14${top[0]}\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E01\u0E31\u0E1A\u0E22\u0E2D\u0E14\u0E43\u0E0A\u0E49\u0E08\u0E23\u0E34\u0E07 ${money3(Number(top[1]))} \u0E1A\u0E32\u0E17`);
  if (input.balance < 0) suggestedActions.push("\u0E17\u0E1A\u0E17\u0E27\u0E19\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E17\u0E35\u0E48\u0E15\u0E31\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E25\u0E14\u0E44\u0E14\u0E49\u0E01\u0E48\u0E2D\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E2B\u0E21\u0E48");
  else suggestedActions.push("\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E07\u0E1A\u0E15\u0E48\u0E2D\u0E40\u0E19\u0E37\u0E48\u0E2D\u0E07\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E23\u0E31\u0E01\u0E29\u0E32\u0E22\u0E2D\u0E14\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D");
  return {
    dataSufficiency,
    summary: `${periodLabel2[input.period]}\u0E21\u0E35\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A ${money3(input.income)} \u0E1A\u0E32\u0E17 \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 ${money3(input.expense)} \u0E1A\u0E32\u0E17 \u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D ${money3(input.balance)} \u0E1A\u0E32\u0E17 \u0E08\u0E32\u0E01 ${input.transactionCount.toLocaleString("th-TH-u-nu-latn")} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23`,
    highlights,
    categoryObservations,
    suggestedActions
  };
}
async function generateFinancialInsight(input) {
  try {
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
  } catch (error) {
    console.warn("[Milo Analysis] AI unavailable; using deterministic financial insight", { error: error instanceof Error ? error.message : "unknown" });
    return deterministicFinancialInsight(input);
  }
}

// server/adminPassword.ts
import crypto5 from "node:crypto";
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
    crypto5.scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}
async function hashAdminPassword(password) {
  const salt = crypto5.randomBytes(SALT_BYTES);
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
    crypto5.scrypt(password, salt, expected.length, { N: costN, r: costR, p: costP }, (error, value) => error ? reject(error) : resolve(value));
  });
  return crypto5.timingSafeEqual(expected, derived);
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

// server/milo/recurringLimit.ts
var MAX_RECURRING_TRANSACTIONS = 20;
function configuredRecurringCount(items) {
  return items.filter((item) => item.status !== "cancelled").length;
}
function assertRecurringCapacity(items) {
  const count = configuredRecurringCount(items);
  if (count >= MAX_RECURRING_TRANSACTIONS) {
    throw new Error(`\u0E15\u0E31\u0E49\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E44\u0E14\u0E49\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14 ${MAX_RECURRING_TRANSACTIONS} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D\u0E1A\u0E31\u0E0D\u0E0A\u0E35 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E1E\u0E31\u0E01/\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E14\u0E34\u0E21\u0E01\u0E48\u0E2D\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E2B\u0E21\u0E48`);
  }
  return { count, remaining: MAX_RECURRING_TRANSACTIONS - count };
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
  const plan = await resolveDashboardMiloPlan(lineUserId);
  if (access.account.accountType === "group") assertMiloEntitlement(plan, "groupAccounting");
  return { lineUserId, financeAccountId: access.account.id, account: access.account, role: access.membership.role, plan };
}
function requireFinancePermission(allowed, message) {
  if (!allowed) throw new Error(message);
}
async function resolveDashboardMiloPlan(lineUserId) {
  return resolveMiloPlan(lineUserId, process.env, await isAdminLinkedLineUser(lineUserId));
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
    plan: protectedProcedure.query(async ({ ctx }) => {
      const lineUserId = await requireLinkedLineUser(ctx.user.id);
      const plan = await resolveDashboardMiloPlan(lineUserId);
      return { plan, ...MILO_PLAN_CAPABILITIES[plan] };
    }),
    linkLineAccount: protectedProcedure.input(z2.object({ lineUserId: z2.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID \u0E15\u0E49\u0E2D\u0E07\u0E02\u0E36\u0E49\u0E19\u0E15\u0E49\u0E19\u0E14\u0E49\u0E27\u0E22 U \u0E41\u0E25\u0E30\u0E15\u0E32\u0E21\u0E14\u0E49\u0E27\u0E22\u0E2D\u0E31\u0E01\u0E02\u0E23\u0E30 32 \u0E15\u0E31\u0E27") })).mutation(async ({ ctx, input }) => {
      const lineUserId = input.lineUserId.trim();
      await linkLineUser(ctx.user.id, lineUserId);
      void writeAuditLog({ action: "line_account.link", entityType: "line_account_link", dashboardUserId: ctx.user.id, actorLineUserId: lineUserId, details: { lineUserId } }).catch((auditError) => {
        console.warn("[Milo LINE Link] audit log skipped", { dashboardUserId: ctx.user.id, error: auditError instanceof Error ? auditError.message : "unknown" });
      });
      return { success: true };
    }),
    connection: protectedProcedure.query(async ({ ctx }) => ({ lineUserId: await getLinkedLineUser(ctx.user.id) ?? null })),
    financeAccounts: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const lineUserId = await requireLinkedLineUser(ctx.user.id);
        const plan = await resolveDashboardMiloPlan(lineUserId);
        const accounts = await listFinanceAccounts(lineUserId);
        return hasMiloEntitlement(plan, "multipleAccounts") ? accounts : accounts.filter((item) => item.account.accountType === "personal");
      }),
      members: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive() })).query(async ({ ctx, input }) => {
        await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        return listFinanceAccountMembers(input.financeAccountId);
      }),
      createGroup: protectedProcedure.input(z2.object({ lineChatId: z2.string().trim().min(1).max(128), name: z2.string().trim().min(1).max(120) })).mutation(async ({ ctx, input }) => {
        const lineUserId = await requireLinkedLineUser(ctx.user.id);
        assertMiloEntitlement(await resolveDashboardMiloPlan(lineUserId), "groupAccounting");
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
      if (!lineUserId) return { lineUserId: null, plan: "free", planCapabilities: MILO_PLAN_CAPABILITIES.free, reminders: [], todos: [], notes: [], vault: [], groups: [], budgets: [], finance: { income: 0, expense: 0, balance: 0, categories: {} }, financeAnalytics: { daily: [], transactionCount: 0, sevenDayIncome: 0, sevenDayExpense: 0 }, financeAccounts: [] };
      const plan = await resolveDashboardMiloPlan(lineUserId);
      const personalAccount = await getOrCreatePersonalFinanceAccount(lineUserId);
      const [reminders2, todos, notes2, vault, groups, budgets2, finance, financeAnalytics2, financeAccounts2] = await Promise.all([
        listReminders(lineUserId),
        listTodos(lineUserId),
        listNotes(lineUserId),
        searchVault(lineUserId),
        listLineGroups(lineUserId),
        listBudgets(lineUserId, void 0, personalAccount.id),
        financeSummary(lineUserId, personalAccount.id),
        financeAnalytics(lineUserId, personalAccount.id),
        listFinanceAccounts(lineUserId)
      ]);
      return {
        lineUserId,
        plan,
        planCapabilities: MILO_PLAN_CAPABILITIES[plan],
        reminders: hasMiloEntitlement(plan, "reminders") ? reminders2 : [],
        todos,
        notes: notes2,
        vault,
        groups: hasMiloEntitlement(plan, "groupAccounting") ? groups : [],
        budgets: budgets2,
        finance,
        financeAnalytics: hasMiloEntitlement(plan, "advancedCharts") ? financeAnalytics2 : { daily: [], transactionCount: 0, sevenDayIncome: 0, sevenDayExpense: 0 },
        financeAccounts: hasMiloEntitlement(plan, "multipleAccounts") ? financeAccounts2 : financeAccounts2.filter((item) => item.account.accountType === "personal"),
        personalFinanceAccountId: personalAccount.id
      };
    }),
    reminders: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const lineUserId = await requireLinkedLineUser(ctx.user.id);
        assertMiloEntitlement(await resolveDashboardMiloPlan(lineUserId), "reminders");
        return listReminders(lineUserId);
      }),
      create: protectedProcedure.input(z2.object({ title: z2.string().min(1).max(255), dueAt: z2.coerce.date(), recurrenceType: z2.enum(["once", "minute", "day", "week", "month"]).default("once"), recurrenceInterval: z2.number().int().min(1).default(1) })).mutation(async ({ ctx, input }) => {
        const lineUserId = await requireLinkedLineUser(ctx.user.id);
        assertMiloEntitlement(await resolveDashboardMiloPlan(lineUserId), "reminders");
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
        assertMiloEntitlement(scope.plan, "advancedCharts");
        return financeAnalytics(scope.lineUserId, scope.financeAccountId);
      }),
      budgets: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive().optional(), monthKey: z2.string().regex(/^\d{4}-\d{2}$/).optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        return listBudgets(scope.lineUserId, input?.monthKey, scope.financeAccountId);
      }),
      budgetCycle: router({
        get: protectedProcedure.input(z2.object({ financeAccountId: z2.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
          const startDay = await getFinanceAccountBudgetCycleStartDay(scope.financeAccountId);
          const cycle = budgetCycleWindow(/* @__PURE__ */ new Date(), startDay);
          return { startDay, key: cycle.key, start: cycle.start, end: cycle.end, label: formatBudgetCycleLabel(/* @__PURE__ */ new Date(), startDay) };
        }),
        update: protectedProcedure.input(z2.object({ day: z2.number().int().min(1).max(28), financeAccountId: z2.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
          assertMiloEntitlement(scope.plan, "customBudgetCycle");
          requireFinancePermission(canManageFinanceSettings(scope.role), "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E15\u0E31\u0E49\u0E07\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E23\u0E2D\u0E1A\u0E07\u0E1A\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49");
          const startDay = await updateFinanceAccountBudgetCycleStartDay(scope.financeAccountId, input.day);
          if (!startDay) throw new Error("\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E15\u0E31\u0E49\u0E07\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E23\u0E2D\u0E1A\u0E07\u0E1A\u0E44\u0E14\u0E49");
          await writeAuditLog({ action: "finance_budget_cycle.update", entityType: "finance_account", entityId: scope.financeAccountId, dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? void 0, details: { startDay } });
          const cycle = budgetCycleWindow(/* @__PURE__ */ new Date(), startDay);
          return { startDay, key: cycle.key, start: cycle.start, end: cycle.end, label: formatBudgetCycleLabel(/* @__PURE__ */ new Date(), startDay) };
        })
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
          assertRecurringCapacity(await listRecurringTransactions(scope.lineUserId, scope.financeAccountId));
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
      financeDigestStatus: protectedProcedure.query(async ({ ctx }) => financeDigestAutomationStatus(await requireLinkedLineUser(ctx.user.id))),
      setFinanceDigestEnabled: protectedProcedure.input(z2.object({ digestType: z2.enum(["daily", "weekly"]), enabled: z2.boolean() })).mutation(async ({ ctx, input }) => {
        requireAdminRole(ctx.user.role);
        const settingKey = input.digestType === "daily" ? "finance-digest-daily" : "finance-digest-weekly";
        const result = await setFinanceDigestAutomationEnabled(settingKey, input.enabled);
        await writeAuditLog({ action: "finance_digest.setting.update", entityType: "automation_setting", dashboardUserId: ctx.user.id, details: { settingKey, enabled: input.enabled } });
        return result;
      }),
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

// server/milo/calendar.ts
import crypto6 from "node:crypto";
var BANGKOK_OFFSET_MS2 = 7 * 60 * 60 * 1e3;
function bangkokParts2(date) {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS2);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}
function atBangkok(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}
function addBangkokDays(parts, days) {
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: calendar.getUTCFullYear(), month: calendar.getUTCMonth() + 1, day: calendar.getUTCDate() };
}
function normalizeYear(raw, fallback) {
  if (!Number.isFinite(raw)) return fallback;
  if (raw > 2400) return raw - 543;
  if (raw < 100) return 2e3 + raw;
  return raw;
}
function parseStart(value, now) {
  const current = bangkokParts2(now);
  const clock2 = value.match(/(?:เวลา\s*)?(\d{1,2})(?::|\.)(\d{2})/i);
  const hour = Math.min(Math.max(Number(clock2?.[1] ?? 9), 0), 23);
  const minute = Math.min(Math.max(Number(clock2?.[2] ?? 0), 0), 59);
  const iso2 = value.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const thai = value.match(/(?:วันที่\s*)?(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
  let target = { ...current };
  if (/พรุ่งนี้/i.test(value)) target = addBangkokDays(current, 1);
  else if (/วันนี้/i.test(value)) target = current;
  else if (iso2) target = { year: Number(iso2[1]), month: Number(iso2[2]), day: Number(iso2[3]) };
  else if (thai) {
    const year = normalizeYear(thai[3] ? Number(thai[3]) : current.year, current.year);
    target = { year, month: Number(thai[2]), day: Number(thai[1]) };
  }
  let startsAt = atBangkok(target.year, target.month, target.day, hour, minute);
  if (!/วันนี้|พรุ่งนี้|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/-]\d{1,2}/i.test(value) && startsAt <= now) {
    const tomorrow = addBangkokDays(current, 1);
    startsAt = atBangkok(tomorrow.year, tomorrow.month, tomorrow.day, hour, minute);
  }
  return startsAt;
}
function eventTitle(value) {
  return value.replace(/(?:วันนี้|พรุ่งนี้)/gi, " ").replace(/(?:วันที่\s*)?\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?/g, " ").replace(/\d{4}-\d{1,2}-\d{1,2}/g, " ").replace(/ถึง\s*\d{1,2}(?::|\.)\d{2}/gi, " ").replace(/(?:เวลา\s*)?\d{1,2}(?::|\.)\d{2}/gi, " ").replace(/(?:นาน\s*)?\d+(?:\.\d+)?\s*(?:ชั่วโมง|ชม\.?|นาที)/gi, " ").replace(/\s+/g, " ").trim();
}
function eventEnd(value, startsAt) {
  const until = value.match(/ถึง\s*(\d{1,2})(?::|\.)(\d{2})/i);
  if (until) {
    const local = bangkokParts2(startsAt);
    let endsAt = atBangkok(local.year, local.month, local.day, Number(until[1]), Number(until[2]));
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1e3);
    return endsAt;
  }
  const duration = value.match(/(?:นาน\s*)?(\d+(?:\.\d+)?)\s*(ชั่วโมง|ชม\.?|นาที)/i);
  if (duration) {
    const multiplier = /นาที/i.test(duration[2]) ? 6e4 : 36e5;
    return new Date(startsAt.getTime() + Number(duration[1]) * multiplier);
  }
  return new Date(startsAt.getTime() + 60 * 60 * 1e3);
}
function parseCalendarIntent(text2, now = /* @__PURE__ */ new Date()) {
  const value = text2.trim().replace(/^@?ไมโล\s*/i, "").trim();
  if (/^(?:ดู\s*)?(?:ปฏิทิน|ตารางนัด|นัดหมาย|calendar)$/i.test(value)) return { type: "list" };
  const cancel = value.match(/^(?:ยกเลิก|ลบ)(?:นัด|นัดหมาย|ปฏิทิน)\s*#?(\d+)$/i);
  if (cancel) return { type: "cancel", id: Number(cancel[1]) };
  const create2 = value.match(/^(?:ลงปฏิทิน|เพิ่มปฏิทิน|สร้างนัด|นัดหมาย|นัด)\s*(.+)$/i);
  if (!create2) return void 0;
  const body = create2[1].trim();
  if (!body) return void 0;
  const startsAt = parseStart(body, now);
  const title = eventTitle(body) || "\u0E19\u0E31\u0E14\u0E2B\u0E21\u0E32\u0E22";
  return { type: "create", data: { title: title.slice(0, 255), startsAt, endsAt: eventEnd(body, startsAt) } };
}
function compactUtc(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function buildGoogleCalendarUrl(event) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  url.searchParams.set("dates", `${compactUtc(event.startsAt)}/${compactUtc(event.endsAt)}`);
  url.searchParams.set("ctz", "Asia/Bangkok");
  if (event.detail) url.searchParams.set("details", event.detail);
  return url.toString();
}
function signingSecret() {
  const value = process.env.LINE_CHANNEL_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error("Calendar signing secret is not configured");
  return value;
}
function calendarSignature(id, expires) {
  return crypto6.createHmac("sha256", signingSecret()).update(`${id}:${expires}`).digest("hex");
}
function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto6.timingSafeEqual(a, b);
}
function buildCalendarIcsUrl(id, ttlSeconds = 7 * 24 * 60 * 60) {
  const base = process.env.MILO_PUBLIC_URL?.trim() || "https://milo-line-app.vercel.app";
  const expires = Math.floor(Date.now() / 1e3) + ttlSeconds;
  const sig = calendarSignature(id, expires);
  const url = new URL(`/api/milo/calendar/${id}.ics`, base);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", sig);
  return url.toString();
}
function escapeIcs(value) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function calendarEventToIcs(event) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Milo LINE Assistant//Calendar//TH",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:milo-${event.id}@milo-line-app.vercel.app`,
    `DTSTAMP:${compactUtc(event.createdAt)}`,
    `DTSTART:${compactUtc(event.startsAt)}`,
    `DTEND:${compactUtc(event.endsAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    ...event.detail ? [`DESCRIPTION:${escapeIcs(event.detail)}`] : [],
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].join("\r\n");
}
function registerCalendarExportRoute(app2) {
  app2.get("/api/milo/calendar/:id.ics", async (req, res) => {
    const id = Number(req.params.id);
    const expires = Number(req.query.expires);
    const supplied = typeof req.query.sig === "string" ? req.query.sig : "";
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(expires) || expires < Math.floor(Date.now() / 1e3)) return res.status(401).type("text/plain").send("calendar link expired");
    let expected = "";
    try {
      expected = calendarSignature(id, expires);
    } catch {
      return res.status(503).type("text/plain").send("calendar signing unavailable");
    }
    if (!safeEqual(supplied, expected)) return res.status(401).type("text/plain").send("invalid calendar signature");
    const event = await getCalendarEventById(id);
    if (!event || event.status !== "active") return res.status(404).type("text/plain").send("calendar event not found");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="milo-calendar-${id}.ics"`);
    return res.status(200).send(calendarEventToIcs(event));
  });
}

// server/milo/routes.ts
import express from "express";

// server/_core/voiceTranscription.ts
import { transcribe as gatewayTranscribe } from "ai";
import { createGateway, gateway } from "@ai-sdk/gateway";

// server/_core/localVoiceTranscription.ts
import { spawn } from "node:child_process";
import fs from "node:fs";
import path2 from "node:path";
import ffmpegPath from "ffmpeg-static";
var DEFAULT_MODEL = "onnx-community/whisper-tiny";
var DEFAULT_DTYPE = "q8";
var transcriberPromise;
function cacheDirPath() {
  return path2.resolve(process.env.MILO_LOCAL_STT_CACHE_DIR || path2.join(process.cwd(), "models", "transformers-cache"));
}
function modelName() {
  return (process.env.MILO_LOCAL_STT_MODEL || DEFAULT_MODEL).trim();
}
function bundledModelReady(cacheDir = cacheDirPath(), model = modelName()) {
  const modelRoot = path2.join(cacheDir, ...model.split("/"));
  return [
    "config.json",
    "tokenizer.json",
    path2.join("onnx", "encoder_model_quantized.onnx"),
    path2.join("onnx", "decoder_model_merged_quantized.onnx")
  ].every((file) => fs.existsSync(path2.join(modelRoot, file)));
}
function enabledFlag() {
  const raw = (process.env.MILO_LOCAL_STT_ENABLED || "").trim();
  if (raw) return /^(1|true|yes|on)$/i.test(raw);
  return false;
}
function localVoiceRuntimeStatus() {
  const cacheDir = cacheDirPath();
  const model = modelName();
  const bundled = bundledModelReady(cacheDir, model);
  return {
    enabled: enabledFlag(),
    bundled,
    model,
    dtype: (process.env.MILO_LOCAL_STT_DTYPE || DEFAULT_DTYPE).trim(),
    cacheDir,
    ffmpegAvailable: typeof ffmpegPath === "string" && ffmpegPath.length > 0 && fs.existsSync(ffmpegPath)
  };
}
function transcriptQualityIssue(text2, durationSeconds = 0) {
  const clean2 = text2.normalize("NFKC").replace(/[“”"'….,!?;:ฯๆ()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean2) return "empty-transcript";
  const tokens = clean2.split(" ").filter(Boolean);
  if (tokens.length >= 6) {
    const counts = /* @__PURE__ */ new Map();
    let longestRun = 1;
    let currentRun = 1;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i].toLocaleLowerCase("th-TH");
      counts.set(token, (counts.get(token) ?? 0) + 1);
      if (i > 0 && token === tokens[i - 1].toLocaleLowerCase("th-TH")) {
        currentRun += 1;
        longestRun = Math.max(longestRun, currentRun);
      } else currentRun = 1;
    }
    const maxCount = Math.max(...Array.from(counts.values()));
    const dominantShare = maxCount / tokens.length;
    const uniqueShare = counts.size / tokens.length;
    if (longestRun >= 4) return "repeated-token-run";
    if (tokens.length >= 8 && dominantShare >= 0.5 && uniqueShare <= 0.4) return "dominant-repeated-token";
  }
  const duration = Math.max(0.5, Number.isFinite(durationSeconds) ? durationSeconds : 0.5);
  const nonSpaceCharacters = clean2.replace(/\s/g, "").length;
  if (duration <= 15 && tokens.length > Math.max(24, Math.ceil(duration * 7))) return "too-many-tokens-for-duration";
  if (duration <= 15 && nonSpaceCharacters / duration > 28) return "too-many-characters-for-duration";
  return void 0;
}
async function decodeToFloat32Mono16k(audioBuffer) {
  const executable = typeof ffmpegPath === "string" ? ffmpegPath : "";
  if (!executable || !fs.existsSync(executable)) throw new Error("ffmpeg-static binary is unavailable");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "f32le",
    "-acodec",
    "pcm_f32le",
    "pipe:1"
  ];
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args);
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg decode failed (${code}): ${Buffer.concat(stderr).toString("utf8").slice(0, 1e3)}`));
        return;
      }
      const pcm = Buffer.concat(stdout);
      if (!pcm.length || pcm.length % 4 !== 0) {
        reject(new Error("ffmpeg returned empty or invalid PCM audio"));
        return;
      }
      const copied = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
      resolve(new Float32Array(copied));
    });
    child.stdin.end(audioBuffer);
  });
}
async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      const status = localVoiceRuntimeStatus();
      env.cacheDir = status.cacheDir;
      env.allowLocalModels = true;
      env.allowRemoteModels = !status.bundled;
      console.info("[Milo Voice Local] loading model", {
        model: status.model,
        dtype: status.dtype,
        cacheDir: status.cacheDir,
        bundled: status.bundled
      });
      return await pipeline("automatic-speech-recognition", status.model, {
        dtype: status.dtype
      });
    })().catch((error) => {
      transcriberPromise = void 0;
      throw error;
    });
  }
  return transcriberPromise;
}
async function transcribeAudioLocal(input) {
  const status = localVoiceRuntimeStatus();
  if (!status.enabled) throw new Error("Local STT is disabled");
  if (!status.ffmpegAvailable) throw new Error("Local STT requires ffmpeg-static");
  const started = Date.now();
  const samples = await decodeToFloat32Mono16k(Buffer.from(input.audioBuffer));
  console.info("[Milo Voice Local] decoded audio", {
    samples: samples.length,
    seconds: Number((samples.length / 16e3).toFixed(2)),
    decodeMs: Date.now() - started
  });
  const transcriber = await getTranscriber();
  const language = (input.language || "th").trim();
  const result = await transcriber(samples, {
    language,
    task: "transcribe",
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    condition_on_prev_tokens: false,
    temperature: 0,
    repetition_penalty: 1.15,
    no_repeat_ngram_size: 3
  });
  const text2 = String(result?.text || "").trim();
  if (!text2) throw new Error("Local Whisper returned empty text");
  const duration = samples.length / 16e3;
  const qualityIssue = transcriptQualityIssue(text2, duration);
  if (qualityIssue) {
    console.warn("[Milo Voice Local] rejected low-quality transcript", {
      reason: qualityIssue,
      duration: Number(duration.toFixed(2)),
      preview: text2.slice(0, 160)
    });
    throw new Error(`Local Whisper rejected low-quality transcript: ${qualityIssue}`);
  }
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  const segments = chunks.map((chunk, index2) => ({
    id: index2,
    seek: 0,
    start: Number(chunk?.timestamp?.[0] || 0),
    end: Number(chunk?.timestamp?.[1] || 0),
    text: String(chunk?.text || "").trim(),
    tokens: [],
    temperature: 0,
    avg_logprob: 0,
    compression_ratio: 0,
    no_speech_prob: 0
  }));
  return {
    task: "transcribe",
    language,
    duration,
    text: text2,
    segments
  };
}

// server/_core/voiceTranscription.ts
function gatewayAuthAvailable(env = process.env, requestToken) {
  return Boolean(
    (env.AI_GATEWAY_API_KEY || "").trim() || (env.VERCEL_OIDC_TOKEN || "").trim() || requestToken?.trim()
  );
}
function gatewayTranscriptionModel(env = process.env) {
  return (env.MILO_STT_MODEL || "fish-audio/transcribe-1").trim();
}
function voiceTranscriptionRuntimeStatus(requestToken) {
  const forge = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  const groq = Boolean((process.env.GROQ_API_KEY || "").trim());
  const openai = Boolean((process.env.OPENAI_API_KEY || "").trim());
  const gatewayAvailable = gatewayAuthAvailable(process.env, requestToken);
  const local = localVoiceRuntimeStatus();
  return {
    configured: groq || local.enabled || forge || openai || gatewayAvailable,
    mode: groq ? "groq-whisper-large-v3" : gatewayAvailable ? local.enabled ? "vercel-ai-gateway-stt+local-fallback" : "vercel-ai-gateway-stt" : forge ? local.enabled ? "forge-whisper+local-fallback" : "forge-whisper" : openai ? local.enabled ? "openai-whisper+local-fallback" : "openai-whisper" : local.enabled ? "local-whisper-onnx" : "unconfigured",
    local
  };
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
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
    hi: "Hindi",
    nl: "Dutch",
    pl: "Polish",
    tr: "Turkish",
    sv: "Swedish",
    da: "Danish",
    no: "Norwegian",
    fi: "Finnish",
    th: "Thai"
  };
  return langMap[langCode] || langCode;
}
async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
function makeFormData(audioBuffer, mimeType, options, model = "whisper-1") {
  const formData = new FormData();
  const filename = `audio.${getFileExtension(mimeType)}`;
  const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append("file", audioBlob, filename);
  formData.append("model", model);
  formData.append("response_format", "verbose_json");
  if (options.language) formData.append("language", options.language);
  const prompt = options.prompt || (options.language ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}` : "Transcribe the user's voice to text");
  formData.append("prompt", prompt);
  return formData;
}
async function callTranscriptionProvider(url, apiKey, audioBuffer, mimeType, options) {
  return fetchWithTimeout(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "Accept-Encoding": "identity"
    },
    body: makeFormData(audioBuffer, mimeType, options)
  }, 6e4);
}
function validateTranscript(response, provider) {
  const text2 = String(response.text || "").trim();
  if (!text2) return { error: "Invalid transcription response", code: "SERVICE_ERROR", details: `${provider} returned empty text` };
  const issue = transcriptQualityIssue(text2, response.duration || 0);
  if (issue) {
    return {
      error: "Low-quality transcription response",
      code: "TRANSCRIPTION_FAILED",
      details: `${provider} rejected transcript: ${issue}`
    };
  }
  return { ...response, text: text2 };
}
async function parseProviderResponse(response, provider) {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      error: "Transcription service request failed",
      code: "TRANSCRIPTION_FAILED",
      details: `${provider}: ${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`
    };
  }
  const whisperResponse = await response.json();
  if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
    return {
      error: "Invalid transcription response",
      code: "SERVICE_ERROR",
      details: `${provider} returned an invalid response format`
    };
  }
  return validateTranscript(whisperResponse, provider);
}
async function transcribeWithGateway(audioBuffer, options) {
  const modelId = gatewayTranscriptionModel();
  const gatewayProvider = options.gatewayToken?.trim() ? createGateway({ apiKey: options.gatewayToken.trim() }) : gateway;
  const result = await gatewayTranscribe({
    model: gatewayProvider.transcriptionModel(modelId),
    audio: audioBuffer,
    maxRetries: 1
  });
  const response = {
    task: "transcribe",
    language: result.language || options.language || "th",
    duration: result.durationInSeconds || 0,
    text: result.text,
    segments: (result.segments ?? []).map((segment, index2) => ({
      id: index2,
      seek: 0,
      start: segment.startSecond,
      end: segment.endSecond,
      text: segment.text,
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 0,
      no_speech_prob: 0
    }))
  };
  const validated = validateTranscript(response, "AI Gateway");
  if ("error" in validated) throw new Error(validated.details || validated.error);
  return validated;
}
async function transcribeAudio(options) {
  try {
    const groqKey = (process.env.GROQ_API_KEY || "").trim();
    const forgeConfigured2 = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
    const openAIKey = (process.env.OPENAI_API_KEY || "").trim();
    const gatewayConfigured = gatewayAuthAvailable(process.env, options.gatewayToken);
    const localConfigured = localVoiceRuntimeStatus().enabled;
    if (!groqKey && !localConfigured && !forgeConfigured2 && !openAIKey && !gatewayConfigured) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "Enable local STT or use Vercel AI Gateway/OIDC, AI_GATEWAY_API_KEY, Forge credentials, or OPENAI_API_KEY"
      };
    }
    let audioBuffer;
    let mimeType;
    if (options.audioBuffer) {
      audioBuffer = Buffer.from(options.audioBuffer);
      mimeType = options.mimeType || "audio/m4a";
    } else if (options.audioUrl) {
      try {
        const response = await fetchWithTimeout(options.audioUrl, {}, 45e3);
        if (!response.ok) {
          return { error: "Failed to download audio file", code: "INVALID_FORMAT", details: `HTTP ${response.status}: ${response.statusText}` };
        }
        audioBuffer = Buffer.from(await response.arrayBuffer());
        mimeType = response.headers.get("content-type") || options.mimeType || "audio/mpeg";
      } catch (error) {
        return { error: "Failed to fetch audio file", code: "SERVICE_ERROR", details: error instanceof Error ? error.message : "Unknown error" };
      }
    } else {
      return { error: "Audio input is missing", code: "INVALID_FORMAT", details: "Provide audioBuffer or audioUrl" };
    }
    const sizeMB = audioBuffer.length / (1024 * 1024);
    if (sizeMB > 16) {
      return { error: "Audio file exceeds maximum size limit", code: "FILE_TOO_LARGE", details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB` };
    }
    if (groqKey) {
      const form = makeFormData(audioBuffer, mimeType, options, "whisper-large-v3");
      form.set("temperature", "0");
      form.set("prompt", "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 \u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19 \u0E1A\u0E32\u0E17 \u0E2A\u0E15\u0E32\u0E07\u0E04\u0E4C");
      const response = await fetchWithTimeout("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: `Bearer ${groqKey}` },
        body: form
      }, 6e4);
      return await parseProviderResponse(response, "groq");
    }
    const failures = [];
    if (gatewayConfigured) {
      try {
        const result = await transcribeWithGateway(audioBuffer, options);
        console.info("[Milo Voice] transcription provider", { provider: "vercel-ai-gateway", chars: result.text.length });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI Gateway transcription failed";
        failures.push(`gateway: ${message}`);
        console.warn("[Milo Voice] AI Gateway transcription failed; trying fallback", { error: message });
      }
    }
    if (forgeConfigured2) {
      const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
      const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();
      try {
        const response = await callTranscriptionProvider(fullUrl, ENV.forgeApiKey, audioBuffer, mimeType, options);
        const parsed = await parseProviderResponse(response, "forge");
        if (!("error" in parsed)) {
          console.info("[Milo Voice] transcription provider", { provider: "forge", chars: parsed.text.length });
          return parsed;
        }
        failures.push(`forge: ${parsed.details || parsed.error}`);
      } catch (error) {
        failures.push(`forge: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    if (openAIKey) {
      try {
        const response = await callTranscriptionProvider("https://api.openai.com/v1/audio/transcriptions", openAIKey, audioBuffer, mimeType, options);
        const parsed = await parseProviderResponse(response, "openai");
        if (!("error" in parsed)) {
          console.info("[Milo Voice] transcription provider", { provider: "openai", chars: parsed.text.length });
          return parsed;
        }
        failures.push(`openai: ${parsed.details || parsed.error}`);
      } catch (error) {
        failures.push(`openai: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    if (localConfigured) {
      try {
        const result = await transcribeAudioLocal({ audioBuffer, language: options.language || "th" });
        const validated = validateTranscript(result, "local-whisper-onnx");
        if ("error" in validated) throw new Error(validated.details || validated.error);
        console.info("[Milo Voice] transcription provider", { provider: "local-whisper-onnx", chars: validated.text.length });
        return validated;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Local Whisper failed";
        failures.push(`local: ${message}`);
        console.warn("[Milo Voice] Local transcription failed", { error: message });
      }
    }
    return {
      error: "Transcription service request failed",
      code: "TRANSCRIPTION_FAILED",
      details: failures.join(" | ").slice(0, 1800) || "No transcription provider returned a usable transcript"
    };
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred"
    };
  }
}

// server/storage.ts
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SignJWT as SignJWT2, importPKCS8 } from "jose";
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
function forgeConfigured() {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}
function s3Configured() {
  return Boolean(process.env.MILO_S3_BUCKET?.trim() && process.env.MILO_S3_ACCESS_KEY_ID?.trim() && process.env.MILO_S3_SECRET_ACCESS_KEY?.trim());
}
function googleDriveConfigured() {
  return Boolean(process.env.MILO_GOOGLE_DRIVE_FOLDER_ID?.trim() && process.env.MILO_GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.MILO_GOOGLE_DRIVE_PRIVATE_KEY?.trim());
}
function storageRuntimeStatus() {
  const configuredProviders = [];
  if (databaseConfigured()) configuredProviders.push("database");
  if (forgeConfigured()) configuredProviders.push("forge");
  if (s3Configured()) configuredProviders.push("s3");
  if (googleDriveConfigured()) configuredProviders.push("google-drive");
  const requested = (process.env.MILO_STORAGE_PROVIDER || "database").trim().toLowerCase();
  const activeProvider = requested === "auto" ? configuredProviders[0] ?? null : configuredProviders.includes(requested) ? requested : null;
  return { requested, activeProvider, configuredProviders, configured: Boolean(activeProvider) };
}
function selectedProvider() {
  const status = storageRuntimeStatus();
  if (status.activeProvider) return status.activeProvider;
  throw new Error(`Durable storage is not configured for provider ${status.requested}`);
}
async function databasePut(relKey, data, contentType) {
  if (!databaseConfigured()) throw new Error("Database storage is not configured");
  const objectKey = appendHashSuffix(normalizeKey(relKey));
  const raw = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  const limit = Number(process.env.MILO_DATABASE_STORAGE_MAX_BYTES || 15 * 1024 * 1024);
  if (!Number.isFinite(limit) || limit < 1) throw new Error("Invalid MILO_DATABASE_STORAGE_MAX_BYTES");
  if (raw.byteLength > limit) throw new Error(`Database storage object exceeds ${limit} bytes`);
  const key = `db:${objectKey}`;
  await saveVaultBlob({ storageKey: key, mimeType: contentType, content: raw });
  return { key, url: `/api/milo/storage/${encodeURIComponent(key)}`, provider: "database" };
}
async function forgePut(relKey, data, contentType) {
  const forgeUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;
  const objectKey = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", objectKey);
  const presignResp = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!presignResp.ok) throw new Error(`Forge storage presign failed (${presignResp.status})`);
  const { url: putUrl } = await presignResp.json();
  if (!putUrl) throw new Error("Forge returned empty upload URL");
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const upload = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": contentType }, body });
  if (!upload.ok) throw new Error(`Forge storage upload failed (${upload.status})`);
  const key = `forge:${objectKey}`;
  return { key, url: `/api/milo/storage/${encodeURIComponent(key)}`, provider: "forge" };
}
function s3Client() {
  return new S3Client({
    region: process.env.MILO_S3_REGION?.trim() || "auto",
    endpoint: process.env.MILO_S3_ENDPOINT?.trim() || void 0,
    forcePathStyle: /^(1|true|yes)$/i.test(process.env.MILO_S3_FORCE_PATH_STYLE || ""),
    credentials: {
      accessKeyId: process.env.MILO_S3_ACCESS_KEY_ID.trim(),
      secretAccessKey: process.env.MILO_S3_SECRET_ACCESS_KEY.trim()
    }
  });
}
async function s3Put(relKey, data, contentType) {
  const objectKey = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await s3Client().send(new PutObjectCommand({ Bucket: process.env.MILO_S3_BUCKET.trim(), Key: objectKey, Body: body, ContentType: contentType }));
  const key = `s3:${objectKey}`;
  return { key, url: `/api/milo/storage/${encodeURIComponent(key)}`, provider: "s3" };
}
var googleTokenCache;
function googlePrivateKey() {
  return process.env.MILO_GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, "\n").trim();
}
async function googleDriveAccessToken() {
  if (googleTokenCache && googleTokenCache.expiresAt > Date.now() + 6e4) return googleTokenCache.token;
  const email = process.env.MILO_GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL.trim();
  const privateKey = await importPKCS8(googlePrivateKey(), "RS256");
  const now = Math.floor(Date.now() / 1e3);
  const assertion = await new SignJWT2({ scope: "https://www.googleapis.com/auth/drive.file" }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(email).setSubject(email).setAudience("https://oauth2.googleapis.com/token").setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  if (!response.ok) throw new Error(`Google Drive OAuth failed (${response.status})`);
  const json = await response.json();
  if (!json.access_token) throw new Error("Google Drive OAuth returned no access token");
  googleTokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1e3 };
  return json.access_token;
}
async function googleDrivePut(relKey, data, contentType) {
  const token = await googleDriveAccessToken();
  const filename = appendHashSuffix(normalizeKey(relKey)).replace(/[\\/]+/g, "__").slice(-220);
  const metadata = {
    name: filename,
    parents: [process.env.MILO_GOOGLE_DRIVE_FOLDER_ID.trim()],
    appProperties: { miloPath: normalizeKey(relKey).slice(0, 120) }
  };
  const boundary = `milo_${crypto.randomUUID().replace(/-/g, "")}`;
  const raw = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}\r
`),
    Buffer.from(`--${boundary}\r
Content-Type: ${contentType}\r
\r
`),
    raw,
    Buffer.from(`\r
--${boundary}--`)
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart
  });
  if (!response.ok) throw new Error(`Google Drive upload failed (${response.status})`);
  const json = await response.json();
  if (!json.id) throw new Error("Google Drive upload returned no file id");
  const key = `gdrive:${json.id}`;
  return { key, url: `/api/milo/storage/${encodeURIComponent(key)}`, provider: "google-drive" };
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const provider = selectedProvider();
  if (provider === "database") return databasePut(relKey, data, contentType);
  if (provider === "forge") return forgePut(relKey, data, contentType);
  if (provider === "s3") return s3Put(relKey, data, contentType);
  return googleDrivePut(relKey, data, contentType);
}
function parseStoredKey(value) {
  if (value.startsWith("db:")) return { provider: "database", objectKey: value.slice(3) };
  if (value.startsWith("forge:")) return { provider: "forge", objectKey: value.slice(6) };
  if (value.startsWith("s3:")) return { provider: "s3", objectKey: value.slice(3) };
  if (value.startsWith("gdrive:")) return { provider: "google-drive", objectKey: value.slice(7) };
  return { provider: "forge", objectKey: normalizeKey(value) };
}
async function storageGetSignedUrl(relKey) {
  const { provider, objectKey } = parseStoredKey(relKey);
  if (provider === "database") throw new Error("Database objects are downloaded through the Milo storage proxy");
  if (provider === "forge") {
    if (!forgeConfigured()) throw new Error("Forge storage is not configured");
    const getUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
    getUrl.searchParams.set("path", objectKey);
    const resp = await fetch(getUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
    if (!resp.ok) throw new Error(`Forge signed URL failed (${resp.status})`);
    const { url } = await resp.json();
    if (!url) throw new Error("Forge returned empty download URL");
    return url;
  }
  if (provider === "s3") {
    if (!s3Configured()) throw new Error("S3 storage is not configured");
    return getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: process.env.MILO_S3_BUCKET.trim(), Key: objectKey }), { expiresIn: 900 });
  }
  throw new Error("Google Drive objects are downloaded through the Milo storage proxy");
}
async function storageGetDatabaseObject(relKey) {
  const { provider, objectKey } = parseStoredKey(relKey);
  if (provider !== "database") return void 0;
  if (!databaseConfigured()) throw new Error("Database storage is not configured");
  const row = await getVaultBlob(`db:${objectKey}`);
  if (!row) return void 0;
  return { data: Buffer.from(row.content), mimeType: row.mimeType, sizeBytes: row.sizeBytes };
}
async function storageGetGoogleDriveResponse(relKey) {
  const { provider, objectKey } = parseStoredKey(relKey);
  if (provider !== "google-drive") return void 0;
  if (!googleDriveConfigured()) throw new Error("Google Drive storage is not configured");
  const token = await googleDriveAccessToken();
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(objectKey)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
}

// server/milo/ocrImageAnalysis.ts
import fs2 from "node:fs";
import os from "node:os";
import path3 from "node:path";
import { createRequire } from "node:module";
import sharp3 from "sharp";
import { createWorker } from "tesseract.js";

// server/milo/thaiReceiptParser.ts
var monthNumbers = {
  "\u0E21.\u0E04.": 1,
  "\u0E01.\u0E1E.": 2,
  "\u0E21\u0E35.\u0E04.": 3,
  "\u0E40\u0E21.\u0E22.": 4,
  "\u0E1E.\u0E04.": 5,
  "\u0E21\u0E34.\u0E22.": 6,
  "\u0E01.\u0E04.": 7,
  "\u0E2A.\u0E04.": 8,
  "\u0E01.\u0E22.": 9,
  "\u0E15.\u0E04.": 10,
  "\u0E1E.\u0E22.": 11,
  "\u0E18.\u0E04.": 12,
  "\u0E21\u0E01\u0E23\u0E32\u0E04\u0E21": 1,
  "\u0E01\u0E38\u0E21\u0E20\u0E32\u0E1E\u0E31\u0E19\u0E18\u0E4C": 2,
  "\u0E21\u0E35\u0E19\u0E32\u0E04\u0E21": 3,
  "\u0E40\u0E21\u0E29\u0E32\u0E22\u0E19": 4,
  "\u0E1E\u0E24\u0E29\u0E20\u0E32\u0E04\u0E21": 5,
  "\u0E21\u0E34\u0E16\u0E38\u0E19\u0E32\u0E22\u0E19": 6,
  "\u0E01\u0E23\u0E01\u0E0E\u0E32\u0E04\u0E21": 7,
  "\u0E2A\u0E34\u0E07\u0E2B\u0E32\u0E04\u0E21": 8,
  "\u0E01\u0E31\u0E19\u0E22\u0E32\u0E22\u0E19": 9,
  "\u0E15\u0E38\u0E25\u0E32\u0E04\u0E21": 10,
  "\u0E1E\u0E24\u0E28\u0E08\u0E34\u0E01\u0E32\u0E22\u0E19": 11,
  "\u0E18\u0E31\u0E19\u0E27\u0E32\u0E04\u0E21": 12
};
var thaiDigits = {
  "\u0E50": "0",
  "\u0E51": "1",
  "\u0E52": "2",
  "\u0E53": "3",
  "\u0E54": "4",
  "\u0E55": "5",
  "\u0E56": "6",
  "\u0E57": "7",
  "\u0E58": "8",
  "\u0E59": "9"
};
function compact(value) {
  return value.replace(/[๐-๙]/g, (digit) => thaiDigits[digit] || digit).replace(/[\t ]+/g, " ").trim();
}
function normalizeYear2(value) {
  if (value >= 2400) return value - 543;
  if (value >= 1e3) return value;
  return value >= 50 ? value + 2500 - 543 : value + 2e3;
}
function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function valueNearLabel(lines, pattern) {
  for (let i = 0; i < lines.length; i += 1) {
    if (!pattern.test(lines[i])) continue;
    const window = /\d/.test(lines[i]) ? lines[i] : lines[i + 1] || "";
    const matches = Array.from(window.matchAll(/-?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})|[0-9]+(?:\.\d{1,2})?)/g));
    if (!matches.length) continue;
    const raw = matches[matches.length - 1][1].replace(/,/g, "");
    const amount = Number(raw);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}
function extractThaiPayableAmount(text2) {
  const lines = text2.split(/\n+/).map(compact).filter(Boolean);
  const rules = [
    /จำนวนเงินที่ชำระ|จำนวนเงินชำระ|ยอดที่ชำระ|ยอดชำระสุทธิ|ยอดสุทธิ|รวมสุทธิ/i,
    /^ยอดชำระ\b/i,
    /^(?:ทั้งหมด|grand\s+total)(?=\s|[:：฿]|\d|$)/i,
    /^(?:ยอดรวม|total)(?=\s|[:：฿]|\d|$)/i,
    /ค่าสินค้า\s*\/\s*บริการ/i
  ];
  for (const rule of rules) {
    const amount = valueNearLabel(lines, rule);
    if (amount > 0) return amount;
  }
  return 0;
}
function extractThaiSlipDateTime(text2) {
  const flat = compact(text2.replace(/\r?\n/g, " "));
  let dateText = "";
  const iso2 = flat.match(/(?:^|[^0-9])(2\s*0\s*\d\s*\d)\s*[\/.-]\s*([01]?\s*\d)\s*[\/.-]\s*([0-3]?\s*\d)(?=$|[^0-9])/);
  if (iso2) {
    const year = Number(iso2[1].replace(/\s+/g, ""));
    const month = Number(iso2[2].replace(/\s+/g, ""));
    const day = Number(iso2[3].replace(/\s+/g, ""));
    dateText = isoDate(year, month, day);
  }
  if (!dateText) {
    const numericPatterns = [
      /(?:^|[^0-9])([0-3]?\s*\d)\s*[\/.-]\s*([01]?\s*\d)\s*[\/.-]\s*(2\s*[05]\s*\d\s*\d|\d\s*\d)(?=$|[^0-9])/,
      /(?:วันที่|date)\s*[:：-]?\s*([0-3]?\s*\d)\s+([01]?\s*\d)\s+(2\s*[05]\s*\d\s*\d|\d\s*\d)(?=$|[^0-9])/i
    ];
    for (const pattern of numericPatterns) {
      const match = flat.match(pattern);
      if (!match) continue;
      const day = Number(match[1].replace(/\s+/g, ""));
      const month = Number(match[2].replace(/\s+/g, ""));
      const year = Number(match[3].replace(/\s+/g, ""));
      dateText = isoDate(normalizeYear2(year), month, day);
      if (dateText) break;
    }
  }
  if (!dateText) {
    for (const [name, month] of Object.entries(monthNumbers)) {
      const escaped = name.split("").map((char) => char === "." ? "\\s*\\.?\\s*" : char.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&") + "\\s*").join("");
      const pattern = new RegExp("(?:^|\\s)([0-3]?\\s*\\d)\\s*" + escaped + "(2\\s*[05]\\s*\\d\\s*\\d|\\d\\s*\\d)(?=\\s|$)");
      const match = flat.match(pattern);
      if (!match) continue;
      const day = Number(match[1].replace(/\s+/g, ""));
      const year = Number(match[2].replace(/\s+/g, ""));
      dateText = isoDate(normalizeYear2(year), month, day);
      if (dateText) break;
    }
  }
  const time = flat.match(/(?:^|[^0-9])([01]?\s*\d|2\s*[0-3])\s*:\s*([0-5]\s*\d)(?=$|[^0-9])/) || flat.match(/(?:เวลา\s*)?([01]?\s*\d|2\s*[0-3])\s*\.\s*([0-5]\s*\d)\s*(?:น\.)/);
  return {
    dateText,
    timeText: time ? String(Number(time[1].replace(/\s+/g, ""))).padStart(2, "0") + ":" + time[2].replace(/\s+/g, "") : ""
  };
}
function isKbankNoise(line) {
  const value = compact(line);
  if (!value) return true;
  if (/^(?:ชำระเงินสำเร็จ|โอนเงินสำเร็จ|นาย\s|นาง\s|น\.ส\.|ธ\.?กสิกรไทย|ธนาคาร|k\+|xxx|x{3,}|เลขที่รายการ|เลขอ้างอิง|จำนวน|ค่าธรรมเนียม|บันทึกช่วยจำ|หมายเหตุ|สแกน)/i.test(value)) return true;
  if (/^\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/i.test(value)) return true;
  const compactValue = value.replace(/\s+/g, "");
  if (/^(?:[A-Z0-9-]{14,}|\d{10,})$/i.test(compactValue)) return true;
  if (/^(?:จำนวน|ค่าธรรมเนียม|ยอด).*(?:บาท|\d)/i.test(value)) return true;
  return false;
}
function normalizeThaiMerchantName(value) {
  let cleaned = compact(value).replace(/\s+(?:ประเภท|ชื่อ?พนักงาน|พนักงาน|เวลา|วันที่|เลขที่|โต๊ะ|table|qty|จำนวน|สินค้า)\s*[:：][\s\S]*$/i, "").trim();
  if (/^(?:ประเภท|ชื่อ?พนักงาน|พนักงาน|เวลา|วันที่|เลขที่|โต๊ะ|table|qty|จำนวน|สินค้า)\s*[:：]/i.test(cleaned)) return "";
  cleaned = cleaned.replace(/^[=•·|:;._\-–—>]+\s*/, "").replace(/^[A-Za-zก-๙]{1,2}\s+(?=ร้าน)/, "").replace(/^[A-Za-z0-9]{1,4}[\s|:;._-]+(?=[ก-๙])/, "").replace(/คาเฟ[่]?\s*อเมซอน/gi, "\u0E04\u0E32\u0E40\u0E1F\u0E48 \u0E2D\u0E40\u0E21\u0E0B\u0E2D\u0E19").replace(/cafe\s*amazon/gi, "Cafe Amazon").replace(/([ก-๙])\s+(เฮ้าส์)/g, "$1$2").replace(/เพชรเกษม\s*(\d)\s+(\d{2})(?=\b|\s|$)/gi, "\u0E40\u0E1E\u0E0A\u0E23\u0E40\u0E01\u0E29\u0E21$1$2").replace(/เอกซ์เพรส/g, "\u0E40\u0E2D\u0E47\u0E01\u0E0B\u0E4C\u0E40\u0E1E\u0E23\u0E2A").replace(/\s+(?:ถุง|ของหวาน|เครื่อง(?:ดื่ม|คื่ม))(?=\s|$)[\s\S]*$/i, "").replace(/\s+(?:ค่าสินค้า\s*\/\s*บริการ|จำนวนเงินที่ชำระ|ยอด(?:ที่)?ชำระ|สิทธิไทยช่วยไทยพลัส)[\s\S]*$/i, "").replace(/\s+(?:[A-Z0-9]{14,}|\d{10,})\s*$/i, "").trim();
  if (/^CJ\s*\d{3,5}\b/i.test(cleaned)) {
    const match = cleaned.match(/^CJ\s*(\d{3,5})\s*(.*)$/i);
    if (match) {
      let branch = match[2].replace(/\s+(?:บจก\.?|บริษัท|ซี\.?\s*เจ\.?|เอกซ์เพรส|เอ็กซ์เพรส|กรุ๊ป|กรป).*$/i, "").replace(/\s+[0-9][A-Za-zก-๙]{1,5}\s*$/i, "").trim();
      branch = branch.replace(/เพชรเกษม\s*(\d)\s+(\d{2})(?=\b|\s|$)/gi, "\u0E40\u0E1E\u0E0A\u0E23\u0E40\u0E01\u0E29\u0E21$1$2");
      cleaned = `CJ ${match[1]}${branch ? ` ${branch}` : ""} \u0E1A\u0E08\u0E01. \u0E0B\u0E35.\u0E40\u0E08. \u0E40\u0E2D\u0E47\u0E01\u0E0B\u0E4C\u0E40\u0E1E\u0E23\u0E2A \u0E01\u0E23\u0E38\u0E4A\u0E1B`;
    }
  } else {
    cleaned = cleaned.replace(/((?:กรุ๊ป|จำกัด|ลิมิเต็ด))\s+[0-9][A-Za-zก-๙]{1,5}\s*$/i, "$1");
  }
  return compact(cleaned);
}
function cleanMerchant(value) {
  return normalizeThaiMerchantName(value);
}
function extractKbankMerchant(text2) {
  const lines = text2.split(/\n+/).map(compact).filter(Boolean);
  const refIndex = lines.findIndex((line) => /^(?:เลขที่รายการ|เลขอ้างอิง|จำนวน|ค่าธรรมเนียม|บันทึกช่วยจำ)/i.test(line));
  const end = refIndex >= 0 ? refIndex : lines.length;
  const accountIndex = lines.findIndex((line) => /(?:xxx|x{3,})[-x\d]*|ธ\.?กสิกรไทย/i.test(line));
  const start = accountIndex >= 0 ? accountIndex + 1 : Math.max(0, end - 5);
  const candidates = [];
  for (let i = start; i < end && candidates.length < 3; i += 1) {
    const line = lines[i];
    if (isKbankNoise(line)) continue;
    const cleaned = cleanMerchant(line);
    if (!cleaned || !/[A-Za-zก-๙]/.test(cleaned)) continue;
    const fingerprint = cleaned.toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");
    const combined = candidates.join("").toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");
    if (fingerprint.length >= 5 && combined.includes(fingerprint)) continue;
    candidates.push(cleaned);
  }
  return cleanMerchant(candidates.join(" ")).slice(0, 180);
}
function extractReceiptMerchant(text2) {
  const lines = text2.split(/\n+/).map(compact).filter(Boolean);
  const cleanedLines = lines.map(cleanMerchant);
  const candidate = cleanedLines.find((line) => /^(?:ร้าน|บจก\.?|หจก\.?|บริษัท|cj\b|cafe\b)/i.test(line) && !/(ค่าสินค้า|ยอด|จำนวนเงิน|ส่วนลด|สิทธิ|บาท|ค่าธรรมเนียม)/i.test(line));
  if (candidate) return candidate.trim().slice(0, 180);
  const fallback = lines.slice(0, 8).map(cleanMerchant).find((line) => {
    if (!line || line.length < 2 || line.length > 80) return false;
    if (!/[A-Za-zก-๙]/.test(line)) return false;
    if (/^(?:ใบเสร็จ|receipt|โทรศัพท์|โทร|tel|เลขที่|ประเภท|ชื่อ?พนักงาน|พนักงาน|เวลา|วันที่|โต๊ะ|table|สินค้า|qty|ราคา|รวม|ทั้งหมด|เงินสด)/i.test(line)) return false;
    if (/(?:\d{2,}[-./]){1,2}\d{2,4}|\b0\d{8,9}\b/i.test(line)) return false;
    return true;
  });
  return (fallback || "").trim().slice(0, 180);
}
function extractReceiptNumber(text2) {
  const lines = text2.split(/\n+/).map(compact).filter(Boolean);
  const labels = /^(?:เลขที่(?:ใบเสร็จ)?|receipt\s*(?:no\.?|number)|bill\s*(?:no\.?|number))\s*[:：#-]?\s*/i;
  for (let i = 0; i < lines.length; i += 1) {
    if (!labels.test(lines[i])) continue;
    const sameLine = lines[i].replace(labels, "").trim().match(/^([A-Z0-9][A-Z0-9\/-]{3,39})$/i)?.[1];
    if (sameLine) return sameLine;
    const next = lines[i + 1]?.match(/^([A-Z0-9][A-Z0-9\/-]{3,39})$/i)?.[1];
    if (next) return next;
  }
  return "";
}
function extractReceiptPaymentMethod(text2) {
  if (/(?:^|\s)(?:เงินสด|cash)(?:\s|$)/i.test(text2)) return "\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14";
  if (/(?:พร้อมเพย์|promptpay|qr\s*(?:payment|pay)?|สแกนจ่าย)/i.test(text2)) return "QR/\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E40\u0E1E\u0E22\u0E4C";
  if (/(?:บัตรเครดิต|บัตรเดบิต|credit\s*card|debit\s*card|visa|mastercard)/i.test(text2)) return "\u0E1A\u0E31\u0E15\u0E23";
  if (/(?:โอนเงิน|bank\s*transfer)/i.test(text2)) return "\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19";
  return "";
}
function cleanReceiptItemName(value) {
  return compact(value).replace(/^[•·|:;._\-–—>]+\s*/, "").replace(/\s+(?:qty|จำนวน|ราคา|รวม)\s*$/i, "").trim();
}
function isReceiptTableHeader(line) {
  return /(?:สินค้า|รายการ).*(?:qty|จำนวน).*(?:ราคา|ยอด|รวม)/i.test(line) || /^(?:สินค้า|รายการ)$/i.test(line) && /(?:qty|จำนวน|ราคา|รวม)/i.test(line);
}
function isReceiptFooter(line) {
  return /^(?:ยอดรวม|รวมสุทธิ|ยอดสุทธิ|ทั้งหมด|subtotal|grand\s*total|total|เงินสด|cash|เงินทอน|change|ชำระ|ยอดชำระ|ขอบคุณ|thank\s*you|powered\s*by)/i.test(line);
}
function formatReceiptItem(name, qty, amount) {
  const cleanedName = cleanReceiptItemName(name);
  const cleanedAmount = amount.replace(/,/g, "");
  if (!cleanedName || !/[A-Za-zก-๙]/.test(cleanedName)) return "";
  return `${cleanedName} \xD7${Number(qty)} ${Number(cleanedAmount).toLocaleString("th-TH", { maximumFractionDigits: 2 })} \u0E1A\u0E32\u0E17`;
}
function extractReceiptLineItems(text2) {
  const lines = text2.split(/\n+/).map(compact).filter(Boolean);
  const specialLabels = /ค่าสินค้า\s*\/\s*บริการ|สิทธิ.*(?:พลัส|ช่วย)|ส่วนลด|จำนวนเงินที่ชำระ|ยอดที่ชำระ|ยอดสุทธิ/i;
  const out = [];
  const special = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!specialLabels.test(lines[i])) continue;
    const joined = /\d/.test(lines[i]) ? lines[i] : [lines[i], lines[i + 1]].filter(Boolean).join(" ");
    const cleaned = compact(joined);
    if (cleaned && !special.includes(cleaned)) special.push(cleaned);
  }
  let headerIndex = lines.findIndex((line) => /(?:สินค้า|รายการ).*(?:qty|จำนวน|ราคา|รวม)/i.test(line));
  if (headerIndex < 0) {
    headerIndex = lines.findIndex((line, index2) => /^(?:สินค้า|รายการ)$/i.test(line) && lines.slice(index2, index2 + 3).some((part) => /(?:qty|จำนวน|ราคา|รวม)/i.test(part)));
  }
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  let pendingName = "";
  for (let i = start; i < lines.length && out.length < 20; i += 1) {
    const line = lines[i];
    if (headerIndex >= 0 && isReceiptFooter(line)) break;
    if (isReceiptTableHeader(line) || specialLabels.test(line)) continue;
    if (/^(?:เลขที่|ประเภท|ชื่อ?พนักงาน|พนักงาน|เวลา|วันที่|โทรศัพท์|โทร|tel)\s*[:：]/i.test(line)) continue;
    const row = line.match(/^(.+?)\s+(\d{1,3})\s+(\d{1,8}(?:[,.]\d{1,2})?)(?:\s+(\d{1,8}(?:[,.]\d{1,2})?))?$/);
    if (row) {
      const formatted = formatReceiptItem(row[1], row[2], row[4] || row[3]);
      if (formatted && !out.includes(formatted)) out.push(formatted);
      pendingName = "";
      continue;
    }
    const numericOnly = line.match(/^(\d{1,3})\s+(\d{1,8}(?:[,.]\d{1,2})?)(?:\s+(\d{1,8}(?:[,.]\d{1,2})?))?$/);
    if (numericOnly && pendingName) {
      const formatted = formatReceiptItem(pendingName, numericOnly[1], numericOnly[3] || numericOnly[2]);
      if (formatted && !out.includes(formatted)) out.push(formatted);
      pendingName = "";
      continue;
    }
    if (headerIndex >= 0 && /[A-Za-zก-๙]/.test(line) && !/\d{4,}/.test(line) && line.length <= 120) {
      pendingName = cleanReceiptItemName(line);
    }
  }
  return [...out, ...special.filter((item) => !out.includes(item))].slice(0, 20);
}
function enrichThaiReceiptProposal(text2, proposal) {
  const kbank = /(?:k\+|กสิกรไทย|ธ\.?กสิกรไทย)/i.test(text2);
  const receiptLike = /ใบเสร็จ|ค่าสินค้า\s*\/\s*บริการ|จำนวนเงินที่ชำระ|ยอดสุทธิ|สิทธิ.*(?:พลัส|ช่วย)/i.test(text2);
  const dateTime = extractThaiSlipDateTime(text2);
  const payable = extractThaiPayableAmount(text2);
  const merchant = kbank ? extractKbankMerchant(text2) : receiptLike ? extractReceiptMerchant(text2) : "";
  const lineItems = receiptLike ? extractReceiptLineItems(text2) : [];
  const receiptNumber = receiptLike ? extractReceiptNumber(text2) : "";
  const paymentMethod = receiptLike ? extractReceiptPaymentMethod(text2) : "";
  const documentType = proposal.documentType === "unknown" && receiptLike ? "receipt" : proposal.documentType;
  return {
    ...proposal,
    documentType,
    amount: payable > 0 ? payable : proposal.amount,
    merchant: merchant || normalizeThaiMerchantName(proposal.merchant),
    dateText: proposal.dateText || dateTime.dateText,
    timeText: proposal.timeText || dateTime.timeText,
    receiptNumber: proposal.receiptNumber || receiptNumber,
    paymentMethod: proposal.paymentMethod || paymentMethod,
    lineItems: lineItems.length ? Array.from(/* @__PURE__ */ new Set([...proposal.lineItems || [], ...lineItems])).slice(0, 20) : proposal.lineItems
  };
}

// server/milo/ocrImageAnalysis.ts
var DATA_DIR = path3.join(process.cwd(), "api", "tessdata");
var CACHE_DIR = path3.join(os.tmpdir(), "milo-tesscache");
var requireOcr = createRequire(import.meta.url);
async function withOcrDeadline(work, stage, timeoutMs = 3e4) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`OCR ${stage} timed out after ${timeoutMs}ms`)), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
var thaiDigitMap = {
  "\u0E50": "0",
  "\u0E51": "1",
  "\u0E52": "2",
  "\u0E53": "3",
  "\u0E54": "4",
  "\u0E55": "5",
  "\u0E56": "6",
  "\u0E57": "7",
  "\u0E58": "8",
  "\u0E59": "9"
};
function ocrAssetsReady() {
  return fs2.existsSync(path3.join(DATA_DIR, "tha.traineddata.gz")) && fs2.existsSync(path3.join(DATA_DIR, "eng.traineddata.gz"));
}
function decodeDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("OCR expects a base64 data URL");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) throw new Error("OCR received an empty image");
  return bytes;
}
async function buildReceiptHeaderDataUrl(dataUrl) {
  const input = decodeDataUrl(dataUrl);
  const trimmed = await sharp3(input).rotate().trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true });
  const headerHeight = Math.max(1, Math.floor(trimmed.info.height * 0.75));
  const header = await sharp3(trimmed.data).extract({ left: 0, top: 0, width: trimmed.info.width, height: headerHeight }).resize({ width: 3200, fit: "inside", withoutEnlargement: false, kernel: sharp3.kernel.lanczos3 }).sharpen({ sigma: 1.1 }).png().toBuffer();
  return `data:image/png;base64,${header.toString("base64")}`;
}
function normalizeDigits(text2) {
  return text2.replace(/[๐-๙]/g, (digit) => thaiDigitMap[digit] || digit);
}
function normalizeOcrText(text2) {
  return normalizeDigits(text2).replace(/\u00a0/g, " ").replace(/[|¦]/g, "I").replace(/[ \t]+/g, " ").replace(/\r/g, "").split("\n").map((line) => {
    const tokens = line.trim().split(/[ \t]+/).filter((token) => /^[\u0E00-\u0E7F]+$/.test(token));
    if (tokens.length < 3 || tokens.filter((token) => token.length <= 2).length / tokens.length < 0.6) return line;
    return line.replace(/([\u0E00-\u0E7F])[ \t]+(?=[\u0E00-\u0E7F])/g, "$1");
  }).join("\n").replace(/ํา/g, "\u0E33").trim();
}
function parseMoney(raw) {
  const cleaned = raw.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}
function extractAmount(text2) {
  const payable = extractThaiPayableAmount(text2);
  if (payable > 0) return payable;
  const flat = text2.replace(/\s+/g, " ");
  const lines = text2.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const preferred = /(จำนวน(?:เงิน)?|ยอด(?:โอน|ชำระ|สุทธิ|รวม)|amount|total)/i;
  const fee = /(ค่าธรรมเนียม|fee)/i;
  const currency = /(บาท|thb|฿)/i;
  const token = "([0-9]{1,3}(?:,[0-9]{3})*(?:\\.\\d{1,2})|[0-9]+(?:\\.\\d{1,2})?)";
  const candidates = [];
  const add = (raw, score, context) => {
    const amount = parseMoney(raw);
    if (amount <= 0 || amount > 1e8) return;
    if (fee.test(context) && !preferred.test(context.replace(fee, ""))) return;
    candidates.push({ amount, score });
  };
  const keyed = new RegExp(`(?:\u0E08\u0E33\u0E19\u0E27\u0E19(?:\u0E40\u0E07\u0E34\u0E19)?|\u0E22\u0E2D\u0E14(?:\u0E42\u0E2D\u0E19|\u0E0A\u0E33\u0E23\u0E30|\u0E2A\u0E38\u0E17\u0E18\u0E34|\u0E23\u0E27\u0E21)|amount|total)\\s*[:\uFF1A=-]?\\s*(?:\u0E3F|THB)?\\s*${token}`, "ig");
  let keyedMatch;
  while ((keyedMatch = keyed.exec(flat)) !== null) {
    const context = flat.slice(Math.max(0, keyedMatch.index - 18), Math.min(flat.length, keyed.lastIndex + 25));
    add(keyedMatch[1], 30, context);
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (!preferred.test(lines[i])) continue;
    const window = [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean).join(" ");
    const m = window.match(new RegExp(token));
    if (m) add(m[1], 24, window);
  }
  const baht = new RegExp(`${token}\\s*(?:\u0E1A\u0E32\u0E17|THB|\u0E3F)`, "ig");
  let bahtMatch;
  while ((bahtMatch = baht.exec(flat)) !== null) {
    const context = flat.slice(Math.max(0, bahtMatch.index - 45), Math.min(flat.length, baht.lastIndex + 30));
    if (/ยอดคงเหลือ|balance/i.test(context)) continue;
    add(bahtMatch[1], preferred.test(context) ? 18 : 8, context);
  }
  const numberRe = /(?:฿|THB)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})|[0-9]+(?:\.\d{1,2})?)\s*(?:บาท|THB|฿)?/ig;
  for (const line of lines) {
    if (fee.test(line) || /ยอดคงเหลือ|balance/i.test(line)) continue;
    const score = preferred.test(line) ? 14 : currency.test(line) ? 6 : 0;
    if (!score) continue;
    numberRe.lastIndex = 0;
    let m;
    while ((m = numberRe.exec(line)) !== null) add(m[1], score, line);
  }
  candidates.sort((a, b) => b.score - a.score || b.amount - a.amount);
  return candidates[0]?.amount ?? 0;
}
function cleanMerchantCandidate(raw) {
  let value = raw.replace(/^(?:ผู้รับ|ผู้รับเงิน|ไปยัง|ชื่อผู้รับ|recipient|merchant|to)\s*[:：-]?\s*/i, "").replace(/(?:^|\s)(?:เลขที่รายการ|เลขอ้างอิง|หมายเลขอ้างอิง|reference(?:\s*(?:no|number))?|transaction\s*id)\s*[:：#-]?[\s\S]*$/i, "").replace(/(?:^|\s)(?:จำนวน(?:เงิน)?|ยอด(?:โอน|ชำระ|สุทธิ|รวม)|ค่าธรรมเนียม|fee)\s*[:：=\-]?[\s\S]*$/i, "").replace(/\s+(?:[A-Z0-9]{16,}|\d{12,})\s*$/i, "").replace(/^[^A-Za-z\u0E00-\u0E7F]+/, "").trim();
  if (/[\u0E00-\u0E7F]/.test(value)) {
    value = value.replace(/^[A-Za-z0-9]{1,4}[\s|:;._-]+(?=[\u0E00-\u0E7F])/, "");
  }
  return value.replace(/คาเฟ[่]?\s*อเมซอน/gi, "\u0E04\u0E32\u0E40\u0E1F\u0E48 \u0E2D\u0E40\u0E21\u0E0B\u0E2D\u0E19").replace(/cafe\s*amazon/gi, "Cafe Amazon").replace(/([ก-๙])\s+(เฮ้าส์)/g, "$1$2").replace(/[ \t]+/g, " ").replace(/^[|:;._-]+|[|:;._-]+$/g, "").trim().slice(0, 160);
}
function merchantBoundary(line) {
  const value = line.trim();
  if (!value) return true;
  if (/^(?:ชำระเงินสำเร็จ|โอนเงินสำเร็จ|โอนสำเร็จ|นาย\s|นาง\s|น\.ส\.|ธ\.|ธนาคาร|bank|xxx|x{3,}|k\+|เลขที่รายการ|เลขอ้างอิง|reference|จำนวน|ยอด|ค่าธรรมเนียม|fee|บันทึกช่วยจำ|หมายเหตุ|สแกน|scan)/i.test(value)) return true;
  if (/^\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/i.test(value)) return true;
  if (/^(?:[A-Z0-9-]{14,}|\d{10,})$/i.test(value.replace(/\s+/g, ""))) return true;
  return false;
}
function extractMerchant(text2) {
  const lines = text2.split(/\n+/).map((line) => line.trim()).filter(Boolean).filter((line) => !/^(?:ประเภท|ชื่อพนักงาน|พนักงาน|เวลา|สินค้า|qty|ทั้งหมด|เงินสด|เงินทอน)\s*[:：]?/i.test(line));
  const direct = lines.find((line) => /^(?:ผู้รับ|ผู้รับเงิน|ไปยัง|ชื่อผู้รับ|recipient|merchant|to)\s*[:：-]?\s*.+/i.test(line));
  if (direct) return cleanMerchantCandidate(direct);
  const markerIndex = lines.findIndex((line) => /^(?:ผู้รับ|ผู้รับเงิน|ไปยัง|ชื่อผู้รับ|recipient|merchant|to)\s*[:：-]?$/i.test(line));
  if (markerIndex >= 0 && lines[markerIndex + 1]) return cleanMerchantCandidate(lines[markerIndex + 1]);
  const merchantIndex = lines.findIndex((line) => /(?:คาเฟ่|คาเฟอเมซอน|กาแฟ|coffee|cafe|amazon|อเมซอน|ร้าน|บริษัท|จำกัด|บจก\.?|หจก\.?|co\.?\s*ltd|company|\bcj\b)/i.test(line) && !/(ผู้โอน|จากบัญชี|ธ\.|ธนาคาร|bank|เลขที่รายการ|ค่าธรรมเนียม)/i.test(line));
  if (merchantIndex >= 0) {
    const parts = [cleanMerchantCandidate(lines[merchantIndex])].filter(Boolean);
    for (let i = merchantIndex + 1; i < Math.min(lines.length, merchantIndex + 4); i += 1) {
      if (merchantBoundary(lines[i])) break;
      const next = cleanMerchantCandidate(lines[i]);
      if (!next || !/[A-Za-z\u0E00-\u0E7F]/.test(next)) break;
      const compactValue = (value) => value.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, "");
      const existing = compactValue(parts.join(" "));
      const candidate = compactValue(next);
      if (candidate.length >= 5 && existing.includes(candidate)) continue;
      parts.push(next);
    }
    return cleanMerchantCandidate(parts.join(" "));
  }
  const endIndex = lines.findIndex((line) => /^(?:เลขที่รายการ|เลขอ้างอิง|reference|จำนวน|ค่าธรรมเนียม)/i.test(line));
  if (endIndex > 0) {
    for (let i = endIndex - 1; i >= Math.max(0, endIndex - 4); i -= 1) {
      if (merchantBoundary(lines[i])) continue;
      const candidate = cleanMerchantCandidate(lines[i]);
      if (candidate && /[A-Za-z\u0E00-\u0E7F]/.test(candidate)) return candidate;
    }
  }
  return "";
}
function extractReference(text2) {
  const match = text2.match(/(?:เลขที่รายการ|เลขอ้างอิง|หมายเลขอ้างอิง|reference(?:\s*(?:no|number))?|transaction\s*id)\s*[:：#-]?\s*([A-Z0-9-]{6,50})/i);
  return match?.[1]?.trim() ?? "";
}
function detectDocumentType(text2) {
  if (/(โอนเงิน|โอนสำเร็จ|โอนเงินสำเร็จ|ชำระเงินสำเร็จ|พร้อมเพย์|promptpay|k\+|กสิกรไทย|ธ\.|ธนาคาร|bank transfer|transfer success(?:ful)?)/i.test(text2)) return "bank_slip";
  if (/(ใบเสร็จ|ใบกำกับ|receipt|ยอดสุทธิ|ยอดรวม|total|ค่าสินค้า\s*\/\s*บริการ|จำนวนเงินที่ชำระ|ทั้งหมด\s*[:：]?\s*[฿B]?\s*\d)/i.test(text2)) return "receipt";
  if (/(นัด|appointment|วันนัด)/i.test(text2)) return "appointment";
  return "unknown";
}
function guessCategory(text2) {
  if (/ทานที่ร้าน|ต้มยำ|หมูย่าง|ปีกไก่|เป๊ปซี่|เหนียว|ทะเล/i.test(text2)) return "\u0E2D\u0E32\u0E2B\u0E32\u0E23";
  if (/(กาแฟ|คาเฟ่|อเมซอน|amazon|coffee|cafe|อาหาร|restaurant|ข้าว|ชา|เครื่องดื่ม|food|กระเพรา|กะเพรา)/i.test(text2)) return "\u0E2D\u0E32\u0E2B\u0E32\u0E23";
  if (/(น้ำมัน|fuel|gas station|แท็กซี่|taxi|grab|รถไฟ|bts|mrt|ทางด่วน)/i.test(text2)) return "\u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07";
  if (/(ไฟฟ้า|ประปา|อินเทอร์เน็ต|internet|โทรศัพท์|ค่าไฟ|ค่าน้ำ)/i.test(text2)) return "\u0E04\u0E48\u0E32\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E39\u0E1B\u0E42\u0E20\u0E04";
  if (/(โรงพยาบาล|clinic|คลินิก|ยา|pharmacy|medical)/i.test(text2)) return "\u0E2A\u0E38\u0E02\u0E20\u0E32\u0E1E";
  if (/(โรงเรียน|ค่าเรียน|tuition|course|หนังสือ|book)/i.test(text2)) return "\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32";
  if (/(movie|cinema|เกม|game|netflix|spotify|บันเทิง)/i.test(text2)) return "\u0E1A\u0E31\u0E19\u0E40\u0E17\u0E34\u0E07";
  if (/(shop|store|ห้าง|shopping|ช้อป|สินค้า|\bcj\b)/i.test(text2)) return "\u0E0A\u0E49\u0E2D\u0E1B\u0E1B\u0E34\u0E49\u0E07";
  if (/(hotel|โรงแรม|flight|เที่ยวบิน|travel|ท่องเที่ยว)/i.test(text2)) return "\u0E17\u0E48\u0E2D\u0E07\u0E40\u0E17\u0E35\u0E48\u0E22\u0E27";
  return "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B";
}
function analyzeOcrText(rawText) {
  const text2 = normalizeOcrText(rawText);
  const documentType = detectDocumentType(text2);
  const amount = extractAmount(text2);
  const dateTime = extractThaiSlipDateTime(text2);
  const merchant = extractMerchant(text2);
  const receiptNumber = extractReference(text2);
  let kind = "unknown";
  if (amount > 0) kind = "expense";
  else if (documentType === "appointment" && dateTime.dateText) kind = "reminder";
  const confidence = Math.min(0.97, 0.28 + (amount > 0 ? 0.34 : 0) + (dateTime.dateText ? 0.14 : 0) + (dateTime.timeText ? 0.05 : 0) + (merchant ? 0.08 : 0) + (documentType !== "unknown" ? 0.07 : 0));
  const memo = text2.match(/(?:บันทึกช่วยจำ|หมายเหตุ|memo)\s*[:：]\s*([^\n]+)/i)?.[1]?.trim();
  const title = memo || (documentType === "bank_slip" ? "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19" : documentType === "receipt" ? "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E08\u0E32\u0E01\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08" : documentType === "appointment" ? "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E19\u0E31\u0E14\u0E2B\u0E21\u0E32\u0E22" : "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B");
  const proposal = enrichThaiReceiptProposal(text2, {
    kind,
    documentType,
    title,
    merchant,
    dateText: dateTime.dateText,
    timeText: dateTime.timeText,
    amount,
    currency: amount > 0 ? "\u0E1A\u0E32\u0E17" : "",
    category: kind === "expense" ? guessCategory(text2) : "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B",
    paymentMethod: documentType === "bank_slip" ? "\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19" : "",
    receiptNumber,
    lineItems: [],
    note: memo || ""
  });
  if (proposal.amount > 0) proposal.kind = "expense";
  const summary = proposal.kind === "expense" ? `OCR \u0E2D\u0E48\u0E32\u0E19${proposal.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08"}\u0E44\u0E14\u0E49 \u0E22\u0E2D\u0E14 ${proposal.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17${proposal.dateText ? ` \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${proposal.dateText}` : " \u0E41\u0E15\u0E48\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14"}` : proposal.kind === "reminder" ? `OCR \u0E2D\u0E48\u0E32\u0E19\u0E27\u0E31\u0E19\u0E19\u0E31\u0E14\u0E44\u0E14\u0E49 ${proposal.dateText}${proposal.timeText ? ` ${proposal.timeText}` : ""}` : "OCR \u0E2D\u0E48\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B\u0E44\u0E14\u0E49 \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E22\u0E2D\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E21\u0E31\u0E48\u0E19\u0E43\u0E08\u0E1E\u0E2D\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01";
  return { summary, confidence, proposals: [proposal] };
}
function actionable(analysis) {
  const proposal = analysis.proposals[0];
  return Boolean(proposal && (proposal.kind === "expense" && proposal.amount > 0 && proposal.documentType !== "unknown" || proposal.kind === "reminder" && proposal.dateText));
}
function scoreAnalysis(analysis) {
  const p = analysis.proposals[0];
  if (!p) return analysis.confidence;
  return analysis.confidence + (p.amount > 0 ? 8 : 0) + (p.documentType !== "unknown" ? 3 : 0) + (p.dateText ? 2 : 0) + (p.timeText ? 0.5 : 0) + (p.merchant ? 1 : 0) + (p.receiptNumber ? 0.5 : 0);
}
async function analyzeImageWithOcr(dataUrl) {
  if (!ocrAssetsReady()) throw new Error(`OCR language data is unavailable at ${DATA_DIR}`);
  fs2.mkdirSync(CACHE_DIR, { recursive: true });
  const input = decodeDataUrl(dataUrl);
  const base = sharp3(input).rotate().resize({ width: 2e3, fit: "inside", withoutEnlargement: false, kernel: sharp3.kernel.lanczos3 }).grayscale().normalize().sharpen({ sigma: 1.05 });
  const meta = await sharp3(input).rotate().metadata();
  const imageHeight = meta.height || 0;
  const topCropHeight = imageHeight > 0 ? Math.max(1, Math.floor(imageHeight * 0.72)) : 0;
  const topFocus = topCropHeight > 0 ? sharp3(input).rotate().extract({ left: 0, top: 0, width: meta.width || 1, height: topCropHeight }).resize({ width: 3e3, fit: "inside", withoutEnlargement: false, kernel: sharp3.kernel.lanczos3 }).grayscale().normalize().sharpen({ sigma: 1.15 }) : void 0;
  const trimmed = await sharp3(input).rotate().trim({ threshold: 12 }).png().toBuffer({ resolveWithObject: true });
  const trimmedHeaderHeight = Math.max(1, Math.floor(trimmed.info.height * 0.62));
  const trimmedHeader = sharp3(trimmed.data).extract({ left: 0, top: 0, width: trimmed.info.width, height: trimmedHeaderHeight }).resize({ width: 3200, fit: "inside", withoutEnlargement: false, kernel: sharp3.kernel.lanczos3 }).grayscale().normalize().sharpen({ sigma: 1.2 });
  const variants = [
    { label: "normalized-upscaled", bytes: await base.clone().png().toBuffer(), psm: "6" },
    { label: "trimmed-header-sparse", bytes: await trimmedHeader.clone().linear(1.18, -12).png().toBuffer(), psm: "11" },
    { label: "trimmed-header-threshold", bytes: await trimmedHeader.clone().threshold(170).png().toBuffer(), psm: "11" },
    ...topFocus ? [
      { label: "top-focus", bytes: await topFocus.clone().png().toBuffer(), psm: "6" },
      { label: "top-focus-sparse", bytes: await topFocus.clone().linear(1.28, -18).png().toBuffer(), psm: "11" },
      { label: "top-focus-threshold", bytes: await topFocus.clone().threshold(182).png().toBuffer(), psm: "11" }
    ] : [],
    { label: "medium-contrast", bytes: await base.clone().linear(1.25, -20).png().toBuffer(), psm: "6" }
  ];
  const workerPath = requireOcr.resolve("tesseract.js/src/worker-script/node/index.js");
  if (!fs2.existsSync(workerPath)) throw new Error("OCR worker is missing from deployment");
  let expired = false;
  const initializing = createWorker(["tha", "eng"], void 0, {
    workerPath,
    langPath: DATA_DIR,
    cachePath: CACHE_DIR,
    gzip: true,
    logger: () => void 0
  }).then(async (worker2) => {
    if (expired) {
      await worker2.terminate();
      throw new Error("OCR initialization expired");
    }
    return worker2;
  });
  const worker = await withOcrDeadline(initializing, "initialization").catch((error) => {
    expired = true;
    throw error;
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const texts = [];
    let best;
    let bestScore = -Infinity;
    for (const variant of variants) {
      await worker.setParameters({ tessedit_pageseg_mode: variant.psm });
      const result = await withOcrDeadline(worker.recognize(variant.bytes), "recognition");
      const raw = result.data.text || "";
      texts.push(raw);
      const analysis = analyzeOcrText(texts.join("\n"));
      const score = scoreAnalysis(analysis);
      console.info("[Milo OCR] pass", {
        label: variant.label,
        chars: raw.length,
        confidence: analysis.confidence,
        documentType: analysis.proposals[0]?.documentType,
        amount: analysis.proposals[0]?.amount,
        dateText: analysis.proposals[0]?.dateText
      });
      if (score > bestScore) {
        best = analysis;
        bestScore = score;
      }
      const p = analysis.proposals[0];
      if (actionable(analysis) && p?.dateText) return analysis;
    }
    if (!best) throw new Error("OCR returned no text");
    return best;
  } finally {
    await worker.terminate();
  }
}

// server/milo/imageAnalysis.ts
var schema2 = {
  type: "object",
  properties: {
    summary: { type: "string" },
    confidence: { type: "number" },
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
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
        },
        required: ["kind", "documentType", "title", "merchant", "dateText", "timeText", "amount", "currency", "category", "paymentMethod", "receiptNumber", "lineItems", "note"],
        additionalProperties: false
      }
    }
  },
  required: ["summary", "confidence", "proposals"],
  additionalProperties: false
};
var SYSTEM_PROMPT = "\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D\u0E44\u0E21\u0E42\u0E25 \u0E1C\u0E39\u0E49\u0E0A\u0E48\u0E27\u0E22\u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22 \u0E2D\u0E48\u0E32\u0E19\u0E20\u0E32\u0E1E\u0E43\u0E1A\u0E19\u0E31\u0E14 \u0E15\u0E32\u0E23\u0E32\u0E07 \u0E2A\u0E25\u0E34\u0E1B\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19 \u0E41\u0E25\u0E30\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E23\u0E30\u0E21\u0E31\u0E14\u0E23\u0E30\u0E27\u0E31\u0E07 \u0E04\u0E37\u0E19 JSON \u0E15\u0E32\u0E21 schema \u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19 \u0E2B\u0E49\u0E32\u0E21\u0E40\u0E14\u0E32\u0E2B\u0E23\u0E37\u0E2D\u0E41\u0E15\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21/\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E2D\u0E48\u0E32\u0E19\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E2A\u0E25\u0E34\u0E1B\u0E43\u0E2B\u0E49\u0E43\u0E0A\u0E49\u0E22\u0E2D\u0E14\u0E42\u0E2D\u0E19\u0E08\u0E23\u0E34\u0E07 \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E49\u0E22\u0E2D\u0E14\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E2B\u0E23\u0E37\u0E2D\u0E04\u0E48\u0E32\u0E18\u0E23\u0E23\u0E21\u0E40\u0E19\u0E35\u0E22\u0E21 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08 POS \u0E43\u0E2B\u0E49\u0E15\u0E23\u0E27\u0E08\u0E15\u0E31\u0E49\u0E07\u0E41\u0E15\u0E48\u0E2B\u0E31\u0E27\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E16\u0E36\u0E07\u0E17\u0E49\u0E32\u0E22\u0E43\u0E1A: merchant \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E0A\u0E37\u0E48\u0E2D\u0E23\u0E49\u0E32\u0E19\u0E08\u0E23\u0E34\u0E07\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19, receiptNumber \u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E48\u0E32\u0E19\u0E08\u0E32\u0E01\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08, dateText/timeText \u0E15\u0E49\u0E2D\u0E07\u0E21\u0E32\u0E08\u0E32\u0E01\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E41\u0E25\u0E30\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E1A\u0E19\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23, paymentMethod \u0E43\u0E2B\u0E49\u0E2D\u0E48\u0E32\u0E19\u0E08\u0E32\u0E01\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14/QR/\u0E1A\u0E31\u0E15\u0E23/\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19 \u0E41\u0E25\u0E30 lineItems \u0E15\u0E49\u0E2D\u0E07\u0E16\u0E2D\u0E14\u0E17\u0E38\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E19\u0E15\u0E32\u0E23\u0E32\u0E07\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E40\u0E17\u0E48\u0E32\u0E17\u0E35\u0E48\u0E2D\u0E48\u0E32\u0E19\u0E44\u0E14\u0E49 \u0E42\u0E14\u0E22\u0E40\u0E01\u0E47\u0E1A\u0E0A\u0E37\u0E48\u0E2D\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 \u0E08\u0E33\u0E19\u0E27\u0E19 \u0E41\u0E25\u0E30\u0E22\u0E2D\u0E14\u0E02\u0E2D\u0E07\u0E41\u0E16\u0E27\u0E19\u0E31\u0E49\u0E19 \u0E44\u0E21\u0E48\u0E40\u0E2D\u0E32\u0E2B\u0E31\u0E27\u0E15\u0E32\u0E23\u0E32\u0E07 \u0E22\u0E2D\u0E14\u0E23\u0E27\u0E21 \u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14 \u0E40\u0E07\u0E34\u0E19\u0E17\u0E2D\u0E19 \u0E2B\u0E23\u0E37\u0E2D footer \u0E21\u0E32\u0E40\u0E1B\u0E47\u0E19\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E22\u0E2D\u0E14 amount \u0E43\u0E2B\u0E49\u0E43\u0E0A\u0E49\u0E22\u0E2D\u0E14\u0E17\u0E35\u0E48\u0E08\u0E48\u0E32\u0E22\u0E08\u0E23\u0E34\u0E07\u0E2B\u0E25\u0E31\u0E07\u0E2A\u0E48\u0E27\u0E19\u0E25\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E0A\u0E48\u0E27\u0E22\u0E40\u0E2B\u0E25\u0E37\u0E2D \u0E42\u0E14\u0E22\u0E43\u0E2B\u0E49\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E33\u0E04\u0E31\u0E0D\u0E01\u0E31\u0E1A \u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E35\u0E48\u0E0A\u0E33\u0E23\u0E30, \u0E22\u0E2D\u0E14\u0E17\u0E35\u0E48\u0E0A\u0E33\u0E23\u0E30, \u0E22\u0E2D\u0E14\u0E2A\u0E38\u0E17\u0E18\u0E34, \u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14, Grand Total \u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32\u0E04\u0E48\u0E32\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32/\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23\u0E01\u0E48\u0E2D\u0E19\u0E2A\u0E48\u0E27\u0E19\u0E25\u0E14 \u0E2B\u0E32\u0E01\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E2D\u0E48\u0E32\u0E19\u0E44\u0E14\u0E49\u0E41\u0E19\u0E48\u0E0A\u0E31\u0E14\u0E43\u0E2B\u0E49\u0E2A\u0E48\u0E07 dateText \u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A YYYY-MM-DD \u0E21\u0E34\u0E09\u0E30\u0E19\u0E31\u0E49\u0E19\u0E40\u0E1B\u0E47\u0E19\u0E2A\u0E15\u0E23\u0E34\u0E07\u0E27\u0E48\u0E32\u0E07 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u0E43\u0E2B\u0E49\u0E40\u0E25\u0E37\u0E2D\u0E01 category \u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22\u0E08\u0E32\u0E01 \u0E2D\u0E32\u0E2B\u0E32\u0E23, \u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07, \u0E04\u0E48\u0E32\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E39\u0E1B\u0E42\u0E20\u0E04, \u0E2A\u0E38\u0E02\u0E20\u0E32\u0E1E, \u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32, \u0E1A\u0E31\u0E19\u0E40\u0E17\u0E34\u0E07, \u0E0A\u0E49\u0E2D\u0E1B\u0E1B\u0E34\u0E49\u0E07, \u0E17\u0E48\u0E2D\u0E07\u0E40\u0E17\u0E35\u0E48\u0E22\u0E27, \u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B \u0E2B\u0E32\u0E01\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E14\u0E49\u0E43\u0E2B\u0E49\u0E43\u0E0A\u0E49 kind=unknown \u0E41\u0E25\u0E30 amount=0";
var USER_PROMPT = "\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E20\u0E32\u0E1E\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E2B\u0E32\u0E43\u0E1A\u0E19\u0E31\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u0E08\u0E32\u0E01\u0E2A\u0E25\u0E34\u0E1B/\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08 \u0E42\u0E14\u0E22\u0E40\u0E2A\u0E19\u0E2D\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E2B\u0E49\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E48\u0E2D\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19";
var RECEIPT_DETAIL_PROMPT = "\u0E15\u0E23\u0E27\u0E08\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E19\u0E35\u0E49\u0E0B\u0E49\u0E33\u0E41\u0E1A\u0E1A\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E40\u0E2B\u0E21\u0E37\u0E2D\u0E19\u0E1C\u0E39\u0E49\u0E15\u0E23\u0E27\u0E08\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23 POS: \u0E2D\u0E48\u0E32\u0E19\u0E0A\u0E37\u0E48\u0E2D\u0E23\u0E49\u0E32\u0E19\u0E08\u0E32\u0E01\u0E2B\u0E31\u0E27\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23, \u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08, \u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E01\u0E32\u0E23\u0E0B\u0E37\u0E49\u0E2D, \u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E16\u0E49\u0E32\u0E21\u0E35, \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48/\u0E40\u0E27\u0E25\u0E32, \u0E27\u0E34\u0E18\u0E35\u0E0A\u0E33\u0E23\u0E30, \u0E22\u0E2D\u0E14\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E17\u0E35\u0E48\u0E08\u0E48\u0E32\u0E22\u0E08\u0E23\u0E34\u0E07 \u0E41\u0E25\u0E30\u0E16\u0E2D\u0E14\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E43\u0E19\u0E15\u0E32\u0E23\u0E32\u0E07\u0E43\u0E2B\u0E49\u0E04\u0E23\u0E1A\u0E17\u0E38\u0E01\u0E41\u0E16\u0E27\u0E17\u0E35\u0E48\u0E21\u0E2D\u0E07\u0E40\u0E2B\u0E47\u0E19 \u0E42\u0E14\u0E22 lineItems \u0E41\u0E15\u0E48\u0E25\u0E30\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E04\u0E27\u0E23\u0E21\u0E35\u0E0A\u0E37\u0E48\u0E2D\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 \xD7\u0E08\u0E33\u0E19\u0E27\u0E19 \u0E22\u0E2D\u0E14\u0E1A\u0E32\u0E17 \u0E2B\u0E49\u0E32\u0E21\u0E40\u0E2D\u0E32 Qty/\u0E23\u0E32\u0E04\u0E32/\u0E22\u0E2D\u0E14\u0E23\u0E27\u0E21/\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14/\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14/Powered by \u0E21\u0E32\u0E40\u0E1B\u0E47\u0E19\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 \u0E16\u0E49\u0E32\u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23\u0E41\u0E16\u0E27\u0E43\u0E14\u0E2D\u0E48\u0E32\u0E19\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14\u0E43\u0E2B\u0E49\u0E40\u0E27\u0E49\u0E19\u0E2A\u0E48\u0E27\u0E19\u0E19\u0E31\u0E49\u0E19\u0E41\u0E17\u0E19\u0E01\u0E32\u0E23\u0E40\u0E14\u0E32";
function parseAnalysisContent(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("Image model did not return JSON");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const json = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.proposals) || typeof parsed.summary !== "string") throw new Error("Image model returned an invalid analysis");
  return parsed;
}
async function analyzeImageWithForge(dataUrl) {
  const response = await invokeLLM({
    model: ENV.visionModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
        ]
      }
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_image_analysis", strict: true, schema: schema2 } }
  });
  return parseAnalysisContent(response.choices[0]?.message.content);
}
async function gatewayRequest(dataUrl, token, structured, userPrompt = USER_PROMPT) {
  const body = {
    model: process.env.MILO_VISION_MODEL || "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
        ]
      }
    ],
    stream: false,
    temperature: 0
  };
  if (structured) body.response_format = { type: "json_schema", json_schema: { name: "milo_image_analysis", strict: true, schema: schema2 } };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45e3);
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `AI Gateway returned HTTP ${response.status}`);
    return parseAnalysisContent(payload.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timeout);
  }
}
async function analyzeImageWithGatewayKey(dataUrl, token, userPrompt = USER_PROMPT) {
  try {
    return await gatewayRequest(dataUrl, token, true, userPrompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/response.?format|json.?schema|structured/i.test(message)) return gatewayRequest(dataUrl, token, false, userPrompt);
    throw error;
  }
}
var receiptDateSchema = {
  type: "object",
  properties: {
    dateText: { type: "string" },
    timeText: { type: "string" },
    evidence: { type: "string" }
  },
  required: ["dateText", "timeText", "evidence"],
  additionalProperties: false
};
function parseReceiptDateRepairContent(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("Receipt date repair returned empty content");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const json = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
  const parsed = JSON.parse(json);
  const rawDate = String(parsed.dateText || "").trim();
  const rawTime = String(parsed.timeText || "").trim();
  const evidence = String(parsed.evidence || "").trim();
  const dt = extractThaiSlipDateTime([rawDate, rawTime, evidence].filter(Boolean).join(" "));
  return {
    dateText: /^20\d{2}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : dt.dateText,
    timeText: /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : dt.timeText,
    evidence
  };
}
async function receiptDateRepairRequest(dataUrl, token) {
  const body = {
    model: process.env.MILO_VISION_MODEL || "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: "\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D OCR verifier \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E44\u0E17\u0E22 \u0E07\u0E32\u0E19\u0E40\u0E14\u0E35\u0E22\u0E27\u0E04\u0E37\u0E2D\u0E2D\u0E48\u0E32\u0E19\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E17\u0E33\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E41\u0E25\u0E30\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E20\u0E32\u0E1E\u0E08\u0E23\u0E34\u0E07 \u0E2B\u0E49\u0E32\u0E21\u0E40\u0E14\u0E32\u0E08\u0E32\u0E01\u0E40\u0E27\u0E25\u0E32\u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19 \u0E2B\u0E23\u0E37\u0E2D\u0E1A\u0E23\u0E34\u0E1A\u0E17\u0E2D\u0E37\u0E48\u0E19 \u0E16\u0E49\u0E32\u0E2D\u0E48\u0E32\u0E19\u0E27\u0E31\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E1B\u0E35\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14\u0E43\u0E2B\u0E49 dateText \u0E40\u0E1B\u0E47\u0E19\u0E2A\u0E15\u0E23\u0E34\u0E07\u0E27\u0E48\u0E32\u0E07 \u0E16\u0E49\u0E32\u0E2D\u0E48\u0E32\u0E19\u0E40\u0E27\u0E25\u0E32\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14\u0E43\u0E2B\u0E49 timeText \u0E40\u0E1B\u0E47\u0E19\u0E2A\u0E15\u0E23\u0E34\u0E07\u0E27\u0E48\u0E32\u0E07 dateText \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19 YYYY-MM-DD \u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19 \u0E41\u0E25\u0E30 evidence \u0E43\u0E2B\u0E49\u0E04\u0E31\u0E14\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E31\u0E49\u0E19\u0E46 \u0E17\u0E35\u0E48\u0E21\u0E2D\u0E07\u0E40\u0E2B\u0E47\u0E19\u0E0B\u0E36\u0E48\u0E07\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48/\u0E40\u0E27\u0E25\u0E32" },
      {
        role: "user",
        content: [
          { type: "text", text: "\u0E15\u0E23\u0E27\u0E08\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E17\u0E33\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E41\u0E25\u0E30\u0E40\u0E27\u0E25\u0E32\u0E43\u0E19\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23\u0E19\u0E35\u0E49 \u0E21\u0E2D\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E31\u0E27\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23 \u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14\u0E43\u0E01\u0E25\u0E49\u0E04\u0E33\u0E27\u0E48\u0E32 \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48/\u0E40\u0E27\u0E25\u0E32 \u0E41\u0E25\u0E30\u0E1A\u0E23\u0E34\u0E40\u0E27\u0E13\u0E23\u0E2D\u0E1A\u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19 \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E2D\u0E32\u0E08\u0E40\u0E1B\u0E47\u0E19 \u0E1E.\u0E28. \u0E40\u0E0A\u0E48\u0E19 14 \u0E01.\u0E22. 2569, 14 \u0E01\u0E31\u0E19\u0E22\u0E32\u0E22\u0E19 2569, 14/09/2569, 14.09.69 \u0E2B\u0E32\u0E01\u0E21\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E40\u0E2B\u0E47\u0E19\u0E27\u0E31\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E1B\u0E35\u0E08\u0E23\u0E34\u0E07\u0E43\u0E2B\u0E49\u0E04\u0E37\u0E19 dateText \u0E27\u0E48\u0E32\u0E07" },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
        ]
      }
    ],
    stream: false,
    temperature: 0,
    response_format: { type: "json_schema", json_schema: { name: "milo_receipt_date_repair", strict: true, schema: receiptDateSchema } }
  };
  const run = async (structured) => {
    const requestBody = { ...body };
    if (!structured) delete requestBody.response_format;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e4);
    try {
      const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || `AI Gateway returned HTTP ${response.status}`);
      return parseReceiptDateRepairContent(payload.choices?.[0]?.message?.content);
    } finally {
      clearTimeout(timeout);
    }
  };
  try {
    return await run(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/response.?format|json.?schema|structured|invalid.*schema/i.test(message)) return run(false);
    throw error;
  }
}
function mergeDedicatedDateRepair(base, repair) {
  const b = base.proposals[0];
  if (!b || !repair.dateText) return base;
  return {
    ...base,
    summary: b.kind === "expense" ? `\u0E2D\u0E48\u0E32\u0E19${b.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08"}\u0E44\u0E14\u0E49 \u0E22\u0E2D\u0E14 ${b.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${repair.dateText}` : base.summary,
    confidence: Math.max(base.confidence, 0.9),
    proposals: [{ ...b, dateText: repair.dateText, timeText: b.timeText || repair.timeText }, ...base.proposals.slice(1)]
  };
}
function imageGatewayToken(env = process.env, requestToken) {
  return (env.AI_GATEWAY_API_KEY || requestToken || env.VERCEL_OIDC_TOKEN || "").trim();
}
function imageGatewayMode(env = process.env, requestToken) {
  if ((env.AI_GATEWAY_API_KEY || "").trim()) return "vercel-ai-gateway-key";
  if ((env.VERCEL_OIDC_TOKEN || "").trim() || requestToken?.trim()) return "vercel-ai-gateway-oidc";
  return void 0;
}
function imageAnalysisMode(requestToken) {
  if (ENV.forgeApiKey) return ocrAssetsReady() ? "forge-vision+ocr-fallback" : "forge-vision";
  const gatewayMode = imageGatewayMode(process.env, requestToken);
  if (gatewayMode) return ocrAssetsReady() ? `${gatewayMode}+ocr-fallback` : gatewayMode;
  return ocrAssetsReady() ? "ocr-fallback" : "unconfigured";
}
async function imageAnalysisRuntimeStatus(requestToken) {
  const mode = imageAnalysisMode(requestToken);
  return {
    mode,
    authenticated: Boolean(ENV.forgeApiKey || imageGatewayToken(process.env, requestToken) || ocrAssetsReady()),
    ocrAssetsReady: ocrAssetsReady()
  };
}
function receiptNeedsDetailRepair(analysis) {
  const proposal = analysis.proposals[0];
  if (!proposal || proposal.documentType !== "receipt" || proposal.kind !== "expense" || proposal.amount <= 0) return false;
  const merchant = normalizeThaiMerchantName(proposal.merchant);
  const merchantLooksOperational = !merchant || /^(?:ประเภท|พนักงาน|เวลา|วันที่|สินค้า|qty|ราคา|รวม)/i.test(merchant);
  return merchantLooksOperational || !proposal.lineItems?.length || proposal.lineItems.length < 2 || !proposal.receiptNumber;
}
async function refineReceiptDetails(analysis, dataUrl, gatewayKey) {
  if (!receiptNeedsDetailRepair(analysis)) return analysis;
  try {
    const repaired = await analyzeImageWithGatewayKey(dataUrl, gatewayKey, RECEIPT_DETAIL_PROMPT);
    const repairedProposal = repaired.proposals[0];
    if (!repairedProposal || repairedProposal.documentType !== "receipt") return analysis;
    const merged = mergeImageAnalyses(analysis, repaired);
    console.info("[Milo Image] receipt detail repair", {
      merchant: merged.proposals[0]?.merchant,
      receiptNumber: merged.proposals[0]?.receiptNumber,
      lineItems: merged.proposals[0]?.lineItems?.length ?? 0,
      amount: merged.proposals[0]?.amount
    });
    return merged;
  } catch (error) {
    console.warn("[Milo Image] receipt detail repair failed", { error: error instanceof Error ? error.message : "unknown" });
    return analysis;
  }
}
function merchantQuality(value) {
  const candidate = normalizeThaiMerchantName(value);
  if (!candidate) return -100;
  let score = Math.min(candidate.length, 80);
  if (/(ค่าสินค้า|บริการ|จำนวนเงิน|ยอด|ส่วนลด|สิทธิ|บาท|ค่าธรรมเนียม)/i.test(candidate)) score -= 80;
  if (/ร้าน|บจก|บริษัท|หจก|cj\b|cafe|amazon|อเมซอน/i.test(candidate)) score += 20;
  return score;
}
function mergeImageAnalyses(primary, ocr) {
  const p = primary.proposals[0];
  const o = ocr.proposals[0];
  if (!p) return ocr;
  if (!o) return primary;
  const documentType = p.documentType !== "unknown" ? p.documentType : o.documentType;
  const preferOcrAmount = o.amount > 0 && (p.amount <= 0 || documentType === "receipt" && o.amount !== p.amount);
  const amount = preferOcrAmount ? o.amount : p.amount || o.amount;
  const primaryMerchant = normalizeThaiMerchantName(p.merchant);
  const ocrMerchant = normalizeThaiMerchantName(o.merchant);
  const merchant = merchantQuality(ocrMerchant) >= merchantQuality(primaryMerchant) ? ocrMerchant : primaryMerchant;
  const merged = {
    ...p,
    kind: (p.kind === "expense" || o.kind === "expense") && amount > 0 ? "expense" : p.kind,
    documentType,
    merchant,
    dateText: p.dateText || o.dateText,
    timeText: p.timeText || o.timeText,
    amount,
    currency: p.currency || o.currency || "\u0E1A\u0E32\u0E17",
    category: p.category && p.category !== "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B" ? p.category : o.category,
    paymentMethod: p.paymentMethod || o.paymentMethod,
    receiptNumber: p.receiptNumber || o.receiptNumber,
    lineItems: Array.from(/* @__PURE__ */ new Set([...p.lineItems || [], ...o.lineItems || []])).slice(0, 20),
    note: p.note || o.note,
    title: documentType === "bank_slip" && o.title === "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19" && !o.note ? o.title : p.title && p.title !== "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B" ? p.title : o.title || p.title
  };
  const summary = merged.kind === "expense" ? `\u0E2D\u0E48\u0E32\u0E19${merged.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08"}\u0E44\u0E14\u0E49 \u0E22\u0E2D\u0E14 ${merged.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17${merged.dateText ? ` \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${merged.dateText}` : " \u0E41\u0E15\u0E48\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14"}` : primary.summary || ocr.summary;
  return { summary, confidence: Math.max(primary.confidence, ocr.confidence), proposals: [merged, ...primary.proposals.slice(1)] };
}
async function analyzeImage(dataUrl, options = {}) {
  let providerError;
  let providerAnalysis;
  if (ENV.forgeApiKey) {
    try {
      const analysis = await analyzeImageWithForge(dataUrl);
      if (analysis.proposals.some((item) => item.kind === "reminder" && Boolean(item.dateText))) return analysis;
      providerAnalysis = analysis;
      console.warn("[Milo Image] primary vision provider returned no actionable proposal; trying OCR enrichment");
    } catch (error) {
      providerError = error;
      console.warn("[Milo Image] primary vision provider failed; using local OCR fallback", {
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  const gatewayKey = imageGatewayToken(process.env, options.gatewayToken);
  if (gatewayKey) {
    try {
      const analysis = await analyzeImageWithGatewayKey(dataUrl, gatewayKey);
      if (analysis.proposals.some((item) => item.kind === "reminder" && Boolean(item.dateText))) return analysis;
      providerAnalysis = analysis;
      console.warn("[Milo Image] AI Gateway returned no actionable proposal; trying OCR enrichment");
    } catch (error) {
      providerError = error;
      console.warn("[Milo Image] AI Gateway failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  try {
    const ocrAnalysis = await analyzeImageWithOcr(dataUrl);
    if (!providerAnalysis) {
      let selected2 = ocrAnalysis;
      const proposal = selected2.proposals[0];
      if (gatewayKey && proposal?.kind === "expense" && !proposal.dateText && proposal.timeText) {
        try {
          const headerDataUrl = await buildReceiptHeaderDataUrl(dataUrl).catch(() => dataUrl);
          const repair = await receiptDateRepairRequest(headerDataUrl, gatewayKey);
          console.info("[Milo Image] focused date repair", { dateText: repair.dateText, timeText: repair.timeText, evidence: repair.evidence.slice(0, 120) });
          selected2 = mergeDedicatedDateRepair(selected2, repair);
          if (!selected2.proposals[0]?.dateText && headerDataUrl !== dataUrl) {
            const fullRepair = await receiptDateRepairRequest(dataUrl, gatewayKey);
            console.info("[Milo Image] full-image date repair", { dateText: fullRepair.dateText, timeText: fullRepair.timeText, evidence: fullRepair.evidence.slice(0, 120) });
            selected2 = mergeDedicatedDateRepair(selected2, fullRepair);
          }
        } catch (repairError) {
          console.warn("[Milo Image] OCR-only focused receipt date repair failed", {
            error: repairError instanceof Error ? repairError.message : "unknown"
          });
        }
      }
      if (gatewayKey) selected2 = await refineReceiptDetails(selected2, dataUrl, gatewayKey);
      return selected2;
    }
    const score = (analysis) => analysis.proposals.reduce((total, item) => total + (item.kind === "expense" && item.amount > 0 ? 6 : 0) + (item.kind === "reminder" && item.dateText ? 5 : 0) + (item.documentType !== "unknown" ? 1 : 0) + (item.dateText ? 1 : 0) + (item.merchant ? 0.5 : 0), analysis.confidence);
    let merged = mergeImageAnalyses(providerAnalysis, ocrAnalysis);
    let selected = score(merged) >= Math.max(score(ocrAnalysis), score(providerAnalysis)) ? merged : score(ocrAnalysis) > score(providerAnalysis) ? ocrAnalysis : providerAnalysis;
    const selectedProposal = selected.proposals[0];
    if (gatewayKey && selectedProposal?.kind === "expense" && !selectedProposal.dateText && selectedProposal.timeText) {
      try {
        const headerDataUrl = await buildReceiptHeaderDataUrl(dataUrl).catch(() => dataUrl);
        const repair = await receiptDateRepairRequest(headerDataUrl, gatewayKey);
        console.info("[Milo Image] focused date repair", { dateText: repair.dateText, timeText: repair.timeText, evidence: repair.evidence.slice(0, 120) });
        selected = mergeDedicatedDateRepair(selected, repair);
        if (!selected.proposals[0]?.dateText && headerDataUrl !== dataUrl) {
          const fullRepair = await receiptDateRepairRequest(dataUrl, gatewayKey);
          console.info("[Milo Image] full-image date repair", { dateText: fullRepair.dateText, timeText: fullRepair.timeText, evidence: fullRepair.evidence.slice(0, 120) });
          selected = mergeDedicatedDateRepair(selected, fullRepair);
        }
      } catch (repairError) {
        console.warn("[Milo Image] focused receipt date repair failed", {
          error: repairError instanceof Error ? repairError.message : "unknown"
        });
      }
    }
    if (gatewayKey) selected = await refineReceiptDetails(selected, dataUrl, gatewayKey);
    return selected;
  } catch (ocrError) {
    console.error("[Milo Image] OCR fallback failed", { error: ocrError instanceof Error ? ocrError.message : "unknown" });
    if (providerAnalysis) return gatewayKey ? refineReceiptDetails(providerAnalysis, dataUrl, gatewayKey) : providerAnalysis;
    if (providerError) {
      const providerMessage = providerError instanceof Error ? providerError.message : "unknown provider error";
      const ocrMessage = ocrError instanceof Error ? ocrError.message : "unknown OCR error";
      throw new Error(`Vision provider failed: ${providerMessage}; OCR fallback failed: ${ocrMessage}`);
    }
    throw ocrError;
  }
}

// server/milo/pdfAnalysis.ts
var schema3 = {
  type: "object",
  properties: {
    summary: { type: "string" },
    confidence: { type: "number" },
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["expense", "unknown"] },
          documentType: { type: "string", enum: ["receipt", "bank_slip", "unknown"] },
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
        },
        required: ["kind", "documentType", "title", "merchant", "dateText", "timeText", "amount", "currency", "category", "paymentMethod", "receiptNumber", "lineItems", "note"],
        additionalProperties: false
      }
    }
  },
  required: ["summary", "confidence", "proposals"],
  additionalProperties: false
};
async function extractPdfText(buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ first: 20 });
    return result.text.replace(/\u0000/g, "").trim().slice(0, 6e4);
  } finally {
    await parser.destroy();
  }
}
async function analyzePdfBuffer(buffer) {
  const text2 = await extractPdfText(buffer);
  if (!text2) throw new Error("PDF does not contain readable text");
  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    messages: [
      { role: "system", content: "\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D Milo \u0E1C\u0E39\u0E49\u0E0A\u0E48\u0E27\u0E22\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22 \u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E17\u0E35\u0E48\u0E14\u0E36\u0E07\u0E08\u0E32\u0E01 PDF \u0E40\u0E0A\u0E48\u0E19 \u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08 \u0E43\u0E1A\u0E41\u0E08\u0E49\u0E07\u0E22\u0E2D\u0E14 \u0E2B\u0E23\u0E37\u0E2D statement \u0E43\u0E2B\u0E49\u0E04\u0E37\u0E19 JSON \u0E15\u0E32\u0E21 schema \u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19 \u0E2B\u0E49\u0E32\u0E21\u0E40\u0E14\u0E32\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02 \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E1B\u0E23\u0E32\u0E01\u0E0F\u0E43\u0E19\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23 \u0E43\u0E2B\u0E49\u0E2A\u0E23\u0E49\u0E32\u0E07 proposal \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E17\u0E35\u0E48\u0E40\u0E2B\u0E47\u0E19\u0E0A\u0E31\u0E14\u0E40\u0E08\u0E19 \u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14 100 \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u0E16\u0E49\u0E32\u0E40\u0E1B\u0E47\u0E19 statement \u0E43\u0E2B\u0E49\u0E41\u0E22\u0E01\u0E41\u0E15\u0E48\u0E25\u0E30\u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E40\u0E1B\u0E47\u0E19\u0E04\u0E19\u0E25\u0E30 proposal \u0E42\u0E14\u0E22\u0E43\u0E0A\u0E49 dateText \u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A YYYY-MM-DD \u0E16\u0E49\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E27\u0E31\u0E19\u0E44\u0E14\u0E49\u0E0A\u0E31\u0E14\u0E40\u0E08\u0E19 \u0E40\u0E25\u0E37\u0E2D\u0E01 category \u0E08\u0E32\u0E01 \u0E2D\u0E32\u0E2B\u0E32\u0E23, \u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07, \u0E04\u0E48\u0E32\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E39\u0E1B\u0E42\u0E20\u0E04, \u0E2A\u0E38\u0E02\u0E20\u0E32\u0E1E, \u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32, \u0E1A\u0E31\u0E19\u0E40\u0E17\u0E34\u0E07, \u0E0A\u0E49\u0E2D\u0E1B\u0E1B\u0E34\u0E49\u0E07, \u0E17\u0E48\u0E2D\u0E07\u0E40\u0E17\u0E35\u0E48\u0E22\u0E27, \u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B \u0E41\u0E25\u0E30 amount \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E22\u0E2D\u0E14\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E08\u0E23\u0E34\u0E07\u0E15\u0E48\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E22\u0E2D\u0E14\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D" },
      { role: "user", content: `\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C PDF \u0E19\u0E35\u0E49\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E43\u0E2B\u0E49\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E15\u0E23\u0E27\u0E08\u0E41\u0E25\u0E30\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E48\u0E2D\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01

${text2}` }
    ],
    response_format: { type: "json_schema", json_schema: { name: "milo_pdf_analysis", strict: true, schema: schema3 } }
  });
  const content = response.choices[0]?.message.content;
  if (!content || typeof content !== "string") throw new Error("PDF model did not return JSON");
  const parsed = JSON.parse(content);
  parsed.proposals = parsed.proposals.filter((item) => item.kind === "expense" && Number(item.amount) > 0).slice(0, 100);
  return parsed;
}

// server/milo/financeExport.ts
import crypto7 from "node:crypto";
import * as XLSX from "xlsx";
function exportSecret() {
  const value = process.env.LINE_CHANNEL_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error("Export signing secret is not configured");
  return value;
}
function signaturePayload(lineUserId, financeAccountId, format, expires) {
  return `${lineUserId}|${financeAccountId}|${format}|${expires}`;
}
function sign3(lineUserId, financeAccountId, format, expires) {
  return crypto7.createHmac("sha256", exportSecret()).update(signaturePayload(lineUserId, financeAccountId, format, expires)).digest("hex");
}
function safeEqual2(a, b) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto7.timingSafeEqual(aa, bb);
}
function buildFinanceExportUrl(input) {
  const expires = Math.floor(Date.now() / 1e3) + Math.min(Math.max(input.ttlSeconds ?? 600, 60), 3600);
  const sig = sign3(input.lineUserId, input.financeAccountId, input.format, expires);
  const base = (process.env.MILO_APP_BASE_URL ?? process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? "https://milo-line-app.vercel.app").replace(/\/+$/, "");
  const params = new URLSearchParams({ user: input.lineUserId, account: String(input.financeAccountId), format: input.format, expires: String(expires), sig });
  return `${base}/api/milo/export?${params.toString()}`;
}
function thaiDateTime(value) {
  return new Intl.DateTimeFormat("th-TH-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(value);
}
function exportRows(rows) {
  return rows.map((row) => ({
    "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48-\u0E40\u0E27\u0E25\u0E32": thaiDateTime(row.occurredAt),
    "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17": row.transactionType === "income" ? "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A" : "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22",
    "\u0E2B\u0E21\u0E27\u0E14": row.category,
    "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23": row.note ?? "",
    "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19": Number(row.amount),
    "\u0E41\u0E2B\u0E25\u0E48\u0E07\u0E17\u0E35\u0E48\u0E21\u0E32": row.source
  }));
}
function csvCell(value) {
  const text2 = String(value ?? "");
  return /[",\n\r]/.test(text2) ? `"${text2.replace(/"/g, '""')}"` : text2;
}
function toCsv(rows) {
  const headers = ["\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48-\u0E40\u0E27\u0E25\u0E32", "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17", "\u0E2B\u0E21\u0E27\u0E14", "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23", "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19", "\u0E41\u0E2B\u0E25\u0E48\u0E07\u0E17\u0E35\u0E48\u0E21\u0E32"];
  return `\uFEFF${headers.join(",")}
${rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")).join("\n")}`;
}
function registerFinanceExportRoute(app2) {
  app2.get("/api/milo/export", async (req, res) => {
    try {
      const lineUserId = String(req.query.user ?? "");
      const financeAccountId = Number(req.query.account ?? 0);
      const format = req.query.format === "xlsx" ? "xlsx" : "csv";
      const expires = Number(req.query.expires ?? 0);
      const supplied = String(req.query.sig ?? "");
      if (!lineUserId || !Number.isInteger(financeAccountId) || financeAccountId <= 0 || !Number.isInteger(expires) || expires < Math.floor(Date.now() / 1e3) || !supplied) return res.status(401).type("text/plain").send("Export link expired or invalid");
      const expected = sign3(lineUserId, financeAccountId, format, expires);
      if (!safeEqual2(supplied, expected)) return res.status(401).type("text/plain").send("Export link expired or invalid");
      const access = await getFinanceAccountAccess(financeAccountId, lineUserId);
      if (!access) return res.status(403).type("text/plain").send("No access to this finance account");
      const rows = exportRows(await listTransactionsForExport(lineUserId, financeAccountId));
      const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
      if (format === "csv") {
        res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="milo-transactions-${stamp}.csv"`, "Cache-Control": "private, no-store" });
        return res.status(200).send(toCsv(rows));
      }
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, sheet, "Transactions");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="milo-transactions-${stamp}.xlsx"`, "Cache-Control": "private, no-store" });
      return res.status(200).send(buffer);
    } catch (error) {
      console.error("[Milo Export] failed", error);
      return res.status(500).type("text/plain").send("Unable to export transactions");
    }
  });
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
var BANGKOK_OFFSET_MS3 = 7 * 60 * 60 * 1e3;
function titleWithoutSchedule(text2) {
  return text2.replace(/(?:ทุก\s*\d+\s*นาที|ทุกวัน|ทุกสัปดาห์(?:วัน)?(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?|ทุกเดือน(?:วันที่)?\s*\d+|พรุ่งนี้|วันนี้|วันที่\s*\d+\/\d+(?:\/\d+)?|\d{4}-\d{1,2}-\d{1,2}|(?:เวลา\s*)?\d{1,2}(?::|\.)?\d{0,2}\s*น?\.?)/gi, "").replace(/\s+/g, " ").trim() || "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E15\u0E37\u0E2D\u0E19";
}
function clock(text2) {
  const match = text2.match(/เวลา\s*(\d{1,2})(?:(?::|\.)(\d{2}))?/) ?? text2.match(/(?:^|\s)(\d{1,2})(?::|\.)(\d{2})(?:\s|น|$)/);
  return { hour: Math.min(Math.max(Number(match?.[1] ?? 9), 0), 23), minute: Math.min(Math.max(Number(match?.[2] ?? 0), 0), 59) };
}
function bangkokParts3(date) {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS3);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}
function atBangkok2(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}
function addBangkokDays2(parts, days) {
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: calendar.getUTCFullYear(), month: calendar.getUTCMonth() + 1, day: calendar.getUTCDate() };
}
function recurringFrom(value, now) {
  const prefix = value.match(/^(?:ตั้ง)?(?:จดอัตโนมัติ|จดประจำ|รายการประจำ)\s+(.+)$/i);
  if (!prefix) return void 0;
  const body = prefix[1].trim();
  const scheduleMatch = body.match(/\s+(ทุกวัน|ทุกสัปดาห์(?:วัน)?(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?|ทุกเดือน(?:วันที่)?\s*\d{1,2})(?:\s+(?:เวลา\s*)?(\d{1,2})(?::|\.)(\d{2}))?\s*$/i);
  if (!scheduleMatch || scheduleMatch.index === void 0) return void 0;
  const transactionText = body.slice(0, scheduleMatch.index).trim();
  const amountMatch = transactionText.match(/^(?:(รายรับ|รับ|รายจ่าย|จ่าย)\s*)?(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i);
  if (!amountMatch) return void 0;
  const transactionType = /รายรับ|รับ/i.test(amountMatch[1] ?? "") ? "income" : "expense";
  const note = amountMatch[2].trim().replace(/^ค่า(?=กาแฟ)/i, "");
  const amount = Number(amountMatch[3].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || !note) return void 0;
  const schedule = scheduleMatch[1];
  const hour = Math.min(Math.max(Number(scheduleMatch[2] ?? 9), 0), 23);
  const minute = Math.min(Math.max(Number(scheduleMatch[3] ?? 0), 0), 59);
  const parts = bangkokParts3(now);
  if (/ทุกวัน/i.test(schedule)) {
    let nextRunAt = atBangkok2(parts.year, parts.month, parts.day, hour, minute);
    if (nextRunAt <= now) {
      const next = addBangkokDays2(parts, 1);
      nextRunAt = atBangkok2(next.year, next.month, next.day, hour, minute);
    }
    return { type: "recurringCreate", transactionType, amount, category: suggestStandardCategory(transactionType, note), note, recurrenceType: "day", recurrenceInterval: 1, nextRunAt };
  }
  const weekly = schedule.match(/ทุกสัปดาห์(?:วัน)?(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?/i);
  if (weekly) {
    const map = { "\u0E2D\u0E32\u0E17\u0E34\u0E15\u0E22\u0E4C": 0, "\u0E08\u0E31\u0E19\u0E17\u0E23\u0E4C": 1, "\u0E2D\u0E31\u0E07\u0E04\u0E32\u0E23": 2, "\u0E1E\u0E38\u0E18": 3, "\u0E1E\u0E24\u0E2B\u0E31\u0E2A": 4, "\u0E28\u0E38\u0E01\u0E23\u0E4C": 5, "\u0E40\u0E2A\u0E32\u0E23\u0E4C": 6 };
    const recurrenceWeekday = map[weekly[1] ?? "\u0E08\u0E31\u0E19\u0E17\u0E23\u0E4C"];
    let days = (recurrenceWeekday - parts.weekday + 7) % 7;
    let date = addBangkokDays2(parts, days);
    let nextRunAt = atBangkok2(date.year, date.month, date.day, hour, minute);
    if (nextRunAt <= now) {
      days += 7;
      date = addBangkokDays2(parts, days);
      nextRunAt = atBangkok2(date.year, date.month, date.day, hour, minute);
    }
    return { type: "recurringCreate", transactionType, amount, category: suggestStandardCategory(transactionType, note), note, recurrenceType: "week", recurrenceInterval: 1, recurrenceWeekday, nextRunAt };
  }
  const monthly = schedule.match(/ทุกเดือน(?:วันที่)?\s*(\d{1,2})/i);
  if (monthly) {
    const recurrenceDayOfMonth = Math.min(Math.max(Number(monthly[1]), 1), 28);
    let nextRunAt = atBangkok2(parts.year, parts.month, recurrenceDayOfMonth, hour, minute);
    if (nextRunAt <= now) nextRunAt = atBangkok2(parts.year, parts.month + 1, recurrenceDayOfMonth, hour, minute);
    return { type: "recurringCreate", transactionType, amount, category: suggestStandardCategory(transactionType, note), note, recurrenceType: "month", recurrenceInterval: 1, recurrenceDayOfMonth, nextRunAt };
  }
  return void 0;
}
function reminderFrom(text2, now) {
  if (!/^(?:@?ไมโล\s*)?(?:ตั้ง)?เตือน(?:ฉัน)?\s*/i.test(text2.trim())) return void 0;
  const body = text2.trim().replace(/^(?:@?ไมโล\s*)?(?:ตั้ง)?เตือน(?:ฉัน)?\s*/i, "");
  const time = clock(body);
  const title = titleWithoutSchedule(body);
  const setTime = (date) => {
    const parts2 = bangkokParts3(date);
    return atBangkok2(parts2.year, parts2.month, parts2.day, time.hour, time.minute);
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
      const next = addBangkokDays2(bangkokParts3(now), 1);
      run2 = atBangkok2(next.year, next.month, next.day, time.hour, time.minute);
    }
    return { title, recurrenceType: "day", recurrenceInterval: 1, dueAt: run2, nextRunAt: run2 };
  }
  const weekly = body.match(/ทุกสัปดาห์(?:วัน)?(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)?/i);
  if (weekly) {
    const map = { "\u0E2D\u0E32\u0E17\u0E34\u0E15\u0E22\u0E4C": 0, "\u0E08\u0E31\u0E19\u0E17\u0E23\u0E4C": 1, "\u0E2D\u0E31\u0E07\u0E04\u0E32\u0E23": 2, "\u0E1E\u0E38\u0E18": 3, "\u0E1E\u0E24\u0E2B\u0E31\u0E2A": 4, "\u0E28\u0E38\u0E01\u0E23\u0E4C": 5, "\u0E40\u0E2A\u0E32\u0E23\u0E4C": 6 };
    const weekday = map[weekly[1] ?? "\u0E08\u0E31\u0E19\u0E17\u0E23\u0E4C"];
    const parts2 = bangkokParts3(now);
    const days = (weekday - parts2.weekday + 7) % 7 || 7;
    const date = addBangkokDays2(parts2, days);
    const run2 = atBangkok2(date.year, date.month, date.day, time.hour, time.minute);
    return { title, recurrenceType: "week", recurrenceInterval: 1, recurrenceWeekdays: String(weekday), dueAt: run2, nextRunAt: run2 };
  }
  const monthly = body.match(/ทุกเดือน(?:วันที่)?\s*(\d{1,2})?/i);
  if (monthly) {
    const parts2 = bangkokParts3(now);
    const day = Math.min(Math.max(Number(monthly[1] ?? parts2.day), 1), 28);
    let run2 = atBangkok2(parts2.year, parts2.month, day, time.hour, time.minute);
    if (run2 <= now) run2 = atBangkok2(parts2.year, parts2.month + 1, day, time.hour, time.minute);
    return { title, recurrenceType: "month", recurrenceInterval: 1, recurrenceDayOfMonth: day, dueAt: run2, nextRunAt: run2 };
  }
  const parts = bangkokParts3(now);
  let run = atBangkok2(parts.year, parts.month, parts.day, time.hour, time.minute);
  if (/พรุ่งนี้/i.test(body)) {
    const tomorrow = addBangkokDays2(parts, 1);
    run = atBangkok2(tomorrow.year, tomorrow.month, tomorrow.day, time.hour, time.minute);
  }
  const iso2 = body.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const thai = body.match(/วันที่\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (iso2) run = atBangkok2(Number(iso2[1]), Number(iso2[2]), Number(iso2[3]), time.hour, time.minute);
  if (thai) {
    const rawYear = thai[3] ? Number(thai[3]) : parts.year;
    const year = rawYear > 2400 ? rawYear - 543 : rawYear;
    run = atBangkok2(year, Number(thai[2]), Number(thai[1]), time.hour, time.minute);
    if (!thai[3] && run <= now) run = atBangkok2(year + 1, Number(thai[2]), Number(thai[1]), time.hour, time.minute);
  }
  if (!/วันนี้|พรุ่งนี้|วันที่|\d{4}-/i.test(body) && run <= now) {
    const tomorrow = addBangkokDays2(parts, 1);
    run = atBangkok2(tomorrow.year, tomorrow.month, tomorrow.day, time.hour, time.minute);
  }
  return { title, recurrenceType: "once", recurrenceInterval: 1, dueAt: run, nextRunAt: run };
}
function parseMiloCommand(text2, now = /* @__PURE__ */ new Date()) {
  const reminder = reminderFrom(text2, now);
  if (reminder) return { type: "reminder", data: reminder };
  const value = text2.trim().replace(/^@?ไมโล\s*/i, "");
  const reminderCancel = value.match(/^(?:ยกเลิก|ลบ)เตือน\s*#?(\d+)$/i);
  if (reminderCancel) return { type: "reminderCancel", id: Number(reminderCancel[1]) };
  if (/^(?:ดูเตือน|รายการเตือน|ดูรายการเตือน)$/i.test(value)) return { type: "reminderList" };
  const todoComplete = value.match(/^(?:เสร็จงาน|ปิดงาน)\s*#?(\d+)$/i) ?? value.match(/^ทำงาน\s*#?(\d+)\s*เสร็จ$/i);
  if (todoComplete) return { type: "todoComplete", id: Number(todoComplete[1]) };
  if (/^(?:ดูงาน|รายการงาน|งานทั้งหมด|todo\s*list)$/i.test(value)) return { type: "todoList" };
  const calendar = parseCalendarIntent(value, now);
  if (calendar?.type === "create") return { type: "calendarCreate", data: calendar.data };
  if (calendar?.type === "list") return { type: "calendarList" };
  if (calendar?.type === "cancel") return { type: "calendarCancel", id: calendar.id };
  if (/^(?:ผู้ช่วยกลุ่ม|กลุ่ม\s*LINE|กลุ่มช่วยอะไร|วิธีใช้กลุ่ม)$/i.test(value)) return { type: "groupGuide" };
  if (/^(?:สถานะคลัง|คลังไฟล์|คลังถาวร)$/i.test(value)) return { type: "vaultStatus" };
  const recurring = recurringFrom(value, now);
  if (recurring) return recurring;
  if (/^(?:ดู)?(?:รายการประจำ|จดอัตโนมัติ)$/i.test(value)) return { type: "recurringList" };
  const recurringStatus = value.match(/^(เปิด|พัก|หยุด|ยกเลิก)(?:รายการประจำ|จดอัตโนมัติ)\s*#?(\d+)$/i);
  if (recurringStatus) return { type: "recurringStatus", id: Number(recurringStatus[2]), status: recurringStatus[1] === "\u0E40\u0E1B\u0E34\u0E14" ? "active" : recurringStatus[1] === "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01" ? "cancelled" : "paused" };
  const budgetStart = value.match(/^(?:ตั้ง)?วันเริ่ม(?:รอบ)?งบ(?:ประมาณ)?\s*(\d{1,2})$/i);
  if (budgetStart) {
    const day = Number(budgetStart[1]);
    return day >= 1 && day <= 28 ? { type: "budgetCycleStart", day } : { type: "invalid", message: "\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E23\u0E2D\u0E1A\u0E07\u0E1A\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E22\u0E39\u0E48\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 1\u201328" };
  }
  const exportMatch = value.match(/^(?:ส่งออก|export)(?:ข้อมูล|รายการ|ธุรกรรม)?\s*(excel|xlsx|csv)$/i);
  if (exportMatch) return { type: "exportFinance", format: /csv/i.test(exportMatch[1]) ? "csv" : "xlsx" };
  if (/^(?:ยืนยัน|บันทึกจาก)\s*pdf$/i.test(value)) return { type: "pdfConfirm" };
  if (value === "\u0E2B\u0E19\u0E49\u0E32\u0E2B\u0E25\u0E31\u0E01") return { type: "dashboardGuide" };
  if (value === "\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C") return { type: "aiSummary", period: "month" };
  if (value === "\u0E08\u0E14\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01") return { type: "recordGuide" };
  if (value === "\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32\u0E40\u0E07\u0E34\u0E19") return { type: "budgetOverview" };
  if (value === "\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32") return { type: "settingGuide" };
  const money3 = value.match(/^(จ่าย|รายจ่าย|รับ|รายรับ)\s*(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i);
  if (money3) {
    const income = /รับ|รายรับ/i.test(money3[1]);
    const rawNote = money3[2].trim();
    const note2 = income ? rawNote : rawNote.replace(/^ค่า(?=กาแฟ)/i, "");
    const transactionType = income ? "income" : "expense";
    return { type: transactionType, amount: Number(money3[3].replace(/,/g, "")), category: suggestStandardCategory(transactionType, note2), note: note2 };
  }
  const naturalMoney = value.match(/^(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท)?$/i);
  if (naturalMoney) {
    const note2 = naturalMoney[1].trim().replace(/^ค่า(?=กาแฟ)/i, "");
    const amount = Number(naturalMoney[2].replace(/,/g, ""));
    const incomeCue = /^(?:ได้เงิน|เงินเดือนเข้า|ขายของได้|ขายได้|รับเงิน|รายรับ|รายได้|โบนัส|ค่าจ้าง|เงินเดือน)/i.test(note2);
    const expenseCue = /^(?:กิน|ซื้อ|จ่าย|ค่า|เติม|ช้อป|เดินทาง|แท็กซี่|กาแฟ|อาหาร|ข้าว|น้ำมัน|บิล|โอน|ของใช้|ชำระ)/i.test(note2);
    if (Number.isFinite(amount) && amount > 0 && note2 && (incomeCue || expenseCue)) {
      const transactionType = incomeCue ? "income" : "expense";
      return { type: transactionType, amount, category: suggestStandardCategory(transactionType, note2), note: note2 };
    }
  }
  const transactionSearch = value.match(/^(?:ค้นหา|หา)รายการ\s+(.+)$/i);
  if (transactionSearch) return { type: "transactionSearch", query: transactionSearch[1].trim() };
  if (/^(?:ยกเลิก|ลบ)(?:รายการ)?ล่าสุด$/i.test(value) || /^undo$/i.test(value)) return { type: "transactionUndo" };
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
  if (/^(?:รายการ|ประวัติ|ประวัติธุรกรรม|ประวัติรายการ|รายการธุรกรรม|รายการทั้งหมด|ดูย้อนหลัง)$/i.test(value)) return { type: "transactionList" };
  if (/^ตั้งค่า$/i.test(value)) return { type: "settingGuide" };
  if (/^(?:dashboard|แดชบอร์ด|เว็บแดชบอร์ด|จัดการระบบหลังบ้าน|หลังบ้าน|แดชบอร์ดหลังบ้าน)$/i.test(value)) return { type: "dashboardGuide" };
  if (/^(?:ประเภท|ประเภทและหมวดหมู่|หมวดหมู่|หมวดหมู่รายรับ-?จ่าย|ดูหมวดหมู่)$/i.test(value)) return { type: "categoryList" };
  if (/^(?:วิเคราะห์|สุขภาพการเงิน|วิเคราะห์การเงิน|วิเคราะห์รายจ่าย|สรุปธุรกิจ)\s*(?:ของ)?\s*(วันนี้|สัปดาห์นี้|เดือนนี้|ปีนี้)?$/i.test(value)) {
    const m = value.match(/(วันนี้|สัปดาห์นี้|เดือนนี้|ปีนี้)/i);
    const periods = { "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49": "day", "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49": "week", "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49": "month", "\u0E1B\u0E35\u0E19\u0E35\u0E49": "year" };
    return { type: "aiSummary", period: m ? periods[m[1]] ?? "month" : "month" };
  }
  if (/^(?:ดูยอดคงเหลือ|ยอดคงเหลือ)$/.test(value)) return { type: "financeReport", period: "month" };
  const financeReport2 = value.match(/^สรุป(?:การเงิน|รายรับรายจ่าย|ยอด(?:ประจำเดือน)?)?\s*(?:ของ)?\s*(วันนี้|สัปดาห์นี้|เดือนนี้|ปีนี้)?$/i);
  if (financeReport2) {
    const periodKey = financeReport2[1] ?? "\u0E1B\u0E35\u0E19\u0E35\u0E49";
    const periods = { "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49": "day", "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49": "week", "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49": "month", "\u0E1B\u0E35\u0E19\u0E35\u0E49": "year" };
    return { type: "financeReport", period: periods[periodKey] ?? "year" };
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
    return name ? { type: "categoryRemove", name, transactionType } : { type: "invalid", message: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E2B\u0E21\u0E27\u0E14\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E25\u0E1A \u0E40\u0E0A\u0E48\u0E19 \u0E25\u0E1A\u0E2B\u0E21\u0E27\u0E14\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 \u0E40\u0E14\u0E34\u0E19\u0E17\u0E32\u0E07" };
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
  const imageEdit = value.match(/^(?:แก้|แก้ไข)(?:ข้อมูล)?(?:ใบเสร็จ|สลิป|รูป|ภาพ)\s+(ยอด|จำนวนเงิน|หมวด|หมวดหมู่|วันที่|ร้านค้า|ผู้รับ|หมายเหตุ)\s+(.+)$/i);
  if (imageEdit) {
    const label = imageEdit[1];
    const raw = imageEdit[2].trim();
    if (/ยอด|จำนวนเงิน/i.test(label)) {
      const amount = Number(raw.replace(/,/g, "").replace(/\s*บาท$/i, ""));
      return Number.isFinite(amount) && amount > 0 ? { type: "imageEdit", field: "amount", value: amount } : { type: "invalid", message: "\u0E22\u0E2D\u0E14\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E1A\u0E32\u0E17" };
    }
    if (/หมวด/i.test(label)) return raw ? { type: "imageEdit", field: "category", value: raw } : { type: "invalid", message: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E2B\u0E21\u0E27\u0E14\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E41\u0E01\u0E49\u0E44\u0E02" };
    if (/วันที่/i.test(label)) return raw ? { type: "imageEdit", field: "date", value: raw } : { type: "invalid", message: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E17\u0E35\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" };
    if (/ร้านค้า|ผู้รับ/i.test(label)) return raw ? { type: "imageEdit", field: "merchant", value: raw } : { type: "invalid", message: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E49\u0E32\u0E19\u0E04\u0E49\u0E32\u0E2B\u0E23\u0E37\u0E2D\u0E1C\u0E39\u0E49\u0E23\u0E31\u0E1A" };
    return { type: "imageEdit", field: "note", value: raw };
  }
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
function bangkokParts4(reference) {
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
  const today = bangkokParts4(reference);
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
function parseExtractedDate(value, timeText) {
  const text2 = value?.trim();
  if (!text2) return void 0;
  const iso2 = text2.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const thaiNumeric = text2.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  const thaiWords = text2.match(/^\s*(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})\s*$/);
  const months = { "\u0E21.\u0E04.": 0, "\u0E01.\u0E1E.": 1, "\u0E21\u0E35.\u0E04.": 2, "\u0E40\u0E21.\u0E22.": 3, "\u0E1E.\u0E04.": 4, "\u0E21\u0E34.\u0E22.": 5, "\u0E01.\u0E04.": 6, "\u0E2A.\u0E04.": 7, "\u0E01.\u0E22.": 8, "\u0E15.\u0E04.": 9, "\u0E1E.\u0E22.": 10, "\u0E18.\u0E04.": 11 };
  let year;
  let month;
  let day;
  if (iso2) {
    year = Number(iso2[1]);
    month = Number(iso2[2]) - 1;
    day = Number(iso2[3]);
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
  const time = timeText?.trim().match(/^(\d{1,2})[:.](\d{2})(?:\s*น\.?)?$/);
  const hour = time ? Number(time[1]) : 12;
  const minute = time ? Number(time[2]) : 0;
  if (hour > 23 || minute > 59) return void 0;
  const result = new Date(Date.UTC(year, month, day, hour - 7, minute, 0, 0));
  const bangkok = new Date(result.getTime() + 7 * 60 * 60 * 1e3);
  return bangkok.getUTCFullYear() === year && bangkok.getUTCMonth() === month && bangkok.getUTCDate() === day ? result : void 0;
}
function resolveReceiptOccurredAt(value, timeText, referenceDate) {
  const exact = parseExtractedDate(value, timeText);
  if (exact) return { occurredAt: exact, source: "document" };
  const reference = referenceDate instanceof Date && Number.isFinite(referenceDate.getTime()) ? referenceDate : void 0;
  const time = timeText?.trim().match(/^(\d{1,2})[:.](\d{2})(?:\s*น\.?)?$/);
  if (!reference || !time) return void 0;
  const hour = Number(time[1]);
  const minute = Number(time[2]);
  if (hour > 23 || minute > 59) return void 0;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(reference);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (!year || !month || !day) return void 0;
  let candidate = new Date(Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0));
  const futureToleranceMs = 2 * 60 * 60 * 1e3;
  if (candidate.getTime() > reference.getTime() + futureToleranceMs) {
    candidate = new Date(candidate.getTime() - 24 * 60 * 60 * 1e3);
  }
  const ageMs = reference.getTime() - candidate.getTime();
  if (ageMs < -futureToleranceMs || ageMs > 18 * 60 * 60 * 1e3) return void 0;
  return { occurredAt: candidate, source: "upload-date" };
}
function selectImageProposal(proposals = []) {
  return proposals.find((item) => item.kind === "expense" && Number(item.amount) > 0) ?? proposals.find((item) => item.kind === "reminder");
}
function buildExpenseNote(proposal) {
  const merchant = normalizeThaiMerchantName(proposal.merchant ?? "");
  const entries = [
    merchant ? `\u0E23\u0E49\u0E32\u0E19\u0E04\u0E49\u0E32/\u0E04\u0E39\u0E48\u0E04\u0E49\u0E32: ${merchant}` : "",
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
    const merchantName = normalizeThaiMerchantName(proposal.merchant ?? "");
    const merchant = merchantName ? ` \xB7 ${merchantName}` : "";
    const rows = [
      `${source}${merchant}`,
      `\u0E22\u0E2D\u0E14 ${Number(proposal.amount || 0).toLocaleString("th-TH")} ${proposal.currency || "\u0E1A\u0E32\u0E17"} \xB7 \u0E2B\u0E21\u0E27\u0E14${normalizeExpenseCategory(proposal.category, `${proposal.title ?? ""} ${proposal.merchant ?? ""}`)}`
    ];
    const when = [proposal.dateText, proposal.timeText].map((value) => value?.trim()).filter(Boolean).join(" ");
    if (when) rows.push(`\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48/\u0E40\u0E27\u0E25\u0E32 ${when}`);
    if (proposal.receiptNumber?.trim()) rows.push(`\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 ${proposal.receiptNumber.trim()}`);
    if (proposal.paymentMethod?.trim()) rows.push(`\u0E0A\u0E33\u0E23\u0E30 ${proposal.paymentMethod.trim()}`);
    if (proposal.title?.trim()) rows.push(`\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 ${proposal.title.trim()}`);
    if (proposal.lineItems?.length) {
      rows.push(`\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 ${proposal.lineItems.length} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23`);
      rows.push(...proposal.lineItems.slice(0, 10).map((item) => `\u2022 ${item}`));
      if (proposal.lineItems.length > 10) rows.push(`\u2026\u0E2D\u0E35\u0E01 ${proposal.lineItems.length - 10} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23`);
    }
    return rows.join("\n");
  }
  return proposal.title || proposal.note || "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E44\u0E14\u0E49";
}

// server/milo/imageProposalEdit.ts
function applyImageExpenseEdit(analysis, edit) {
  const index2 = analysis.proposals.findIndex((item) => item.kind === "expense" && Number(item.amount) > 0);
  if (index2 < 0) throw new Error("\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E44\u0E14\u0E49");
  const proposal = { ...analysis.proposals[index2] };
  if (proposal.kind !== "expense") throw new Error("\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E44\u0E14\u0E49");
  if (edit.field === "amount") {
    if (!Number.isFinite(edit.value) || edit.value <= 0 || edit.value > 1e9) throw new Error("\u0E22\u0E2D\u0E14\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E1A\u0E32\u0E17");
    proposal.amount = Math.round(edit.value * 100) / 100;
  } else if (edit.field === "category") {
    const category = edit.value.trim();
    if (!category || category.length > 100) throw new Error("\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E2B\u0E21\u0E27\u0E14\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E41\u0E01\u0E49\u0E44\u0E02");
    proposal.category = category;
  } else if (edit.field === "date") {
    const parsed = parseExtractedDate(edit.value);
    if (!parsed) throw new Error("\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 \u0E40\u0E0A\u0E48\u0E19 27/08/2569 \u0E2B\u0E23\u0E37\u0E2D 2026-08-27");
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(parsed);
    const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
    proposal.dateText = `${part("year")}-${part("month")}-${part("day")}`;
  } else if (edit.field === "merchant") {
    const merchant = edit.value.trim();
    if (!merchant || merchant.length > 200) throw new Error("\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E49\u0E32\u0E19\u0E04\u0E49\u0E32\u0E2B\u0E23\u0E37\u0E2D\u0E1C\u0E39\u0E49\u0E23\u0E31\u0E1A\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E41\u0E01\u0E49\u0E44\u0E02");
    proposal.merchant = merchant;
  } else {
    proposal.note = edit.value.trim().slice(0, 1e3);
  }
  const proposals = [...analysis.proposals];
  proposals[index2] = proposal;
  return { ...analysis, proposals, editedProposal: proposal };
}

// server/milo/routes.ts
function helpText() {
  return "Milo \u0E0A\u0E48\u0E27\u0E22\u0E04\u0E38\u0E13\u0E08\u0E1A\u0E07\u0E32\u0E19\u0E43\u0E19 LINE \u0E41\u0E0A\u0E17\u0E40\u0E14\u0E35\u0E22\u0E27\u0E04\u0E23\u0E31\u0E1A\n\u{1F514} \u0E40\u0E15\u0E37\u0E2D\u0E19: \u0E40\u0E15\u0E37\u0E2D\u0E19\u0E1B\u0E23\u0E30\u0E0A\u0E38\u0E21\u0E1E\u0E23\u0E38\u0E48\u0E07\u0E19\u0E35\u0E49 10:00 / \u0E40\u0E15\u0E37\u0E2D\u0E19\u0E14\u0E37\u0E48\u0E21\u0E19\u0E49\u0E33\u0E17\u0E38\u0E01 30 \u0E19\u0E32\u0E17\u0E35 / \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E15\u0E37\u0E2D\u0E19\n\u{1F5C2}\uFE0F \u0E40\u0E01\u0E47\u0E1A: \u0E40\u0E01\u0E47\u0E1A https://example.com #\u0E07\u0E32\u0E19 / \u0E04\u0E49\u0E19\u0E2B\u0E32 \u0E43\u0E1A\u0E40\u0E2A\u0E19\u0E2D\u0E23\u0E32\u0E04\u0E32 / \u0E2A\u0E16\u0E32\u0E19\u0E30\u0E04\u0E25\u0E31\u0E07\n\u{1F4C5} \u0E1B\u0E0F\u0E34\u0E17\u0E34\u0E19: \u0E25\u0E07\u0E1B\u0E0F\u0E34\u0E17\u0E34\u0E19 \u0E1B\u0E23\u0E30\u0E0A\u0E38\u0E21\u0E17\u0E35\u0E21\u0E1E\u0E23\u0E38\u0E48\u0E07\u0E19\u0E35\u0E49 10:00 / \u0E14\u0E39\u0E1B\u0E0F\u0E34\u0E17\u0E34\u0E19\n\u{1F465} \u0E01\u0E25\u0E38\u0E48\u0E21 LINE: @\u0E44\u0E21\u0E42\u0E25 \u0E1C\u0E39\u0E49\u0E0A\u0E48\u0E27\u0E22\u0E01\u0E25\u0E38\u0E48\u0E21 / @\u0E44\u0E21\u0E42\u0E25 \u0E41\u0E08\u0E49\u0E07\u0E2A\u0E48\u0E07\u0E07\u0E32\u0E19\u0E14\u0E49\u0E27\u0E22\u0E16\u0E36\u0E07 @\u0E2A\u0E21\u0E0A\u0E32\u0E22\n\u2705 \u0E07\u0E32\u0E19: \u0E07\u0E32\u0E19 \u0E2A\u0E48\u0E07\u0E2A\u0E23\u0E38\u0E1B\u0E23\u0E32\u0E22\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C / \u0E14\u0E39\u0E07\u0E32\u0E19 / \u0E40\u0E2A\u0E23\u0E47\u0E08\u0E07\u0E32\u0E19 #12 / \u0E42\u0E19\u0E49\u0E15 \u0E23\u0E2B\u0E31\u0E2A Wi-Fi\n\u{1F4B0} \u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19: \u0E01\u0E34\u0E19\u0E01\u0E32\u0E41\u0E1F 80 / \u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E40\u0E02\u0E49\u0E32 35000 / \u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A \u0E2D\u0E32\u0E2B\u0E32\u0E23 5000 / \u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49\n\u{1F4F7}\u{1F399}\uFE0F \u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E43\u0E2B\u0E49\u0E44\u0E21\u0E42\u0E25\u0E2D\u0E48\u0E32\u0E19 \u0E41\u0E25\u0E49\u0E27\u0E15\u0E23\u0E27\u0E08\u0E41\u0E25\u0E30\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E48\u0E2D\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\n\n\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E0A\u0E48\u0E27\u0E22\u201D \u0E44\u0E14\u0E49\u0E17\u0E38\u0E01\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E04\u0E23\u0E31\u0E1A";
}
function contextualFallback(text2) {
  const value = text2.trim().replace(/^@?ไมโล\s*/i, "").slice(0, 80);
  if (/งบ|หมวด/.test(value)) return { text: "\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E07\u0E1A\u0E2B\u0E23\u0E37\u0E2D\u0E2B\u0E21\u0E27\u0E14\u0E44\u0E2B\u0E19\u0E04\u0E23\u0E31\u0E1A?", actions: [{ label: "\u0E14\u0E39\u0E07\u0E1A", text: "\u0E07\u0E1A" }, { label: "\u0E14\u0E39\u0E2B\u0E21\u0E27\u0E14", text: "\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48" }, { label: "\u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A\u0E2D\u0E32\u0E2B\u0E32\u0E23", text: "\u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A \u0E2D\u0E32\u0E2B\u0E32\u0E23 5000" }] };
  if (/สรุป|ยอด|เงิน|วิเคราะห์/.test(value)) return { text: "\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E14\u0E39\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E0A\u0E48\u0E27\u0E07\u0E44\u0E2B\u0E19\u0E04\u0E23\u0E31\u0E1A?", actions: [{ label: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49" }, { label: "\u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49" }, { label: "\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C", text: "\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C" }] };
  if (/จด|ซื้อ|กิน|จ่าย|รับ/.test(value)) return { text: "\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E22\u0E2D\u0E14\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\u0E04\u0E23\u0E31\u0E1A \u0E40\u0E0A\u0E48\u0E19 \u201C\u0E01\u0E34\u0E19\u0E01\u0E32\u0E41\u0E1F 80\u201D", actions: [{ label: "\u0E27\u0E34\u0E18\u0E35\u0E08\u0E14", text: "\u0E08\u0E14\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01" }, { label: "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14", text: "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23" }, { label: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49" }] };
  return { text: "\u0E44\u0E21\u0E42\u0E25\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E41\u0E19\u0E48\u0E43\u0E08\u0E27\u0E48\u0E32 \u201C" + (value || "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E19\u0E35\u0E49") + "\u201D \u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E17\u0E33\u0E2D\u0E30\u0E44\u0E23 \u0E40\u0E25\u0E37\u0E2D\u0E01\u0E17\u0E32\u0E07\u0E25\u0E31\u0E14\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\u0E04\u0E23\u0E31\u0E1A", actions: [{ label: "\u0E08\u0E14\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A/\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22", text: "\u0E08\u0E14\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01" }, { label: "\u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49" }, { label: "\u0E27\u0E34\u0E18\u0E35\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19", text: "\u0E27\u0E34\u0E18\u0E35\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19" }] };
}
function formatDate(date) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}
function formatFinanceReport(report) {
  const money3 = (amount) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const label = { day: "\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", week: "\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E19\u0E35\u0E49", month: "\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49", year: "\u0E1B\u0E35\u0E19\u0E35\u0E49" };
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => `\u2022 ${name} ${money3(amount)} \u0E1A\u0E32\u0E17`).join("\n");
  return `\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19${label[report.period]}
\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A ${money3(report.income)} \u0E1A\u0E32\u0E17
\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 ${money3(report.expense)} \u0E1A\u0E32\u0E17
\u0E01\u0E33\u0E44\u0E23/\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D ${money3(report.balance)} \u0E1A\u0E32\u0E17
${categories ? `
\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E15\u0E32\u0E21\u0E2B\u0E21\u0E27\u0E14
${categories}` : "\n\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E19\u0E35\u0E49"}`;
}
function formatFinancialInsight(insight) {
  const quality = insight.dataSufficiency === "adequate" ? "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E1E\u0E35\u0E22\u0E07\u0E1E\u0E2D\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E40\u0E1A\u0E37\u0E49\u0E2D\u0E07\u0E15\u0E49\u0E19" : insight.dataSufficiency === "limited" ? "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E22\u0E31\u0E07\u0E21\u0E35\u0E44\u0E21\u0E48\u0E21\u0E32\u0E01 \u0E08\u0E36\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E2A\u0E31\u0E07\u0E40\u0E01\u0E15\u0E40\u0E1A\u0E37\u0E49\u0E2D\u0E07\u0E15\u0E49\u0E19" : "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E1E\u0E35\u0E22\u0E07\u0E1E\u0E2D\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C";
  const highlights = insight.highlights.map((item) => `\u2022 ${item}`).join("\n");
  const actions = insight.suggestedActions.map((item) => `\u2022 ${item}`).join("\n");
  return `\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19
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
  const occurredAt = transaction.occurredAt ?? /* @__PURE__ */ new Date();
  const dailyReport = await financeReport(lineUserId, "day", occurredAt, financeAccountId);
  const budgetCycleReport = await financeBudgetCycleReport(lineUserId, occurredAt, financeAccountId);
  const budgets2 = await listBudgets(lineUserId, budgetCycleReport.key, financeAccountId);
  const budget = budgets2.find((item) => item.category === transaction.category);
  const budgetLimit = budget ? Number(budget.amount) : 0;
  const budgetSpent = Number(budgetCycleReport.categories[transaction.category] ?? 0);
  const budgetPercent = budgetLimit > 0 ? Math.round(budgetSpent / budgetLimit * 100) : void 0;
  const summary = { transactionType: transaction.transactionType, amount: transaction.amount, category: transaction.category, note: transaction.note, occurredAt, dailyIncome: dailyReport.income, dailyExpense: dailyReport.expense, dailyBalance: dailyReport.balance, budgetSpent, budgetLimit, budgetPercent };
  try {
    await replyPostSaveSummaryImage(replyToken, summary);
  } catch (error) {
    console.error("[Milo Save] image summary failed; sending Flex fallback", { error: error instanceof Error ? error.message : "unknown" });
    try {
      await replyPostSaveSummary(replyToken, summary);
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
  const plan = resolveMiloPlan(lineUserId, process.env, await isAdminLinkedLineUser(lineUserId));
  let message = "";
  const financeCommands = /* @__PURE__ */ new Set(["expense", "income", "transactionSearch", "transactionUndo", "transactionDelete", "transactionUpdate", "openingBalance", "financeReport", "aiSummary", "budgetOverview", "transactionList", "voiceConfirm", "voiceEditPrompt", "voiceCategoryChange", "voiceEdit", "budget", "budgetCycleStart", "categoryAdd", "categoryRemove", "categoryList", "imageConfirm", "imageEdit", "pdfConfirm", "recurringCreate", "recurringList", "recurringStatus", "exportFinance"]);
  if (command.type === "reminder" && !hasMiloEntitlement(plan, "reminders")) {
    if (event.replyToken) await replyText(event.replyToken, entitlementMessage("reminders"));
    return;
  }
  if (command.type === "pdfConfirm" && !hasMiloEntitlement(plan, "pdf")) {
    if (event.replyToken) await replyText(event.replyToken, entitlementMessage("pdf"));
    return;
  }
  if (command.type === "budgetCycleStart" && !hasMiloEntitlement(plan, "customBudgetCycle")) {
    if (event.replyToken) await replyText(event.replyToken, entitlementMessage("customBudgetCycle"));
    return;
  }
  if (scope !== "user" && financeCommands.has(command.type) && !hasMiloEntitlement(plan, "groupAccounting")) {
    if (event.replyToken) await replyText(event.replyToken, entitlementMessage("groupAccounting"));
    return;
  }
  const financeScope = financeCommands.has(command.type) ? await resolveFinanceScope(lineUserId, lineChatId, scope) : void 0;
  if (financeCommands.has(command.type) && !financeScope) {
    if (event.replyToken) await replyText(event.replyToken, financeAccessMessage(scope));
    return;
  }
  if (command.type === "reminderList") {
    const items = await listRemindersForChat(lineUserId, lineChatId, scope);
    message = items.length ? `\u{1F514} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E43\u0E19${scope === "user" ? "\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49" : "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49"}
${items.slice(0, 20).map((item) => `#${item.id} \u2022 ${item.title} \u2022 ${item.nextRunAt ? formatDate(item.nextRunAt) : "\u0E23\u0E2D\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E40\u0E27\u0E25\u0E32"}`).join("\n")}

\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13: \u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E40\u0E15\u0E37\u0E2D\u0E19 #\u0E40\u0E25\u0E02\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23` : "\u{1F514} \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E17\u0E35\u0E48\u0E01\u0E33\u0E25\u0E31\u0E07\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E43\u0E19\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "reminderCancel") {
    const cancelled = await cancelReminderForChat(command.id, lineUserId, lineChatId);
    message = cancelled ? `\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E40\u0E15\u0E37\u0E2D\u0E19 #${command.id} \u0E41\u0E25\u0E49\u0E27\u0E04\u0E23\u0E31\u0E1A` : `\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E15\u0E37\u0E2D\u0E19 #${command.id} \u0E17\u0E35\u0E48\u0E04\u0E38\u0E13\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E44\u0E14\u0E49\u0E43\u0E19\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49`;
  } else if (command.type === "todoList") {
    const items = await listTodosForChat(lineUserId, lineChatId, scope);
    message = items.length ? `\u2705 To-do \u0E43\u0E19${scope === "user" ? "\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49" : "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49"}
${items.slice(0, 30).map((item) => `#${item.id} \u2022 ${item.title}${item.dueAt ? ` \u2022 ${formatDate(item.dueAt)}` : ""}`).join("\n")}

\u0E1B\u0E34\u0E14\u0E07\u0E32\u0E19: \u0E40\u0E2A\u0E23\u0E47\u0E08\u0E07\u0E32\u0E19 #\u0E40\u0E25\u0E02\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23` : "\u2705 \u0E44\u0E21\u0E48\u0E21\u0E35 To-do \u0E17\u0E35\u0E48\u0E04\u0E49\u0E32\u0E07\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "todoComplete") {
    const completed = await completeTodoForChat(command.id, lineUserId, lineChatId, scope);
    message = completed ? `\u0E17\u0E33\u0E07\u0E32\u0E19 #${command.id} \u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27 \u2705` : `\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E07\u0E32\u0E19 #${command.id} \u0E17\u0E35\u0E48\u0E1B\u0E34\u0E14\u0E44\u0E14\u0E49\u0E43\u0E19\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49`;
  } else if (command.type === "calendarCreate") {
    const id = await createCalendarEvent({ lineChatId, createdByLineUserId: lineUserId, ...command.data, sourceMessageId: event.message?.id });
    const googleUrl = buildGoogleCalendarUrl({ ...command.data, detail: command.data.detail ?? null });
    const icsUrl = buildCalendarIcsUrl(id);
    message = `\u{1F4C5} \u0E40\u0E1E\u0E34\u0E48\u0E21\u0E19\u0E31\u0E14 #${id} \u0E43\u0E19\u0E1B\u0E0F\u0E34\u0E17\u0E34\u0E19 Milo \u0E41\u0E25\u0E49\u0E27
${command.data.title}
${formatDate(command.data.startsAt)} \u2013 ${formatDate(command.data.endsAt)}

Google Calendar: ${googleUrl}
Apple/Outlook (.ics): ${icsUrl}`;
  } else if (command.type === "calendarList") {
    const items = await listCalendarEvents(lineUserId, lineChatId, /* @__PURE__ */ new Date(), 20);
    message = items.length ? `\u{1F4C5} \u0E19\u0E31\u0E14\u0E2B\u0E21\u0E32\u0E22\u0E17\u0E35\u0E48\u0E01\u0E33\u0E25\u0E31\u0E07\u0E08\u0E30\u0E16\u0E36\u0E07
${items.map((item) => `#${item.id} \u2022 ${item.title} \u2022 ${formatDate(item.startsAt)}`).join("\n")}` : "\u{1F4C5} \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E19\u0E31\u0E14\u0E2B\u0E21\u0E32\u0E22\u0E17\u0E35\u0E48\u0E01\u0E33\u0E25\u0E31\u0E07\u0E08\u0E30\u0E16\u0E36\u0E07\u0E43\u0E19\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "calendarCancel") {
    const cancelled = await cancelCalendarEvent(command.id, lineUserId, lineChatId);
    message = cancelled ? `\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E19\u0E31\u0E14 #${command.id} \u0E41\u0E25\u0E49\u0E27\u0E04\u0E23\u0E31\u0E1A` : `\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E19\u0E31\u0E14 #${command.id} \u0E17\u0E35\u0E48\u0E04\u0E38\u0E13\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E44\u0E14\u0E49\u0E43\u0E19\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49`;
  } else if (command.type === "groupGuide") {
    message = scope === "user" ? "\u{1F465} \u0E27\u0E34\u0E18\u0E35\u0E43\u0E0A\u0E49 Milo \u0E43\u0E19\u0E01\u0E25\u0E38\u0E48\u0E21 LINE\n1) \u0E40\u0E0A\u0E34\u0E0D Milo \u0E40\u0E02\u0E49\u0E32\u0E01\u0E25\u0E38\u0E48\u0E21\n2) \u0E40\u0E23\u0E35\u0E22\u0E01\u0E14\u0E49\u0E27\u0E22 @\u0E44\u0E21\u0E42\u0E25 \u0E01\u0E48\u0E2D\u0E19\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\n3) \u0E43\u0E0A\u0E49\u0E40\u0E15\u0E37\u0E2D\u0E19 \u0E40\u0E01\u0E47\u0E1A/\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E44\u0E1F\u0E25\u0E4C \u0E1B\u0E0F\u0E34\u0E17\u0E34\u0E19 To-do \u0E41\u0E25\u0E30\u0E41\u0E17\u0E47\u0E01\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E44\u0E14\u0E49\n\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07: @\u0E44\u0E21\u0E42\u0E25 \u0E40\u0E15\u0E37\u0E2D\u0E19\u0E2A\u0E48\u0E07\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E1E\u0E23\u0E38\u0E48\u0E07\u0E19\u0E35\u0E49 9:00 \u0E2B\u0E23\u0E37\u0E2D @\u0E44\u0E21\u0E42\u0E25 \u0E41\u0E08\u0E49\u0E07\u0E2A\u0E48\u0E07\u0E07\u0E32\u0E19\u0E14\u0E49\u0E27\u0E22\u0E16\u0E36\u0E07 @\u0E2A\u0E21\u0E0A\u0E32\u0E22" : "\u{1F465} Milo \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E0A\u0E48\u0E27\u0E22\u0E43\u0E19\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49\u0E04\u0E23\u0E31\u0E1A\n\u2022 @\u0E44\u0E21\u0E42\u0E25 \u0E40\u0E15\u0E37\u0E2D\u0E19\u0E1B\u0E23\u0E30\u0E0A\u0E38\u0E21\u0E1E\u0E23\u0E38\u0E48\u0E07\u0E19\u0E35\u0E49 10:00\n\u2022 @\u0E44\u0E21\u0E42\u0E25 \u0E40\u0E01\u0E47\u0E1A https://example.com #\u0E07\u0E32\u0E19\n\u2022 @\u0E44\u0E21\u0E42\u0E25 \u0E04\u0E49\u0E19\u0E2B\u0E32 \u0E43\u0E1A\u0E40\u0E2A\u0E19\u0E2D\u0E23\u0E32\u0E04\u0E32\n\u2022 @\u0E44\u0E21\u0E42\u0E25 \u0E25\u0E07\u0E1B\u0E0F\u0E34\u0E17\u0E34\u0E19 \u0E1B\u0E23\u0E30\u0E0A\u0E38\u0E21\u0E17\u0E35\u0E21\u0E1E\u0E23\u0E38\u0E48\u0E07\u0E19\u0E35\u0E49 10:00\n\u2022 @\u0E44\u0E21\u0E42\u0E25 \u0E41\u0E08\u0E49\u0E07\u0E2A\u0E48\u0E07\u0E07\u0E32\u0E19\u0E14\u0E49\u0E27\u0E22\u0E16\u0E36\u0E07 @\u0E2A\u0E21\u0E0A\u0E32\u0E22\n\u2022 \u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B/\u0E44\u0E1F\u0E25\u0E4C\u0E43\u0E19\u0E01\u0E25\u0E38\u0E48\u0E21\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E40\u0E01\u0E47\u0E1A\u0E41\u0E25\u0E30\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25\u0E44\u0E14\u0E49\u0E15\u0E32\u0E21\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C";
  } else if (command.type === "vaultStatus") {
    const status = await vaultStorageStatus(lineUserId, lineChatId, scope);
    message = `\u{1F5C2}\uFE0F \u0E2A\u0E16\u0E32\u0E19\u0E30\u0E04\u0E25\u0E31\u0E07\u0E43\u0E19\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49
\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14 ${status.total} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23
\u0E40\u0E01\u0E47\u0E1A\u0E16\u0E32\u0E27\u0E23 ${status.durable} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23
\u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E37\u0E48\u0E2D\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E0B\u0E49\u0E33 ${status.mediaMissing} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23

\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21/\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E40\u0E01\u0E47\u0E1A\u0E43\u0E19\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 \u0E41\u0E25\u0E30\u0E23\u0E39\u0E1B/\u0E44\u0E1F\u0E25\u0E4C\u0E17\u0E35\u0E48\u0E21\u0E35\u0E2A\u0E33\u0E40\u0E19\u0E32 storage \u0E08\u0E30\u0E40\u0E01\u0E47\u0E1A\u0E44\u0E27\u0E49\u0E08\u0E19\u0E01\u0E27\u0E48\u0E32\u0E04\u0E38\u0E13\u0E08\u0E30\u0E25\u0E1A\u0E04\u0E23\u0E31\u0E1A`;
  } else if (command.type === "reminder") {
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
    const occurredAt = Number.isFinite(event.timestamp) ? new Date(event.timestamp) : /* @__PURE__ */ new Date();
    await createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope.financeAccountId, transactionType: command.type, amount: command.amount, category, note: command.note, occurredAt, source: "line_text", sourceMessageId: event.message?.id });
    if (event.replyToken) {
      await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope.financeAccountId, { transactionType: command.type, amount: command.amount, category, note: command.note, occurredAt });
      return;
    }
    message = `\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01${command.type === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"} ${command.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E43\u0E19\u0E2B\u0E21\u0E27\u0E14${category}\u0E41\u0E25\u0E49\u0E27`;
  } else if (command.type === "transactionSearch") {
    const results = await searchTransactions(lineUserId, command.query, 10, financeScope.financeAccountId);
    message = results.length ? `\u0E1E\u0E1A ${results.length} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23
${results.map((item) => `#${item.id} \xB7 ${item.transactionType === "expense" ? "\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E31\u0E1A"} ${Number(item.amount).toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \xB7 ${item.category}${item.note ? ` \xB7 ${item.note}` : ""}`).join("\n")}` : `\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21 \u201C${command.query}\u201D`;
  } else if (command.type === "transactionUndo") {
    if (!canManageFinanceTransactions(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const undone = await deleteLatestTransaction({ lineUserId, financeAccountId: financeScope.financeAccountId });
    message = undone ? `\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14 #${undone.id} \u0E41\u0E25\u0E49\u0E27 \u2022 ${Number(undone.amount).toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u2022 ${undone.category}
\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E22\u0E31\u0E07\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19 Audit log \u0E41\u0E25\u0E30\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E19\u0E33\u0E44\u0E1B\u0E23\u0E27\u0E21\u0E22\u0E2D\u0E14` : "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\u0E17\u0E35\u0E48\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E44\u0E14\u0E49\u0E04\u0E23\u0E31\u0E1A";
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
        const occurredAt = Number.isFinite(event.timestamp) ? new Date(event.timestamp) : /* @__PURE__ */ new Date();
        const transactionId = await createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope.financeAccountId, transactionType: proposed.transactionType, amount: proposed.amount, category: proposed.category, note: proposed.note, occurredAt, source: "line_audio", sourceMessageId: `voice:${voice.id}` });
        await linkTransactionAttachment({ transactionId, vaultItemId: voice.vaultItemId, lineUserId, label: "\u0E44\u0E1F\u0E25\u0E4C\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A" });
        await updateVoiceTranscriptionStatus(voice.id, "accepted");
        if (event.replyToken) {
          await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope.financeAccountId, { ...proposed, occurredAt });
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
    message = `\u0E40\u0E01\u0E47\u0E1A${command.itemType === "link" ? "\u0E25\u0E34\u0E07\u0E01\u0E4C" : "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21"}\u0E19\u0E35\u0E49\u0E44\u0E27\u0E49\u0E43\u0E19\u0E04\u0E25\u0E31\u0E07\u0E16\u0E32\u0E27\u0E23\u0E08\u0E19\u0E01\u0E27\u0E48\u0E32\u0E04\u0E38\u0E13\u0E08\u0E30\u0E25\u0E1A\u0E41\u0E25\u0E49\u0E27${command.tagsText ? ` \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E41\u0E17\u0E47\u0E01 ${command.tagsText}` : ""}`;
  } else if (command.type === "search") {
    const results = await searchVaultForChat(lineUserId, lineChatId, scope, command.query);
    message = results.length ? `\u0E1E\u0E1A ${results.length} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E43\u0E19${scope === "user" ? "\u0E41\u0E0A\u0E17\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27" : "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E19\u0E35\u0E49"}
${results.slice(0, 8).map((item, index2) => {
      const durable = item.itemType === "text" || item.itemType === "link" || Boolean(item.storageKey);
      return `${index2 + 1}. ${item.title} ${durable ? "\u2713 \u0E40\u0E01\u0E47\u0E1A\u0E16\u0E32\u0E27\u0E23" : "\u26A0\uFE0F \u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E44\u0E1F\u0E25\u0E4C\u0E0B\u0E49\u0E33"}`;
    }).join("\n")}` : `\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u201C${command.query}\u201D \u0E43\u0E19\u0E41\u0E0A\u0E17\u0E19\u0E35\u0E49`;
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
    const startDay = await getFinanceAccountBudgetCycleStartDay(financeScope.financeAccountId);
    const cycle = budgetCycleWindow(/* @__PURE__ */ new Date(), startDay);
    await upsertBudget(lineUserId, command.category, command.amount, cycle.key, financeScope.financeAccountId);
    message = `\u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A\u0E2B\u0E21\u0E27\u0E14${command.category} ${command.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E23\u0E2D\u0E1A ${formatBudgetCycleLabel(/* @__PURE__ */ new Date(), startDay)} \u0E41\u0E25\u0E49\u0E27`;
  } else if (command.type === "budgetCycleStart") {
    if (!canManageFinanceSettings(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E15\u0E31\u0E49\u0E07\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E23\u0E2D\u0E1A\u0E07\u0E1A\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const updated = await updateFinanceAccountBudgetCycleStartDay(financeScope.financeAccountId, command.day);
    if (!updated) message = "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E15\u0E31\u0E49\u0E07\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E23\u0E2D\u0E1A\u0E07\u0E1A\u0E44\u0E14\u0E49";
    else {
      await writeAuditLog({ action: "finance_budget_cycle.update", entityType: "finance_account", entityId: financeScope.financeAccountId, actorLineUserId: lineUserId, lineChatId, details: { startDay: updated } });
      message = `\u0E15\u0E31\u0E49\u0E07\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E23\u0E2D\u0E1A\u0E07\u0E1A\u0E40\u0E1B\u0E47\u0E19\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${updated} \u0E02\u0E2D\u0E07\u0E17\u0E38\u0E01\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E41\u0E25\u0E49\u0E27
\u0E23\u0E2D\u0E1A\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19: ${formatBudgetCycleLabel(/* @__PURE__ */ new Date(), updated)}`;
    }
  } else if (command.type === "recurringCreate") {
    if (!canManageFinanceSettings(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E15\u0E31\u0E49\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    let category = command.category;
    if (command.transactionType === "expense" && category === "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B") {
      try {
        const customCategories = (await listExpenseCategories(lineUserId, "expense", financeScope.financeAccountId)).map((item) => item.name);
        category = (await suggestExpenseCategory(command.note, Array.from(/* @__PURE__ */ new Set([...STANDARD_EXPENSE_CATEGORIES, ...customCategories])))).category;
      } catch {
      }
    }
    try {
      assertRecurringCapacity(await listRecurringTransactions(lineUserId, financeScope.financeAccountId));
    } catch (error) {
      message = error instanceof Error ? error.message : "\u0E15\u0E31\u0E49\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const id = await createRecurringTransaction({ lineUserId, lineChatId, financeAccountId: financeScope.financeAccountId, transactionType: command.transactionType, amount: command.amount, category, note: command.note, recurrenceType: command.recurrenceType, recurrenceInterval: command.recurrenceInterval, recurrenceWeekday: command.recurrenceWeekday, recurrenceDayOfMonth: command.recurrenceDayOfMonth, nextRunAt: command.nextRunAt });
    await writeAuditLog({ action: "recurring_transaction.create", entityType: "recurring_transaction", entityId: id, actorLineUserId: lineUserId, lineChatId, details: { financeAccountId: financeScope.financeAccountId, transactionType: command.transactionType, category, amount: command.amount, recurrenceType: command.recurrenceType } });
    message = `\u0E15\u0E31\u0E49\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E1B\u0E23\u0E30\u0E08\u0E33 #${id} \u0E41\u0E25\u0E49\u0E27
${command.transactionType === "income" ? "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A" : "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22"} ${command.note} ${command.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u2022 \u0E2B\u0E21\u0E27\u0E14${category}
\u0E04\u0E23\u0E31\u0E49\u0E07\u0E16\u0E31\u0E14\u0E44\u0E1B: ${formatDate(command.nextRunAt)}`;
  } else if (command.type === "recurringList") {
    const items = await listRecurringTransactions(lineUserId, financeScope.financeAccountId);
    message = items.length ? `\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E1B\u0E23\u0E30\u0E08\u0E33
${items.slice(0, 20).map((item) => `#${item.id} \u2022 ${item.status === "active" ? "\u0E40\u0E1B\u0E34\u0E14" : item.status === "paused" ? "\u0E1E\u0E31\u0E01" : "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01"} \u2022 ${item.transactionType === "income" ? "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A" : "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22"} ${Number(item.amount).toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u2022 ${item.category} \u2022 \u0E16\u0E31\u0E14\u0E44\u0E1B ${formatDate(item.nextRunAt)}`).join("\n")}` : "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E1B\u0E23\u0E30\u0E08\u0E33\u0E17\u0E35\u0E48\u0E15\u0E31\u0E49\u0E07\u0E44\u0E27\u0E49";
  } else if (command.type === "recurringStatus") {
    if (!canManageFinanceSettings(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E22\u0E31\u0E07\u0E1B\u0E23\u0E31\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const updated = await updateRecurringTransactionStatus(command.id, lineUserId, command.status, financeScope.financeAccountId);
    message = updated ? `\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E1B\u0E23\u0E30\u0E08\u0E33 #${command.id} \u0E40\u0E1B\u0E47\u0E19 ${command.status === "active" ? "\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19" : command.status === "paused" ? "\u0E1E\u0E31\u0E01\u0E44\u0E27\u0E49" : "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01"} \u0E41\u0E25\u0E49\u0E27` : `\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E1B\u0E23\u0E30\u0E08\u0E33 #${command.id}`;
  } else if (command.type === "exportFinance") {
    const url = buildFinanceExportUrl({ lineUserId, financeAccountId: financeScope.financeAccountId, format: command.format });
    message = `\u0E2A\u0E48\u0E07\u0E2D\u0E2D\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 ${command.format === "csv" ? "CSV" : "Excel"} \u0E44\u0E14\u0E49\u0E08\u0E32\u0E01\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E19\u0E35\u0E49\u0E20\u0E32\u0E22\u0E43\u0E19 10 \u0E19\u0E32\u0E17\u0E35
${url}`;
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
  } else if (command.type === "imageEdit") {
    if (!canCreateFinanceTransaction(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E1C\u0E39\u0E49\u0E14\u0E39 \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E41\u0E01\u0E49\u0E02\u0E49\u0E2D\u0E40\u0E2A\u0E19\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const latest = await latestImageExtraction(lineUserId, lineChatId);
    if (!latest || latest.extraction.status !== "proposed" || latest.vault.mimeType === "application/pdf") {
      message = "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E25\u0E34\u0E1B\u0E17\u0E35\u0E48\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E41\u0E25\u0E49\u0E27\u0E41\u0E25\u0E30\u0E23\u0E2D\u0E41\u0E01\u0E49\u0E44\u0E02 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B\u0E01\u0E48\u0E2D\u0E19\u0E04\u0E23\u0E31\u0E1A";
    } else {
      try {
        const analysis = JSON.parse(latest.extraction.extractedJson);
        const edited = applyImageExpenseEdit(analysis, command);
        const persisted = { ...edited };
        delete persisted.editedProposal;
        const updated = await updateProposedImageExtractionJson(latest.extraction.id, JSON.stringify(persisted));
        if (!updated) message = "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E44\u0E14\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B\u0E43\u0E2B\u0E21\u0E48\u0E04\u0E23\u0E31\u0E1A";
        else {
          const proposal = edited.editedProposal;
          const dateLine = proposal.dateText ? "\n\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48: " + proposal.dateText : "";
          message = "\u0E41\u0E01\u0E49\u0E02\u0E49\u0E2D\u0E40\u0E2A\u0E19\u0E2D\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B\u0E41\u0E25\u0E49\u0E27 \u2705\n" + formatImageProposal(proposal) + dateLine + "\n\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E41\u0E25\u0E49\u0E27\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u201D";
        }
      } catch (error) {
        message = error instanceof Error ? error.message : "\u0E41\u0E01\u0E49\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08";
      }
    }
  } else if (command.type === "pdfConfirm") {
    if (!canCreateFinanceTransaction(financeScope.role)) {
      message = "\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E43\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E1C\u0E39\u0E49\u0E14\u0E39 \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const latest = await latestImageExtraction(lineUserId, lineChatId);
    if (!latest || latest.extraction.status !== "proposed" || latest.vault.mimeType !== "application/pdf") {
      message = "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35 PDF \u0E17\u0E35\u0E48\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E41\u0E25\u0E49\u0E27\u0E41\u0E25\u0E30\u0E23\u0E2D\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2A\u0E48\u0E07\u0E44\u0E1F\u0E25\u0E4C PDF \u0E01\u0E48\u0E2D\u0E19\u0E04\u0E23\u0E31\u0E1A";
    } else {
      const analysis = JSON.parse(latest.extraction.extractedJson);
      const proposals = (analysis.proposals ?? []).filter((item) => item.kind === "expense" && Number(item.amount ?? 0) > 0).slice(0, 100);
      let created = 0;
      let skipped = 0;
      for (let proposalIndex = 0; proposalIndex < proposals.length; proposalIndex += 1) {
        const raw = proposals[proposalIndex];
        const proposal = raw;
        const occurredAt = parseExtractedDate(String(proposal.dateText ?? ""), String(proposal.timeText ?? ""));
        if (!occurredAt) {
          skipped += 1;
          continue;
        }
        const amount = Number(proposal.amount);
        const category = normalizeExpenseCategory(String(proposal.category ?? ""), `${proposal.title ?? ""} ${proposal.merchant ?? ""} ${proposal.note ?? ""}`);
        const transactionId = await createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope.financeAccountId, transactionType: "expense", amount, category, note: buildExpenseNote(proposal), occurredAt, source: "line_pdf", sourceMessageId: latest.vault.lineMessageId ? `${latest.vault.lineMessageId}:pdf:${proposalIndex}` : `pdf-extraction:${latest.extraction.id}:${proposalIndex}` });
        await linkTransactionAttachment({ transactionId, vaultItemId: latest.vault.id, lineUserId, label: "PDF \u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A" });
        created += 1;
      }
      if (created > 0) await setImageExtractionStatus(latest.extraction.id, "accepted");
      message = created > 0 ? `\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E08\u0E32\u0E01 PDF \u0E41\u0E25\u0E49\u0E27 ${created} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23${skipped ? " \u2022 \u0E02\u0E49\u0E32\u0E21 " + skipped + " \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14" : ""}` : "PDF \u0E19\u0E35\u0E49\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E21\u0E35\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E41\u0E25\u0E30\u0E22\u0E2D\u0E14\u0E0A\u0E31\u0E14\u0E40\u0E08\u0E19\u0E1E\u0E2D\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01";
    }
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
        const referenceDate = latest.vault.createdAt ? new Date(latest.vault.createdAt) : Number.isFinite(event.timestamp) ? new Date(event.timestamp) : void 0;
        const resolvedDate = resolveReceiptOccurredAt(command.dateText ?? proposal.dateText, proposal.timeText, referenceDate);
        const occurredAt = resolvedDate?.occurredAt;
        if (!occurredAt) {
          message = `\u0E2D\u0E48\u0E32\u0E19\u0E22\u0E2D\u0E14 ${amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17\u0E44\u0E14\u0E49 \u0E41\u0E15\u0E48\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E43\u0E19${proposal.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08"}\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14 \u0E41\u0E25\u0E30\u0E44\u0E21\u0E48\u0E21\u0E35\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E19\u0E48\u0E32\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E16\u0E37\u0E2D\u0E1E\u0E2D\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B \u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01
\u0E01\u0E23\u0E38\u0E13\u0E32\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22 \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 27/08/2569\u201D \u0E42\u0E14\u0E22\u0E41\u0E17\u0E19\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E08\u0E23\u0E34\u0E07`;
        } else {
          const baseNote = buildExpenseNote(proposal);
          const note = resolvedDate.source === "upload-date" ? [baseNote, "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E08\u0E32\u0E01\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B \u0E40\u0E19\u0E37\u0E48\u0E2D\u0E07\u0E08\u0E32\u0E01 OCR \u0E2D\u0E48\u0E32\u0E19\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E1A\u0E19\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23\u0E44\u0E21\u0E48\u0E0A\u0E31\u0E14"].filter(Boolean).join(" | ") : baseNote;
          const transactionId = await createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope.financeAccountId, transactionType: "expense", amount, category, note, occurredAt, source: "line_image", sourceMessageId: latest.vault.lineMessageId ?? `image-extraction:${latest.extraction.id}` });
          await linkTransactionAttachment({ transactionId, vaultItemId: latest.vault.id, lineUserId, label: proposal.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A" });
          await setImageExtractionStatus(latest.extraction.id, "accepted");
          if (event.replyToken) {
            await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope.financeAccountId, { transactionType: "expense", amount, category, note, occurredAt });
            return;
          }
          message = `\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E08\u0E32\u0E01${proposal.documentType === "bank_slip" ? "\u0E2A\u0E25\u0E34\u0E1B" : "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08"} ${amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u0E43\u0E19\u0E2B\u0E21\u0E27\u0E14${category}\u0E41\u0E25\u0E49\u0E27`;
        }
      } else {
        const proposed = parseMiloCommand(`\u0E40\u0E15\u0E37\u0E2D\u0E19 ${proposal.title} ${proposal.dateText} ${proposal.timeText}`);
        if (proposed.type === "reminder") {
          if (!hasMiloEntitlement(plan, "reminders")) {
            message = entitlementMessage("reminders");
          } else {
            const id = await createReminder({ lineChatId, createdByLineUserId: lineUserId, ...proposed.data, sourceImageKey: latest.vault.storageKey ?? void 0 });
            await setImageExtractionStatus(latest.extraction.id, "accepted");
            message = `\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E08\u0E32\u0E01\u0E23\u0E39\u0E1B #${id} \u0E41\u0E25\u0E49\u0E27: ${proposed.data.title}`;
          }
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
    message = "\u{1F4DD} \u0E08\u0E14\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\n\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07: \u0E01\u0E34\u0E19\u0E01\u0E32\u0E41\u0E1F 80 \u0E2B\u0E23\u0E37\u0E2D \u0E08\u0E48\u0E32\u0E22 \u0E04\u0E48\u0E32\u0E2D\u0E32\u0E2B\u0E32\u0E23 125\n\u0E2B\u0E23\u0E37\u0E2D: \u0E23\u0E31\u0E1A\u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19 30000\n\u0E2A\u0E48\u0E07\u0E23\u0E39\u0E1B\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u201D \u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E48\u0E07\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E41\u0E25\u0E49\u0E27\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E2A\u0E35\u0E22\u0E07\u201D \u0E2B\u0E25\u0E31\u0E07\u0E15\u0E23\u0E27\u0E08\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "budgetOverview") {
    const startDay = await getFinanceAccountBudgetCycleStartDay(financeScope.financeAccountId);
    const report = await financeBudgetCycleReport(lineUserId, /* @__PURE__ */ new Date(), financeScope.financeAccountId);
    const budgets2 = await listBudgets(lineUserId, report.key, financeScope.financeAccountId);
    message = budgets2.length ? `\u{1F4CA} \u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E23\u0E2D\u0E1A ${formatBudgetCycleLabel(/* @__PURE__ */ new Date(), startDay)}
` + budgets2.slice(0, 10).map((item) => `\u2022 ${item.category}: \u0E43\u0E0A\u0E49\u0E44\u0E1B ${(report.categories[item.category] ?? 0).toLocaleString("th-TH")} / \u0E07\u0E1A ${Number(item.amount).toLocaleString("th-TH")} \u0E1A\u0E32\u0E17`).join("\n") : `\u{1F4CA} \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E17\u0E35\u0E48\u0E15\u0E31\u0E49\u0E07\u0E44\u0E27\u0E49\u0E43\u0E19\u0E23\u0E2D\u0E1A ${formatBudgetCycleLabel(/* @__PURE__ */ new Date(), startDay)}
\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07: \u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A \u0E2D\u0E32\u0E2B\u0E32\u0E23 5000
\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E23\u0E2D\u0E1A: \u0E15\u0E31\u0E49\u0E07\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E07\u0E1A 14`;
  } else if (command.type === "transactionList") {
    const results = await searchTransactions(lineUserId, "", 10, financeScope.financeAccountId);
    message = results.length ? "\u{1F4CB} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\n" + results.map((item) => `#${item.id} \u2022 ${item.transactionType === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"} ${Number(item.amount).toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u2022 ${item.category}`).join("\n") : "\u{1F4CB} \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E04\u0E23\u0E31\u0E1A";
  } else if (command.type === "greeting") {
    message = "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35\u0E04\u0E23\u0E31\u0E1A \u{1F44B} \u0E1C\u0E21\u0E44\u0E21\u0E42\u0E25 \u0E1C\u0E39\u0E49\u0E0A\u0E48\u0E27\u0E22\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\n\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E0A\u0E48\u0E27\u0E22\u0E08\u0E14\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 \u0E2D\u0E48\u0E32\u0E19\u0E2A\u0E25\u0E34\u0E1B/\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08 \u0E1F\u0E31\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07 \u0E14\u0E39\u0E2A\u0E23\u0E38\u0E1B \u0E41\u0E25\u0E30\u0E04\u0E38\u0E21\u0E07\u0E1A\u0E43\u0E2B\u0E49\u0E04\u0E23\u0E31\u0E1A";
    if (event.replyToken) {
      await replyGreetingHome(event.replyToken);
      return;
    }
  } else if (command.type === "help") {
    message = helpText();
  } else {
    if (event.replyToken) {
      const fallback = contextualFallback(text2);
      await replyTextWithQuickReplies(event.replyToken, fallback.text, fallback.actions);
      return;
    }
    message = "\u0E44\u0E21\u0E42\u0E25\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E02\u0E49\u0E32\u0E43\u0E08\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E19\u0E35\u0E49\u0E04\u0E23\u0E31\u0E1A";
  }
  if (event.replyToken) {
    const artwork = artworkForCommand(command);
    if (artwork) {
      try {
        await replyRichMenu(event.replyToken, message, artwork);
      } catch {
        await replyText(event.replyToken, message);
      }
    } else await replyText(event.replyToken, message);
  }
}
var MediaProcessingError = class extends Error {
  constructor(message, userNotified) {
    super(message);
    this.userNotified = userNotified;
    this.name = "MediaProcessingError";
  }
};
function mediaErrorMessage(error) {
  return (error instanceof Error ? error.message : "unknown media error").slice(0, 1500);
}
async function handleMedia(event, lineChatId, lineUserId, scope, runtime = {}) {
  const message = event.message;
  if (!message) return;
  const isImage = message.type === "image";
  const isAudio = message.type === "audio";
  const isPdf = message.type === "file" && /\.pdf$/i.test(message.fileName ?? "");
  const plan = resolveMiloPlan(lineUserId, process.env, await isAdminLinkedLineUser(lineUserId));
  if (isPdf && !hasMiloEntitlement(plan, "pdf")) {
    if (event.replyToken) await replyText(event.replyToken, entitlementMessage("pdf"));
    return;
  }
  if (scope !== "user" && (isImage || isAudio || isPdf) && !hasMiloEntitlement(plan, "groupAccounting")) {
    if (event.replyToken) await replyText(event.replyToken, entitlementMessage("groupAccounting"));
    return;
  }
  const mimeType = isImage ? "image/jpeg" : isAudio ? "audio/m4a" : isPdf ? "application/pdf" : "application/octet-stream";
  let bytes;
  try {
    bytes = await getMessageContent(message.id);
  } catch (error) {
    console.error("[Milo Media] LINE download failed", { messageId: message.id, type: message.type, error: error instanceof Error ? error.message : "unknown" });
    const fallback = isAudio ? "\u0E23\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E44\u0E1F\u0E25\u0E4C\u0E08\u0E32\u0E01 LINE \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E43\u0E19\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A" : isPdf ? "\u0E23\u0E31\u0E1A PDF \u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E44\u0E1F\u0E25\u0E4C\u0E08\u0E32\u0E01 LINE \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E43\u0E19\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A" : isImage ? "\u0E23\u0E31\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E23\u0E39\u0E1B\u0E08\u0E32\u0E01 LINE \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E43\u0E19\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E20\u0E32\u0E1E\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A" : "\u0E23\u0E31\u0E1A\u0E44\u0E1F\u0E25\u0E4C\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E08\u0E32\u0E01 LINE \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E43\u0E19\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E04\u0E23\u0E31\u0E1A";
    if (event.replyToken) {
      try {
        await replyText(event.replyToken, fallback);
        throw new MediaProcessingError(mediaErrorMessage(error), true);
      } catch (replyError) {
        if (replyError instanceof MediaProcessingError) throw replyError;
        console.error("[Milo Media] download fallback reply failed", { messageId: message.id, error: replyError instanceof Error ? replyError.message : "unknown" });
      }
    }
    let userNotified = false;
    try {
      await pushText(lineChatId, fallback);
      userNotified = true;
    } catch (pushError) {
      console.error("[Milo Media] download fallback push failed", { messageId: message.id, error: pushError instanceof Error ? pushError.message : "unknown" });
    }
    throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
  }
  let stored;
  try {
    stored = await storagePut(`milo/${lineChatId}/${message.id}`, bytes, mimeType);
  } catch (error) {
    console.warn("[Milo Media] permanent storage unavailable; continuing from LINE bytes", {
      messageId: message.id,
      type: message.type,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
  let vaultId;
  try {
    const existing = await findVaultItemByLineMessageId(message.id, lineUserId, lineChatId);
    vaultId = existing?.id ?? await createVaultItem({
      lineChatId,
      createdByLineUserId: lineUserId,
      itemType: isImage ? "image" : "file",
      title: message.fileName ?? (isImage ? "\u0E23\u0E39\u0E1B\u0E08\u0E32\u0E01 LINE" : isAudio ? "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E08\u0E32\u0E01 LINE" : "\u0E44\u0E1F\u0E25\u0E4C\u0E08\u0E32\u0E01 LINE"),
      searchableText: message.fileName,
      originalFilename: message.fileName,
      mimeType,
      storageKey: stored?.key,
      storageUrl: stored?.url,
      lineMessageId: message.id
    });
  } catch (error) {
    console.error("[Milo Media] vault metadata failed", { messageId: message.id, type: message.type, error: error instanceof Error ? error.message : "unknown" });
    const fallback = isAudio ? "\u0E23\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E43\u0E19\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A" : isImage ? "\u0E23\u0E31\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E43\u0E19\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E20\u0E32\u0E1E\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A" : "\u0E23\u0E31\u0E1A\u0E44\u0E1F\u0E25\u0E4C\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E43\u0E19\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E04\u0E23\u0E31\u0E1A";
    if (event.replyToken) {
      try {
        await replyText(event.replyToken, fallback);
        throw new MediaProcessingError(mediaErrorMessage(error), true);
      } catch (replyError) {
        if (replyError instanceof MediaProcessingError) throw replyError;
      }
    }
    let userNotified = false;
    try {
      await pushText(lineChatId, fallback);
      userNotified = true;
    } catch {
    }
    throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
  }
  if (isAudio) {
    if (event.replyToken) {
      try {
        await replyText(event.replyToken, "\u0E23\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E41\u0E25\u0E49\u0E27\u0E04\u0E23\u0E31\u0E1A \u0E01\u0E33\u0E25\u0E31\u0E07\u0E16\u0E2D\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E41\u0E25\u0E30\u0E41\u0E22\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E43\u0E2B\u0E49 \u0E02\u0E2D\u0E40\u0E27\u0E25\u0E32\u0E2A\u0E31\u0E01\u0E04\u0E23\u0E39\u0E48\u0E19\u0E30\u0E04\u0E23\u0E31\u0E1A");
      } catch (error) {
        console.error("[Milo Voice] acknowledgement reply failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
      }
    }
    try {
      const transcript = await transcribeAudio({ audioBuffer: bytes, mimeType, language: "th", prompt: "\u0E16\u0E2D\u0E14\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22\u0E40\u0E01\u0E35\u0E48\u0E22\u0E27\u0E01\u0E31\u0E1A\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22 \u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19 \u0E41\u0E25\u0E30\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48", gatewayToken: runtime.gatewayToken });
      if ("error" in transcript) throw new Error(`${transcript.error}${transcript.details ? `: ${transcript.details}` : ""}`);
      const financeScope = await resolveFinanceScope(lineUserId, lineChatId, scope);
      const proposal = await buildVoiceProposal(transcript.text, lineUserId, financeScope?.financeAccountId);
      await saveVoiceTranscription({ vaultItemId: vaultId, lineChatId, lineUserId, transcript: transcript.text, language: transcript.language, durationSeconds: transcript.duration, proposalJson: JSON.stringify(proposal) });
      const proposalLine = proposal.transactionType && proposal.amount ? `\u0E40\u0E2A\u0E19\u0E2D${proposal.transactionType === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A"} ${proposal.amount.toLocaleString("th-TH")} \u0E1A\u0E32\u0E17 \u2022 \u0E2B\u0E21\u0E27\u0E14${proposal.category ?? "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B"}` : "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A/\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E17\u0E35\u0E48\u0E41\u0E19\u0E48\u0E0A\u0E31\u0E14";
      const canConfirm = Boolean(proposal.transactionType && proposal.amount);
      const nextStep = canConfirm ? "\u0E15\u0E23\u0E27\u0E08\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E41\u0E25\u0E49\u0E27\u0E01\u0E14 \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u201D \u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30" : "\u0E22\u0E31\u0E07\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E14\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E43\u0E2B\u0E49\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E41\u0E25\u0E30\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19 \u0E40\u0E0A\u0E48\u0E19 \u201C\u0E04\u0E48\u0E32\u0E01\u0E32\u0E41\u0E1F 40 \u0E1A\u0E32\u0E17\u201D \u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30";
      const storageNote = stored?.key ? "" : "\n\u26A0\uFE0F \u0E44\u0E1F\u0E25\u0E4C\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A\u0E22\u0E31\u0E07\u0E2A\u0E33\u0E23\u0E2D\u0E07\u0E16\u0E32\u0E27\u0E23\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2A\u0E48\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2B\u0E32\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E40\u0E01\u0E47\u0E1A\u0E44\u0E1F\u0E25\u0E4C\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A";
      await pushTextWithQuickReplies(lineChatId, `\u0E16\u0E2D\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E44\u0E14\u0E49\u0E27\u0E48\u0E32
\u201C${proposal.transcript.slice(0, 900)}\u201D
${proposalLine}
${nextStep}${storageNote}`, [...canConfirm ? [{ label: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01", text: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E2A\u0E35\u0E22\u0E07" }] : [], { label: "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21", text: "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07" }]);
    } catch (error) {
      console.error("[Milo Voice] transcription failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
      const runtimeMissing = error instanceof Error && /not configured|valid credit card|payment required|insufficient.*(?:credit|quota)|billing/i.test(error.message);
      const fallback = runtimeMissing ? "\u0E23\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23\u0E16\u0E2D\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 \u0E15\u0E49\u0E2D\u0E07\u0E41\u0E01\u0E49\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23\u0E01\u0E48\u0E2D\u0E19 \u0E15\u0E2D\u0E19\u0E19\u0E35\u0E49\u0E01\u0E23\u0E38\u0E13\u0E32\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E41\u0E17\u0E19 \u0E40\u0E0A\u0E48\u0E19 \u201C\u0E04\u0E48\u0E32\u0E01\u0E32\u0E41\u0E1F 40 \u0E1A\u0E32\u0E17\u201D \u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30" : "\u0E23\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E16\u0E2D\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E43\u0E19\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E01\u0E32\u0E23\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E41\u0E17\u0E19\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27\u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30";
      let userNotified = false;
      try {
        await pushText(lineChatId, fallback);
        userNotified = true;
      } catch (pushError) {
        console.error("[Milo Voice] failure notification failed", { messageId: message.id, error: pushError instanceof Error ? pushError.message : "unknown" });
      }
      throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
    }
    return;
  }
  if (isPdf) {
    try {
      const analysis = await analyzePdfBuffer(bytes);
      await saveImageExtraction(vaultId, "expense", JSON.stringify(analysis), analysis.confidence);
      const preview = analysis.proposals.slice(0, 5).map((item) => `\u2022 ${formatImageProposal(item)}`).join("\n");
      const more = analysis.proposals.length > 5 ? `
\u2026\u0E41\u0E25\u0E30\u0E2D\u0E35\u0E01 ${analysis.proposals.length - 5} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23` : "";
      const storageNote = stored?.key ? "" : "\n\u26A0\uFE0F PDF \u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A\u0E22\u0E31\u0E07\u0E2A\u0E33\u0E23\u0E2D\u0E07\u0E16\u0E32\u0E27\u0E23\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2A\u0E48\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E43\u0E2B\u0E21\u0E48\u0E2B\u0E32\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E40\u0E01\u0E47\u0E1A\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A";
      if (event.replyToken) await replyText(event.replyToken, `\u0E2D\u0E48\u0E32\u0E19 PDF \u0E41\u0E25\u0E49\u0E27 \u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E40\u0E2A\u0E19\u0E2D\u0E44\u0E14\u0E49 ${analysis.proposals.length} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23
${preview || "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E17\u0E35\u0E48\u0E2D\u0E48\u0E32\u0E19\u0E44\u0E14\u0E49\u0E0A\u0E31\u0E14"}${more}
\u0E15\u0E23\u0E27\u0E08\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E01\u0E48\u0E2D\u0E19 \u0E41\u0E25\u0E49\u0E27\u0E1E\u0E34\u0E21\u0E1E\u0E4C \u201C\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19 PDF\u201D \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E41\u0E25\u0E30\u0E22\u0E2D\u0E14\u0E0A\u0E31\u0E14\u0E40\u0E08\u0E19${storageNote}`);
    } catch (error) {
      console.error("[Milo PDF] analysis failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
      const fallback = "\u0E40\u0E01\u0E47\u0E1A PDF \u0E44\u0E27\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E2D\u0E48\u0E32\u0E19\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E08\u0E32\u0E01\u0E44\u0E1F\u0E25\u0E4C\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E25\u0E47\u0E2D\u0E01\u0E23\u0E2B\u0E31\u0E2A\u0E41\u0E25\u0E30\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E2D\u0E48\u0E32\u0E19\u0E44\u0E14\u0E49\u0E04\u0E23\u0E31\u0E1A";
      let userNotified = false;
      if (event.replyToken) {
        try {
          await replyText(event.replyToken, fallback);
          userNotified = true;
        } catch {
          try {
            await pushText(lineChatId, fallback);
            userNotified = true;
          } catch {
          }
        }
      } else {
        try {
          await pushText(lineChatId, fallback);
          userNotified = true;
        } catch {
        }
      }
      throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
    }
    return;
  }
  if (!isImage) {
    if (event.replyToken) await replyText(event.replyToken, stored?.key ? "\u0E40\u0E01\u0E47\u0E1A\u0E44\u0E1F\u0E25\u0E4C\u0E19\u0E35\u0E49\u0E44\u0E27\u0E49\u0E43\u0E19\u0E04\u0E25\u0E31\u0E07\u0E16\u0E32\u0E27\u0E23\u0E08\u0E19\u0E01\u0E27\u0E48\u0E32\u0E04\u0E38\u0E13\u0E08\u0E30\u0E25\u0E1A\u0E41\u0E25\u0E49\u0E27" : "\u0E23\u0E31\u0E1A\u0E44\u0E1F\u0E25\u0E4C\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E1E\u0E37\u0E49\u0E19\u0E17\u0E35\u0E48\u0E40\u0E01\u0E47\u0E1A\u0E16\u0E32\u0E27\u0E23\u0E22\u0E31\u0E07\u0E2A\u0E33\u0E23\u0E2D\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2A\u0E48\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E19\u0E35\u0E49\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A");
    return;
  }
  if (event.replyToken) {
    try {
      await replyText(event.replyToken, "\u0E23\u0E31\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E25\u0E49\u0E27\u0E04\u0E23\u0E31\u0E1A \u0E01\u0E33\u0E25\u0E31\u0E07\u0E2D\u0E48\u0E32\u0E19\u0E2A\u0E25\u0E34\u0E1B/\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E43\u0E2B\u0E49 \u0E02\u0E2D\u0E40\u0E27\u0E25\u0E32\u0E2A\u0E31\u0E01\u0E04\u0E23\u0E39\u0E48\u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30");
    } catch (error) {
      console.error("[Milo Image] acknowledgement reply failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  try {
    const analysis = await analyzeImage(`data:${mimeType};base64,${bytes.toString("base64")}`, { gatewayToken: runtime.gatewayToken });
    await saveImageExtraction(vaultId, analysis.proposals.some((item) => item.kind === "expense") ? "expense" : "reminder", JSON.stringify(analysis), analysis.confidence);
    const proposals = analysis.proposals.slice(0, 2).map((item) => `\u2022 ${formatImageProposal(item)}`).join("\n");
    const hasExpense = analysis.proposals.some((item) => item.kind === "expense" && item.amount > 0);
    const storageNote = stored?.key ? "" : "\n\u26A0\uFE0F \u0E23\u0E39\u0E1B\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A\u0E22\u0E31\u0E07\u0E2A\u0E33\u0E23\u0E2D\u0E07\u0E16\u0E32\u0E27\u0E23\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E2A\u0E48\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2B\u0E32\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E40\u0E01\u0E47\u0E1A\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A";
    await pushTextWithQuickReplies(lineChatId, `\u0E2D\u0E48\u0E32\u0E19\u0E23\u0E39\u0E1B\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27
${analysis.summary}
${proposals || "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E04\u0E27\u0E23\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34"}
\u0E15\u0E23\u0E27\u0E08\u0E22\u0E2D\u0E14 \u0E2B\u0E21\u0E27\u0E14 \u0E41\u0E25\u0E30\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E43\u0E2B\u0E49\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 \u0E41\u0E25\u0E49\u0E27\u0E01\u0E14\u0E1B\u0E38\u0E48\u0E21\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\u0E04\u0E23\u0E31\u0E1A${storageNote}`, hasExpense ? [{ label: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01", text: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22" }, { label: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49", text: "\u0E2A\u0E23\u0E38\u0E1B\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49" }] : [{ label: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E23\u0E39\u0E1B", text: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E23\u0E39\u0E1B" }]);
  } catch (error) {
    console.error("[Milo Image] analysis failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
    let userNotified = false;
    try {
      await pushText(lineChatId, "\u0E40\u0E01\u0E47\u0E1A\u0E23\u0E39\u0E1B\u0E44\u0E27\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E2D\u0E48\u0E32\u0E19\u0E2A\u0E25\u0E34\u0E1B/\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E20\u0E32\u0E1E\u0E17\u0E35\u0E48\u0E04\u0E21\u0E0A\u0E31\u0E14\u0E41\u0E25\u0E30\u0E40\u0E2B\u0E47\u0E19\u0E22\u0E2D\u0E14 \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 \u0E40\u0E27\u0E25\u0E32 \u0E41\u0E25\u0E30\u0E1C\u0E39\u0E49\u0E23\u0E31\u0E1A\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30");
      userNotified = true;
    } catch (pushError) {
      console.error("[Milo Image] failure notification failed", { messageId: message.id, error: pushError instanceof Error ? pushError.message : "unknown" });
    }
    throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
  }
}
async function processEvent(event, rawPayload, runtime = {}) {
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
    else if (event.message.type === "image" || event.message.type === "file" || event.message.type === "audio") await handleMedia(event, identity.lineChatId, identity.lineUserId, identity.scope, runtime);
    await finishWebhookEvent(event.webhookEventId, "processed");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "unknown error";
    const mediaType = event.type === "message" ? event.message?.type : void 0;
    const isMediaEvent = mediaType === "image" || mediaType === "audio" || mediaType === "file";
    if (isMediaEvent) {
      const fallback = mediaType === "audio" ? "\u0E23\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A" : mediaType === "image" ? "\u0E23\u0E31\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25\u0E2A\u0E25\u0E34\u0E1B/\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E20\u0E32\u0E1E\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A" : "\u0E23\u0E31\u0E1A\u0E44\u0E1F\u0E25\u0E4C\u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25\u0E04\u0E23\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2A\u0E48\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E23\u0E31\u0E1A";
      let delivered = error instanceof MediaProcessingError && error.userNotified;
      if (!delivered) {
        if (event.replyToken) {
          try {
            await replyText(event.replyToken, fallback);
            delivered = true;
          } catch (replyError) {
            console.error("[Milo Media] top-level fallback reply failed", { error: replyError instanceof Error ? replyError.message : "unknown" });
          }
        }
        if (!delivered) {
          try {
            await pushText(identity.lineChatId, fallback);
            delivered = true;
          } catch (pushError) {
            console.error("[Milo Media] top-level fallback push failed", { error: pushError instanceof Error ? pushError.message : "unknown" });
          }
        }
      }
      try {
        await finishWebhookEvent(event.webhookEventId, "failed", errorMessage);
      } catch (auditError) {
        console.error("[Milo Media] failed to record webhook failure", { error: auditError instanceof Error ? auditError.message : "unknown" });
      }
      return;
    }
    await finishWebhookEvent(event.webhookEventId, "failed", errorMessage);
    throw error;
  }
}
function registerLineWebhook(app2) {
  app2.post("/api/line/webhook", express.raw({ type: "*/*", limit: "2mb" }), async (req, res) => {
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
      const runtime = { gatewayToken: req.header("x-vercel-oidc-token")?.trim() || void 0 };
      await Promise.all((payload.events ?? []).map((event) => processEvent(event, raw.toString("utf8"), runtime)));
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
        const secret3 = process.env.CRON_SECRET?.trim();
        const authorization = req.headers.authorization;
        const headerSecret = req.headers["x-cron-secret"];
        const bearerValid = authorization === `Bearer ${secret3}`;
        const headerValid = headerSecret === secret3;
        if (!secret3 || !bearerValid && !headerValid) return res.status(401).json({ error: "cron-unauthorized" });
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
  const registerFinanceDigestRoute = (path4, settingKey, digestType) => {
    app2.post(path4, async (req, res) => {
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

// server/milo/saveResultImage.ts
import sharp4 from "sharp";
var money2 = (value) => normalizeRenderText(value.toLocaleString("th-TH-u-nu-latn", { maximumFractionDigits: 2 }));
var thaiDateTime2 = (value) => normalizeRenderText(new Intl.DateTimeFormat("th-TH-u-nu-latn", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok"
}).format(value));
function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]);
}
function parseDate(value) {
  const date = value ? new Date(value) : /* @__PURE__ */ new Date();
  return Number.isNaN(date.getTime()) ? /* @__PURE__ */ new Date() : date;
}
var renderSegmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
function compact2(value, maxLength) {
  const normalized = normalizeRenderText(value).replace(/\s+/g, " ").trim();
  const graphemes = Array.from(renderSegmenter.segment(normalized)).map((part) => part.segment);
  return graphemes.length > maxLength ? `${graphemes.slice(0, Math.max(1, maxLength - 3)).join("")}...` : normalized;
}
function wrapGraphemes(value, maxPerLine, maxLines) {
  const normalized = normalizeRenderText(value).replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const graphemes = Array.from(renderSegmenter.segment(normalized)).map((part) => part.segment);
  const lines = [];
  for (let offset = 0; offset < graphemes.length && lines.length < maxLines; offset += maxPerLine) {
    lines.push(graphemes.slice(offset, offset + maxPerLine).join(""));
  }
  if (graphemes.length > maxPerLine * maxLines && lines.length) {
    const last = Array.from(renderSegmenter.segment(lines[lines.length - 1])).map((part) => part.segment);
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxPerLine - 3)).join("")}...`;
  }
  return lines;
}
function saveResultDisplayText(value) {
  const normalized = normalizeRenderText(value).replace(/\s+/g, " ").trim();
  const segments = normalized.split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
  const merchantIndex = segments.findIndex((part) => /^ร้านค้า\/คู่ค้า\s*:/i.test(part));
  const primaryIndex = merchantIndex >= 0 ? merchantIndex : 0;
  const primary = segments[primaryIndex] || normalized || "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23";
  const secondary = segments.filter((_part, index2) => index2 !== primaryIndex).slice(0, 3).join(" \u2022 ");
  return {
    primary,
    primaryLines: wrapGraphemes(primary, 30, 2),
    secondary
  };
}
function displayCategory(category, transactionType) {
  const normalized = normalizeRenderText(category).trim();
  if (transactionType === "expense" && normalized === "\u0E2D\u0E32\u0E2B\u0E32\u0E23") return "\u0E04\u0E48\u0E32\u0E2D\u0E32\u0E2B\u0E32\u0E23";
  return normalized;
}
function saveResultPrimaryFontSize(value, lineCount = 1) {
  const normalized = normalizeRenderText(value).replace(/\s+/g, " ").trim();
  const graphemeCount = Array.from(renderSegmenter.segment(normalized)).length;
  if (lineCount > 1) return 27;
  if (/^ร้านค้า\/คู่ค้า\s*:/i.test(normalized) || graphemeCount > 20) return 30;
  if (graphemeCount > 14) return 36;
  return 47;
}
function buildSaveResultSvg(input) {
  const { transactionType, amount, occurredAt, budgetSpent, budgetLimit } = input;
  const display = saveResultDisplayText(input.item);
  const item = compact2(display.primary, 60) || "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23";
  const category = compact2(input.category, 24) || "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B";
  const categoryLabel = displayCategory(category, transactionType);
  const isExpense = transactionType === "expense";
  const metrics = getBudgetMetrics(budgetSpent, budgetLimit);
  const usageWidth = budgetLimit > 0 ? Math.max(0, Math.min(660, Math.round(660 * Math.min(metrics.usagePercent, 100) / 100))) : 0;
  const budgetNotice = budgetStatusCopy(category, budgetSpent, budgetLimit);
  const remainingLabel = metrics.isOverBudget ? "\u0E40\u0E01\u0E34\u0E19\u0E07\u0E1A" : "\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D";
  const remainingAmount = Math.abs(metrics.remaining);
  const typeLabel = isExpense ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A";
  const accent = isExpense ? "#F51D72" : "#139A68";
  const softAccent = isExpense ? "#FFF0F6" : "#EEFBF5";
  return `<svg width="933" height="1085" viewBox="0 0 933 1085" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="9" flood-color="#7BD9B5" flood-opacity=".18"/></filter>
      <linearGradient id="progress" x1="0" x2="1"><stop offset="0" stop-color="#22D66D"/><stop offset="1" stop-color="#FF3B83"/></linearGradient>
    </defs>

    <rect x="0" y="292" width="933" height="793" fill="#ECFFF7"/>
    <rect x="38" y="312" width="857" height="572" rx="36" fill="#FBFFFD" stroke="#D8F7E9" stroke-width="2" filter="url(#shadow)"/>

    <rect x="78" y="348" width="170" height="54" rx="27" fill="${accent}"/>
    <text x="163" y="384" text-anchor="middle" font-size="27" font-weight="800" fill="#FFFFFF">${typeLabel}</text>
    <text x="273" y="385" font-size="34" font-weight="800" fill="#183D3A">\u2022 ${escapeXml(categoryLabel)}</text>

    <text x="80" y="444" font-size="24" font-weight="600" fill="#4B6173">${escapeXml(thaiDateTime2(occurredAt))}</text>
    <text x="80" y="510" font-size="47" font-weight="800" fill="#163D3C">${escapeXml(item)}</text>
    <text x="844" y="510" text-anchor="end" font-size="55" font-weight="900" fill="${accent}">\u0E3F${money2(amount)}</text>
    <line x1="78" y1="535" x2="855" y2="535" stroke="#8ADDC0" stroke-width="3"/>

    ${budgetLimit > 0 ? `
      <rect x="70" y="576" width="792" height="292" rx="28" fill="${softAccent}" stroke="#CFF3E3" stroke-width="2"/>
      <circle cx="111" cy="630" r="25" fill="#149A68"/>
      <text x="111" y="629" text-anchor="middle" font-size="24" font-weight="800" fill="#FFFFFF">\u0E3F</text>
      <text x="150" y="630" font-size="30" font-weight="800" fill="#173F3B">\u0E07\u0E1A\u0E2B\u0E21\u0E27\u0E14${escapeXml(category)}</text>

      <text x="90" y="681" font-size="19" fill="#526979">\u0E43\u0E0A\u0E49\u0E44\u0E1B</text>
      <text x="90" y="725" font-size="39" font-weight="900" fill="${accent}">\u0E3F${money2(budgetSpent)}</text>
      <text x="378" y="681" font-size="19" fill="#526979">\u0E07\u0E1A\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14</text>
      <text x="378" y="725" font-size="34" font-weight="800" fill="#149A68">\u0E3F${money2(budgetLimit)}</text>
      <text x="646" y="681" font-size="19" fill="#526979">${remainingLabel}</text>
      <text x="646" y="725" font-size="34" font-weight="800" fill="${metrics.isOverBudget ? "#F51D72" : "#149A68"}">\u0E3F${money2(remainingAmount)}</text>

      <rect x="90" y="760" width="660" height="24" rx="12" fill="#DDEFE8"/>
      <rect x="90" y="760" width="${usageWidth}" height="24" rx="12" fill="url(#progress)"/>
      <text x="90" y="819" font-size="23" font-weight="800" fill="${metrics.isOverBudget ? "#D94A6E" : "#32685C"}">${escapeXml(budgetNotice)}</text>
    ` : `
      <rect x="70" y="590" width="792" height="184" rx="28" fill="#F1FBF7" stroke="#CFF3E3" stroke-width="2"/>
      <text x="100" y="650" font-size="29" font-weight="800" fill="#173F3B">\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A\u0E2B\u0E21\u0E27\u0E14${escapeXml(category)}</text>
      <text x="100" y="698" font-size="22" fill="#526979">\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E14\u0E49\u0E27\u0E22\u0E22\u0E2D\u0E14\u0E41\u0E25\u0E30\u0E40\u0E27\u0E25\u0E32\u0E08\u0E23\u0E34\u0E07\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27</text>
    `}

    <rect x="70" y="910" width="792" height="132" rx="34" fill="#FFFFFF" stroke="#D4F3E5" stroke-width="2" filter="url(#shadow)"/>
    <text x="108" y="958" font-size="27" font-weight="700" fill="#3D5870">\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E43\u0E2B\u0E49\u0E41\u0E25\u0E49\u0E27\u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30</text>
    <text x="108" y="1004" font-size="25" fill="#3D5870">${escapeXml(item)} \u2022 ${escapeXml(categoryLabel)} \u2022 ${money2(amount)} \u0E1A\u0E32\u0E17</text>
  </svg>`;
}
function vectorLayer(text2, options) {
  return {
    input: vectorTextSvg(text2, { width: options.width, fontSize: options.fontSize, color: options.color, bold: options.bold, align: options.align }),
    left: options.left,
    top: options.top,
    blend: "over"
  };
}
function buildThaiTextLayers(input) {
  const display = saveResultDisplayText(input.item);
  const item = display.primary || "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23";
  const itemLines = display.primaryLines.length ? display.primaryLines : [item];
  const itemFontSize = saveResultPrimaryFontSize(item, itemLines.length);
  const category = compact2(input.category, 24) || "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B";
  const categoryLabel = displayCategory(category, input.transactionType);
  const metrics = getBudgetMetrics(input.budgetSpent, input.budgetLimit);
  const accent = input.transactionType === "expense" ? "#F51D72" : "#139A68";
  const typeLabel = input.transactionType === "expense" ? "\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22" : "\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A";
  const remainingLabel = metrics.isOverBudget ? "\u0E40\u0E01\u0E34\u0E19\u0E07\u0E1A" : "\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D";
  const remainingAmount = Math.abs(metrics.remaining);
  const layers = [
    vectorLayer(typeLabel, { left: 78, top: 351, width: 170, fontSize: 27, color: "#FFFFFF", bold: true, align: "center" }),
    vectorLayer(`\u2022 ${categoryLabel}`, { left: 273, top: 344, width: 560, fontSize: 34, color: "#183D3A", bold: true }),
    vectorLayer(thaiDateTime2(input.occurredAt), { left: 80, top: 411, width: 760, fontSize: 24, color: "#4B6173", bold: true }),
    ...itemLines.length > 1 ? itemLines.slice(0, 2).map((line, index2) => vectorLayer(line, { left: 80, top: 452 + index2 * 34, width: 470, fontSize: 27, color: "#163D3C", bold: true })) : [vectorLayer(item, { left: 80, top: 457, width: 470, fontSize: itemFontSize, color: "#163D3C", bold: true })],
    vectorLayer(`\u0E3F${money2(input.amount)}`, { left: 555, top: 453, width: 289, fontSize: 55, color: accent, bold: true, align: "right" })
  ];
  if (input.budgetLimit > 0) {
    layers.push(
      vectorLayer("\u0E3F", { left: 91, top: 599, width: 40, fontSize: 24, color: "#FFFFFF", bold: true, align: "center" }),
      vectorLayer(`\u0E07\u0E1A\u0E2B\u0E21\u0E27\u0E14${category}`, { left: 150, top: 593, width: 650, fontSize: 30, color: "#173F3B", bold: true }),
      vectorLayer("\u0E43\u0E0A\u0E49\u0E44\u0E1B", { left: 90, top: 651, width: 200, fontSize: 19, color: "#526979" }),
      vectorLayer(`\u0E3F${money2(input.budgetSpent)}`, { left: 90, top: 683, width: 240, fontSize: 39, color: accent, bold: true }),
      vectorLayer("\u0E07\u0E1A\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14", { left: 378, top: 651, width: 220, fontSize: 19, color: "#526979" }),
      vectorLayer(`\u0E3F${money2(input.budgetLimit)}`, { left: 378, top: 683, width: 230, fontSize: 34, color: "#149A68", bold: true }),
      vectorLayer(remainingLabel, { left: 646, top: 651, width: 190, fontSize: 19, color: "#526979" }),
      vectorLayer(`\u0E3F${money2(remainingAmount)}`, { left: 646, top: 683, width: 190, fontSize: 34, color: metrics.isOverBudget ? "#F51D72" : "#149A68", bold: true }),
      vectorLayer(budgetStatusCopy(category, input.budgetSpent, input.budgetLimit), { left: 90, top: 792, width: 735, fontSize: 23, color: metrics.isOverBudget ? "#D94A6E" : "#32685C", bold: true })
    );
  } else {
    layers.push(
      vectorLayer(`\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E07\u0E1A\u0E2B\u0E21\u0E27\u0E14${category}`, { left: 100, top: 611, width: 730, fontSize: 29, color: "#173F3B", bold: true }),
      vectorLayer("\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E14\u0E49\u0E27\u0E22\u0E22\u0E2D\u0E14\u0E41\u0E25\u0E30\u0E40\u0E27\u0E25\u0E32\u0E08\u0E23\u0E34\u0E07\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27", { left: 100, top: 661, width: 730, fontSize: 22, color: "#526979" })
    );
  }
  const footerText = display.secondary || `${item} \u2022 ${categoryLabel} \u2022 ${money2(input.amount)} \u0E1A\u0E32\u0E17`;
  const footerLines = wrapGraphemes(footerText, 48, 2);
  layers.push(
    vectorLayer("\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E43\u0E2B\u0E49\u0E41\u0E25\u0E49\u0E27\u0E19\u0E48\u0E30\u0E08\u0E4A\u0E30", { left: 108, top: 931, width: 650, fontSize: 27, color: "#3D5870", bold: true }),
    ...footerLines.map((line, index2) => vectorLayer(line, { left: 108, top: 972 + index2 * 28, width: 690, fontSize: 21, color: "#3D5870" }))
  );
  return layers;
}
function registerSaveResultImageRoute(app2) {
  app2.get("/api/milo/save-result.png", async (req, res) => {
    try {
      const transactionType = req.query.transactionType === "income" ? "income" : "expense";
      const item = String(req.query.item ?? "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23").trim().slice(0, 300) || "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23";
      const category = String(req.query.category ?? "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B").trim().slice(0, 50) || "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B";
      const amount = Number(req.query.amount ?? 0);
      const budgetSpent = Number(req.query.budgetSpent ?? 0);
      const budgetLimit = Number(req.query.budgetLimit ?? 0);
      const occurredAt = parseDate(typeof req.query.occurredAt === "string" ? req.query.occurredAt : null);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).type("text/plain").send("Invalid amount");
      const baseUrl = (process.env.MILO_RICH_MENU_IMAGE_BASE_URL ?? "https://milo-line-app.vercel.app/milo-richmenu").replace(/\/+$/, "");
      const templateResponse = await fetch(`${baseUrl}/save-complete.png`, { cache: "no-store" });
      if (!templateResponse.ok) return res.status(502).type("text/plain").send("Save result template unavailable");
      const template = Buffer.from(await templateResponse.arrayBuffer());
      const svg = buildSaveResultSvg({ transactionType, item, category, amount, occurredAt, budgetSpent, budgetLimit });
      const shapesOnlySvg = svg.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, "");
      const textLayers = buildThaiTextLayers({ transactionType, item, category, amount, occurredAt, budgetSpent, budgetLimit });
      const output = await sharp4(template).composite([{ input: Buffer.from(shapesOnlySvg), top: 0, left: 0 }, ...textLayers]).png().toBuffer();
      res.set({ "Content-Type": "image/png", "Cache-Control": "private, no-store, max-age=0" });
      return res.status(200).send(output);
    } catch (error) {
      console.error("[Milo Save Image] render failed", error);
      return res.status(500).type("text/plain").send("Unable to render save result");
    }
  });
}

// server/milo/storageRoute.ts
function decodeStorageKey(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
function registerMiloStorageRoute(app2) {
  app2.get("/api/milo/storage/:key", async (req, res) => {
    const key = decodeStorageKey(req.params.key);
    if (!key) return res.status(400).type("text/plain").send("missing storage key");
    try {
      if (key.startsWith("db:")) {
        const object = await storageGetDatabaseObject(key);
        if (!object) return res.status(404).type("text/plain").send("storage object not found");
        res.setHeader("Content-Type", object.mimeType || "application/octet-stream");
        res.setHeader("Content-Length", String(object.sizeBytes));
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).send(object.data);
      }
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

// server/api.ts
var app = express2();
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
registerSaveResultImageRoute(app);
registerFinanceReportImageRoute(app);
registerRichMenuDataImageRoute(app);
registerFinanceExportRoute(app);
registerCalendarExportRoute(app);
registerMiloStorageRoute(app);
registerLineWebhook(app);
app.use(express2.json({ limit: "10mb" }));
app.use(express2.urlencoded({ limit: "10mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
var healthHandler = async (req, res) => {
  const gatewayToken = req.header("x-vercel-oidc-token")?.trim() || void 0;
  const runtime = await imageAnalysisRuntimeStatus(gatewayToken);
  const mode = runtime.mode;
  const voice = voiceTranscriptionRuntimeStatus(gatewayToken);
  const storage = storageRuntimeStatus();
  res.status(200).json({
    status: runtime.authenticated && voice.configured && Boolean(process.env.LINE_CHANNEL_SECRET?.trim()) && Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()) && Boolean(process.env.DATABASE_URL?.trim()) ? "ok" : "degraded",
    service: "milo",
    release: "image-save-card-v3-2026-09-16",
    visionConfigured: runtime.authenticated,
    imageAnalysisMode: mode,
    visionModel: mode === "ocr-fallback" ? "tesseract-tha+eng" : process.env.MILO_VISION_MODEL || (mode.startsWith("vercel-ai-gateway") ? "google/gemini-2.5-flash" : mode.startsWith("forge-vision") ? "gemini-3-flash-preview" : "unconfigured"),
    ocrAssetsReady: runtime.ocrAssetsReady,
    voiceConfigured: voice.configured,
    voiceTranscriptionMode: voice.mode,
    voiceLocalBundled: voice.local?.bundled ?? false,
    voiceLocalModel: voice.local?.model ?? null,
    storage: {
      requestedProvider: storage.requested,
      activeProvider: storage.activeProvider,
      configuredProviders: storage.configuredProviders
    },
    readiness: {
      lineConfigured: Boolean(process.env.LINE_CHANNEL_SECRET?.trim()) && Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()),
      databaseConfigured: Boolean(process.env.DATABASE_URL?.trim()),
      exportSigningConfigured: Boolean(process.env.LINE_CHANNEL_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.SESSION_SECRET?.trim()),
      cronConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      duplicateProtection: true,
      undoSupported: true,
      webhookSignatureVerification: true,
      calendarSupported: true,
      durableVaultStorageConfigured: storage.configured,
      databaseVaultStorageSupported: true,
      storageProviderChoiceSupported: true,
      googleDriveStorageSupported: true,
      s3CompatibleStorageSupported: true,
      groupSharedVaultSearch: true
    },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
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
