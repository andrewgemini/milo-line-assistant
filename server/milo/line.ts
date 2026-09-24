import { budgetStatusCopy } from "./budgetStatus";
import type { MiloFlexThemeArtwork } from "./flexThemeArtwork";
import {
  MILO_COLORS,
  miloActionTile,
  miloBrandHeader,
  miloBubble,
  miloInfoRow,
  miloPrimaryButton,
  miloProgressRow,
  miloSecondaryButton,
  miloSectionTitle,
  miloStatCard,
  miloTab,
  miloUriButton,
  miloWelcomeBubble,
} from "./flexUi";
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

export async function replyText(replyToken: string, text: string, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 5000) }] }) });
}

function miloThemeQuickReplies() {
  return {
    items: [
      { type: "action", action: { type: "message", label: "บันทึก", text: "จดบันทึก" } },
      { type: "action", action: { type: "message", label: "วันนี้", text: "สรุปวันนี้" } },
      { type: "action", action: { type: "message", label: "วิเคราะห์", text: "วิเคราะห์" } },
      { type: "action", action: { type: "message", label: "รายการ", text: "รายการ" } },
      { type: "action", action: { type: "message", label: "ตั้งค่า", text: "ตั้งค่า" } },
    ],
  };
}

function miloMainActionRows() {
  return [
    {
      type: "box", layout: "horizontal", spacing: "sm", contents: [
        miloActionTile("บันทึกรายรับ", "บันทึกรายรับ", "mint", "+", "เพิ่มรายได้ของคุณ"),
        miloActionTile("บันทึกรายจ่าย", "บันทึกรายจ่าย", "pink", "−", "บันทึกค่าใช้จ่ายง่าย ๆ"),
      ],
    },
    {
      type: "box", layout: "horizontal", spacing: "sm", contents: [
        miloActionTile("สรุปวันนี้", "สรุปวันนี้", "lavender", "วัน"),
        miloActionTile("สรุปสัปดาห์", "สรุปสัปดาห์นี้", "lavender", "7"),
      ],
    },
    {
      type: "box", layout: "horizontal", spacing: "sm", contents: [
        miloActionTile("สรุปเดือน", "สรุปเดือนนี้", "lavender", "30"),
        miloActionTile("วิเคราะห์", "วิเคราะห์", "blue", "%"),
      ],
    },
    {
      type: "box", layout: "horizontal", spacing: "sm", contents: [
        miloActionTile("รายการล่าสุด", "รายการ", "blue", "≡"),
        miloActionTile("ตั้งเตือน", "รายการเตือน", "lavender", "!"),
      ],
    },
  ];
}

function miloTextPanel(text: string) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    paddingAll: "14px",
    cornerRadius: "xl",
    backgroundColor: MILO_COLORS.surface,
    contents: [{ type: "text", text: text.slice(0, 3500), size: "sm", color: MILO_COLORS.text, wrap: true }],
  };
}

