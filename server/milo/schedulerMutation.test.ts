import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", async () => {
  const actual = await vi.importActual<typeof import("../db")>("../db");
  return { ...actual, getAutomationSetting: vi.fn(), saveAutomationSetting: vi.fn() };
});
vi.mock("../_core/heartbeat", () => ({ createHeartbeatJob: vi.fn(), updateHeartbeatJob: vi.fn() }));

import * as db from "../db";
import { ENV } from "../_core/env";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { appRouter } from "../routers";

describe("setupReminderDelivery mutation", () => {
  const originalIsProduction = ENV.isProduction;

  beforeEach(() => {
    vi.clearAllMocks();
    ENV.isProduction = true;
    vi.mocked(db.getAutomationSetting).mockResolvedValue(undefined);
    vi.mocked(db.saveAutomationSetting).mockResolvedValue(undefined);
    vi.mocked(createHeartbeatJob).mockResolvedValue({ taskUid: "task-bearer", nextExecutionAt: "2026-08-22T16:10:00Z" } as never);
    vi.mocked(updateHeartbeatJob).mockResolvedValue({ nextExecutionAt: "2026-08-22T16:11:00Z" } as never);
  });

  afterEach(() => { ENV.isProduction = originalIsProduction; });

  it("keeps the server-side guard for non-production environments", async () => {
    ENV.isProduction = false;
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: { authorization: "Bearer browser-session-token" } }, res: {},
    } as never);

    await expect(caller.milo.automation.setupReminderDelivery()).rejects.toThrow("ต้องเผยแพร่เว็บไซต์ก่อน");
    expect(createHeartbeatJob).not.toHaveBeenCalled();
    expect(updateHeartbeatJob).not.toHaveBeenCalled();
  });

  it("creates a scheduler with an Authorization Bearer token when no session cookie is available", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: { authorization: "Bearer browser-session-token" } }, res: {},
    } as never);

    await expect(caller.milo.automation.setupReminderDelivery()).resolves.toMatchObject({ taskUid: "task-bearer", status: "created" });
    expect(createHeartbeatJob).toHaveBeenCalledWith(expect.objectContaining({ name: "milo-reminder-delivery" }), "browser-session-token");
    expect(db.saveAutomationSetting).toHaveBeenCalledWith(expect.objectContaining({ scheduleCronTaskUid: "task-bearer", isEnabled: true }));
  });

  it("returns the existing primary scheduler without calling Heartbeat again when it is already active", async () => {
    vi.mocked(db.getAutomationSetting).mockResolvedValue({ settingKey: "reminder-delivery-primary", scheduleCronTaskUid: "task-primary", isEnabled: true } as never);
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: { authorization: "Bearer browser-session-token" } }, res: {},
    } as never);

    await expect(caller.milo.automation.setupReminderDelivery()).resolves.toMatchObject({ taskUid: "task-primary", status: "already-active" });
    expect(createHeartbeatJob).not.toHaveBeenCalled();
    expect(updateHeartbeatJob).not.toHaveBeenCalled();
    expect(db.saveAutomationSetting).not.toHaveBeenCalled();
  });

  it("resumes a paused primary scheduler instead of creating a duplicate", async () => {
    vi.mocked(db.getAutomationSetting).mockResolvedValue({ settingKey: "reminder-delivery-primary", scheduleCronTaskUid: "task-primary", isEnabled: false } as never);
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: { authorization: "Bearer browser-session-token" } }, res: {},
    } as never);

    await expect(caller.milo.automation.setupReminderDelivery()).resolves.toMatchObject({ taskUid: "task-primary", status: "updated" });
    expect(updateHeartbeatJob).toHaveBeenCalledWith("task-primary", expect.objectContaining({ enable: true }), "browser-session-token");
    expect(createHeartbeatJob).not.toHaveBeenCalled();
    expect(db.saveAutomationSetting).toHaveBeenCalledWith(expect.objectContaining({ settingKey: "reminder-delivery-primary", scheduleCronTaskUid: "task-primary" }));
  });
});
