import { artworkMessages, type RichMenuArtwork } from "./richMenuArtwork";
import { buildRichMenuDataImageUrl, isDynamicRichMenuArtwork } from "./richMenuDataImage";
import { budgetStatusCopy } from "./budgetStatus";
import { buildFinanceReportImageUrl } from "./financeReportImage";
import crypto from "node:crypto";

export type LineCredentials = { channelSecret: string; channelAccessToken: string };
export type LineSource = { type: "user"; userId: string } | { type: "group"; groupId: string; userId?: string } | { type: "room"; roomId: string; userId?: string };
export type LineEvent = {
  type: string; webhookEventId: string; timestamp: number; replyToken?: string; source: LineSource;
  message?: { id: string; type: "text" | "image" | "file" | "video" | "audio"; text?: string; fileName?: string; mention?: { mentionees?: Array<{ isSelf?: boolean }> } };
};

export function lineCredentials(): LineCredentials {
  return { channelSecret: process.env.LINE_CHANNEL_SECRET ?? "", channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "" };
}

export function verifyLineSignature(body: Buffer, signature: string | undefined, secret: string) {
  if (!signature || !secret) return false;
  const computed = Buffer.from(crypto.createHmac("sha256", secret).update(body).digest("base64"));
  const supplied = Buffer.from(signature);
  return computed.length === supplied.length && crypto.timingSafeEqual(computed, supplied);
}

export function sourceIdentity(source: LineSource) {
  if (source.type === "user") return { lineChatId: source.userId, lineUserId: source.userId, scope: "user" as const };
  if (source.type === "group") return { lineChatId: source.groupId, lineUserId: source.userId, scope: "group" as const };
  return { lineChatId: source.roomId, lineUserId: source.userId, scope: "room" as const };
}

async function callLine(path: string, credentials: LineCredentials, init: RequestInit) {
  const response = await fetch(`https://api.line.me${path}`, { ...init, headers: { Authorization: `Bearer ${credentials.channelAccessToken}`, ...init.headers } });
  if (!response.ok) throw new Error(`LINE API ${response.status}: ${await response.text()}`);
  console.info("[Milo LINE] message delivered", { endpoint: path, status: response.status });
  return response;
}

const MILO_RICH_MENU_IMAGE_BASE_URL = (process.env.MILO_RICH_MENU_IMAGE_BASE_URL ?? "https://milo-line-assistant.onrender.com/milo-richmenu").replace(/\/+$/, "");

export type MiloRichMenuImageKey = "home" | "analysis" | "record" | "wallet" | "settings" | "summary" | "save-complete" | "save-complete-preview";

export function miloRichMenuImageUrl(key: MiloRichMenuImageKey) {
  const extension = key === "save-complete-preview" ? "jpg" : "png";
  return `${MILO_RICH_MENU_IMAGE_BASE_URL}/${key}.${extension}`;
}

export function miloSaveResultImageUrl(summary: PostSaveSummary) {
  const appBaseUrl = (process.env.MILO_SAVE_RESULT_IMAGE_BASE_URL ?? "https://milo-line-assistant.onrender.com").replace(/\/+$/, "");
  const params = new URLSearchParams({
    transactionType: summary.transactionType,
    item: (summary.note?.trim() || summary.category).slice(0, 300),
    category: summary.category.slice(0, 50),
    amount: String(summary.amount),
    occurredAt: summary.occurredAt.toISOString(),
    budgetSpent: String(summary.budgetSpent),
    budgetLimit: String(summary.budgetLimit),
    budgetPercent: summary.budgetPercent === undefined ? "" : String(summary.budgetPercent),
    render: "glyph-v3",
  });
  return `${appBaseUrl}/api/milo/save-result.png?${params.toString()}`;
}
export async function replyImage(replyToken: string, key: MiloRichMenuImageKey, credentials = lineCredentials()) {
  const url = miloRichMenuImageUrl(key);
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "image", originalContentUrl: url, previewImageUrl: url }],
    }),
  });
}
export async function replyText(replyToken: string, text: string, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 5000) }] }) });
}

