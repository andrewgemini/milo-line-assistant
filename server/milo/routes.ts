import { artworkForCommand } from "./richMenuArtwork";
import { buildCalendarIcsUrl, buildGoogleCalendarUrl } from "./calendar";
import { replyRichMenu } from "./line";
import express, { type Express, type Request, type Response } from "express";
import { sdk } from "../_core/sdk";
import { transcribeAudio } from "../_core/voiceTranscription";
import { storagePut } from "../storage";
import * as db from "../db";
import { analyzeImage } from "./imageAnalysis";
import { analyzePdfBuffer } from "./pdfAnalysis";
import { buildFinanceExportUrl } from "./financeExport";
import { budgetCycleWindow, formatBudgetCycleLabel } from "./budgetCycle";
import { generateFinancialInsight, suggestExpenseCategory } from "./financialAssistant";
import { parseMiloCommand } from "./commandParser";
import { deliverDueReminders } from "./reminderDelivery";
import { deliverDueRecurringTransactions } from "./recurringTransactionDelivery";
import { assertRecurringCapacity } from "./recurringLimit";
import { entitlementMessage, hasMiloEntitlement, resolveMiloPlan } from "./entitlements";
import { deliverFinanceDigest, type FinanceDigestType } from "./financeDigest";
import { buildExpenseNote, formatImageProposal, normalizeExpenseCategory, parseExtractedDate, resolveReceiptOccurredAt, selectImageProposal } from "./receiptUtils";
import { applyImageExpenseEdit } from "./imageProposalEdit";
import { bangkokMonthRange, buildDocumentIntelligence, classifyDocumentKind, documentKindLabel, documentStatusLabel, fingerprintMedia, mergeVaultTags, readDocumentStatus, summarizeVaultDocuments, type DocumentAnalysis } from "./documentIntelligence";
import { deserializeCapturePlan, formatCapturePreview, serializeCapturePlan } from "./multiIntent";
import { bangkokDayRange, formatTodayOverview } from "./todayOverview";
import { STANDARD_EXPENSE_CATEGORIES, STANDARD_INCOME_CATEGORIES } from "./financeCategories";
import { financeReportCardText, getMessageContent, getProfile, lineCredentials, postSaveSummaryText, pushText, pushTextWithQuickReplies, replyFinanceReportCard, replyFinanceReportCardFallback, replyGreetingHome, replyMention, replyPostSaveSummary, replyPostSaveSummaryFallback, replyPostSaveSummaryImage, replyText, replyTextWithQuickReplies, replyVoiceCategoryChoices, replyVoiceProposal, replyVoiceProposalFallback, sourceIdentity, type LineEvent, type VoiceTransactionProposal, verifyLineSignature } from "./line";

function helpText() {
  return "Milo ช่วยคุณจบงานใน LINE แชทเดียวครับ\n🔔 เตือน: เตือนประชุมพรุ่งนี้ 10:00 / เตือนดื่มน้ำทุก 30 นาที / รายการเตือน\n🗂️ เก็บ: เก็บ https://example.com #งาน / ค้นหา ใบเสนอราคา / สถานะคลัง\n📦 เอกสาร: สรุปเอกสารเดือนนี้ / ไฟล์ที่ต้องตรวจ\n🧠 จดหลายอย่าง: พรุ่งนี้บ่ายสองประชุมลูกค้า ค่าแท็กซี่ 300 ช่วยเตือนด้วย\n☀️ วันนี้: วันนี้มีอะไร / บิลรอจ่าย / จ่ายบิล #เลขรายการ\n📅 ปฏิทิน: ลงปฏิทิน ประชุมทีมพรุ่งนี้ 10:00 / ดูปฏิทิน\n👥 กลุ่ม LINE: @ไมโล ผู้ช่วยกลุ่ม / @ไมโล แจ้งส่งงานด้วยถึง @สมชาย\n✅ งาน: งาน ส่งสรุปรายสัปดาห์ / ดูงาน / เสร็จงาน #12 / โน้ต รหัส Wi-Fi\n💰 การเงิน: กินกาแฟ 80 / เงินเดือนเข้า 35000 / ตั้งงบ อาหาร 5000 / สรุปเดือนนี้\n📷🎙️ ส่งรูปใบเสร็จหรือเสียงให้ไมโลอ่าน แล้วตรวจและยืนยันก่อนบันทึก\n\nพิมพ์ “ช่วย” ได้ทุกเมื่อครับ";
}

function contextualFallback(text: string) {
  const value = text.trim().replace(/^@?ไมโล\s*/i, "").slice(0, 80);
  if (/งบ|หมวด/.test(value)) return { text: "ต้องการจัดการงบหรือหมวดไหนครับ?", actions: [{ label: "ดูงบ", text: "งบ" }, { label: "ดูหมวด", text: "หมวดหมู่" }, { label: "ตั้งงบอาหาร", text: "ตั้งงบ อาหาร 5000" }] };
  if (/สรุป|ยอด|เงิน|วิเคราะห์/.test(value)) return { text: "ต้องการดูภาพรวมช่วงไหนครับ?", actions: [{ label: "สรุปวันนี้", text: "สรุปวันนี้" }, { label: "สรุปเดือนนี้", text: "สรุปเดือนนี้" }, { label: "วิเคราะห์", text: "วิเคราะห์" }] };
  if (/จด|ซื้อ|กิน|จ่าย|รับ/.test(value)) return { text: "พิมพ์รายการพร้อมยอดได้เลยครับ เช่น “กินกาแฟ 80”", actions: [{ label: "วิธีจด", text: "จดบันทึก" }, { label: "รายการล่าสุด", text: "รายการ" }, { label: "สรุปวันนี้", text: "สรุปวันนี้" }] };
  return { text: "ไมโลยังไม่แน่ใจว่า “" + (value || "ข้อความนี้") + "” ต้องการทำอะไร เลือกทางลัดได้เลยครับ", actions: [{ label: "จดรายรับ/รายจ่าย", text: "จดบันทึก" }, { label: "สรุปเดือนนี้", text: "สรุปเดือนนี้" }, { label: "วิธีใช้งาน", text: "วิธีใช้งาน" }] };
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
  return `สรุปวิเคราะห์การเงิน\n${quality}\n${insight.summary}${highlights ? `\n\nข้อสังเกต\n${highlights}` : ""}${actions ? `\n\nแนวทางจัดการ\n${actions}` : ""}`;
}

function formatDocumentPacket(reference: Date, rows: Awaited<ReturnType<typeof db.listVaultDocumentsForChat>>, issuesOnly = false) {
  const packet = summarizeVaultDocuments(rows);
  const monthLabel = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", month: "long", year: "numeric" }).format(reference);
  const kinds = packet.byKind.length
    ? packet.byKind.map(([kind, count]) => `• ${documentKindLabel(kind)} ${count} ไฟล์`).join("\n")
    : "• ยังไม่มีเอกสาร";
  const issueRows = packet.issues.slice(0, 8).map(item => `#${item.id} • ${item.title} • ${documentStatusLabel(readDocumentStatus(item.tagsText))}`).join("\n");
  if (issuesOnly) {
    return issueRows
      ? `⚠️ เอกสารที่ต้องตรวจ เดือน${monthLabel}\n${issueRows}\n\nพิมพ์ชื่อร้าน วันที่ หรือคำสำคัญหลังคำว่า “ค้นหา” เพื่อเปิดหาไฟล์ได้เร็วขึ้น`
      : `✅ เดือน${monthLabel} ไม่มีเอกสารที่ค้างตรวจครับ`;
  }
  return `📦 ชุดเอกสารเดือน${monthLabel}\nทั้งหมด ${packet.total} ไฟล์ • พร้อมใช้ ${packet.ready} • ต้องตรวจ ${packet.issues.length}\nไฟล์ซ้ำ ${packet.duplicates} • ต้องอัปโหลดซ้ำ ${packet.storageMissing}\n\nแยกตามประเภท\n${kinds}${issueRows ? `\n\nรายการที่ต้องตรวจ\n${issueRows}` : "\n\n✅ ไม่มีรายการค้างตรวจ"}`;
}

