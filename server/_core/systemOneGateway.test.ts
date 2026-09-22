import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyMiloIntent,
  openThaiSystemOneConfigured,
  openThaiSystemOneUrl,
  systemOneProviderOrder,
} from "./typeSafe";

describe("Milo OpenThai-SystemOne gateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the public iApp SystemOne endpoint with apikey auth", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.state.message).toBe("พรุ่งนี้ช่วยเตือนประชุม 9 โมง");
      expect(body.questions.intent.type).toBe("choice");
      expect(body.questions.intent.criteria.reminder).toContain("เตือน");
      expect(body.permutations).toBe(1);
      return new Response(JSON.stringify({
        model: "openthai-systemone",
        answers: {
          intent: { choice: "reminder", confidence: 0.96 },
          database: { choice: "yes", confidence: 0.9 },
          generation: { choice: "no", confidence: 0.9 },
          confirmation: { choice: "yes", confidence: 0.88 },
          risk: { choice: "medium", confidence: 0.86 },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await classifyMiloIntent("พรุ่งนี้ช่วยเตือนประชุม 9 โมง", {
      IAPP_API_KEY: "iapp_live_test",
      MILO_SYSTEMONE_PROVIDER_ORDER: "openthai,jev",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.iapp.co.th/v3/store/openthai/systemone");
    expect((init?.headers as Record<string, string>).apikey).toBe("iapp_live_test");
    expect(result).toMatchObject({
      intent: "reminder",
      confidence: 0.96,
      provider: "openthai",
      model: "openthai-systemone",
      requiresDatabase: true,
      requiresLLM: false,
      requiresConfirmation: true,
      riskLevel: "medium",
    });
  });

  it("allows a self-hosted OpenThai endpoint without an API key", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).apikey).toBeUndefined();
      return new Response(JSON.stringify({
        model: "openthai-local",
        answers: {
          intent: { choice: "vault", confidence: 0.9 },
          database: { choice: "yes", confidence: 0.9 },
          generation: { choice: "no", confidence: 0.9 },
          confirmation: { choice: "yes", confidence: 0.9 },
          risk: { choice: "medium", confidence: 0.9 },
        },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      OPENTHAI_SYSTEMONE_URL: "http://127.0.0.1:8000/v1/systemone",
      MILO_SYSTEMONE_PROVIDER_ORDER: "openthai",
    };
    expect(openThaiSystemOneConfigured(env)).toBe(true);
    expect(openThaiSystemOneUrl(env)).toBe("http://127.0.0.1:8000/v1/systemone");

    const result = await classifyMiloIntent("ค้นหาใบเสร็จเดือนที่แล้ว", env);
    expect(result).toMatchObject({ intent: "vault", provider: "openthai", model: "openthai-local" });
  });

  it("normalizes provider order and defaults OpenThai before JEV", () => {
    expect(systemOneProviderOrder({})).toEqual(["openthai", "jev"]);
    expect(systemOneProviderOrder({ MILO_SYSTEMONE_PROVIDER_ORDER: "jev,openthai,jev" })).toEqual(["jev", "openthai"]);
  });
});