export async function replyMiloOnboarding(replyToken: string, displayName?: string, credentials = lineCredentials()) {
  const imageUrl = new URL("/richmenu/greeting-home.png", process.env.MILO_PUBLIC_URL || "https://milo-line-assistant.onrender.com").href;
  const name = displayName?.trim() ? displayName.trim().slice(0, 40) : "คุณ";
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "flex", altText: "ตั้งค่า Milo ก่อนเริ่มใช้งาน", contents: { type: "bubble", size: "mega", hero: { type: "image", url: imageUrl, size: "full", aspectRatio: "20:11", aspectMode: "cover" }, body: { type: "box", layout: "vertical", spacing: "md", backgroundColor: "#F3FBF7", contents: [
    { type: "text", text: "สวัสดีครับ 👋", weight: "bold", size: "xl", color: "#0D735B" },
    { type: "text", text: "คุณ" + name + " เชื่อมต่อ Milo แล้ว", size: "sm", color: "#4B756B", wrap: true },
    { type: "text", text: "ก่อนเริ่มใช้งาน ขอจัดค่าพื้นฐานให้ไมโลสักนิดนะครับ", size: "sm", color: "#6D8D86", wrap: true },
    { type: "box", layout: "vertical", spacing: "sm", margin: "md", paddingAll: "12px", cornerRadius: "lg", backgroundColor: "#FFFFFF", contents: [
      { type: "text", text: "สิ่งที่จะตั้งค่า", size: "xs", weight: "bold", color: "#2D675B" },
      { type: "text", text: "• บัญชีส่วนตัวและยอดเริ่มต้น\n• หมวดหมู่รายรับ / รายจ่าย\n• งบประมาณและรายการประจำ\n• ปฏิทิน เตือน และสรุปอัตโนมัติ", size: "xs", color: "#708E87", wrap: true, margin: "sm" },
    ] },
  ] }, footer: { type: "box", layout: "vertical", spacing: "sm", backgroundColor: "#F3FBF7", contents: [
    { type: "button", style: "primary", color: "#159A75", action: { type: "message", label: "เริ่มตั้งค่า", text: "เริ่มตั้งค่า" } },
    { type: "button", style: "link", color: "#4E8A7D", action: { type: "message", label: "ตั้งค่าภายหลัง", text: "ตั้งค่า" } },
  ] } } }] }) });
}

export async function replyMiloSettings(replyToken: string, credentials = lineCredentials()) {
  const items = [["💰 บัญชี / ยอดเริ่มต้น", "ยอดเงินเริ่มต้น 0 บาท", "ตั้งยอดเงินเริ่มต้น 0 บาท"], ["🏷️ หมวดหมู่", "เพิ่มหรือลบหมวดรายรับ / รายจ่าย", "หมวดหมู่"], ["🎯 งบประมาณ", "กำหนดงบตามหมวดและรอบงบ", "งบประมาณ"], ["🔁 รายการประจำ", "ตั้งรายรับ / รายจ่ายที่เกิดซ้ำ", "รายการประจำ"], ["📅 ปฏิทิน / เตือน", "จัดการนัดหมายและการแจ้งเตือน", "ปฏิทิน"], ["📊 สรุปอัตโนมัติ", "ดูภาพรวมการเงินช่วงต่าง ๆ", "สรุปเดือนนี้"]] as const;
  const cards = items.map(([title, desc, text]) => ({ type: "box", layout: "horizontal", spacing: "sm", paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FFFFFF", contents: [{ type: "box", layout: "vertical", flex: 1, contents: [{ type: "text", text: title, size: "sm", weight: "bold", color: "#315F58" }, { type: "text", text: desc, size: "xxs", color: "#8AA49E", wrap: true, margin: "xs" }] }, { type: "button", style: "link", height: "sm", flex: 0, action: { type: "message", label: "เปิด", text } }] }));
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "flex", altText: "ตั้งค่า Milo", contents: { type: "bubble", size: "mega", body: { type: "box", layout: "vertical", spacing: "md", backgroundColor: "#F7FCFA", contents: [{ type: "text", text: "⚙️ ตั้งค่า Milo", weight: "bold", size: "xl", color: "#0D735B" }, { type: "text", text: "จัดการค่าการเงินและการใช้งานจากหน้านี้ได้เลยครับ", size: "xs", color: "#75958D", wrap: true }, ...cards] }, footer: { type: "box", layout: "vertical", backgroundColor: "#F7FCFA", contents: [{ type: "button", style: "primary", color: "#159A75", action: { type: "message", label: "เริ่มใช้งาน Milo", text: "เริ่มใช้งาน" } }] } } }] }) });
}
export async function replyTextWithQuickReplies(replyToken: string, text: string, actions: Array<{ label: string; text: string }>, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 5000), quickReply: { items: actions.slice(0, 3).map(action => ({ type: "action", action: { type: "message", label: action.label.slice(0, 20), text: action.text.slice(0, 300) } })) } }] }),
  });
}

