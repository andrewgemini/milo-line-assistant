import { describe, expect, it } from "vitest";
import { parseMiloCommand } from "./commandParser";

describe("Milo Rich Menu commands", () => {
  const cases: Array<[string, string]> = [
    ["\u0e2b\u0e19\u0e49\u0e32\u0e2b\u0e25\u0e31\u0e01", "dashboardGuide"],
    ["\u0e27\u0e34\u0e40\u0e04\u0e23\u0e32\u0e30\u0e2b\u0e4c", "aiSummary"],
    ["\u0e08\u0e14\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01", "recordGuide"],
    ["\u0e01\u0e23\u0e30\u0e40\u0e1b\u0e4b\u0e32\u0e40\u0e07\u0e34\u0e19", "budgetOverview"],
    ["\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32", "settingGuide"],
    ["จดบันทึก", "recordGuide"],
    ["สรุป", "financeReport"],
    ["วิเคราะห์", "aiSummary"],
    ["งบประมาณ", "budgetOverview"],
    ["รายการ", "transactionList"],
    ["หมวดหมู่", "categoryList"],
    ["เมนูไมโล", "help"],
    ["คำสั่ง", "help"],
    ["วิธีใช้งาน", "help"],
    ["สวัสดีไมโล", "greeting"],
  ];
  for (const [text, expectedType] of cases) {
    it(`parses ${text}`, () => expect(parseMiloCommand(text).type).toBe(expectedType));
  }
});