async function persistDocumentIntelligence(input: {
  vaultId: number;
  lineUserId: string;
  lineChatId: string;
  filename?: string;
  mimeType: string;
  storageReady: boolean;
  fingerprint: string;
  senderDisplayName?: string;
  analysis?: DocumentAnalysis;
  error?: unknown;
}) {
  const intelligence = buildDocumentIntelligence(input);
  try {
    await db.updateVaultIntelligence({
      id: input.vaultId,
      lineUserId: input.lineUserId,
      lineChatId: input.lineChatId,
      title: intelligence.title,
      searchableText: intelligence.searchableText,
      tagsText: intelligence.tagsText,
      workflowStatus: intelligence.status,
      documentKind: intelligence.kind,
    });
  } catch (error) {
    console.warn("[Milo Documents] metadata update failed", {
      vaultId: input.vaultId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
  return intelligence;
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
  const budgetCycleReport = await db.financeBudgetCycleReport(lineUserId, occurredAt, financeAccountId);
  const budgets = await db.listBudgets(lineUserId, budgetCycleReport.key, financeAccountId);
  const budget = budgets.find(item => item.category === transaction.category);
  const budgetLimit = budget ? Number(budget.amount) : 0;
  const budgetSpent = Number(budgetCycleReport.categories[transaction.category!] ?? 0);
  const budgetPercent = budgetLimit > 0 ? Math.round((budgetSpent / budgetLimit) * 100) : undefined;
  const summary = { transactionType: transaction.transactionType!, amount: transaction.amount!, category: transaction.category!, note: transaction.note, occurredAt, dailyIncome: dailyReport.income, dailyExpense: dailyReport.expense, dailyBalance: dailyReport.balance, budgetSpent, budgetLimit, budgetPercent };
  try {
    await replyPostSaveSummaryImage(replyToken, summary);
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
  const plan = resolveMiloPlan(lineUserId, process.env, await db.isAdminLinkedLineUser(lineUserId));
  let message = "";
  const financeCommands = new Set(["expense", "income", "transactionSearch", "transactionUndo", "transactionDelete", "transactionUpdate", "openingBalance", "financeReport", "aiSummary", "budgetOverview", "transactionList", "voiceConfirm", "voiceEditPrompt", "voiceCategoryChange", "voiceEdit", "budget", "budgetCycleStart", "categoryAdd", "categoryRemove", "categoryList", "imageConfirm", "imageEdit", "pdfConfirm", "recurringCreate", "recurringList", "recurringStatus", "exportFinance", "pendingBillList", "pendingBillPay", "pendingBillCancel"]);
  const captureNeedsFinance = command.type === "captureDraft" && command.plan.items.some(item => item.type === "pending_bill");
  const needsFinance = financeCommands.has(command.type) || captureNeedsFinance;
  if (command.type === "reminder" && !hasMiloEntitlement(plan, "reminders")) { if (event.replyToken) await replyText(event.replyToken, entitlementMessage("reminders")); return; }
  if (command.type === "pdfConfirm" && !hasMiloEntitlement(plan, "pdf")) { if (event.replyToken) await replyText(event.replyToken, entitlementMessage("pdf")); return; }
  if (command.type === "budgetCycleStart" && !hasMiloEntitlement(plan, "customBudgetCycle")) { if (event.replyToken) await replyText(event.replyToken, entitlementMessage("customBudgetCycle")); return; }
  if (scope !== "user" && needsFinance && !hasMiloEntitlement(plan, "groupAccounting")) { if (event.replyToken) await replyText(event.replyToken, entitlementMessage("groupAccounting")); return; }
  const financeScope = needsFinance ? await resolveFinanceScope(lineUserId, lineChatId, scope) : undefined;
  if (needsFinance && !financeScope) {
    if (event.replyToken) await replyText(event.replyToken, financeAccessMessage(scope));
    return;
  }
  if (command.type === "captureDraft") {
    if (command.plan.items.some(item => item.type === "reminder") && !hasMiloEntitlement(plan, "reminders")) {
      if (event.replyToken) await replyText(event.replyToken, entitlementMessage("reminders"));
      return;
    }
    if (captureNeedsFinance && !db.canCreateFinanceTransaction(financeScope!.role)) {
      if (event.replyToken) await replyText(event.replyToken, "สิทธิ์ของคุณในสมุดบัญชีนี้ยังสร้างบิลรอจ่ายไม่ได้");
      return;
    }
    await db.createCaptureDraft({
      lineChatId,
      lineUserId,
      financeAccountId: financeScope?.financeAccountId,
      sourceMessageId: event.message?.id,
      payloadJson: serializeCapturePlan(command.plan),
    });
    const preview = formatCapturePreview(command.plan, formatDate);
    if (event.replyToken) {
      await replyTextWithQuickReplies(event.replyToken, preview, [
        { label: "ยืนยันทั้งหมด", text: "ยืนยันรายการทั้งหมด" },
        { label: "ยกเลิก", text: "ยกเลิกรายการทั้งหมด" },
      ]);
      return;
    }
    message = preview;
  } else if (command.type === "captureConfirm") {
    const draft = await db.latestProposedCaptureDraft(lineUserId, lineChatId);
    if (!draft) {
      message = "ยังไม่มีชุดรายการที่รอยืนยัน ลองพิมพ์นัดหมาย บิล และคำเตือนในข้อความเดียวก่อนครับ";
    } else {
      const capture = deserializeCapturePlan(draft.payloadJson);
      if (capture.items.some(item => item.type === "reminder") && !hasMiloEntitlement(plan, "reminders")) {
        if (event.replyToken) await replyText(event.replyToken, entitlementMessage("reminders"));
        return;
      }
      const hasBill = capture.items.some(item => item.type === "pending_bill");
      let captureFinance = financeScope;
      if (hasBill) {
        if (scope !== "user" && !hasMiloEntitlement(plan, "groupAccounting")) {
          if (event.replyToken) await replyText(event.replyToken, entitlementMessage("groupAccounting"));
          return;
        }
        captureFinance = await resolveFinanceScope(lineUserId, lineChatId, scope);
        if (!captureFinance) {
          if (event.replyToken) await replyText(event.replyToken, financeAccessMessage(scope));
          return;
        }
        if (!db.canCreateFinanceTransaction(captureFinance.role)) {
          if (event.replyToken) await replyText(event.replyToken, "สิทธิ์ของคุณในสมุดบัญชีนี้ยังยืนยันบิลรอจ่ายไม่ได้");
          return;
        }
      }
      const created: Array<{ type: string; id: number }> = [];
      for (let index = 0; index < capture.items.length; index += 1) {
        const item = capture.items[index];
        const sourceMessageId = `capture:${draft.id}:${item.type}:${index}`;
        if (item.type === "calendar") {
          const id = await db.createCalendarEvent({ lineChatId, createdByLineUserId: lineUserId, title: item.title, startsAt: item.startsAt, endsAt: item.endsAt, sourceMessageId });
          created.push({ type: item.type, id });
        } else if (item.type === "reminder") {
          const id = await db.createReminder({ lineChatId, createdByLineUserId: lineUserId, title: item.title, recurrenceType: "once", recurrenceInterval: 1, dueAt: item.dueAt, nextRunAt: item.dueAt, sourceMessageId });
          created.push({ type: item.type, id });
        } else {
          const id = await db.createPendingBill({ lineChatId, lineUserId, financeAccountId: captureFinance!.financeAccountId, captureDraftId: draft.id, title: item.title, amount: item.amount, category: item.category, dueAt: item.dueAt, sourceMessageId });
          created.push({ type: item.type, id });
        }
      }
      await db.finishCaptureDraft({ id: draft.id, lineUserId, lineChatId, status: "accepted", details: { created } });
      const billIds = created.filter(item => item.type === "pending_bill").map(item => `#${item.id}`).join(", ");
      message = `บันทึกชุดรายการแล้ว ✅\nนัดหมาย ${created.filter(item => item.type === "calendar").length} • เตือน ${created.filter(item => item.type === "reminder").length} • บิลรอจ่าย ${created.filter(item => item.type === "pending_bill").length}${billIds ? ` (${billIds})` : ""}\n\nยังไม่มีการสร้างรายจ่ายจริง พิมพ์ “จ่ายบิล #เลขรายการ” เมื่อชำระแล้ว`;
      if (event.replyToken) {
        await replyTextWithQuickReplies(event.replyToken, message, [
          { label: "วันนี้มีอะไร", text: "วันนี้มีอะไร" },
          { label: "ดูบิลรอจ่าย", text: "บิลรอจ่าย" },
        ]);
        return;
      }
    }
  } else if (command.type === "captureCancel") {
    const draft = await db.latestProposedCaptureDraft(lineUserId, lineChatId);
    message = draft && await db.finishCaptureDraft({ id: draft.id, lineUserId, lineChatId, status: "rejected" })
      ? "ยกเลิกชุดรายการที่รอยืนยันแล้วครับ"
      : "ไม่มีชุดรายการที่รอยกเลิกครับ";
  } else if (command.type === "todayOverview") {
    const range = bangkokDayRange(new Date());
    const optionalFinance = scope === "user" || hasMiloEntitlement(plan, "groupAccounting")
      ? await resolveFinanceScope(lineUserId, lineChatId, scope)
      : undefined;
    const [calendars, reminders, todos, bills, finance] = await Promise.all([
      db.listCalendarEventsForRange(lineUserId, lineChatId, scope, range.start, new Date(range.end.getTime() - 1)),
      db.listRemindersForChat(lineUserId, lineChatId, scope),
      db.listTodosForChat(lineUserId, lineChatId, scope),
      optionalFinance ? db.listPendingBillsForChat(lineUserId, lineChatId, scope, optionalFinance.financeAccountId) : Promise.resolve([]),
      optionalFinance ? db.financeReport(lineUserId, "day", new Date(), optionalFinance.financeAccountId) : Promise.resolve(undefined),
    ]);
    message = formatTodayOverview({
      reference: new Date(),
      calendars,
      reminders: reminders.filter(item => item.status === "active" && item.nextRunAt && item.nextRunAt >= range.start && item.nextRunAt < range.end),
      todos: todos.filter(item => !item.dueAt || item.dueAt < range.end),
      bills: bills.filter(item => item.dueAt < range.end),
      finance,
    });
  } else if (command.type === "pendingBillList") {
    const bills = await db.listPendingBillsForChat(lineUserId, lineChatId, scope, financeScope!.financeAccountId);
    message = bills.length
      ? `🧾 บิลรอจ่าย\n${bills.slice(0, 30).map(item => `#${item.id} • ${item.title} • ${Number(item.amount).toLocaleString("th-TH")} บาท • ครบกำหนด ${formatDate(item.dueAt)}`).join("\n")}\n\nเมื่อจ่ายแล้วพิมพ์ “จ่ายบิล #เลขรายการ”`
      : "🧾 ไม่มีบิลรอจ่ายครับ";
  } else if (command.type === "pendingBillPay") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) {
      if (event.replyToken) await replyText(event.replyToken, "สิทธิ์ของคุณในสมุดบัญชีนี้ยังชำระบิลไม่ได้");
      return;
    }
    const bill = await db.getPendingBillForAction(command.id, lineUserId, lineChatId, financeScope!.financeAccountId);
    if (!bill) {
      message = `ไม่พบบิลรอจ่าย #${command.id} ในสมุดบัญชีนี้`;
    } else {
      const occurredAt = Number.isFinite(event.timestamp) ? new Date(event.timestamp) : new Date();
      const transactionId = await db.createTransaction({
        lineChatId,
        lineUserId,
        financeAccountId: financeScope!.financeAccountId,
        transactionType: "expense",
        amount: Number(bill.amount),
        category: bill.category,
        note: bill.title,
        occurredAt,
        source: "pending_bill",
        sourceMessageId: `pending-bill:${bill.id}`,
      });
      await db.markPendingBillPaid({ id: bill.id, transactionId, lineUserId, lineChatId });
      if (event.replyToken) {
        await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope!.financeAccountId, {
          transactionType: "expense",
          amount: Number(bill.amount),
          category: bill.category,
          note: bill.title,
          occurredAt,
        });
        return;
      }
      message = `จ่ายบิล #${bill.id} แล้ว และบันทึกรายจ่าย ${Number(bill.amount).toLocaleString("th-TH")} บาท`;
    }
  } else if (command.type === "pendingBillCancel") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) {
      if (event.replyToken) await replyText(event.replyToken, "สิทธิ์ของคุณในสมุดบัญชีนี้ยังยกเลิกบิลไม่ได้");
      return;
    }
    const cancelled = await db.cancelPendingBill({ id: command.id, lineUserId, lineChatId, financeAccountId: financeScope!.financeAccountId });
    message = cancelled ? `ยกเลิกบิล #${command.id} แล้วครับ` : `ไม่พบบิลรอจ่าย #${command.id}`;
  } else if (command.type === "reminderList") {
    const items = await db.listRemindersForChat(lineUserId, lineChatId, scope);
    message = items.length
      ? `🔔 รายการเตือนใน${scope === "user" ? "แชทนี้" : "กลุ่มนี้"}\n${items.slice(0, 20).map(item => `#${item.id} • ${item.title} • ${item.nextRunAt ? formatDate(item.nextRunAt) : "รอกำหนดเวลา"}`).join("\n")}\n\nยกเลิกของคุณ: ยกเลิกเตือน #เลขรายการ`
      : "🔔 ยังไม่มีรายการเตือนที่กำลังใช้งานในแชทนี้ครับ";
  } else if (command.type === "reminderCancel") {
    const cancelled = await db.cancelReminderForChat(command.id, lineUserId, lineChatId);
    message = cancelled ? `ยกเลิกเตือน #${command.id} แล้วครับ` : `ไม่พบรายการเตือน #${command.id} ที่คุณยกเลิกได้ในแชทนี้`;
  } else if (command.type === "todoList") {
    const items = await db.listTodosForChat(lineUserId, lineChatId, scope);
    message = items.length
      ? `✅ To-do ใน${scope === "user" ? "แชทนี้" : "กลุ่มนี้"}\n${items.slice(0, 30).map(item => `#${item.id} • ${item.title}${item.dueAt ? ` • ${formatDate(item.dueAt)}` : ""}`).join("\n")}\n\nปิดงาน: เสร็จงาน #เลขรายการ`
      : "✅ ไม่มี To-do ที่ค้างอยู่ในแชทนี้ครับ";
  } else if (command.type === "todoComplete") {
    const completed = await db.completeTodoForChat(command.id, lineUserId, lineChatId, scope);
    message = completed ? `ทำงาน #${command.id} เสร็จแล้ว ✅` : `ไม่พบงาน #${command.id} ที่ปิดได้ในแชทนี้`;
  } else if (command.type === "calendarCreate") {
    const id = await db.createCalendarEvent({ lineChatId, createdByLineUserId: lineUserId, ...command.data, sourceMessageId: event.message?.id });
    const googleUrl = buildGoogleCalendarUrl({ ...command.data, detail: command.data.detail ?? null });
    const icsUrl = buildCalendarIcsUrl(id);
    message = `📅 เพิ่มนัด #${id} ในปฏิทิน Milo แล้ว\n${command.data.title}\n${formatDate(command.data.startsAt)} – ${formatDate(command.data.endsAt)}\n\nGoogle Calendar: ${googleUrl}\nApple/Outlook (.ics): ${icsUrl}`;
  } else if (command.type === "calendarList") {
    const items = await db.listCalendarEvents(lineUserId, lineChatId, new Date(), 20);
    message = items.length
      ? `📅 นัดหมายที่กำลังจะถึง\n${items.map(item => `#${item.id} • ${item.title} • ${formatDate(item.startsAt)}`).join("\n")}`
      : "📅 ยังไม่มีนัดหมายที่กำลังจะถึงในแชทนี้ครับ";
  } else if (command.type === "calendarCancel") {
    const cancelled = await db.cancelCalendarEvent(command.id, lineUserId, lineChatId);
    message = cancelled ? `ยกเลิกนัด #${command.id} แล้วครับ` : `ไม่พบนัด #${command.id} ที่คุณยกเลิกได้ในแชทนี้`;
  } else if (command.type === "groupGuide") {
    message = scope === "user"
      ? "👥 วิธีใช้ Milo ในกลุ่ม LINE\n1) เชิญ Milo เข้ากลุ่ม\n2) เรียกด้วย @ไมโล ก่อนคำสั่งข้อความ\n3) ใช้เตือน เก็บ/ค้นหาไฟล์ ปฏิทิน To-do และแท็กสมาชิกได้\nตัวอย่าง: @ไมโล เตือนส่งรายงานพรุ่งนี้ 9:00 หรือ @ไมโล แจ้งส่งงานด้วยถึง @สมชาย"
      : "👥 Milo พร้อมช่วยในกลุ่มนี้ครับ\n• @ไมโล เตือนประชุมพรุ่งนี้ 10:00\n• @ไมโล เก็บ https://example.com #งาน\n• @ไมโล ค้นหา ใบเสนอราคา\n• @ไมโล ลงปฏิทิน ประชุมทีมพรุ่งนี้ 10:00\n• @ไมโล แจ้งส่งงานด้วยถึง @สมชาย\n• ส่งรูป/ไฟล์ในกลุ่มเพื่อเก็บและประมวลผลได้ตามสิทธิ์";
  } else if (command.type === "vaultStatus") {
    const status = await db.vaultStorageStatus(lineUserId, lineChatId, scope);
    message = `🗂️ สถานะคลังในแชทนี้\nทั้งหมด ${status.total} รายการ\nเก็บถาวร ${status.durable} รายการ\nไฟล์สื่อที่ต้องอัปโหลดซ้ำ ${status.mediaMissing} รายการ\n\nข้อความ/ลิงก์เก็บในฐานข้อมูล และรูป/ไฟล์ที่มีสำเนา storage จะเก็บไว้จนกว่าคุณจะลบครับ`;
  } else if (command.type === "documentPacket" || command.type === "documentIssues") {
    const range = bangkokMonthRange(new Date());
    const rows = await db.listVaultDocumentsForChat(lineUserId, lineChatId, scope, range.start, new Date(range.end.getTime() - 1));
    message = formatDocumentPacket(new Date(), rows, command.type === "documentIssues");
  } else if (command.type === "reminder") {
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
  } else if (command.type === "transactionUndo") {
    if (!db.canManageFinanceTransactions(financeScope!.role)) { message = "สิทธิ์ของคุณยังยกเลิกรายการในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const undone = await db.deleteLatestTransaction({ lineUserId, financeAccountId: financeScope!.financeAccountId });
    message = undone ? `ยกเลิกรายการล่าสุด #${undone.id} แล้ว • ${Number(undone.amount).toLocaleString("th-TH")} บาท • ${undone.category}
ข้อมูลยังอยู่ใน Audit log และไม่ถูกนำไปรวมยอด` : "ยังไม่มีรายการล่าสุดที่ยกเลิกได้ครับ";
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
        const occurredAt = Number.isFinite(event.timestamp) ? new Date(event.timestamp) : new Date();
        const transactionId = await db.createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope!.financeAccountId, transactionType: proposed.transactionType, amount: proposed.amount, category: proposed.category, note: proposed.note, occurredAt, source: "line_audio", sourceMessageId: `voice:${voice.id}` });
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
    message = `เก็บ${command.itemType === "link" ? "ลิงก์" : "ข้อความ"}นี้ไว้ในคลังถาวรจนกว่าคุณจะลบแล้ว${command.tagsText ? ` พร้อมแท็ก ${command.tagsText}` : ""}`;
  } else if (command.type === "search") {
    const results = await db.searchVaultForChat(lineUserId, lineChatId, scope, command.query);
    message = results.length ? `พบ ${results.length} รายการใน${scope === "user" ? "แชทส่วนตัว" : "กลุ่มนี้"}\n${results.slice(0, 8).map((item, index) => { const durable = item.itemType === "text" || item.itemType === "link" || Boolean(item.storageKey); return `${index + 1}. ${item.title} ${durable ? "✓ เก็บถาวร" : "⚠️ ต้องอัปโหลดไฟล์ซ้ำ"}`; }).join("\n")}` : `ยังไม่พบรายการ “${command.query}” ในแชทนี้`;
  } else if (command.type === "mention") {
    const member = await db.findLineMemberByName(lineChatId, command.memberName);
    if (member && event.replyToken) {
      await replyMention(event.replyToken, command.message, member.lineUserId);
      return;
    }
    message = `ยังไม่พบสมาชิกชื่อ “${command.memberName}” ในข้อมูลของกลุ่ม ลองให้สมาชิกส่งข้อความหาไมโลก่อนครับ`;
  } else if (command.type === "budget") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "สิทธิ์ของคุณยังตั้งงบประมาณในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const startDay = await db.getFinanceAccountBudgetCycleStartDay(financeScope!.financeAccountId);
    const cycle = budgetCycleWindow(new Date(), startDay);
    await db.upsertBudget(lineUserId, command.category, command.amount, cycle.key, financeScope!.financeAccountId);
    message = `ตั้งงบหมวด${command.category} ${command.amount.toLocaleString("th-TH")} บาท สำหรับรอบ ${formatBudgetCycleLabel(new Date(), startDay)} แล้ว`;
  } else if (command.type === "budgetCycleStart") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "สิทธิ์ของคุณยังตั้งวันเริ่มรอบงบในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const updated = await db.updateFinanceAccountBudgetCycleStartDay(financeScope!.financeAccountId, command.day);
    if (!updated) message = "ไม่สามารถตั้งวันเริ่มรอบงบได้";
    else {
      await db.writeAuditLog({ action: "finance_budget_cycle.update", entityType: "finance_account", entityId: financeScope!.financeAccountId, actorLineUserId: lineUserId, lineChatId, details: { startDay: updated } });
      message = `ตั้งวันเริ่มรอบงบเป็นวันที่ ${updated} ของทุกเดือนแล้ว\nรอบปัจจุบัน: ${formatBudgetCycleLabel(new Date(), updated)}`;
    }
  } else if (command.type === "recurringCreate") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "สิทธิ์ของคุณยังตั้งรายการอัตโนมัติในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    let category = command.category;
    if (command.transactionType === "expense" && category === "ทั่วไป") {
      try {
        const customCategories = (await db.listExpenseCategories(lineUserId, "expense", financeScope!.financeAccountId)).map(item => item.name);
        category = (await suggestExpenseCategory(command.note, Array.from(new Set([...STANDARD_EXPENSE_CATEGORIES, ...customCategories])))).category;
      } catch { /* deterministic category remains */ }
    }
    try {
      assertRecurringCapacity(await db.listRecurringTransactions(lineUserId, financeScope!.financeAccountId));
    } catch (error) {
      message = error instanceof Error ? error.message : "ตั้งรายการอัตโนมัติไม่ได้";
      if (event.replyToken) await replyText(event.replyToken, message);
      return;
    }
    const id = await db.createRecurringTransaction({ lineUserId, lineChatId, financeAccountId: financeScope!.financeAccountId, transactionType: command.transactionType, amount: command.amount, category, note: command.note, recurrenceType: command.recurrenceType, recurrenceInterval: command.recurrenceInterval, recurrenceWeekday: command.recurrenceWeekday, recurrenceDayOfMonth: command.recurrenceDayOfMonth, nextRunAt: command.nextRunAt });
    await db.writeAuditLog({ action: "recurring_transaction.create", entityType: "recurring_transaction", entityId: id, actorLineUserId: lineUserId, lineChatId, details: { financeAccountId: financeScope!.financeAccountId, transactionType: command.transactionType, category, amount: command.amount, recurrenceType: command.recurrenceType } });
    message = `ตั้งรายการประจำ #${id} แล้ว\n${command.transactionType === "income" ? "รายรับ" : "รายจ่าย"} ${command.note} ${command.amount.toLocaleString("th-TH")} บาท • หมวด${category}\nครั้งถัดไป: ${formatDate(command.nextRunAt)}`;
  } else if (command.type === "recurringList") {
    const items = await db.listRecurringTransactions(lineUserId, financeScope!.financeAccountId);
    message = items.length ? `รายการประจำ\n${items.slice(0, 20).map(item => `#${item.id} • ${item.status === "active" ? "เปิด" : item.status === "paused" ? "พัก" : "ยกเลิก"} • ${item.transactionType === "income" ? "รายรับ" : "รายจ่าย"} ${Number(item.amount).toLocaleString("th-TH")} บาท • ${item.category} • ถัดไป ${formatDate(item.nextRunAt)}`).join("\n")}` : "ยังไม่มีรายการประจำที่ตั้งไว้";
  } else if (command.type === "recurringStatus") {
    if (!db.canManageFinanceSettings(financeScope!.role)) { message = "สิทธิ์ของคุณยังปรับรายการอัตโนมัติในสมุดบัญชีนี้ไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const updated = await db.updateRecurringTransactionStatus(command.id, lineUserId, command.status, financeScope!.financeAccountId);
    message = updated ? `อัปเดตรายการประจำ #${command.id} เป็น ${command.status === "active" ? "เปิดใช้งาน" : command.status === "paused" ? "พักไว้" : "ยกเลิก"} แล้ว` : `ไม่พบรายการประจำ #${command.id}`;
  } else if (command.type === "exportFinance") {
    const url = buildFinanceExportUrl({ lineUserId, financeAccountId: financeScope!.financeAccountId, format: command.format });
    message = `ส่งออกข้อมูล ${command.format === "csv" ? "CSV" : "Excel"} ได้จากลิงก์นี้ภายใน 10 นาที\n${url}`;
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
  } else if (command.type === "imageEdit") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) { message = "สิทธิ์ของคุณในสมุดบัญชีนี้เป็นผู้ดู จึงยังแก้ข้อเสนอรายการไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const latest = await db.latestImageExtraction(lineUserId, lineChatId);
    if (!latest || latest.extraction.status !== "proposed" || latest.vault.mimeType === "application/pdf") {
      message = "ยังไม่มีใบเสร็จหรือสลิปที่วิเคราะห์แล้วและรอแก้ไข กรุณาส่งรูปก่อนครับ";
    } else {
      try {
        const analysis = JSON.parse(latest.extraction.extractedJson);
        const edited = applyImageExpenseEdit(analysis, command);
        const persisted = { ...edited }; delete (persisted as any).editedProposal;
        const updated = await db.updateProposedImageExtractionJson(latest.extraction.id, JSON.stringify(persisted));
        if (!updated) message = "รายการนี้ไม่อยู่ในสถานะที่แก้ไขได้แล้ว กรุณาส่งรูปใหม่ครับ";
        else {
          const proposal = edited.editedProposal;
          const dateLine = proposal.dateText ? "\nวันที่: " + proposal.dateText : "";
          message = "แก้ข้อเสนอจากรูปแล้ว ✅\n" + formatImageProposal(proposal) + dateLine + "\nยังไม่บันทึก กรุณาตรวจอีกครั้งแล้วพิมพ์ “ยืนยันค่าใช้จ่าย”";
        }
      } catch (error) { message = error instanceof Error ? error.message : "แก้ข้อมูลจากรูปไม่สำเร็จ"; }
    }
  } else if (command.type === "pdfConfirm") {
    if (!db.canCreateFinanceTransaction(financeScope!.role)) { message = "สิทธิ์ของคุณในสมุดบัญชีนี้เป็นผู้ดู จึงยังยืนยันรายการไม่ได้"; if (event.replyToken) await replyText(event.replyToken, message); return; }
    const latest = await db.latestImageExtraction(lineUserId, lineChatId);
    if (!latest || latest.extraction.status !== "proposed" || latest.vault.mimeType !== "application/pdf") {
      message = "ยังไม่มี PDF ที่วิเคราะห์แล้วและรอยืนยัน กรุณาส่งไฟล์ PDF ก่อนครับ";
    } else {
      const analysis = JSON.parse(latest.extraction.extractedJson) as { proposals?: Array<Record<string, unknown>> };
      const proposals = (analysis.proposals ?? []).filter(item => item.kind === "expense" && Number(item.amount ?? 0) > 0).slice(0, 100);
      let created = 0; let skipped = 0;
      for (let proposalIndex = 0; proposalIndex < proposals.length; proposalIndex += 1) {
        const raw = proposals[proposalIndex];
        const proposal = raw as any;
        const occurredAt = parseExtractedDate(String(proposal.dateText ?? ""), String(proposal.timeText ?? ""));
        if (!occurredAt) { skipped += 1; continue; }
        const amount = Number(proposal.amount);
        const category = normalizeExpenseCategory(String(proposal.category ?? ""), `${proposal.title ?? ""} ${proposal.merchant ?? ""} ${proposal.note ?? ""}`);
        const transactionId = await db.createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope!.financeAccountId, transactionType: "expense", amount, category, note: buildExpenseNote(proposal), occurredAt, source: "line_pdf", sourceMessageId: latest.vault.lineMessageId ? `${latest.vault.lineMessageId}:pdf:${proposalIndex}` : `pdf-extraction:${latest.extraction.id}:${proposalIndex}` });
        await db.linkTransactionAttachment({ transactionId, vaultItemId: latest.vault.id, lineUserId, label: "PDF ต้นฉบับ" });
        created += 1;
      }
      if (created > 0) await db.setImageExtractionStatus(latest.extraction.id, "accepted");
      message = created > 0 ? `บันทึกรายจ่ายจาก PDF แล้ว ${created} รายการ${skipped ? " • ข้าม " + skipped + " รายการที่วันที่ไม่ชัด" : ""}` : "PDF นี้ยังไม่มีรายการที่มีวันที่และยอดชัดเจนพอสำหรับบันทึก";
    }
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
        const referenceDate = latest.vault.createdAt
          ? new Date(latest.vault.createdAt)
          : (Number.isFinite(event.timestamp) ? new Date(event.timestamp) : undefined);
        const resolvedDate = resolveReceiptOccurredAt(command.dateText ?? proposal.dateText, proposal.timeText, referenceDate);
        const occurredAt = resolvedDate?.occurredAt;
        if (!occurredAt) {
          message = `อ่านยอด ${amount.toLocaleString("th-TH")} บาทได้ แต่วันที่ใน${proposal.documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ"}ไม่ชัด และไม่มีเวลาที่น่าเชื่อถือพอสำหรับอ้างอิงวันที่ส่งรูป จึงยังไม่บันทึก\nกรุณาพิมพ์ “ยืนยันค่าใช้จ่าย วันที่ 27/08/2569” โดยแทนวันที่จริง`;
        } else {
          const baseNote = buildExpenseNote(proposal);
          const note = resolvedDate.source === "upload-date"
            ? [baseNote, "วันที่อ้างอิงจากวันที่ส่งรูป เนื่องจาก OCR อ่านวันที่บนเอกสารไม่ชัด"].filter(Boolean).join(" | ")
            : baseNote;
          const transactionId = await db.createTransaction({ lineChatId, lineUserId, financeAccountId: financeScope!.financeAccountId, transactionType: "expense", amount, category, note, occurredAt, source: "line_image", sourceMessageId: latest.vault.lineMessageId ?? `image-extraction:${latest.extraction.id}` });
          await db.linkTransactionAttachment({ transactionId, vaultItemId: latest.vault.id, lineUserId, label: proposal.documentType === "bank_slip" ? "สลิปต้นฉบับ" : "ใบเสร็จต้นฉบับ" });
          await db.setImageExtractionStatus(latest.extraction.id, "accepted");
          if (event.replyToken) { await sendPostSaveSummary(event.replyToken, lineUserId, lineChatId, financeScope!.financeAccountId, { transactionType: "expense", amount, category, note, occurredAt }); return; }
          message = `บันทึกรายจ่ายจาก${proposal.documentType === "bank_slip" ? "สลิป" : "ใบเสร็จ"} ${amount.toLocaleString("th-TH")} บาท ในหมวด${category}แล้ว`;
        }
      } else {
        const proposed = parseMiloCommand(`เตือน ${proposal.title} ${proposal.dateText} ${proposal.timeText}`);
        if (proposed.type === "reminder") {
          if (!hasMiloEntitlement(plan, "reminders")) {
            message = entitlementMessage("reminders");
          } else {
            const id = await db.createReminder({ lineChatId, createdByLineUserId: lineUserId, ...proposed.data, sourceImageKey: latest.vault.storageKey ?? undefined });
            await db.setImageExtractionStatus(latest.extraction.id, "accepted");
            message = `สร้างรายการเตือนจากรูป #${id} แล้ว: ${proposed.data.title}`;
          }
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
    const startDay = await db.getFinanceAccountBudgetCycleStartDay(financeScope!.financeAccountId);
    const report = await db.financeBudgetCycleReport(lineUserId, new Date(), financeScope!.financeAccountId);
    const budgets = await db.listBudgets(lineUserId, report.key, financeScope!.financeAccountId);
    message = budgets.length ? `📊 งบประมาณรอบ ${formatBudgetCycleLabel(new Date(), startDay)}\n` + budgets.slice(0, 10).map(item => `• ${item.category}: ใช้ไป ${(report.categories[item.category] ?? 0).toLocaleString("th-TH")} / งบ ${Number(item.amount).toLocaleString("th-TH")} บาท`).join("\n") : `📊 ยังไม่มีงบประมาณที่ตั้งไว้ในรอบ ${formatBudgetCycleLabel(new Date(), startDay)}\nตัวอย่าง: ตั้งงบ อาหาร 5000\nเปลี่ยนวันเริ่มรอบ: ตั้งวันเริ่มงบ 14`;
  } else if (command.type === "transactionList") {
    const results = await db.searchTransactions(lineUserId, "", 10, financeScope!.financeAccountId);
    message = results.length ? "📋 รายการล่าสุด\n" + results.map(item => `#${item.id} • ${item.transactionType === "expense" ? "รายจ่าย" : "รายรับ"} ${Number(item.amount).toLocaleString("th-TH")} บาท • ${item.category}`).join("\n") : "📋 ยังไม่มีรายการธุรกรรมครับ";
  } else if (command.type === "greeting") {
    message = "สวัสดีครับ 👋 ผมไมโล ผู้ช่วยการเงินของคุณ\nพร้อมช่วยจดรายรับรายจ่าย อ่านสลิป/ใบเสร็จ ฟังข้อความเสียง ดูสรุป และคุมงบให้ครับ";
    if (event.replyToken) { await replyGreetingHome(event.replyToken); return; }
  } else if (command.type === "help") {
    message = helpText();
  } else {
    if (event.replyToken) {
      const fallback = contextualFallback(text);
      await replyTextWithQuickReplies(event.replyToken, fallback.text, fallback.actions);
      return;
    }
    message = "ไมโลยังไม่เข้าใจคำสั่งนี้ครับ";
  }
  if (event.replyToken) {
    const artwork = artworkForCommand(command);
    if (artwork) {
      try { await replyRichMenu(event.replyToken, message, artwork); }
      catch { await replyText(event.replyToken, message); }
    } else await replyText(event.replyToken, message);
  }
}

