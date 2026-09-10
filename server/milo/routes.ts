import express, { type Express, type Request, type Response } from "express";
import { sdk } from "../_core/sdk";
import { transcribeAudio } from "../_core/voiceTranscription";
import { storageGetSignedUrl, storagePut } from "../storage";
import * as db from "../db";
import { analyzeImage } from "./imageAnalysis";
import { generateFinancialInsight, suggestExpenseCategory } from "./financialAssistant";
import { parseMiloCommand } from "./commandParser";
import { deliverDueReminders } from "./reminderDelivery";
import { deliverDueRecurringTransactions } from "./recurringTransactionDelivery";
import { deliverFinanceDigest, type FinanceDigestType } from "./financeDigest";
import { buildExpenseNote, formatImageProposal, normalizeExpenseCategory, parseExtractedDate, selectImageProposal } from "./receiptUtils";
import { STANDARD_EXPENSE_CATEGORIES, STANDARD_INCOME_CATEGORIES } from "./financeCategories";
import { financeReportCardText, getMessageContent, getProfile, lineCredentials, postSaveSummaryText, pushText, replyFinanceReportCard, replyFinanceReportCardFallback, replyMention, replyPostSaveSummary, replyPostSaveSummaryFallback, replyText, replyVoiceCategoryChoices, replyVoiceProposal, replyVoiceProposalFallback, sourceIdentity, type LineEvent, type VoiceTransactionProposal, verifyLineSignature } from "./line";

function helpText() {
  return "à¸ªà¸§à¸±à¸ªà¸”à¸µà¸„à¸£à¸±à¸š à¸œà¸¡à¹„à¸¡à¹‚à¸¥ à¸Šà¹ˆà¸§à¸¢à¹„à¸”à¹‰à¹ƒà¸™à¹à¸Šà¸—à¹€à¸”à¸µà¸¢à¸§\nâ€¢ à¹€à¸•à¸·à¸­à¸™ à¸›à¸£à¸°à¸Šà¸¸à¸¡à¸žà¸£à¸¸à¹ˆà¸‡à¸™à¸µà¹‰ 10:00\nâ€¢ à¹€à¸•à¸·à¸­à¸™à¸”à¸·à¹ˆà¸¡à¸™à¹‰à¸³à¸—à¸¸à¸ 30 à¸™à¸²à¸—à¸µ\nâ€¢ à¸ˆà¹ˆà¸²à¸¢à¸à¸²à¹à¸Ÿ 65 / à¸ˆà¹ˆà¸²à¸¢à¸„à¹ˆà¸²à¹„à¸Ÿ 1200\nâ€¢ à¸£à¸±à¸šà¹€à¸‡à¸´à¸™à¹€à¸”à¸·à¸­à¸™ 45000 / à¸£à¸±à¸šà¸„à¹ˆà¸²à¸ˆà¹‰à¸²à¸‡ 5000\nâ€¢ à¸ªà¹ˆà¸‡à¸ªà¸¥à¸´à¸›à¸«à¸£à¸·à¸­à¹ƒà¸šà¹€à¸ªà¸£à¹‡à¸ˆ à¹à¸¥à¹‰à¸§à¸žà¸´à¸¡à¸žà¹Œ â€œà¸¢à¸·à¸™à¸¢à¸±à¸™à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢â€\nâ€¢ à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡ à¹à¸¥à¹‰à¸§à¸žà¸´à¸¡à¸žà¹Œ â€œà¸¢à¸·à¸™à¸¢à¸±à¸™à¹€à¸ªà¸µà¸¢à¸‡â€\nâ€¢ à¸„à¹‰à¸™à¸«à¸²à¸£à¸²à¸¢à¸à¸²à¸£ à¸à¸²à¹à¸Ÿ / à¹à¸à¹‰à¸£à¸²à¸¢à¸à¸²à¸£ 12 à¹€à¸›à¹‡à¸™ 180 / à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£ 12\nâ€¢ à¸ªà¸£à¸¸à¸›à¸§à¸±à¸™à¸™à¸µà¹‰ / à¸ªà¸£à¸¸à¸›à¸ªà¸±à¸›à¸”à¸²à¸«à¹Œà¸™à¸µà¹‰ / à¸ªà¸£à¸¸à¸›à¹€à¸”à¸·à¸­à¸™à¸™à¸µà¹‰ / à¸ªà¸£à¸¸à¸›à¸›à¸µà¸™à¸µà¹‰\nâ€¢ à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸¡à¸§à¸” à¹€à¸”à¸´à¸™à¸—à¸²à¸‡ / à¸”à¸¹à¸«à¸¡à¸§à¸”\nâ€¢ à¹‚à¸™à¹‰à¸• à¸£à¸«à¸±à¸ª Wiâ€‘Fi à¸«à¹‰à¸­à¸‡à¸›à¸£à¸°à¸Šà¸¸à¸¡\nâ€¢ à¸‡à¸²à¸™ à¸ªà¹ˆà¸‡à¸ªà¸£à¸¸à¸›à¸£à¸²à¸¢à¸ªà¸±à¸›à¸”à¸²à¸«à¹Œ\nâ€¢ à¹€à¸à¹‡à¸š à¸¥à¸´à¸‡à¸à¹Œà¸«à¸£à¸·à¸­à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸ªà¸³à¸„à¸±à¸\nâ€¢ à¸„à¹‰à¸™à¸«à¸² à¹ƒà¸šà¹€à¸ªà¸£à¹‡à¸ˆ\n\nà¹€à¸Šà¸·à¹ˆà¸­à¸¡ dashboard: à¸žà¸´à¸¡à¸žà¹Œ â€œà¹„à¸­à¸”à¸µâ€ à¹ƒà¸™à¹à¸Šà¸—à¸ªà¹ˆà¸§à¸™à¸•à¸±à¸§à¸à¸±à¸šà¹„à¸¡à¹‚à¸¥";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function formatFinanceReport(report: Awaited<ReturnType<typeof db.financeReport>>) {
  const money = (amount: number) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const label: Record<typeof report.period, string> = { day: "à¸§à¸±à¸™à¸™à¸µà¹‰", week: "à¸ªà¸±à¸›à¸”à¸²à¸«à¹Œà¸™à¸µà¹‰", month: "à¹€à¸”à¸·à¸­à¸™à¸™à¸µà¹‰", year: "à¸›à¸µà¸™à¸µà¹‰" };
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => `â€¢ ${name} ${money(amount)} à¸šà¸²à¸—`).join("\n");
  return `à¸ªà¸£à¸¸à¸›à¸à¸²à¸£à¹€à¸‡à¸´à¸™${label[report.period]}\nà¸£à¸²à¸¢à¸£à¸±à¸š ${money(report.income)} à¸šà¸²à¸—\nà¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢ ${money(report.expense)} à¸šà¸²à¸—\nà¸à¸³à¹„à¸£/à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­ ${money(report.balance)} à¸šà¸²à¸—\n${categories ? `\nà¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢à¸•à¸²à¸¡à¸«à¸¡à¸§à¸”\n${categories}` : "\nà¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢à¹ƒà¸™à¸Šà¹ˆà¸§à¸‡à¸™à¸µà¹‰"}`;
}