function miloThemedContents(artwork: MiloFlexThemeArtwork, text: string) {
  if (artwork === "home") {
    return [
      miloBrandHeader(),
      miloWelcomeBubble("สวัสดีครับ วันนี้ให้ Milo ช่วยจดหรือสรุปอะไรดีครับ?"),
      miloSectionTitle("เมนูหลัก", "เลือกใช้งานได้เลย"),
      ...miloMainActionRows(),
    ];
  }
  if (artwork === "menu") {
    return [
      miloBrandHeader("เมนูหลัก", "เลือกเมนูที่ต้องการได้เลยครับ"),
      ...miloMainActionRows(),
      {
        type: "box", layout: "horizontal", spacing: "sm", contents: [
          miloActionTile("เก็บไฟล์", "คลังไฟล์", "blue", "F"),
          miloActionTile("Export", "ส่งออก CSV", "blue", "↑"),
        ],
      },
      miloActionTile("ตั้งค่า", "ตั้งค่า", "lavender", "S"),
    ];
  }
  if (artwork === "analysis-budget") {
    return [
      miloBrandHeader("วิเคราะห์รายจ่าย", "งบประมาณและหมวดหมู่"),
      {
        type: "box", layout: "horizontal", spacing: "sm", contents: [
          miloTab("วิเคราะห์", true, "วิเคราะห์"),
          miloTab("งบประมาณ", false, "งบประมาณ"),
          miloTab("หมวดหมู่", false, "หมวดหมู่"),
        ],
      },
      miloTextPanel(text),
      {
        type: "box", layout: "horizontal", spacing: "sm", contents: [
          miloActionTile("สรุปเดือน", "สรุปเดือนนี้", "lavender", "30"),
          miloActionTile("รายการล่าสุด", "รายการ", "blue", "≡"),
        ],
      },
    ];
  }
  if (artwork === "utility") {
    return [
      miloBrandHeader("ผู้ช่วยจัดการ", "ตั้งเตือน • เก็บไฟล์ • Export"),
      {
        type: "box", layout: "horizontal", spacing: "sm", contents: [
          miloTab("ตั้งเตือน", true, "รายการเตือน"),
          miloTab("เก็บไฟล์", false, "คลังไฟล์"),
          miloTab("Export", false, "ส่งออก CSV"),
        ],
      },
      miloTextPanel(text),
      miloPrimaryButton("เพิ่มการตั้งเตือน", "ตั้งเตือน"),
    ];
  }
  if (artwork === "settings-help") {
    return [
      miloBrandHeader("ตั้งค่า / วิธีใช้งาน", "จัดการ Milo ให้เหมาะกับคุณ"),
      {
        type: "box", layout: "horizontal", spacing: "sm", contents: [
          miloTab("ตั้งค่า", true, "ตั้งค่า"),
          miloTab("วิธีใช้งาน", false, "วิธีใช้งาน"),
        ],
      },
      miloTextPanel(text),
      miloActionTile("หมวดหมู่", "หมวดหมู่", "lavender", "M"),
      miloActionTile("งบประมาณรายเดือน", "งบประมาณ", "mint", "฿"),
      miloActionTile("การแจ้งเตือน", "รายการเตือน", "pink", "!"),
    ];
  }
  if (artwork === "transactions") {
    return [
      miloBrandHeader("รายการล่าสุด", "ดูรายการย้อนหลังของคุณ"),
      miloTextPanel(text),
      miloPrimaryButton("ดูรายการทั้งหมด", "รายการ"),
    ];
  }
  if (artwork === "summary-day") {
    return [
      miloBrandHeader("สรุปวันนี้", "ภาพรวมรายรับ รายจ่าย และคงเหลือ"),
      miloTextPanel(text),
      miloPrimaryButton("ดูรายการทั้งหมด", "รายการ"),
    ];
  }
  if (artwork === "summary-period") {
    return [
      miloBrandHeader("สรุปสัปดาห์ / สรุปเดือน", "เปรียบเทียบภาพรวมการเงิน"),
      miloTextPanel(text),
      miloPrimaryButton("ดูรายละเอียด", "สรุปเดือนนี้"),
    ];
  }
  return [
    miloBrandHeader("บันทึกสำเร็จ", "Milo เก็บรายการนี้ไว้ให้แล้ว"),
    miloTextPanel(text),
  ];
}

export async function replyThemedTextCard(
  replyToken: string,
  text: string,
  artwork: MiloFlexThemeArtwork,
  credentials = lineCredentials(),
) {
  const detectedUrl = text.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.]+$/, "");
  const footer = detectedUrl ? [miloUriButton("เปิดลิงก์", detectedUrl)] : undefined;
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "flex",
        altText: text.slice(0, 400),
        contents: miloBubble(miloThemedContents(artwork, text), footer),
        quickReply: miloThemeQuickReplies(),
      }],
    }),
  });
}

export async function replyMiloOnboarding(replyToken: string, displayName?: string, credentials = lineCredentials()) {
  const name = displayName?.trim() ? displayName.trim().slice(0, 40) : "คุณ";
  const contents = [
    miloBrandHeader("ยินดีต้อนรับสู่ Milo", "ตั้งค่าครั้งเดียว แล้วเริ่มจดได้เลย"),
    miloWelcomeBubble(`สวัสดีคุณ${name} เชื่อมต่อ Milo เรียบร้อยแล้วครับ`),
    {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", cornerRadius: "xl", backgroundColor: MILO_COLORS.surface,
      contents: [
        { type: "text", text: "สิ่งที่จะตั้งค่า", size: "sm", weight: "bold", color: MILO_COLORS.text },
        miloInfoRow("บัญชีส่วนตัว", "ยอดเริ่มต้น", "mint"),
        miloInfoRow("หมวดหมู่", "รายรับ / รายจ่าย", "lavender"),
        miloInfoRow("งบประมาณ", "รายการประจำ", "pink"),
        miloInfoRow("ปฏิทินและเตือน", "สรุปอัตโนมัติ", "blue"),
      ],
    },
  ];
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "flex",
        altText: "ตั้งค่า Milo ก่อนเริ่มใช้งาน",
        contents: miloBubble(contents, [
          miloPrimaryButton("เริ่มตั้งค่า", "เริ่มตั้งค่า"),
          miloSecondaryButton("ตั้งค่าภายหลัง", "ตั้งค่า"),
        ]),
      }],
    }),
  });
}

