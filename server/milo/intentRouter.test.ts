import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classifyMiloIntent: vi.fn(),
}));

vi.mock("../_core/typeSafe", () => ({
  classifyMiloIntent: mocks.classifyMiloIntent,
  jevModel: (env: NodeJS.ProcessEnv = process.env) => env.JEV_MODEL || "jev-latest",
  systemOneConfigured: (env: NodeJS.ProcessEnv = process.env) =>
    Boolean(env.OPENTHAI_SYSTEMONE_URL || env.OPENTHAI_SYSTEMONE_API_KEY || env.IAPP_API_KEY || env.JEV_API_KEY || env.TYPESAFE_API_KEY),
}));

import { deterministicIntentDecision, jevRouterMinConfidence, routeMiloIntent } from "./intentRouter";

describe("Milo SystemOne-first intent router", () => {
  beforeEach(() => {
    mocks.classifyMiloIntent.mockReset();
  });

  it("uses a high-confidence OpenThai decision before deterministic routing", async () => {
    mocks.classifyMiloIntent.mockResolvedValueOnce({
      intent: "transaction",
      confidence: 0.94,
      requiresDatabase: true,
      requiresLLM: false,
      requiresConfirmation: true,
      riskLevel: "medium",
      model: "openthai-systemone",
      provider: "openthai",
    });

    const result = await routeMiloIntent("ช่วยจดกาแฟเมื่อกี้หน่อย", {
      env: { IAPP_API_KEY: "configured" },
      classify: mocks.classifyMiloIntent,
    });

    expect(mocks.classifyMiloIntent).toHaveBeenCalledWith("ช่วยจดกาแฟเมื่อกี้หน่อย", expect.objectContaining({ IAPP_API_KEY: "configured" }));
    expect(result).toMatchObject({ intent: "transaction", source: "openthai", confidence: 0.94, requiresDatabase: true });
  });

  it("keeps JEV as a compatible SystemOne provider", async () => {
    mocks.classifyMiloIntent.mockResolvedValueOnce({
      intent: "reminder",
      confidence: 0.91,
      requiresDatabase: true,
      requiresLLM: false,
      requiresConfirmation: true,
      riskLevel: "medium",
      model: "jev-latest",
      provider: "jev",
    });

    const result = await routeMiloIntent("พรุ่งนี้เตือนโทรหาหมอ", {
      env: { JEV_API_KEY: "configured" },
      classify: mocks.classifyMiloIntent,
    });

    expect(result).toMatchObject({ intent: "reminder", source: "jev", confidence: 0.91 });
  });

  it("falls back to the deterministic parser when SystemOne confidence is below threshold", async () => {
    mocks.classifyMiloIntent.mockResolvedValueOnce({
      intent: "unknown",
      confidence: 0.3,
      requiresDatabase: false,
      requiresLLM: false,
      requiresConfirmation: false,
      riskLevel: "low",
      model: "openthai-systemone",
      provider: "openthai",
    });

    const result = await routeMiloIntent("เตือนประชุมพรุ่งนี้ 10:00", {
      env: { IAPP_API_KEY: "configured", MILO_JEV_ROUTER_MIN_CONFIDENCE: "0.72" },
      classify: mocks.classifyMiloIntent,
    });

    expect(result).toMatchObject({ intent: "reminder", source: "deterministic", fallbackReason: "low_confidence" });
  });

  it("falls back safely when no SystemOne provider is configured", async () => {
    const result = await routeMiloIntent("กินกาแฟ 80", { env: {} });
    expect(mocks.classifyMiloIntent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ intent: "transaction", source: "deterministic", fallbackReason: "systemone_unavailable" });
  });

  it("falls back safely when all configured SystemOne providers fail", async () => {
    mocks.classifyMiloIntent.mockRejectedValueOnce(new Error("timeout"));
    const result = await routeMiloIntent("สรุปเดือนนี้", {
      env: { IAPP_API_KEY: "configured", JEV_API_KEY: "configured" },
      classify: mocks.classifyMiloIntent,
    });
    expect(result).toMatchObject({ intent: "finance_summary", source: "deterministic", fallbackReason: "systemone_error" });
  });

  it("maps deterministic commands to workflow flags without needing an LLM", () => {
    expect(deterministicIntentDecision("ตั้งงบ อาหาร 5000", {})).toMatchObject({
      intent: "budget",
      requiresDatabase: true,
      requiresLLM: false,
      source: "deterministic",
    });
    expect(deterministicIntentDecision("วิเคราะห์", {})).toMatchObject({
      intent: "financial_analysis",
      requiresDatabase: true,
      requiresLLM: true,
    });
  });

  it("bounds an invalid confidence configuration to the safe default", () => {
    expect(jevRouterMinConfidence({ MILO_JEV_ROUTER_MIN_CONFIDENCE: "0.1" })).toBe(0.72);
    expect(jevRouterMinConfidence({ MILO_JEV_ROUTER_MIN_CONFIDENCE: "0.85" })).toBe(0.85);
  });
});
