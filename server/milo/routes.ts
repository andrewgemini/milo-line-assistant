import { artworkForCommand } from "./richMenuArtwork";
import { replyRichMenu } from "./line";
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
  return "สวัสดีครับ ผมไมโล ช่วยได้ในแชทเดียว\n• เตือน ประชุมพรุ่งนี้ 10:00\n• เตือนดื่มน้ำทุก 30 นาที\n• จ่ายกาแฟ 65 / จ่ายค่าไฟ 1200\n• รับเงินเดือน 45000 / รับค่าจ้าง 5000\n• ส่งสลิปหรือใบเสร็จ แล้วพิมพ์ “ยืนยันค่าใช้จ่าย”\n• ส่งข้อความเสียง แล้วพิมพ์ “ยืนยันเสียง”\n• ค้นหารายการ กาแฟ / แก้รายการ 12 เป็น 180 / ลบรายการ 12\n• สรุปวันนี้ / สรุปสัปดาห์นี้ / สรุปเดือนนี้ / สรุปปีนี้\n• เพิ่มหมวด เดินทาง / ดูหมวด\n• โน้ต รหัส Wi‑Fi ห้องประชุม\n• งาน ส่งสรุปรายสัปดาห์\n• เก็บ ลิงก์หรือข้อความสำคัญ\n• ค้นหา ใบเสร็จ\n\nเชื่อม dashboard: พิมพ์ “ไอดี” ในแชทส่วนตัวกับไมโล";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function formatFinanceReport(report: Awaited<ReturnType<typeof db.financeReport>>) {
  const money = (amount: number) => amount.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const label: Record<typeof report.period, string> = { day: "วันนี้", week: "สัปดาห์นี้", month: "เดือนนี้", year: "ปีนี้" };
  const categories = Object.entries(report.categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => `• ${name} ${money(amount)} บาท`).join("\n");
  return `สรุปการเงิน${label[report.period]}\nรายรับ ${money(report.income)} บาท\nรายจ่าย ${money(report.expense)} บาท\nกำไร/คงเหลือ ${money(report.balance)} บาท\n${categories ? `\nรายจ่ายตามหมวด\n${categories}` : "\nยังไม่มีรายจ่ายในช่วงนี้"}`;
}

