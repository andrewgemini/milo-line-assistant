import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", async () => {
  const actual = await vi.importActual<typeof import("../db")>("../db");
  return { ...actual, getLinkedLineUser: vi.fn(), deleteReminder: vi.fn() };
});

import * as db from "../db";
import { appRouter } from "../routers";

describe("milo.reminders.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getLinkedLineUser).mockResolvedValue("U-linked");
    vi.mocked(db.deleteReminder).mockResolvedValue(undefined);
  });

  it("deletes only the linked LINE user's selected reminder", async () => {
    const caller = appRouter.createCaller({ user: { id: 12, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} }, res: {} } as never);
    await expect(caller.milo.reminders.delete({ id: 42 })).resolves.toEqual({ success: true });
    expect(db.deleteReminder).toHaveBeenCalledWith(42, "U-linked");
  });
});