export async function replyGreetingHome(replyToken: string, credentials = lineCredentials()) {
  const base = process.env.MILO_PUBLIC_URL || "https://milo-line-assistant.onrender.com";
  const imageUrl = new URL("/richmenu/greeting-home.png", base).href;
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl }] }),
  });
}

export type VoiceTransactionProposal = {
  transcript: string;
  transactionType?: "income" | "expense";
  amount?: number;
  category?: string;
  note?: string;
};

const MILO_VOICE_CAT_IMAGE_URL = (process.env.MILO_VOICE_CAT_IMAGE_URL ?? "https://milo-line-assistant.onrender.com/milo-voice-proposal-cat.webp").trim();

export type PostSaveSummary = {
  transactionType: "expense" | "income";
  amount: number;
  category: string;
  note?: string;
  occurredAt: Date;
  dailyIncome: number;
  dailyExpense: number;
  dailyBalance: number;
  budgetSpent: number;
  budgetLimit: number;
  budgetPercent?: number;
};

export type FinanceReportCard = {
  period: "day" | "week" | "month" | "year";
  income: number;
  expense: number;
  balance: number;
  categories: Record<string, number>;
  transactionCount?: number;
  start?: string | Date;
  end?: string | Date;
  rows?: Array<{ transactionType: "income" | "expense"; amount: string | number; category: string; note?: string | null; occurredAt?: string | Date | null }>;
  title?: string;
  subtitle?: string;
};

function voiceQuickReply() {
  return {
    items: [
      { type: "action", action: { type: "message", label: "ยืนยันบันทึก", text: "ยืนยันเสียง" } },
      { type: "action", action: { type: "message", label: "แก้ไขข้อความ", text: "แก้ไขข้อความเสียง" } },
    ],
  };
}

function voiceProposalText(proposal: VoiceTransactionProposal) {
  const financialLine = proposal.transactionType && proposal.amount
    ? `\nเสนอ${proposal.transactionType === "expense" ? "รายจ่าย" : "รายรับ"} ${proposal.amount.toLocaleString("th-TH")} บาท หมวด${proposal.category ?? "ทั่วไป"}`
    : "\nยังไม่พบรูปแบบรายรับ/รายจ่ายที่แน่ชัด";
  return `ตรวจสอบข้อความเสียง\n“${proposal.transcript.slice(0, 900)}”${financialLine}\nยังไม่บันทึกจนกว่าจะยืนยัน`;
}

export function mascotExpenseCopy(transactionType: PostSaveSummary["transactionType"], amount: number) {
  if (transactionType === "income") return "น้องแมวเก็บรายรับไว้ให้แล้ว เมี้ยว";
  if (amount <= 100) return "น้องแมวเก็บรายการเล็ก ๆ ไว้ให้แล้ว เมี้ยว";
  if (amount <= 500) return "เช็กยอดวันนี้ได้ทันทีน่ะจ๊ะ";
  return "ยอดนี้ไมโลบันทึกไว้แล้ว ลองดูสรุปวันนี้ได้เลยน่ะจ๊ะ";
}

