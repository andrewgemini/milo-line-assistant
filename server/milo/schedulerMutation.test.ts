import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", async () => {
  const actual = await vi.importActual<typeof import("../db")>("../db");
  return { ...actual, getAutomationSetting: vi.fn(), saveAutomationSetting: vi.fn() };
});

import * as db from "../db";
import { ENV } from "../_core/env";
import { appRouter } from "../routers";

describe("setupReminderDelivery mutation", () => {
  const originalIsProduction = ENV.isProduction;

  beforeEach(() => {
    vi.clearAllMocks();
    ENV.isProduction = true;
    vi.mocked(db.getAutomationSetting).mockResolvedValue(undefined);
    vi.mocked(db.saveAutomationSetting).mockResolvedValue(undefined);
  });

  afterEach(() => { ENV.isProduction = originalIsProduction; });

  it("keeps the server-side guard for non-production environments", async () => {
    ENV.isProduction = false;
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: { authorization: "Bearer browser-session-token" } }, res: {},
    } as never);

    await expect(caller.milo.automation.setupReminderDelivery()).rejects.toThrow("ต้องเผยแพร่เว็บไซต์ก่อน");
    expect(db.saveAutomationSetting).not.toHaveBeenCalled();
  });

  it("configures the Vercel Cron task without requiring the legacy Heartbeat service", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: {} }, res: {},
    } as never);

    await expect(caller.milo.automation.setupReminderDelivery()).resolves.toMatchObject({
      taskUid: "vercel-cron-reminders",
      status: "configured",
      nextExecutionAt: null,
    });
    expect(db.saveAutomationSetting).toHaveBeenCalledWith({
      settingKey: "reminder-delivery-primary",
      scheduleCronTaskUid: "vercel-cron-reminders",
      isEnabled: true,
    });
  });

  it("keeps the Vercel Cron task stable when it is already active", async () => {
    vi.mocked(db.getAutomationSetting).mockResolvedValue({
      settingKey: "reminder-delivery-primary",
      scheduleCronTaskUid: "vercel-cron-reminders",
      isEnabled: true,
    } as never);
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: {} }, res: {},
    } as never);

    await expect(caller.milo.automation.setupReminderDelivery()).resolves.toMatchObject({
      taskUid: "vercel-cron-reminders",
      status: "already-active",
    });
    expect(db.saveAutomationSetting).toHaveBeenCalledTimes(1);
  });

  it("repairs a legacy paused scheduler row to the Vercel Cron task", async () => {
    vi.mocked(db.getAutomationSetting).mockResolvedValue({
      settingKey: "reminder-delivery-primary",
      scheduleCronTaskUid: "legacy-heartbeat-task",
      isEnabled: false,
    } as never);
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: {} }, res: {},
    } as never);

    await expect(caller.milo.automation.setupReminderDelivery()).resolves.toMatchObject({
      taskUid: "vercel-cron-reminders",
      status: "configured",
    });
    expect(db.saveAutomationSetting).toHaveBeenCalledWith({
      settingKey: "reminder-delivery-primary",
      scheduleCronTaskUid: "vercel-cron-reminders",
      isEnabled: true,
    });
  });
});
