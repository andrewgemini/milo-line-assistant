# ผลตรวจ production: 25 สิงหาคม 2026

| พื้นที่ตรวจ | ผลที่พบ | สถานะ |
|---|---|---|
| Landing Page ที่ `https://miloassist-suwp6bg2.manus.space/` | โหลดสำเร็จ แสดงภาษาไทย, Hero, CTA, เมนู anchor และ FAQ ครบ | ผ่านรอบแรก |
| Dashboard ที่ `/dashboard` | หน้าไม่ล็อกอินแสดง card “ยินดีต้อนรับสู่ไมโล” พร้อมปุ่มลงชื่อเข้าใช้และกลับหน้าแรก | ผ่านสำหรับ unauthenticated state |
| Scheduler fallback | เผยแพร่ checkpoint `a87e18b5` ที่เพิ่ม callback แบบรองรับ task ที่ลงทะเบียนและ mutation ผู้ดูแลแล้ว | รอทดสอบหลังล็อกอิน/LINE push |

## หลักฐานการทดสอบ reminder จริง

สร้าง reminder ทดสอบชั่วคราวหมายเลข `1` สำหรับ LINE account ที่เชื่อมแล้ว โดยกำหนด `nextRunAt` ให้ถึงเวลาในทันที หลัง deployment ใหม่ Heartbeat primary ตอบกลับ `200` และอัปเดต metadata เวลา `2026-08-25 07:24:47 UTC` จากนั้นระบบส่งรายการสำเร็จ โดยตาราง `reminders` บันทึก `lastDeliveredAt = 2026-08-25 07:28:32 UTC`, `lastDeliveryResult = sent`, `status = completed` และ `nextRunAt = NULL`.

> ผลนี้ยืนยันว่าเส้นทาง callback → ค้นหารายการค้าง → LINE Push → บันทึกสถานะการส่ง ทำงานครบวงจรแล้ว จะลบ reminder ทดสอบทันทีเพื่อไม่คงข้อมูลทดสอบในบัญชีผู้ใช้

## หลักฐาน delivery audit และ recovery

หลังเผยแพร่ delivery audit แล้ว สร้าง reminder ทดสอบชั่วคราวหมายเลข `60001` และพบ attempt log หมายเลข `1` ในเวลา `2026-08-25 07:43:35 UTC` โดยมี `runner = heartbeat`, `taskUid = LUxJ8ymCSGGpuVxdhmSqmT`, `status = sent`, ไม่มี error และจบการส่งในเวลา `07:43:36 UTC` พร้อมที่ reminder เปลี่ยนเป็น `completed` และ `lastDeliveryResult = sent` จากนั้นลบ reminder ทดสอบแล้ว เหลือรายการชื่อขึ้นต้น `[ทดสอบชั่วคราว]` เท่ากับ `0`.

Heartbeat primary ยังตอบ `200` พร้อมผลรูปแบบ `{"ok":true,"sent":0,"failed":0,"checked":0}` ในการรันที่ไม่มีรายการค้าง และ metadata แสดงว่า recovery task ทำงานใหม่ที่ `2026-08-25 07:31:24 UTC` แล้ว จึงยืนยันว่า task ทั้งสองเชื่อมกับ callback ใหม่ได้

## สถานะการตรวจ dashboard

หน้า `/dashboard` บน production แสดง unauthenticated state ถูกต้อง แต่ session browser ปัจจุบันยังไม่ได้ลงชื่อเข้าใช้ จึงยังรอการลงชื่อเข้าใช้ของเจ้าของโครงการเพื่อทดสอบเมนูที่ต้องใช้ข้อมูลจริง ปุ่มผู้ดูแล และการแสดงผลบน mobile ต่อไป

## ทดสอบสลิปผ่าน LINE หลังเผยแพร่

หลังผู้ใช้แจ้งว่าส่งรูปทดสอบแล้ว ตรวจฐานข้อมูล production ไม่พบ webhook event หรือ image extraction รายการใหม่ และ production log ไม่มี request webhook ในช่วงตรวจสอบ จึงยังไม่พบหลักฐานว่ารูปเดินทางถึง endpoint ของไมโล ต้องตรวจสถานะการเปิดใช้งาน webhook ใน LINE Developers Console อีกครั้งก่อนทดสอบซ้ำ

