import { boolean, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["viewer", "user", "manager", "admin"]).default("user").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const lineChats = mysqlTable("line_chats", {
  id: int("id").autoincrement().primaryKey(),
  scope: mysqlEnum("scope", ["user", "group", "room"]).notNull(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull().unique(),
  displayName: varchar("displayName", { length: 255 }),
  pictureUrl: text("pictureUrl"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("line_chats_scope_idx").on(table.scope)]);

export const lineMembers = mysqlTable("line_members", {
  id: int("id").autoincrement().primaryKey(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  pictureUrl: text("pictureUrl"),
  isBot: boolean("isBot").default(false).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [unique("line_members_chat_user_unique").on(table.lineChatId, table.lineUserId), index("line_members_user_idx").on(table.lineUserId)]);

export const lineAccountLinks = mysqlTable("line_account_links", {
  id: int("id").autoincrement().primaryKey(),
  dashboardUserId: int("dashboardUserId").notNull().unique(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull().unique(),
  linkedAt: timestamp("linkedAt").defaultNow().notNull(),
});

export const financeAccounts = mysqlTable("finance_accounts", {
  id: int("id").autoincrement().primaryKey(),
  accountType: mysqlEnum("accountType", ["personal", "group"]).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  ownerLineUserId: varchar("ownerLineUserId", { length: 128 }).notNull(),
  lineChatId: varchar("lineChatId", { length: 128 }),
  budgetCycleStartDay: int("budgetCycleStartDay").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  unique("finance_accounts_group_chat_unique").on(table.lineChatId),
  index("finance_accounts_owner_idx").on(table.ownerLineUserId, table.isActive),
]);

export const financeAccountMembers = mysqlTable("finance_account_members", {
  id: int("id").autoincrement().primaryKey(),
  financeAccountId: int("financeAccountId").notNull(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  role: mysqlEnum("role", ["owner", "manager", "contributor", "viewer"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  unique("finance_account_members_unique").on(table.financeAccountId, table.lineUserId),
  index("finance_account_members_user_idx").on(table.lineUserId, table.financeAccountId),
]);

export const webhookEvents = mysqlTable("webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  webhookEventId: varchar("webhookEventId", { length: 128 }).notNull().unique(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  lineChatId: varchar("lineChatId", { length: 128 }),
  occurredAt: timestamp("occurredAt").notNull(),
  rawPayload: text("rawPayload").notNull(),
  status: mysqlEnum("status", ["received", "processed", "ignored", "failed"]).default("received").notNull(),
  errorMessage: text("errorMessage"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("webhook_events_status_idx").on(table.status, table.createdAt)]);

export const reminders = mysqlTable("reminders", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("reminders_due_idx").on(table.status, table.nextRunAt), index("reminders_user_idx").on(table.createdByLineUserId)]);

export const reminderDeliveryAttempts = mysqlTable("reminder_delivery_attempts", {
  id: int("id").autoincrement().primaryKey(),
  reminderId: int("reminderId").notNull(),
  runner: mysqlEnum("runner", ["heartbeat", "manual"]).notNull(),
  taskUid: varchar("taskUid", { length: 65 }),
  status: mysqlEnum("status", ["sending", "sent", "failed"]).default("sending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
}, table => [index("reminder_delivery_attempts_reminder_idx").on(table.reminderId, table.createdAt), index("reminder_delivery_attempts_status_idx").on(table.status, table.createdAt)]);

export const vaultItems = mysqlTable("vault_items", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("vault_items_user_idx").on(table.createdByLineUserId, table.createdAt), index("vault_items_chat_idx").on(table.lineChatId, table.itemType)]);

export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  createdByLineUserId: varchar("createdByLineUserId", { length: 128 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("notes_user_idx").on(table.createdByLineUserId, table.updatedAt)]);

export const todoItems = mysqlTable("todo_items", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("todo_items_user_idx").on(table.createdByLineUserId, table.status)]);

export const transactions = mysqlTable("transactions", {
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
  deletedAt: timestamp("deletedAt"),
}, table => [index("transactions_user_idx").on(table.lineUserId, table.status, table.occurredAt), index("transactions_account_idx").on(table.financeAccountId, table.status, table.occurredAt), index("transactions_source_message_idx").on(table.sourceMessageId)]);

export const transactionAttachments = mysqlTable("transaction_attachments", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull(),
  vaultItemId: int("vaultItemId").notNull(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  label: varchar("label", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [unique("transaction_attachments_unique").on(table.transactionId, table.vaultItemId), index("transaction_attachments_user_idx").on(table.lineUserId, table.transactionId)]);

export const voiceTranscriptions = mysqlTable("voice_transcriptions", {
  id: int("id").autoincrement().primaryKey(),
  vaultItemId: int("vaultItemId").notNull().unique(),
  lineChatId: varchar("lineChatId", { length: 128 }).notNull(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  transcript: text("transcript").notNull(),
  language: varchar("language", { length: 16 }),
  durationSeconds: decimal("durationSeconds", { precision: 10, scale: 2 }),
  proposalJson: text("proposalJson"),
  status: mysqlEnum("status", ["proposed", "accepted", "rejected", "failed"]).default("proposed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("voice_transcriptions_user_idx").on(table.lineUserId, table.createdAt)]);

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: int("entityId"),
  dashboardUserId: int("dashboardUserId"),
  actorLineUserId: varchar("actorLineUserId", { length: 128 }),
  lineChatId: varchar("lineChatId", { length: 128 }),
  detailsJson: text("detailsJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt), index("audit_logs_actor_idx").on(table.actorLineUserId, table.createdAt)]);

export const budgets = mysqlTable("budgets", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  financeAccountId: int("financeAccountId"),
  category: varchar("category", { length: 100 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  alertAtPercent: int("alertAtPercent").default(80).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [unique("budgets_account_period_unique").on(table.financeAccountId, table.category, table.monthKey), index("budgets_account_month_idx").on(table.financeAccountId, table.monthKey)]);

export const imageExtractions = mysqlTable("image_extractions", {
  id: int("id").autoincrement().primaryKey(),
  vaultItemId: int("vaultItemId").notNull(),
  purpose: mysqlEnum("purpose", ["reminder", "expense", "file"]).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  extractedJson: text("extractedJson").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["proposed", "accepted", "rejected", "failed"]).default("proposed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const automationSettings = mysqlTable("automation_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 100 }).notNull().unique(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const financeDigestDeliveries = mysqlTable("finance_digest_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 100 }).notNull(),
  taskUid: varchar("taskUid", { length: 65 }).notNull(),
  targetLineUserId: varchar("targetLineUserId", { length: 128 }).notNull(),
  digestType: mysqlEnum("digestType", ["daily", "weekly"]).notNull(),
  periodKey: varchar("periodKey", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["sending", "sent", "failed"]).default("sending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
}, table => [
  unique("finance_digest_delivery_period_unique").on(table.settingKey, table.periodKey),
  index("finance_digest_delivery_task_idx").on(table.taskUid, table.createdAt),
]);

export const financeOpeningBalances = mysqlTable("finance_opening_balances", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  financeAccountId: int("financeAccountId"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  effectiveAt: timestamp("effectiveAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [unique("finance_opening_balances_account_unique").on(table.financeAccountId)]);

export const recurringTransactions = mysqlTable("recurring_transactions", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("recurring_transactions_due_idx").on(table.status, table.nextRunAt), index("recurring_transactions_user_idx").on(table.lineUserId, table.status), index("recurring_transactions_account_idx").on(table.financeAccountId, table.status)]);

export const recurringTransactionRuns = mysqlTable("recurring_transaction_runs", {
  id: int("id").autoincrement().primaryKey(),
  recurringTransactionId: int("recurringTransactionId").notNull(),
  periodKey: varchar("periodKey", { length: 48 }).notNull(),
  status: mysqlEnum("status", ["creating", "created", "failed"]).default("creating").notNull(),
  transactionId: int("transactionId"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
}, table => [unique("recurring_transaction_run_unique").on(table.recurringTransactionId, table.periodKey), index("recurring_transaction_runs_status_idx").on(table.status, table.createdAt)]);

export const expenseCategories = mysqlTable("expense_categories", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  financeAccountId: int("financeAccountId"),
  transactionType: mysqlEnum("transactionType", ["income", "expense"]).default("expense").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [unique("expense_categories_account_type_name_unique").on(table.financeAccountId, table.transactionType, table.name), index("expense_categories_account_idx").on(table.financeAccountId, table.transactionType)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
