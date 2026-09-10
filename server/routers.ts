import { z } from "zod";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { ENV } from "./_core/env";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { deliverDueReminders } from "./milo/reminderDelivery";
import { generateFinancialInsight } from "./milo/financialAssistant";

export function getSchedulerSessionToken(headers: { cookie?: string; authorization?: string }) {
  const cookieToken = parseCookie(headers.cookie ?? "")[COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const authorization = headers.authorization;
  return typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function requireLinkedLineUser(dashboardUserId: number) {
  const lineUserId = await db.getLinkedLineUser(dashboardUserId);
  if (!lineUserId) throw new Error("ยังไม่ได้เชื่อมบัญชี LINE กับไมโล");
  return lineUserId;
}

async function requireFinanceAccountScope(dashboardUserId: number, financeAccountId?: number) {
  const lineUserId = await requireLinkedLineUser(dashboardUserId);
  const access = financeAccountId === undefined
    ? { account: await db.getOrCreatePersonalFinanceAccount(lineUserId), membership: { role: "owner" as const } }
    : await db.getFinanceAccountAccess(financeAccountId, lineUserId);
  if (!access) throw new Error("คุณไม่มีสิทธิ์เข้าถึงสมุดบัญชีนี้");
  return { lineUserId, financeAccountId: access.account.id, account: access.account, role: access.membership.role };
}

function requireFinancePermission(allowed: boolean, message: string) {
  if (!allowed) throw new Error(message);
}

function requireAdminRole(role: string) {
  if (role !== "admin") throw new Error("เฉพาะผู้ดูแลโครงการที่เข้าถึงส่วนนี้ได้");
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    adminLogin: publicProcedure
      .input(z.object({ username: z.string().trim().min(1, "กรุณากรอกชื่อผู้ใช้ (Username)"), password: z.string().trim().min(1, "กรุณากรอกรหัสผ่าน (Password)") }))
      .mutation(async ({ ctx, input }) => {
        const expectedUser = (process.env.ADMIN_USERNAME || "admin").trim();
        const expectedPass = (process.env.ADMIN_PASSWORD || "admin1234").trim();
        if (input.username !== expectedUser || input.password !== expectedPass) throw new Error("ชื่อผู้ใช้หรือรหัสผ่านผู้ดูแลระบบไม่ถูกต้อง");
        const safeOpenId = `admin_${expectedUser}`;
        const name = "ผู้ดูแลระบบ (Admin)";
        try { await db.upsertUser({ openId: safeOpenId, name, email: "admin@milo.internal", role: "admin", loginMethod: "admin_password", lastSignedIn: new Date() }); }
        catch (dbErr) { console.warn("[AdminLogin] DB user upsert skipped/warning:", dbErr); }
        const sessionToken = await sdk.createSessionToken(safeOpenId, { name, expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true, user: { openId: safeOpenId, name, role: "admin" } };
      }),
  }),
  milo: router({
    linkLineAccount: protectedProcedure.input(z.object({ lineUserId: z.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID ต้องขึ้นต้นด้วย U และตามด้วยอักขระ 32 ตัว") })).mutation(async ({ ctx, input }) => { await db.linkLineUser(ctx.user.id, input.lineUserId.trim()); await db.writeAuditLog({ action: "line_account.link", entityType: "line_account_link", dashboardUserId: ctx.user.id, actorLineUserId: input.lineUserId.trim(), details: { lineUserId: input.lineUserId.trim() } }); return { success: true } as const; }),
    connection: protectedProcedure.query(async ({ ctx }) => ({ lineUserId: await db.getLinkedLineUser(ctx.user.id) ?? null })),
    financeAccounts: router({
      list: protectedProcedure.query(async ({ ctx }) => db.listFinanceAccounts(await requireLinkedLineUser(ctx.user.id))),
      members: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive() })).query(async ({ ctx, input }) => { await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); return db.listFinanceAccountMembers(input.financeAccountId); }),
      createGroup: protectedProcedure.input(z.object({ lineChatId: z.string().trim().min(1).max(128), name: z.string().trim().min(1).max(120) })).mutation(async ({ ctx, input }) => { const lineUserId = await requireLinkedLineUser(ctx.user.id); return { id: await db.createGroupFinanceAccount({ ownerLineUserId: lineUserId, lineChatId: input.lineChatId, name: input.name }) }; }),
      upsertMember: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive(), lineUserId: z.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID ต้องขึ้นต้นด้วย U และตามด้วยอักขระ 32 ตัว"), role: z.enum(["manager", "contributor", "viewer"]) })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceAccountMembers(scope.role), "เฉพาะเจ้าของสมุดบัญชีที่จัดการสมาชิกได้"); if (!await db.isEligibleGroupFinanceAccountMember(input.financeAccountId, input.lineUserId)) throw new Error("ผู้ใช้นี้ยังไม่มีข้อมูลการเป็นสมาชิกในกลุ่ม LINE นี้"); await db.upsertFinanceAccountMember(input); await db.writeAuditLog({ action: "finance_account.member.upsert", entityType: "finance_account_member", entityId: input.financeAccountId, dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? undefined, details: { memberLineUserId: input.lineUserId, role: input.role } }); return { success: true } as const; }),
      removeMember: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive(), lineUserId: z.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID ต้องขึ้นต้นด้วย U และตามด้วยอักขระ 32 ตัว") })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceAccountMembers(scope.role), "เฉพาะเจ้าของสมุดบัญชีที่จัดการสมาชิกได้"); const removed = await db.removeFinanceAccountMember(input.financeAccountId, input.lineUserId); if (!removed) throw new Error("ไม่พบสมาชิกที่ลบได้ หรือไม่สามารถลบเจ้าของสมุดบัญชี"); await db.writeAuditLog({ action: "finance_account.member.remove", entityType: "finance_account_member", entityId: input.financeAccountId, dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? undefined, details: { memberLineUserId: input.lineUserId } }); return { success: true } as const; }),
    }),
    overview: adminProcedure.query(async ({ ctx }) => { const lineUserId = await db.getLinkedLineUser(ctx.user.id); if (!lineUserId) return { lineUserId: null, reminders: [], todos: [], notes: [], vault: [], groups: [], budgets: [], finance: { income: 0, expense: 0, balance: 0, categories: {} }, financeAnalytics: { daily: [], transactionCount: 0, sevenDayIncome: 0, sevenDayExpense: 0 } }; const personalAccount = await db.getOrCreatePersonalFinanceAccount(lineUserId); const [reminders, todos, notes, vault, groups, budgets, finance, financeAnalytics, financeAccounts] = await Promise.all([db.listReminders(lineUserId), db.listTodos(lineUserId), db.listNotes(lineUserId), db.searchVault(lineUserId), db.listLineGroups(lineUserId), db.listBudgets(lineUserId, undefined, personalAccount.id), db.financeSummary(lineUserId, personalAccount.id), db.financeAnalytics(lineUserId, personalAccount.id), db.listFinanceAccounts(lineUserId)]); return { lineUserId, reminders, todos, notes, vault, groups, budgets, finance, financeAnalytics, financeAccounts, personalFinanceAccountId: personalAccount.id }; }),
    reminders: router({
      list: protectedProcedure.query(async ({ ctx }) => db.listReminders(await requireLinkedLineUser(ctx.user.id))),
      create: protectedProcedure.input(z.object({ title: z.string().min(1).max(255), dueAt: z.coerce.date(), recurrenceType: z.enum(["once", "minute", "day", "week", "month"]).default("once"), recurrenceInterval: z.number().int().min(1).default(1) })).mutation(async ({ ctx, input }) => { const lineUserId = await requireLinkedLineUser(ctx.user.id); return { id: await db.createReminder({ lineChatId: lineUserId, createdByLineUserId: lineUserId, title: input.title, dueAt: input.dueAt, nextRunAt: input.dueAt, recurrenceType: input.recurrenceType, recurrenceInterval: input.recurrenceInterval }) }; }),
      delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.deleteReminder(input.id, await requireLinkedLineUser(ctx.user.id)); return { success: true } as const; }),
    }),
    vault: router({ search: protectedProcedure.input(z.object({ query: z.string().max(255).default("") })).query(async ({ ctx, input }) => db.searchVault(await requireLinkedLineUser(ctx.user.id), input.query)), updateMetadata: protectedProcedure.input(z.object({ id: z.number().int().positive(), tagsText: z.string().max(500).nullable().optional(), sourceUrl: z.string().url().max(2000).nullable().optional() })).mutation(async ({ ctx, input }) => { await db.updateVaultMetadata(input.id, await requireLinkedLineUser(ctx.user.id), { tagsText: input.tagsText, sourceUrl: input.sourceUrl }); return { success: true } as const; }) }),
    todos: router({ list: protectedProcedure.query(async ({ ctx }) => db.listTodos(await requireLinkedLineUser(ctx.user.id))), complete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.completeTodo(input.id, await requireLinkedLineUser(ctx.user.id)); return { success: true } as const; }) }),
    finance: router({
      summary: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId); return db.financeSummary(scope.lineUserId, scope.financeAccountId); }),
      balanceSnapshot: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId); return db.getBalanceSnapshot(scope.lineUserId, scope.financeAccountId); }),
      analytics: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId); return db.financeAnalytics(scope.lineUserId, scope.financeAccountId); }),
      budgets: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional() }).optional()).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId); return db.listBudgets(scope.lineUserId, input?.monthKey, scope.financeAccountId); }),
      openingBalance: protectedProcedure.input(z.object({ amount: z.number().min(0), effectiveAt: z.coerce.date().optional(), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังตั้งค่ายอดเริ่มต้นในสมุดบัญชีนี้ไม่ได้"); await db.upsertOpeningBalance(scope.lineUserId, input.amount, input.effectiveAt, scope.financeAccountId); await db.writeAuditLog({ action: "finance_opening_balance.set", entityType: "finance_opening_balance", dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? undefined, details: { financeAccountId: scope.financeAccountId, amount: input.amount, effectiveAt: input.effectiveAt?.toISOString() ?? null } }); return { success: true } as const; }),
      recurring: router({
        list: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId); return db.listRecurringTransactions(scope.lineUserId, scope.financeAccountId); }),
        create: protectedProcedure.input(z.object({ transactionType: z.enum(["income", "expense"]), amount: z.number().positive(), category: z.string().trim().min(1).max(100), note: z.string().trim().max(1_000).optional(), recurrenceType: z.enum(["day", "week", "month"]), recurrenceInterval: z.number().int().min(1).max(365).default(1), recurrenceWeekday: z.number().int().min(0).max(6).optional(), recurrenceDayOfMonth: z.number().int().min(1).max(28).optional(), nextRunAt: z.coerce.date(), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังตั้งค่ารายการอัตโนมัติในสมุดบัญชีนี้ไม่ได้"); const id = await db.createRecurringTransaction({ ...input, financeAccountId: scope.financeAccountId, lineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? scope.lineUserId }); await db.writeAuditLog({ action: "recurring_transaction.create", entityType: "recurring_transaction", entityId: id, dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? scope.lineUserId, details: { financeAccountId: scope.financeAccountId, transactionType: input.transactionType, category: input.category, amount: input.amount, recurrenceType: input.recurrenceType } }); return { id }; }),
        updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "paused", "cancelled"]), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังปรับรายการอัตโนมัติในสมุดบัญชีนี้ไม่ได้"); const updated = await db.updateRecurringTransactionStatus(input.id, scope.lineUserId, input.status, scope.financeAccountId); if (!updated) throw new Error("ไม่พบรายการอัตโนมัติที่ต้องการปรับสถานะ"); await db.writeAuditLog({ action: "recurring_transaction.status.update", entityType: "recurring_transaction", entityId: input.id, dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? undefined, details: { financeAccountId: scope.financeAccountId, status: input.status } }); return { success: true } as const; }),
      }),
      report: protectedProcedure.input(z.object({ period: z.enum(["day", "week", "month", "year"]), reference: z.coerce.date().optional(), financeAccountId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); return db.financeReport(scope.lineUserId, input.period, input.reference, scope.financeAccountId); }),
      reportRange: protectedProcedure.input(z.object({ start: z.coerce.date(), end: z.coerce.date(), financeAccountId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); return db.financeReportRange(scope.lineUserId, input.start, input.end, scope.financeAccountId); }),
      aiSummary: protectedProcedure.input(z.object({ period: z.enum(["day", "week", "month", "year"]).default("month"), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); const report = await db.financeReport(scope.lineUserId, input.period, new Date(), scope.financeAccountId); return generateFinancialInsight(report); }),
      transactions: protectedProcedure.input(z.object({ start: z.coerce.date().optional(), end: z.coerce.date().optional(), financeAccountId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId); return db.listTransactions(scope.lineUserId, input?.start, input?.end, false, scope.financeAccountId); }),
      attachments: protectedProcedure.input(z.object({ transactionIds: z.array(z.number().int().positive()).min(1).max(20), financeAccountId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); return db.listTransactionAttachmentsForFinanceAccount(input.transactionIds, scope.financeAccountId); }),
      create: protectedProcedure.input(z.object({ transactionType: z.enum(["income", "expense"]), amount: z.number().positive(), category: z.string().trim().min(1).max(100), note: z.string().trim().max(2000).optional(), occurredAt: z.coerce.date().optional(), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canCreateFinanceTransaction(scope.role), "สิทธิ์ของคุณในสมุดบัญชีนี้เป็นผู้ดู จึงยังเพิ่มรายการไม่ได้"); return { id: await db.createTransaction({ lineChatId: scope.account.lineChatId ?? scope.lineUserId, lineUserId: scope.lineUserId, ...input, financeAccountId: scope.financeAccountId, source: "dashboard" }) }; }),
      search: protectedProcedure.input(z.object({ query: z.string().trim().max(255), limit: z.number().int().min(1).max(50).default(10), financeAccountId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); return db.searchTransactions(scope.lineUserId, input.query, input.limit, scope.financeAccountId); }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), transactionType: z.enum(["income", "expense"]).optional(), amount: z.number().positive().optional(), category: z.string().trim().min(1).max(100).optional(), note: z.string().trim().max(2000).nullable().optional(), occurredAt: z.coerce.date().optional(), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceTransactions(scope.role), "สิทธิ์ของคุณยังแก้ไขรายการในสมุดบัญชีนี้ไม่ได้"); const updated = await db.updateTransaction({ ...input, lineUserId: scope.lineUserId, financeAccountId: scope.financeAccountId, actorDashboardUserId: ctx.user.id }); if (!updated) throw new Error("ไม่พบธุรกรรมที่ต้องการแก้ไข หรือรายการถูกลบแล้ว"); return { success: true } as const; }),
      delete: protectedProcedure.input(z.object({ id: z.number().int().positive(), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceTransactions(scope.role), "สิทธิ์ของคุณยังลบรายการในสมุดบัญชีนี้ไม่ได้"); const deleted = await db.deleteTransaction({ ...input, lineUserId: scope.lineUserId, financeAccountId: scope.financeAccountId, actorDashboardUserId: ctx.user.id }); if (!deleted) throw new Error("ไม่พบธุรกรรมที่ต้องการลบ หรือรายการถูกลบแล้ว"); return { success: true } as const; }),
      budget: protectedProcedure.input(z.object({ category: z.string().min(1).max(100), amount: z.number().positive(), monthKey: z.string().regex(/^\d{4}-\d{2}$/), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังตั้งงบประมาณในสมุดบัญชีนี้ไม่ได้"); await db.upsertBudget(scope.lineUserId, input.category, input.amount, input.monthKey, scope.financeAccountId); return { success: true } as const; }),
      categories: router({
        list: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId); return db.listTransactionCategories(scope.lineUserId, scope.financeAccountId); }),
        create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(100), transactionType: z.enum(["income", "expense"]), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังจัดการหมวดในสมุดบัญชีนี้ไม่ได้"); await db.addExpenseCategory(scope.lineUserId, input.name, input.transactionType, scope.financeAccountId); await db.writeAuditLog({ action: "finance_category.create", entityType: "expense_category", dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? undefined, details: { financeAccountId: scope.financeAccountId, name: input.name, transactionType: input.transactionType } }); return { success: true } as const; }),
        remove: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(100), transactionType: z.enum(["income", "expense"]), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId); requireFinancePermission(db.canManageFinanceSettings(scope.role), "เฉพาะเจ้าของสมุดบัญชีที่จัดการหมวดในสมุดบัญชีนี้ไม่ได้"); const removed = await db.removeExpenseCategory(scope.lineUserId, input.name, input.transactionType, scope.financeAccountId); if (!removed) throw new Error("ไม่พบหมวดที่ต้องการลบ"); await db.writeAuditLog({ action: "finance_category.delete", entityType: "expense_category", dashboardUserId: ctx.user.id, actorLineUserId: scope.lineUserId, lineChatId: scope.account.lineChatId ?? undefined, details: { financeAccountId: scope.financeAccountId, name: input.name, transactionType: input.transactionType } }); return { success: true } as const; }),
      }),
    }),
    admin: router({ auditLogs: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(250).default(100) }).optional()).query(async ({ ctx, input }) => { requireAdminRole(ctx.user.role); return db.listAuditLogs(input?.limit ?? 100); }), users: protectedProcedure.query(async ({ ctx }) => { requireAdminRole(ctx.user.role); return db.listDashboardUsers(); }), updateUserRole: protectedProcedure.input(z.object({ id: z.number().int().positive(), role: z.enum(["viewer", "user", "manager", "admin"]) })).mutation(async ({ ctx, input }) => { requireAdminRole(ctx.user.role); await db.updateDashboardUserRole(input.id, input.role, ctx.user.id); return { success: true } as const; }) }),
    automation: router({
      runDueNow: protectedProcedure.mutation(async ({ ctx }) => { if (ctx.user.role !== "admin") throw new Error("เฉพาะผู้ดูแลโครงการที่สั่งประมวลผล reminder ได้"); return deliverDueReminders({ runner: "manual" }); }),
      setupReminderDelivery: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") throw new Error("เฉพาะผู้ดูแลโครงการที่ตั้งงานส่งเตือนได้");
        if (!ENV.isProduction) throw new Error("ต้องเผยแพร่เว็บไซต์ก่อน จึงจะตั้งงานส่งเตือนอัตโนมัติได้");
        const key = "reminder-delivery-primary";
        const taskUid = "external-cron-reminders";
        const current = await db.getAutomationSetting(key);
        await db.saveAutomationSetting({ settingKey: key, scheduleCronTaskUid: taskUid, isEnabled: true });
        console.info("[Milo Scheduler] External Cron configured", { taskUid, wasEnabled: Boolean(current?.isEnabled) });
        return { taskUid, status: current?.isEnabled ? "already-active" as const : "configured" as const, nextExecutionAt: null };
      }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
