import "dotenv/config";
import { replyRichMenu, replyFinanceReportCard } from "../server/milo/line";
import { RICH_MENU_ARTWORK } from "../server/milo/richMenuArtwork";
const token=process.env.LINE_CHANNEL_ACCESS_TOKEN;
if(!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required");
const realFetch=globalThis.fetch;
let validated=0;
// Redirect replies to LINE's validation endpoint. Never deliver test messages.
globalThis.fetch=async (_url,init) => {
  const {messages}=JSON.parse(String(init?.body));
  const response=await realFetch("https://api.line.me/v2/bot/message/validate/reply",{
    method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({messages}),
  });
  if(!response.ok) throw new Error("Validation failed "+response.status+": "+await response.text());
  validated++; return new Response("{}");
};
try {
  for(const key of Object.keys(RICH_MENU_ARTWORK) as Array<keyof typeof RICH_MENU_ARTWORK>) await replyRichMenu("validation-only","ตัวอย่างคำตอบสำหรับตรวจรูปแบบ",key);
  for(const period of ["day","week","month","year"] as const) await replyFinanceReportCard("validation-only",{period,income:1000,expense:125,balance:875,categories:{อาหาร:125}});
  console.log("LINE validated "+validated+" reply payloads; no messages sent.");
} finally { globalThis.fetch=realFetch; }