หลังลงชื่อเข้าใช้ LINE Developers Console ตรวจพบว่า Webhook URL ชี้ไปยัง endpoint production ของไมโล, สวิตช์ Use webhook เปิดอยู่ และอนุญาตให้ bot เข้าร่วมกลุ่มแล้ว จึงต้องทดสอบส่งรูปใหม่หลัง deployment ล่าสุดหรือดูผล Verify โดยไม่เปิดเผย credential ของ channel

การทดสอบหลังแก้ LINE data API สำเร็จ: ระบบรับ event รูป, เก็บ media, วิเคราะห์เป็นสลิปค่าใช้จ่าย, รอและรับคำยืนยันจากผู้ใช้ แล้วบันทึกธุรกรรมพร้อมยอด หมวดหมู่ วันที่ และรายละเอียดร้านค้า/วิธีชำระในฐานข้อมูล production ได้จริง

หน้า dashboard production โหลดข้อมูลผู้ใช้ที่เชื่อม LINE สำเร็จ พบ sidebar/menu ครบทั้งภาพรวม การเตือน คลังไฟล์ โน้ตและงาน รายรับรายจ่าย กลุ่ม LINE และมีปุ่มเปิด scheduler/ส่งรายการที่ถึงเวลา พร้อมปุ่มลบ reminder และฟอร์มสร้าง reminder ขณะนี้กำลังทดสอบปฏิสัมพันธ์แต่ละเมนูต่อ

ทดสอบ sidebar “การเตือน” และ “คลังไฟล์” แล้ว ทั้งสองปุ่มนำผู้ใช้ไปยังส่วนจัดการ reminder และส่วนค้นหาคลังตามลำดับโดยไม่มี error หรือ loading ค้าง

ทดสอบ sidebar “โน้ตและงาน” และ “รายรับรายจ่าย” แล้ว ทั้งสองปุ่มเลื่อนไปยังการ์ดงาน/โน้ต และสรุปการเงิน/กราฟรายจ่ายตามลำดับโดยไม่มี error หรือ loading ค้าง

เมนู “กลุ่ม LINE” พบปุ่มและ section เป้าหมาย `#groups` ใน DOM ครบ การคลิกผ่าน browser automation มีข้อผิดพลาด fetch แต่การตรวจ DOM ยืนยันว่าผูก target อยู่ ต่อมาตรวจ scroll container แล้วพบว่าหน้าเต็มสูง 1,127px เทียบ viewport 1,100px และ section อยู่ใน viewport อยู่แล้ว จึงไม่เกิดการเลื่อนเพิ่มเติมตามพฤติกรรมปกติ ไม่ใช่ bug ของ navigation

ทำ integration check เพิ่มโดยเพิ่มพื้นที่ท้ายหน้าเฉพาะ browser runtime ให้ target อยู่นอก viewport แล้วทดสอบทุกปุ่ม ทั้ง sidebar และ mobile navigation: `overview`, `reminders`, `vault`, `tasks`, `finance`, `groups` ถูกคลิกครบ และทุก target มาอยู่ที่ top 96px หลัง smooth scroll โดยมี scroll position แตกต่างตามตำแหน่ง section จึงยืนยันการนำทางจริงได้ครบทุกเมนู

รอบทดสอบปุ่ม “ส่งรายการที่ถึงเวลา” หลังผู้ใช้ยืนยัน พบว่า dashboard session ปัจจุบันไม่แสดงปุ่ม scheduler แม้เชื่อม LINE แล้ว จึงต้องตรวจ role ของบัญชีเจ้าของก่อนจึงจะทดสอบ mutation ผ่าน UI ได้

หลังผู้ใช้ยืนยันการยกระดับบัญชีเป็น admin ปุ่ม scheduler ปรากฏแล้ว แต่ mutation “ส่งรายการที่ถึงเวลา” ยังตอบว่าเฉพาะผู้ดูแลโครงการเท่านั้น จึงมีความไม่สอดคล้องระหว่างเงื่อนไข UI กับ backend authorization และต้องแก้ก่อนทดสอบ delivery ต่อ