export async function replyMiloSettings(replyToken: string, credentials = lineCredentials()) {
  const contents = [
    miloBrandHeader("ตั้งค่า / วิธีใช้งาน", "ตั้งค่าง่าย ใช้งานสะดวก ให้ Milo ดูแลคุณเสมอ"),
    {
      type: "box", layout: "horizontal", spacing: "sm", contents: [
        miloTab("ตั้งค่า", true, "ตั้งค่า"),
        miloTab("วิธีใช้งาน", false, "วิธีใช้งาน"),
      ],
    },
    miloActionTile("ข้อมูลส่วนตัว", "ยอดเงินเริ่มต้น 0 บาท", "lavender", "คน", "จัดการโปรไฟล์และยอดเริ่มต้น"),
    miloActionTile("หมวดหมู่", "หมวดหมู่", "lavender", "M", "จัดการหมวดรายรับและรายจ่าย"),
    miloActionTile("งบประมาณรายเดือน", "งบประมาณ", "mint", "฿", "ตั้งวงเงินในแต่ละหมวด"),
    miloActionTile("การแจ้งเตือน", "รายการเตือน", "pink", "!", "ตั้งค่าการแจ้งเตือนและรายการประจำ"),
    miloActionTile("วิธีใช้งาน Milo", "วิธีใช้งาน", "blue", "?", "ดูคู่มือและคำสั่งที่ใช้บ่อย"),
  ];
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "flex",
        altText: "ตั้งค่า Milo",
        contents: miloBubble(contents, [miloPrimaryButton("เริ่มใช้งาน Milo", "เริ่มใช้งาน")]),
      }],
    }),
  });
}
export async function replyTextWithQuickReplies(replyToken: string, text: string, actions: Array<{ label: string; text: string }>, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 5000), quickReply: { items: actions.slice(0, 3).map(action => ({ type: "action", action: { type: "message", label: action.label.slice(0, 20), text: action.text.slice(0, 300) } })) } }] }),
  });
}

export type MiloHomeOverview = { income: number; expense: number; balance: number; dateLabel?: string };

export async function replyGreetingHome(
  replyToken: string,
  credentials = lineCredentials(),
  overview?: MiloHomeOverview,
) {
  const contents = [
    miloBrandHeader(),
    miloWelcomeBubble("สวัสดีครับ วันนี้คุณมีแพลนการใช้จ่าย หรืออยากดูสรุปอะไรไหมครับ?"),
    ...(overview ? [
      miloSectionTitle("ภาพรวมวันนี้", overview.dateLabel),
      {
        type: "box", layout: "horizontal", spacing: "sm", contents: [
          miloStatCard("รายรับ", `${overview.income.toLocaleString("th-TH")} บาท`, "mint"),
          miloStatCard("รายจ่าย", `${overview.expense.toLocaleString("th-TH")} บาท`, "pink"),
          miloStatCard("คงเหลือ", `${overview.balance.toLocaleString("th-TH")} บาท`, "lavender"),
        ],
      },
    ] : []),
    miloSectionTitle("เมนูหลัก", "เลือกใช้งานได้เลย"),
    ...miloMainActionRows(),
  ];
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "flex",
        altText: "Milo ผู้ช่วยจัดการการเงินของคุณ",
        contents: miloBubble(contents),
        quickReply: miloThemeQuickReplies(),
      }],
    }),
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

