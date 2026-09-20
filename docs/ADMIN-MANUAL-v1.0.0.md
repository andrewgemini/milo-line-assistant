# คู่มือผู้ดูแลระบบ Milo v1.0.0

คู่มือนี้สำหรับผู้ดูแลระบบ (Admin) ที่ดูแล Milo บน Production, Dashboard, LINE integration, ระบบการเงิน, Scheduler, สิทธิ์ผู้ใช้, Audit log และ Recovery

## 1. URL สำคัญ

Production Dashboard

`https://milo-line-assistant.onrender.com/dashboard`

Health Check

`https://milo-line-assistant.onrender.com/api/health`

LINE Webhook

`https://milo-line-assistant.onrender.com/api/line/webhook`

Repository

`https://github.com/andrewgemini/milo-line-assistant.git`

Production Release ที่คู่มือนี้อ้างอิง

`production-hardening-v19-2026-09-14`

Git Tag

`v1.0.0`

---

## 2. การเข้าสู่ระบบ Admin

1. เปิด Production Dashboard
2. กรอก Username และ Password ของผู้ดูแลระบบ
3. กด `ลงชื่อเข้าใช้ผู้ดูแลระบบ`
4. เมื่อล็อกอินสำเร็จ ระบบจะสร้าง session cookie และเปิด Dashboard

Credential ของ Admin ต้องจัดการผ่าน secret/environment ของระบบ ไม่ควรบันทึกรหัสผ่านจริงไว้ในคู่มือหรือ repository

ตัวแปรที่เกี่ยวข้อง

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

หากต้องเปลี่ยน credential ให้แก้ Environment Variables ใน Hosting แล้ว Redeploy ตามขั้นตอนของระบบ

---

## 3. เชื่อมบัญชี LINE ของ Admin

Admin ควรเชื่อม LINE ของตนเองเพื่อใช้งานฟีเจอร์และดูข้อมูลจริง

### ขั้นตอน

1. เปิดแชทส่วนตัวกับ Milo
2. พิมพ์ `ไอดี`
3. คัดลอก LINE User ID ที่ Milo ส่งกลับ
4. เปิด Dashboard
5. วาง LINE User ID ในช่องเชื่อมบัญชี
6. กด `เชื่อมบัญชี`

รูปแบบ LINE User ID ที่ถูกต้องต้องขึ้นต้นด้วย `U` และตามด้วยอักขระ 32 ตัว

LINE ที่เชื่อมกับบัญชี Admin จะได้รับ Pro Max เพื่อการดูแลและ UAT

---

## 4. เมนู Dashboard

Dashboard มีเมนูหลัก

- ภาพรวม
- วิเคราะห์การเงิน
- หมวด / งบประมาณ
- รายการธุรกรรม
- การเตือนประจำ
- คลังไฟล์
- โน้ตและงาน
- กลุ่ม LINE
- ส่งออกข้อมูล

ทั้ง Desktop และ Mobile ใช้เมนูชุดเดียวกันและเลื่อนไปยัง section ที่เกี่ยวข้อง

---

## 5. ภาพรวมระบบการเงิน

หน้า `ภาพรวม` แสดง

- ยอดคงเหลือ
- รายรับเดือนนี้
- รายจ่ายเดือนนี้
- จำนวนธุรกรรม 7 วัน
- สมุดบัญชีที่กำลังเลือก
- สถานะเชื่อม LINE

Admin สามารถสลับสมุดบัญชีระหว่างบัญชีส่วนตัวและบัญชีกลุ่มได้จาก Finance Account Switcher

---

## 6. วิเคราะห์การเงิน

ส่วนวิเคราะห์แสดงข้อมูลจริงจาก transaction

- กราฟรายรับ/รายจ่าย 7 วัน
- ยอดสุทธิ 7 วัน
- สัดส่วนรายจ่ายตามหมวด
- หมวดรายจ่ายสูงสุด
- Transaction count
- AI Financial Assistant

AI Assistant เลือกช่วงได้

- วันนี้
- สัปดาห์นี้
- เดือนนี้
- ปีนี้

ระบบจะไม่สร้างข้อมูลจำลอง หากข้อมูลไม่พอจะแจ้งระดับ data sufficiency

---

## 7. รายงานการเงิน

Dashboard รองรับรายงาน

- วัน
- สัปดาห์
- เดือน
- ปี
- ช่วงวันที่กำหนดเอง

แต่ละรายงานแสดง

- รายรับ
- รายจ่าย
- กำไร/คงเหลือ
- จำนวนธุรกรรม
- รายจ่ายตามหมวด
- เปรียบเทียบกับช่วงก่อนหน้า

