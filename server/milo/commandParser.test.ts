import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMiloCommand } from "./commandParser";
import { verifyLineSignature } from "./line";

describe("Milo command parser", () => {
  const now = new Date("2026-08-22T01:00:00.000Z");
  it("creates a one-time reminder from Thai natural language", () => {
    const result = parseMiloCommand("เตือนประชุมทีมพรุ่งนี้ 10:30", now); expect(result.type).toBe("reminder"); if (result.type !== "reminder") return;
    expect(result.data.title).toContain("ประชุมทีม"); expect(result.data.recurrenceType).toBe("once"); expect(result.data.nextRunAt.toISOString()).toBe("2026-08-23T03:30:00.000Z");
  });
  it("interprets dotted clock time from LINE in Asia/Bangkok and removes it from the title", () => {
    const result = parseMiloCommand("เตือนประชุม 17.25", new Date("2026-08-26T10:21:00.000Z")); expect(result.type).toBe("reminder"); if (result.type !== "reminder") return;
    expect(result.data.title).toBe("ประชุม"); expect(result.data.nextRunAt.toISOString()).toBe("2026-08-26T10:25:00.000Z");
  });
  it("recognizes a recurring every-N-minutes reminder", () => { const result = parseMiloCommand("เตือนดื่มน้ำทุก 30 นาที", now); expect(result.type).toBe("reminder"); if (result.type !== "reminder") return; expect(result.data.recurrenceType).toBe("minute"); expect(result.data.recurrenceInterval).toBe(30); });
  it("records an expense intent and infers a basic category", () => expect(parseMiloCommand("จ่ายกาแฟ 65 บาท", now)).toEqual({ type: "expense", amount: 65, category: "อาหาร", note: "กาแฟ" }));
  it("accepts natural Thai expense phrases such as eating and shopping", () => {
    expect(parseMiloCommand("กินข้าว 100 บาท", now)).toEqual({ type: "expense", amount: 100, category: "อาหาร", note: "กินข้าว" });
    expect(parseMiloCommand("ซื้อของใช้ 350 บาท", now)).toEqual({ type: "expense", amount: 350, category: "ช้อปปิ้ง", note: "ซื้อของใช้" });
    expect(parseMiloCommand("เติมน้ำมัน 800 บาท", now)).toEqual({ type: "expense", amount: 800, category: "เดินทาง", note: "เติมน้ำมัน" });
  });
  it("accepts natural Thai income phrases without weakening unknown-message handling", () => {
    expect(parseMiloCommand("เงินเดือนเข้า 45000 บาท", now)).toEqual({ type: "income", amount: 45000, category: "เงินเดือน", note: "เงินเดือนเข้า" });
    expect(parseMiloCommand("รับเงินจากลูกค้า 2500 บาท", now)).toEqual({ type: "income", amount: 2500, category: "ขายสินค้า/บริการ", note: "เงินจากลูกค้า" });
    expect(parseMiloCommand("เรื่องทั่วไป 100 บาท", now)).toEqual({ type: "unknown" });
  });
  it("assigns standard income and expense categories from Thai natural language", () => {
    expect(parseMiloCommand("รับเงินเดือน 45000", now)).toEqual({ type: "income", amount: 45000, category: "เงินเดือน", note: "เงินเดือน" }); expect(parseMiloCommand("รับค่าจ้างฟรีแลนซ์ 5000", now)).toEqual({ type: "income", amount: 5000, category: "งานอิสระ", note: "ค่าจ้างฟรีแลนซ์" });
    expect(parseMiloCommand("จ่ายค่าไฟ 1200", now)).toEqual({ type: "expense", amount: 1200, category: "ค่าสาธารณูปโภค", note: "ค่าไฟ" }); expect(parseMiloCommand("จ่ายค่าห้อง 8000", now)).toEqual({ type: "expense", amount: 8000, category: "ที่อยู่อาศัย", note: "ค่าห้อง" });
  });
  it("recognizes note, todo, vault text, and search commands", () => {
    expect(parseMiloCommand("โน้ต รหัส Wi‑Fi ห้องประชุม", now)).toEqual({ type: "note", title: "รหัส Wi‑Fi ห้องประชุม", content: "รหัส Wi‑Fi ห้องประชุม" }); expect(parseMiloCommand("งาน ส่งสรุปรายสัปดาห์", now)).toEqual({ type: "todo", title: "ส่งสรุปรายสัปดาห์" });
    expect(parseMiloCommand("เก็บ ข้อความสำคัญ", now)).toMatchObject({ type: "vault", title: "ข้อความสำคัญ", itemType: "text" }); expect(parseMiloCommand("ค้นหา ใบเสร็จ", now)).toEqual({ type: "search", query: "ใบเสร็จ" });
  });
  it("recognizes the help command used to discover available workflows", () => expect(parseMiloCommand("ช่วย", now)).toEqual({ type: "help" }));
  it("recognizes a tagged link and a group mention instruction", () => { expect(parseMiloCommand("เก็บ https://example.com/brief #งาน #สำคัญ", now)).toMatchObject({ type: "vault", itemType: "link", tagsText: "#งาน #สำคัญ" }); expect(parseMiloCommand("แจ้งส่งงานด้วยถึง @สมชาย", now)).toEqual({ type: "mention", message: "ส่งงานด้วย", memberName: "สมชาย" }); });
  it("returns an actionable error for an incomplete budget command", () => expect(parseMiloCommand("ตั้งงบ อาหาร", now)).toEqual({ type: "invalid", message: "รูปแบบงบประมาณ: ตั้งงบ อาหาร 5000 บาท" }));
  it("validates category commands and supports add, remove, and list", () => {
    expect(parseMiloCommand("เพิ่มหมวด", now)).toEqual({ type: "invalid", message: "กรุณาระบุชื่อหมวด เช่น เพิ่มหมวดรายจ่าย เดินทาง" }); expect(parseMiloCommand("เพิ่มหมวด เดินทาง", now)).toEqual({ type: "categoryAdd", name: "เดินทาง", transactionType: "expense" }); expect(parseMiloCommand("เพิ่มหมวดรายรับ โบนัส", now)).toEqual({ type: "categoryAdd", name: "โบนัส", transactionType: "income" });
    expect(parseMiloCommand("ลบหมวด", now)).toEqual({ type: "invalid", message: "กรุณาระบุหมวดที่ต้องการลบ เช่น ลบหมวดรายจ่าย เดินทาง" }); expect(parseMiloCommand("ลบหมวดรายรับ โบนัส", now)).toEqual({ type: "categoryRemove", name: "โบนัส", transactionType: "income" }); expect(parseMiloCommand("ดูหมวด", now)).toEqual({ type: "categoryList", transactionType: undefined }); expect(parseMiloCommand("ดูหมวดรายรับ", now)).toEqual({ type: "categoryList", transactionType: "income" });
  });
  it("recognizes receipt and slip confirmation commands", () => { expect(parseMiloCommand("ยืนยันค่าใช้จ่าย", now)).toEqual({ type: "imageConfirm" }); expect(parseMiloCommand("บันทึกใบเสร็จ", now)).toEqual({ type: "imageConfirm" }); expect(parseMiloCommand("ยืนยันค่าใช้จ่าย วันที่ 27/08/2569", now)).toEqual({ type: "imageConfirm", dateText: "27/08/2569" }); });
  it("recognizes transaction search, update, delete, and financial report commands", () => {
    expect(parseMiloCommand("ค้นหารายการ กาแฟ", now)).toEqual({ type: "transactionSearch", query: "กาแฟ" }); expect(parseMiloCommand("ลบรายการ 42", now)).toEqual({ type: "transactionDelete", id: 42 }); expect(parseMiloCommand("แก้รายการ 42 เป็น 180", now)).toEqual({ type: "transactionUpdate", id: 42, amount: 180 }); expect(parseMiloCommand("สรุปเดือนนี้", now)).toEqual({ type: "financeReport", period: "month" }); expect(parseMiloCommand("สรุปการเงินวันนี้", now)).toEqual({ type: "financeReport", period: "day" }); expect(parseMiloCommand("ตั้งยอดเงินเริ่มต้น 5000 บาท", now)).toEqual({ type: "openingBalance", amount: 5000 });
  });
  it("recognizes a confirmation of the latest voice transcription", () => expect(parseMiloCommand("ยืนยันเสียง", now)).toEqual({ type: "voiceConfirm" }));
  it("recognizes requests to edit a pending voice transcript", () => { expect(parseMiloCommand("แก้ไขข้อความเสียง", now)).toEqual({ type: "voiceEditPrompt" }); expect(parseMiloCommand("แก้ไขเสียง จ่ายกาแฟ 65 บาท", now)).toEqual({ type: "voiceEdit", transcript: "จ่ายกาแฟ 65 บาท" }); });
  it("recognizes a popular-category action from the voice editing Quick Reply", () => expect(parseMiloCommand("เปลี่ยนหมวดเสียง เดินทาง", now)).toEqual({ type: "voiceCategoryChange", category: "เดินทาง" }));
  it("recognizes the AI business-summary command", () => expect(parseMiloCommand("สรุปธุรกิจ", now)).toEqual({ type: "aiSummary", period: "month" }));
  it("recognizes budget-cycle, export and PDF commands", () => {
    expect(parseMiloCommand("ตั้งวันเริ่มงบ 14", now)).toEqual({ type: "budgetCycleStart", day: 14 });
    expect(parseMiloCommand("ส่งออก CSV", now)).toEqual({ type: "exportFinance", format: "csv" });
    expect(parseMiloCommand("ส่งออก Excel", now)).toEqual({ type: "exportFinance", format: "xlsx" });
    expect(parseMiloCommand("ยืนยัน PDF", now)).toEqual({ type: "pdfConfirm" });
  });
  it("recognizes recurring transaction commands from LINE", () => {
    const monthly = parseMiloCommand("ตั้งจดอัตโนมัติ ค่าเช่า 5000 ทุกเดือนวันที่ 1 09:00", now);
    expect(monthly).toMatchObject({ type: "recurringCreate", transactionType: "expense", amount: 5000, recurrenceType: "month", recurrenceDayOfMonth: 1 });
    if (monthly.type === "recurringCreate") expect(monthly.nextRunAt.toISOString()).toBe("2026-09-01T02:00:00.000Z");
    expect(parseMiloCommand("รายการประจำ", now)).toEqual({ type: "recurringList" });
    expect(parseMiloCommand("พักรายการประจำ 12", now)).toEqual({ type: "recurringStatus", id: 12, status: "paused" });
    expect(parseMiloCommand("เปิดรายการประจำ 12", now)).toEqual({ type: "recurringStatus", id: 12, status: "active" });
  });
});

describe("LINE signature verification", () => {
  it("accepts an HMAC-SHA256 signature for the exact raw request body", () => { const body = Buffer.from('{"events":[]}'); const secret = "milo-test-secret"; const signature = createHmac("sha256", secret).update(body).digest("base64"); expect(verifyLineSignature(body, signature, secret)).toBe(true); expect(verifyLineSignature(body, "invalid", secret)).toBe(false); });
});
