import "dotenv/config";
import fs from "node:fs";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required");

const configs = [
  { file: "./shared/richmenu-main.json", alias: "milo-main", image: "./client/public/richmenu/milo-main.jpg", contentType: "image/jpeg" },
  { file: "./shared/richmenu-more.json", alias: "milo-more", image: "./client/public/richmenu/milo-more.jpg", contentType: "image/jpeg" },
];

async function req(url, init = {}) {
  const headers = { Authorization: "Bearer " + token, ...(init.headers || {}) };
  if (init.body && !Buffer.isBuffer(init.body)) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error("LINE " + response.status + ": " + await response.text());
  return response;
}

for (const item of configs) {
  const config = JSON.parse(fs.readFileSync(item.file, "utf8"));
  await req("https://api.line.me/v2/bot/richmenu/validate", {
    method: "POST",
    body: JSON.stringify(config),
  });
  console.log("VALIDATED", item.alias);
}

if (process.argv.includes("--apply")) {
  const created = [];
  for (const item of configs) {
    const config = JSON.parse(fs.readFileSync(item.file, "utf8"));
    const response = await req("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      body: JSON.stringify(config),
    });
    const { richMenuId } = await response.json();
    created.push({ alias: item.alias, richMenuId });
    await req("https://api-data.line.me/v2/bot/richmenu/" + richMenuId + "/content", {
      method: "POST",
      headers: { "Content-Type": item.contentType },
      body: fs.readFileSync(item.image),
    });
    await req("https://api.line.me/v2/bot/richmenu/alias", {
      method: "POST",
      body: JSON.stringify({ richMenuAliasId: item.alias, richMenuId }),
    });
    console.log("CREATED", item.alias, richMenuId);
  }
  await req("https://api.line.me/v2/bot/user/all/richmenu/" + created[0].richMenuId, { method: "POST" });
  console.log("ACTIVATED", created[0].richMenuId);
}