---

## 8. จัดการธุรกรรม

ส่วน `จัดการธุรกรรม` รองรับ

- เพิ่มธุรกรรม
- แก้ไขยอด
- แก้หมวด
- แก้หมายเหตุ
- ลบแบบ soft-delete
- ดูหลักฐานที่เชื่อมกับรายการ
- ค้นหาและกรองย้อนหลัง
- Pagination

### สิทธิ์ระดับสมุดบัญชี

| Role | เพิ่ม | แก้/ลบ | ตั้งค่าบัญชี | จัดการสมาชิก |
|---|:---:|:---:|:---:|:---:|
| owner | ✓ | ✓ | ✓ | ✓ |
| manager | ✓ | ✓ | ✓ |  |
| contributor | ✓ |  |  |  |
| viewer |  |  |  |  |

การลบรายการจะเก็บ Audit log ไว้

---

## 9. ค้นหาและกรองธุรกรรม

Admin สามารถค้นหาโดย

- จำนวนเงิน
- หมวด
- หมายเหตุ

และกรองตาม

- ทุกประเภท
- รายรับ
- รายจ่าย
- หมวด

รายการแสดงเป็นหน้า ๆ เพื่อไม่โหลดข้อมูลทั้งหมดในครั้งเดียว

---

## 10. ยอดเงินเริ่มต้น

ใน `ตั้งค่าการเงิน` สามารถกำหนดยอดเริ่มต้นของแต่ละสมุดบัญชีได้

ยอดตั้งต้นไม่ถูกนับเป็นรายรับ เพื่อรักษาความถูกต้องของรายงาน

ขั้นตอน

1. เลือกสมุดบัญชี
2. เปิด `ตั้งค่าการเงิน`
3. กรอกยอดเริ่มต้น
4. กด `บันทึก`

---

## 11. หมวดและงบประมาณ

Admin/Owner/Manager สามารถ

- เพิ่มหมวดรายรับ
- เพิ่มหมวดรายจ่าย
- ลบหมวด custom
- ตั้งงบรายหมวด
- ดูงบที่ใช้ไป
- ตั้งวันเริ่มรอบงบ

วันเริ่มรอบกำหนดได้ 1–28 และ Custom Budget Cycle ต้องใช้ Pro ขึ้นไป

---

## 12. รายการประจำ

ส่วน `รายการรายรับ/รายจ่ายประจำ` ใช้ตั้งธุรกรรมอัตโนมัติ

รองรับ

- รายวัน
- รายสัปดาห์
- รายเดือน

ข้อมูลที่ต้องกำหนด

- ประเภท รายรับ/รายจ่าย
- จำนวนเงิน
- หมวด
- ความถี่
- วันเวลาเริ่มรัน

สถานะรายการ

- active
- paused
- cancelled

ระบบมี run record ป้องกัน transaction ซ้ำจาก scheduler

---

## 13. Reminder Scheduler

Admin เท่านั้นที่เปิดและสั่งรัน Scheduler ได้

### ปุ่ม `เปิด scheduler`

ใช้ตั้งค่า reminder delivery ให้เปิดใช้งานบน Production

ระบบเป็น idempotent หากเปิดอยู่แล้วจะรายงาน `already-active` โดยไม่สร้าง scheduler ซ้ำ

### ปุ่ม `ส่งรายการที่ถึงเวลา`

ใช้สั่งประมวลผล reminder ที่ครบกำหนดทันทีแบบ manual

ใช้สำหรับ

- UAT
- ตรวจ recovery
- ตรวจกรณี cron ล่าช้า

Scheduler เปิดได้เฉพาะ Production ไม่ใช่ Preview

---

## 14. Finance Digest Automation

Admin สามารถเปิด/ปิด

- สรุปรายวัน
- สรุปรายสัปดาห์

ตารางเวลาที่ UI แสดง

- Daily: ทุกวัน 06:00 น.
- Weekly: ทุกวันจันทร์ 06:00 น.
- Time zone: Asia/Bangkok

Dashboard แสดง

- เปิด/ปิด
- Last run
- Delivery status
- Period key
- Error message หากล้มเหลว

มี Delivery Audit สำหรับตรวจย้อนหลัง

---

## 15. คลังไฟล์

Dashboard แสดงไฟล์ ข้อความ และลิงก์ที่เก็บจาก LINE

Admin สามารถ

- ค้นหา
- เปิดลิงก์
- แก้ Tags
- แก้ Source URL