export function postSaveSummaryText(summary: PostSaveSummary) {
  const label = summary.transactionType === "expense" ? "รายจ่าย" : "รายรับ";
  const note = summary.note?.trim();
  const categoryLabel = summary.transactionType === "expense" && summary.category === "อาหาร" ? "ค่าอาหาร" : summary.category;
  const budget = summary.budgetLimit > 0 ? `\n${budgetStatusCopy(summary.category, summary.budgetSpent, summary.budgetLimit)}\nงบหมวด${summary.category}: ${summary.budgetSpent.toLocaleString("th-TH")} / ${summary.budgetLimit.toLocaleString("th-TH")} บาท` : "";
  const timestamp = new Intl.DateTimeFormat("th-TH-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(summary.occurredAt);
  return `จดสำเร็จ\nรายการ: ${note || categoryLabel}\nหมวด: ${categoryLabel}\nจำนวนเงิน: ${summary.amount.toLocaleString("th-TH")} บาท\nวันที่ - เวลา: ${timestamp}${budget}\n${mascotExpenseCopy(summary.transactionType, summary.amount)}\nวันนี้: รายรับ ${summary.dailyIncome.toLocaleString("th-TH")} บาท · รายจ่าย ${summary.dailyExpense.toLocaleString("th-TH")} บาท · คงเหลือ ${summary.dailyBalance.toLocaleString("th-TH")} บาท`;
}

export function financeReportCardText(report: FinanceReportCard) {
  const periodLabel: Record<FinanceReportCard["period"], string> = { day: "วันนี้", week: "สัปดาห์นี้", month: "เดือนนี้", year: "ปีนี้" };
  const money = (amount: number) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => `• ${name} ${money(amount)} บาท`).join("\n");
  return `${report.title ?? `สรุปการเงิน${periodLabel[report.period]}`}\n${report.subtitle ? `${report.subtitle}\n` : ""}รายรับ ${money(report.income)} บาท\nรายจ่าย ${money(report.expense)} บาท\nกำไร/คงเหลือ ${money(report.balance)} บาท\n${categories ? `\nรายจ่ายตามหมวด\n${categories}` : "\nยังไม่มีรายจ่ายในช่วงนี้"}`;
}

function miloFinanceBrandStrip() {
  return { type: "box", layout: "horizontal", alignItems: "center", spacing: "sm", paddingAll: "9px", cornerRadius: "md", backgroundColor: "#FCEAF4", contents: [
    { type: "image", url: miloRichMenuImageUrl("summary"), size: "xs", aspectRatio: "1:1", aspectMode: "cover", flex: 0 },
    { type: "box", layout: "vertical", flex: 1, contents: [
      { type: "text", text: "MILO  •  FINANCE", size: "xxs", weight: "bold", color: "#7657AA" },
      { type: "text", text: "น้องแมวช่วยดูแลยอดของคุณ", size: "xxs", color: "#9A7390", wrap: true },
    ] },
    { type: "text", text: "✦", size: "sm", color: "#5AC6AD", flex: 0 },
  ] };
}

export async function replyFinanceReportCard(replyToken: string, report: FinanceReportCard, credentials = lineCredentials()) {
  const imageUrl = buildFinanceReportImageUrl(report);
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "image",
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
        quickReply: { items: [
          { type: "action", action: { type: "message", label: "วันนี้", text: "สรุปวันนี้" } },
          { type: "action", action: { type: "message", label: "สัปดาห์นี้", text: "สรุปสัปดาห์นี้" } },
          { type: "action", action: { type: "message", label: "เดือนนี้", text: "สรุปเดือนนี้" } },
          { type: "action", action: { type: "message", label: "ปีนี้", text: "สรุปปีนี้" } },
        ] },
      }],
    }),
  });
}

export async function replyFinanceReportCardFallback(replyToken: string, report: FinanceReportCard, credentials = lineCredentials()) {
  return replyText(replyToken, financeReportCardText(report), credentials);
}

