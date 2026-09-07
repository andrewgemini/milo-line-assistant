import { describe, expect, it } from "vitest";
import { initialUserRole, userProfileUpdateValues } from "./db";

describe("user role synchronization", () => {
  it("uses an explicit role when creating a user", () => {
    expect(initialUserRole({ openId: "owner-open-id", role: "admin" })).toBe("admin");
  });

  it("does not include role in a repeat-login profile update", () => {
    const update = userProfileUpdateValues({
      openId: "owner-open-id",
      role: "admin",
      name: "เจ้าของไมโล",
      email: null,
      loginMethod: "email",
      lastSignedIn: new Date("2026-08-25T00:00:00.000Z"),
    });
    expect(update).not.toHaveProperty("role");
    expect(update.name).toBe("เจ้าของไมโล");
  });
});
