import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getOwnerLinkedLineUser: vi.fn(),
  getOrCreatePersonalFinanceAccount: vi.fn(),
  claimFinanceDigestDelivery: vi.fn(),
  financeReportRange: vi.fn(),
  finishFinanceDigestDelivery: vi.fn(),
  saveAutomationSetting: vi.fn(),
  writeAuditLog: vi.fn(),
}));
vi.mock("./line", () => ({
  financeReportCardText: vi.fn(() => "summary"),
  pushFinanceReportCard: vi.fn(),
  pushText: vi.fn(),
}));

import * as db from "../db";
import { financeDigestWindow, deliverFinanceDigest } from "./financeDigest";
import { pushFinanceReportCard, pushText } from "./line";

describe("finance digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getOrCreatePersonalFinanceAccount).mockResolvedValue({ id: 11 } as never);
  });

  it("uses completed Bangkok-local daily and weekly windows", () => {
    const mondayMorning = new Date("2026-08-31T01:00:00.000Z");
    expect(financeDigestWindow("daily", mondayMorning)).toMatchObject({ periodKey: "2026-08-30", start: new Date("2026-08-29T17:00:00.000Z"), end: new Date("2026-08-30T16:59:59.999Z"), period: "day" });
    expect(financeDigestWindow("weekly", mondayMorning)).toMatchObject({ periodKey: "2026-08-24_to_2026-08-30", start: new Date("2026-08-23T17:00:00.000Z"), end: new Date("2026-08-30T16:59:59.999Z"), period: "week" });
  });

  it("pushes a real report once and writes delivery plus audit records", async () => {
    vi.mocked(db.getOwnerLinkedLineUser).mockResolvedValue("U0123456789abcdef0123456789abcdef");
    vi.mocked(db.claimFinanceDigestDelivery).mockResolvedValue(18);
    vi.mocked(db.financeReportRange).mockResolvedValue({ income: 1200, expense: 300, balance: 900, categories: { อาหาร: 300 } } as never);
    vi.mocked(pushFinanceReportCard).mockResolvedValue(new Response());

    await expect(deliverFinanceDigest({ settingKey: "finance-digest-daily", taskUid: "task-1", digestType: "daily", now: new Date("2026-08-31T01:00:00.000Z") })).resolves.toMatchObject({ delivered: true, deliveryId: 18, periodKey: "2026-08-30" });

    expect(pushFinanceReportCard).toHaveBeenCalledWith("U0123456789abcdef0123456789abcdef", expect.objectContaining({ title: "สรุปการเงินเมื่อวานนี้", income: 1200, expense: 300, categories: { อาหาร: 300 } }));
    expect(db.financeReportRange).toHaveBeenCalledWith("U0123456789abcdef0123456789abcdef", new Date("2026-08-29T17:00:00.000Z"), new Date("2026-08-30T16:59:59.999Z"), 11);
    expect(db.finishFinanceDigestDelivery).toHaveBeenCalledWith(18, "sent");
    expect(db.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "finance_digest.sent", entityId: 18 }));
  });

  it("does not send a duplicate period and falls back to text if push Flex fails", async () => {
    vi.mocked(db.getOwnerLinkedLineUser).mockResolvedValue("U0123456789abcdef0123456789abcdef");
    vi.mocked(db.claimFinanceDigestDelivery).mockResolvedValueOnce(undefined).mockResolvedValueOnce(19);
    await expect(deliverFinanceDigest({ settingKey: "finance-digest-weekly", taskUid: "task-2", digestType: "weekly", now: new Date("2026-08-31T01:00:00.000Z") })).resolves.toMatchObject({ skipped: "already-delivered" });
    expect(pushFinanceReportCard).not.toHaveBeenCalled();

    vi.mocked(db.financeReportRange).mockResolvedValue({ income: 0, expense: 80, balance: -80, categories: { อาหาร: 80 } } as never);
    vi.mocked(pushFinanceReportCard).mockRejectedValue(new Error("Flex rejected"));
    vi.mocked(pushText).mockResolvedValue(new Response());
    await expect(deliverFinanceDigest({ settingKey: "finance-digest-weekly", taskUid: "task-2", digestType: "weekly", now: new Date("2026-08-31T01:00:00.000Z") })).resolves.toMatchObject({ delivered: true, deliveryId: 19 });
    expect(pushText).toHaveBeenCalledWith("U0123456789abcdef0123456789abcdef", "summary");
  });
});
