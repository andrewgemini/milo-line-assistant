import { describe, expect, it } from "vitest";
import { parseMiloCommand } from "./commandParser";

describe("Milo Rich Menu commands", () => {
  const cases: Array<[string, string]> = [
    ["หน้าหลัก", "dashboardGuide"],
    ["วิเคราะห์", "aiSummary"],
    ["จดบันทึก", "recordGuide"],
    ["กระเป๋าเงิน", "budgetOverview"],
    ["ตั้งค่า", "settingGuide"],
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
    ["ใบเสร็จ", "recordGuide"],
    ["สแกนใบเสร็จ", "recordGuide"],
    ["บันทึกเสียง", "recordGuide"],
    ["วันนี้มีอะไร", "todayOverview"],
    ["สรุปการเงิน สัปดาห์นี้", "financeReport"],
    ["สรุปการเงิน เดือนนี้", "financeReport"],
    ["รายการเตือน", "reminderList"],
    ["ดูปฏิทิน", "calendarList"],
    ["ดูงาน", "todoList"],
    ["บิลรอจ่าย", "pendingBillList"],
    ["รายการประจำ", "recurringList"],
    ["ส่งออก xlsx", "exportFinance"],
    ["เอกสารเดือนนี้", "documentPacket"],
    ["คลังไฟล์", "vaultStatus"],
    ["ผู้ช่วยกลุ่ม", "groupGuide"],
  ];

  for (const [text, expectedType] of cases) {
    it(`parses ${text}`, () => expect(parseMiloCommand(text).type).toBe(expectedType));
  }
});
