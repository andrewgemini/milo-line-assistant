import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", async () => {
  const actual = await vi.importActual<typeof import("../db")>("../db");
  return { ...actual, linkLineUser: vi.fn(), writeAuditLog: vi.fn() };
});

import * as db from "../db";
import { appRouter } from "../routers";

const validLineUserId = `U${"a".repeat(32)}`;
const caller = () => appRouter.createCaller({ user: { id: 12, openId: "owner", name: "Owner", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} }, res: {} } as never);

describe("milo.linkLineAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.linkLineUser).mockResolvedValue(undefined);
    vi.mocked(db.writeAuditLog).mockResolvedValue(undefined);
  });

  it("accepts and trims a valid LINE User ID before linking", async () => {
    await expect(caller().milo.linkLineAccount({ lineUserId: ` ${validLineUserId} ` })).resolves.toEqual({ success: true });
    expect(db.linkLineUser).toHaveBeenCalledWith(12, validLineUserId);
  });

  it("does not wait for audit logging after the account link is saved", async () => {
    vi.mocked(db.writeAuditLog).mockImplementation(() => new Promise(() => undefined));
    await expect(Promise.race([
      caller().milo.linkLineAccount({ lineUserId: validLineUserId }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("link mutation timed out")), 200)),
    ])).resolves.toEqual({ success: true });
    expect(db.linkLineUser).toHaveBeenCalledWith(12, validLineUserId);
    expect(db.writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it("swallows audit logging failures after the account link is saved", async () => {
    vi.mocked(db.writeAuditLog).mockRejectedValue(new Error("audit unavailable"));
    await expect(caller().milo.linkLineAccount({ lineUserId: validLineUserId })).resolves.toEqual({ success: true });
    expect(db.linkLineUser).toHaveBeenCalledWith(12, validLineUserId);
    expect(db.writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed LINE User ID before it can be saved", async () => {
    await expect(caller().milo.linkLineAccount({ lineUserId: "ใจด" })).rejects.toBeDefined();
    expect(db.linkLineUser).not.toHaveBeenCalled();
  });
});
