import { describe, expect, it } from "vitest";
import { enrichThaiReceiptProposal, extractKbankMerchant, extractReceiptLineItems, extractThaiPayableAmount, extractThaiSlipDateTime, normalizeThaiMerchantName } from "./thaiReceiptParser";
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
