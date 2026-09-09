import { describe, expect, it } from "vitest";
import { parseMiloCommand } from "./commandParser";

const richMenuCommands = [
  ["จดบันทึก", "recordGuide"],
  ["สรุป", "financeReport"],
  ["วิเคราะห์", "aiSummary"],
  ["งบประมาณ", "budgetOverview"],
  ["รายการ", "transactionList"],
  ["หมวดหมู่", "categoryList"],
  ["วิธีใช้งาน", "help"],
  ["สวัสดีไมโล", "greeting"],
] as const;

describe("Milo LINE Rich Menu command contract", () => {
  it.each(richMenuCommands)("maps %s to %s", (text, expectedType) => {
    expect(parseMiloCommand(text).type).toBe(expectedType);
  });

  it("keeps the user-facing help aliases aligned with the Rich Menu", () => {
    for (const text of ["ช่วย", "คำสั่ง", "เมนู", "help", "วิธีใช้งาน"]) {
      expect(parseMiloCommand(text).type).toBe("help");
    }
  });

  it("accepts the exact Rich Menu labels with slash/spacing variants", () => {
    expect(parseMiloCommand("หมวด / งบ").type).toBe("budgetOverview");
    expect(parseMiloCommand("หมวด/งบ").type).toBe("budgetOverview");
    expect(parseMiloCommand("ประเภท").type).toBe("categoryList");
  });
});
