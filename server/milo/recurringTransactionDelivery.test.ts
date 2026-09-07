import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  listDueRecurringTransactions: vi.fn(),
  claimRecurringTransactionRun: vi.fn(),
  createTransaction: vi.fn(),
  nextRecurringRunAt: vi.fn(),
  completeRecurringTransactionRun: vi.fn(),
  failRecurringTransactionRun: vi.fn(),
  writeAuditLog: vi.fn(),
}));

import * as db from "../db";
import { deliverDueRecurringTransactions } from "./recurringTransactionDelivery";

describe("recurring transaction delivery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a due transaction once and advances the scheduled time", async () => {
    const dueAt = new Date("2026-08-31T23:00:00.000Z");
    const nextAt = new Date("2026-09-01T23:00:00.000Z");
    vi.mocked(db.listDueRecurringTransactions).mockResolvedValue([{ id: 7, lineUserId: "U1", lineChatId: "U1", transactionType: "expense", amount: "1200.00", category: "ค่าสาธารณูปโภค", note: "ค่าไฟ", recurrenceType: "day", recurrenceInterval: 1, nextRunAt: dueAt }] as never);
    vi.mocked(db.claimRecurringTransactionRun).mockResolvedValue(31);
    vi.mocked(db.createTransaction).mockResolvedValue(99);
    vi.mocked(db.nextRecurringRunAt).mockReturnValue(nextAt);

    await expect(deliverDueRecurringTransactions(new Date("2026-09-01T00:00:00.000Z"))).resolves.toEqual({ created: 1, skipped: 0, failed: 0 });
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ source: "recurring", occurredAt: dueAt, amount: 1200 }));
    expect(db.completeRecurringTransactionRun).toHaveBeenCalledWith({ runId: 31, recurringTransactionId: 7, transactionId: 99, nextRunAt: nextAt });
  });

  it("skips a due rule whose scheduled period is already claimed", async () => {
    vi.mocked(db.listDueRecurringTransactions).mockResolvedValue([{ id: 7, nextRunAt: new Date("2026-08-31T23:00:00.000Z") }] as never);
    vi.mocked(db.claimRecurringTransactionRun).mockResolvedValue(undefined);

    await expect(deliverDueRecurringTransactions()).resolves.toEqual({ created: 0, skipped: 1, failed: 0 });
    expect(db.createTransaction).not.toHaveBeenCalled();
  });

});
