import { describe, expect, it } from "vitest";
import { hashAdminPassword, verifyAdminPassword } from "./adminPassword";

describe("admin password hashing", () => {
  it("hashes and verifies passwords without storing plaintext", async () => {
    const password = "A-strong-password-2026!";
    const encoded = await hashAdminPassword(password);
    expect(encoded).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(encoded).not.toContain(password);
    await expect(verifyAdminPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyAdminPassword("wrong-password", encoded)).resolves.toBe(false);
  });
});
