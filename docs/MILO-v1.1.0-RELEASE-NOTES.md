# Milo v1.1.0 — Chat-First Core

วันที่: 14 กันยายน 2569

## เป้าหมายของรุ่นนี้

ทำให้ Milo ตรงกับ Product Concept หลัก: **เตือน · เก็บ · จัดการ · จดเงิน ภายใน LINE แชทเดียว** ทั้งแชทส่วนตัวและกลุ่ม LINE

## สิ่งที่เพิ่ม

### Calendar ใน LINE

- `ลงปฏิทิน ประชุมทีมพรุ่งนี้ 10:30`
- `นัดหมอ วันที่ 20/09/2569 14:00 ถึง 15:30`
- `ดูปฏิทิน`
- `ยกเลิกนัด #12`
- สร้าง Milo Calendar Event จริงในฐานข้อมูล
- ส่ง Google Calendar template URL
- ส่ง signed `.ics` สำหรับ Apple Calendar / Outlook

### Reminder Management ในแชท

- `รายการเตือน`
- `ยกเลิกเตือน #7`
- ในกลุ่มสามารถดู Reminder ของกลุ่มได้
- การยกเลิกจำกัดกับ Reminder ที่ผู้ใช้นั้นสร้าง เพื่อป้องกันสมาชิกคนอื่นลบโดยไม่ตั้งใจ

### To-do Management ในแชท

- `งาน ส่งรายงาน`
- `ดูงาน`
- `งานทั้งหมด`
- `เสร็จงาน #9`
- ในกลุ่ม To-do ใช้ขอบเขตของกลุ่มนั้น

### Shared Group Vault

- `@ไมโล เก็บ ...`
- `@ไมโล ค้นหา ...`
- การค้นหาในกลุ่มค้นเฉพาะข้อมูลใน `lineChatId` ของกลุ่ม ไม่ดึง Vault ส่วนตัวเข้ามาปะปน
- `สถานะคลัง` แสดงจำนวนรายการที่สำรองถาวรแล้วและ media ที่ควรส่งใหม่

### Durable Storage UX

ระบบจะไม่อ้างว่า media ถูกเก็บถาวรหาก object storage upload ไม่สำเร็จ แต่จะแจ้งผู้ใช้ให้ส่งไฟล์ใหม่ โดยยังประมวลผลจาก LINE bytes ต่อได้เมื่อทำได้

### Group Assistant Guide

- `ผู้ช่วยกลุ่ม`
- แนะนำวิธีใช้ `@ไมโล`
- Reminder, Vault/Search, Calendar, To-do, Mention/Tag และ Group Finance อยู่ใน flow เดียวกัน

### Landing Page / Product Language

ปรับหน้า Home จาก generic business assistant เป็น Milo Chat-First Personal Assistant โดยยึด 5 เสาหลัก:

1. 🔔 เตือน
2. 🗂️ เก็บ
3. 👥 กลุ่ม
4. ✅ จัดการชีวิต/งาน
5. 💰 การเงิน

## ข้อจำกัดที่ตั้งใจไว้

Google Calendar รุ่นนี้เป็น **one-tap Add Event link** ไม่ใช่ background OAuth sync เพราะการเขียนลง Google account โดยตรงต้องให้เจ้าของบัญชีอนุญาต OAuth ก่อน

คำว่า “เก็บถาวร” สำหรับ media ใช้เฉพาะกรณีที่ object storage คืน `storageKey` สำเร็จ และอยู่ภายใต้นโยบาย retention ของผู้ให้บริการ storage

## Compatibility

ฟีเจอร์การเงินเดิม, Receipt/Slip OCR, Voice, PDF, Budget, Group Finance, Duplicate Protection, Undo, Audit Log และ Production Security ยังทำงานต่อเนื่องเหมือน v1.0.0