แก้การ sync profile ซ้ำไม่ให้เขียนทับ role แล้วเผยแพร่ใหม่ ยืนยันว่า dashboard แสดงปุ่ม scheduler สำหรับ admin และปุ่ม “ส่งรายการที่ถึงเวลา” ส่ง reminder ผ่าน manual runner สำเร็จ 1 รายการบน production (`sent`), จากนั้นลบ reminder ทดสอบและ audit record ที่เกี่ยวข้องแล้ว

เมื่อทดสอบปุ่ม “เปิด scheduler” ทันทีหลังเผยแพร่การแก้ reuse task พบ HTTP 409 ชื่อ `milo-reminder-delivery` ซ้ำ ซึ่งบ่งชี้ว่า production instance ยังรับโค้ดก่อน deployment switch (ยังอ่าน metadata key เดิม) จึงยังไม่สรุปผลและต้องรอ production รุ่นล่าสุดก่อนทดสอบซ้ำ

หลัง production switch เป็นรุ่นล่าสุด การคลิกปุ่ม “เปิด scheduler” เริ่ม request พร้อม session token แต่ UI ค้างที่ “กำลังประมวลผล” และ production log มีเพียง `[Milo Scheduler] Setup requested` โดยยังไม่มีผล update หรือ error จึงต้องตรวจ wrapper `updateHeartbeatJob` และกำหนด timeout ที่เหมาะสมก่อนปิด QA

หลังเพิ่ม timeout และรอ deployment จริง พบว่า scheduler update จบสำเร็จ: production log แสดง `[Milo Scheduler] Updated { taskUid: 'FcYdWgCGv54PTya6Fs9XX4' }` ภายในประมาณ 1 วินาที จึงยืนยันว่า UI ใช้ Heartbeat primary เดิม ไม่สร้าง task ซ้ำ และปุ่มกลับสู่สถานะปกติหลังการเรียกเสร็จ

ภาพ QA mobile แสดง navigation และข้อมูล dashboard ปกติ แต่ไม่พบปุ่ม scheduler เพราะ control อยู่เฉพาะ sidebar desktop จึงต้องเพิ่มทางเข้าบน mobile ก่อนทดสอบ scheduler mobile ได้ครบถ้วน

หลังเพิ่ม SchedulerCard ใน mobile navigation ภาพ viewport 390×844 แสดงการ์ด “การแจ้งเตือนอัตโนมัติ” พร้อมปุ่ม “เปิด scheduler” และ “ส่งรายการที่ถึงเวลา” ครบ โดยใช้ mutation handler ชุดเดียวกับ desktop ที่ตรวจ manual delivery และ update primary task สำเร็จแล้ว

ทดสอบคลิก “เปิด scheduler” ผ่าน mobile control ที่มี handler เดียวกับ production แล้วพบว่า request เริ่มทำงานจริง แต่ UpdateHeartbeatJob บางครั้งตอบช้ากว่า 20 วินาที ระบบจึงแสดงข้อความ `Heartbeat UpdateHeartbeatJob timed out after 20 seconds` และปลดสถานะ pending ถูกต้อง ไม่ค้าง UI อย่างไรก็ตาม task primary เปิดใช้อยู่แล้ว จึงควรทำปุ่มเป็น idempotent และไม่ส่ง update ซ้ำเมื่อ metadata ระบุว่า task active

หลังเผยแพร่ mutation idempotent แล้ว ทดสอบคลิก “เปิด scheduler” จาก mobile control ใน session production ได้จริง: log แสดง `[Milo Scheduler] Already active { taskUid: 'FcYdWgCGv54PTya6Fs9XX4' }` ทันที โดยไม่มี UpdateHeartbeatJob และปุ่มกลับสู่สถานะพร้อมกด จึงยืนยัน mobile control, session, และ status path ของ task active ได้ครบ

Visual QA กราฟการเงิน: desktop แสดงบัตรสรุปและแผง analytics แยกกราฟแนวโน้ม/สัดส่วนได้ชัดเจนตามลำดับข้อมูลจริง ส่วน mobile เรียง navigation, control และบัตรสถิติโดยไม่ล้นแนวนอน เมื่อไม่มีธุรกรรมใน 7 วัน ระบบแสดง empty state แทนเส้นศูนย์และแกนตัวเลขที่อาจทำให้ตีความเป็นข้อมูลจำลอง