function formatFinancialInsight(insight: Awaited<ReturnType<typeof generateFinancialInsight>>) {
  const quality = insight.dataSufficiency === "adequate" ? "à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹€à¸žà¸µà¸¢à¸‡à¸žà¸­à¸ªà¸³à¸«à¸£à¸±à¸šà¸§à¸´à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¹€à¸šà¸·à¹‰à¸­à¸‡à¸•à¹‰à¸™" : insight.dataSufficiency === "limited" ? "à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸¢à¸±à¸‡à¸¡à¸µà¹„à¸¡à¹ˆà¸¡à¸²à¸ à¸ˆà¸¶à¸‡à¹€à¸›à¹‡à¸™à¸‚à¹‰à¸­à¸ªà¸±à¸‡à¹€à¸à¸•à¹€à¸šà¸·à¹‰à¸­à¸‡à¸•à¹‰à¸™" : "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹€à¸žà¸µà¸¢à¸‡à¸žà¸­à¸ªà¸³à¸«à¸£à¸±à¸šà¸§à¸´à¹€à¸„à¸£à¸²à¸°à¸«à¹Œ";
  const highlights = insight.highlights.map(item => `â€¢ ${item}`).join("\n");
  const actions = insight.suggestedActions.map(item => `â€¢ ${item}`).join("\n");
  return `AI à¸ªà¸£à¸¸à¸›à¸˜à¸¸à¸£à¸à¸´à¸ˆ\n${quality}\n${insight.summary}${highlights ? `\n\nà¸‚à¹‰à¸­à¸ªà¸±à¸‡à¹€à¸à¸•\n${highlights}` : ""}${actions ? `\n\nà¹à¸™à¸§à¸—à¸²à¸‡à¸ˆà¸±à¸”à¸à¸²à¸£\n${actions}` : ""}`;
}

async function buildVoiceProposal(transcript: string, lineUserId: string, financeAccountId?: number): Promise<VoiceTransactionProposal> {
  const command = parseMiloCommand(transcript);
  if (command.type !== "expense" && command.type !== "income") return { transcript };
  let category = command.category;
  if (command.type === "expense") {
    try {
      const customCategories = (await db.listExpenseCategories(lineUserId, "expense", financeAccountId)).map(item => item.name);
      const allowed = Array.from(new Set([...STANDARD_EXPENSE_CATEGORIES, ...customCategories]));
      category = (await suggestExpenseCategory(command.note, allowed)).category;
    } catch { /* retain parser category when AI is unavailable */ }
  }
  return { transcript, transactionType: command.type, amount: command.amount, category, note: command.note };
}

function proposalFromStoredTranscript(transcript: string, proposalJson: string | null): VoiceTransactionProposal {
  try {
    const proposal = JSON.parse(proposalJson ?? "") as VoiceTransactionProposal;
    if ((proposal.transactionType === "expense" || proposal.transactionType === "income") && Number.isFinite(proposal.amount) && proposal.amount! > 0) return { ...proposal, transcript };
  } catch { /* old records have no structured proposal */ }
  const parsed = parseMiloCommand(transcript);
  return parsed.type === "expense" || parsed.type === "income" ? { transcript, transactionType: parsed.type, amount: parsed.amount, category: parsed.category, note: parsed.note } : { transcript };
}

async function sendVoiceProposal(replyToken: string, proposal: VoiceTransactionProposal) {
  try {
    await replyVoiceProposal(replyToken, proposal);
  } catch (error) {
    console.error("[Milo Voice] Flex proposal failed; sending Quick Reply fallback", { error: error instanceof Error ? error.message : "unknown" });
    await replyVoiceProposalFallback(replyToken, proposal);
  }
}

async function sendPostSaveSummary(replyToken: string, lineUserId: string, lineChatId: string, financeAccountId: number, transaction: Pick<VoiceTransactionProposal, "transactionType" | "amount" | "category">) {
  const report = await db.financeReport(lineUserId, "day", new Date(), financeAccountId);
  const summary = { transactionType: transaction.transactionType!, amount: transaction.amount!, category: transaction.category!, dailyIncome: report.income, dailyExpense: report.expense, dailyBalance: report.balance };
  try {
    await replyPostSaveSummary(replyToken, summary);
  } catch (error) {
    console.error("[Milo Save] post-save Flex failed; sending Quick Reply fallback", { error: error instanceof Error ? error.message : "unknown" });
    try {
      await replyPostSaveSummaryFallback(replyToken, summary);
    } catch (fallbackError) {
      console.error("[Milo Save] reply fallback failed; pushing text summary", { error: fallbackError instanceof Error ? fallbackError.message : "unknown" });
      await pushText(lineChatId, postSaveSummaryText(summary));
    }
  }
}

async function sendFinanceReportCard(replyToken: string, lineChatId: string, report: Awaited<ReturnType<typeof db.financeReport>>) {
  try {
    await replyFinanceReportCard(replyToken, report);
  } catch (error) {
    console.error("[Milo Report] Flex summary failed; sending text fallback", { error: error instanceof Error ? error.message : "unknown" });
    try {
      await replyFinanceReportCardFallback(replyToken, report);
    } catch (fallbackError) {
      console.error("[Milo Report] reply fallback failed; pushing text summary", { error: fallbackError instanceof Error ? fallbackError.message : "unknown" });
      await pushText(lineChatId, financeReportCardText(report));
    }
  }
}

type LineFinanceScope = "user" | "group" | "room";

async function resolveFinanceScope(lineUserId: string, lineChatId: string, scope: LineFinanceScope) {
  const access = await db.resolveFinanceAccountForLineEvent(lineUserId, lineChatId, scope);
  if (!access) return undefined;
  return { financeAccountId: access.account.id, role: access.membership.role };
}

function financeAccessMessage(scope: LineFinanceScope) {
  return scope === "user"
    ? "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸šà¸šà¸±à¸à¸Šà¸µà¸à¸²à¸£à¹€à¸‡à¸´à¸™à¸ªà¹ˆà¸§à¸™à¸•à¸±à¸§ à¸¥à¸­à¸‡à¸ªà¹ˆà¸‡à¸„à¸³à¸ªà¸±à¹ˆà¸‡à¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡à¸„à¸£à¸±à¸š"
    : "à¸à¸¥à¸¸à¹ˆà¸¡à¸™à¸µà¹‰à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¹€à¸›à¸´à¸”à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸ªà¸³à¸«à¸£à¸±à¸šà¸ªà¸¡à¸²à¸Šà¸´à¸à¸‚à¸­à¸‡à¸„à¸¸à¸“ à¸ˆà¸¶à¸‡à¹„à¸¡à¹ˆà¸šà¸±à¸™à¸—à¸¶à¸à¸«à¸£à¸·à¸­à¹à¸ªà¸”à¸‡à¸à¸²à¸£à¹€à¸‡à¸´à¸™à¸£à¹ˆà¸§à¸¡à¹‚à¸”à¸¢à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´ à¹€à¸žà¸·à¹ˆà¸­à¸›à¸à¸›à¹‰à¸­à¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ªà¹ˆà¸§à¸™à¸•à¸±à¸§ à¹ƒà¸«à¹‰à¹€à¸ˆà¹‰à¸²à¸‚à¸­à¸‡à¸à¸¥à¸¸à¹ˆà¸¡à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸²à¸šà¸±à¸à¸Šà¸µà¹à¸¥à¸°à¸šà¸—à¸šà¸²à¸—à¸ˆà¸²à¸ dashboard à¸à¹ˆà¸­à¸™à¸„à¸£à¸±à¸š";
}