export async function pushFinanceReportCard(to: string, report: FinanceReportCard, credentials = lineCredentials()) {
  const money = (amount: number) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const categoryRows = categories.length ? categories.map(([name, amount]) => ({ type: "box", layout: "horizontal", margin: "sm", contents: [
    { type: "text", text: name, size: "xs", color: "#675B7C", flex: 1, wrap: true },
    { type: "text", text: `${money(amount)} บาท`, size: "xs", weight: "bold", color: "#B9517B", align: "end" },
  ] })) : [{ type: "text", text: "ไม่มีรายการในช่วงเวลานี้", size: "xs", color: "#8A8097" }];
  const title = report.title ?? "สรุปการเงินจากไมโล";
  return callLine("/v2/bot/message/push", credentials, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, messages: [{
      type: "flex", altText: financeReportCardText(report), contents: {
        type: "bubble", size: "mega",
        hero: { type: "image", url: miloRichMenuImageUrl("summary"), size: "full", aspectRatio: "20:9", aspectMode: "cover" },
        body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", backgroundColor: "#F2F0FF", contents: [
          { type: "box", layout: "horizontal", alignItems: "center", spacing: "md", paddingAll: "12px", cornerRadius: "md", backgroundColor: "#E4F8F2", contents: [
            { type: "box", layout: "vertical", justifyContent: "center", alignItems: "center", width: "38px", height: "38px", cornerRadius: "md", backgroundColor: "#5AC6AD", contents: [{ type: "text", text: "฿", align: "center", weight: "bold", size: "xl", color: "#FFFFFF" }] },
            { type: "box", layout: "vertical", flex: 1, contents: [{ type: "text", text: title, weight: "bold", size: "lg", color: "#4B3D69", wrap: true }, { type: "text", text: report.subtitle ?? "สรุปอัตโนมัติตามเวลาที่ตั้งไว้", size: "xs", color: "#7B6E97", wrap: true }] },
          ] },
          miloFinanceBrandStrip(),
          { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", cornerRadius: "md", backgroundColor: "#FFFEFB", contents: [
            { type: "box", layout: "horizontal", spacing: "sm", contents: [
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#EAF8F4", contents: [{ type: "text", text: "รายรับ", size: "xxs", color: "#5B8E81" }, { type: "text", text: `${money(report.income)} บาท`, size: "sm", weight: "bold", color: "#267C68", wrap: true }] },
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FDECF2", contents: [{ type: "text", text: "รายจ่าย", size: "xxs", color: "#A57086" }, { type: "text", text: `${money(report.expense)} บาท`, size: "sm", weight: "bold", color: "#BB527C", wrap: true }] },
            ] },
            { type: "box", layout: "horizontal", paddingAll: "10px", cornerRadius: "md", backgroundColor: "#EEEAF8", contents: [{ type: "text", text: "กำไร / คงเหลือ", size: "xs", color: "#6B6080", flex: 1 }, { type: "text", text: `${money(report.balance)} บาท`, size: "sm", weight: "bold", color: "#4D4263", align: "end" }] },
            { type: "separator", color: "#E9E4F1" },
            { type: "text", text: "รายจ่ายตามหมวด", size: "xs", weight: "bold", color: "#76688E" },
            { type: "box", layout: "vertical", paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FFF7FA", contents: categoryRows },
          ] },
        ] },
      },
    }] }),
  });
}

