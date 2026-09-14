# Milo v1.2.0 — Multi-Storage Vault

รุ่นนี้ทำให้ Durable Vault ของ Milo ไม่ผูกกับ storage backend เดียวอีกต่อไป และเพิ่มทางเลือกสำหรับองค์กรหรือผู้ใช้ที่ต้องการควบคุมพื้นที่จัดเก็บเอง

## เพิ่มใหม่

- Google Drive storage ผ่าน Google Cloud service account + โฟลเดอร์ที่กำหนด
- S3-compatible storage รองรับ AWS S3, Cloudflare R2 และ MinIO
- Forge storage เดิมยังใช้งานต่อได้
- `MILO_STORAGE_PROVIDER=auto|forge|s3|google-drive`
- storage key แบบมี provider prefix: `forge:`, `s3:`, `gdrive:`
- download proxy กลาง `/api/milo/storage/:key`
- รองรับ legacy Forge keys เดิมโดยไม่ต้อง migrate ข้อมูลเก่า
- Health endpoint รายงาน provider ที่ร้องขอ, provider ที่ active และ providers ที่ configure แล้ว โดยไม่แสดง secret

## Security

- Google Drive access token ถูกสร้างและใช้ฝั่ง server เท่านั้น
- ใช้ OAuth scope `drive.file`
- private key / S3 secret ไม่ถูกเก็บใน Git หรือส่งออกใน health response
- ไฟล์ Google Drive ถูกอ่านผ่าน Milo proxy เพื่อไม่เปิด bearer token ต่อผู้ใช้

## Production behavior

หาก provider ที่เลือกยังไม่ได้ตั้ง credential ครบ Milo จะไม่บอกผู้ใช้ว่าไฟล์ถูกเก็บถาวร ทั้งระบบยังประมวลผล LINE media จาก bytes ที่รับมาได้ตาม fallback เดิม และจะแจ้งสถานะ storage ตามจริง

ดูวิธีตั้งค่าที่ `STORAGE-PROVIDERS-v1.2.0.md`.
