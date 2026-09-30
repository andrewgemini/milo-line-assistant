import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, { settingKey: string; isEnabled: boolean; lastRunAt: Date | null; scheduleCronTaskUid: string | null }>(),
  pushText: vi.fn(async () => undefined),
  audit: vi.fn(async () => undefined),
}));

vi.mock("../db", () => ({
  getAutomationSetting: vi.fn(async (settingKey: string) => mocks.settings.get(settingKey)),
  saveAutomationSetting: vi.fn(async (input: { settingKey: string; isEnabled?: boolean; lastRunAt?: Date; scheduleCronTaskUid?: string | null }) => {
    const current = mocks.settings.get(input.settingKey);
    mocks.settings.set(input.settingKey, {
      settingKey: input.settingKey,
      isEnabled: input.isEnabled ?? current?.isEnabled ?? true,
      lastRunAt: input.lastRunAt ?? null,
      scheduleCronTaskUid: input.scheduleCronTaskUid ?? current?.scheduleCronTaskUid ?? null,
    });
  }),
  listActivePrivateLineUsers: vi.fn(async () => ["U111", "U222"]),
  resolveFinanceAccountForLineEvent: vi.fn(async () => ({ account: { id: 1 }, membership: { role: "owner" } })),
  listCalendarEventsForRange: vi.fn(async () => []),
  listRemindersForChat: vi.fn(async () => []),
  listTodosForChat: vi.fn(async () => []),
  listCompletedTodosForChat: vi.fn(async () => []),
  listPendingBillsForChat: vi.fn(async () => []),
  financeReport: vi.fn(async () => ({ income: 0, expense: 0, balance: 0 })),
  writeAuditLog: mocks.audit,
}));

vi.mock("./line", () => ({ pushText: mocks.pushText }));

import { deliverDuePersonalDigests, personalDigestSlotForBangkok } from "./personalDigestDelivery";

describe("personal digest delivery", () => {
  beforeEach(() => {
    mocks.settings.clear();
    mocks.pushText.mockClear();
    mocks.audit.mockClear();
  });

  it("maps Bangkok time to the advertised 07:00 and 20:00 digest windows", () => {
    expect(personalDigestSlotForBangkok(new Date("2026-09-16T23:59:00.000Z"))).toBeUndefined(); // 06:59 Bangkok
    expect(personalDigestSlotForBangkok(new Date("2026-09-17T00:00:00.000Z"))).toBe("morning");
    expect(personalDigestSlotForBangkok(new Date("2026-09-17T12:59:00.000Z"))).toBe("morning");
    expect(personalDigestSlotForBangkok(new Date("2026-09-17T13:00:00.000Z"))).toBe("evening");
  });

  it("delivers to every active private LINE user and is idempotent per user/day", async () => {
    const first = await deliverDuePersonalDigests(new Date("2026-09-17T00:00:00.000Z"));
    expect(first).toMatchObject({ slot: "morning", scanned: 2, delivered: 2, skipped: 0, failed: 0 });
    expect(mocks.pushText).toHaveBeenCalledTimes(2);
    expect(mocks.pushText.mock.calls[0]?.[1]).toContain("Morning Brief");

    const second = await deliverDuePersonalDigests(new Date("2026-09-17T00:05:00.000Z"));
    expect(second).toMatchObject({ slot: "morning", scanned: 2, delivered: 0, skipped: 2, failed: 0 });
    expect(mocks.pushText).toHaveBeenCalledTimes(2);
  });

  it("delivers the evening summary independently from the morning state", async () => {
    await deliverDuePersonalDigests(new Date("2026-09-17T00:00:00.000Z"));
    const evening = await deliverDuePersonalDigests(new Date("2026-09-17T13:00:00.000Z"));
    expect(evening).toMatchObject({ slot: "evening", scanned: 2, delivered: 2, skipped: 0, failed: 0 });
    expect(mocks.pushText).toHaveBeenCalledTimes(4);
    expect(mocks.pushText.mock.calls[2]?.[1]).toContain("Evening Summary");
  });

  it("retries a failed digest after a bounded cooldown instead of suppressing it for the whole day", async () => {
    mocks.pushText.mockRejectedValueOnce(new Error("LINE temporarily unavailable"));
    const first = await deliverDuePersonalDigests(new Date("2026-09-17T00:00:00.000Z"));
    expect(first).toMatchObject({ delivered: 1, failed: 1 });

    const cooldown = await deliverDuePersonalDigests(new Date("2026-09-17T00:05:00.000Z"));
    expect(cooldown).toMatchObject({ delivered: 0, skipped: 2, failed: 0 });

    const retry = await deliverDuePersonalDigests(new Date("2026-09-17T00:16:00.000Z"));
    expect(retry).toMatchObject({ delivered: 1, skipped: 1, failed: 0 });
  });
});