export async function replyPostSaveSummary(replyToken: string, summary: PostSaveSummary, credentials = lineCredentials()) {
  const isExpense = summary.transactionType === "expense";
  const label = isExpense ? "รายจ่าย" : "รายรับ";
  const categoryLabel = isExpense && summary.category === "อาหาร" ? "ค่าอาหาร" : summary.category;
  const accent = isExpense ? "#C9578A" : "#24977B";
  const softAccent = isExpense ? "#FDE9F1" : "#E2F8F0";
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{
      type: "flex", altText: postSaveSummaryText(summary),
      contents: {
        type: "bubble", size: "mega",
        body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", backgroundColor: "#F2F0FF", contents: [
          { type: "box", layout: "horizontal", alignItems: "center", spacing: "md", paddingAll: "12px", cornerRadius: "md", backgroundColor: "#E4F8F2", contents: [
            { type: "box", layout: "vertical", justifyContent: "center", alignItems: "center", width: "38px", height: "38px", cornerRadius: "md", backgroundColor: "#5AC6AD", contents: [{ type: "text", text: "✓", align: "center", weight: "bold", size: "xl", color: "#FFFFFF" }] },
            { type: "box", layout: "vertical", flex: 1, contents: [
              { type: "text", text: "บันทึกสำเร็จ", weight: "bold", size: "lg", color: "#4B3D69" },
              { type: "text", text: mascotExpenseCopy(summary.transactionType, summary.amount), size: "xs", wrap: true, color: "#7B6E97" },
            ] },
          ] },
          { type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", cornerRadius: "md", backgroundColor: "#FFFEFB", contents: [
            { type: "box", layout: "horizontal", alignItems: "center", contents: [
              { type: "text", text: `${isExpense ? "รายจ่าย" : "รายรับ"}  •  ${categoryLabel}`, size: "sm", weight: "bold", color: accent, flex: 1 },
              { type: "text", text: "บันทึกแล้ว", size: "xxs", color: "#8B809B", align: "end" },
            ] },
            { type: "text", text: `${summary.amount.toLocaleString("th-TH")} บาท`, size: "xxl", weight: "bold", color: "#3F3552" },
            ...(summary.note?.trim() ? [{ type: "text", text: `รายการที่จด: ${summary.note.trim()}`, size: "sm", color: "#675B7C", wrap: true }] : []),
            { type: "text", text: "วันที่ - เวลา", size: "xs", weight: "bold", color: "#76688E", margin: "md" },
            { type: "text", text: new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(summary.occurredAt), size: "sm", color: "#4D4263" },
            ...(summary.budgetLimit > 0 && summary.budgetPercent !== undefined ? [{ type: "box", layout: "vertical", spacing: "sm", margin: "md", paddingAll: "12px", cornerRadius: "md", backgroundColor: "#F3FBF8", contents: [
              { type: "text", text: "สถานะงบประมาณหมวดหมู่", size: "xs", weight: "bold", color: "#267C68" },
              { type: "box", layout: "horizontal", alignItems: "center", spacing: "sm", contents: [{ type: "text", text: categoryLabel, size: "sm", color: "#4D4263", flex: 1 }, { type: "text", text: `ใช้ไป ${summary.budgetPercent}%`, size: "sm", weight: "bold", color: "#267C68", align: "end" }] },
              { type: "text", text: `(${summary.budgetSpent.toLocaleString("th-TH")} / ${summary.budgetLimit.toLocaleString("th-TH")} บาท)`, size: "xxs", color: "#6B6080", align: "end" },
              { type: "text", text: budgetStatusCopy(summary.category, summary.budgetSpent, summary.budgetLimit), size: "xxs", color: "#A85C74", wrap: true },
            ] }] : []),
            { type: "separator", color: "#E9E4F1" },
            { type: "text", text: "สรุปยอดวันนี้", size: "xs", weight: "bold", color: "#76688E" },
            { type: "box", layout: "horizontal", spacing: "sm", contents: [
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#EAF8F4", contents: [{ type: "text", text: "รายรับ", size: "xxs", color: "#5B8E81" }, { type: "text", text: `${summary.dailyIncome.toLocaleString("th-TH")} บาท`, size: "sm", weight: "bold", color: "#267C68" }] },
              { type: "box", layout: "vertical", flex: 1, paddingAll: "10px", cornerRadius: "md", backgroundColor: "#FDECF2", contents: [{ type: "text", text: "รายจ่าย", size: "xxs", color: "#A57086" }, { type: "text", text: `${summary.dailyExpense.toLocaleString("th-TH")} บาท`, size: "sm", weight: "bold", color: "#BB527C" }] },
            ] },
            { type: "box", layout: "horizontal", alignItems: "center", paddingAll: "11px", cornerRadius: "md", backgroundColor: softAccent, contents: [
              { type: "text", text: "ยอดคงเหลือวันนี้", size: "xs", color: "#6B6080", flex: 1 },
              { type: "text", text: `${summary.dailyBalance.toLocaleString("th-TH")} บาท`, size: "sm", weight: "bold", color: "#4D4263", align: "end" },
            ] },
          ] },
        ] },
        footer: { type: "box", layout: "vertical", paddingAll: "16px", backgroundColor: "#F2F0FF", contents: [
          { type: "button", style: "primary", color: "#7657AA", height: "sm", action: { type: "message", label: "ดูสรุปยอดวันนี้", text: "สรุปวันนี้" } },
        ] },
      },
      },
    ] }),
  });
}

export async function replyPostSaveSummaryImage(replyToken: string, summary: PostSaveSummary, credentials = lineCredentials()) {
  const imageUrl = miloSaveResultImageUrl(summary);
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{
      type: "image",
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl,
      quickReply: { items: [
        { type: "action", action: { type: "message", label: "ยกเลิกรายการล่าสุด", text: "ยกเลิกรายการล่าสุด" } },
        { type: "action", action: { type: "message", label: "สรุปวันนี้", text: "สรุปวันนี้" } },
      ] },
    }] }),
  });
}

/** Compatibility alias retained for callers/tests; now image-only by design. */
export const replyPostSaveSummaryFallback = replyPostSaveSummaryImage;

export async function replyVoiceCategoryChoices(replyToken: string, credentials = lineCredentials()) {
  const popular = ["อาหาร", "เดินทาง", "ค่าสาธารณูปโภค", "ช้อปปิ้ง", "สุขภาพ"];
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "text", text: "เลือกหมวดที่ต้องการได้เลย หรือพิมพ์ “แก้ไขเสียง <ข้อความใหม่>” เพื่อแก้ทั้งข้อความ", quickReply: { items: popular.map(category => ({ type: "action", action: { type: "message", label: category, text: `เปลี่ยนหมวดเสียง ${category}` } })) } }] }) });
}