type MediaRuntimeContext = { gatewayToken?: string; senderDisplayName?: string };

class MediaProcessingError extends Error {
  constructor(message: string, readonly userNotified: boolean) {
    super(message);
    this.name = "MediaProcessingError";
  }
}

function mediaErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "unknown media error").slice(0, 1500);
}

async function handleMedia(event: LineEvent, lineChatId: string, lineUserId: string, scope: LineFinanceScope, runtime: MediaRuntimeContext = {}) {
  const message = event.message;
  if (!message) return;
  const isImage = message.type === "image";
  const isAudio = message.type === "audio";
  const isPdf = message.type === "file" && /\.pdf$/i.test(message.fileName ?? "");
  const plan = resolveMiloPlan(lineUserId, process.env, await db.isAdminLinkedLineUser(lineUserId));
  if (isPdf && !hasMiloEntitlement(plan, "pdf")) { if (event.replyToken) await replyText(event.replyToken, entitlementMessage("pdf")); return; }
  if (scope !== "user" && (isImage || isAudio || isPdf) && !hasMiloEntitlement(plan, "groupAccounting")) { if (event.replyToken) await replyText(event.replyToken, entitlementMessage("groupAccounting")); return; }
  const mimeType = isImage ? "image/jpeg" : isAudio ? "audio/m4a" : isPdf ? "application/pdf" : "application/octet-stream";
  let bytes: Buffer;
  try {
    bytes = await getMessageContent(message.id);
  } catch (error) {
    console.error("[Milo Media] LINE download failed", { messageId: message.id, type: message.type, error: error instanceof Error ? error.message : "unknown" });
    const fallback = isAudio
      ? "รับข้อความเสียงแล้ว แต่ดาวน์โหลดไฟล์จาก LINE ไม่สำเร็จในครั้งนี้ กรุณาลองส่งเสียงใหม่อีกครั้งครับ"
      : isPdf
        ? "รับ PDF แล้ว แต่ดาวน์โหลดไฟล์จาก LINE ไม่สำเร็จในครั้งนี้ กรุณาลองส่งไฟล์ใหม่อีกครั้งครับ"
        : isImage
          ? "รับรูปแล้ว แต่ดาวน์โหลดรูปจาก LINE ไม่สำเร็จในครั้งนี้ กรุณาลองส่งภาพใหม่อีกครั้งครับ"
          : "รับไฟล์แล้ว แต่ดาวน์โหลดจาก LINE ไม่สำเร็จในครั้งนี้ กรุณาลองใหม่ครับ";
    if (event.replyToken) {
      try {
        await replyText(event.replyToken, fallback);
        throw new MediaProcessingError(mediaErrorMessage(error), true);
      }
      catch (replyError) {
        if (replyError instanceof MediaProcessingError) throw replyError;
        console.error("[Milo Media] download fallback reply failed", { messageId: message.id, error: replyError instanceof Error ? replyError.message : "unknown" });
      }
    }
    let userNotified = false;
    try { await pushText(lineChatId, fallback); userNotified = true; }
    catch (pushError) { console.error("[Milo Media] download fallback push failed", { messageId: message.id, error: pushError instanceof Error ? pushError.message : "unknown" }); }
    throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
  }

  const fingerprint = fingerprintMedia(bytes);
  const duplicate = await db.findVaultItemByFingerprint(lineChatId, fingerprint).catch(() => undefined);
  if (duplicate) {
    try {
      await db.writeAuditLog({
        action: "vault.duplicate.detected",
        entityType: "vault_item",
        entityId: duplicate.id,
        actorLineUserId: lineUserId,
        lineChatId,
        details: { duplicateLineMessageId: message.id, fingerprint },
      });
    } catch { /* duplicate handling must still reply even if audit logging is unavailable */ }
    const duplicateMessage = `ไฟล์นี้มีอยู่ในคลังแล้วครับ • #${duplicate.id} ${duplicate.title}\nไมโลจึงไม่เก็บซ้ำและไม่สร้างรายการการเงินซ้ำ`;
    if (event.replyToken) await replyText(event.replyToken, duplicateMessage);
    else await pushText(lineChatId, duplicateMessage);
    return;
  }

  let stored: Awaited<ReturnType<typeof storagePut>> | undefined;
  try {
    stored = await storagePut(`milo/${lineChatId}/${message.id}`, bytes, mimeType);
  } catch (error) {
    console.warn("[Milo Media] permanent storage unavailable; continuing from LINE bytes", {
      messageId: message.id, type: message.type, error: error instanceof Error ? error.message : "unknown",
    });
  }

  let vaultId: number;
  try {
    const existing = await db.findVaultItemByLineMessageId(message.id, lineUserId, lineChatId);
    vaultId = existing?.id ?? await db.createVaultItem({
        lineChatId,
        createdByLineUserId: lineUserId,
        itemType: isImage ? "image" : "file",
        title: message.fileName ?? (isImage ? "รูปจาก LINE" : isAudio ? "ข้อความเสียงจาก LINE" : "ไฟล์จาก LINE"),
        searchableText: [message.fileName, runtime.senderDisplayName].filter(Boolean).join(" "),
        tagsText: mergeVaultTags(
          `#doc:${isImage || isAudio || isPdf ? "processing" : stored?.key ? "stored" : "storage_missing"}`,
          `#kind:${classifyDocumentKind({ filename: message.fileName, mimeType })}`,
          `#sha256:${fingerprint}`,
        ),
        originalFilename: message.fileName,
        mimeType,
        storageKey: stored?.key,
        storageUrl: stored?.url,
        lineMessageId: message.id,
      });
  } catch (error) {
    console.error("[Milo Media] vault metadata failed", { messageId: message.id, type: message.type, error: error instanceof Error ? error.message : "unknown" });
    const fallback = isAudio
      ? "รับข้อความเสียงแล้ว แต่ยังเตรียมรายการสำหรับตรวจสอบไม่ได้ในครั้งนี้ กรุณาลองส่งเสียงใหม่อีกครั้งครับ"
      : isImage
        ? "รับรูปแล้ว แต่ยังเตรียมรายการสำหรับตรวจสอบไม่ได้ในครั้งนี้ กรุณาลองส่งภาพใหม่อีกครั้งครับ"
        : "รับไฟล์แล้ว แต่ยังเตรียมรายการสำหรับตรวจสอบไม่ได้ในครั้งนี้ กรุณาลองใหม่ครับ";
    if (event.replyToken) {
      try {
        await replyText(event.replyToken, fallback);
        throw new MediaProcessingError(mediaErrorMessage(error), true);
      } catch (replyError) {
        if (replyError instanceof MediaProcessingError) throw replyError;
      }
    }
    let userNotified = false;
    try { await pushText(lineChatId, fallback); userNotified = true; } catch {}
    throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
  }

  if (isAudio) {
    // Acknowledge immediately. Transcription can take several seconds and the LINE reply token
    // must not be held until the provider completes. The final proposal is pushed afterwards.
    if (event.replyToken) {
      try { await replyText(event.replyToken, "รับข้อความเสียงแล้วครับ กำลังถอดเสียงและแยกรายการเงินให้ ขอเวลาสักครู่นะครับ"); }
      catch (error) { console.error("[Milo Voice] acknowledgement reply failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" }); }
    }
    try {
      const transcript = await transcribeAudio({ audioBuffer: bytes, mimeType, language: "th", prompt: "ถอดข้อความภาษาไทยเกี่ยวกับรายรับ รายจ่าย จำนวนเงิน และหมวดหมู่", gatewayToken: runtime.gatewayToken });
      if ("error" in transcript) throw new Error(`${transcript.error}${transcript.details ? `: ${transcript.details}` : ""}`);
      const financeScope = await resolveFinanceScope(lineUserId, lineChatId, scope);
      const proposal = await buildVoiceProposal(transcript.text, lineUserId, financeScope?.financeAccountId);
      await db.saveVoiceTranscription({ vaultItemId: vaultId, lineChatId, lineUserId, transcript: transcript.text, language: transcript.language, durationSeconds: transcript.duration, proposalJson: JSON.stringify(proposal) });
      await persistDocumentIntelligence({
        vaultId, lineUserId, lineChatId, filename: message.fileName, mimeType,
        storageReady: Boolean(stored?.key), fingerprint, senderDisplayName: runtime.senderDisplayName,
        analysis: { summary: transcript.text, confidence: 1, proposals: [{ documentType: "audio", title: transcript.text }] },
      });
      const proposalLine = proposal.transactionType && proposal.amount
        ? `เสนอ${proposal.transactionType === "expense" ? "รายจ่าย" : "รายรับ"} ${proposal.amount.toLocaleString("th-TH")} บาท • หมวด${proposal.category ?? "ทั่วไป"}`
        : "ยังไม่พบรูปแบบรายรับ/รายจ่ายที่แน่ชัด";
      const canConfirm = Boolean(proposal.transactionType && proposal.amount);
      const nextStep = canConfirm ? "ตรวจรายละเอียดแล้วกด “ยืนยันบันทึก” ได้เลยน่ะจ๊ะ" : "ยังบันทึกไม่ได้ กรุณากดแก้ไขข้อความให้มีรายการและจำนวนเงิน เช่น “ค่ากาแฟ 40 บาท” น่ะจ๊ะ";
      const storageNote = stored?.key ? "" : "\n⚠️ ไฟล์เสียงต้นฉบับยังสำรองถาวรไม่สำเร็จ กรุณาส่งใหม่หากต้องการเก็บไฟล์ต้นฉบับ";
      await pushTextWithQuickReplies(lineChatId, `ถอดเสียงได้ว่า\n“${proposal.transcript.slice(0, 900)}”\n${proposalLine}\n${nextStep}${storageNote}`, [...(canConfirm ? [{ label: "ยืนยันบันทึก", text: "ยืนยันเสียง" }] : []), { label: "แก้ไขข้อความ", text: "แก้ไขข้อความเสียง" }]);
    } catch (error) {
      console.error("[Milo Voice] transcription failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
      await persistDocumentIntelligence({
        vaultId, lineUserId, lineChatId, filename: message.fileName, mimeType,
        storageReady: Boolean(stored?.key), fingerprint, senderDisplayName: runtime.senderDisplayName, error,
      });
      const runtimeMissing = error instanceof Error && /not configured|valid credit card|payment required|insufficient.*(?:credit|quota)|billing/i.test(error.message);
      const fallback = runtimeMissing
        ? "รับข้อความเสียงแล้ว แต่บริการถอดเสียงยังไม่พร้อมใช้งาน ต้องแก้การตั้งค่าบริการก่อน ตอนนี้กรุณาพิมพ์รายการแทน เช่น “ค่ากาแฟ 40 บาท” น่ะจ๊ะ"
        : "รับข้อความเสียงแล้ว แต่ยังถอดเสียงไม่ได้ในครั้งนี้ ยังไม่มีการบันทึกรายการ กรุณาพิมพ์รายการแทนชั่วคราวน่ะจ๊ะ";
      let userNotified = false;
      try { await pushText(lineChatId, fallback); userNotified = true; }
      catch (pushError) { console.error("[Milo Voice] failure notification failed", { messageId: message.id, error: pushError instanceof Error ? pushError.message : "unknown" }); }
      throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
    }
    return;
  }
  if (isPdf) {
    try {
      const analysis = await analyzePdfBuffer(bytes);
      await db.saveImageExtraction(vaultId, "expense", JSON.stringify(analysis), analysis.confidence);
      await persistDocumentIntelligence({
        vaultId, lineUserId, lineChatId, filename: message.fileName, mimeType,
        storageReady: Boolean(stored?.key), fingerprint, senderDisplayName: runtime.senderDisplayName, analysis,
      });
      const preview = analysis.proposals.slice(0, 5).map(item => `• ${formatImageProposal(item)}`).join("\n");
      const more = analysis.proposals.length > 5 ? `\n…และอีก ${analysis.proposals.length - 5} รายการ` : "";
      const storageNote = stored?.key ? "" : "\n⚠️ PDF ต้นฉบับยังสำรองถาวรไม่สำเร็จ กรุณาส่งไฟล์ใหม่หากต้องการเก็บต้นฉบับ";
      if (event.replyToken) await replyText(event.replyToken, `อ่าน PDF แล้ว พบรายการที่เสนอได้ ${analysis.proposals.length} รายการ\n${preview || "ยังไม่พบรายจ่ายที่อ่านได้ชัด"}${more}\nตรวจข้อมูลก่อน แล้วพิมพ์ “ยืนยัน PDF” เพื่อบันทึกเฉพาะรายการที่วันที่และยอดชัดเจน${storageNote}`);
    } catch (error) {
      console.error("[Milo PDF] analysis failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
      await persistDocumentIntelligence({
        vaultId, lineUserId, lineChatId, filename: message.fileName, mimeType,
        storageReady: Boolean(stored?.key), fingerprint, senderDisplayName: runtime.senderDisplayName, error,
      });
      const fallback = "เก็บ PDF ไว้แล้ว แต่ยังอ่านธุรกรรมจากไฟล์นี้ไม่ได้ กรุณาลองไฟล์ที่ไม่ล็อกรหัสและมีข้อความอ่านได้ครับ";
      let userNotified = false;
      if (event.replyToken) {
        try { await replyText(event.replyToken, fallback); userNotified = true; }
        catch { try { await pushText(lineChatId, fallback); userNotified = true; } catch {} }
      } else {
        try { await pushText(lineChatId, fallback); userNotified = true; } catch {}
      }
      throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
    }
    return;
  }
  if (!isImage) {
    await persistDocumentIntelligence({
      vaultId, lineUserId, lineChatId, filename: message.fileName, mimeType,
      storageReady: Boolean(stored?.key), fingerprint, senderDisplayName: runtime.senderDisplayName,
    });
    if (event.replyToken) await replyText(event.replyToken, stored?.key ? "เก็บไฟล์นี้ไว้ในคลังถาวรจนกว่าคุณจะลบแล้ว" : "รับไฟล์แล้ว แต่พื้นที่เก็บถาวรยังสำรองไฟล์ต้นฉบับไม่สำเร็จ กรุณาส่งไฟล์นี้ใหม่อีกครั้งครับ");
    return;
  }
  // Acknowledge immediately so the user is not blocked by a slow vision call and the LINE reply token is consumed safely.
  if (event.replyToken) {
    try { await replyText(event.replyToken, "รับรูปแล้วครับ กำลังอ่านสลิป/ใบเสร็จให้ ขอเวลาสักครู่น่ะจ๊ะ"); }
    catch (error) { console.error("[Milo Image] acknowledgement reply failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" }); }
  }
  try {
    const analysis = await analyzeImage(`data:${mimeType};base64,${bytes.toString("base64")}`, { gatewayToken: runtime.gatewayToken });
    await db.saveImageExtraction(vaultId, analysis.proposals.some(item => item.kind === "expense") ? "expense" : "reminder", JSON.stringify(analysis), analysis.confidence);
    await persistDocumentIntelligence({
      vaultId, lineUserId, lineChatId, filename: message.fileName, mimeType,
      storageReady: Boolean(stored?.key), fingerprint, senderDisplayName: runtime.senderDisplayName, analysis,
    });
    const proposals = analysis.proposals.slice(0, 2).map(item => `• ${formatImageProposal(item)}`).join("\n");
    const hasExpense = analysis.proposals.some(item => item.kind === "expense" && item.amount > 0);
    const storageNote = stored?.key ? "" : "\n⚠️ รูปต้นฉบับยังสำรองถาวรไม่สำเร็จ กรุณาส่งใหม่หากต้องการเก็บต้นฉบับ";
    await pushTextWithQuickReplies(lineChatId, `อ่านรูปเรียบร้อยแล้ว\n${analysis.summary}\n${proposals || "ยังไม่พบรายการที่ควรบันทึกอัตโนมัติ"}\nตรวจยอด หมวด และวันที่ให้ถูกต้อง แล้วกดปุ่มยืนยันได้เลยครับ${storageNote}`, hasExpense ? [{ label: "ยืนยันบันทึก", text: "ยืนยันค่าใช้จ่าย" }, { label: "สรุปวันนี้", text: "สรุปวันนี้" }] : [{ label: "ยืนยันรูป", text: "ยืนยันรูป" }]);
  } catch (error) {
    console.error("[Milo Image] analysis failed", { messageId: message.id, error: error instanceof Error ? error.message : "unknown" });
    await persistDocumentIntelligence({
      vaultId, lineUserId, lineChatId, filename: message.fileName, mimeType,
      storageReady: Boolean(stored?.key), fingerprint, senderDisplayName: runtime.senderDisplayName,
      error: error instanceof Error ? new Error(`OCR อ่านภาพไม่ชัด: ${error.message}`) : error,
    });
    let userNotified = false;
    try {
      await pushText(lineChatId, "เก็บรูปไว้แล้ว แต่ระบบอ่านสลิป/ใบเสร็จครั้งนี้ไม่สำเร็จ กรุณาลองส่งภาพที่คมชัดและเห็นยอด วันที่ เวลา และผู้รับครบถ้วนอีกครั้งน่ะจ๊ะ");
      userNotified = true;
    } catch (pushError) {
      console.error("[Milo Image] failure notification failed", { messageId: message.id, error: pushError instanceof Error ? pushError.message : "unknown" });
    }
    throw new MediaProcessingError(mediaErrorMessage(error), userNotified);
  }
}

