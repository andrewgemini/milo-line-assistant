import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { RICH_MENU_ARTWORK, artworkForCommand } from "./richMenuArtwork";
import { parseMiloCommand } from "./commandParser";
import { replyRichMenu } from "./line";
afterEach(() => vi.restoreAllMocks());
describe("rich menu artwork and advertised commands", () => {
  it.each([["จดบันทึก","record"],["สรุป","report-month"],["สรุปวันนี้","report-day"],["สรุปสัปดาห์นี้","report-week"],["สรุปเดือนนี้","report-month"],["สรุปปีนี้","report-year"],["วิเคราะห์","analysis"],["งบประมาณ","budget"],["รายการ","transactions"],["หมวดหมู่","categories"],["ตั้งค่า","settings"],["วิธีใช้งาน","help"],["สวัสดีไมโล","overview"]])("maps %s to %s", (text,key) => expect(artworkForCommand(parseMiloCommand(text))).toBe(key));
  it("maps every deployed rich-menu action to supported artwork", () => {
    const config=JSON.parse(readFileSync("shared/richmenu.json","utf8"));
    expect(config.areas).toHaveLength(9);
    for(const area of config.areas) {
      expect(area.action.type).toBe("message");
      expect(artworkForCommand(parseMiloCommand(area.action.text))).toBeDefined();
    }
  });
  it("ships previews below LINE's 1 MB limit", () => {
    for(const entry of Object.values(RICH_MENU_ARTWORK)) expect(statSync("client/public/richmenu/"+entry.file.replace(".png","-preview.jpg")).size).toBeLessThan(1000000);
  });
  it("ships all twelve supplied images", () => {
    expect(Object.keys(RICH_MENU_ARTWORK)).toHaveLength(12);
    for (const entry of Object.values(RICH_MENU_ARTWORK)) expect(existsSync("client/public/richmenu/"+entry.file)).toBe(true);
  });
  it.each([["กินกาแฟ 80","expense",80],["เติมน้ำมัน 500","expense",500],["เงินเดือน 35000","income",35000],["รับจากลูกค้า 2500","income",2500],["ซื้อของใช้ 350","expense",350]])("records artwork example %s", (text,type,amount) => expect(parseMiloCommand(String(text))).toMatchObject({type,amount}));
  it("parses monthly reminder time independently from calendar day", () => {
    const cmd = parseMiloCommand("เตือน จ่ายค่าเน็ต ทุกเดือนวันที่ 25 เวลา 09:00", new Date("2026-09-12T08:00:00Z"));
    expect(cmd).toMatchObject({type:"reminder",data:{recurrenceType:"month",recurrenceDayOfMonth:25,nextRunAt:new Date("2026-09-25T02:00:00Z")}});
  });
  it("sends one reply containing labeled artwork, real text and usable actions", async () => {
    const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response());
    await replyRichMenu("r","ยอดจริง 123 บาท","budget",{channelAccessToken:"test",channelSecret:"test"});
    const payload=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.messages).toHaveLength(3);
    expect(payload.messages[0].text).toContain("ตัวอย่าง");
    expect(payload.messages[1].originalContentUrl).toBe("https://milo-line-app.vercel.app/richmenu/budget.png");
    expect(payload.messages[2].text).toBe("ยอดจริง 123 บาท");
    expect(payload.messages[2].quickReply.items).toHaveLength(5);
  });
});