async function handleText(event: LineEvent, lineChatId: string, lineUserId: string, scope: LineFinanceScope) {
  const text = event.message?.text ?? "";
  if (/^(?:à¹„à¸­à¸”à¸µ|id|user\s*id)$/i.test(text.trim())) {
    if (event.source.type === "user") {
      if (event.replyToken) await replyText(event.replyToken, `LINE User ID à¸‚à¸­à¸‡à¸„à¸¸à¸“à¸„à¸·à¸­\n${lineUserId}\n\nà¸„à¸±à¸”à¸¥à¸­à¸à¸£à¸«à¸±à¸ªà¸™à¸µà¹‰à¹„à¸›à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¹ƒà¸™à¹à¸”à¸Šà¸šà¸­à¸£à¹Œà¸”à¹„à¸¡à¹‚à¸¥à¹„à¸”à¹‰à¹€à¸¥à¸¢à¸„à¸£à¸±à¸š`);
    } else if (event.replyToken) {
      await replyText(event.replyToken, "à¹€à¸žà¸·à¹ˆà¸­à¸„à¸§à¸²à¸¡à¹€à¸›à¹‡à¸™à¸ªà¹ˆà¸§à¸™à¸•à¸±à¸§ à¸à¸£à¸¸à¸“à¸²à¸žà¸´à¸¡à¸žà¹Œ â€œà¹„à¸­à¸”à¸µâ€ à¹ƒà¸™à¹à¸Šà¸—à¸ªà¹ˆà¸§à¸™à¸•à¸±à¸§à¸à¸±à¸šà¹„à¸¡à¹‚à¸¥à¸„à¸£à¸±à¸š");
    }
    return;
  }
  const command = parseMiloCommand(text);
  let message = "";
  const financeCommands = new Set(["expense", "income", "transactionSearch", "transactionDelete", "transactionUpdate", "openingBalance", "financeReport", "aiSummary", "budgetOverview", "transactionList", "voiceConfirm", "voiceEditPrompt", "voiceCategoryChange", "voiceEdit", "budget", "categoryAdd", "categoryRemove", "categoryList", "imageConfirm"]);
  const financeScope = financeCommands.has(command.type) ? await resolveFinanceScope(lineUserId, lineChatId, scope) : undefined;
  if (financeCommands.has(command.type) && !financeScope) {
    if (event.replyToken) await replyText(event.replyToken, financeAccessMessage(scope));
    return;
  }
  if (command.type === "reminder") {
    const id = await db.createReminder({ lineChatId, createdByLineUserId: lineUserId, ...command.data, sourceMessageId: event.message?.id });
    message = `à¸•à¸±à¹‰à¸‡à¹€à¸•à¸·à¸­à¸™ #${id} à¹€à¸£à¸µà¸¢à¸šà¸£à¹‰à¸­à¸¢\n${command.data.title}\nà¸„à¸£à¸±à¹‰à¸‡à¸–à¸±à¸”à¹„à¸›: ${formatDate(command.data.nextRunAt)}`;
  } else if (command.type === "expense" || command.type === "income") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) { message = "à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¹ƒà¸™à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸™à¸µà¹‰à¹€à¸›à¹‡à¸™à¸œà¸¹à¹‰à¸”à¸¹ à¸ˆà¸¶à¸‡à¸¢à¸±à¸‡à¹€à¸žà¸´à¹ˆà¸¡à¸£à¸²à¸¢à¸à¸²à¸£à¹„à¸¡à¹ˆà¹„à¸”à¹‰"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    let category = command.category;
    if (command.type === "expense" && category === "à¸—à¸±à¹ˆà¸§à¹„à¸›") {
      try {
        const customCategories = (await db.listExpenseCategories(lineUserId, "expense", financeScope!.financeAccountId)).map(item => item.name);
        const suggestion = await suggestExpenseCategory(command.note, Array.from(new Set(["à¸­à¸²à¸«à¸²à¸£", "à¹€à¸”à¸´à¸™à¸—à¸²à¸‡", "à¸„à¹ˆà¸²à¸ªà¸²à¸˜à¸²à¸£à¸“à¸¹à¸›à¹‚à¸ à¸„", "à¸ªà¸¸à¸‚à¸ à¸²à¸ž", "à¸à¸²à¸£à¸¨à¸¶à¸à¸©à¸²", "à¸šà¸±à¸™à¹€à¸—à¸´à¸‡", "à¸Šà¹‰à¸­à¸›à¸›à¸´à¹‰à¸‡", "à¸—à¹ˆà¸­à¸‡à¹€à¸—à¸µà¹ˆà¸¢à¸§", "à¸—à¸±à¹ˆà¸§à¹„à¸›", ...customCategories])));
        category = suggestion.category;
      } catch { /* keep deterministic fallback category */ }
    }
    await db.createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope!.financeAccountId, transactionType: command.type, amount: command.amount, category, note: command.note, source: "line_text", sourceMessageId: event.message?.id });
    if (event.replyToken) { await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope!.financeAccountId, { transactionType: command.type, amount: command.amount, category }); return; }
    message = `à¸šà¸±à¸™à¸—à¸¶à¸${command.type === "expense" ? "à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢" : "à¸£à¸²à¸¢à¸£à¸±à¸š"} ${command.amount.toLocaleString("th-TH")} à¸šà¸²à¸— à¹ƒà¸™à¸«à¸¡à¸§à¸”${category}à¹à¸¥à¹‰à¸§`;
  } else if (command.type === "transactionSearch") {
    const results = await db.searchTransactions(lineUserId, command.query, 10, financeScope!.financeAccountId);
    message = results.length ? `à¸žà¸š ${results.length} à¸£à¸²à¸¢à¸à¸²à¸£\n${results.map(item => `#${item.id} Â· ${item.transactionType === "expense" ? "à¸ˆà¹ˆà¸²à¸¢" : "à¸£à¸±à¸š"} ${Number(item.amount).toLocaleString("th-TH")} à¸šà¸²à¸— Â· ${item.category}${item.note ? ` Â· ${item.note}` : ""}`).join("\n")}` : `à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸šà¸˜à¸¸à¸£à¸à¸£à¸£à¸¡ â€œ${command.query}â€`;
  } else if (command.type === "transactionDelete") {
    if (!db.canManageFinanceTransactions(financeScope!.role)) { message = "à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¢à¸±à¸‡à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸™à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const deleted = await db.deleteTransaction({ id: command.id, lineUserId, financeAccountId: financeScope!.financeAccountId });
    message = deleted ? `à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£ #${command.id} à¹à¸¥à¹‰à¸§ à¹‚à¸”à¸¢à¹€à¸à¹‡à¸šà¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸à¸²à¸£à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¹„à¸§à¹‰` : `à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸²à¸¢à¸à¸²à¸£ #${command.id} à¸«à¸£à¸·à¸­à¸£à¸²à¸¢à¸à¸²à¸£à¸–à¸¹à¸à¸¥à¸šà¹à¸¥à¹‰à¸§`;
  } else if (command.type === "transactionUpdate") {
    if (!db.canManageFinanceTransactions(financeScope!.role)) { message = "à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¢à¸±à¸‡à¹à¸à¹‰à¹„à¸‚à¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸™à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const updated = await db.updateTransaction({ id: command.id, lineUserId, financeAccountId: financeScope!.financeAccountId, amount: command.amount });
    message = updated ? `à¹à¸à¹‰à¹„à¸‚à¸¢à¸­à¸”à¸‚à¸­à¸‡à¸£à¸²à¸¢à¸à¸²à¸£ #${command.id} à¹€à¸›à¹‡à¸™ ${command.amount.toLocaleString("th-TH")} à¸šà¸²à¸—à¹à¸¥à¹‰à¸§` : `à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸²à¸¢à¸à¸²à¸£ #${command.id} à¸«à¸£à¸·à¸­à¸£à¸²à¸¢à¸à¸²à¸£à¸–à¸¹à¸à¸¥à¸šà¹à¸¥à¹‰à¸§`;
  } else if (command.type === "openingBalance") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¢à¸±à¸‡à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸²à¸¢à¸­à¸”à¹€à¸£à¸´à¹ˆà¸¡à¸•à¹‰à¸™à¹ƒà¸™à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    await db.upsertOpeningBalance(lineUserId, command.amount, new Date(), financeScope!.financeAccountId);
    await db.writeAuditLog({ action: "finance_opening_balance.set", entityType: "finance_opening_balance", actorLineUserId: lineUserId, lineChatId, details: { amount: command.amount } });
    message = `à¸•à¸±à¹‰à¸‡à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™à¹€à¸£à¸´à¹ˆà¸¡à¸•à¹‰à¸™ ${command.amount.toLocaleString("th-TH")} à¸šà¸²à¸—à¹à¸¥à¹‰à¸§ à¸¢à¸­à¸”à¸™à¸µà¹‰à¸ˆà¸°à¹à¸ªà¸”à¸‡à¹à¸¢à¸à¸ˆà¸²à¸à¸£à¸²à¸¢à¸£à¸±à¸šà¹à¸¥à¸°à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢`;
  } else if (command.type === "financeReport") {
    const report = await db.financeReport(lineUserId, command.period, new Date(), financeScope!.financeAccountId);
    if (event.replyToken) { await sendFinanceReportCard(event.replyToken, lineChatId, report); return; }
    message = formatFinanceReport(report);
  } else if (command.type === "aiSummary") {
    const report = await db.financeReport(lineUserId, command.period, new Date(), financeScope!.financeAccountId);
    message = formatFinancialInsight(await generateFinancialInsight(report));
  } else if (command.type === "voiceConfirm") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) { message = "à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¹ƒà¸™à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸™à¸µà¹‰à¹€à¸›à¹‡à¸™à¸œà¸¹à¹‰à¸”à¸¹ à¸ˆà¸¶à¸‡à¸¢à¸±à¸‡à¸¢à¸·à¸™à¸¢à¸±à¸™à¸£à¸²à¸¢à¸à¸²à¸£à¹„à¸¡à¹ˆà¹„à¸”à¹‰"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const voice = await db.latestProposedVoiceTranscription(lineUserId, lineChatId);
    if (!voice) {
      message = "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸—à¸µà¹ˆà¸£à¸­à¸¢à¸·à¸™à¸¢à¸±à¸™ à¸¥à¸­à¸‡à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸—à¸µà¹ˆà¸£à¸°à¸šà¸¸à¸£à¸²à¸¢à¸£à¸±à¸šà¸«à¸£à¸·à¸­à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢à¸à¹ˆà¸­à¸™à¸„à¸£à¸±à¸š";
    } else {
      const proposed = proposalFromStoredTranscript(voice.transcript, voice.proposalJson);
      if (proposed.transactionType && proposed.amount && proposed.category) {
        const transactionId = await db.createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope!.financeAccountId, transactionType: proposed.transactionType, amount: proposed.amount, category: proposed.category, note: proposed.note, source: "line_audio" });
        await db.linkTransactionAttachment({ transactionId, vaultItemId: voice.vaultItemId, lineUserId, label: "à¹„à¸Ÿà¸¥à¹Œà¹€à¸ªà¸µà¸¢à¸‡à¸•à¹‰à¸™à¸‰à¸šà¸±à¸š" });
        await db.updateVoiceTranscriptionStatus(voice.id, "accepted");
        if (event.replyToken) { await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope!.financeAccountId, proposed); return; }
        message = `à¸šà¸±à¸™à¸—à¸¶à¸${proposed.transactionType === "expense" ? "à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢" : "à¸£à¸²à¸¢à¸£à¸±à¸š"}à¸ˆà¸²à¸à¹€à¸ªà¸µà¸¢à¸‡ ${proposed.amount.toLocaleString("th-TH")} à¸šà¸²à¸— à¹ƒà¸™à¸«à¸¡à¸§à¸”${proposed.category}à¹à¸¥à¹‰à¸§`;
      } else {
        message = `à¸–à¸­à¸”à¹€à¸ªà¸µà¸¢à¸‡à¹„à¸”à¹‰à¸§à¹ˆà¸² â€œ${voice.transcript}â€ à¹à¸•à¹ˆà¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸¹à¸›à¹à¸šà¸šà¸£à¸²à¸¢à¸£à¸±à¸š/à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢ à¹€à¸Šà¹ˆà¸™ â€œà¸ˆà¹ˆà¸²à¸¢à¸à¸²à¹à¸Ÿ 65 à¸šà¸²à¸—â€ à¸ˆà¸¶à¸‡à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸šà¸±à¸™à¸—à¸¶à¸à¸„à¸£à¸±à¸š`;
      }
    }
  } else if (command.type === "voiceEditPrompt") {
    const voice = await db.latestProposedVoiceTranscription(lineUserId, lineChatId);
    if (voice && event.replyToken) { await replyVoiceCategoryChoices(event.replyToken); return; }
    message = voice ? "à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸—à¸µà¹ˆà¹à¸à¹‰à¹„à¸‚à¹ƒà¸«à¸¡à¹ˆà¹„à¸”à¹‰à¹€à¸¥à¸¢ à¹€à¸Šà¹ˆà¸™ â€œà¹à¸à¹‰à¹„à¸‚à¹€à¸ªà¸µà¸¢à¸‡ à¸ˆà¹ˆà¸²à¸¢à¸à¸²à¹à¸Ÿ 65 à¸šà¸²à¸—â€ à¹à¸¥à¹‰à¸§à¹„à¸¡à¹‚à¸¥à¸ˆà¸°à¹€à¸ªà¸™à¸­à¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸«à¹‰à¸•à¸£à¸§à¸ˆà¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡" : "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸—à¸µà¹ˆà¸£à¸­à¹à¸à¹‰à¹„à¸‚ à¸¥à¸­à¸‡à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸à¹ˆà¸­à¸™à¸„à¸£à¸±à¸š";
  } else if (command.type === "voiceCategoryChange") {
    const voice = await db.latestProposedVoiceTranscription(lineUserId, lineChatId);
    const allowed = new Set([...STANDARD_EXPENSE_CATEGORIES, ...(await db.listExpenseCategories(lineUserId, "expense", financeScope!.financeAccountId)).map(item => item.name)]);
    if (!voice) message = "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸—à¸µà¹ˆà¸£à¸­à¹à¸à¹‰à¹„à¸‚ à¸¥à¸­à¸‡à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸à¹ˆà¸­à¸™à¸„à¸£à¸±à¸š";
    else if (!allowed.has(command.category)) message = "à¹€à¸¥à¸·à¸­à¸à¸«à¸¡à¸§à¸”à¸—à¸µà¹ˆà¹à¸™à¸°à¸™à¸³à¹„à¸”à¹‰ à¸«à¸£à¸·à¸­à¸žà¸´à¸¡à¸žà¹Œà¹à¸à¹‰à¹„à¸‚à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹ƒà¸«à¸¡à¹ˆà¹€à¸žà¸·à¹ˆà¸­à¸£à¸°à¸šà¸¸à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¸„à¸£à¸±à¸š";
    else {
      const proposal = proposalFromStoredTranscript(voice.transcript, voice.proposalJson);
      proposal.category = command.category;
      const updated = await db.updateVoiceTranscript({ id: voice.id, lineUserId, transcript: voice.transcript, proposalJson: JSON.stringify(proposal) });
      if (!updated) message = "à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸™à¸µà¹‰à¹„à¸¡à¹ˆà¸­à¸¢à¸¹à¹ˆà¹ƒà¸™à¸ªà¸–à¸²à¸™à¸°à¸—à¸µà¹ˆà¹à¸à¹‰à¹„à¸‚à¹„à¸”à¹‰à¹à¸¥à¹‰à¸§ à¸¥à¸­à¸‡à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¹ƒà¸«à¸¡à¹ˆà¸„à¸£à¸±à¸š";
      else if (event.replyToken) { await sendVoiceProposal(event.replyToken, proposal); return; }
      else message = `à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸«à¸¡à¸§à¸”à¸‚à¹‰à¸­à¹€à¸ªà¸™à¸­à¹€à¸›à¹‡à¸™ ${command.category} à¹à¸¥à¹‰à¸§`;
    }
  } else if (command.type === "voiceEdit") {
    const voice = await db.latestProposedVoiceTranscription(lineUserId, lineChatId);
    if (!voice) message = "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸—à¸µà¹ˆà¸£à¸­à¹à¸à¹‰à¹„à¸‚ à¸¥à¸­à¸‡à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸à¹ˆà¸­à¸™à¸„à¸£à¸±à¸š";
    else {
      const proposal = await buildVoiceProposal(command.transcript, lineUserId, financeScope!.financeAccountId);
      const updated = await db.updateVoiceTranscript({ id: voice.id, lineUserId, transcript: command.transcript, proposalJson: JSON.stringify(proposal) });
      if (!updated) message = "à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸™à¸µà¹‰à¹„à¸¡à¹ˆà¸­à¸¢à¸¹à¹ˆà¹ƒà¸™à¸ªà¸–à¸²à¸™à¸°à¸—à¸µà¹ˆà¹à¸à¹‰à¹„à¸‚à¹„à¸”à¹‰à¹à¸¥à¹‰à¸§ à¸¥à¸­à¸‡à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¹ƒà¸«à¸¡à¹ˆà¸„à¸£à¸±à¸š";
      else if (event.replyToken) { await sendVoiceProposal(event.replyToken, proposal); return; }
      else message = "à¹à¸à¹‰à¹„à¸‚à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¹à¸¥à¹‰à¸§";
    }
  } else if (command.type === "note") {
    await db.createNote(lineChatId, lineUserId, command.title, command.content);
    message = "à¹€à¸à¹‡à¸šà¹‚à¸™à¹‰à¸•à¹„à¸§à¹‰à¹ƒà¸«à¹‰à¹à¸¥à¹‰à¸§ à¸„à¹‰à¸™à¸«à¸²à¹„à¸”à¹‰à¸—à¸¸à¸à¹€à¸¡à¸·à¹ˆà¸­";
  } else if (command.type === "todo") {
    await db.createTodo(lineChatId, lineUserId, command.title);
    message = `à¹€à¸žà¸´à¹ˆà¸¡à¸‡à¸²à¸™ â€œ${command.title}â€ à¹à¸¥à¹‰à¸§`;
  } else if (command.type === "vault") {
    await db.createVaultItem({ lineChatId, createdByLineUserId: lineUserId, itemType: command.itemType, title: command.title, searchableText: command.content, tagsText: command.tagsText, sourceUrl: command.sourceUrl, lineMessageId: event.message?.id });
    message = `à¹€à¸à¹‡à¸š${command.itemType === "link" ? "à¸¥à¸´à¸‡à¸à¹Œ" : "à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡"}à¸™à¸µà¹‰à¹„à¸§à¹‰à¹ƒà¸™à¸„à¸¥à¸±à¸‡à¹à¸¥à¹‰à¸§${command.tagsText ? ` à¸žà¸£à¹‰à¸­à¸¡à¹à¸—à¹‡à¸ ${command.tagsText}` : ""}`;
  } else if (command.type === "search") {
    const results = await db.searchVault(lineUserId, command.query);
    message = results.length ? `à¸žà¸š ${results.length} à¸£à¸²à¸¢à¸à¸²à¸£\n${results.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}`).join("\n")}` : `à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸²à¸¢à¸à¸²à¸£ â€œ${command.query}â€`;
  } else if (command.type === "mention") {
    const member = await db.findLineMemberByName(lineChatId, command.memberName);
    if (member && event.replyToken) {
      await replyMention(event.replyToken, command.message, member.lineUserId);
      return;
    }
    message = `à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸šà¸ªà¸¡à¸²à¸Šà¸´à¸à¸Šà¸·à¹ˆà¸­ â€œ${command.memberName}â€ à¹ƒà¸™à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸‚à¸­à¸‡à¸à¸¥à¸¸à¹ˆà¸¡ à¸¥à¸­à¸‡à¹ƒà¸«à¹‰à¸ªà¸¡à¸²à¸Šà¸´à¸à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸«à¸²à¹„à¸¡à¹‚à¸¥à¸à¹ˆà¸­à¸™à¸„à¸£à¸±à¸š`;
  } else if (command.type === "budget") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¢à¸±à¸‡à¸•à¸±à¹‰à¸‡à¸‡à¸šà¸›à¸£à¸°à¸¡à¸²à¸“à¹ƒà¸™à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await db.upsertBudget(lineUserId, command.category, command.amount, monthKey, financeScope!.financeAccountId);
    message = `à¸•à¸±à¹‰à¸‡à¸‡à¸šà¸«à¸¡à¸§à¸”${command.category} ${command.amount.toLocaleString("th-TH")} à¸šà¸²à¸— à¸ªà¸³à¸«à¸£à¸±à¸šà¹€à¸”à¸·à¸­à¸™à¸™à¸µà¹‰à¹à¸¥à¹‰à¸§`;
  } else if (command.type === "categoryAdd") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¢à¸±à¸‡à¸ˆà¸±à¸”à¸à¸²à¸£à¸«à¸¡à¸§à¸”à¹ƒà¸™à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    await db.addExpenseCategory(lineUserId, command.name, command.transactionType, financeScope!.financeAccountId);
    message = `à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸¡à¸§à¸”${command.transactionType === "income" ? "à¸£à¸²à¸¢à¸£à¸±à¸š" : "à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢"} â€œ${command.name}â€ à¹à¸¥à¹‰à¸§`;
  } else if (command.type === "categoryRemove") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¢à¸±à¸‡à¸ˆà¸±à¸”à¸à¸²à¸£à¸«à¸¡à¸§à¸”à¹ƒà¸™à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const removed = await db.removeExpenseCategory(lineUserId, command.name, command.transactionType, financeScope!.financeAccountId);
    message = removed ? `à¸¥à¸šà¸«à¸¡à¸§à¸”${command.transactionType === "income" ? "à¸£à¸²à¸¢à¸£à¸±à¸š" : "à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢"} â€œ${command.name}â€ à¹à¸¥à¹‰à¸§` : `à¹„à¸¡à¹ˆà¸žà¸šà¸«à¸¡à¸§à¸” â€œ${command.name}â€ à¸—à¸µà¹ˆà¸ˆà¸°à¸¥à¸š`;
  } else if (command.type === "categoryList") {
    const categories = await db.listTransactionCategories(lineUserId, financeScope!.financeAccountId);
    const customExpense = categories.filter(item => item.transactionType === "expense" && !STANDARD_EXPENSE_CATEGORIES.includes(item.name as typeof STANDARD_EXPENSE_CATEGORIES[number]));
    const customIncome = categories.filter(item => item.transactionType === "income" && !STANDARD_INCOME_CATEGORIES.includes(item.name as typeof STANDARD_INCOME_CATEGORIES[number]));
    const expenseSection = `à¸«à¸¡à¸§à¸”à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢à¸¡à¸²à¸•à¸£à¸à¸²à¸™\n${STANDARD_EXPENSE_CATEGORIES.map(name => `â€¢ ${name}`).join("\n")}${customExpense.length ? `\nà¸«à¸¡à¸§à¸”à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢à¸—à¸µà¹ˆà¸„à¸¸à¸“à¹€à¸žà¸´à¹ˆà¸¡\n${customExpense.map(item => `â€¢ ${item.name}`).join("\n")}` : ""}`;
    const incomeSection = `à¸«à¸¡à¸§à¸”à¸£à¸²à¸¢à¸£à¸±à¸šà¸¡à¸²à¸•à¸£à¸à¸²à¸™\n${STANDARD_INCOME_CATEGORIES.map(name => `â€¢ ${name}`).join("\n")}${customIncome.length ? `\nà¸«à¸¡à¸§à¸”à¸£à¸²à¸¢à¸£à¸±à¸šà¸—à¸µà¹ˆà¸„à¸¸à¸“à¹€à¸žà¸´à¹ˆà¸¡\n${customIncome.map(item => `â€¢ ${item.name}`).join("\n")}` : ""}`;
    message = command.transactionType === "income" ? incomeSection : command.transactionType === "expense" ? expenseSection : `${expenseSection}\n\n${incomeSection}\n\nà¹€à¸žà¸´à¹ˆà¸¡à¸«à¸¡à¸§à¸”à¹„à¸”à¹‰à¸”à¹‰à¸§à¸¢ â€œà¹€à¸žà¸´à¹ˆà¸¡à¸«à¸¡à¸§à¸”à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢ à¸Šà¸·à¹ˆà¸­à¸«à¸¡à¸§à¸”â€ à¸«à¸£à¸·à¸­ â€œà¹€à¸žà¸´à¹ˆà¸¡à¸«à¸¡à¸§à¸”à¸£à¸²à¸¢à¸£à¸±à¸š à¸Šà¸·à¹ˆà¸­à¸«à¸¡à¸§à¸”â€`;
  } else if (command.type === "invalid") {
    message = command.message;
  } else if (command.type === "imageConfirm") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) { message = "à¸ªà¸´à¸—à¸˜à¸´à¹Œà¸‚à¸­à¸‡à¸„à¸¸à¸“à¹ƒà¸™à¸ªà¸¡à¸¸à¸”à¸šà¸±à¸à¸Šà¸µà¸™à¸µà¹‰à¹€à¸›à¹‡à¸™à¸œà¸¹à¹‰à¸”à¸¹ à¸ˆà¸¶à¸‡à¸¢à¸±à¸‡à¸¢à¸·à¸™à¸¢à¸±à¸™à¸£à¸²à¸¢à¸à¸²à¸£à¹„à¸¡à¹ˆà¹„à¸”à¹‰"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const latest = await db.latestImageExtraction(lineUserId, lineChatId);
    if (!latest || latest.extraction.status !== "proposed") {
      message = "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸œà¸¥à¸§à¸´à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¸£à¸¹à¸›à¸—à¸µà¹ˆà¸£à¸­à¸¢à¸·à¸™à¸¢à¸±à¸™ à¸¥à¸­à¸‡à¸ªà¹ˆà¸‡à¸£à¸¹à¸›à¹ƒà¸šà¸™à¸±à¸”à¸«à¸£à¸·à¸­à¹ƒà¸šà¹€à¸ªà¸£à¹‡à¸ˆà¸à¹ˆà¸­à¸™à¸„à¸£à¸±à¸š";
    } else {
      const analysis = JSON.parse(latest.extraction.extractedJson) as { proposals?: Array<Record<string, unknown>> };
      const proposal = selectImageProposal(analysis.proposals as never[]);
      if (!proposal) {
        await db.setImageExtractionStatus(latest.extraction.id, "rejected");
        message = "à¸£à¸¹à¸›à¸™à¸µà¹‰à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸—à¸µà¹ˆà¸šà¸±à¸™à¸—à¸¶à¸à¹„à¸”à¹‰à¸­à¸¢à¹ˆà¸²à¸‡à¸¡à¸±à¹ˆà¸™à¹ƒà¸ˆ à¸ˆà¸¶à¸‡à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸ªà¸£à¹‰à¸²à¸‡à¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸«à¹‰à¸„à¸£à¸±à¸š";
      } else if (proposal.kind === "expense" && Number(proposal.amount ?? 0) > 0) {
        const amount = Number(proposal.amount ?? 0);
        const category = normalizeExpenseCategory(proposal.category, `${proposal.title ?? ""} ${proposal.merchant ?? ""} ${proposal.note ?? ""}`);
        const occurredAt = parseExtractedDate(command.dateText) ?? parseExtractedDate(proposal.dateText);
        if (!occurredAt) {
          message = `à¸­à¹ˆà¸²à¸™à¸¢à¸­à¸” ${amount.toLocaleString("th-TH")} à¸šà¸²à¸—à¹„à¸”à¹‰ à¹à¸•à¹ˆà¸§à¸±à¸™à¸—à¸µà¹ˆà¹ƒà¸™${proposal.documentType === "bank_slip" ? "à¸ªà¸¥à¸´à¸›" : "à¹ƒà¸šà¹€à¸ªà¸£à¹‡à¸ˆ"}à¹„à¸¡à¹ˆà¸Šà¸±à¸” à¸ˆà¸¶à¸‡à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸šà¸±à¸™à¸—à¸¶à¸à¹€à¸žà¸·à¹ˆà¸­à¸›à¹‰à¸­à¸‡à¸à¸±à¸™à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸œà¸´à¸”à¸žà¸¥à¸²à¸”\nà¸à¸£à¸¸à¸“à¸²à¸žà¸´à¸¡à¸žà¹Œ â€œà¸¢à¸·à¸™à¸¢à¸±à¸™à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢ à¸§à¸±à¸™à¸—à¸µà¹ˆ 27/08/2569â€ à¹‚à¸”à¸¢à¹à¸—à¸™à¸§à¸±à¸™à¸—à¸µà¹ˆà¸ˆà¸£à¸´à¸‡`;
        } else {
          const transactionId = await db.createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope!.financeAccountId, transactionType: "expense", amount, category, note: buildExpenseNote(proposal), occurredAt, source: "line_image" });
          await db.linkTransactionAttachment({ transactionId, vaultItemId: latest.vault.id, lineUserId, label: proposal.documentType === "bank_slip" ? "à¸ªà¸¥à¸´à¸›à¸•à¹‰à¸™à¸‰à¸šà¸±à¸š" : "à¹ƒà¸šà¹€à¸ªà¸£à¹‡à¸ˆà¸•à¹‰à¸™à¸‰à¸šà¸±à¸š" });
          await db.setImageExtractionStatus(latest.extraction.id, "accepted");
          if (event.replyToken) { await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope!.financeAccountId, { transactionType: "expense", amount, category }); return; }
          message = `à¸šà¸±à¸™à¸—à¸¶à¸à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢à¸ˆà¸²à¸${proposal.documentType === "bank_slip" ? "à¸ªà¸¥à¸´à¸›" : "à¹ƒà¸šà¹€à¸ªà¸£à¹‡à¸ˆ"} ${amount.toLocaleString("th-TH")} à¸šà¸²à¸— à¹ƒà¸™à¸«à¸¡à¸§à¸”${category}à¹à¸¥à¹‰à¸§`;
        }
      } else {
        const proposed = parseMiloCommand(`à¹€à¸•à¸·à¸­à¸™ ${proposal.title} ${proposal.dateText} ${proposal.timeText}`);
        if (proposed.type === "reminder") {
          const id = await db.createReminder({ lineChatId, createdByLineUserId: lineUserId, ...proposed.data, sourceImageKey: latest.vault.storageKey ?? undefined });
          await db.setImageExtractionStatus(latest.extraction.id, "accepted");
          message = `à¸ªà¸£à¹‰à¸²à¸‡à¸£à¸²à¸¢à¸à¸²à¸£à¹€à¸•à¸·à¸­à¸™à¸ˆà¸²à¸à¸£à¸¹à¸› #${id} à¹à¸¥à¹‰à¸§: ${proposed.data.title}`;
        } else {
          message = "à¸­à¹ˆà¸²à¸™à¸«à¸±à¸§à¸‚à¹‰à¸­à¸ˆà¸²à¸à¸£à¸¹à¸›à¹„à¸”à¹‰ à¹à¸•à¹ˆà¸¢à¸±à¸‡à¸­à¹ˆà¸²à¸™à¸§à¸±à¸™à¹€à¸§à¸¥à¸²à¸—à¸µà¹ˆà¹à¸™à¹ˆà¸Šà¸±à¸”à¹„à¸¡à¹ˆà¹„à¸”à¹‰ à¸¥à¸­à¸‡à¸žà¸´à¸¡à¸žà¹Œà¹€à¸§à¸¥à¸²à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¹€à¸žà¸´à¹ˆà¸¡ à¹à¸¥à¹‰à¸§à¸ªà¹ˆà¸‡à¸¡à¸²à¹ƒà¸«à¸¡à¹ˆà¹„à¸”à¹‰à¸„à¸£à¸±à¸š";
        }
      }
    }
  } else if (command.type === "recordGuide") {
    message = "ðŸ“ à¸ˆà¸”à¸šà¸±à¸™à¸—à¸¶à¸à¹„à¸”à¹‰à¹€à¸¥à¸¢\nà¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡: à¸ˆà¹ˆà¸²à¸¢ 125 à¸„à¹ˆà¸²à¸­à¸²à¸«à¸²à¸£\nà¸«à¸£à¸·à¸­: à¸£à¸±à¸šà¹€à¸‡à¸´à¸™à¹€à¸”à¸·à¸­à¸™ 30000\nà¹à¸¥à¹‰à¸§à¸œà¸¡à¸ˆà¸°à¸Šà¹ˆà¸§à¸¢à¸šà¸±à¸™à¸—à¸¶à¸à¹ƒà¸«à¹‰à¸„à¸£à¸±à¸š";
  } else if (command.type === "budgetOverview") {
    const budgets = await db.listBudgets(lineUserId, undefined, financeScope!.financeAccountId);
    message = budgets.length ? "ðŸ“Š à¸‡à¸šà¸›à¸£à¸°à¸¡à¸²à¸“à¹€à¸”à¸·à¸­à¸™à¸™à¸µà¹‰\n" + budgets.slice(0, 10).map(item => `â€¢ ${item.category} ${Number(item.amount).toLocaleString("th-TH")} à¸šà¸²à¸—`).join("\n") : "ðŸ“Š à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‡à¸šà¸›à¸£à¸°à¸¡à¸²à¸“à¸—à¸µà¹ˆà¸•à¸±à¹‰à¸‡à¹„à¸§à¹‰à¸„à¸£à¸±à¸š\nà¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡: à¸‡à¸šà¸›à¸£à¸°à¸¡à¸²à¸“ à¸„à¹ˆà¸²à¸­à¸²à¸«à¸²à¸£ 5000";
  } else if (command.type === "transactionList") {
    const results = await db.searchTransactions(lineUserId, "", 10, financeScope!.financeAccountId);
    message = results.length ? "ðŸ“‹ à¸£à¸²à¸¢à¸à¸²à¸£à¸¥à¹ˆà¸²à¸ªà¸¸à¸”\n" + results.map(item => `#${item.id} â€¢ ${item.transactionType === "expense" ? "à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢" : "à¸£à¸²à¸¢à¸£à¸±à¸š"} ${Number(item.amount).toLocaleString("th-TH")} à¸šà¸²à¸— â€¢ ${item.category}`).join("\n") : "ðŸ“‹ à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸²à¸¢à¸à¸²à¸£à¸˜à¸¸à¸£à¸à¸£à¸£à¸¡à¸„à¸£à¸±à¸š";
  } else if (command.type === "greeting") {
    message = "à¸ªà¸§à¸±à¸ªà¸”à¸µà¸„à¸£à¸±à¸š ðŸ‘‹ à¸œà¸¡à¹„à¸¡à¹‚à¸¥ à¸œà¸¹à¹‰à¸Šà¹ˆà¸§à¸¢à¸à¸²à¸£à¹€à¸‡à¸´à¸™à¸‚à¸­à¸‡à¸„à¸¸à¸“\nà¸à¸”à¹€à¸¡à¸™à¸¹à¸”à¹‰à¸²à¸™à¸¥à¹ˆà¸²à¸‡à¸«à¸£à¸·à¸­à¸žà¸´à¸¡à¸žà¹Œ â€œà¸Šà¹ˆà¸§à¸¢â€ à¹€à¸žà¸·à¹ˆà¸­à¸”à¸¹à¸„à¸³à¸ªà¸±à¹ˆà¸‡à¸—à¸µà¹ˆà¹ƒà¸Šà¹‰à¸‡à¸²à¸™à¹„à¸”à¹‰à¸„à¸£à¸±à¸š";
  } else if (command.type === "help") {
    message = helpText();
  } else {
    message = "à¸œà¸¡à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹€à¸‚à¹‰à¸²à¹ƒà¸ˆ à¸¥à¸­à¸‡à¸žà¸´à¸¡à¸žà¹Œ â€œà¸Šà¹ˆà¸§à¸¢â€ à¹€à¸žà¸·à¹ˆà¸­à¸”à¸¹à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¸„à¸³à¸ªà¸±à¹ˆà¸‡à¹„à¸”à¹‰à¸„à¸£à¸±à¸š";
  }
  if (event.replyToken) await replyText(event.replyToken, message);
}

