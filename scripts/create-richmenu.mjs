/**
 * Milo AI Financial OS - LINE Rich Menu Auto-Setup Script
 * -------------------------------------------------------------
 * สคริปต์ยิง LINE Messaging API สร้าง Rich Menu พิกัดปุ่มย่อยครบวงจร 2500x1686 px
 * รองรับการลบเมนูเก่า อัปโหลดรูปภาพ และเปิดใช้งานเป็น Default ให้ผู้ใช้ทุกคนทันที
 */

import fs from 'fs';
import path from 'path';

// 1. ดึง Token จาก .env หรือ Environment
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
  console.error("❌ Error: ไม่พบ LINE_CHANNEL_ACCESS_TOKEN ในไฟล์ .env หรือ Environment Variable");
  console.error("กรุณาเพิ่ม LINE_CHANNEL_ACCESS_TOKEN ใน .env ก่อนรันสคริปต์นี้");
  process.exit(1);
}

// 2. โครงสร้าง Rich Menu ขนาดมาตรฐาน 2500 x 1686 px พร้อมจับพิกัดปุ่มย่อยทั้งหมด 9 ปุ่ม
const richMenuConfig = {
  size: {
    width: 2500,
    height: 1686
  },
  selected: true,
  name: "Milo AI Financial OS - Master Rich Menu",
  chatBarText: "เมนูการเงิน",
  areas: [
    // ---------------------------------------------------------
    // โซนที่ 1: การ์ดใหญ่บนซ้าย - จดบันทึกรายรับ-รายจ่าย
    // ---------------------------------------------------------
    {
      bounds: { x: 0, y: 0, width: 1270, height: 1030 },
      action: {
        type: "message",
        label: "จดบันทึก",
        text: "จดบันทึก"
      }
    },
    // ---------------------------------------------------------
    // โซนที่ 2: การ์ดบนขวาช่อง 1 - สรุปยอดภาพรวมประจำเดือน
    // ---------------------------------------------------------
    {
      bounds: { x: 1270, y: 0, width: 615, height: 530 },
      action: {
        type: "message",
        label: "สรุปการเงิน",
        text: "สรุป"
      }
    },
    // ---------------------------------------------------------
    // โซนที่ 3: การ์ดบนขวาช่อง 2 - วิเคราะห์การเงิน & AI CFO Insight
    // ---------------------------------------------------------
    {
      bounds: { x: 1885, y: 0, width: 615, height: 530 },
      action: {
        type: "message",
        label: "วิเคราะห์การเงิน",
        text: "วิเคราะห์"
      }
    },
    // ---------------------------------------------------------
    // โซนที่ 4: การ์ดกลางขวาช่อง 1 - งบประมาณ & หมวดหมู่รายจ่าย
    // ---------------------------------------------------------
    {
      bounds: { x: 1270, y: 530, width: 615, height: 500 },
      action: {
        type: "message",
        label: "งบประมาณ",
        text: "งบประมาณ"
      }
    },
    // ---------------------------------------------------------
    // โซนที่ 5: การ์ดกลางขวาช่อง 2 - ประวัติรายการธุรกรรมล่าสุด
    // ---------------------------------------------------------
    {
      bounds: { x: 1885, y: 530, width: 615, height: 500 },
      action: {
        type: "message",
        label: "ประวัติรายการ",
        text: "รายการ"
      }
    },
    // ---------------------------------------------------------
    // โซนที่ 6: แถบล่างช่อง 1 - จัดการประเภท / หมวดหมู่
    // ---------------------------------------------------------
    {
      bounds: { x: 0, y: 1030, width: 590, height: 656 },
      action: {
        type: "message",
        label: "หมวดหมู่",
        text: "หมวดหมู่"
      }
    },
    // ---------------------------------------------------------
    // โซนที่ 7: แถบล่างช่อง 2 - เปิด Web Dashboard หลังบ้านไมโล
    // ---------------------------------------------------------
    {
      bounds: { x: 590, y: 1030, width: 560, height: 656 },
      action: {
        type: "uri",
        label: "แดชบอร์ดหลังบ้าน",
        uri: "https://milo-line-app.vercel.app/dashboard"
      }
    },
    // ---------------------------------------------------------
    // โซนที่ 8: แถบล่างช่อง 3 - วิธีใช้งาน & แนะนำคำสั่งบอต
    // ---------------------------------------------------------
    {
      bounds: { x: 1150, y: 1030, width: 570, height: 656 },
      action: {
        type: "message",
        label: "วิธีใช้งาน",
        text: "วิธีใช้งาน"
      }
    },
    // ---------------------------------------------------------
    // โซนที่ 9: แถบล่างช่อง 4 - ทักทายน้องแมวไมโล & ผู้ช่วยอัจฉริยะ
    // ---------------------------------------------------------
    {
      bounds: { x: 1720, y: 1030, width: 780, height: 656 },
      action: {
        type: "message",
        label: "สวัสดีไมโล",
        text: "สวัสดีไมโล"
      }
    }
  ]
};

