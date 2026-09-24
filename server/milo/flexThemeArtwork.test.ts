import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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

  it("themes remaining conversational result commands consistently", () => {
    expect(flexThemeForCommand({ type: "reminderCancel", id: 7 })).toBe("utility");
    expect(flexThemeForCommand({ type: "calendarCancel", id: 8 })).toBe("utility");
    expect(flexThemeForCommand({ type: "captureCancel" })).toBe("utility");
    expect(flexThemeForCommand({ type: "transactionSearch", query: "กาแฟ" })).toBe("transactions");
    expect(flexThemeForCommand({ type: "transactionDelete", id: 9 })).toBe("transactions");
    expect(flexThemeForCommand({ type: "transactionUpdate", id: 10, amount: 99 })).toBe("transactions");
    expect(flexThemeForCommand({ type: "budget", category: "อาหาร", amount: 5000 })).toBe("analysis-budget");
    expect(flexThemeForCommand({ type: "budgetCycleStart", day: 14 })).toBe("analysis-budget");
    expect(flexThemeForCommand({ type: "openingBalance", amount: 1000 })).toBe("analysis-budget");
    expect(flexThemeForCommand({ type: "categoryAdd", name: "กาแฟ", transactionType: "expense" })).toBe("analysis-budget");
    expect(flexThemeForCommand({ type: "imageEdit", field: "amount", value: 80 })).toBe("utility");
    expect(flexThemeForCommand({ type: "imageConfirm" })).toBe("utility");
    expect(flexThemeForCommand({ type: "pdfConfirm" })).toBe("utility");
    expect(flexThemeForCommand({ type: "voiceConfirm" })).toBe("utility");
    expect(flexThemeForCommand({ type: "voiceEditPrompt" })).toBe("utility");
    expect(flexThemeForCommand({ type: "invalid", message: "ข้อมูลไม่ครบ" })).toBe("settings-help");
    expect(flexThemeForCommand({ type: "unknown" })).toBeUndefined();
  });

  it("builds public URLs for hero and full screen variants", () => {
    expect(miloFlexThemeImageUrl("transactions")).toBe("https://milo-line-assistant.onrender.com/milo-flex/heroes/transactions.png");
    expect(miloFlexThemeImageUrl("transactions", "screen")).toBe("https://milo-line-assistant.onrender.com/milo-flex/screens/transactions.png");
  });

  it("covers every deployed rich-menu action with the new Milo theme family", () => {
    const config = JSON.parse(readFileSync("shared/richmenu.json", "utf8")) as {
      areas: Array<{ action: { label: string; text: string } }>;
    };
    const expected: Record<string, string> = {
      "จดบันทึก": "menu",
      "สแกนใบเสร็จ": "menu",
      "บันทึกเสียง": "menu",
      "วันนี้": "summary-day",
      "สัปดาห์นี้": "summary-period",
      "เดือนนี้": "summary-period",
      "วิเคราะห์": "analysis-budget",
      "งบประมาณ": "analysis-budget",
      "รายการ": "transactions",
      "หมวดหมู่": "analysis-budget",
      "เตือน": "utility",
      "ปฏิทิน": "utility",
      "งาน": "utility",
      "บิลรอจ่าย": "utility",
      "รายการประจำ": "utility",
      "ส่งออก": "utility",
      "เอกสาร": "utility",
      "คลังไฟล์": "utility",
      "ผู้ช่วยกลุ่ม": "utility",
      "เมนูเพิ่ม": "settings-help",
    };
    expect(config.areas).toHaveLength(20);
    for (const area of config.areas) {
      const command = parseMiloCommand(area.action.text, new Date("2026-09-24T12:00:00Z"));
      expect(flexThemeForCommand(command), area.action.label).toBe(expected[area.action.label]);
    }
  });
});