function miloFinanceTrendCard(report: FinanceReportCard) {
  if (!report.rows?.length || (report.period !== "week" && report.period !== "month")) return undefined;
  const buckets = new Map<string, { label: string; income: number; expense: number }>();
  for (const row of report.rows) {
    if (!row.occurredAt) continue;
    const date = row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    const label = new Intl.DateTimeFormat("th-TH-u-nu-latn", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric" }).format(date);
    const bucket = buckets.get(key) ?? { label, income: 0, expense: 0 };
    const amount = Number(row.amount);
    if (row.transactionType === "income") bucket.income += Number.isFinite(amount) ? amount : 0;
    else bucket.expense += Number.isFinite(amount) ? amount : 0;
    buckets.set(key, bucket);
  }
  const days = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([, value]) => value);
  if (!days.length) return undefined;
  const max = Math.max(...days.flatMap(day => [day.income, day.expense]), 1);
  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    paddingAll: "14px",
    cornerRadius: "xl",
    backgroundColor: MILO_COLORS.surface,
    contents: [
      { type: "text", text: "กราฟรายวัน", size: "lg", weight: "bold", color: MILO_COLORS.text },
      {
        type: "box", layout: "horizontal", spacing: "md", contents: [
          { type: "text", text: "● รายรับ", size: "xxs", color: MILO_COLORS.greenText },
          { type: "text", text: "● รายจ่าย", size: "xxs", color: MILO_COLORS.pinkText },
        ],
      },
      ...days.map(day => ({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        alignItems: "center",
        contents: [
          { type: "text", text: day.label, size: "xxs", color: MILO_COLORS.muted, width: "58px" },
          {
            type: "box", layout: "vertical", spacing: "xs", flex: 1, contents: [
              {
                type: "box", layout: "horizontal", height: "6px", cornerRadius: "xl", backgroundColor: "#E3F7F0",
                contents: [{ type: "box", layout: "vertical", width: `${Math.max(2, Math.round((day.income / max) * 100))}%`, height: "6px", cornerRadius: "xl", backgroundColor: MILO_COLORS.primaryStrong, contents: [] }],
              },
              {
                type: "box", layout: "horizontal", height: "6px", cornerRadius: "xl", backgroundColor: "#FCE3ED",
                contents: [{ type: "box", layout: "vertical", width: `${Math.max(2, Math.round((day.expense / max) * 100))}%`, height: "6px", cornerRadius: "xl", backgroundColor: MILO_COLORS.accentStrong, contents: [] }],
              },
            ],
          },
        ],
      })),
    ],
  };
}

function miloFinanceSummaryContents(report: FinanceReportCard) {
  const money = (amount: number) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const periodLabel: Record<FinanceReportCard["period"], string> = { day: "วันนี้", week: "สัปดาห์", month: "เดือน", year: "ปี" };
  const title = report.title ?? `สรุป${periodLabel[report.period]}`;
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const maxCategory = Math.max(...categories.map(([, amount]) => amount), 1);
  const tones = ["pink", "lavender", "blue"] as const;
  const trend = miloFinanceTrendCard(report);

  return [
    miloBrandHeader(title, report.subtitle ?? (report.period === "day" ? "ภาพรวมการเงินวันนี้" : "ภาพรวมรายรับ รายจ่าย และคงเหลือ")),
    ...(report.period === "week" || report.period === "month" ? [{
      type: "box", layout: "horizontal", spacing: "sm", contents: [
        miloTab("สรุปสัปดาห์", report.period === "week", "สรุปสัปดาห์นี้"),
        miloTab("สรุปเดือน", report.period === "month", "สรุปเดือนนี้"),
      ],
    }] : []),
    {
      type: "box", layout: "horizontal", spacing: "sm", contents: [
        miloStatCard("รายรับ", `${money(report.income)} บาท`, "mint"),
        miloStatCard("รายจ่าย", `${money(report.expense)} บาท`, "pink"),
        miloStatCard("คงเหลือสุทธิ", `${money(report.balance)} บาท`, "lavender"),
      ],
    },
    ...(trend ? [trend] : []),
    miloSectionTitle(report.period === "day" ? "หมวดค่าใช้จ่าย (Top 3)" : "หมวดค่าใช้จ่าย"),
    ...(categories.length
      ? categories.map(([name, amount], index) => miloProgressRow(name, `${money(amount)} บาท`, amount / maxCategory, tones[index] ?? "pink"))
      : [{ type: "box", layout: "vertical", paddingAll: "14px", cornerRadius: "xl", backgroundColor: MILO_COLORS.surface, contents: [
          { type: "text", text: "ยังไม่มีรายจ่ายในช่วงนี้", size: "sm", color: MILO_COLORS.muted, align: "center" },
        ] }]),
  ];
}

