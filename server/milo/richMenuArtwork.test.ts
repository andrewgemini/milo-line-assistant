import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { RICH_MENU_ARTWORK } from "./richMenuArtwork";
import { parseMiloCommand } from "./commandParser";
describe("rich menu artwork and advertised commands", () => {

  it("maps every deployed rich-menu action to a supported command", () => {
    const config=JSON.parse(readFileSync("shared/richmenu.json","utf8"));
    expect(config.areas).toHaveLength(20);
    for(const area of config.areas) {
      expect(area.action.type).toBe("message");
      const command = parseMiloCommand(area.action.text);
      expect(command.type).not.toBe("invalid");

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

});