แก้การเข้าถึงแผงกราฟ: ย้าย “วิเคราะห์การเงิน” ไว้ใต้บัตรสรุปบนสุดของ dashboard และกำหนดให้เมนู “รายรับรายจ่าย” เลื่อนไปยังแผงนี้โดยตรง ผลตรวจภาพ desktop และ mobile ยืนยันว่าแผงแสดงทันทีหลังบัตรสรุป โดยข้อมูลจริงของบัญชี dashboard ปัจจุบันยังไม่มีธุรกรรม จึงแสดง empty state ตามเจตนา

Landing Page production: เมนู “ความสามารถ” พาไปยังส่วน `#features` และเมนู “สำหรับกลุ่ม” พาไปยังส่วน `#groups` ถูกต้อง โดยรักษา header และตำแหน่ง section ให้อ่านต่อเนื่องได้

เมนู “คำถามที่พบบ่อย” พาไปยัง `#faq` สำเร็จ และ accordion คำถามการตั้งเตือนเปิดเผยคำตอบได้จริงบน production

ภาพ mobile viewport 390×844 แสดง Hero, CTA, feature cards, ส่วนกลุ่ม, FAQ และ CTA ปิดท้ายเป็นลำดับเดียวโดยไม่มีองค์ประกอบล้นแนวนอน โดยทุก CTA เข้าสู่เส้นทาง `/dashboard` ที่ทดสอบหน้า sign-in แล้ว

ทดสอบ desktop dashboard หลัง deployment idempotent: ปุ่ม “เปิด scheduler” เปลี่ยนเป็นสถานะกำลังประมวลผลชั่วครู่ แล้วกลับเป็นปกติพร้อม toast `ตั้ง scheduler แล้ว (already-active)` ยืนยันว่า primary task ที่เปิดอยู่ไม่ถูก update ซ้ำ

ในการสร้าง reminder QA รอบแรก ค่า datetime ที่กรอกถูกตีความเป็น UTC และ dashboard แสดงเวลาไทยเร็วกว่า 7 ชั่วโมง ทำให้ปุ่มส่งรายการที่ถึงเวลาแจ้งว่าไม่มีรายการค้าง จึงจะลบรายการนี้และสร้างรายการทดสอบใหม่ด้วยเวลา UTC ที่ตรงกับเวลาไทยก่อนสั่งส่ง

ปุ่มลบ reminder บน desktop dashboard ตอบ toast “ลบรายการเตือนแล้ว” และหลัง refresh ข้อมูล รายการ `[ทดสอบชั่วคราว] QA ลบ reminder` หายจาก UI โดยจำนวน reminder กลับจาก 2 เป็น 1 ยืนยัน mutation ลบและการ refresh ข้อมูลหลังสำเร็จ

QA รอบส่ง: สร้าง reminder ชั่วคราวด้วยเวลา UTC ที่ตรงกับเวลาประเทศไทยจนปรากฏเป็นรายการค้าง จากนั้นสั่ง “ส่งรายการที่ถึงเวลา” แล้ว delivery audit บันทึก `runner = manual` แต่การส่งถูก LINE API ปฏิเสธด้วย HTTP 400 เพราะค่า LINE User ID ที่เชื่อมกับ dashboard ไม่ถูกต้อง รายการ QA ถูกลบออกจาก dashboard แล้วและจะล้าง audit record ของการทดสอบนี้ต่อไป

แก้การป้องกันบัญชี LINE: API รับเฉพาะ LINE User ID รูปแบบ `U` ตามด้วยอักขระ hexadecimal 32 ตัว และ dashboard มีปุ่มแก้ไขบัญชี LINE พร้อม form ที่ปิดการบันทึกจนกว่ารูปแบบถูกต้อง ชุดทดสอบครอบคลุมทั้ง ID ที่ถูกต้องและ malformed ID แล้ว

