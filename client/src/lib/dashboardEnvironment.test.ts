import { describe, expect, it } from "vitest";
import { isProductionSiteHostname } from "./dashboardEnvironment";

describe("dashboard environment", () => {
  it("allows the published Manus domain", () => {
    expect(isProductionSiteHostname("miloassist-suwp6bg2.manus.space")).toBe(true);
  });

  it("does not treat preview or local hosts as production", () => {
    expect(isProductionSiteHostname("3000-i5wzpmy7nribffa3plzdi-532f5123.us3.manus.computer")).toBe(false);
    expect(isProductionSiteHostname("localhost")).toBe(false);
    expect(isProductionSiteHostname("127.0.0.1")).toBe(false);
  });
});
