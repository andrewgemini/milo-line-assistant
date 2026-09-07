export const STANDARD_EXPENSE_CATEGORIES = [
  "อาหาร", "เดินทาง", "ค่าสาธารณูปโภค", "ที่อยู่อาศัย", "สุขภาพ", "การศึกษา", "บันเทิง", "ช้อปปิ้ง", "ท่องเที่ยว", "ประกัน", "หนี้สิน", "ธุรกิจ", "ทั่วไป",
] as const;

export const STANDARD_INCOME_CATEGORIES = [
  "เงินเดือน", "รายได้จากงาน", "ขายสินค้า/บริการ", "งานอิสระ", "ดอกเบี้ย/เงินปันผล", "เงินคืน", "รายรับอื่น ๆ",
] as const;

export function suggestStandardCategory(transactionType: "income" | "expense", note: string) {
  const value = note.toLowerCase();
  if (transactionType === "income") {
    if (/เงินเดือน|โบนัส/.test(value)) return "เงินเดือน";
    if (/ขาย|ยอดขาย|ลูกค้า/.test(value)) return "ขายสินค้า/บริการ";
    if (/ฟรีแลนซ์|ค่าจ้าง|งานจ้าง/.test(value)) return "งานอิสระ";
    if (/ดอกเบี้ย|ปันผล/.test(value)) return "ดอกเบี้ย/เงินปันผล";
    if (/คืนเงิน|refund/.test(value)) return "เงินคืน";
    return "รายได้จากงาน";
  }
  if (/กาแฟ|อาหาร|ข้าว|กิน|ร้านอาหาร/.test(value)) return "อาหาร";
  if (/รถ|grab|bts|mrt|แท็กซี่|น้ำมัน/.test(value)) return "เดินทาง";
  if (/ค่าไฟ|ค่าน้ำ|ค่าเน็ต|อินเทอร์เน็ต|โทรศัพท์/.test(value)) return "ค่าสาธารณูปโภค";
  if (/เช่า|คอนโด|บ้าน|ห้อง|ที่พัก/.test(value)) return "ที่อยู่อาศัย";
  if (/ยา|หมอ|โรงพยาบาล|ฟิตเนส/.test(value)) return "สุขภาพ";
  if (/หนังสือ|คอร์ส|เรียน|ค่าเทอม/.test(value)) return "การศึกษา";
  if (/หนัง|เกม|คอนเสิร์ต|netflix/.test(value)) return "บันเทิง";
  if (/ซื้อ|ช้อป|เสื้อ|ของใช้/.test(value)) return "ช้อปปิ้ง";
  if (/โรงแรม|ตั๋วเครื่องบิน|ทริป/.test(value)) return "ท่องเที่ยว";
  if (/ประกัน/.test(value)) return "ประกัน";
  if (/หนี้|บัตรเครดิต|ผ่อน/.test(value)) return "หนี้สิน";
  return "ทั่วไป";
}
