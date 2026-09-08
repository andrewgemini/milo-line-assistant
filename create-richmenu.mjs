New-Item -ItemType Directory -Force -Path scripts

Set-Content -Path scripts\create-richmenu.mjs -Value @'
import fs from 'fs';

let token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('LINE_CHANNEL_ACCESS_TOKEN=')) {
      token = trimmed.slice('LINE_CHANNEL_ACCESS_TOKEN='.length).trim();
      if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
        token = token.slice(1, -1);
      }
      break;
    }
  }
}

if (!token) {
  console.error("❌ Error: ไม่พบ LINE_CHANNEL_ACCESS_TOKEN ในไฟล์ .env");
  console.error("กรุณาเพิ่ม LINE_CHANNEL_ACCESS_TOKEN ใน .env ก่อนรันสคริปต์นี้");
  process.exit(1);
}

const richMenuConfig = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "Milo AI Financial OS - Master Rich Menu",
  chatBarText: "เมนูจัดการการเงินไมโล",
  areas: [
    { bounds: { x: 0, y: 0, width: 1270, height: 1030 }, action: { type: "message", label: "จดบันทึก", text: "จดบันทึก" } },
    { bounds: { x: 1270, y: 0, width: 615, height: 530 }, action: { type: "message", label: "สรุปการเงิน", text: "สรุป" } },
    { bounds: { x: 1885, y: 0, width: 615, height: 530 }, action: { type: "message", label: "วิเคราะห์การเงิน", text: "วิเคราะห์" } },
    { bounds: { x: 1270, y: 530, width: 615, height: 500 }, action: { type: "message", label: "งบประมาณ", text: "งบประมาณ" } },
    { bounds: { x: 1885, y: 530, width: 615, height: 500 }, action: { type: "message", label: "ประวัติรายการ", text: "รายการ" } },
    { bounds: { x: 0, y: 1030, width: 590, height: 656 }, action: { type: "message", label: "หมวดหมู่", text: "หมวดหมู่" } },
    { bounds: { x: 590, y: 1030, width: 560, height: 656 }, action: { type: "uri", label: "แดชบอร์ดหลังบ้าน", uri: "https://milo-line-app.vercel.app/dashboard" } },
    { bounds: { x: 1150, y: 1030, width: 570, height: 656 }, action: { type: "message", label: "วิธีใช้งาน", text: "วิธีใช้งาน" } },
    { bounds: { x: 1720, y: 1030, width: 780, height: 656 }, action: { type: "message", label: "สวัสดีไมโล", text: "สวัสดีไมโล" } }
  ]
};

async function main() {
  console.log("🚀 กำลังสร้าง LINE Rich Menu สำหรับน้องไมโล...");
  const createResp = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(richMenuConfig)
  });

  if (!createResp.ok) throw new Error(await createResp.text());
  const { richMenuId } = await createResp.json();
  console.log(`✓ สร้าง Rich Menu สำเร็จ: ${richMenuId}`);

  let imagePath = fs.existsSync("./richmenu_milo.png") ? "./richmenu_milo.png" : (fs.existsSync("./richmenu_milo.jpg") ? "./richmenu_milo.jpg" : null);
  if (imagePath) {
    console.log(`กำลังอัปโหลดรูปภาพ: ${imagePath}...`);
    const buffer = fs.readFileSync(imagePath);
    await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg' },
      body: buffer
    });
    console.log("✓ อัปโหลดรูปภาพสำเร็จแล้ว!");
  }

  await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log("🎉 เปิดใช้งาน Rich Menu เป็นค่าเริ่มต้นให้ผู้ใช้ทุกคนเรียบร้อยแล้ว!");
}

main().catch(err => console.error("❌ Error:", err.message));
'@