การแก้ metadata ไม่เปลี่ยนไฟล์ต้นฉบับ

หลักฐานสลิป ใบเสร็จ เสียง และ PDF สามารถเชื่อมกับ transaction ได้

---

## 16. โน้ตและ To-do

Admin ดู

- โน้ตล่าสุด
- งานที่ต้องทำ

สามารถกดทำ To-do ให้เสร็จจาก Dashboard ได้

Mutation มี pending state เพื่อป้องกันการกดซ้ำ

---

## 17. สมุดบัญชีกลุ่ม LINE

Group Accounting ใช้ Pro Max

### เปิดสมุดบัญชีกลุ่ม

1. เพิ่ม Milo เข้ากลุ่ม LINE
2. ให้สมาชิกส่งข้อความอย่างน้อยหนึ่งครั้งเพื่อให้ระบบรู้จักสมาชิก
3. เปิด Dashboard
4. ไป `กลุ่ม LINE`
5. เลือกกลุ่ม
6. ตั้งชื่อสมุดบัญชี
7. กด `เปิดสมุดบัญชี`

### เพิ่มสมาชิก

Owner เท่านั้นที่จัดการสมาชิกได้

กำหนดได้

- manager
- contributor
- viewer

ระบบจะยอมเพิ่มเฉพาะ LINE User ID ที่มีข้อมูลว่าเป็นสมาชิกในกลุ่มนั้นแล้ว

### ความเป็นส่วนตัว

บัญชีส่วนตัวไม่ถูกนำไปรวมกับกลุ่มอัตโนมัติ

กลุ่มจะเห็นเฉพาะข้อมูลในสมุดบัญชีกลุ่มที่ได้รับสิทธิ์

---

## 18. User & Role Governance

Admin มีส่วน `ผู้ใช้และสิทธิ์`

Dashboard roles ที่กำหนดได้

- viewer
- user
- manager
- admin

เฉพาะ role `admin` เท่านั้นที่เข้าถึง Governance, Scheduler management และ automation controls ที่จำกัดเฉพาะผู้ดูแล

หมายเหตุ: Dashboard role และ Finance Account role เป็นคนละชั้นสิทธิ์

- Dashboard role ควบคุมสิทธิ์ระดับระบบ
- Finance Account role ควบคุมสิทธิ์ภายในสมุดบัญชี

---

## 19. Audit Log

Admin สามารถดู Audit log ล่าสุดได้จาก Dashboard

ตัวอย่าง action ที่ถูกบันทึก

- เชื่อม LINE
- เปลี่ยน user role
- เพิ่ม/ลบสมาชิกบัญชีกลุ่ม
- ตั้งยอดเริ่มต้น
- ตั้งวันเริ่มรอบงบ
- เพิ่ม/ลบหมวด
- สร้างรายการประจำ
- เปลี่ยนสถานะรายการประจำ
- แก้/ลบ transaction
- เปิด/ปิด finance digest

Audit log ใช้สำหรับตรวจสอบย้อนหลังและ incident review

---

## 20. Export

Dashboard รองรับ

- CSV
- Excel `.xlsx`
- PDF Report สำหรับ Pro Max

CSV และ Excel ใช้ธุรกรรมจริงของสมุดบัญชีที่เลือก

Excel ประกอบด้วยชีต

- ธุรกรรม
- สรุป
- รายจ่ายตามหมวด

LINE ยังรองรับคำสั่ง

`ส่งออก CSV`

`ส่งออก Excel`

ลิงก์ export ที่ส่งผ่าน LINE มี signature และอายุประมาณ 10 นาที

---

## 21. ตรวจ Production Health

เปิด

`https://milo-line-assistant.onrender.com/api/health`

ควรตรวจค่า

- `status = ok`
- release ตรงกับรุ่นที่ต้องการ
- lineConfigured = true
- databaseConfigured = true
- exportSigningConfigured = true
- cronConfigured = true
- duplicateProtection = true
- undoSupported = true
- webhookSignatureVerification = true

ถ้าค่า readiness สำคัญเป็น false ให้หยุด deploy/maintenance ที่เกี่ยวข้องและแก้ configuration ก่อน

---

## 22. LINE Webhook Security

Webhook

`POST /api/line/webhook`

ระบบตรวจ `x-line-signature`

Signature ผิดต้องได้ HTTP 401

ไม่ควร bypass signature verification ใน Production

Request body จำกัดขนาดเพื่อช่วยลดความเสี่ยงจาก payload ที่ผิดปกติ

---

## 23. Cron Endpoint

