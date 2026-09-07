import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", async () => {
  const actual = await vi.importActual<typeof import("../db")>("../db");
  return { ...actual, linkLineUser: vi.fn() };
});

import * as db from "../db";
import { appRouter } from "../routers";

const validLineUserId = `U${"a".repeat(32)}`;
const caller = () => appRouter.createCaller({ user: { id: 12, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} }, res: {} } as never);

describe("milo.linkLineAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.linkLineUser).mockResolvedValue(undefined);
  });

  it("accepts and trims a valid LINE User ID before linking", async () => {
    await expect(caller().milo.linkLineAccount({ lineUserId: ` ${validLineUserId} ` })).resolves.toEqual({ success: true });
    expect(db.linkLineUser).toHaveBeenCalledWith(12, validLineUserId);
  });

  it("rejects a malformed LINE User ID before it can be saved", async () => {
    await expect(caller().milo.linkLineAccount({ lineUserId: "ใจด" })).rejects.toBeDefined();
    expect(db.linkLineUser).not.toHaveBeenCalled();
  });
});
