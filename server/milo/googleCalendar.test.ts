import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGoogleCalendarConnectUrl, googleCalendarRuntimeStatus } from "./googleCalendar";

afterEach(() => vi.unstubAllEnvs());

describe("Milo Google Calendar OAuth configuration", () => {
  it("accepts the Milo-prefixed OAuth environment and builds a short-lived signed connect URL", () => {
    vi.stubEnv("MILO_GOOGLE_CALENDAR_CLIENT_ID", "client-id");
    vi.stubEnv("MILO_GOOGLE_CALENDAR_CLIENT_SECRET", "client-secret");
    vi.stubEnv("MILO_GOOGLE_TOKEN_ENCRYPTION_KEY", "a-strong-test-secret");
    vi.stubEnv("MILO_PUBLIC_URL", "https://milo.example.com/");

    expect(googleCalendarRuntimeStatus()).toMatchObject({
      configured: true,
      hasClientId: true,
      hasClientSecret: true,
      hasTokenEncryptionKey: true,
      redirectUri: "https://milo.example.com/api/milo/google/calendar/callback",
    });

    const url = new URL(buildGoogleCalendarConnectUrl("U123")!);
    expect(url.origin + url.pathname).toBe("https://milo.example.com/api/milo/google/calendar/connect");
    expect(url.searchParams.get("lineUserId")).toBe("U123");
    expect(Number(url.searchParams.get("expires"))).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(url.searchParams.get("sig")).toBeTruthy();
    expect(url.toString()).not.toContain("client-secret");
    expect(url.toString()).not.toContain("a-strong-test-secret");
  });

  it("reports Calendar as unavailable and does not mint a connect URL when OAuth is incomplete", () => {
    vi.stubEnv("MILO_GOOGLE_CALENDAR_CLIENT_ID", "");
    vi.stubEnv("MILO_GOOGLE_CALENDAR_CLIENT_SECRET", "");
    vi.stubEnv("MILO_GOOGLE_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("LINE_CHANNEL_SECRET", "");
    expect(googleCalendarRuntimeStatus().configured).toBe(false);
    expect(buildGoogleCalendarConnectUrl("U123")).toBeUndefined();
  });
});