async function handleMedia(event: LineEvent, lineChatId: string, lineUserId: string, scope: LineFinanceScope) {
  const message = event.message;
  if (!message) return;
  const isImage = message.type === "image";
  const isAudio = message.type === "audio";
  const bytes = await getMessageContent(message.id);
  const mimeType = isImage ? "image/jpeg" : isAudio ? "audio/m4a" : "application/octet-stream";
  const stored = await storagePut(`milo/${lineChatId}/${message.id}`, bytes, mimeType);
  const vaultId = await db.createVaultItem({
    lineChatId, createdByLineUserId: lineUserId, itemType: isImage ? "image" : "file", title: message.fileName ?? (isImage ? "à¸£à¸¹à¸›à¸ˆà¸²à¸ LINE" : isAudio ? "à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¸ˆà¸²à¸ LINE" : "à¹„à¸Ÿà¸¥à¹Œà¸ˆà¸²à¸ LINE"),
    searchableText: message.fileName, originalFilename: message.fileName, mimeType, storageKey: stored.key, storageUrl: stored.url, lineMessageId: message.id,
  });
  if (isAudio) {
    try {
      const audioUrl = await storageGetSignedUrl(stored.key);
      const transcript = await transcribeAudio({ audioUrl, language: "th", prompt: "à¸–à¸­à¸”à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸ à¸²à¸©à¸²à¹„à¸—à¸¢à¹€à¸à¸µà¹ˆà¸¢à¸§à¸à¸±à¸šà¸£à¸²à¸¢à¸£à¸±à¸š à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢ à¸ˆà¸³à¸™à¸§à¸™à¹€à¸‡à¸´à¸™ à¹à¸¥à¸°à¸«à¸¡à¸§à¸”à¸«à¸¡à¸¹à¹ˆ" });
      if ("error" in transcript) throw new Error(transcript.error);
      const financeScope = await resolveFinanceScope(lineUserId, lineChatId, scope);
      const proposal = await buildVoiceProposal(transcript.text, lineUserId, financeScope?.financeAccountId);
      await db.saveVoiceTranscription({ vaultItemId: vaultId, lineChatId, lineUserId, transcript: transcript.text, language: transcript.language, durationSeconds: transcript.duration, proposalJson: JSON.stringify(proposal) });
      if (event.replyToken) await sendVoiceProposal(event.replyToken, proposal);
    } catch (error) {
      console.error("[Milo Voice] transcription failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
      if (event.replyToken) await replyText(event.replyToken, "à¹€à¸à¹‡à¸šà¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸‡à¹„à¸§à¹‰à¹à¸¥à¹‰à¸§ à¹à¸•à¹ˆà¸¢à¸±à¸‡à¸–à¸­à¸”à¹€à¸ªà¸µà¸¢à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¹ƒà¸™à¸„à¸£à¸±à¹‰à¸‡à¸™à¸µà¹‰ à¸à¸£à¸¸à¸“à¸²à¸¥à¸­à¸‡à¸­à¸±à¸”à¹ƒà¸«à¸¡à¹ˆà¹ƒà¸«à¹‰à¸Šà¸±à¸”à¹€à¸ˆà¸™ à¸„à¸§à¸²à¸¡à¸¢à¸²à¸§à¸ªà¸±à¹‰à¸™ à¹† à¹à¸¥à¸°à¸‚à¸™à¸²à¸”à¹„à¸¡à¹ˆà¹€à¸à¸´à¸™ 16MB à¸„à¸£à¸±à¸š");
    }
    return;
  }
  if (!isImage) {
    if (event.replyToken) await replyText(event.replyToken, "à¹€à¸à¹‡à¸šà¹„à¸Ÿà¸¥à¹Œà¸™à¸µà¹‰à¹„à¸§à¹‰à¹ƒà¸™à¸„à¸¥à¸±à¸‡à¸–à¸²à¸§à¸£à¹à¸¥à¹‰à¸§");
    return;
  }
  try {
    const analysis = await analyzeImage(`data:${mimeType};base64,${bytes.toString("base64")}`);
    await db.saveImageExtraction(vaultId, analysis.proposals.some(item => item.kind === "expense") ? "expense" : "reminder", JSON.stringify(analysis), analysis.confidence);
    const proposals = analysis.proposals.slice(0, 2).map(item => `â€¢ ${formatImageProposal(item)}`).join("\n");
    if (event.replyToken) await replyText(event.replyToken, `à¹€à¸à¹‡à¸šà¸£à¸¹à¸›à¹„à¸§à¹‰à¹à¸¥à¹‰à¸§\n${analysis.summary}\n${proposals || "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸²à¸¢à¸à¸²à¸£à¸—à¸µà¹ˆà¸„à¸§à¸£à¸šà¸±à¸™à¸—à¸¶à¸à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´"}\nà¸•à¸£à¸§à¸ˆà¸¢à¸­à¸”à¹à¸¥à¸°à¸«à¸¡à¸§à¸”à¹ƒà¸«à¹‰à¸–à¸¹à¸à¸•à¹‰à¸­à¸‡à¸à¹ˆà¸­à¸™ à¹à¸¥à¹‰à¸§à¸žà¸´à¸¡à¸žà¹Œ â€œà¸¢à¸·à¸™à¸¢à¸±à¸™à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢â€ à¹€à¸žà¸·à¹ˆà¸­à¸šà¸±à¸™à¸—à¸¶à¸ à¸«à¸£à¸·à¸­ â€œà¸¢à¸·à¸™à¸¢à¸±à¸™à¸£à¸¹à¸›â€ à¸ªà¸³à¸«à¸£à¸±à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¹€à¸•à¸·à¸­à¸™`);
  } catch {
    if (event.replyToken) await replyText(event.replyToken, "à¹€à¸à¹‡à¸šà¸£à¸¹à¸›à¹„à¸§à¹‰à¹à¸¥à¹‰à¸§ à¹à¸•à¹ˆà¸¢à¸±à¸‡à¸­à¹ˆà¸²à¸™à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¸ˆà¸²à¸à¸£à¸¹à¸›à¹„à¸¡à¹ˆà¹„à¸”à¹‰ à¸¥à¸­à¸‡à¸ªà¹ˆà¸‡à¸ à¸²à¸žà¸—à¸µà¹ˆà¸„à¸¡à¸Šà¸±à¸”à¸‚à¸¶à¹‰à¸™à¹„à¸”à¹‰à¸„à¸£à¸±à¸š");
  }
}

export async function processEvent(event: LineEvent, rawPayload: string) {
  const identity = sourceIdentity(event.source);
  if (!identity.lineUserId) return;
  // Keep basic menu/navigation commands responsive even when persistence is degraded.
  // These commands do not need a database round-trip and are the primary recovery path
  // for Rich Menu taps such as "เมนูไมโล", "สวัสดีไมโล", and "จดบันทึก".
  if (event.type === "message" && event.message?.type === "text" && event.replyToken) {
    const quickCommand = parseMiloCommand(event.message.text ?? "");
    if (["help", "greeting", "recordGuide", "settingGuide"].includes(quickCommand.type)) {
      const quickMessage = quickCommand.type === "help"
        ? helpText()
        : quickCommand.type === "greeting"
          ? "สวัสดีครับ 👋 ผมไมโล พร้อมช่วยบันทึกและดูภาพรวมการเงินให้ครับ"
          : quickCommand.type === "recordGuide"
            ? "เริ่มจดบันทึกได้เลยครับ เช่น: รายจ่าย 125 ค่าอาหาร หรือ รายรับ 30000 เงินเดือน"
            : "เปิดแดชบอร์ดหลังบ้านได้ที่ https://milo-line-app.vercel.app/dashboard";
      try {
        await replyText(event.replyToken, quickMessage);
        return;
      } catch (error) {
        console.error("[Milo Webhook] quick reply failed", {
          webhookEventId: event.webhookEventId,
          error: error instanceof Error ? error.message : "unknown",
        });
        throw error;
      }
    }
  }
  const accepted = await db.registerWebhookEvent({ webhookEventId: event.webhookEventId, eventType: event.type, lineChatId: identity.lineChatId, occurredAt: new Date(event.timestamp), rawPayload });
  if (!accepted) return;
  try {
    const profile = await getProfile(event.source).catch(() => undefined);
    await db.upsertLineChat(identity.lineChatId, identity.scope, profile?.displayName);
    await db.upsertLineMember(identity.lineChatId, identity.lineUserId, profile?.displayName);
    if (event.type !== "message" || !event.message) { await db.finishWebhookEvent(event.webhookEventId, "ignored"); return; }
    const isGroup = identity.scope !== "user";
    const isMention = event.message.mention?.mentionees?.some(item => item.isSelf) || event.message.text?.trim().startsWith("@à¹„à¸¡à¹‚à¸¥");
    if (isGroup && event.message.type === "text" && !isMention) { await db.finishWebhookEvent(event.webhookEventId, "ignored"); return; }
    if (event.message.type === "text") await handleText(event, identity.lineChatId, identity.lineUserId, identity.scope);
    else if (event.message.type === "image" || event.message.type === "file" || event.message.type === "audio") await handleMedia(event, identity.lineChatId, identity.lineUserId, identity.scope);
    await db.finishWebhookEvent(event.webhookEventId, "processed");
  } catch (error) {
    await db.finishWebhookEvent(event.webhookEventId, "failed", error instanceof Error ? error.message : "unknown error");
    throw error;
  }
}

export function registerLineWebhook(app: Express) {
  app.post("/api/line/webhook", express.raw({ type: "*/*", limit: "50mb" }), async (req: Request, res: Response) => {
    const raw = req.body as Buffer;
    const credentials = lineCredentials();
    if (!verifyLineSignature(raw, req.header("x-line-signature"), credentials.channelSecret)) return res.status(401).json({ error: "invalid signature" });
    let payload: { events?: LineEvent[] };
    try { payload = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "invalid json" }); }
    try {
      await Promise.all((payload.events ?? []).map(event => processEvent(event, raw.toString("utf8"))));
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "event processing failed" });
    }
  });
}

