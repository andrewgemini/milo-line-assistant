import { describe, expect, it } from "vitest";
import { enrichThaiReceiptProposal, extractKbankMerchant, extractReceiptLineItems, extractReceiptMerchant, extractReceiptNumber, extractReceiptPaymentMethod, extractThaiPayableAmount, extractThaiSlipDateTime, normalizeThaiMerchantName, receiptMerchantQuality } from "./thaiReceiptParser";
import type { ImageProposal } from "./imageAnalysis";

const baseProposal: ImageProposal = {
  kind: "expense",
  documentType: "unknown",
  title: "ข้อมูลจากรูป",
  merchant: "",
  dateText: "",
  timeText: "",
  amount: 0,
  currency: "บาท",
  category: "ทั่วไป",
  paymentMethod: "",
  receiptNumber: "",
  lineItems: [],
  note: "",
};

describe("Thai receipt parser", () => {
  it("extracts a complete multi-line CJ merchant from a K+ slip", () => {
    const text = `
ชำระเงินสำเร็จ K+
14 ก.ย. 69 11:02 น.
นาย จตุพล เ
ธ.กสิกรไทย
xxx-x-x3512-x
CJ 1685 เพชรเกษม106
บจก. ซี.เจ. เอ็กซ์เพรส กรุ๊ป
202609140954986
เลขที่รายการ
016257110259CQR07995
จำนวน
40.00 บาท
ค่าธรรมเนียม
0.00 บาท
`;
    expect(extractKbankMerchant(text)).toBe("CJ 1685 เพชรเกษม106 บจก. ซี.เจ. เอ็กซ์เพรส กรุ๊ป");
    const enriched = enrichThaiReceiptProposal(text, { ...baseProposal, documentType: "bank_slip", amount: 40, paymentMethod: "โอนเงิน" });
    expect(enriched).toMatchObject({ merchant: "CJ 1685 เพชรเกษม106 บจก. ซี.เจ. เอ็กซ์เพรส กรุ๊ป", amount: 40, dateText: "2026-09-14", timeText: "11:02" });
  });

  it("cleans punctuation and trailing OCR garbage from a CJ merchant", () => {
    expect(normalizeThaiMerchantName("= CJ 1685 เพชรเกษม1 06 บจก. ซี.เจ. เอกซ์เพรส กรุ๊ป 2รอ"))
      .toBe("CJ 1685 เพชรเกษม106 บจก. ซี.เจ. เอ็กซ์เพรส กรุ๊ป");
  });

  it("canonicalizes heavily corrupted CJ company suffixes", () => {
    expect(normalizeThaiMerchantName("CJ 1685 เพชรเกษม106 บจก. ซี.เจ. เอกซ์เพรส กรป2รว"))
      .toBe("CJ 1685 เพชรเกษม106 บจก. ซี.เจ. เอ็กซ์เพรส กรุ๊ป");
  });

  it("parses Thai dates even when OCR inserts spaces around month punctuation", () => {
    expect(extractThaiSlipDateTime("ร้านกระเพรากลางซอย\n14 ก . ย . 2 5 6 9 10:57 น."))
      .toEqual({ dateText: "2026-09-14", timeText: "10:57" });
  });

  it("recovers spaced numeric receipt dates and full Thai month names", () => {
    expect(extractThaiSlipDateTime("วันที่ 1 4 / 0 9 / 2 5 6 9 เวลา 10:57 น.")).toEqual({ dateText: "2026-09-14", timeText: "10:57" });
    expect(extractThaiSlipDateTime("วันที่ 14.09.69 10:57")).toEqual({ dateText: "2026-09-14", timeText: "10:57" });
    expect(extractThaiSlipDateTime("14 กันยายน 2569 10:57 น.")).toEqual({ dateText: "2026-09-14", timeText: "10:57" });
  });

  it("cleans the noisy merchant line from the welfare receipt", () => {
    expect(normalizeThaiMerchantName("ฆ ร้านกระเพรากลางซอย ถุง อาหาร ของหวาน เครื่องคื่ม ค่าสินค้า/บริการ 75 บาท สิทธิไทยช่วยไทยพลัส -45 บาท"))
      .toBe("ร้านกระเพรากลางซอย");
  });

  it("rejects POS operational fields as a merchant and recovers a top-of-receipt restaurant brand", () => {
    expect(normalizeThaiMerchantName("ประเภท: ทานที่ร้าน ซื้อ พนักงาน: จ๊ะจ๋า เวลา: 13-09-2569 15:28")).toBe("");
    const text = `
ตำราลิ้น
โทรศัพท์: 0628595268
ใบเสร็จ
เลขที่: 03000728
ประเภท: ทานที่ร้าน
ชื่อพนักงาน: จ๊ะจ๋า
เวลา: 13-09-2569 15:28
สินค้า Qty ราคา
ผัดไทย 1 80.00
ทั้งหมด 423.00
`;
    expect(enrichThaiReceiptProposal(text, { ...baseProposal, documentType: "receipt", merchant: "ประเภท: ทานที่ร้าน ซื้อ พนักงาน: จ๊ะจ๋า เวลา: 13-09-2569 15:28", amount: 423 }).merchant).toBe("ตำราลิ้น");
  });

  it("reads a POS restaurant receipt like the production 423-baht case completely", () => {
    const text = `
ตำราลิ้น
โทรศัพท์: 0628595268
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
ขอบคุณและขอให้โชคดี
Powered by Ocha
`;
    expect(extractReceiptNumber(text)).toBe("03000728");
    expect(extractReceiptPaymentMethod(text)).toBe("เงินสด");
    expect(extractReceiptLineItems(text)).toEqual([
      "ปีกไก่ทอด ×1 80 บาท",
      "ต้มแซ่บกระดูกอ่อน ×1 80 บาท",
      "ตำคอหมูย่าง ×1 80 บาท",
      "ข้าวเหนียว ×2 20 บาท",
      "เป๊ปซี่ใหญ่ ×1 30 บาท",
      "น้ำแข็งแก้ว ×2 4 บาท",
      "ข้าวผัดกะเพรา ×1 129 บาท",
    ]);
    const enriched = enrichThaiReceiptProposal(text, { ...baseProposal, documentType: "receipt", amount: 423 });
    expect(enriched).toMatchObject({
      merchant: "ตำราลิ้น",
      amount: 423,
      dateText: "2026-09-13",
      timeText: "15:28",
      receiptNumber: "03000728",
      paymentMethod: "เงินสด",
    });
    expect(enriched.lineItems).toHaveLength(7);
  });

  it("joins split POS item names with quantity and amount from the following OCR line", () => {
    const text = `ใบเสร็จ
สินค้า Qty ราคา รวม
ต้มแซ่บกระดูกอ่อน
1 80.00
ข้าวเหนียว 2 20.00
ยอดรวม 3 100.00`;
    expect(extractReceiptLineItems(text)).toEqual([
      "ต้มแซ่บกระดูกอ่อน ×1 80 บาท",
      "ข้าวเหนียว ×2 20 บาท",
    ]);
  });

  it("removes wallet category text and a short OCR garbage token from the merchant", () => {
    expect(normalizeThaiMerchantName("INDI Coffee as! อาหาร")).toBe("INDI Coffee");
    expect(normalizeThaiMerchantName("INDI Coffee อาหาร ของหวาน เครื่องดื่ม")).toBe("INDI Coffee");
    expect(normalizeThaiMerchantName("ชื่อพนักงาน: จ๊ะจ๋า")).toBe("");
  });

  it("prefers the real coffee shop on a welfare wallet receipt and rejects OCR garbage", () => {
    const text = `
การทำรายการสำเร็จ
16 ก.ย. 2569 10:34 น.
G-Wallet ID: **** **** 2310
INDI Coffee
อาหาร ของหวาน เครื่องดื่ม
ค่าสินค้า/บริการ 40 บาท
สิทธิไทยช่วยไทยพลัส -24 บาท
จำนวนเงินที่ชำระ 16 บาท
`;
    expect(receiptMerchantQuality("ะ ภ% 7 oo WAT")).toBeLessThan(0);
    expect(extractReceiptMerchant(text)).toBe("INDI Coffee");
    expect(enrichThaiReceiptProposal(text, {
      ...baseProposal,
      documentType: "receipt",
      merchant: "ะ ภ% 7 oo WAT",
      amount: 40,
    })).toMatchObject({
      merchant: "INDI Coffee",
      amount: 16,
      dateText: "2026-09-16",
      timeText: "10:34",
    });
  });

  it("uses the actual paid amount after a welfare subsidy instead of the gross service amount", () => {
    const text = `
ร้านกระเพรากลางซอย
14 ก.ย. 2569 10:57 น.
ค่าสินค้า/บริการ 75 บาท
สิทธิไทยช่วยไทยพลัส -45 บาท
จำนวนเงินที่ชำระ 30 บาท
`;
    expect(extractThaiPayableAmount(text)).toBe(30);
    expect(extractThaiSlipDateTime(text)).toEqual({ dateText: "2026-09-14", timeText: "10:57" });
    expect(extractReceiptLineItems(text)).toEqual([
      "ค่าสินค้า/บริการ 75 บาท",
      "สิทธิไทยช่วยไทยพลัส -45 บาท",
      "จำนวนเงินที่ชำระ 30 บาท",
    ]);
    const enriched = enrichThaiReceiptProposal(text, { ...baseProposal, documentType: "receipt", amount: 75, merchant: "ร้านกระเพรากลางซอย ถุง อาหาร ของหวาน เครื่องดื่ม" });
    expect(enriched).toMatchObject({ documentType: "receipt", merchant: "ร้านกระเพรากลางซอย", amount: 30, dateText: "2026-09-14", timeText: "10:57" });
  });
});
