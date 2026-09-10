import "dotenv/config";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) { console.error("❌ ไม่พบ LINE_CHANNEL_ACCESS_TOKEN"); process.exit(1); }
const messageAction = (label, text) => ({ type: "message", label, text });
const richMenuConfig = {
  size: { width: 2500, height: 1686 }, selected: true,
  name: "Milo LINE Assistant - Master Rich Menu", chatBarText: "เมนูไมโล",
  areas: [
    { bounds: { x: 0, y: 0, width: 1270, height: 1030 }, action: messageAction("จดบันทึก", "จดบันทึก") },
    { bounds: { x: 1270, y: 0, width: 615, height: 530 }, action: messageAction("สรุปการเงิน", "สรุป") },
    { bounds: { x: 1885, y: 0, width: 615, height: 530 }, action: messageAction("วิเคราะห์การเงิน", "วิเคราะห์") },
    { bounds: { x: 1270, y: 530, width: 615, height: 500 }, action: messageAction("งบประมาณ", "งบประมาณ") },
    { bounds: { x: 1885, y: 530, width: 615, height: 500 }, action: messageAction("ประวัติรายการ", "รายการ") },
    { bounds: { x: 0, y: 1030, width: 590, height: 656 }, action: messageAction("หมวดหมู่", "หมวดหมู่") },
    { bounds: { x: 590, y: 1030, width: 560, height: 656 }, action: { type: "uri", label: "แดชบอร์ดหลังบ้าน", uri: "https://milo-line-app.vercel.app/dashboard" } },
    { bounds: { x: 1150, y: 1030, width: 570, height: 656 }, action: messageAction("เมนูไมโล", "เมนูไมโล") },
    { bounds: { x: 1720, y: 1030, width: 780, height: 656 }, action: messageAction("สวัสดีไมโล", "สวัสดีไมโล") },
  ],
};
async function api(path, options = {}) { return fetch(`https://api.line.me${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } }); }
async function main() {
  console.log("🚀 Syncing Milo Rich Menu...");
  const listResp = await api("/v2/bot/richmenu/list"); if (!listResp.ok) throw new Error(`list richmenu failed (${listResp.status})`);
  const { richmenus = [] } = await listResp.json();
  for (const menu of richmenus.filter(m => m.name?.startsWith("Milo LINE Assistant"))) { const r = await api(`/v2/bot/richmenu/${menu.richMenuId}`, { method: "DELETE" }); if (!r.ok) throw new Error(`delete ${menu.richMenuId} failed (${r.status})`); console.log(`✓ removed old Milo menu ${menu.richMenuId}`); }
  const create = await api("/v2/bot/richmenu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(richMenuConfig) });
  if (!create.ok) throw new Error(`create richmenu failed (${create.status}) ${await create.text()}`); const menu = await create.json();
  const fs = await import("node:fs"); const imagePath = "./richmenu_milo.png"; if (!fs.existsSync(imagePath)) throw new Error(`missing ${imagePath}`);
  const image = fs.readFileSync(imagePath); const upload = await fetch(`https://api-data.line.me/v2/bot/richmenu/${menu.richMenuId}/content`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" }, body: image }); if (!upload.ok) throw new Error(`upload richmenu failed (${upload.status}) ${await upload.text()}`); console.log(`✓ uploaded ${imagePath}`);
  const def = await api(`/v2/bot/user/all/richmenu/${menu.richMenuId}`, { method: "POST" }); if (!def.ok) throw new Error(`set default failed (${def.status}) ${await def.text()}`);
  console.log("🎉 Milo Rich Menu is now the default menu for all users."); console.log(`📌 Rich Menu ID: ${menu.richMenuId}`); console.log("📌 chatBarText: เมนูไมโล");
}
main().catch(error => { console.error("❌", error); process.exit(1); });
