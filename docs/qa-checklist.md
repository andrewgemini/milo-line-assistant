# Milo MVP — QA Checklist

| พื้นที่ตรวจ | สถานะ | หลักฐาน/หมายเหตุ |
|---|---:|---|
| Landing Page desktop | ผ่าน | Hero, CTA, feature cards, FAQ และ CTA ท้ายหน้าแสดงครบ |
| Landing Page mobile | ผ่าน | เนื้อหาเรียงลำดับและอ่านได้ที่ความกว้าง 375px |
| Dashboard desktop | ผ่าน | สถานะบัญชี LINE เชื่อมแล้ว, cards, forms และ empty states แสดงครบ |
| Dashboard mobile | ผ่าน | มีเมนูเลื่อนแนวนอนสำหรับไปยังแต่ละส่วนข้อมูล |
| เมนู sidebar | อยู่ระหว่างเผยแพร่ | ปรับให้เลื่อนไปยัง section จริงในเวอร์ชันพัฒนาแล้ว ต้องตรวจหลังเผยแพร่ |
| Reminder create/delete | อยู่ระหว่างเผยแพร่ | เพิ่ม API และ UI ลบเพื่อรองรับการทดสอบส่งแจ้งเตือนแบบไม่เหลือข้อมูล |
| LINE webhook | ผ่าน | ตั้งค่า URL production และ Verify ผ่าน LINE Developers Console |
| Heartbeat scheduler | ผ่านบางส่วน | callback สำเร็จและบันทึกเวลาแล้ว; ต้องสร้าง reminder จริงเพื่อยืนยัน push message `sent > 0` |
| LINE message end-to-end | รอทดสอบ | ต้องส่งข้อความจากบัญชี LINE ที่เชื่อมอยู่และตรวจการตอบกลับของไมโล |