export function registerMiloCron(app: Express) {
  app.all("/api/scheduled/reminders", async (req: Request, res: Response) => {
    try {
      const isVercelCron = req.method === "GET" && req.headers["user-agent"] === "vercel-cron/1.0";
      let taskUid: string;
      if (isVercelCron) {
        const secret = process.env.CRON_SECRET?.trim();
        const authorization = req.headers.authorization;
        const headerSecret = req.headers["x-cron-secret"];
        const bearerValid = authorization === `Bearer ${secret}`;
        const headerValid = headerSecret === secret;
        if (!secret || (!bearerValid && !headerValid)) return res.status(401).json({ error: "cron-unauthorized" });
        const schedule = await db.getAutomationSetting("reminder-delivery-primary");
        if (!schedule?.isEnabled) return res.json({ ok: true, skipped: "disabled" });
        taskUid = schedule.scheduleCronTaskUid ?? "vercel-cron-reminders";
      } else if (req.method === "POST") {
        const user = await sdk.authenticateRequest(req);
        if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
        const schedule = await db.getAutomationSettingByTaskUid(user.taskUid);
        if (!schedule) return res.json({ ok: true, skipped: "orphan" });
        taskUid = user.taskUid;
      } else {
        return res.status(405).json({ error: "method-not-allowed" });
      }
      const result = await deliverDueReminders({ runner: "heartbeat", taskUid });
      const recurring = await deliverDueRecurringTransactions();
      await db.saveAutomationSetting({ settingKey: "reminder-delivery-primary", scheduleCronTaskUid: taskUid, isEnabled: true, lastRunAt: new Date() });
      return res.json({ ok: true, ...result, recurring });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "unknown", timestamp: new Date().toISOString() });
    }
  });
  const registerFinanceDigestRoute = (path: string, settingKey: string, digestType: FinanceDigestType) => {
    app.post(path, async (req: Request, res: Response) => {
      try {
        const user = await sdk.authenticateRequest(req);
        if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
        const schedule = await db.getAutomationSettingByTaskUid(user.taskUid);
        if (!schedule || schedule.settingKey !== settingKey || !schedule.isEnabled) return res.json({ ok: true, skipped: "orphan-or-disabled" });
        const result = await deliverFinanceDigest({ settingKey, taskUid: user.taskUid, digestType });
        return res.json({ ok: true, ...result });
      } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : "unknown", taskUid: undefined, timestamp: new Date().toISOString() });
      }
    });
  };
  registerFinanceDigestRoute("/api/scheduled/finance-daily", "finance-digest-daily", "daily");
  registerFinanceDigestRoute("/api/scheduled/finance-weekly", "finance-digest-weekly", "weekly");
}