ผู้ใช้ให้ LINE User ID ที่ยืนยันแล้วและเชื่อมใหม่ผ่าน dashboard สำเร็จ (toast “เชื่อมบัญชี LINE แล้ว”) การตรวจฐานข้อมูลแบบไม่เปิดเผยค่าเต็มยืนยันว่ารหัสที่เก็บมีความยาว 33 ตัวและขึ้นต้นด้วย `U` จึงผ่านรูปแบบทางการ

ตรวจ end-to-end หลังเชื่อมใหม่: dashboard ดึง reminder, vault และธุรกรรมจริงของบัญชี LINE ได้ พร้อมแสดงกราฟแนวโน้มและกราฟโดนัทจากข้อมูลจริง สร้าง reminder QA ที่ถึงกำหนดและสั่งจากปุ่มผู้ดูแลแล้ว dashboard ตอบ `ส่ง reminder แล้ว 1 รายการ` สำเร็จ จึงยืนยัน push delivery ด้วยบัญชีที่เชื่อมใหม่ ก่อนทำความสะอาดข้อมูลทดสอบ

หลังยืนยัน delivery ลบ reminder QA และ delivery audit ที่เกี่ยวข้องออกจากฐานข้อมูล แล้ว refresh dashboard พบว่ารายการทดสอบไม่ปรากฏและ reminder จริง 4 รายการยังคงอยู่ จึงไม่มีข้อมูลทดสอบค้าง

ผู้ใช้ตั้ง reminder “ประชุม 14.30” เมื่อ 26 สิงหาคม 2569 และยืนยันว่าเป็นรายการจริง สถานะปัจจุบัน active และยังไม่ถึงเวลา จึงคงรายการนี้ไว้ตามเดิม ไม่ใช้ในการทดสอบ scheduler และไม่ลบหรือแก้ไข

สร้างและส่งมอบ poster ประกาศกิจกรรมจากภาพโบสถ์ที่ผู้ใช้ส่งแล้ว ในสัดส่วน 4:5 พร้อมข้อความ “เปิดลงทะเบียนพร้อมกัน”, วันที่ 27 สิงหาคม 2569, เวลา 14:00 น. เป็นต้นไป และข้อความปิดท้ายตามที่กำหนด

หลักฐาน QA ที่ยังขาด: scheduler card ผ่านภาพ responsive mobile และปุ่มเปิด scheduler ตอบ `already-active` แล้ว แต่ยังไม่มีหลักฐาน push delivery ที่สั่งจาก mobile viewport จริงโดยไม่ใช้ reminder จริงของผู้ใช้ ส่วน mutation dashboard มี test/build และ UI feedback ครบ แต่ยังไม่ได้สร้างกรณีผิดพลาดจริงของทุก mutation บนบัญชี production เพื่อหลีกเลี่ยงการแก้ไขข้อมูลจริงโดยไม่จำเป็น

ตรวจคำสั่งจากเมนูช่วยเหลือ: regression suite ครอบคลุมเตือนครั้งเดียวและทุก N นาที, รายจ่าย/รายรับ, โน้ต, งาน, เก็บข้อความ/ลิงก์, ค้นหา, เพิ่ม/ดูหมวด, help และยืนยันค่าใช้จ่ายจากรูป โดย integration test ของ webhook ตรวจว่าคำสั่งส่งต่อไปยัง persistence และ LINE reply ที่ตรง workflow ทั้งหมด ชุดทดสอบรวม 49 กรณีผ่าน พร้อม TypeScript และ production build

ตรวจ production แบบอ่านอย่างเดียว: dashboard เชื่อมบัญชี LINE แล้วและแสดง 6 reminder ที่ active, 3 ธุรกรรม, 4 รายการในคลัง และกราฟการเงินจริงจากข้อมูลบัญชีที่เชื่อมอยู่ ฐานข้อมูลมี webhook ที่ processed 29 รายการ (ล่าสุด 26 สิงหาคม 2569 07:24 UTC), ignored 5 รายการ และ failed 2 รายการจากประวัติเดิม พร้อม automation settings หลักและกู้คืนที่เปิดใช้งานและมี task UID ครบทั้งคู่

ตรวจ failure history แล้วพบเพียง LINE API 404 สองรายการเมื่อ 25 สิงหาคม 2569 ก่อนเปลี่ยน endpoint media เป็น `api-data.line.me`; ไม่มี failure ใหม่หลังการแก้และการทดสอบรูปบน production ผ่านแล้ว

