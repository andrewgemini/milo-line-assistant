import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  listDueReminders: vi.fn(),
  markReminderDelivered: vi.fn(),
  markReminderFailed: vi.fn(),
  createReminderDeliveryAttempt: vi.fn(),
  finishReminderDeliveryAttempt: vi.fn(),
}));
vi.mock("./line", () => ({ pushText: vi.fn() }));

import * as db from "../db";
import { pushText } from "./line";
import { deliverDueReminders } from "./reminderDelivery";

describe("reminder delivery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pushes due reminders and keeps one failed delivery available for a retry", async () => {
    const first = { id: 1, lineChatId: "U1", title: "ประชุม", detail: "ห้อง A" };
    const second = { id: 2, lineChatId: "U2", title: "ดื่มน้ำ", detail: null };
    vi.mocked(db.listDueReminders).mockResolvedValue([first, second] as never);
    vi.mocked(db.createReminderDeliveryAttempt).mockResolvedValueOnce(11).mockResolvedValueOnce(12);
    vi.mocked(pushText).mockResolvedValue(new Response());
    vi.mocked(pushText).mockRejectedValueOnce(new Error("LINE unavailable"));

    await expect(deliverDueReminders({ runner: "heartbeat", taskUid: "task-1" })).resolves.toEqual({ sent: 1, failed: 1, checked: 2 });
    expect(db.createReminderDeliveryAttempt).toHaveBeenCalledWith({ reminderId: 1, runner: "heartbeat", taskUid: "task-1" });
    expect(db.markReminderFailed).toHaveBeenCalledWith(1);
    expect(db.finishReminderDeliveryAttempt).toHaveBeenCalledWith(11, "failed", "LINE unavailable");
    expect(db.markReminderDelivered).toHaveBeenCalledWith(second);
    expect(db.finishReminderDeliveryAttempt).toHaveBeenCalledWith(12, "sent");
  });
});