Reminder cron

`/api/scheduled/reminders`

ระบบรองรับ authenticated scheduler และตรวจ secret/task identity ก่อนประมวลผล

Finance digest routes

- `/api/scheduled/finance-daily`
- `/api/scheduled/finance-weekly`

ห้ามเปิด endpoint cron ให้ anonymous caller ใช้งานโดยไม่มี authentication

---

## 24. Release Gate

ก่อน release ใช้

`pnpm release:gate`

คำสั่งนี้รัน

1. `pnpm check`
2. Full regression tests แบบ serial
3. Production build

เกณฑ์ของ v1.0.0 ที่ผ่านแล้ว

- Test Files 51/51
- Tests 276/276
- TypeScript PASS
- Build PASS

หาก Release Gate fail ห้าม push release tag ใหม่จนกว่าจะแก้ให้ผ่าน

---

## 25. Recovery Drill

โปรเจกต์มี verifier

`pnpm recovery:verify`

ต้องมีใน `.env`

- `DATABASE_URL` = Production
- `RECOVERY_DATABASE_URL` = Restored database

Recovery verifier ทำ read-only comparison

- จำนวน tables
- Schema hash
- Table schema
- Row count
- Missing tables
- Snapshot age indication

ผลที่ต้องการ

`RECOVERY_DRILL=PASS`

Recovery v1.0.0 ผ่านแล้วด้วย 25/25 tables และ schema match

### ข้อควรระวัง

ห้ามตั้ง `RECOVERY_DATABASE_URL` เป็น Production ตัวเดียวกันเพื่อหลอกผลตรวจ

ห้าม Restore ทับ Production เพื่อทำ drill

---

## 26. Backup / Restore Runbook

1. ตรวจ Automatic Backup ใน TiDB Cloud
2. สร้าง Backup ตามนโยบายองค์กร
3. Restore เป็น instance/cluster แยก
4. ใส่ connection string ใน `RECOVERY_DATABASE_URL`
5. รัน `pnpm recovery:verify`
6. ตรวจผล PASS
7. เก็บหลักฐานวันเวลาและ snapshot
8. ลบ recovery resource เมื่อไม่ต้องการ หากนโยบายอนุญาต

---

## 27. Secret Management

ค่าต่อไปนี้เป็น secret และไม่ควร commit

- Database credentials
- Recovery database credentials
- LINE Channel Secret
- LINE Access Token
- Admin password
- Export signing secret
- Cron secret
- AI/voice provider credentials หากมี

ใช้ Hosting Environment Variables / Secret Manager

หลีกเลี่ยงการส่ง secret ผ่านแชทหรือ screenshot

---

## 28. Production Incident Checklist

ถ้าผู้ใช้แจ้งว่าระบบไม่ทำงาน ให้ตรวจตามลำดับ

1. `/api/health` เป็น `ok` หรือไม่
2. GitHub/Vercel deployment status สำเร็จหรือไม่
3. LINE webhook ยัง Verify และ signature ถูกต้องหรือไม่
4. Database เชื่อมได้หรือไม่
5. Scheduler เปิดอยู่หรือไม่
6. Delivery audit มี failed record หรือไม่
7. OCR/Vision/Voice provider มี error หรือไม่
8. ตรวจ latest webhook event
9. ตรวจ Audit log
10. ถ้าเป็น transaction หาย ให้ตรวจ Duplicate Protection และ soft-delete ก่อนแก้ข้อมูล

---

## 29. กรณี Receipt/OCR มีปัญหา

ตรวจ

- amount
- merchant
- dateText
- timeText
- category
- extraction status
- vault createdAt

ถ้าวันที่อ่านไม่ได้แต่เวลาเชื่อถือได้ ระบบอาจใช้ upload-date fallback ตาม safety window

ถ้าทั้งวันที่และเวลาไม่เชื่อถือ ระบบจะไม่เดาและจะขอวันที่จากผู้ใช้

ไม่ควรแก้ logic ให้ใช้ current date ทุกกรณี เพราะอาจทำให้บัญชีย้อนหลังผิดวัน

---

## 30. กรณี Voice มีปัญหา

ตรวจ

- LINE audio download
- permanent storage
- transcription provider
- transcript
- structured proposal
- voice status

ถ้าถอดเสียงไม่ได้ ระบบควรแจ้งผู้ใช้และไม่สร้าง transaction

ถ้าถอดได้แต่ไม่มีจำนวนเงิน/ประเภท ระบบต้องให้ผู้ใช้แก้ข้อความก่อนยืนยัน

---

