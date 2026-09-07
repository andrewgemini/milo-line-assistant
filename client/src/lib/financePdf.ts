export type FinancePdfTransaction = {
  transactionType: "income" | "expense";
  amount: string | number;
  category: string;
  note: string | null;
  occurredAt: Date | string;
};

const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function buildMiloFinancePdfHtml(input: { income: number; expense: number; balance: number; categories: Record<string, number>; transactions: FinancePdfTransaction[]; generatedAt?: Date }) {
  const generatedAt = input.generatedAt ?? new Date();
  const rows = input.transactions.map(transaction => `<tr><td>${escapeHtml(dateTime.format(new Date(transaction.occurredAt)))}</td><td class="${transaction.transactionType}">${transaction.transactionType === "income" ? "รายรับ" : "รายจ่าย"}</td><td>${escapeHtml(transaction.category)}</td><td>${escapeHtml(transaction.note ?? "—")}</td><td class="amount ${transaction.transactionType}">${transaction.transactionType === "income" ? "+" : "−"}${money.format(Number(transaction.amount))}</td></tr>`).join("");
  const categoryRows = Object.entries(input.categories).sort((a, b) => b[1] - a[1]).map(([name, amount]) => `<li><span>${escapeHtml(name)}</span><strong>${money.format(amount)}</strong></li>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"/><title>รายงานการเงินไมโล</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif;color:#263d59;margin:0}.brand{border-radius:24px;padding:24px;background:linear-gradient(135deg,#f2f0ff,#fceaf4 48%,#e4f8f2);border:1px solid #ded5f2}.eyebrow{font-size:12px;letter-spacing:.08em;color:#7b65a7;font-weight:700}.brand h1{margin:6px 0 4px;font-size:28px}.brand p{margin:0;color:#687387;font-size:13px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}.stat{border:1px solid #e4e7ee;border-radius:16px;padding:14px;background:#fff}.stat label{font-size:12px;color:#7b8494}.stat b{display:block;margin-top:5px;font-size:19px}.income{color:#20856d}.expense{color:#c9657d}.amount{text-align:right;font-weight:700}h2{font-size:16px;margin:22px 0 10px}ul{padding:0;margin:0;list-style:none;border:1px solid #e8e9ef;border-radius:14px}li{display:flex;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #eef0f4;font-size:13px}li:last-child{border-bottom:0}table{width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e8e9ef;border-radius:14px;overflow:hidden}th{background:#f5f3ff;text-align:left;color:#615b77}th,td{padding:8px;border-bottom:1px solid #eef0f4}tr:last-child td{border-bottom:0}.empty{padding:16px;border-radius:14px;background:#f6fbfa;color:#71827e;font-size:13px}.footer{margin-top:20px;color:#8a93a1;font-size:10px}</style></head><body><section class="brand"><div class="eyebrow">MILO • FINANCE</div><h1>รายงานการเงิน</h1><p>สรุปจากธุรกรรมที่บันทึกจริง ณ ${escapeHtml(dateTime.format(generatedAt))}</p></section><section class="stats"><div class="stat"><label>รายรับ</label><b class="income">${money.format(input.income)}</b></div><div class="stat"><label>รายจ่าย</label><b class="expense">${money.format(input.expense)}</b></div><div class="stat"><label>กำไร / ขาดทุน</label><b>${money.format(input.balance)}</b></div></section><h2>รายจ่ายตามหมวด</h2>${categoryRows ? `<ul>${categoryRows}</ul>` : '<p class="empty">ไม่มีรายจ่ายในข้อมูลที่เลือก</p>'}<h2>ธุรกรรม</h2>${rows ? `<table><thead><tr><th>วันที่</th><th>ประเภท</th><th>หมวด</th><th>หมายเหตุ</th><th class="amount">จำนวนเงิน</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty">ยังไม่มีธุรกรรมจริงสำหรับส่งออกรายงาน</p>'}<p class="footer">สร้างโดยไมโล • ข้อมูลนี้เป็นข้อมูลส่วนบุคคล โปรดจัดเก็บอย่างปลอดภัย</p></body></html>`;
}
