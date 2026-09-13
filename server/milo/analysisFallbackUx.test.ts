import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMiloCommand } from "./commandParser";
import { replyTextWithQuickReplies } from "./line";

describe("Milo analysis and fallback UX", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps the exact rich-menu วิเคราะห์ command to monthly analysis", () => {
    expect(parseMiloCommand("วิเคราะห์")).toEqual({ type: "aiSummary", period: "month" });
  });

  it("caps contextual fallback actions at three quick replies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await replyTextWithQuickReplies("reply-token", "ต้องการดูภาพรวมช่วงไหนครับ?", [
      { label: "สรุปวันนี้", text: "สรุปวันนี้" },
      { label: "สรุปเดือนนี้", text: "สรุปเดือนนี้" },
      { label: "วิเคราะห์", text: "วิเคราะห์" },
      { label: "เกินมา", text: "ช่วย" },
    ], { channelSecret: "secret", channelAccessToken: "token" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    expect(payload.messages[0].quickReply.items).toHaveLength(3);
    expect(payload.messages[0].quickReply.items.map((item: any) => item.action.text)).toEqual(["สรุปวันนี้", "สรุปเดือนนี้", "วิเคราะห์"]);
  });
});
