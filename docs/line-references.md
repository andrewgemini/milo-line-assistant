# LINE Messaging API References for Milo

| หัวข้อ | ข้อเท็จจริงที่นำไปใช้ | แหล่งข้อมูล |
|---|---|---|
| Webhook signature | ตรวจสอบ `x-line-signature` ด้วย HMAC-SHA256 ของ raw request body และ Channel secret ก่อนประมวลผล event | [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/) |
| Message and groups | LINE ส่ง webhook เมื่อมีข้อความในแชทส่วนตัวและกลุ่ม และรองรับ `webhookEventId` สำหรับกัน event ซ้ำ | [Receive messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) |
| Content retrieval | ใช้ message ID จาก webhook เพื่อดาวน์โหลดรูปและไฟล์จากผู้ใช้ก่อนเก็บลงคลังถาวร | [Receive messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) |
| Push/reply and groups | Messaging API มี endpoint สำหรับ reply, push และจัดการข้อมูลกลุ่มที่บอตอยู่ | [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/) |
| Mentions | Text message (v2) แทนข้อความใน `{...}` ด้วย mention หรือ emoji ได้ จึงใช้กับคำสั่งแจ้งเพื่อนในกลุ่ม | [Message types](https://developers.line.biz/en/docs/messaging-api/message-types/#text-messages) |
