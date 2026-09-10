import { describe, expect, it } from "vitest";
import { parseMiloCommand } from "./commandParser";

describe("Milo Rich Menu commands", () => {
  const cases: Array<[string, string]> = [
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