function formatFinancialInsight(insight: Awaited<ReturnType<typeof generateFinancialInsight>>) {
  const quality = insight.dataSufficiency === "adequate" ? "ข้อมูลเพียงพอสำหรับวิเคราะห์เบื้องต้น" : insight.dataSufficiency === "limited" ? "ข้อมูลยังมีไม่มาก จึงเป็นข้อสังเกตเบื้องต้น" : "ยังไม่มีข้อมูลเพียงพอสำหรับวิเคราะห์";
  const highlights = insight.highlights.map(item => `• ${item}`).join("\n");
  const actions = insight.suggestedActions.map(item => `• ${item}`).join("\n");
  return `AI สรุปธุรกิจ\n${quality}\n${insight.summary}${highlights ? `\n\nข้อสังเกต\n${highlights}` : ""}${actions ? `\n\nแนวทางจัดการ\n${actions}` : ""}`;
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

function monthKeyForBangkok(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(date).slice(0, 7);
}
async function sendPostSaveSummary(replyToken: string, lineUserId: string, lineChatId: string, financeAccountId: number, transaction: Pick<VoiceTransactionProposal, "transactionType" | "amount" | "category" | "note"> & { occurredAt?: Date }) {
  const occurredAt = transaction.occurredAt ?? new Date();
  const dailyReport = await db.financeReport(lineUserId, "day", occurredAt, financeAccountId);
  const monthlyReport = await db.financeReport(lineUserId, "month", occurredAt, financeAccountId);
  const budgets = await db.listBudgets(lineUserId, monthKeyForBangkok(occurredAt), financeAccountId);
  const budget = budgets.find(item => item.category === transaction.category);
  const budgetLimit = budget ? Number(budget.amount) : 0;
  const budgetSpent = Number(monthlyReport.categories[transaction.category!] ?? 0);
  const budgetPercent = budgetLimit > 0 ? Math.round((budgetSpent / budgetLimit) * 100) : undefined;
  const summary = { transactionType: transaction.transactionType!, amount: transaction.amount!, category: transaction.category!, note: transaction.note, occurredAt, dailyIncome: dailyReport.income, dailyExpense: dailyReport.expense, dailyBalance: dailyReport.balance, budgetSpent, budgetLimit, budgetPercent };
  try {
    await replyPostSaveSummaryFallback(replyToken, summary);
  } catch (error) {
    console.error("[Milo Save] image summary failed; sending Flex fallback", { error: error instanceof Error ? error.message : "unknown" });
    try {
      await replyPostSaveSummary(replyToken, summary);
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
    ? "ยังไม่พบบัญชีการเงินส่วนตัว ลองส่งคำสั่งอีกครั้งครับ"
    : "กลุ่มนี้ยังไม่ได้เปิดสมุดบัญชีสำหรับสมาชิกของคุณ จึงไม่บันทึกหรือแสดงการเงินร่วมโดยอัตโนมัติ เพื่อปกป้องข้อมูลส่วนตัว ให้เจ้าของกลุ่มตั้งค่าบัญชีและบทบาทจาก dashboard ก่อนครับ";
}

async function handleText(event: LineEvent, lineChatId: string, lineUserId: string, scope: LineFinanceScope) {
  const text = event.message?.text ?? "";
  if (/^(?:ไอดี|id|user\s*id)$/i.test(text.trim())) {
    if (event.source.type === "user") {
      if (event.replyToken) await replyText(event.replyToken, `LINE User ID ของคุณคือ\n${lineUserId}\n\nคัดลอกรหัสนี้ไปเชื่อมในแดชบอร์ดไมโลได้เลยครับ`);
    } else if (event.replyToken) {
      await replyText(event.replyToken, "เพื่อความเป็นส่วนตัว กรุณาพิมพ์ “ไอดี” ในแชทส่วนตัวกับไมโลครับ");
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
    message = `ตั้งเตือน #${id} เรียบร้อย\n${command.data.title}\nครั้งถัดไป: ${formatDate(command.data.nextRunAt)}`;
  } else if (command.type === "expense" || command.type === "income") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) { message = "สิทธิ์ของคุณในสมุดบัญชีนี้เป็นผู้ดู จึงยังเพิ่มรายการไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    let category = command.category;
    if (command.type === "expense" && category === "ทั่วไป") {
      try {
        const customCategories = (await db.listExpenseCategories(lineUserId, "expense", financeScope!.financeAccountId)).map(item => item.name);
        const suggestion = await suggestExpenseCategory(command.note, Array.from(new Set(["อาหาร", "เดินทาง", "ค่าสาธารณูปโภค", "สุขภาพ", "การศึกษา", "บันเทิง", "ช้อปปิ้ง", "ท่องเที่ยว", "ทั่วไป", ...customCategories])));
        category = suggestion.category;
      } catch { /* keep deterministic fallback category */ }
    }
    const occurredAt = Number.isFinite(event.timestamp) ? new Date(event.timestamp) : new Date();
    await db.createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope!.financeAccountId, transactionType: command.type, amount: command.amount, category, note: command.note, occurredAt, source: "line_text", sourceMessageId: event.message?.id });
    if (event.replyToken) { await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope!.financeAccountId, { transactionType: command.type, amount: command.amount, category, note: command.note, occurredAt }); return; }
    message = `บันทึก${command.type === "expense" ? "รายจ่าย" : "รายรับ"} ${command.amount.toLocaleString("th-TH")} บาท ในหมวด${category}แล้ว`;
  } else if (command.type === "transactionSearch") {
    const results = await db.searchTransactions(lineUserId, command.query, 10, financeScope!.financeAccountId);
    message = results.length ? `พบ ${results.length} รายการ\n${results.map(item => `#${item.id} · ${item.transactionType === "expense" ? "จ่าย" : "รับ"} ${Number(item.amount).toLocaleString("th-TH")} บาท · ${item.category}${item.note ? ` · ${item.note}` : ""}`).join("\n")}` : `ยังไม่พบธุรกรรม “${command.query}”`;
  } else if (command.type === "transactionDelete") {
    if (!db.canManageFinanceTransactions(financeScope!.role)) { message = "สิทธิ์ของคุณยังลบรายการในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const deleted = await db.deleteTransaction({ id: command.id, lineUserId, financeAccountId: financeScope!.financeAccountId });
    message = deleted ? `ลบรายการ #${command.id} แล้ว โดยเก็บประวัติการตรวจสอบไว้` : `ไม่พบรายการ #${command.id} หรือรายการถูกลบแล้ว`;
  } else if (command.type === "transactionUpdate") {
    if (!db.canManageFinanceTransactions(financeScope!.role)) { message = "สิทธิ์ของคุณยังแก้ไขรายการในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const updated = await db.updateTransaction({ id: command.id, lineUserId, financeAccountId: financeScope!.financeAccountId, amount: command.amount });
    message = updated ? `แก้ไขยอดของรายการ #${command.id} เป็น ${command.amount.toLocaleString("th-TH")} บาทแล้ว` : `ไม่พบรายการ #${command.id} หรือรายการถูกลบแล้ว`;
  } else if (command.type === "openingBalance") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "สิทธิ์ของคุณยังตั้งค่ายอดเริ่มต้นในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    await db.upsertOpeningBalance(lineUserId, command.amount, new Date(), financeScope!.financeAccountId);
    await db.writeAuditLog({ action: "finance_opening_balance.set", entityType: "finance_opening_balance", actorLineUserId: lineUserId, lineChatId, details: { amount: command.amount } });
    message = `ตั้งยอดเงินเริ่มต้น ${command.amount.toLocaleString("th-TH")} บาทแล้ว ยอดนี้จะแสดงแยกจากรายรับและรายจ่าย`;
  } else if (command.type === "financeReport") {
    const report = await db.financeReport(lineUserId, command.period, new Date(), financeScope!.financeAccountId);
    if (event.replyToken) { await sendFinanceReportCard(event.replyToken, lineChatId, report); return; }
    message = formatFinanceReport(report);
  } else if (command.type === "aiSummary") {
    const report = await db.financeReport(lineUserId, command.period, new Date(), financeScope!.financeAccountId);
    message = formatFinancialInsight(await generateFinancialInsight(report));
  } else if (command.type === "voiceConfirm") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) { message = "สิทธิ์ของคุณในสมุดบัญชีนี้เป็นผู้ดู จึงยังยืนยันรายการไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const voice = await db.latestProposedVoiceTranscription(lineUserId, lineChatId);
    if (!voice) {
      message = "ยังไม่มีข้อความเสียงที่รอยืนยัน ลองส่งข้อความเสียงที่ระบุรายรับหรือรายจ่ายก่อนครับ";
    } else {
      const proposed = proposalFromStoredTranscript(voice.transcript, voice.proposalJson);
      if (proposed.transactionType && proposed.amount && proposed.category) {
        const occurredAt = new Date();
        const transactionId = await db.createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope!.financeAccountId, transactionType: proposed.transactionType, amount: proposed.amount, category: proposed.category, note: proposed.note, occurredAt, source: "line_audio" });
        await db.linkTransactionAttachment({ transactionId, vaultItemId: voice.vaultItemId, lineUserId, label: "ไฟล์เสียงต้นฉบับ" });
        await db.updateVoiceTranscriptionStatus(voice.id, "accepted");
        if (event.replyToken) { await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope!.financeAccountId, { ...proposed, occurredAt }); return; }
        message = `บันทึก${proposed.transactionType === "expense" ? "รายจ่าย" : "รายรับ"}จากเสียง ${proposed.amount.toLocaleString("th-TH")} บาท ในหมวด${proposed.category}แล้ว`;
      } else {
        message = `ถอดเสียงได้ว่า “${voice.transcript}” แต่ยังไม่พบรูปแบบรายรับ/รายจ่าย เช่น “จ่ายกาแฟ 65 บาท” จึงยังไม่บันทึกครับ`;
      }
    }
  } else if (command.type === "voiceEditPrompt") {
    const voice = await db.latestProposedVoiceTranscription(lineUserId, lineChatId);
    if (voice && event.replyToken) { await replyVoiceCategoryChoices(event.replyToken); return; }
    message = voice ? "ส่งข้อความที่แก้ไขใหม่ได้เลย เช่น “แก้ไขเสียง จ่ายกาแฟ 65 บาท” แล้วไมโลจะเสนอรายการให้ตรวจอีกครั้ง" : "ยังไม่มีข้อความเสียงที่รอแก้ไข ลองส่งข้อความเสียงก่อนครับ";
  } else if (command.type === "voiceCategoryChange") {
    const voice = await db.latestProposedVoiceTranscription(lineUserId, lineChatId);
    const allowed = new Set([...STANDARD_EXPENSE_CATEGORIES, ...(await db.listExpenseCategories(lineUserId, "expense", financeScope!.financeAccountId)).map(item => item.name)]);
    if (!voice) message = "ยังไม่มีข้อความเสียงที่รอแก้ไข ลองส่งข้อความเสียงก่อนครับ";
    else if (!allowed.has(command.category)) message = "เลือกหมวดที่แนะนำได้ หรือพิมพ์แก้ไขข้อความใหม่เพื่อระบุรายละเอียดครับ";
    else {
      const proposal = proposalFromStoredTranscript(voice.transcript, voice.proposalJson);
      proposal.category = command.category;
      const updated = await db.updateVoiceTranscript({ id: voice.id, lineUserId, transcript: voice.transcript, proposalJson: JSON.stringify(proposal) });
      if (!updated) message = "ข้อความเสียงนี้ไม่อยู่ในสถานะที่แก้ไขได้แล้ว ลองส่งข้อความเสียงใหม่ครับ";
      else if (event.replyToken) { await sendVoiceProposal(event.replyToken, proposal); return; }
      else message = `เปลี่ยนหมวดข้อเสนอเป็น ${command.category} แล้ว`;
    }
  } else if (command.type === "voiceEdit") {
    const voice = await db.latestProposedVoiceTranscription(lineUserId, lineChatId);
    if (!voice) message = "ยังไม่มีข้อความเสียงที่รอแก้ไข ลองส่งข้อความเสียงก่อนครับ";
    else {
      const proposal = await buildVoiceProposal(command.transcript, lineUserId, financeScope!.financeAccountId);
      const updated = await db.updateVoiceTranscript({ id: voice.id, lineUserId, transcript: command.transcript, proposalJson: JSON.stringify(proposal) });
      if (!updated) message = "ข้อความเสียงนี้ไม่อยู่ในสถานะที่แก้ไขได้แล้ว ลองส่งข้อความเสียงใหม่ครับ";
      else if (event.replyToken) { await sendVoiceProposal(event.replyToken, proposal); return; }
      else message = "แก้ไขข้อความเสียงแล้ว";
    }
  } else if (command.type === "note") {
    await db.createNote(lineChatId, lineUserId, command.title, command.content);
    message = "เก็บโน้ตไว้ให้แล้ว ค้นหาได้ทุกเมื่อ";
  } else if (command.type === "todo") {
    await db.createTodo(lineChatId, lineUserId, command.title);
    message = `เพิ่มงาน “${command.title}” แล้ว`;
  } else if (command.type === "vault") {
    await db.createVaultItem({ lineChatId, createdByLineUserId: lineUserId, itemType: command.itemType, title: command.title, searchableText: command.content, tagsText: command.tagsText, sourceUrl: command.sourceUrl, lineMessageId: event.message?.id });
    message = `เก็บ${command.itemType === "link" ? "ลิงก์" : "ข้อความ"}นี้ไว้ในคลังแล้ว${command.tagsText ? ` พร้อมแท็ก ${command.tagsText}` : ""}`;
  } else if (command.type === "search") {
    const results = await db.searchVault(lineUserId, command.query);
    message = results.length ? `พบ ${results.length} รายการ\n${results.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}`).join("\n")}` : `ยังไม่พบรายการ “${command.query}”`;
  } else if (command.type === "mention") {
    const member = await db.findLineMemberByName(lineChatId, command.memberName);
    if (member && event.replyToken) {
      await replyMention(event.replyToken, command.message, member.lineUserId);
      return;
    }
    message = `ยังไม่พบสมาชิกชื่อ “${command.memberName}” ในข้อมูลของกลุ่ม ลองให้สมาชิกส่งข้อความหาไมโลก่อนครับ`;
  } else if (command.type === "budget") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "สิทธิ์ของคุณยังตั้งงบประมาณในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const now = new Date();
    const monthKey = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
    await db.upsertBudget(lineUserId, command.category, command.amount, monthKey, financeScope!.financeAccountId);
    message = `ตั้งงบหมวด${command.category} ${command.amount.toLocaleString("th-TH")} บาท สำหรับเดือนนี้แล้ว`;
  } else if (command.type === "categoryAdd") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "สิทธิ์ของคุณยังจัดการหมวดในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    await db.addExpenseCategory(lineUserId, command.name, command.transactionType, financeScope!.financeAccountId);
    message = `เพิ่มหมวด${command.transactionType === "income" ? "รายรับ" : "รายจ่าย"} “${command.name}” แล้ว`;
  } else if (command.type === "categoryRemove") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "สิทธิ์ของคุณยังจัดการหมวดในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const removed = await db.removeExpenseCategory(lineUserId, command.name, command.transactionType, financeScope!.financeAccountId);
    message = removed ? `ลบหมวด${command.transactionType === "income" ? "รายรับ" : "รายจ่าย"} “${command.name}” แล้ว` : `ไม่พบหมวด “${command.name}” ที่จะลบ`;
  } else if (command.type === "categoryList") {
    const categories = await db.listTransactionCategories(lineUserId, financeScope!.financeAccountId);
    const customExpense = categories.filter(item => item.transactionType === "expense" && !STANDARD_EXPENSE_CATEGORIES.includes(item.name as typeof STANDARD_EXPENSE_CATEGORIES[number]));
    const customIncome = categories.filter(item => item.transactionType === "income" && !STANDARD_INCOME_CATEGORIES.includes(item.name as typeof STANDARD_INCOME_CATEGORIES[number]));
    const expenseSection = `หมวดรายจ่ายมาตรฐาน\n${STANDARD_EXPENSE_CATEGORIES.map(name => `• ${name}`).join("\n")}${customExpense.length ? `\nหมวดรายจ่ายที่คุณเพิ่ม\n${customExpense.map(item => `• ${item.name}`).join("\n")}` : ""}`;
    const incomeSection = `หมวดรายรับมาตรฐาน\n${STANDARD_INCOME_CATEGORIES.map(name => `• ${name}`).join("\n")}${customIncome.length ? `\nหมวดรายรับที่คุณเพิ่ม\n${customIncome.map(item => `• ${item.name}`).join("\n")}` : ""}`;
    message = command.transactionType === "income" ? incomeSection : command.transactionType === "expense" ? expenseSection : `${expenseSection}\n\n${incomeSection}\n\nเพิ่มหมวดได้ด้วย “เพิ่มหมวดรายจ่าย ชื่อหมวด” หรือ “เพิ่มหมวดรายรับ ชื่อหมวด”`;
  } else if (command.type === "invalid") {
    message = command.message;
  } else if (command.type === "imageConfirm") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) { message = "สิทธิ์ของคุณในสมุดบัญชีนี้เป็นผู้ดู จึงยังยืนยันรายการไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const latest = await db.latestImageExtraction(lineUserId, lineChatId);
    if (!latest || latest.extraction.status !== "proposed") {
      message = "ยังไม่มีผลวิเคราะห์รูปที่รอยืนยัน ลองส่งรูปใบนัดหรือใบเสร็จก่อนครับ";
    } else {
      const analysis = JSON.parse(latest.extraction.extractedJson) as { proposals?: Array<Record<string, unknown>> };
      const proposal = selectImageProposal(analysis.proposals as never[]);
      if (!proposal) {
        await db.setImageExtractionStatus(latest.extraction.id, "rejected");
        message = "รูปนี้ยังไม่มีข้อมูลที่บันทึกได้อย่างมั่นใจ จึงยังไม่สร้างรายการให้ครับ";
      } else if (proposal.kind === "expense" && Number(proposal.amount ?? 0) > 0) {
        const amount = Number(proposal.amount ?? 0);
        const category = normalizeExpenseCategory(proposal.category, `${proposal.title ?? ""} ${proposal.merchant ?? ""} ${proposal.note ?? ""}`);
        const occurredAt = parseExtractedDate(command.dateText) ?? parseExtractedDate(proposal.dateText);
        if (!occurredAt) {
          message = `อ่านยอด ${amount.toLocaleString("th-TH")} บาทได้ แต่วันที่ใน${proposal.documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ"}ไม่ชัด จึงยังไม่บันทึกเพื่อป้องกันข้อมูลผิดพลาด\nกรุณาพิมพ์ “ยืนยันค่าใช้จ่าย วันที่ 27/08/2569” โดยแทนวันที่จริง`;
        } else {
          const transactionId = await db.createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope!.financeAccountId, transactionType: "expense", amount, category, note: buildExpenseNote(proposal), occurredAt, source: "line_image" });
          await db.linkTransactionAttachment({ transactionId, vaultItemId: latest.vault.id, lineUserId, label: proposal.documentType === "bank_slip" ? "สลิปต้นฉบับ" : "ใบเสร็จต้นฉบับ" });
          await db.setImageExtractionStatus(latest.extraction.id, "accepted");
          if (event.replyToken) { await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope!.financeAccountId, { transactionType: "expense", amount, category, note: buildExpenseNote(proposal), occurredAt }); return; }
          message = `บันทึกรายจ่ายจาก${proposal.documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ"} ${amount.toLocaleString("th-TH")} บาท ในหมวด${category}แล้ว`;
        }
      } else {
        const proposed = parseMiloCommand(`เตือน ${proposal.title} ${proposal.dateText} ${proposal.timeText}`);
        if (proposed.type === "reminder") {
          const id = await db.createReminder({ lineChatId, createdByLineUserId: lineUserId, ...proposed.data, sourceImageKey: latest.vault.storageKey ?? undefined });
          await db.setImageExtractionStatus(latest.extraction.id, "accepted");
          message = `สร้างรายการเตือนจากรูป #${id} แล้ว: ${proposed.data.title}`;
        } else {
          message = "อ่านหัวข้อจากรูปได้ แต่ยังอ่านวันเวลาที่แน่ชัดไม่ได้ ลองพิมพ์เวลาที่ต้องการเพิ่ม แล้วส่งมาใหม่ได้ครับ";
        }
      }
    }
  } else if (command.type === "settingGuide") {
    message = "⚙️ ตั้งค่า Milo\nตั้งค่าการใช้งาน Milo ได้จากเมนูและคำสั่งใน LINE ครับ\n• พิมพ์ “ช่วย” เพื่อดูคำสั่งทั้งหมด\n• พิมพ์ “หมวดหมู่” เพื่อจัดการหมวดหมู่\n• พิมพ์ “งบประมาณ” เพื่อดูและจัดการงบประมาณ\n🔐 “แดชบอร์ดหลังบ้าน” เป็นเมนูสำหรับผู้ดูแลระบบโดยเฉพาะครับ";
  } else if (command.type === "dashboardGuide") {
    message = "🔐 แดชบอร์ดหลังบ้าน Milo\nhttps://milo-line-app.vercel.app/dashboard";
  } else if (command.type === "recordGuide") {
    message = "📝 จดบันทึกได้เลย\nตัวอย่าง: กินกาแฟ 80 หรือ จ่าย ค่าอาหาร 125\nหรือ: รับเงินเดือน 30000\nส่งรูปใบเสร็จแล้วพิมพ์ “ยืนยันค่าใช้จ่าย” หรือส่งเสียงแล้วพิมพ์ “ยืนยันเสียง” หลังตรวจรายละเอียดครับ";
  } else if (command.type === "budgetOverview") {
    const monthKey = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
    const budgets = await db.listBudgets(lineUserId, monthKey, financeScope!.financeAccountId);
    const report = await db.financeReport(lineUserId, "month", new Date(), financeScope!.financeAccountId);
    message = budgets.length ? "📊 งบประมาณเดือนนี้\n" + budgets.slice(0, 10).map(item => `• ${item.category}: ใช้ไป ${(report.categories[item.category] ?? 0).toLocaleString("th-TH")} / งบ ${Number(item.amount).toLocaleString("th-TH")} บาท`).join("\n") : "📊 ยังไม่มีงบประมาณที่ตั้งไว้ครับ\nตัวอย่าง: ตั้งงบ อาหาร 5000";
  } else if (command.type === "transactionList") {
    const results = await db.searchTransactions(lineUserId, "", 10, financeScope!.financeAccountId);
    message = results.length ? "📋 รายการล่าสุด\n" + results.map(item => `#${item.id} • ${item.transactionType === "expense" ? "รายจ่าย" : "รายรับ"} ${Number(item.amount).toLocaleString("th-TH")} บาท • ${item.category}`).join("\n") : "📋 ยังไม่มีรายการธุรกรรมครับ";
  } else if (command.type === "greeting") {
    message = "สวัสดีครับ 👋 ผมไมโล ผู้ช่วยการเงินของคุณ\nกดเมนูด้านล่างหรือพิมพ์ “ช่วย” เพื่อดูคำสั่งที่ใช้งานได้ครับ";
  } else if (command.type === "help") {
    message = helpText();
  } else {
    message = "ผมยังไม่เข้าใจ ลองพิมพ์ “ช่วย” เพื่อดูตัวอย่างคำสั่งได้ครับ";
  }
  if (event.replyToken) {
    const artwork = artworkForCommand(command);
    if (artwork) {
      try { await replyRichMenu(event.replyToken, message, artwork); }
      catch { await replyText(event.replyToken, message); }
    } else await replyText(event.replyToken, message);
  }
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
    lineChatId, createdByLineUserId: lineUserId, itemType: isImage ? "image" : "file", title: message.fileName ?? (isImage ? "รูปจาก LINE" : isAudio ? "ข้อความเสียงจาก LINE" : "ไฟล์จาก LINE"),
    searchableText: message.fileName, originalFilename: message.fileName, mimeType, storageKey: stored.key, storageUrl: stored.url, lineMessageId: message.id,
  });
  if (isAudio) {
    try {
      const audioUrl = await storageGetSignedUrl(stored.key);
      const transcript = await transcribeAudio({ audioUrl, language: "th", prompt: "ถอดข้อความภาษาไทยเกี่ยวกับรายรับ รายจ่าย จำนวนเงิน และหมวดหมู่" });
      if ("error" in transcript) throw new Error(transcript.error);
      const financeScope = await resolveFinanceScope(lineUserId, lineChatId, scope);
      const proposal = await buildVoiceProposal(transcript.text, lineUserId, financeScope?.financeAccountId);
      await db.saveVoiceTranscription({ vaultItemId: vaultId, lineChatId, lineUserId, transcript: transcript.text, language: transcript.language, durationSeconds: transcript.duration, proposalJson: JSON.stringify(proposal) });
      if (event.replyToken) await sendVoiceProposal(event.replyToken, proposal);
    } catch (error) {
      console.error("[Milo Voice] transcription failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
      if (event.replyToken) await replyText(event.replyToken, "เก็บข้อความเสียงไว้แล้ว แต่ยังถอดเสียงไม่ได้ในครั้งนี้ กรุณาลองอัดใหม่ให้ชัดเจน ความยาวสั้น ๆ และขนาดไม่เกิน 16MB ครับ");
    }
    return;
  }
  if (!isImage) {
    if (event.replyToken) await replyText(event.replyToken, "เก็บไฟล์นี้ไว้ในคลังถาวรแล้ว");
    return;
  }
  try {
    const analysis = await analyzeImage(`data:${mimeType};base64,${bytes.toString("base64")}`);
    await db.saveImageExtraction(vaultId, analysis.proposals.some(item => item.kind === "expense") ? "expense" : "reminder", JSON.stringify(analysis), analysis.confidence);
    const proposals = analysis.proposals.slice(0, 2).map(item => `• ${formatImageProposal(item)}`).join("\n");
    if (event.replyToken) await replyText(event.replyToken, `เก็บรูปไว้แล้ว\n${analysis.summary}\n${proposals || "ยังไม่พบรายการที่ควรบันทึกอัตโนมัติ"}\nตรวจยอดและหมวดให้ถูกต้องก่อน แล้วพิมพ์ “ยืนยันค่าใช้จ่าย” เพื่อบันทึก หรือ “ยืนยันรูป” สำหรับรายการเตือน`);
  } catch {
    if (event.replyToken) await replyText(event.replyToken, "เก็บรูปไว้แล้ว แต่ยังอ่านรายละเอียดจากรูปไม่ได้ ลองส่งภาพที่คมชัดขึ้นได้ครับ");
  }
}

export async function processEvent(event: LineEvent, rawPayload: string) {
  const identity = sourceIdentity(event.source);
  if (!identity.lineUserId) return;
  const accepted = await db.registerWebhookEvent({ webhookEventId: event.webhookEventId, eventType: event.type, lineChatId: identity.lineChatId, occurredAt: new Date(event.timestamp), rawPayload });
  if (!accepted) return;
  try {
    const profile = await getProfile(event.source).catch(() => undefined);
    await db.upsertLineChat(identity.lineChatId, identity.scope, profile?.displayName);
    await db.upsertLineMember(identity.lineChatId, identity.lineUserId, profile?.displayName);
    if (event.type !== "message" || !event.message) { await db.finishWebhookEvent(event.webhookEventId, "ignored"); return; }
    const isGroup = identity.scope !== "user";
    const isMention = event.message.mention?.mentionees?.some(item => item.isSelf) || event.message.text?.trim().startsWith("@ไมโล");
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
