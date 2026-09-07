import { pushFinanceReportCard, replyFinanceReportCard } from "../server/milo/line";

const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required");

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as { messages: unknown[] };
  const endpoint = String(input).endsWith("/push") ? "push" : "reply";
  return realFetch(`https://api.line.me/v2/bot/message/validate/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messages: body.messages }),
  });
};

const reports = [
  { period: "day" as const, income: 0, expense: 615, balance: -615, categories: { อาหาร: 565, ทั่วไป: 50 } },
  { period: "week" as const, income: 1200, expense: 615, balance: 585, categories: { อาหาร: 565, ทั่วไป: 50 } },
  { period: "month" as const, income: 5000, expense: 1615, balance: 3385, categories: { อาหาร: 1065, เดินทาง: 550 } },
];

const results = [];
for (const report of reports) {
  const response = await replyFinanceReportCard("validation-only", report, { channelSecret: "validation-only", channelAccessToken: accessToken });
  results.push({ period: report.period, valid: response.ok, status: response.status, body: await response.text() });
}

const digestResponse = await pushFinanceReportCard("validation-only", { ...reports[1], title: "สรุปการเงินสัปดาห์ที่ผ่านมา", subtitle: "รอบข้อมูลที่ปิดแล้ว" }, { channelSecret: "validation-only", channelAccessToken: accessToken });
results.push({ period: "digest-push", valid: digestResponse.ok, status: digestResponse.status, body: await digestResponse.text() });

console.log(JSON.stringify(results));
