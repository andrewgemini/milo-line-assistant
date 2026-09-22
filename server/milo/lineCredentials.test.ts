import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessageContent, mascotExpenseCopy, pushFinanceReportCard, replyFinanceReportCard, replyGreetingHome, replyPostSaveSummary, replyCalendarList, replyReminderList, replyTransactionList, replyPostSaveSummaryImage, replyVoiceCategoryChoices, replyVoiceProposal, replyVoiceProposalFallback } from "./line";

describe("LINE credentials", () => {
  afterEach(() => vi.restoreAllMocks());

  it("constructs the official bot-info request with the configured access token", async () => {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "milo-test-access-token";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ userId: "U0123456789abcdef0123456789abcdef" }), { status: 200 }));
    const response = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok).toBe(true);
    const data = (await response.json()) as { userId?: string };
    expect(data.userId).toBeTruthy();
  }, 20_000);

  it("sends the new Milo greeting artwork as exactly one image message", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await replyGreetingHome("reply-token", { channelSecret: "secret", channelAccessToken: "token" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { messages: Array<{ type: string; originalContentUrl?: string; previewImageUrl?: string; quickReply?: unknown }> };
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]).toMatchObject({
      type: "image",
      originalContentUrl: "https://milo-line-assistant.onrender.com/richmenu/greeting-home.png",
      previewImageUrl: "https://milo-line-assistant.onrender.com/richmenu/greeting-home.png",
    });
    expect(payload.messages[0]?.quickReply).toBeUndefined();
  });

  it("uses the LINE data API domain for message media rather than the Messaging API domain", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(Uint8Array.from([1, 2, 3])));
    await expect(getMessageContent("receipt-message", { channelSecret: "secret", channelAccessToken: "token" })).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith("https://api-data.line.me/v2/bot/message/receipt-message/content", expect.objectContaining({
      method: "GET", headers: { Authorization: "Bearer token" },
    }));
  });

  it("sends a Flex voice proposal with confirm and edit buttons in its footer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await replyVoiceProposal("reply-token", { transcript: "จ่ายค่าแท็กซี่ 120 บาท", transactionType: "expense", amount: 120, category: "เดินทาง", note: "ค่าแท็กซี่" }, { channelSecret: "secret", channelAccessToken: "token" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { messages: Array<{ type: string; contents: { hero: { type: string; url: string }; footer: { contents: Array<{ action: { text: string } }> } } }> };
    expect(payload.messages[0]?.type).toBe("flex");
    expect(payload.messages[0]?.contents.hero).toEqual(expect.objectContaining({ type: "image", url: "https://milo-line-assistant.onrender.com/milo-voice-proposal-cat.webp" }));
    expect(payload.messages[0]?.contents.hero.url).not.toContain("manus.space");
    expect(payload.messages[0]?.contents.footer.contents.map(item => item.action.text)).toEqual(["ยืนยันเสียง", "แก้ไขข้อความเสียง"]);
  });

  it("sends a text message with Quick Reply actions when a Flex reply cannot be delivered", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await replyVoiceProposalFallback("reply-token", { transcript: "จ่ายอาหาร 80 บาท", transactionType: "expense", amount: 80, category: "อาหาร" }, { channelSecret: "secret", channelAccessToken: "token" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { messages: Array<{ type: string; quickReply?: { items: Array<{ action: { text: string } }> } }> };
    expect(payload.messages[0]?.type).toBe("text");
    expect(payload.messages[0]?.quickReply?.items.map(item => item.action.text)).toEqual(["ยืนยันเสียง", "แก้ไขข้อความเสียง"]);
  });

  it("sends real daily totals and a daily-summary action after saving a transaction", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await replyPostSaveSummary("reply-token", { transactionType: "expense", amount: 80, category: "อาหาร", dailyIncome: 1000, dailyExpense: 280, dailyBalance: 720, occurredAt: new Date(2026, 8, 12, 17, 8), budgetSpent: 40, budgetLimit: 1000, budgetPercent: 4 }, { channelSecret: "secret", channelAccessToken: "token" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { messages: Array<{ contents: { body: { backgroundColor: string; contents: Array<{ backgroundColor?: string; contents?: Array<{ text?: string }> }> }; footer: { contents: Array<{ action: { text: string } }> } } }> };
    expect(String(init.body)).toContain("รายจ่าย  •  ค่าอาหาร");
    expect(String(init.body)).toContain("80 บาท");
    expect(String(init.body)).toContain("รายจ่าย 280 บาท");
    expect(payload.messages[0]?.contents.body.backgroundColor).toBe("#F2F0FF");
    expect(String(init.body)).toContain('"text":"✓"');
    expect(payload.messages[0]?.contents.body.contents[1]?.backgroundColor).toBe("#FFFEFB");
    expect(String(init.body)).toContain("save-complete.png");
    expect(String(init.body)).toContain("ลบรายการล่าสุด");
    expect(String(init.body)).toContain("ดูรายการ");
    expect(String(init.body)).toContain("สรุปวันนี้");
  });

  it("sends the post-save success as one image message only", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await replyPostSaveSummaryImage("reply-token", { transactionType: "expense", amount: 80, category: "อาหาร", note: "กาแฟ", dailyIncome: 0, dailyExpense: 80, dailyBalance: -80, occurredAt: new Date("2026-09-12T13:54:00.000Z"), budgetSpent: 1040, budgetLimit: 1000, budgetPercent: 104 }, { channelSecret: "secret", channelAccessToken: "token" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { messages: Array<{ type: string; originalContentUrl?: string; previewImageUrl?: string }> };
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]?.type).toBe("image");
    expect(payload.messages[0]?.originalContentUrl).toContain("/api/milo/save-result.png?");
    expect(payload.messages[0]?.originalContentUrl).toContain("item=%E0%B8%81%E0%B8%B2%E0%B9%81%E0%B8%9F");
    expect(payload.messages[0]?.originalContentUrl).toContain("amount=80");
    expect(payload.messages[0]?.originalContentUrl).toContain("render=glyph-v3");
    expect(payload.messages[0]?.previewImageUrl).toBe(payload.messages[0]?.originalContentUrl);
  });

  it("uses deterministic mascot microcopy for small, medium, and high expenses", () => {
    expect(mascotExpenseCopy("expense", 100)).toContain("รายการเล็ก");
    expect(mascotExpenseCopy("expense", 101)).toContain("เช็กยอดวันนี้");
    expect(mascotExpenseCopy("expense", 501)).toContain("บันทึกไว้แล้ว");
  });

  it("sends the dynamic summary as one image message only with period quick replies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await replyFinanceReportCard("reply-token", {
      period: "week", income: 0, expense: 615, balance: -615, transactionCount: 3,
      categories: { อาหาร: 565, ทั่วไป: 50 },
      rows: [{ transactionType: "expense", amount: 565, category: "อาหาร", note: "กินข้าว", occurredAt: new Date("2026-09-12T05:00:00.000Z") }],
    }, { channelSecret: "secret", channelAccessToken: "token" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { messages: Array<{ type: string; originalContentUrl?: string; text?: string; quickReply?: { items: Array<{ action: { text: string } }> } }> };
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]?.type).toBe("image");
    expect(payload.messages[0]?.originalContentUrl).toContain("/api/milo/finance-report.png?");
    expect(payload.messages[0]?.originalContentUrl).toContain("render=summary-v4");
    expect(payload.messages[0]?.originalContentUrl).not.toContain("report-week.png");
    expect(payload.messages[0]?.text).toBeUndefined();
    expect(payload.messages[0]?.quickReply?.items.map(item => item.action.text)).toEqual(["สรุปวันนี้", "สรุปสัปดาห์นี้", "สรุปเดือนนี้", "สรุปปีนี้"]);
  });

  it("pushes an automatic Milo finance card with its completed-period label and real values", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await pushFinanceReportCard("U0123456789abcdef0123456789abcdef", { period: "week", title: "สรุปการเงินสัปดาห์ที่ผ่านมา", subtitle: "1 – 7 สิงหาคม 2569", income: 1200, expense: 300, balance: 900, categories: { อาหาร: 300 } }, { channelSecret: "secret", channelAccessToken: "token" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(String(init.body)).toContain("สรุปการเงินสัปดาห์ที่ผ่านมา");
    expect(String(init.body)).toContain("MILO  •  FINANCE");
    expect(String(init.body)).toContain("1,200 บาท");
    expect(String(init.body)).toContain("อาหาร");
    expect(String(init.body)).toContain("milo-richmenu/summary.png");
  });

  it("offers popular categories as Quick Reply actions when editing a voice proposal", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await replyVoiceCategoryChoices("reply-token", { channelSecret: "secret", channelAccessToken: "token" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { messages: Array<{ quickReply: { items: Array<{ action: { text: string } }> } }> };
    expect(payload.messages[0]?.quickReply.items.map(item => item.action.text)).toContain("เปลี่ยนหมวดเสียง อาหาร");
  });

  it("renders list results with direct LINE action buttons", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await replyTransactionList("reply-token", [{ id: 7, title: "รายจ่าย 80 บาท", detail: "อาหาร" }], { channelSecret: "secret", channelAccessToken: "token" });
    await replyReminderList("reply-token", [{ id: 8, title: "ประชุม", detail: "18 ก.ย. 2569 10:00" }], { channelSecret: "secret", channelAccessToken: "token" });
    await replyCalendarList("reply-token", [{ id: 9, title: "นัดลูกค้า", detail: "19 ก.ย. 2569 14:00" }], { channelSecret: "secret", channelAccessToken: "token" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("ลบรายการ #7");
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain("ยกเลิกเตือน #8");
    expect(String(fetchMock.mock.calls[2]?.[1]?.body)).toContain("ยกเลิกนัด #9");
  });
});