export async function replyFinanceReportCard(replyToken: string, report: FinanceReportCard, credentials = lineCredentials()) {
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "flex",
        altText: financeReportCardText(report),
        contents: miloBubble(miloFinanceSummaryContents(report), [
          {
            type: "box", layout: "horizontal", spacing: "sm", contents: [
              miloSecondaryButton("ดูรายการทั้งหมด", "รายการ"),
              miloPrimaryButton(report.period === "day" ? "แชร์สรุปวันนี้" : "ดูรายละเอียด", report.period === "day" ? "สรุปวันนี้" : "รายการ"),
            ],
          },
        ]),
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
  return callLine("/v2/bot/message/push", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      to,
      messages: [{
        type: "flex",
        altText: financeReportCardText(report),
        contents: miloBubble(miloFinanceSummaryContents(report), [
          {
            type: "box", layout: "horizontal", spacing: "sm", contents: [
              miloSecondaryButton("ดูรายการทั้งหมด", "รายการ"),
              miloPrimaryButton("ดูรายละเอียด", report.period === "day" ? "สรุปวันนี้" : "สรุปเดือนนี้"),
            ],
          },
        ]),
      }],
    }),
  });
}

export async function replyPostSaveSummary(replyToken: string, summary: PostSaveSummary, credentials = lineCredentials()) {
  const isExpense = summary.transactionType === "expense";
  const categoryLabel = isExpense && summary.category === "อาหาร" ? "ค่าอาหาร" : summary.category;
  const accent = isExpense ? MILO_COLORS.accentStrong : MILO_COLORS.primaryStrong;
  const timestamp = new Intl.DateTimeFormat("th-TH-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(summary.occurredAt);

  const contents = [
    miloBrandHeader(),
    {
      type: "box",
      layout: "horizontal",
      alignItems: "center",
      spacing: "md",
      paddingAll: "14px",
      cornerRadius: "xl",
      backgroundColor: MILO_COLORS.surfaceMint,
      contents: [
        {
          type: "box",
          layout: "vertical",
          justifyContent: "center",
          alignItems: "center",
          width: "42px",
          height: "42px",
          cornerRadius: "xl",
          backgroundColor: MILO_COLORS.primaryStrong,
          contents: [{ type: "text", text: "✓", size: "xl", weight: "bold", color: "#FFFFFF", align: "center" }],
        },
        {
          type: "box",
          layout: "vertical",
          flex: 1,
          contents: [
            { type: "text", text: "บันทึกสำเร็จ", size: "xl", weight: "bold", color: MILO_COLORS.text },
            { type: "text", text: mascotExpenseCopy(summary.transactionType, summary.amount), size: "xs", color: MILO_COLORS.muted, wrap: true, margin: "xs" },
          ],
        },
      ],
    },
    {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      cornerRadius: "xl",
      backgroundColor: MILO_COLORS.surface,
      contents: [
        { type: "text", text: `${isExpense ? "รายจ่าย" : "รายรับ"} • ${categoryLabel}`, size: "sm", weight: "bold", color: accent },
        { type: "text", text: `${summary.amount.toLocaleString("th-TH")} บาท`, size: "3xl", weight: "bold", color: accent },
        miloInfoRow("รายการที่จด", summary.note?.trim() || categoryLabel, "lavender"),
        miloInfoRow("วันที่ - เวลา", timestamp, "blue"),
        miloInfoRow("หมวดหมู่", categoryLabel, isExpense ? "pink" : "mint"),
        ...(summary.budgetLimit > 0 && summary.budgetPercent !== undefined
          ? [miloProgressRow(
              `งบหมวด${categoryLabel}`,
              `${summary.budgetSpent.toLocaleString("th-TH")} / ${summary.budgetLimit.toLocaleString("th-TH")} บาท`,
              summary.budgetLimit > 0 ? summary.budgetSpent / summary.budgetLimit : 0,
              summary.budgetPercent >= 100 ? "pink" : "mint",
            )]
          : []),
        miloSectionTitle("สรุปยอดวันนี้"),
        {
          type: "box", layout: "horizontal", spacing: "sm", contents: [
            miloStatCard("รายรับ", `${summary.dailyIncome.toLocaleString("th-TH")} บาท`, "mint"),
            miloStatCard("รายจ่าย", `${summary.dailyExpense.toLocaleString("th-TH")} บาท`, "pink"),
            miloStatCard("ยอดคงเหลือวันนี้", `${summary.dailyBalance.toLocaleString("th-TH")} บาท`, "lavender"),
          ],
        },
      ],
    },
  ];

  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "flex",
        altText: postSaveSummaryText(summary),
        contents: miloBubble(contents, [
          {
            type: "box", layout: "horizontal", spacing: "sm", contents: [
              miloSecondaryButton("ดูรายการ", "รายการ"),
              miloSecondaryButton("แก้ไข", "รายการ"),
              miloSecondaryButton("ลบ", "ลบรายการล่าสุด"),
            ],
          },
          miloPrimaryButton("บันทึกรายการถัดไป", "จดบันทึก"),
        ]),
      }],
    }),
  });
}

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