หลัง deploy รุ่นล่าสุด dashboard production เปลี่ยนจาก loading state เป็นข้อมูลจริงสำเร็จ แสดงสถานะเชื่อม LINE, reminder, คลัง, กลุ่ม และกราฟการเงินโดยไม่มี error ที่มองเห็นได้ ฟอร์มสร้าง reminder รุ่นใหม่ใช้การแปลงเวลา Asia/Bangkok แล้ว แต่ reminder ที่สร้างก่อนการแก้ยังคงแสดง 21:00 น. จึงรอผู้ใช้ยืนยันเวลาเป้าหมายก่อนแก้ข้อมูลเดิม

ผู้ใช้ยืนยันให้แก้ reminder จริง “ประชุม 14.25” และ “ประชุม 14.30” เป็น 14:25 และ 14:30 น. วันนี้ตามเวลาไทย พร้อมเลือกให้ส่งทันที จึงปรับ timestamp เป็น 07:25 และ 07:30 UTC ตามลำดับ จากนั้นปุ่มผู้ดูแลส่งได้สำเร็จทั้งสองรายการ; delivery audit บันทึก `runner=manual`, `status=sent` และรายการเปลี่ยนเป็น `completed` ไม่มี error

ตรวจ mutation dashboard เพิ่มเติม: แก้ปุ่มทำ To-do และแก้ไขคลังให้ล็อก interaction ทั้งส่วนขณะ mutation pending พร้อม overlay “กำลังบันทึกข้อมูล...” และ `aria-busy` เพื่อป้องกันการกดซ้ำ Regression suite รวม 50 กรณี, TypeScript และ production build ผ่าน

แหล่งประกาศลงทะเบียน: ผู้ใช้ส่งภาพประกาศต้นทาง ยืนยันได้เฉพาะ “กิจกรรมพิเศษ”, เปิดลงทะเบียนพร้อมกันวันที่ 27 สิงหาคม 2569 เวลา 14:00 น. เป็นต้นไป และข้อความให้เตรียมข้อมูลให้พร้อม ภาพไม่มี URL, ขั้นตอนลงทะเบียน หรือรายการเอกสาร จึงยังไม่สามารถสรุปขั้นตอนหรือเฝ้าติดตามการเปลี่ยนแปลงจากแหล่งออนไลน์ได้

Incident “ประชุม 17.25”: ตรวจพบว่า reminder ถูกสร้างจากข้อความ LINE เวลา 17:21 UTC โดย parser เดิมตีความ `17.25` เป็น 17:00 UTC และเก็บ timestamp เป็น 17:00 UTC ซึ่งเท่ากับ 00:00 ของวันถัดไปตามเวลาไทย จึงยังไม่ถึงกำหนดและไม่มี delivery attempt แก้ parser ให้รองรับรูปแบบ `17.25`, ลบเวลาออกจากหัวข้อ และคำนวณวัน/เวลาตาม Asia/Bangkok แล้ว เพิ่ม regression test สำหรับกรณีนี้ ชุดทดสอบรวม 51 กรณี, TypeScript และ build ผ่าน

หลังผู้ใช้ยืนยันให้ส่งรายการเดิมทันที ปรับรายการให้ถึงกำหนดและตรวจ delivery audit พบ `runner=heartbeat`, `status=sent` จากนั้นรายการเปลี่ยนเป็น `completed`; ผู้ใช้ยืนยันว่าได้รับแจ้งเตือนบน LINE แล้ว

ตรวจสุขภาพ production รอบล่าสุดแบบอ่านอย่างเดียว: มี reminder 9 รายการ (active 5, completed 4), ธุรกรรมจริง 3 รายการ, webhook event 39 รายการ และ delivery audit 5 รายการ โดย scheduler primary และ recovery เปิดใช้งานอยู่ การตรวจ TypeScript, Vitest, build, webhook, database, scheduler และ dashboard/กราฟจากข้อมูลจริงจึงผ่านในขอบเขตที่ไม่แก้ข้อมูลผู้ใช้