export async function replyVoiceProposal(replyToken: string, proposal: VoiceTransactionProposal, credentials = lineCredentials()) {
  const isExpense = proposal.transactionType === "expense";
  const financialLine = proposal.transactionType && proposal.amount
    ? `${isExpense ? "รายจ่าย" : "รายรับ"} ${proposal.amount.toLocaleString("th-TH")} บาท`
    : "ยังไม่พบรูปแบบรายรับหรือรายจ่ายที่แน่ชัด";
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "flex",
        altText: "ตรวจสอบข้อความเสียงก่อนบันทึก",
        contents: {
          type: "bubble",
          size: "kilo",
          hero: {
            type: "image",
            url: MILO_VOICE_CAT_IMAGE_URL,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            backgroundColor: "#FFF9F2",
            contents: [
              { type: "text", text: "ไมโลฟังให้แล้ว", weight: "bold", size: "lg", color: "#563F79" },
              { type: "text", text: "ตรวจเช็กก่อนบันทึกนะเมี้ยว", size: "xs", color: "#9A7DB7" },
              { type: "box", layout: "vertical", margin: "md", paddingAll: "md", cornerRadius: "md", backgroundColor: isExpense ? "#FFE8EF" : "#E3F8F0", contents: [
                { type: "text", text: financialLine, wrap: true, size: "xl", weight: "bold", color: isExpense ? "#D74475" : "#0F8D6C" },
                ...(proposal.category ? [{ type: "text", text: `หมวด • ${proposal.category}`, wrap: true, size: "sm", margin: "sm", color: "#6E597D" }] : []),
              ] },
              { type: "text", text: `“${proposal.transcript.slice(0, 700)}”`, wrap: true, size: "sm", margin: "md", color: "#554E62" },
              { type: "box", layout: "horizontal", spacing: "sm", margin: "md", paddingAll: "sm", cornerRadius: "md", backgroundColor: "#F2ECFF", contents: [
                { type: "text", text: "🐾", size: "sm", flex: 0 },
                { type: "text", text: "ยังไม่บันทึก จนกว่าจะกดยืนยัน", wrap: true, size: "xs", color: "#6B5B8E" },
              ] },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            backgroundColor: "#FFF9F2",
            contents: [
              { type: "button", style: "primary", color: "#D74475", action: { type: "message", label: "ยืนยันบันทึก", text: "ยืนยันเสียง" } },
              { type: "button", style: "secondary", color: "#9A7DB7", action: { type: "message", label: "แก้ไขข้อความ", text: "แก้ไขข้อความเสียง" } },
            ],
          },
        },
      }],
    }),
  });
}

export async function replyVoiceProposalFallback(replyToken: string, proposal: VoiceTransactionProposal, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: voiceProposalText(proposal).slice(0, 5000), quickReply: voiceQuickReply() }] }),
  });
}

export async function pushText(to: string, text: string, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/push", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 5000) }] }) });
}

export async function pushTextWithQuickReplies(to: string, text: string, actions: Array<{ label: string; text: string }>, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/push", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      to,
      messages: [{
        type: "text",
        text: text.slice(0, 5000),
        quickReply: { items: actions.slice(0, 6).map(action => ({ type: "action", action: { type: "message", label: action.label.slice(0, 20), text: action.text.slice(0, 300) } })) },
      }],
    }),
  });
}

export async function replyMention(replyToken: string, message: string, lineUserId: string, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "textV2",
        text: "{member} " + message.slice(0, 4800),
        substitution: { member: { type: "mention", mentionee: { type: "user", userId: lineUserId } } },
      }],
    }),
  });
}