## 31. กรณี Scheduler ไม่ส่ง Reminder

ตรวจ

1. Production mode
2. `cronConfigured`
3. automation setting `reminder-delivery-primary`
4. Scheduler enabled
5. `lastRunAt`
6. Reminder `nextRunAt`
7. Delivery attempt audit
8. LINE push result

Admin สามารถใช้ `ส่งรายการที่ถึงเวลา` เพื่อตรวจ manual delivery หลังวิเคราะห์แล้ว

---

## 32. Preview vs Production

Dashboard แยก Preview และ Production ชัดเจน

Preview ใช้ดู UI/ข้อมูลและ QA แต่ Scheduler เปิดไม่ได้

Production ใช้สำหรับ operation จริง

ถ้ามี draft ค้าง ระบบจะเตือนก่อนสลับ environment และมีตัวเลือก

- อยู่หน้านี้ต่อ
- สลับโดยไม่บันทึก
- บันทึกและสลับโหมด

---

## 33. การดูแล Git

แนวทางมาตรฐาน

1. ตรวจ `git status`
2. อย่าใช้ `git add .` โดยไม่ตรวจไฟล์
3. Stage เฉพาะไฟล์ที่ตั้งใจแก้
4. รัน `git diff --cached --check`
5. Commit ด้วยข้อความที่อธิบาย change
6. Push `main`
7. รอ deployment success
8. ตรวจ `/api/health`

ไฟล์ local/user-owned ที่เป็น untracked ไม่ควรถูก commit โดยอัตโนมัติ

---

## 34. การออก Release Tag

เมื่อ release ผ่าน QA และ deployment แล้ว สามารถ tag เช่น

`v1.0.0`

Tag ต้องชี้ commit ที่ผ่าน sign-off

v1.0.0 ปัจจุบันชี้ final sign-off commit ของ Milo Production

---

## 35. Operational Checklist รายวัน

- ตรวจ Production health
- ตรวจ failed delivery audit
- ตรวจ failed webhook event ที่ผิดปกติ
- ตรวจ scheduler last run
- ตรวจ error จาก provider หากมี user report

## 36. Operational Checklist รายสัปดาห์

- ตรวจ Audit log
- ตรวจ role/user ที่ไม่จำเป็น
- ตรวจ storage / attachment failures
- ตรวจ recurring transaction failures
- ตรวจ finance digest deliveries

## 37. Operational Checklist รายเดือน

- ทบทวน secrets และ access
- ตรวจ backup policy
- ทดสอบ recovery ตามรอบที่องค์กรกำหนด
- ตรวจ dependencies/security updates
- ตรวจ usage/cost ของ database, AI, OCR, voice และ hosting

---

## 38. Definition of Healthy Production

ถือว่าระบบ Healthy เมื่อ

- Health endpoint = ok
- Deployment = success
- Database = connected
- LINE = configured
- Webhook signature verification = active
- Cron = configured
- Duplicate protection = active
- Undo = active
- Regression tests = pass
- Recovery drill ล่าสุด = pass

---

## 39. ขอบเขตการดูแลข้อมูล

Admin ควรยึดหลัก

- Least privilege
- ไม่เปิดเผย LINE User ID โดยไม่จำเป็น
- ไม่แชร์ database connection string
- ไม่แก้ transaction จริงเพื่อทดสอบ หากสร้างข้อมูลทดสอบควรล้างและมี audit trail
- ใช้ soft-delete แทน hard-delete สำหรับข้อมูลธุรกรรม
- แยกบัญชีส่วนตัวและบัญชีกลุ่มเสมอ

---

## 40. Quick Admin Reference

| งาน | จุดที่ใช้ |
|---|---|
| ตรวจระบบ | `/api/health` |
| จัดการข้อมูล | `/dashboard` |
| เปิด Scheduler | Dashboard → การแจ้งเตือนอัตโนมัติ |
| รัน Reminder ทันที | `ส่งรายการที่ถึงเวลา` |
| เปิด/ปิด Digest | Dashboard → สรุปการเงินอัตโนมัติ |
| จัด User Role | Dashboard → ผู้ใช้และสิทธิ์ |
| ดู Audit | Dashboard → Audit log |
| จัดบัญชีกลุ่ม | Dashboard → กลุ่ม LINE |
| Release QA | `pnpm release:gate` |
| Recovery QA | `pnpm recovery:verify` |
| ดู Source | GitHub Repository |

---

เอกสารนี้อ้างอิง Milo v1.0.0, final sign-off และ Production state วันที่ 14 กันยายน 2569
