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
| 24 | Free plan | มี entitlement model, default Free, Pro/Pro Max gating, downgrade-bypass regression และ admin-linked UAT bootstrap | PASS |

## Plan / Entitlement model

ระบบเปิดใช้ plan gating จริงตามขอบเขตที่กำหนดไว้:

- **Free**: หมวดหมู่, Budget และสรุปรายเดือน
- **Pro**: เพิ่ม Reminder, กราฟวิเคราะห์ขั้นสูง และตั้งวันเริ่มรอบงบเอง
- **Pro Max**: เพิ่ม PDF, LINE Group Accounting และหลายบัญชี
- LINE User ที่ไม่ได้รับสิทธิ์เพิ่มเติมจะเป็น **Free** โดยอัตโนมัติ
- LINE User ที่เชื่อมกับ Dashboard role `admin` จะเป็น **Pro Max** สำหรับงาน operation/UAT เพื่อไม่ให้บัญชีดูแลระบบถูกล็อกระหว่าง rollout
- ผู้ใช้อื่นสามารถ grant plan เพิ่มผ่าน `MILO_PRO_LINE_USER_IDS` หรือ `MILO_PRO_MAX_LINE_USER_IDS`; Pro Max มี precedence เมื่ออยู่ทั้งสองรายการ
- Gating ถูกบังคับทั้ง LINE workflow และ Dashboard API ในฟีเจอร์ที่อยู่ใน paid tier
- Regression ครอบคลุมการกัน bypass จาก proposed data เดิม เช่น Free user ยืนยัน PDF เก่า หรือยืนยันรูปที่จะแปลงเป็น Reminder ไม่ได้

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

1. **LINE Messaging API credential / bot channel** — VERIFIED: `/v2/bot/info`, `/v2/bot/message/quota` และ quota consumption ตอบ HTTP 200 จาก access token ปัจจุบัน; LINE client จริงยืนยัน text + dynamic image แล้ว ส่วน voice + PDF ยังต้องพิสูจน์ด้วย event จริง
2. **OCR Production cold-start** — health ยืนยัน `ocrAssetsReady=true` และ `tesseract-tha+eng`; สลิปจริงยังต้องพิสูจน์ยอด/วันที่/ผู้รับจาก LINE Production
3. **Dynamic `save-result.png`** — **VISUAL E2E VERIFIED**: Vercel HTTP 200, `image/png`, 933×1085, `private, no-store, max-age=0`; screenshot จาก LINE client จริงยืนยัน `กินกาแฟ 80`, หมวดอาหาร, `฿80`, วันที่/เวลา และ footer แสดงครบ ไม่มี tofu/square (`□`)
4. **Dynamic `finance-report.png`** — **MONTH VISUAL E2E VERIFIED**: screenshot LINE client จริงจากคำสั่งสรุปยืนยันภาพเดือนนี้และข้อความตรงกันที่ รายรับ 0 บาท / รายจ่าย 770 บาท / คงเหลือ -770 บาท / อาหาร 770 บาท; day/week/year ยังครอบคลุมด้วย automated renderer และควร spot-check ต่อเมื่อทำ Final cross-period sign-off
5. **Reminder/Recurring cron** — logic/idempotency/downgrade gating PASS; delivery จริงและ no-duplicate ยังต้องพิสูจน์จาก scheduled Production run
6. **Group LINE** — role isolation PASS ใน automated UAT; owner/contributor/viewer ในกลุ่มจริงยังต้องพิสูจน์จาก LINE Production group
7. **AI/provider readiness** — LINE provider VERIFIED; OCR fallback พร้อมใช้งานโดยไม่พึ่ง OpenAI key; voice/PDF path ที่ต้องใช้ external provider ยังต้องพิสูจน์ credential/quota ใน Production ตาม flow จริง

## Production hardening รอบล่าสุด

- Dashboard ใช้ Production URL `https://milo-line-app.vercel.app/dashboard`
- Free / Pro / Pro Max ถูก gate ทั้ง backend และ Dashboard UI
- save-result renderer ใช้ `render=glyph-v2` และ no-store เพื่อกันภาพ cache เก่า
- การ์ด voice proposal **ไม่พึ่ง Manus storage แล้ว**; artwork ถูก self-host ที่ `https://milo-line-app.vercel.app/milo-voice-proposal-cat.webp` และมี regression test ป้องกันการย้อนกลับไปใช้ `manus.space`
- คำสั่ง `วิเคราะห์` มี deterministic financial-analysis fallback แล้ว: ถ้า AI provider/quota ใช้งานไม่ได้ ระบบยังสรุปจากยอดจริง, จำนวนรายการ และหมวดรายจ่ายได้โดยไม่ทำให้ webhook เงียบ
- Unknown intent ใช้ contextual fallback แบบสั้น พร้อม Quick Reply สูงสุด 3 ปุ่มตามบริบท แทนการเท help menu ยาวทุกครั้ง

## Current automated baseline

รอบ Release Acceptance ล่าสุดยืนยันแล้ว **45 test files / 216 tests PASS**, TypeScript check PASS และ Production build PASS. ชุดทดสอบครอบคลุม plan entitlement/gating, Free downgrade bypass, runtime reminder-delivery gating, admin-linked Pro Max bootstrap, exact `กินกาแฟ 80` glyph regression, finance image, webhook, export, recurring, group/multi-account, receipt-edit flow, self-hosted LINE voice proposal artwork, exact `วิเคราะห์` command, deterministic analysis fallback และ contextual Quick Reply fallback.
