# Milo — UAT Matrix 24 Features

หลัก UX ที่ใช้ตรวจรับ: **Conversational Finance / Conversational Accounting** — ผู้ใช้ควรบอกสิ่งที่เกิดขึ้นใน LINE ได้โดยตรง โดยไม่ต้องเรียนรู้ฟอร์มบัญชีแบบ วันที่ → ประเภท → หมวด → จำนวนเงิน → บัญชี → หมายเหตุ

สถานะ:
- **PASS** = มี implementation และ automated acceptance test ผ่าน
- **PROD E2E** = logic ผ่าน แต่ต้องพิสูจน์บริการภายนอก/LINE Production จริงเพิ่มเติม
- **OPEN** = ยังไม่ควรถือว่าผ่าน

| # | UAT Feature | Acceptance หลัก | สถานะ |
|---|---|---|---|
| 1 | จดรายรับ | `เงินเดือนเข้า 35,000`/`รับเงินเดือน 45000` → income transaction | PASS |
| 2 | จดรายจ่าย | `กินกาแฟ 80`/`จ่ายกาแฟ 65` → expense transaction | PASS |
| 3 | จดผ่านข้อความ LINE | Natural language → parse → category → save → summary | PASS |
| 4 | อ่านใบเสร็จ/สลิปจากรูป | image → OCR/analysis → proposal → confirm → evidence | PASS / PROD E2E |
| 5 | จดจากเสียง | audio → STT → proposal → edit/confirm → transaction + audio evidence | PASS / PROD E2E |
| 6 | จดจาก PDF | PDF → analysis → multi-proposal → confirm → multiple transactions + PDF evidence | PASS / PROD E2E |
| 7 | AI/ระบบวิเคราะห์ข้อความ | จำนวนเงิน/ประเภท/หมวดจากภาษาธรรมชาติ และ AI fallback เมื่อจำเป็น | PASS |
| 8 | จัดหมวดอัตโนมัติ | กาแฟ→อาหาร, น้ำมัน→เดินทาง ฯลฯ; custom category supported | PASS |
| 9 | Budget | ตั้งงบ → บันทึกรายจ่าย → เทียบ used/limit/% ในรอบงบจริง | PASS |
| 10 | สรุปการใช้จ่าย | วันนี้/สัปดาห์/เดือน/ปี ใช้ยอดจริง ไม่ใช้ภาพตัวเลขตัวอย่าง | PASS / PROD E2E |
| 11 | วิเคราะห์พฤติกรรมการเงิน | report data → structured insight/highlights/actions | PASS / PROD E2E |
| 12 | รายงานประจำเดือน | month window + income/expense/balance/categories | PASS |
| 13 | รายการจ่ายประจำ | recurring rule + due delivery + idempotent run | PASS |
| 14 | ตั้งรายการอัตโนมัติ | create/list/pause/resume/cancel และสร้างรายการเมื่อถึงเวลา | PASS |
| 15 | เตือนจดรายวัน/Reminder | create reminder + scheduled delivery/retry | PASS / PROD E2E |
| 16 | ตั้งวันเริ่มรอบงบ | วัน 1–28 และคำนวณรอบ custom เช่น 14→13 | PASS |
| 17 | Export Excel | signed authorized download → XLSX workbook จริง | PASS |
| 18 | Export CSV | signed authorized download → UTF-8 CSV จริง | PASS |
| 19 | จดในกลุ่ม LINE | group finance account + membership/role isolation | PASS / PROD E2E |
| 20 | หลายบัญชี | personal/group ledgers แยกข้อมูลและสิทธิ์ | PASS |
| 21 | แนบใบเสร็จ/หลักฐาน | transaction ↔ image/PDF/audio evidence linkage | PASS |
| 22 | แก้ข้อมูลก่อนบันทึกจากใบเสร็จ | `แก้ใบเสร็จ ยอด/หมวด/วันที่/ร้านค้า ...` → update proposal เท่านั้น → ต้องยืนยันจึงบันทึก | PASS |
| 23 | กราฟวิเคราะห์ขั้นสูง | Area income/expense, Pie category share, Bar category expense จากข้อมูลจริง | PASS |
| 24 | Free plan | ต้องมี entitlement/plan model และกติกา Free/Pro/Pro Max ที่ชัดเจนก่อนเปิด gating | OPEN |

## Acceptance flows สำคัญ

### Conversational text
`กินกาแฟ 80` → รายจ่าย 80 → หมวดอาหาร → บันทึก → เทียบงบ → ส่งผลสำเร็จ/สรุปจากข้อมูลจริง

### Receipt edit-before-save
1. ส่งรูปใบเสร็จ/สลิป
2. Milo วิเคราะห์และเสนอข้อมูล
3. ผู้ใช้พิมพ์ เช่น `แก้ใบเสร็จ ยอด 150 บาท`, `แก้สลิป หมวด เดินทาง`, `แก้ใบเสร็จ วันที่ 27/08/2569`, `แก้ใบเสร็จ ร้านค้า Milo Cafe`
4. ระบบแก้เฉพาะ proposal สถานะ `proposed`; **ยังไม่สร้าง transaction**
5. `ยืนยันค่าใช้จ่าย` → จึงสร้าง transaction และผูกหลักฐาน

### Finance summary image
`สรุปวันนี้ / สรุปสัปดาห์นี้ / สรุปเดือนนี้ / สรุปปีนี้` → query period จริง → สร้าง dynamic PNG จาก income/expense/balance/categories จริง → ภาษาไทยวาดเป็น vector glyph → ไม่มี static example numbers

### Recurring limit
รายการอัตโนมัติ active/paused รวมสูงสุด **20 รายการต่อสมุดบัญชี**; รายการที่ 21 ต้องถูกปฏิเสธโดยไม่สร้าง record ใหม่

## External Production checks ก่อน Final UAT sign-off

1. LINE Production: text + image + voice + PDF ในบัญชีผู้ใช้จริง
2. OCR Production cold-start: สลิปจริงต้องจบภายใน function duration และยอด/วันที่/ผู้รับถูกต้อง
3. Dynamic `save-result.png`: ภาษาไทยไม่เป็น tofu/square บน Vercel Linux
4. Dynamic `finance-report.png`: ภาพวัน/สัปดาห์/เดือน/ปีแสดงยอดเดียวกับ DB/Flex text
5. Reminder/Recurring cron: ยืนยัน delivery จริงและไม่ยิงซ้ำ
6. Group LINE: owner/contributor/viewer ในกลุ่มจริง
7. AI-dependent features (PDF/voice insight where applicable): provider credentials/quota ต้องพร้อม

## Current automated baseline

หลังเพิ่ม UAT ชุดใหม่และ receipt-edit flow รอบล่าสุด ยืนยันแล้ว **42 test files / 198 tests PASS** พร้อม TypeScript check PASS ก่อน release build.
