import { describe, expect, it } from "vitest";
import { analyzeOcrText, normalizeOcrText, withOcrDeadline } from "./ocrImageAnalysis";

describe("OCR slip parser", () => {
  it("recognizes the damaged OCR text from the photographed restaurant receipt", () => {
    const result = analyzeOcrText("โบเสร็จ\nทานหราน\nข่าวเหนีย\nน่าแข็่งแก้าว 2 4 00\nยปารวมมีตรทะเล 1 129.04\nบอดรวาม 9 123 nn\nทั้งหมด B423.00\nเง่นสศ 8423.00");
    expect(result.proposals[0]).toMatchObject({ documentType: "receipt", amount: 423, category: "อาหาร" });
  });
  it("recovers a Thai receipt date when Tesseract drops month punctuation", () => {
    const result = analyzeOcrText("ทำรายการสำเร็จ\n16 กย 2569 10:34 น.\nINDI Coffee\nจำนวนเงินที่ชำระ 16 บาท");
    expect(result.proposals[0]).toMatchObject({
      documentType: "receipt",
      amount: 16,
      dateText: "2026-09-16",
      timeText: "10:34",
    });
  });

  it("uses the Ocha receipt payable total instead of the quantity column", () => {
    const result = analyzeOcrText(`ใบเสร็จ
เลขที่: 03000728
ประเภท: ทานที่ร้าน
ชื่อพนักงาน: จ๊ะจ๋า
เวลา: 13-09-2569 15:28
สินค้า Qty ราคา
ปีกไก่ทอด 1 80.00
ต้มแซ่บกระดูกอ่อน 1 80.00
ตำถาดหมูย่าง 1 80.00
ข้าวเหนียว 2 20.00
เป๊ปซี่ใหญ่ 1 30.00
น้ำแข็งแก้ว 2 4.00
ยำรวมมิตรทะเล 1 129.00
ยอดรวม 9 423.00
ทั้งหมด ฿423.00
เงินสด ฿500.00
เงินทอน ฿77.00
Powered by Ocha`);
    expect(result.proposals[0]).toMatchObject({ amount: 423, category: "อาหาร", dateText: "2026-09-13", timeText: "15:28", merchant: "" });
    expect(result.summary).toContain("423");
  });

  it("keeps total-row money separate from quantities and subsequent cash rows", () => {
    for (const totals of ["ยอดรวม 9 423.00", "ทั้งหมด\n฿423.00", "ยอดรวม423.00", "Total 9 423.00", "ยอดรวม 9\nทั้งหมด B423.00"]) {
      expect(analyzeOcrText(`ใบเสร็จ\n${totals}\nเงินสด 500.00\nเงินทอน 77.00`).proposals[0].amount).toBe(423);
    }
  });

  it("bounds an OCR stage that never responds", async () => {
    await expect(withOcrDeadline(new Promise(() => {}), "initialization", 10)).rejects.toThrow("OCR initialization timed out");
    await expect(withOcrDeadline(Promise.resolve("ready"), "initialization", 100)).resolves.toBe("ready");
  });

  it("recovers spaced Thai glyphs and uses the slip memo as its title", () => {
    const result = analyzeOcrText("ชำระเงินสำเร็จ\nจ ำ น ว น\n140.00 บาท\nบันทึกช่วยจำ: กาแฟ\nเลขที่รายการ 202609131789574");
    expect(result.proposals[0]).toMatchObject({ amount: 140, title: "กาแฟ", note: "กาแฟ", category: "อาหาร", dateText: "", timeText: "" });
    expect(normalizeOcrText("ผู้รับ: ร้านกาแฟ มีสุข")).toBe("ผู้รับ: ร้านกาแฟ มีสุข");
  });

  it("does not mistake decimal prices for a transaction time", () => {
    expect(analyzeOcrText("ใบเสร็จ\nยอดรวม 12.50 บาท\nค่าธรรมเนียม 0.00 บาท").proposals[0].timeText).toBe("");
    expect(analyzeOcrText("ใบเสร็จ\nเวลา 12.50 น.\nยอดรวม 40 บาท").proposals[0].timeText).toBe("12:50");
  });

  it("recovers the welfare receipt date when OCR spaces numeric digits and cleans the merchant", () => {
    const result = analyzeOcrText(`
ฆ ร้านกระเพรากลางซอย ถุง อาหาร ของหวาน เครื่องคื่ม
วันที่ 1 4 / 0 9 / 2 5 6 9 10:57 น.
ค่าสินค้า/บริการ 75 บาท
สิทธิไทยช่วยไทยพลัส -45 บาท
จำนวนเงินที่ชำระ 30 บาท
`);
    expect(result.proposals[0]).toMatchObject({ kind: "expense", documentType: "receipt", merchant: "ร้านกระเพรากลางซอย", dateText: "2026-09-14", timeText: "10:57", amount: 30, category: "อาหาร" });
  });

  it("normalizes Thai digits and parses a Thai bank slip", () => {
    const result = analyzeOcrText(`
โอนเงินสำเร็จ
วันที่ 12/09/2569 เวลา 22:45 น.
ผู้รับ: ร้านกาแฟ มีสุข
จำนวนเงิน 1,250.00 บาท
ค่าธรรมเนียม 0.00 บาท
พร้อมเพย์
`);
    expect(result.proposals[0]).toMatchObject({ kind: "expense", documentType: "bank_slip", amount: 1250, dateText: "2026-09-12", timeText: "22:45", merchant: "ร้านกาแฟ มีสุข", category: "อาหาร", paymentMethod: "โอนเงิน" });
  });

  it("parses an English transfer slip and ignores fee as the transaction amount", () => {
    const result = analyzeOcrText(`
BANK TRANSFER SUCCESSFUL
Date 2026-09-12 14:30
Recipient: TEST COFFEE SHOP
Amount 123.45 THB
Fee 15.00 THB
`);
    expect(result.proposals[0]).toMatchObject({ kind: "expense", documentType: "bank_slip", amount: 123.45, dateText: "2026-09-12", timeText: "14:30", merchant: "TEST COFFEE SHOP", category: "อาหาร" });
  });

  it("converts Thai numerals before parsing", () => {
    expect(normalizeOcrText("ยอดรวม ๘๐.๕๐ บาท")).toContain("80.50 บาท");
  });

  it("parses a K+ payment slip with abbreviated Buddhist year and transaction reference", () => {
    const result = analyzeOcrText(`
ชำระเงินสำเร็จ K+
13 ก.ย. 69 15:07 น.
นาย จตุพล
ธ.กสิกรไทย
คาเฟ่อเมซอน สน.ปตท.นอก
เลขที่รายการ 016256150715DQR03239
จำนวน: 140.00 บาท
ค่าธรรมเนียม: 0.00 บาท
`);
    expect(result.proposals[0]).toMatchObject({ kind: "expense", documentType: "bank_slip", amount: 140, dateText: "2026-09-13", timeText: "15:07", category: "อาหาร", receiptNumber: "016256150715DQR03239" });
    expect(result.proposals[0].merchant).toContain("คาเฟ่");
  });

  it("cleans K+ OCR noise from the merchant and keeps branch text without absorbing references", () => {
    const result = analyzeOcrText(`
ชำระเงินสำเร็จ K+
13 ก.ย. 69 15:07 น.
นาย จตุพล เ
ธ.กสิกรไทย
xxx-x-x3512-x
ys คาเฟอเมซอน สน.ปตท.บจก.โรสท์บีน
เฮ้าส์
บจก. โรสท์บีนเฮ้าส์
202609131789574
เลขที่รายการ
016256150715DQR03239
จำนวน
140.00 บาท
ค่าธรรมเนียม
0.00 บาท
บันทึกช่วยจำ: กาแฟ
`);
    const proposal = result.proposals[0];
    expect(proposal).toMatchObject({ amount: 140, dateText: "2026-09-13", timeText: "15:07", receiptNumber: "016256150715DQR03239", title: "กาแฟ", category: "อาหาร" });
    expect(proposal.merchant).toBe("คาเฟ่ อเมซอน สน.ปตท.บจก.โรสท์บีนเฮ้าส์");
    expect(proposal.merchant).not.toMatch(/^ys\b/i);
    expect(proposal.merchant).not.toContain("202609131789574");
  });

  it("extracts POS receipt number, cash payment and all visible item rows", () => {
    const result = analyzeOcrText(`
ตำราลิ้น
ใบเสร็จ
เลขที่: 03000728
ประเภท: ทานที่ร้าน
ชื่อพนักงาน: จ๊ะจ๋า
เวลา: 13-09-2569 15:28
สินค้า Qty ราคา รวม
ปีกไก่ทอด 1 80.00
ต้มแซ่บกระดูกอ่อน 1 80.00
ตำคอหมูย่าง 1 80.00
ข้าวเหนียว 2 20.00
เป๊ปซี่ใหญ่ 1 30.00
น้ำแข็งแก้ว 2 4.00
ข้าวผัดกะเพรา 1 129.00
ยอดรวม 9 423.00
ทั้งหมด ฿423.00
เงินสด ฿423.00
`);
    expect(result.proposals[0]).toMatchObject({
      kind: "expense",
      documentType: "receipt",
      merchant: "ตำราลิ้น",
      amount: 423,
      dateText: "2026-09-13",
      timeText: "15:28",
      receiptNumber: "03000728",
      paymentMethod: "เงินสด",
      category: "อาหาร",
    });
    expect(result.proposals[0].lineItems).toHaveLength(7);
  });

  it("recovers a K+ amount when LINE OCR splits the จำนวน label and baht value across lines", () => {
    const result = analyzeOcrText(`
ชำระเงินสำเร็จ
13 ก.ย. 69 15:07 น.
K+
ธ.กสิกรไทย
คาเฟ่อเมซอน
เลขที่รายการ
016256150715DQR03239
จำนวน
140.00 บาท
ค่าธรรมเนียม
0.00 บาท
`);
    expect(result.proposals[0]).toMatchObject({ kind: "expense", documentType: "bank_slip", amount: 140, dateText: "2026-09-13", timeText: "15:07", category: "อาหาร" });
  });

  it("parses the K+ EVEANDBOY 716-baht slip that failed in production during Gemini high demand", () => {
    const result = analyzeOcrText(`
ชำระเงินสำเร็จ
23 ก.ย. 69 15:16 น.
K+
นาย จตุพล
ธ.กสิกรไทย
xxx-x-x3512-x
อีฟ แอนด์ บอย-บางแค
บริษัท อีฟ แอนด์ บอย จำกัด (มหาชน)
202609232079264
เลขที่รายการ:
016266151635CQR07478
จำนวน:
716.00 บาท
ค่าธรรมเนียม:
0.00 บาท
`);
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.proposals[0]).toMatchObject({
      kind: "expense", documentType: "bank_slip", amount: 716,
      dateText: "2026-09-23", timeText: "15:16",
      receiptNumber: "016266151635CQR07478", paymentMethod: "โอนเงิน",
    });
  });
});
