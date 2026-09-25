import { describe, expect, it } from "vitest";
import { webhookEvents } from "../../drizzle/schema";

describe("webhook status compatibility", () => {
  it("keeps both the production pending state and the newer received state recoverable", () => {
    expect(webhookEvents.status.enumValues).toEqual([
      "pending",
      "received",
      "processed",
      "ignored",
      "failed",
    ]);
  });
});
