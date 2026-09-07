import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./reminderDelivery", () => ({ deliverDueReminders: vi.fn() }));
import { deliverDueReminders } from "./reminderDelivery";
import { appRouter } from "../routers";

const adminContext = {
  user: { id: 1, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { headers: {} }, res: {},
} as never;

describe("milo.automation.runDueNow", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("allows an administrator to process due reminders immediately", async () => {
    vi.mocked(deliverDueReminders).mockResolvedValue({ sent: 1, checked: 1 });
    await expect(appRouter.createCaller(adminContext).milo.automation.runDueNow()).resolves.toEqual({ sent: 1, checked: 1 });
  });
});
