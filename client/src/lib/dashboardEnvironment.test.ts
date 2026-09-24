import { describe, expect, it } from "vitest";
import { isProductionSiteHostname } from "./dashboardEnvironment";
import { buildLoginTarget } from "../const";

describe("dashboard environment", () => {
  it("allows the Render production domain", () => {
    expect(isProductionSiteHostname("milo-line-assistant.onrender.com")).toBe(true);
    expect(isProductionSiteHostname("milo-line-app.vercel.app")).toBe(false);
    expect(isProductionSiteHostname("miloassist-suwp6bg2.manus.space")).toBe(false);
  });

  it("does not treat preview or local hosts as production", () => {
    expect(isProductionSiteHostname("3000-i5wzpmy7nribffa3plzdi-532f5123.us3.manus.computer")).toBe(false);
    expect(isProductionSiteHostname("localhost")).toBe(false);
    expect(isProductionSiteHostname("127.0.0.1")).toBe(false);
  });

  it("falls back to the Milo admin login when external OAuth is not configured", () => {
    expect(buildLoginTarget("https://milo-line-assistant.onrender.com", "", "", "nonce-1")).toEqual({
      mode: "local-admin",
      url: "https://milo-line-assistant.onrender.com/dashboard",
    });
  });

  it("builds the external OAuth target only when portal and app id are configured", () => {
    const target = buildLoginTarget("https://milo-line-assistant.onrender.com", "https://oauth.example.com/", "milo-app", "nonce-2");
    expect(target.mode).toBe("external-oauth");
    const url = new URL(target.url);
    expect(url.origin + url.pathname).toBe("https://oauth.example.com/app-auth");
    expect(url.searchParams.get("appId")).toBe("milo-app");
    expect(url.searchParams.get("redirectUri")).toBe("https://milo-line-assistant.onrender.com/api/oauth/callback");
    expect(url.searchParams.get("type")).toBe("signIn");
  });
});