Browser QA mutation: ผู้ใช้อนุญาตให้สร้าง reminder `[QA] ตรวจ mutation dashboard` ผ่าน dashboard production เพื่อตรวจ success/pending พบปุ่มเปลี่ยนเป็น “กำลังเพิ่ม...” และล็อกฟอร์มระหว่างส่ง จากนั้นรายการเพิ่มสำเร็จ ฟอร์มถูกล้าง และจำนวน active reminders เพิ่มเป็น 5 รายการ ทดสอบลบผ่าน UI ได้ toast “ลบรายการเตือนแล้ว” และ refresh ยืนยันว่ารายการ QA หาย จำนวน active กลับเป็น 4 รายการ โดย empty state ของ To-do และโน้ตแสดงได้ตามปกติ

ทดสอบกรณีล้มเหลวแบบจำลองใน browser แล้วคืนค่า network handler และ refresh dashboard ทันทีเพื่อไม่ให้ state จำลองค้าง โดยยืนยันว่าข้อมูลจริงกลับมี active reminders 4 รายการเช่นเดิม อย่างไรก็ดี response simulation ของ tRPC ใน browser ไม่ตรง transport จริงและจึงไม่ถือเป็นหลักฐาน error-state ที่สมบูรณ์; คงต้องเก็บผล error แบบ browser ต่อในครั้งที่มีกรณี error ที่ปลอดภัย

ทดสอบ error state ซ้ำด้วยการตัดเฉพาะ POST ของ tRPC ที่ browser ก่อนคำขอถึง production: ฟอร์ม reminder แสดง toast `QA simulated network failure`, ปลดล็อกปุ่มกลับเป็น “เพิ่ม” และคงข้อความ/เวลาที่ผู้ใช้กรอกไว้ จึงยืนยันว่า error handling และ draft retention ทำงานโดยไม่สร้าง reminder จริง จากนั้นคืนค่า network handler แล้ว

หลังรีเฟรช dashboard เพื่อจบรอบ error simulation ระบบกลับสู่ข้อมูลจริงตามปกติ โดยมี reminder ที่ใช้งาน 4 รายการและไม่มีรายการ QA คงค้าง

สรุปรอบ QA mutation ล่าสุด: production browser ยืนยัน loading, success, error, empty และ cleanup ของ flow reminder ได้ครบ; test/build ล่าสุดผ่าน 16 files และ 51 tests ส่วนปุ่มแก้ไขแท็ก/ลิงก์คลังใช้ native browser prompt ซึ่ง browser automation เปิด interactive prompt ไม่ได้และจึง timeout โดยไม่พบหลักฐานว่า logic backend หรือข้อมูลคลังเสียหาย จัดเป็นข้อจำกัดของวิธีทดสอบปัจจุบัน และมีรายการปรับเป็น dialog เพื่อให้ accessibility และ QA ในอนาคตดีขึ้น

ตรวจ mutation dashboard: ฟอร์ม reminder ตรวจชื่อก่อนส่งและเก็บข้อความ/เวลาไว้จน mutation สำเร็จ ปุ่มสร้าง ลบ และเชื่อม LINE ถูกปิดระหว่างทำงานพร้อมสถานะ `aria-busy` และข้อความกำลังดำเนินการ ส่วน success/error ของ mutation หลักยังแจ้งผ่าน toast และ refresh query หลังสำเร็จ ชุดทดสอบ helper ของ draft ครอบคลุมการ trim, การปฏิเสธชื่อว่าง และการล้างหลัง success

เพิ่ม pending feedback ที่เหลือ: การทำ To-do และการแก้ไขคลังใช้ mutation lifecycle ระบุรายการที่กำลังทำงาน แสดง status กลาง และครอบหน้าจอชั่วครู่เพื่อป้องกันการกดซ้ำ ขณะที่ interface ปกติและกราฟข้อมูลจริงแสดงผลตามปกติในการตรวจภาพ desktop

> การตรวจ dashboard ส่วนที่ต้องใช้ข้อมูล LINE และปุ่มผู้ดูแลยังต้องทำใน session ที่ลงชื่อเข้าใช้ของเจ้าของโครงการ จึงยังไม่ถือเป็นผลยืนยัน end-to-end