export type MiloListRow = { id: number; title: string; detail: string; actionLabel?: string; actionText?: string };

async function replyMiloListBubble(replyToken: string, title: string, subtitle: string, rows: MiloListRow[], artwork: MiloFlexThemeArtwork, credentials = lineCredentials()) {
  const cards = rows.slice(0, 10).map(row => ({
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    alignItems: "center",
    paddingAll: "12px",
    cornerRadius: "xl",
    backgroundColor: MILO_COLORS.surface,
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: [
          { type: "text", text: row.title.slice(0, 120), size: "sm", weight: "bold", color: MILO_COLORS.text, wrap: true },
          { type: "text", text: row.detail.slice(0, 180), size: "xxs", color: MILO_COLORS.muted, wrap: true, margin: "xs" },
          { type: "text", text: `#${row.id}`, size: "xxs", color: MILO_COLORS.secondary, margin: "xs" },
        ],
      },
      ...(row.actionText ? [{
        type: "button",
        style: "secondary",
        height: "sm",
        flex: 0,
        action: {
          type: "message",
          label: (row.actionLabel ?? "ยกเลิก").slice(0, 20),
          text: row.actionText.slice(0, 300),
        },
      }] : []),
    ],
  }));

  const heading = artwork === "transactions"
    ? "รายการล่าสุด"
    : title.replace(/^[^ก-๙A-Za-z0-9]+/, "").trim();

  const contents = [
    miloBrandHeader(heading, subtitle),
    ...(artwork === "utility" ? [{
      type: "box", layout: "horizontal", spacing: "sm", contents: [
        miloTab("ตั้งเตือน", title.includes("เตือน"), "รายการเตือน"),
        miloTab("เก็บไฟล์", false, "คลังไฟล์"),
        miloTab("Export", false, "ส่งออก CSV"),
      ],
    }] : []),
    ...(cards.length ? cards : [{
      type: "box", layout: "vertical", paddingAll: "16px", cornerRadius: "xl", backgroundColor: MILO_COLORS.surface,
      contents: [{ type: "text", text: "ยังไม่มีรายการครับ", size: "sm", color: MILO_COLORS.muted, align: "center" }],
    }]),
  ];

  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "flex", altText: title, contents: miloBubble(contents) }],
    }),
  });
}

export async function replyTransactionList(replyToken: string, rows: MiloListRow[], credentials = lineCredentials()) {
  return replyMiloListBubble(replyToken, "📋 รายการล่าสุด", "แตะปุ่มด้านขวาเพื่อลบรายการที่ต้องการ", rows.map(row => ({ ...row, actionLabel: "ลบ", actionText: "ลบรายการ #" + row.id })), "transactions", credentials);
}

export async function replyReminderList(replyToken: string, rows: MiloListRow[], credentials = lineCredentials()) {
  return replyMiloListBubble(replyToken, "🔔 รายการเตือน", "แต่ละรายการมีปุ่มยกเลิกให้กดได้ทันที", rows.map(row => ({ ...row, actionLabel: "ยกเลิก", actionText: "ยกเลิกเตือน #" + row.id })), "utility", credentials);
}

export async function replyCalendarList(replyToken: string, rows: MiloListRow[], credentials = lineCredentials()) {
  return replyMiloListBubble(replyToken, "📅 ปฏิทิน Milo", "นัดหมายที่กำลังจะถึง แตะยกเลิกได้จากรายการ", rows.map(row => ({ ...row, actionLabel: "ยกเลิก", actionText: "ยกเลิกนัด #" + row.id })), "utility", credentials);
}