async function main() {
  console.log("==================================================");
  console.log("🚀 กำลังเริ่มต้นสร้าง LINE Rich Menu สำหรับน้องไมโล...");
  console.log("==================================================");

  // ขั้นตอนที่ 1: ตรวจสอบรายการ Rich Menu เดิมและล้างเมนูเก่าออก
  console.log("\n[ขั้นตอนที่ 1/4] ตรวจสอบรายการ Rich Menu ที่มีอยู่ในระบบ...");
  try {
    const listResp = await fetch("https://api.line.me/v2/bot/richmenu/list", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (listResp.ok) {
      const { richmenus } = await listResp.json();
      console.log(`พบ Rich Menu เดิมจำนวน ${richmenus.length} รายการ`);
      for (const rm of richmenus) {
        if (rm.name.includes("Milo") || rm.chatBarText.includes("ไมโล")) {
          console.log(`- กำลังล้างเมนูเก่า: ${rm.richMenuId} (${rm.name})...`);
          await fetch(`https://api.line.me/v2/bot/richmenu/${rm.richMenuId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      }
    }
  } catch (err) {
    console.warn("⚠️ การตรวจสอบเมนูเดิมข้ามไป:", err.message);
  }

  // ขั้นตอนที่ 2: ยิง API สร้าง Rich Menu ใหม่พร้อมจับพิกัดปุ่มย่อย
  console.log("\n[ขั้นตอนที่ 2/4] ยิง API สร้าง Rich Menu พิกัดปุ่มย่อย 9 ตำแหน่ง (2500x1686)...");
  const createResp = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(richMenuConfig)
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`สร้าง Rich Menu ไม่สำเร็จ (${createResp.status}): ${errText}`);
  }

  const { richMenuId } = await createResp.json();
  console.log(`✓ สร้าง Rich Menu สำเร็จเรียบร้อย!`);
  console.log(`  👉 Rich Menu ID: ${richMenuId}`);

  // ขั้นตอนที่ 3: อัปโหลดรูปภาพ Rich Menu ขึ้นสู่ LINE
  console.log("\n[ขั้นตอนที่ 3/4] ตรวจสอบและอัปโหลดไฟล์รูปภาพ Rich Menu...");
  const possiblePaths = [
    "./richmenu_milo.png",
    "./richmenu_milo.jpg",
    "../richmenu_milo.png",
    "../richmenu_milo.jpg",
    "./server/milo/richmenu_milo.png",
    "./public/richmenu_milo.png"
  ];

  let imagePath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      imagePath = p;
      break;
    }
  }

  if (imagePath) {
    const isPng = imagePath.endsWith('.png');
    const contentType = isPng ? 'image/png' : 'image/jpeg';
    console.log(`พบไฟล์รูปภาพที่: ${imagePath} (${contentType}) กำลังอัปโหลด...`);

    const imageBuffer = fs.readFileSync(imagePath);
    const uploadResp = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType
      },
      body: imageBuffer
    });

    if (!uploadResp.ok) {
      const uploadErr = await uploadResp.text();
      console.warn(`⚠️ อัปโหลดรูปไม่สำเร็จ (${uploadResp.status}): ${uploadErr}`);
      console.warn("คุณสามารถอัปโหลดรูปผ่าน LINE Official Account Manager ภายหลังได้");
    } else {
      console.log(`✓ อัปโหลดรูปภาพ 2500x1686 px เข้าสู่ Rich Menu สำเร็จแล้ว!`);
    }
  } else {
    console.log("ℹ️ ไม่พบไฟล์ richmenu_milo.png ในโฟลเดอร์ปัจจุบัน (ข้ามขั้นตอนอัปโหลดรูป)");
    console.log("คุณสามารถอัปโหลดรูปขนาด 2500x1686 px ผ่าน LINE OA Manager ได้ทันที");
  }

  // ขั้นตอนที่ 4: ตั้งค่า Rich Menu ให้เป็นค่าเริ่มต้นสำหรับผู้ใช้ทุกคน (Default Rich Menu)
  console.log("\n[ขั้นตอนที่ 4/4] เปิดใช้งานเป็น Default Rich Menu สำหรับผู้ใช้ทุกคน...");
  const defaultResp = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!defaultResp.ok) {
    const defErr = await defaultResp.text();
    throw new Error(`ตั้งเป็น Default Rich Menu ไม่สำเร็จ (${defaultResp.status}): ${defErr}`);
  }

  console.log("\n==================================================");
  console.log("🎉 สำเร็จสมบูรณ์! Rich Menu ของน้องไมโลเปิดใช้งานบน LINE แล้ว!");
  console.log(`📌 Rich Menu ID: ${richMenuId}`);
  console.log("==================================================");
}

main().catch(err => {
  console.error("\n❌ เกิดข้อผิดพลาด:", err.message);
  process.exit(1);
});