export async function getMessageContent(messageId: string, credentials = lineCredentials()) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${credentials.channelAccessToken}` },
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 0) return bytes;
        lastError = "LINE returned an empty media body";
      } else {
        const body = await response.text().catch(() => "");
        lastError = `LINE data API ${response.status}: ${body || response.statusText}`;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "LINE media download failed";
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 250 : 700));
  }
  throw new Error(lastError);
}

export async function getProfile(source: LineSource, credentials = lineCredentials()) {
  if (source.type === "user") {
    const response = await callLine(`/v2/bot/profile/${source.userId}`, credentials, { method: "GET" });
    return (await response.json()) as { displayName: string };
  }
  if (!source.userId) return undefined;
  const path = source.type === "group" ? `/v2/bot/group/${source.groupId}/member/${source.userId}` : `/v2/bot/room/${source.roomId}/member/${source.userId}`;
  const response = await callLine(path, credentials, { method: "GET" });
  return (await response.json()) as { displayName: string };
}

export async function replyRichMenu(replyToken: string, text: string, artwork: RichMenuArtwork, credentials = lineCredentials()) {
  const [staticImage] = artworkMessages(artwork);
  if (!staticImage) throw new Error("Milo rich-menu artwork is unavailable");
  const image = isDynamicRichMenuArtwork(artwork)
    ? { type: "image", originalContentUrl: buildRichMenuDataImageUrl(artwork, text), previewImageUrl: buildRichMenuDataImageUrl(artwork, text) }
    : staticImage;
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        ...image,
        quickReply: { items: [
          { type: "action", action: { type: "message", label: "วันนี้", text: "สรุปวันนี้" } },
          { type: "action", action: { type: "message", label: "สัปดาห์นี้", text: "สรุปสัปดาห์นี้" } },
          { type: "action", action: { type: "message", label: "เดือนนี้", text: "สรุปเดือนนี้" } },
          { type: "action", action: { type: "message", label: "ปีนี้", text: "สรุปปีนี้" } },
          { type: "action", action: { type: "uri", label: "เปิดแดชบอร์ด", uri: new URL("/dashboard", process.env.MILO_PUBLIC_URL || "https://milo-line-assistant.onrender.com").href } },
        ] },
      }],
    }),
  });
}
export type MiloListRow = { id: number; title: string; detail: string; actionLabel?: string; actionText?: string };

async function replyMiloListBubble(replyToken: string, title: string, subtitle: string, rows: MiloListRow[], credentials = lineCredentials()) {
  const contents = rows.slice(0, 10).map(row => ({
    type: "box", layout: "horizontal", spacing: "sm", paddingAll: "10px", cornerRadius: "lg", backgroundColor: "#FFFFFF",
    contents: [
      { type: "box", layout: "vertical", flex: 1, contents: [
        { type: "text", text: ("#" + row.id + " " + row.title).slice(0, 120), size: "sm", weight: "bold", color: "#315F58", wrap: true },
        { type: "text", text: row.detail.slice(0, 180), size: "xxs", color: "#789891", wrap: true, margin: "xs" },
      ] },
      ...(row.actionText ? [{ type: "button", style: "secondary", height: "sm", flex: 0, action: { type: "message", label: (row.actionLabel ?? "ยกเลิก").slice(0, 20), text: row.actionText.slice(0, 300) } }] : []),
    ],
  }));
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "flex", altText: title, contents: { type: "bubble", size: "mega", body: { type: "box", layout: "vertical", spacing: "md", backgroundColor: "#F3FBF7", contents: [
    { type: "text", text: title, size: "xl", weight: "bold", color: "#0D735B" },
    { type: "text", text: subtitle, size: "xs", color: "#789891", wrap: true },
    ...(contents.length ? contents : [{ type: "text", text: "ยังไม่มีรายการครับ", size: "sm", color: "#789891", margin: "md" }]),
  ] } } }] }) });
}

export async function replyTransactionList(replyToken: string, rows: MiloListRow[], credentials = lineCredentials()) {
  return replyMiloListBubble(replyToken, "📋 รายการล่าสุด", "แตะปุ่มด้านขวาเพื่อลบรายการที่ต้องการ", rows.map(row => ({ ...row, actionLabel: "ลบ", actionText: "ลบรายการ #" + row.id })), credentials);
}

export async function replyReminderList(replyToken: string, rows: MiloListRow[], credentials = lineCredentials()) {
  return replyMiloListBubble(replyToken, "🔔 รายการเตือน", "แต่ละรายการมีปุ่มยกเลิกให้กดได้ทันที", rows.map(row => ({ ...row, actionLabel: "ยกเลิก", actionText: "ยกเลิกเตือน #" + row.id })), credentials);
}

export async function replyCalendarList(replyToken: string, rows: MiloListRow[], credentials = lineCredentials()) {
  return replyMiloListBubble(replyToken, "📅 ปฏิทิน Milo", "นัดหมายที่กำลังจะถึง แตะยกเลิกได้จากรายการ", rows.map(row => ({ ...row, actionLabel: "ยกเลิก", actionText: "ยกเลิกนัด #" + row.id })), credentials);
}
