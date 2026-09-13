import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  listDueReminders: vi.fn(),
  markReminderDelivered: vi.fn(),
  markReminderFailed: vi.fn(),
  createReminderDeliveryAttempt: vi.fn(),
  finishReminderDeliveryAttempt: vi.fn(),
  isAdminLinkedLineUser: vi.fn(),
}));
vi.mock("./line", () => ({ pushText: vi.fn() }));

import * as db from "../db";
import { pushText } from "./line";
import { deliverDueReminders } from "./reminderDelivery";

describe("reminder delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MILO_PRO_MAX_LINE_USER_IDS = "U1,U2";
    vi.mocked(db.isAdminLinkedLineUser).mockResolvedValue(false);
  });

  it("pushes due reminders and keeps one failed delivery available for a retry", async () => {
    const first = { id: 1, lineChatId: "U1", createdByLineUserId: "U1", title: "ประชุม", detail: "ห้อง A" };
    const second = { id: 2, lineChatId: "U2", createdByLineUserId: "U2", title: "ดื่มน้ำ", detail: null };
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

  it("does not deliver a previously-created reminder after the user is downgraded to Free", async () => {
    delete process.env.MILO_PRO_MAX_LINE_USER_IDS;
    delete process.env.MILO_PRO_LINE_USER_IDS;
    const reminder = { id: 3, lineChatId: "Ufree", createdByLineUserId: "Ufree", title: "จดรายจ่าย", detail: null };
    vi.mocked(db.listDueReminders).mockResolvedValue([reminder] as never);

    await expect(deliverDueReminders({ runner: "heartbeat", taskUid: "task-free" })).resolves.toEqual({ sent: 0, failed: 0, checked: 1 });
    expect(pushText).not.toHaveBeenCalled();
    expect(db.createReminderDeliveryAttempt).not.toHaveBeenCalled();
    expect(db.markReminderDelivered).not.toHaveBeenCalled();
    expect(db.markReminderFailed).not.toHaveBeenCalled();
  });
});
