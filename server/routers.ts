import { z } from "zod";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
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
      .input(
        z.object({
          email: z.string().trim().email("กรุณากรอก Gmail ที่ถูกต้อง (เช่น admin@gmail.com)"),
          name: z.string().trim().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const email = input.email.toLowerCase();
        const safeOpenId = "admin_" + email.replace(/[^a-zA-Z0-9]/g, "_");
        const name = input.name || ("ผู้ดูแลระบบ (" + email.split("@")[0] + ")");

        await db.upsertUser({
          openId: safeOpenId,
          name,
          email,
          role: "admin",
          loginMethod: "gmail",
          lastSignedIn: new Date(),
        });

        const sessionToken = await sdk.createSessionToken(safeOpenId, {
          name,
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true, user: { openId: safeOpenId, name, email, role: "admin" } };
      }),
  }),
  milo: router({
    linkLineAccount: protectedProcedure.input(z.object({ lineUserId: z.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID ต้องขึ้นต้นด้วย U และตามด้วยอักขระ 32 ตัว") })).mutation(async ({ ctx, input }) => {
      await db.linkLineUser(ctx.user.id, input.lineUserId.trim());
      await db.writeAuditLog({ action: "line_account.link", entityType: "line_account_link", dashboardUserId: ctx.user.id, actorLineUserId: input.lineUserId.trim(), details: { lineUserId: input.lineUserId.trim() } });
      return { success: true } as const;
    }),
    connection: protectedProcedure.query(async ({ ctx }) => ({ lineUserId: await db.getLinkedLineUser(ctx.user.id) ?? null })),
    financeAccounts: router({
      list: protectedProcedure.query(async ({ ctx }) => db.listFinanceAccounts(await requireLinkedLineUser(ctx.user.id))),
      members: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        return db.listFinanceAccountMembers(input.financeAccountId);
      }),
      createGroup: protectedProcedure.input(z.object({ lineChatId: z.string().trim().min(1).max(128), name: z.string().trim().min(1).max(120) })).mutation(async ({ ctx, input }) => {
        const lineUserId = await requireLinkedLineUser(ctx.user.id);
        return { id: await db.createGroupFinanceAccount({ ownerLineUserId: lineUserId, lineChatId: input.lineChatId, name: input.name }) };
      }),
      upsertMember: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive(), lineUserId: z.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID ต้องขึ้นต้นด้วย U และตามด้วยอักขระ 32 ตัว"), role: z.enum(["manager", "contributor", "viewer"]) })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(db.canManageFinanceAccountMembers(scope.role), "เฉพาะเจ้าของสมุดบัญชีที่จัดการสมาชิกได้");
        if (!await db.isEligibleGroupFinanceAccountMember(input.financeAccountId, input.lineUserId)) throw new Error("ผู้ใช้นี้ยังไม่มีข้อมูลการเป็นสมาชิกในกลุ่ม LINE นี้");
        await db.upsertFinanceAccountMember(input);
        return { success: true } as const;
      }),
      removeMember: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive(), lineUserId: z.string().trim().regex(/^U[0-9a-fA-F]{32}$/, "LINE User ID ต้องขึ้นต้นด้วย U และตามด้วยอักขระ 32 ตัว") })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(db.canManageFinanceAccountMembers(scope.role), "เฉพาะเจ้าของสมุดบัญชีที่ลบสมาชิกได้");
        await db.removeFinanceAccountMember(input.financeAccountId, input.lineUserId);
        return { success: true } as const;
      }),
    }),
    budgets: router({
      list: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), monthKey: z.string().regex(/^\d{4}-\d{2}$/, "monthKey ต้องอยู่ในรูปแบบ YYYY-MM").optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        return db.listBudgets(scope.lineUserId, input?.monthKey, scope.financeAccountId);
      }),
      categories: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), transactionType: z.enum(["expense", "income"]).optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        return db.listExpenseCategories(scope.lineUserId, input?.transactionType, scope.financeAccountId);
      }),
      createCategory: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), name: z.string().trim().min(1).max(64), transactionType: z.enum(["expense", "income"]).default("expense") })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังเพิ่มหมวดหมู่ในสมุดบัญชีนี้ไม่ได้");
        return { id: await db.createExpenseCategory({ lineUserId: scope.lineUserId, name: input.name, transactionType: input.transactionType, financeAccountId: scope.financeAccountId }) };
      }),
      setBudget: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), monthKey: z.string().regex(/^\d{4}-\d{2}$/, "monthKey ต้องอยู่ในรูปแบบ YYYY-MM"), category: z.string().trim().min(1).max(64), amount: z.number().positive(), alertAtPercent: z.number().int().min(1).max(100).default(80) })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังตั้งงบประมาณในสมุดบัญชีนี้ไม่ได้");
        await db.upsertBudget({ lineUserId: scope.lineUserId, financeAccountId: scope.financeAccountId, monthKey: input.monthKey, category: input.category, amount: input.amount, alertAtPercent: input.alertAtPercent });
        return { success: true } as const;
      }),
    }),
    openingBalance: router({
      get: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        return db.getOpeningBalance(scope.lineUserId, scope.financeAccountId);
      }),
      set: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), amount: z.number().finite(), asOfDate: z.string().datetime().optional() })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังตั้งค่ายอดเริ่มต้นในสมุดบัญชีนี้ไม่ได้");
        await db.upsertOpeningBalance(scope.lineUserId, input.amount, input.asOfDate ? new Date(input.asOfDate) : new Date(), scope.financeAccountId);
        return { success: true } as const;
      }),
    }),
    overview: protectedProcedure.query(async ({ ctx }) => {
      const lineUserId = await db.getLinkedLineUser(ctx.user.id);
      if (!lineUserId) return { lineUserId: null, reminders: [], todos: [], recentVault: [], stats: { remindersCount: 0, pendingTodosCount: 0, vaultCount: 0 }, finance: { income: 0, expense: 0, balance: 0, categories: {} } };
      const [reminders, todos, recentVault, stats, finance] = await Promise.all([
        db.listReminders(lineUserId, 10),
        db.listTodos(lineUserId, false),
        db.listRecentVault(lineUserId, 6),
        db.getDashboardStats(lineUserId),
        db.getFinanceSummary7Days(lineUserId),
      ]);
      return { lineUserId, reminders, todos, recentVault, stats, finance };
    }),
    finance: router({
      summary: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        const [sevenDays, monthly, openingBalance, activeBudgets] = await Promise.all([
          db.getFinanceSummary7Days(scope.lineUserId, scope.financeAccountId),
          db.getFinanceSummaryMonthly(scope.lineUserId, undefined, scope.financeAccountId),
          db.getOpeningBalance(scope.lineUserId, scope.financeAccountId),
          db.listBudgets(scope.lineUserId, undefined, scope.financeAccountId),
        ]);
        const opening = openingBalance ? Number(openingBalance.amount) : 0;
        return { sevenDays, monthly: { ...monthly, openingBalance: opening, availableBalance: opening + monthly.balance }, openingBalance, activeBudgets, currentScope: { financeAccountId: scope.financeAccountId, role: scope.role, accountName: scope.account.name, isGroup: scope.account.accountType === "group" } };
      }),
      customRangeSummary: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), startDate: z.string().datetime(), endDate: z.string().datetime() })).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        return db.getFinanceSummaryByRange(scope.lineUserId, new Date(input.startDate), new Date(input.endDate), scope.financeAccountId);
      }),
      transactions: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), limit: z.number().int().positive().max(100).optional(), offset: z.number().int().nonnegative().optional(), search: z.string().trim().optional() }).optional()).query(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
        const [items, total] = await Promise.all([
          db.listTransactions({ lineUserId: scope.lineUserId, financeAccountId: scope.financeAccountId, limit: input?.limit ?? 20, offset: input?.offset ?? 0, search: input?.search }),
          db.countTransactions(scope.lineUserId, scope.financeAccountId, input?.search),
        ]);
        return { items, total, currentRole: scope.role };
      }),
      deleteTransaction: protectedProcedure.input(z.object({ id: z.number().int().positive(), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(db.canManageFinanceTransactions(scope.role), "สิทธิ์ของคุณยังลบรายการในสมุดบัญชีนี้ไม่ได้");
        return { success: await db.deleteTransaction({ id: input.id, lineUserId: scope.lineUserId, financeAccountId: scope.financeAccountId }) };
      }),
      updateTransaction: protectedProcedure.input(z.object({ id: z.number().int().positive(), financeAccountId: z.number().int().positive().optional(), amount: z.number().positive() })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        requireFinancePermission(db.canManageFinanceTransactions(scope.role), "สิทธิ์ของคุณยังแก้ไขรายการในสมุดบัญชีนี้ไม่ได้");
        return { success: await db.updateTransaction({ id: input.id, lineUserId: scope.lineUserId, financeAccountId: scope.financeAccountId, amount: input.amount }) };
      }),
      recurring: router({
        list: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input?.financeAccountId);
          return db.listRecurringTransactions(scope.lineUserId, scope.financeAccountId);
        }),
        toggle: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean(), financeAccountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
          requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังจัดการรายการประจำในสมุดบัญชีนี้ไม่ได้");
          await db.toggleRecurringTransaction(input.id, scope.lineUserId, input.isActive, scope.financeAccountId);
          return { success: true } as const;
        }),
        create: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), title: z.string().trim().min(1).max(160), amount: z.number().positive(), transactionType: z.enum(["expense", "income"]), category: z.string().trim().min(1).max(64), frequency: z.enum(["monthly", "weekly"]), dueDayOfMonth: z.number().int().min(1).max(31).optional(), dueDayOfWeek: z.number().int().min(0).max(6).optional() })).mutation(async ({ ctx, input }) => {
          const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
          requireFinancePermission(db.canManageFinanceSettings(scope.role), "สิทธิ์ของคุณยังสร้างรายการประจำในสมุดบัญชีนี้ไม่ได้");
          return { id: await db.createRecurringTransaction({ lineUserId: scope.lineUserId, ...input, financeAccountId: scope.financeAccountId }) };
        }),
      }),
      askInsight: protectedProcedure.input(z.object({ financeAccountId: z.number().int().positive().optional(), question: z.string().trim().min(1).max(500) })).mutation(async ({ ctx, input }) => {
        const scope = await requireFinanceAccountScope(ctx.user.id, input.financeAccountId);
        const [monthly, recentTxs, budgets] = await Promise.all([
          db.getFinanceSummaryMonthly(scope.lineUserId, undefined, scope.financeAccountId),
          db.listTransactions({ lineUserId: scope.lineUserId, financeAccountId: scope.financeAccountId, limit: 15 }),
          db.listBudgets(scope.lineUserId, undefined, scope.financeAccountId),
        ]);
        const insight = await generateFinancialInsight({ question: input.question, summary: monthly, recentTransactions: recentTxs, budgets });
        return { insight };
      }),
    }),
    reminders: router({
      list: protectedProcedure.query(async ({ ctx }) => db.listReminders(await requireLinkedLineUser(ctx.user.id), 20)),
      create: protectedProcedure.input(z.object({ title: z.string().min(1), runAt: z.string().datetime() })).mutation(async ({ ctx, input }) => {
        const lineUserId = await requireLinkedLineUser(ctx.user.id);
        const chat = await db.getDefaultChatForUser(lineUserId);
        if (!chat) throw new Error("ไม่พบบัญชี LINE สำหรับส่งการแจ้งเตือน");
        return { id: await db.createReminder({ lineChatId: chat.lineChatId, createdByLineUserId: lineUserId, title: input.title, reminderType: "once", nextRunAt: new Date(input.runAt) }) };
      }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
        await db.deleteReminder(input.id, await requireLinkedLineUser(ctx.user.id));
        return { success: true } as const;
      }),
    }),
    todos: router({
      list: protectedProcedure.input(z.object({ completed: z.boolean().optional() }).optional()).query(async ({ ctx, input }) => db.listTodos(await requireLinkedLineUser(ctx.user.id), input?.completed)),
      toggle: protectedProcedure.input(z.object({ id: z.number(), completed: z.boolean() })).mutation(async ({ ctx, input }) => {
        await db.toggleTodo(input.id, await requireLinkedLineUser(ctx.user.id), input.completed);
        return { success: true } as const;
      }),
      create: protectedProcedure.input(z.object({ title: z.string().min(1) })).mutation(async ({ ctx, input }) => {
        const lineUserId = await requireLinkedLineUser(ctx.user.id);
        const chat = await db.getDefaultChatForUser(lineUserId);
        return { id: await db.createTodo({ lineChatId: chat?.lineChatId ?? "dashboard", createdByLineUserId: lineUserId, title: input.title }) };
      }),
    }),
    vault: router({
      list: protectedProcedure.input(z.object({ query: z.string().optional() }).optional()).query(async ({ ctx, input }) => db.searchVault(await requireLinkedLineUser(ctx.user.id), input?.query)),
      update: protectedProcedure.input(z.object({ id: z.number(), tagsText: z.string().nullable().optional(), sourceUrl: z.string().nullable().optional() })).mutation(async ({ ctx, input }) => {
        await db.updateVaultMetadata({ id: input.id, lineUserId: await requireLinkedLineUser(ctx.user.id), tagsText: input.tagsText, sourceUrl: input.sourceUrl });
        return { success: true } as const;
      }),
      delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
        await db.deleteVaultItem(input.id, await requireLinkedLineUser(ctx.user.id));
        return { success: true } as const;
      }),
    }),
    admin: router({
      governance: protectedProcedure.query(async ({ ctx }) => {
        requireAdminRole(ctx.user.role);
        return db.getAdminGovernanceSummary();
      }),
      auditLogs: protectedProcedure.input(z.object({ limit: z.number().int().positive().max(100).default(50), offset: z.number().int().nonnegative().default(0) }).default({})).query(async ({ ctx, input }) => {
        requireAdminRole(ctx.user.role);
        const [items, total] = await Promise.all([
          db.listAuditLogs(input.limit, input.offset),
          db.countAuditLogs(),
        ]);
        return { items, total };
      }),
      updateUserRole: protectedProcedure.input(z.object({ id: z.number().int().positive(), role: z.enum(["viewer", "user", "manager", "admin"]) })).mutation(async ({ ctx, input }) => {
        requireAdminRole(ctx.user.role);
        await db.updateUserRole(input.id, input.role);
        await db.writeAuditLog({ action: "user.role_change", entityType: "user", dashboardUserId: ctx.user.id, targetUserId: input.id, details: { newRole: input.role } });
        return { success: true } as const;
      }),
    }),
    automation: router({
      settings: protectedProcedure.query(async ({ ctx }) => {
        await requireLinkedLineUser(ctx.user.id);
        const [reminderSetting, recoverySetting] = await Promise.all([
          db.getAutomationSetting("reminder-delivery-primary"),
          db.getAutomationSetting("reminder-delivery-recovery"),
        ]);
        return {
          reminderDelivery: {
            configured: Boolean(reminderSetting?.scheduleCronTaskUid),
            isEnabled: Boolean(reminderSetting?.isEnabled),
            taskUid: reminderSetting?.scheduleCronTaskUid ?? null,
            updatedAt: reminderSetting?.updatedAt ?? null,
          },
          recoveryDelivery: {
            configured: Boolean(recoverySetting?.scheduleCronTaskUid),
            isEnabled: Boolean(recoverySetting?.isEnabled),
            taskUid: recoverySetting?.scheduleCronTaskUid ?? null,
            updatedAt: recoverySetting?.updatedAt ?? null,
          },
        };
      }),
      triggerRemindersNow: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") throw new Error("เฉพาะผู้ดูแลโครงการที่สั่งประมวลผล reminder ได้");
        const result = await deliverDueReminders({ runner: "dashboard_manual", dashboardUserId: ctx.user.id });
        return { success: true, processed: result.deliveredCount, scanned: result.scannedCount } as const;
      }),
      setupReminderDelivery: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") throw new Error("เฉพาะผู้ดูแลโครงการที่ตั้งงานส่งเตือนได้");
        if (!ENV.isProduction) throw new Error("ต้องเผยแพร่เว็บไซต์ก่อน จึงจะตั้งงานส่งเตือนอัตโนมัติได้");
        const sessionToken = getSchedulerSessionToken(ctx.req.headers);
        console.info("[Milo Scheduler] Setup requested", { isProduction: ENV.isProduction, hasSessionToken: Boolean(sessionToken) });
        if (!sessionToken) throw new Error("ไม่พบ session สำหรับตั้งค่า scheduler");
        const key = "reminder-delivery-primary";
        const current = await db.getAutomationSetting(key);
        const jobSpec = {
          name: "milo-reminder-delivery",
          cron: "0 * * * * *",
          path: "/api/scheduled/reminders",
          description: "ตรวจรายการเตือนของไมโลทุกหนึ่งนาที",
        };
          const taskUid = current?.scheduleCronTaskUid;
          try {
            if (taskUid && current?.isEnabled) {
              console.info("[Milo Scheduler] Already active", { taskUid });
              return { taskUid, status: "already-active" as const };
            }
            if (taskUid) {
              await updateHeartbeatJob(taskUid, { cron: jobSpec.cron, path: jobSpec.path, description: jobSpec.description, enable: true }, sessionToken);
              await db.saveAutomationSetting({ settingKey: key, scheduleCronTaskUid: taskUid, isEnabled: true });
            console.info("[Milo Scheduler] Updated", { taskUid });
            return { taskUid, status: "updated" as const };
          }
          const job = await createHeartbeatJob(jobSpec, sessionToken);
          await db.saveAutomationSetting({ settingKey: key, scheduleCronTaskUid: job.taskUid, isEnabled: true });
          console.info("[Milo Scheduler] Created", { taskUid: job.taskUid });
          return { taskUid: job.taskUid, status: "created" as const, nextExecutionAt: job.nextExecutionAt ?? null };
        } catch (error) {
          console.error("[Milo Scheduler] Setup failed", error instanceof Error ? error.message : "unknown error");
          throw error;
        }
      }),
    }),
  }),
});

export type AppRouter = typeof appRouter;