export async function processEvent(event: LineEvent, rawPayload: string, runtime: MediaRuntimeContext = {}) {
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
    else if (event.message.type === "image" || event.message.type === "file" || event.message.type === "audio") await handleMedia(event, identity.lineChatId, identity.lineUserId, identity.scope, { ...runtime, senderDisplayName: profile?.displayName });
    await db.finishWebhookEvent(event.webhookEventId, "processed");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "unknown error";
    const mediaType = event.type === "message" ? event.message?.type : undefined;
    const isMediaEvent = mediaType === "image" || mediaType === "audio" || mediaType === "file";
    if (isMediaEvent) {
      const fallback = mediaType === "audio"
        ? "รับข้อความเสียงแล้ว แต่ระบบประมวลผลครั้งนี้ไม่สำเร็จ กรุณาลองส่งเสียงใหม่อีกครั้งครับ"
        : mediaType === "image"
          ? "รับรูปแล้ว แต่ระบบประมวลผลสลิป/ใบเสร็จครั้งนี้ไม่สำเร็จ กรุณาลองส่งภาพใหม่อีกครั้งครับ"
          : "รับไฟล์แล้ว แต่ระบบประมวลผลครั้งนี้ไม่สำเร็จ กรุณาลองส่งไฟล์ใหม่อีกครั้งครับ";
      let delivered = error instanceof MediaProcessingError && error.userNotified;
      if (!delivered) {
        if (event.replyToken) {
          try { await replyText(event.replyToken, fallback); delivered = true; }
          catch (replyError) { console.error("[Milo Media] top-level fallback reply failed", { error: replyError instanceof Error ? replyError.message : "unknown" }); }
        }
        if (!delivered) {
          try { await pushText(identity.lineChatId, fallback); delivered = true; }
          catch (pushError) { console.error("[Milo Media] top-level fallback push failed", { error: pushError instanceof Error ? pushError.message : "unknown" }); }
        }
      }
      try { await db.finishWebhookEvent(event.webhookEventId, "failed", errorMessage); }
      catch (auditError) { console.error("[Milo Media] failed to record webhook failure", { error: auditError instanceof Error ? auditError.message : "unknown" }); }
      return;
    }
    await db.finishWebhookEvent(event.webhookEventId, "failed", errorMessage);
    throw error;
  }
}

export function registerLineWebhook(app: Express) {
  app.post("/api/line/webhook", express.raw({ type: "*/*", limit: "2mb" }), async (req: Request, res: Response) => {
    const raw = req.body as Buffer;
    const credentials = lineCredentials();
    if (!verifyLineSignature(raw, req.header("x-line-signature"), credentials.channelSecret)) return res.status(401).json({ error: "invalid signature" });
    let payload: { events?: LineEvent[] };
    try { payload = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "invalid json" }); }
    try {
      const runtime = { gatewayToken: req.header("x-vercel-oidc-token")?.trim() || undefined };
      await Promise.all((payload.events ?? []).map(event => processEvent(event, raw.toString("utf8"), runtime)));
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
