import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { parseMiloCommand } from "./commandParser";
import { flexThemeForCommand, MILO_FLEX_THEME_ARTWORK, miloFlexThemeImageUrl } from "./flexThemeArtwork";

describe("Milo Flex Theme artwork", () => {
  it("ships full-screen and hero assets for all nine feature families", () => {
    expect(Object.keys(MILO_FLEX_THEME_ARTWORK)).toHaveLength(9);
    for (const entry of Object.values(MILO_FLEX_THEME_ARTWORK)) {
      expect(existsSync("client/public/milo-flex/screens/" + entry.file)).toBe(true);
      expect(existsSync("client/public/milo-flex/heroes/" + entry.file)).toBe(true);
    }
  });

  it.each([
    ["สวัสดีไมโล", "home"],
    ["จดบันทึก", "menu"],
    ["สรุปวันนี้", "summary-day"],
    ["สรุปสัปดาห์นี้", "summary-period"],
    ["สรุปเดือนนี้", "summary-period"],
    ["วิเคราะห์", "analysis-budget"],
    ["งบประมาณ", "analysis-budget"],
    ["หมวดหมู่", "analysis-budget"],
    ["รายการ", "transactions"],
    ["รายการเตือน", "utility"],
    ["ตั้งค่า", "settings-help"],
    ["วิธีใช้งาน", "settings-help"],
  ] as const)("%s maps to %s", (text, expected) => {
    expect(flexThemeForCommand(parseMiloCommand(text))).toBe(expected);
  });

  it("builds public URLs for hero and full screen variants", () => {
    expect(miloFlexThemeImageUrl("transactions")).toBe("https://milo-line-assistant.onrender.com/milo-flex/heroes/transactions.png");
    expect(miloFlexThemeImageUrl("transactions", "screen")).toBe("https://milo-line-assistant.onrender.com/milo-flex/screens/transactions.png");
  });
});
