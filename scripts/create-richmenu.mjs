/**
 * Milo AI Financial OS - LINE Rich Menu Auto-Setup Script
 * -------------------------------------------------------------
 * สร้าง Rich Menu 2500x1686 พร้อม action ที่ผูกกับ command parser ของ Milo โดยตรง
 * เมนู 9 ปุ่ม: จดบันทึก, สรุป, วิเคราะห์, งบประมาณ, รายการ, หมวดหมู่,
 * แดชบอร์ด, วิธีใช้งาน และ สวัสดีไมโล
 */

import fs from "fs";

let token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!token && fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("LINE_CHANNEL_ACCESS_TOKEN=")) {
      token = trimmed.slice("LINE_CHANNEL_ACCESS_TOKEN=".length).trim();
      if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
        token = token.slice(1, -1);
      }
      break;
    }
  }
}

if (!token) {
  console.error("❌ ไม่พบ LINE_CHANNEL_ACCESS_TOKEN");
  process.exit(1);
}

const messageAction = (label, text) => ({ type: "message", label, text });

const richMenuConfig = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "Milo AI Financial OS - Master Rich Menu",
  chatBarText: "เมนูการเงิน",
  areas: [
    { bounds: { x: 0, y: 0, width: 1270, height: 1030 }, action: messageAction("จดบันทึก", "จดบันทึก") },
    { bounds: { x: 1270, y: 0, width: 615, height: 530 }, action: messageAction("สรุปการเงิน", "สรุป") },
    { bounds: { x: 1885, y: 0, width: 615, height: 530 }, action: messageAction("วิเคราะห์การเงิน", "วิเคราะห์") },
    { bounds: { x: 1270, y: 530, width: 615, height: 500 }, action: messageAction("งบประมาณ", "งบประมาณ") },
    { bounds: { x: 1885, y: 530, width: 615, height: 500 }, action: messageAction("ประวัติรายการ", "รายการ") },
    { bounds: { x: 0, y: 1030, width: 590, height: 656 }, action: messageAction("หมวดหมู่", "หมวดหมู่") },
    { bounds: { x: 590, y: 1030, width: 560, height: 656 }, action: { type: "uri", label: "แดชบอร์ดหลังบ้าน", uri: "https://milo-line-app.vercel.app/dashboard" } },
    { bounds: { x: 1150, y: 1030, width: 570, height: 656 }, action: messageAction("วิธีใช้งาน", "วิธีใช้งาน") },
    { bounds: { x: 1720, y: 1030, width: 780, height: 656 }, action: messageAction("สวัสดีไมโล", "สวัสดีไมโล") },
  ],
};

async function api(path, options = {}) {
  const response = await fetch(`https://api.line.me${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
  return response;
}

async function main() {
  console.log("🚀 Syncing Milo Rich Menu...");

  const listResp = await api("/v2/bot/richmenu/list");
  if (!listResp.ok) throw new Error(`list richmenu failed (${listResp.status})`);
  const { richmenus = [] } = await listResp.json();

  for (const rm of richmenus) {
    if (rm.name?.includes("Milo AI Financial OS") || rm.chatBarText === "เมนูการเงิน") {
      const deleteResp = await api(`/v2/bot/richmenu/${rm.richMenuId}`, { method: "DELETE" });
      if (!deleteResp.ok) throw new Error(`delete ${rm.richMenuId} failed (${deleteResp.status})`);
      console.log(`✓ removed old Milo menu ${rm.richMenuId}`);
    }
  }

  const createResp = await api("/v2/bot/richmenu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(richMenuConfig),
  });
  if (!createResp.ok) throw new Error(`create richmenu failed (${createResp.status}): ${await createResp.text()}`);
  const { richMenuId } = await createResp.json();
  console.log(`✓ created ${richMenuId}`);

  const imageCandidates = ["./richmenu_milo.png", "./richmenu_milo.jpg", "./server/milo/richmenu_milo.png", "./public/richmenu_milo.png"];
  const imagePath = imageCandidates.find(fs.existsSync);
  if (imagePath) {
    const contentType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";
    const uploadResp = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      body: fs.readFileSync(imagePath),
    });
    if (!uploadResp.ok) throw new Error(`upload richmenu image failed (${uploadResp.status}): ${await uploadResp.text()}`);
    console.log(`✓ uploaded ${imagePath}`);
  } else {
    console.log("ℹ️ no local Rich Menu image found; action mapping was still synchronized");
  }

  const defaultResp = await api(`/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST" });
  if (!defaultResp.ok) throw new Error(`set default richmenu failed (${defaultResp.status}): ${await defaultResp.text()}`);

  console.log("🎉 Milo Rich Menu is now the default menu for all users.");
  console.log(`📌 Rich Menu ID: ${richMenuId}`);
}

main().catch(error => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
