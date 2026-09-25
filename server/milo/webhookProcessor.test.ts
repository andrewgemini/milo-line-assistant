import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

vi.mock("../db", () => ({
  registerWebhookEvent: vi.fn(),
  claimWebhookEvent: vi.fn(),
  listRecoverableWebhookEvents: vi.fn(),
  ensureMiloOnboardingSchema: vi.fn(),
  getMiloOnboarding: vi.fn(),
  startMiloOnboarding: vi.fn(),
  updateMiloOnboarding: vi.fn(),
  completeMiloOnboarding: vi.fn(),
  ensureCaptureSchema: vi.fn(),
  upsertLineChat: vi.fn(),
  upsertLineMember: vi.fn(),
  finishWebhookEvent: vi.fn(),
  deferWebhookEvent: vi.fn(),
  findLineMemberByName: vi.fn(),
  createReminder: vi.fn(),
  listRemindersForChat: vi.fn(),
  cancelReminderForChat: vi.fn(),
  createCalendarEvent: vi.fn(),
  listCalendarEvents: vi.fn(),
  listCalendarEventsForRange: vi.fn(),
  createCaptureDraft: vi.fn(),
  latestProposedCaptureDraft: vi.fn(),
  finishCaptureDraft: vi.fn(),
  createPendingBill: vi.fn(),
  listPendingBillsForChat: vi.fn(),
  getPendingBillForAction: vi.fn(),
  markPendingBillPaid: vi.fn(),
  cancelPendingBill: vi.fn(),
  cancelCalendarEvent: vi.fn(),
  createTransaction: vi.fn(),
  deleteLatestTransaction: vi.fn(),
  linkTransactionAttachment: vi.fn(),
  createNote: vi.fn(),
  createTodo: vi.fn(),
  listTodosForChat: vi.fn(),
  completeTodoForChat: vi.fn(),
  createVaultItem: vi.fn(),
  findVaultItemByLineMessageId: vi.fn(),
  findVaultItemByFingerprint: vi.fn(),
  canReprocessVaultMedia: vi.fn(async () => false),
  listVaultDocumentsForChat: vi.fn(),
  updateVaultIntelligence: vi.fn(),
  searchVault: vi.fn(),
  searchVaultForChat: vi.fn(),
  vaultStorageStatus: vi.fn(),
  addExpenseCategory: vi.fn(),
  listExpenseCategories: vi.fn(),
  listTransactionCategories: vi.fn(),
  saveImageExtraction: vi.fn(),
  latestImageExtraction: vi.fn(),
  setImageExtractionStatus: vi.fn(),
  updateProposedImageExtractionJson: vi.fn(),
  saveVoiceTranscription: vi.fn(),
  latestProposedVoiceTranscription: vi.fn(),
  updateVoiceTranscriptionStatus: vi.fn(),
  updateVoiceTranscript: vi.fn(),
  resolveFinanceAccountForLineEvent: vi.fn(),
  isAdminLinkedLineUser: vi.fn(),
  canCreateFinanceTransaction: vi.fn(() => true),
  canManageFinanceTransactions: vi.fn(() => true),
  canManageFinanceSettings: vi.fn(() => true),
  financeReport: vi.fn(), financeBudgetCycleReport: vi.fn(), getFinanceAccountBudgetCycleStartDay: vi.fn(() => 1), updateFinanceAccountBudgetCycleStartDay: vi.fn(), upsertBudget: vi.fn(), listBudgets: vi.fn(() => []), listTransactions: vi.fn(), searchTransactions: vi.fn(), createRecurringTransaction: vi.fn(), listRecurringTransactions: vi.fn(), updateRecurringTransactionStatus: vi.fn(), writeAuditLog: vi.fn(),
}));
vi.mock("../storage", () => ({ storageGetSignedUrl: vi.fn(), storagePut: vi.fn() }));
vi.mock("./imageAnalysis", () => ({ analyzeImage: vi.fn() }));
vi.mock("./pdfAnalysis", () => ({ analyzePdfBuffer: vi.fn() }));
vi.mock("./financeExport", () => ({ buildFinanceExportUrl: vi.fn(() => "https://example.com/export") }));
vi.mock("./googleCalendar", () => ({
  buildGoogleCalendarConnectUrl: vi.fn(() => "https://example.com/connect-calendar"),
  disconnectGoogleCalendar: vi.fn(async () => true),
  googleCalendarConnectionStatus: vi.fn(async () => ({ configured: true, connected: true })),
  syncGoogleCalendarEventCreate: vi.fn(async () => ({ synced: true })),
  syncGoogleCalendarEventDelete: vi.fn(async () => ({ synced: true })),
}));
vi.mock("../_core/voiceTranscription", () => ({ transcribeAudio: vi.fn() }));
vi.mock("./financialAssistant", () => ({ generateFinancialInsight: vi.fn(), suggestExpenseCategory: vi.fn() }));
vi.mock("./line", () => ({
  replyThemedTextCard: vi.fn(), replyTransactionList: vi.fn(), replyReminderList: vi.fn(), replyCalendarList: vi.fn(), replyGreetingHome: vi.fn(), replyMiloOnboarding: vi.fn(), replyMiloSettings: vi.fn(), getMessageContent: vi.fn(), getProfile: vi.fn(), lineCredentials: vi.fn(() => ({ channelSecret: "test-secret", channelAccessToken: "test-token" })), pushText: vi.fn(), pushTextWithQuickReplies: vi.fn(), replyMention: vi.fn(), replyText: vi.fn(), replyTextWithQuickReplies: vi.fn(),
  replyVoiceProposal: vi.fn(), replyPostSaveSummary: vi.fn(), replyVoiceCategoryChoices: vi.fn(), postSaveSummaryText: vi.fn((summary: { amount: number }) => `รายจ่าย ${summary.amount} บาท`), replyFinanceReportCard: vi.fn(), replyFinanceReportCardFallback: vi.fn(), financeReportCardText: vi.fn(() => "สรุปการเงินวันนี้"),
  sourceIdentity: vi.fn(() => ({ lineChatId: "G1", lineUserId: "U1", scope: "group" })), verifyLineSignature: vi.fn(),
}));

import * as db from "../db";
import { replyThemedTextCard, replyReminderList, replyTransactionList, replyCalendarList, replyGreetingHome, replyMiloSettings, getMessageContent, getProfile, pushTextWithQuickReplies, replyFinanceReportCard, replyMention, replyPostSaveSummary, replyText, replyTextWithQuickReplies, replyVoiceCategoryChoices, replyVoiceProposal, sourceIdentity, verifyLineSignature } from "./line";
import { storageGetSignedUrl, storagePut } from "../storage";
import { analyzeImage } from "./imageAnalysis";
import { analyzePdfBuffer } from "./pdfAnalysis";
import { transcribeAudio } from "../_core/voiceTranscription";
import { generateFinancialInsight, suggestExpenseCategory } from "./financialAssistant";
import { processEvent, recoverPendingMediaWebhookEvents, registerLineWebhook } from "./routes";

describe("LINE webhook processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue({ displayName: "Milo Tester" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "G1", lineUserId: "U1", scope: "group" });
    process.env.LINE_CHANNEL_SECRET = "test-calendar-signing-secret";
    process.env.MILO_PRO_MAX_LINE_USER_IDS = "U1";
    vi.mocked(db.isAdminLinkedLineUser).mockResolvedValue(true);
    vi.mocked(db.claimWebhookEvent).mockResolvedValue(true as never);
    vi.mocked(db.listRecoverableWebhookEvents).mockResolvedValue([] as never);
    vi.mocked(db.deferWebhookEvent).mockResolvedValue(undefined as never);
    vi.mocked(db.resolveFinanceAccountForLineEvent).mockResolvedValue({ account: { id: 7 }, membership: { role: "owner" } } as never);
    vi.mocked(db.canCreateFinanceTransaction).mockReturnValue(true);
    vi.mocked(db.canManageFinanceTransactions).mockReturnValue(true);
    vi.mocked(db.canManageFinanceSettings).mockReturnValue(true);
    vi.mocked(pushTextWithQuickReplies).mockResolvedValue(new Response());
    vi.mocked(db.financeBudgetCycleReport).mockResolvedValue({ key: "2026-09", categories: {}, income: 0, expense: 0, balance: 0, rows: [] } as never);
    vi.mocked(db.getFinanceAccountBudgetCycleStartDay).mockResolvedValue(1 as never);
    vi.mocked(db.listRecurringTransactions).mockResolvedValue([] as never);
    vi.mocked(db.findVaultItemByFingerprint).mockResolvedValue(undefined as never);
    vi.mocked(db.listVaultDocumentsForChat).mockResolvedValue([] as never);
    vi.mocked(db.updateVaultIntelligence).mockResolvedValue(true as never);
    vi.mocked(db.listCalendarEventsForRange).mockResolvedValue([] as never);
    vi.mocked(db.listRemindersForChat).mockResolvedValue([] as never);
    vi.mocked(db.listTodosForChat).mockResolvedValue([] as never);
    vi.mocked(db.listPendingBillsForChat).mockResolvedValue([] as never);
    vi.mocked(db.latestProposedCaptureDraft).mockResolvedValue(undefined as never);
    vi.mocked(db.finishCaptureDraft).mockResolvedValue(true as never);
    vi.mocked(db.markPendingBillPaid).mockResolvedValue(true as never);
    vi.mocked(db.cancelPendingBill).mockResolvedValue(true as never);
  });

  it("stages a compound message as one confirmation draft without creating finance data", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.createCaptureDraft).mockResolvedValue(31 as never);
    vi.mocked(replyTextWithQuickReplies).mockResolvedValue(new Response());

    await processEvent({
      type: "message", webhookEventId: "evt-capture-draft", timestamp: Date.parse("2026-09-16T02:00:00.000Z"),
      replyToken: "token", source: { type: "user", userId: "U1" },
      message: { id: "compound-1", type: "text", text: "พรุ่งนี้บ่ายสองประชุมกับลูกค้า ค่าแท็กซี่ 300 บาท ช่วยเตือนก่อนประชุมด้วยนะ" },
    }, "{}");

    expect(db.createCaptureDraft).toHaveBeenCalledWith(expect.objectContaining({
      lineChatId: "U1", lineUserId: "U1", financeAccountId: 7, sourceMessageId: "compound-1",
    }));
    expect(replyTextWithQuickReplies).toHaveBeenCalledTimes(1);
    expect(replyTextWithQuickReplies).toHaveBeenCalledWith("token", expect.stringContaining("ยังไม่สร้างรายการการเงินจริง"), expect.any(Array));
    expect(db.createCalendarEvent).not.toHaveBeenCalled();
    expect(db.createReminder).not.toHaveBeenCalled();
    expect(db.createPendingBill).not.toHaveBeenCalled();
    expect(db.createTransaction).not.toHaveBeenCalled();
  });

  it("confirms a staged capture into calendar, reminder, and pending bill but not a transaction", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.latestProposedCaptureDraft).mockResolvedValue({
      id: 31,
      payloadJson: JSON.stringify({
        originalText: "compound",
        items: [
          { type: "calendar", title: "ประชุมกับลูกค้า", startsAt: "2026-09-17T07:00:00.000Z", endsAt: "2026-09-17T08:00:00.000Z" },
          { type: "pending_bill", title: "ค่าแท็กซี่", amount: 300, category: "เดินทาง", dueAt: "2026-09-17T07:00:00.000Z" },
          { type: "reminder", title: "เตือนประชุมกับลูกค้า", dueAt: "2026-09-17T06:45:00.000Z" },
        ],
      }),
    } as never);
    vi.mocked(db.createCalendarEvent).mockResolvedValue(101 as never);
    vi.mocked(db.createPendingBill).mockResolvedValue(102 as never);
    vi.mocked(db.createReminder).mockResolvedValue(103 as never);
    vi.mocked(replyTextWithQuickReplies).mockResolvedValue(new Response());

    await processEvent({
      type: "message", webhookEventId: "evt-capture-confirm", timestamp: Date.now(),
      replyToken: "token", source: { type: "user", userId: "U1" },
      message: { id: "confirm-1", type: "text", text: "ยืนยันรายการทั้งหมด" },
    }, "{}");

    expect(db.createCalendarEvent).toHaveBeenCalledTimes(1);
    expect(db.createReminder).toHaveBeenCalledTimes(1);
    expect(db.createPendingBill).toHaveBeenCalledWith(expect.objectContaining({ captureDraftId: 31, amount: 300, financeAccountId: 7 }));
    expect(db.finishCaptureDraft).toHaveBeenCalledWith(expect.objectContaining({ id: 31, status: "accepted" }));
    expect(db.createTransaction).not.toHaveBeenCalled();
    expect(replyTextWithQuickReplies).toHaveBeenCalledTimes(1);
  });

  it("creates the real expense only when a pending bill is marked paid", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.getPendingBillForAction).mockResolvedValue({ id: 42, title: "ค่าไฟ", amount: "1250.00", category: "ค่าสาธารณูปโภค" } as never);
    vi.mocked(db.createTransaction).mockResolvedValue(700 as never);
    vi.mocked(db.financeReport).mockResolvedValue({ income: 0, expense: 1250, balance: -1250 } as never);
    vi.mocked(replyPostSaveSummary).mockResolvedValue(new Response());

    await processEvent({
      type: "message", webhookEventId: "evt-bill-paid", timestamp: Date.parse("2026-09-16T03:00:00.000Z"),
      replyToken: "token", source: { type: "user", userId: "U1" },
      message: { id: "bill-pay-1", type: "text", text: "จ่ายบิล #42" },
    }, "{}");

    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      transactionType: "expense", amount: 1250, source: "pending_bill", sourceMessageId: "pending-bill:42",
    }));
    expect(db.markPendingBillPaid).toHaveBeenCalledWith({ id: 42, transactionId: 700, lineUserId: "U1", lineChatId: "U1" });
    expect(replyPostSaveSummary).toHaveBeenCalledTimes(1);
    expect(replyText).not.toHaveBeenCalled();
  });

  it("combines appointments, reminders, todos, bills, and today's finance in one overview", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    const now = new Date();
    vi.mocked(db.listCalendarEventsForRange).mockResolvedValue([{ id: 1, title: "ประชุมทีม", startsAt: now }] as never);
    vi.mocked(db.listRemindersForChat).mockResolvedValue([{ id: 2, title: "ส่งรายงาน", status: "active", nextRunAt: now }] as never);
    vi.mocked(db.listTodosForChat).mockResolvedValue([{ id: 3, title: "ตรวจเอกสาร", dueAt: null }] as never);
    vi.mocked(db.listPendingBillsForChat).mockResolvedValue([{ id: 4, title: "ค่าไฟ", amount: "1250", dueAt: now }] as never);
    vi.mocked(db.financeReport).mockResolvedValue({ income: 5000, expense: 1250, balance: 3750 } as never);
    vi.mocked(replyText).mockResolvedValue(new Response());

    await processEvent({
      type: "message", webhookEventId: "evt-today", timestamp: Date.now(),
      replyToken: "token", source: { type: "user", userId: "U1" },
      message: { id: "today-1", type: "text", text: "วันนี้มีอะไร" },
    }, "{}");

    expect(replyThemedTextCard).toHaveBeenCalledTimes(1);
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("วันนี้ของฉัน"), "summary-day");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("ค่าไฟ"), "summary-day");
  });

  it("summarizes this month's document packet from the current chat", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.listVaultDocumentsForChat).mockResolvedValue([
      { id: 41, title: "ใบเสร็จ INDI Coffee", itemType: "image", storageKey: "db/a", tagsText: "#doc:ready #kind:receipt" },
      { id: 42, title: "Statement KBank", itemType: "file", storageKey: "db/b", tagsText: "#doc:password_required #kind:bank_statement" },
    ] as never);
    vi.mocked(replyText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-doc-packet", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "doc-packet", type: "text", text: "สรุปเอกสารเดือนนี้" } }, "{}");

    expect(db.listVaultDocumentsForChat).toHaveBeenCalledWith("U1", "U1", "user", expect.any(Date), expect.any(Date));
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("ต้องตรวจ 1"), "utility");
  });

  it("stops duplicate media before storing or analyzing it again", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("same-receipt"));
    vi.mocked(db.findVaultItemByFingerprint).mockResolvedValue({ id: 88, title: "ใบเสร็จเดิม", storageKey: "db/existing", lineMessageId: "old" } as never);
    vi.mocked(replyText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-media-duplicate", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "new-image", type: "image" } }, "{}");

    expect(storagePut).not.toHaveBeenCalled();
    expect(analyzeImage).not.toHaveBeenCalled();
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("ไม่เก็บซ้ำ"));
    expect(db.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "vault.duplicate.detected", entityId: 88 }));
  });

  it("reprocesses an unconfirmed duplicate without duplicating its file or transaction", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("same-receipt"));
    vi.mocked(db.findVaultItemByFingerprint).mockResolvedValue({ id: 88, storageKey: "db/existing", storageUrl: "" } as never);
    vi.mocked(db.canReprocessVaultMedia).mockResolvedValueOnce(true);
    vi.mocked(analyzeImage).mockResolvedValueOnce({ summary: "1000", confidence: 0.99, proposals: [] } as never);

    await processEvent({ type: "message", webhookEventId: "evt-media-retry", timestamp: Date.now(), replyToken: "token", source: { type: "group", groupId: "G1", userId: "U1" }, message: { id: "retry-image", type: "image" } }, "{}");

    expect(db.canReprocessVaultMedia).toHaveBeenCalledWith(88, "U1", "G1");
    expect(analyzeImage).toHaveBeenCalledTimes(1);
    expect(db.saveImageExtraction).toHaveBeenCalledWith(88, "reminder", expect.any(String), 0.99);
    expect(storagePut).not.toHaveBeenCalled();
    expect(db.createVaultItem).not.toHaveBeenCalled();
    expect(db.createTransaction).not.toHaveBeenCalled();
  });

  it("skips a redelivered webhook event that was already registered", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(false);
    await processEvent({
      type: "message", webhookEventId: "evt-duplicate", timestamp: Date.now(), replyToken: "token",
      source: { type: "group", groupId: "G1", userId: "U1" }, message: { id: "m1", type: "text", text: "ช่วย" },
    }, "{\"events\":[]}");

    expect(db.registerWebhookEvent).toHaveBeenCalledTimes(1);
    expect(db.upsertLineChat).not.toHaveBeenCalled();
    expect(db.finishWebhookEvent).not.toHaveBeenCalled();
  });

  it("resolves a group member and sends a LINE v2 mention for a mention command", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(db.findLineMemberByName).mockResolvedValue({ lineUserId: "U-SOM" } as never);
    vi.mocked(replyMention).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-mention", timestamp: Date.now(), replyToken: "token", source: { type: "group", groupId: "G1", userId: "U1" }, message: { id: "m2", type: "text", text: "@ไมโล แจ้งส่งงานด้วยถึง @สมชาย" } }, "{}");
    expect(db.findLineMemberByName).toHaveBeenCalledWith("G1", "สมชาย");
    expect(replyMention).toHaveBeenCalledWith("token", "ส่งงานด้วย", "U-SOM");
  });

  it("replies with a helpful validation message for an incomplete budget command", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-invalid-budget", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "m3", type: "text", text: "ตั้งงบ อาหาร" } }, "{}");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", "รูปแบบงบประมาณ: ตั้งงบ อาหาร 5000 บาท", "settings-help");
  });

  it("replies with a helpful validation message for an incomplete category command", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-invalid-category", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "m4", type: "text", text: "เพิ่มหมวด" } }, "{}");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", "กรุณาระบุชื่อหมวด เช่น เพิ่มหมวดรายจ่าย เดินทาง", "settings-help");
  });

  it("uses three contextual quick replies for an unknown finance intent", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyTextWithQuickReplies).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-contextual-fallback", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "m-context", type: "text", text: "ยอดเงินเป็นไง" } }, "{}");
    expect(replyTextWithQuickReplies).toHaveBeenCalledWith("token", "ต้องการดูภาพรวมช่วงไหนครับ?", [
      { label: "สรุปวันนี้", text: "สรุปวันนี้" },
      { label: "สรุปเดือนนี้", text: "สรุปเดือนนี้" },
      { label: "วิเคราะห์", text: "วิเคราะห์" },
    ]);
  });
  it("undoes the latest transaction with a soft-delete workflow", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.deleteLatestTransaction).mockResolvedValue({ id: 77, amount: "30.00", category: "อาหาร", note: "ร้านกระเพรากลางซอย" } as never);
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-undo-latest", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "undo-1", type: "text", text: "ยกเลิกรายการล่าสุด" } }, "{}");
    expect(db.deleteLatestTransaction).toHaveBeenCalledWith({ lineUserId: "U1", financeAccountId: 7 });
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("#77"), "transactions");
  });

  it("returns a LINE User ID only to a private chat for dashboard linking", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-line-id", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "m5", type: "text", text: "ไอดี" } }, "{}");
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("U1"));
  });

  it("blocks a reminder for a Free user before creating data", async () => {
    delete process.env.MILO_PRO_MAX_LINE_USER_IDS;
    vi.mocked(db.isAdminLinkedLineUser).mockResolvedValue(false);
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-free-reminder", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "free-reminder", type: "text", text: "เตือนประชุมพรุ่งนี้ 10:00" } }, "{}");
    expect(db.createReminder).not.toHaveBeenCalled();
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("Pro"));
  });

  it("blocks confirmation of an old PDF proposal for a Free user", async () => {
    delete process.env.MILO_PRO_MAX_LINE_USER_IDS;
    vi.mocked(db.isAdminLinkedLineUser).mockResolvedValue(false);
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-free-old-pdf", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "free-old-pdf", type: "text", text: "ยืนยัน PDF" } }, "{}");

    expect(db.latestImageExtraction).not.toHaveBeenCalled();
    expect(db.createTransaction).not.toHaveBeenCalled();
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("Pro Max"));
  });

  it("blocks a Free user from converting an image proposal into a reminder", async () => {
    delete process.env.MILO_PRO_MAX_LINE_USER_IDS;
    vi.mocked(db.isAdminLinkedLineUser).mockResolvedValue(false);
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    vi.mocked(db.latestImageExtraction).mockResolvedValue({
      extraction: { id: 901, status: "proposed", extractedJson: JSON.stringify({ proposals: [{ kind: "reminder", title: "นัดหมอ", dateText: "2026-09-20", timeText: "10:00" }] }) },
      vault: { id: 902, mimeType: "image/jpeg", storageKey: "milo/U1/reminder.jpg" },
    } as never);

    await processEvent({ type: "message", webhookEventId: "evt-free-image-reminder", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "free-image-reminder", type: "text", text: "ยืนยันรูป" } }, "{}");

    expect(db.createReminder).not.toHaveBeenCalled();
    expect(db.setImageExtractionStatus).not.toHaveBeenCalledWith(901, "accepted");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("Pro"), "utility");
  });

  it("persists and replies to the help-menu text workflows in a private chat", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    vi.mocked(db.createReminder).mockResolvedValue(71 as never);
    vi.mocked(db.searchVaultForChat).mockResolvedValue([{ title: "ใบเสร็จร้านกาแฟ", itemType: "image", storageKey: "milo/U1/receipt.jpg" }] as never);
    vi.mocked(db.listExpenseCategories).mockResolvedValue([{ name: "เดินทาง" }] as never);
    vi.mocked(db.listTransactionCategories).mockResolvedValue([{ name: "เดินทาง", transactionType: "expense" }] as never);
    vi.mocked(db.financeReport).mockResolvedValue({ period: "day", income: 45000, expense: 65, balance: 44935, categories: { อาหาร: 65 } } as never);
    vi.mocked(replyPostSaveSummary).mockResolvedValue(new Response());

    const event = (id: string, text: string) => ({ type: "message" as const, webhookEventId: `evt-${id}`, timestamp: Date.now(), replyToken: "token", source: { type: "user" as const, userId: "U1" }, message: { id, type: "text" as const, text } });
    await processEvent(event("reminder", "เตือนประชุมพรุ่งนี้ 10:00"), "{}");
    await processEvent(event("expense", "จ่ายกาแฟ 65"), "{}");
    await processEvent(event("income", "รับเงินเดือน 45000"), "{}");
    await processEvent(event("note", "โน้ต รหัส Wi‑Fi ห้องประชุม"), "{}");
    await processEvent(event("todo", "งาน ส่งสรุปรายสัปดาห์"), "{}");
    await processEvent(event("vault", "เก็บ https://example.com/brief #งาน"), "{}");
    await processEvent(event("search", "ค้นหา ใบเสร็จ"), "{}");
    await processEvent(event("category-add", "เพิ่มหมวด เดินทาง"), "{}");
    await processEvent(event("income-category-add", "เพิ่มหมวดรายรับ โบนัส"), "{}");
    await processEvent(event("category-list", "ดูหมวด"), "{}");
    await processEvent(event("help", "ช่วย"), "{}");
    await processEvent(event("help-th", "ช่วยเหลือ"), "{}");
    await processEvent(event("rem-list-menu", "รายการเตือน"), "{}");

    expect(db.createReminder).toHaveBeenCalledWith(expect.objectContaining({ lineChatId: "U1", createdByLineUserId: "U1" }));
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionType: "expense", amount: 65, category: "อาหาร" }));
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionType: "income", amount: 45000, category: "เงินเดือน" }));
    expect(db.createNote).toHaveBeenCalledWith("U1", "U1", "รหัส Wi‑Fi ห้องประชุม", "รหัส Wi‑Fi ห้องประชุม");
    expect(db.createTodo).toHaveBeenCalledWith("U1", "U1", "ส่งสรุปรายสัปดาห์");
    expect(db.createVaultItem).toHaveBeenCalledWith(expect.objectContaining({ itemType: "link", sourceUrl: "https://example.com/brief", tagsText: "#งาน" }));
    expect(db.searchVaultForChat).toHaveBeenCalledWith("U1", "U1", "user", "ใบเสร็จ");
    expect(db.addExpenseCategory).toHaveBeenCalledWith("U1", "เดินทาง", "expense", 7);
    expect(db.addExpenseCategory).toHaveBeenCalledWith("U1", "โบนัส", "income", 7);
    expect(db.listTransactionCategories).toHaveBeenCalledWith("U1", 7);
    expect(replyPostSaveSummary).toHaveBeenCalledWith("token", expect.objectContaining({ transactionType: "expense", amount: 65, category: "อาหาร", dailyExpense: 65 }));

    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("Milo ช่วยคุณจบงานใน LINE แชทเดียวครับ"), "settings-help");
    expect(replyReminderList).toHaveBeenCalled();
  });

  it("lists transactions from the same finance account", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.resolveFinanceAccountForLineEvent).mockResolvedValue({ account: { id: 7 }, membership: { role: "owner" } } as never);
    vi.mocked(db.listTransactions).mockResolvedValue([{ id: 12, transactionType: "expense", amount: "40", category: "อาหาร", note: "กาแฟ", occurredAt: new Date("2026-09-21T10:00:00.000Z") }] as never);
    vi.mocked(replyTransactionList).mockResolvedValue(new Response());
    const event = (id: string, text: string) => ({ type: "message" as const, webhookEventId: `evt-${id}`, timestamp: Date.now(), replyToken: "token", source: { type: "user" as const, userId: "U1" }, message: { id, type: "text" as const, text } });
    await processEvent(event("tx-list", "รายการ"), "{}");
    expect(db.listTransactions).toHaveBeenCalledWith("U1", undefined, undefined, false, 7);
    expect(replyTransactionList).toHaveBeenCalledWith("token", expect.arrayContaining([expect.objectContaining({ id: 12, title: expect.stringContaining("40") })]));
  });

  it("lists and cancels reminders from the same LINE chat", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.listRemindersForChat).mockResolvedValue([{ id: 7, title: "ประชุม", nextRunAt: new Date("2026-09-15T03:00:00.000Z") }] as never);
    vi.mocked(db.cancelReminderForChat).mockResolvedValue(true as never);
    vi.mocked(replyText).mockResolvedValue(new Response());
    const event = (id: string, text: string) => ({ type: "message" as const, webhookEventId: `evt-${id}`, timestamp: Date.now(), replyToken: "token", source: { type: "user" as const, userId: "U1" }, message: { id, type: "text" as const, text } });
    await processEvent(event("rem-list", "รายการเตือน"), "{}");
    expect(db.listRemindersForChat).toHaveBeenCalledWith("U1", "U1", "user");
    expect(replyReminderList).toHaveBeenCalledWith("token", expect.arrayContaining([expect.objectContaining({ id: 7, title: "ประชุม" })]));
    await processEvent(event("rem-cancel", "ยกเลิกเตือน 7"), "{}");
    expect(db.cancelReminderForChat).toHaveBeenCalledWith(7, "U1", "U1");
  });

  it("lists and completes To-do items without leaving LINE", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.listTodosForChat).mockResolvedValue([{ id: 9, title: "ส่งรายงาน", dueAt: null }] as never);
    vi.mocked(db.completeTodoForChat).mockResolvedValue(true as never);
    vi.mocked(replyText).mockResolvedValue(new Response());
    const event = (id: string, text: string) => ({ type: "message" as const, webhookEventId: `evt-${id}`, timestamp: Date.now(), replyToken: "token", source: { type: "user" as const, userId: "U1" }, message: { id, type: "text" as const, text } });
    await processEvent(event("todo-list", "ดูงาน"), "{}");
    expect(db.listTodosForChat).toHaveBeenCalledWith("U1", "U1", "user");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("ส่งรายงาน"), "utility");
    await processEvent(event("todo-done", "เสร็จงาน 9"), "{}");
    expect(db.completeTodoForChat).toHaveBeenCalledWith(9, "U1", "U1", "user");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("เสร็จ"), "utility");
  });

  it("lists upcoming calendar events from the same LINE chat", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.listCalendarEvents).mockResolvedValue([{ id: 88, title: "ประชุมทีม", startsAt: new Date("2026-09-22T03:30:00.000Z"), endsAt: new Date("2026-09-22T04:30:00.000Z") }] as never);
    vi.mocked(replyCalendarList).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-calendar-list", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "cal-list-1", type: "text", text: "ดูปฏิทิน" } }, "{}");
    expect(db.listCalendarEvents).toHaveBeenCalledWith("U1", "U1", expect.any(Date), 20);
    expect(replyCalendarList).toHaveBeenCalledWith("token", expect.arrayContaining([expect.objectContaining({ id: 88, title: "ประชุมทีม" })]));
  });

  it("creates a Milo calendar event from private LINE chat and confirms automatic Google sync", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.createCalendarEvent).mockResolvedValue(88 as never);
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-calendar-create", timestamp: new Date("2026-09-14T02:00:00.000Z").getTime(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "cal-1", type: "text", text: "ลงปฏิทิน ประชุมทีมพรุ่งนี้ 10:30" } }, "{}");
    expect(db.createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({ lineChatId: "U1", createdByLineUserId: "U1", title: "ประชุมทีม", sourceMessageId: "cal-1" }));
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("#88"), "utility");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("ซิงก์เข้า Google Calendar แล้ว"), "utility");
  });

  it("searches a shared group vault within the current LINE group", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "G1", lineUserId: "U1", scope: "group" });
    vi.mocked(db.searchVaultForChat).mockResolvedValue([{ id: 9, title: "ใบเสนอราคาลูกค้า A", itemType: "file", storageKey: "milo/G1/q.pdf" }] as never);
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-group-vault-search", timestamp: Date.now(), replyToken: "token", source: { type: "group", groupId: "G1", userId: "U1" }, message: { id: "g-search-1", type: "text", text: "@ไมโล ค้นหา ใบเสนอราคา" } }, "{}");
    expect(db.searchVaultForChat).toHaveBeenCalledWith("U1", "G1", "group", "ใบเสนอราคา");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("ใบเสนอราคาลูกค้า A"), "utility");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("เก็บถาวร"), "utility");
  });

  it("reports durable-vault coverage without overclaiming missing media storage", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.vaultStorageStatus).mockResolvedValue({ total: 12, durable: 11, mediaMissing: 1 } as never);
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-vault-status", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "vault-status-1", type: "text", text: "สถานะคลัง" } }, "{}");
    expect(db.vaultStorageStatus).toHaveBeenCalledWith("U1", "U1", "user");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("เก็บถาวร 11 รายการ"), "utility");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("ต้องอัปโหลดซ้ำ 1 รายการ"), "utility");
  });

  it("stores a receipt analysis then records its confirmed expense with amount, category, date and merchant note", async () => {
    const receiptAnalysis = {
      summary: "พบใบเสร็จร้านกาแฟ ยอด 125 บาท",
      confidence: 0.94,
      proposals: [{ kind: "expense", documentType: "receipt", title: "เครื่องดื่ม", merchant: "ร้านกาแฟ", dateText: "2026-08-27", timeText: "10:15", amount: 125, currency: "บาท", category: "อาหาร", paymentMethod: "PromptPay", receiptNumber: "R-125", lineItems: ["ลาเต้"], note: "ยอดสุทธิ" }],
    };
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("receipt-image"));
    vi.mocked(storagePut).mockResolvedValue({ key: "milo/U1/img-1", url: "https://storage.example/receipt.jpg" });
    vi.mocked(db.createVaultItem).mockResolvedValue(9 as never);
    vi.mocked(analyzeImage).mockResolvedValue(receiptAnalysis);
    vi.mocked(replyText).mockResolvedValue(new Response());
    vi.mocked(db.financeReport).mockResolvedValue({ period: "day", income: 0, expense: 125, balance: -125, categories: { อาหาร: 125 } } as never);
    vi.mocked(db.createTransaction).mockResolvedValue(155);
    vi.mocked(db.linkTransactionAttachment).mockResolvedValue(true);
    vi.mocked(replyPostSaveSummary).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-receipt", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "img-1", type: "image" } }, "{}");
    expect(db.saveImageExtraction).toHaveBeenCalledWith(9, "expense", expect.stringContaining("ร้านกาแฟ"), 0.94);
    expect(db.createTransaction).not.toHaveBeenCalled();
    vi.mocked(db.latestImageExtraction).mockResolvedValue({ extraction: { id: 3, status: "proposed", extractedJson: JSON.stringify(receiptAnalysis) }, vault: { id: 9, storageKey: "milo/U1/img-1" } } as never);
    await processEvent({ type: "message", webhookEventId: "evt-confirm-receipt", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "txt-1", type: "text", text: "ยืนยันค่าใช้จ่าย" } }, "{}");
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ lineChatId: "U1", lineUserId: "U1", transactionType: "expense", amount: 125, category: "อาหาร", occurredAt: new Date("2026-08-27T03:15:00.000Z") }));
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ note: expect.stringContaining("ร้านค้า/คู่ค้า: ร้านกาแฟ") }));
    expect(db.linkTransactionAttachment).toHaveBeenCalledWith({ transactionId: 155, vaultItemId: 9, lineUserId: "U1", label: "ใบเสร็จต้นฉบับ" });
    expect(db.setImageExtractionStatus).toHaveBeenCalledWith(3, "accepted");
    expect(replyPostSaveSummary).toHaveBeenCalledWith("token", expect.objectContaining({ transactionType: "expense", amount: 125, category: "อาหาร", dailyExpense: 125 }));
  });

  it("edits a receipt proposal in chat without creating a transaction before confirmation", async () => {
    const receiptAnalysis = {
      summary: "พบใบเสร็จ", confidence: 0.9,
      proposals: [{ kind: "expense", documentType: "receipt", title: "กาแฟ", merchant: "ร้านเดิม", dateText: "2026-09-12", timeText: "10:00", amount: 80, currency: "บาท", category: "อาหาร", paymentMethod: "PromptPay", receiptNumber: "R1", lineItems: ["ลาเต้"], note: "ยอดสุทธิ" }],
    };
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.latestImageExtraction).mockResolvedValue({ extraction: { id: 30, status: "proposed", extractedJson: JSON.stringify(receiptAnalysis) }, vault: { id: 19, mimeType: "image/jpeg", storageKey: "milo/U1/img-edit" } } as never);
    vi.mocked(db.updateProposedImageExtractionJson).mockResolvedValue(true);
    vi.mocked(replyText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-edit-receipt", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "txt-edit-receipt", type: "text", text: "แก้ใบเสร็จ ยอด 150 บาท" } }, "{}");

    expect(db.updateProposedImageExtractionJson).toHaveBeenCalledWith(30, expect.stringContaining('"amount":150'));
    expect(db.createTransaction).not.toHaveBeenCalled();
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("ยังไม่บันทึก"), "utility");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("150"), "utility");
  });
  it("does not record a receipt with an unreadable date until the user supplies an explicit date", async () => {
    const incompleteReceipt = {
      summary: "พบยอดชำระ 125 บาท แต่วันที่ไม่ชัด",
      confidence: 0.71,
      proposals: [{ kind: "expense", documentType: "bank_slip", title: "โอนเงิน", merchant: "ร้านค้า", dateText: "", timeText: "", amount: 125, currency: "บาท", category: "ทั่วไป", paymentMethod: "PromptPay", receiptNumber: "", lineItems: [], note: "วันที่อ่านไม่ชัด" }],
    };
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.latestImageExtraction).mockResolvedValue({ extraction: { id: 4, status: "proposed", extractedJson: JSON.stringify(incompleteReceipt) }, vault: { storageKey: "milo/U1/img-2" } } as never);
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-unknown-date", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "txt-2", type: "text", text: "ยืนยันค่าใช้จ่าย" } }, "{}");
    expect(db.createTransaction).not.toHaveBeenCalled();
    expect(db.setImageExtractionStatus).not.toHaveBeenCalled();
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("จึงยังไม่บันทึก"), "utility");
  });

  it("does not silently replace a missing receipt date with the upload date", async () => {
    const timeOnlyReceipt = {
      summary: "พบยอดชำระ 30 บาท แต่วันที่ไม่ชัด",
      confidence: 0.79,
      proposals: [{ kind: "expense", documentType: "receipt", title: "อาหาร", merchant: "ร้านกระเพรากลางซอย", dateText: "", timeText: "10:57", amount: 30, currency: "บาท", category: "อาหาร", paymentMethod: "เงินสด", receiptNumber: "", lineItems: [], note: "วันที่อ่านไม่ชัด" }],
    };
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.latestImageExtraction).mockResolvedValue({ extraction: { id: 44, status: "proposed", extractedJson: JSON.stringify(timeOnlyReceipt) }, vault: { id: 29, mimeType: "image/jpeg", storageKey: "milo/U1/img-time-only", createdAt: new Date("2026-09-14T06:37:00.000Z") } } as never);
    vi.mocked(db.createTransaction).mockResolvedValue(166 as never);
    vi.mocked(db.linkTransactionAttachment).mockResolvedValue(true);
    vi.mocked(db.financeReport).mockResolvedValue({ period: "day", income: 0, expense: 30, balance: -30, categories: { อาหาร: 30 } } as never);

    await processEvent({ type: "message", webhookEventId: "evt-time-only-confirm", timestamp: new Date("2026-09-14T06:39:00.000Z").getTime(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "txt-time-only", type: "text", text: "ยืนยันค่าใช้จ่าย" } }, "{}");

    expect(db.createTransaction).not.toHaveBeenCalled();
    expect(db.setImageExtractionStatus).not.toHaveBeenCalledWith(44, "accepted");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("จึงยังไม่บันทึก"), "utility");
  });

  it("stores a PDF proposal and confirms multiple valid expense rows with the PDF linked as evidence", async () => {
    const pdfAnalysis = {
      summary: "พบ 2 รายการจาก statement",
      confidence: 0.95,
      proposals: [
        { kind: "expense", documentType: "receipt", title: "กาแฟ", merchant: "Cafe", dateText: "2026-09-10", timeText: "08:30", amount: 80, currency: "บาท", category: "อาหาร", paymentMethod: "card", receiptNumber: "", lineItems: [], note: "กาแฟ" },
        { kind: "expense", documentType: "bank_slip", title: "แท็กซี่", merchant: "Taxi", dateText: "2026-09-11", timeText: "19:00", amount: 150, currency: "บาท", category: "เดินทาง", paymentMethod: "PromptPay", receiptNumber: "", lineItems: [], note: "เดินทาง" },
      ],
    };
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("pdf-bytes"));
    vi.mocked(storagePut).mockResolvedValue({ key: "milo/U1/statement.pdf", url: "https://storage.example/statement.pdf" });
    vi.mocked(db.createVaultItem).mockResolvedValue(33 as never);
    vi.mocked(analyzePdfBuffer).mockResolvedValue(pdfAnalysis as never);
    vi.mocked(replyText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-pdf", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "pdf-1", type: "file", fileName: "statement.pdf" } }, "{}");

    expect(analyzePdfBuffer).toHaveBeenCalledWith(Buffer.from("pdf-bytes"));
    expect(db.saveImageExtraction).toHaveBeenCalledWith(33, "expense", expect.stringContaining("statement"), 0.95);
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("พบรายการที่เสนอได้ 2 รายการ"));

    vi.mocked(db.latestImageExtraction).mockResolvedValue({ extraction: { id: 40, status: "proposed", extractedJson: JSON.stringify(pdfAnalysis) }, vault: { id: 33, mimeType: "application/pdf", storageKey: "milo/U1/statement.pdf" } } as never);
    vi.mocked(db.createTransaction).mockResolvedValueOnce(201).mockResolvedValueOnce(202);
    vi.mocked(db.linkTransactionAttachment).mockResolvedValue(true);

    await processEvent({ type: "message", webhookEventId: "evt-pdf-confirm", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "pdf-confirm", type: "text", text: "ยืนยัน PDF" } }, "{}");

    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ financeAccountId: 7, transactionType: "expense", amount: 80, category: "อาหาร", source: "line_pdf" }));
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ financeAccountId: 7, transactionType: "expense", amount: 150, category: "เดินทาง", source: "line_pdf" }));
    expect(db.linkTransactionAttachment).toHaveBeenCalledWith({ transactionId: 201, vaultItemId: 33, lineUserId: "U1", label: "PDF ต้นฉบับ" });
    expect(db.linkTransactionAttachment).toHaveBeenCalledWith({ transactionId: 202, vaultItemId: 33, lineUserId: "U1", label: "PDF ต้นฉบับ" });
    expect(db.setImageExtractionStatus).toHaveBeenCalledWith(40, "accepted");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("บันทึกรายจ่ายจาก PDF แล้ว 2 รายการ"), "utility");
  });

  it.each(["จ่ายค่าแท็กซี่ 120 บาท", "สวัสดีครับ"])("previews voice %s without saving and offers confirmation only for a transaction", async (text) => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("voice-bytes"));
    vi.mocked(storagePut).mockResolvedValue({ key: "milo/U1/audio-1", url: "https://storage.example/audio.m4a" });
    vi.mocked(storageGetSignedUrl).mockResolvedValue("https://signed.example/audio.m4a?signature=temporary");
    vi.mocked(db.createVaultItem).mockResolvedValue(12 as never);
    vi.mocked(transcribeAudio).mockResolvedValue({ text, language: "th" } as never);
    vi.mocked(suggestExpenseCategory).mockResolvedValue({ category: "เดินทาง", confidence: 0.94, reason: "แท็กซี่" });
    vi.mocked(replyVoiceProposal).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-audio", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "audio-1", type: "audio", duration: 1000 } }, "{}");

    expect(storageGetSignedUrl).not.toHaveBeenCalled();
    expect(transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ audioBuffer: Buffer.from("voice-bytes"), mimeType: "audio/m4a", language: "th" }));
    expect(db.saveVoiceTranscription).toHaveBeenCalledWith(expect.objectContaining({ vaultItemId: 12, transcript: text }));
    expect(db.createTransaction).not.toHaveBeenCalled();
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("รับข้อความเสียงแล้ว"));
    const line = await import("./line");
    expect(line.pushTextWithQuickReplies).toHaveBeenCalledWith("U1", expect.stringContaining(text), text.includes("120") ? expect.arrayContaining([{ label: "ยืนยันบันทึก", text: "ยืนยันเสียง" }]) : [{ label: "แก้ไขข้อความ", text: "แก้ไขข้อความเสียง" }]);
  });

  it.each(["Voice transcription service is not configured", "AI Gateway requires a valid credit card on file"])("explains provider failure without asking the user to re-record: %s", async (error) => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("voice-bytes"));
    vi.mocked(storagePut).mockResolvedValue({ key: "milo/U1/audio-no-stt", url: "https://storage.example/audio.m4a" });
    vi.mocked(storageGetSignedUrl).mockResolvedValue("https://signed.example/audio.m4a?signature=temporary");
    vi.mocked(db.createVaultItem).mockResolvedValue(120 as never);
    vi.mocked(transcribeAudio).mockResolvedValue({ error, code: "SERVICE_ERROR" } as never);
    vi.mocked(replyText).mockResolvedValue(new Response());
    const line = await import("./line");
    vi.mocked(line.pushText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-audio-no-stt", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "audio-no-stt", type: "audio" } }, "{}");

    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("กำลังถอดเสียง"));
    expect(line.pushText).toHaveBeenCalledWith("U1", expect.stringContaining("ต้องแก้การตั้งค่าบริการก่อน"));
    expect(db.deferWebhookEvent).toHaveBeenCalledWith("evt-audio-no-stt", error);
  });

  it("updates the pending voice transcript and returns a fresh proposal when the user chooses edit", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.latestProposedVoiceTranscription).mockResolvedValue({ id: 77, transcript: "จ่ายกาแฟ 50", proposalJson: null } as never);
    vi.mocked(db.updateVoiceTranscript).mockResolvedValue(true);
    vi.mocked(suggestExpenseCategory).mockResolvedValue({ category: "อาหาร", confidence: 0.9, reason: "กาแฟ" });
    vi.mocked(replyVoiceProposal).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-edit-audio", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "text-edit", type: "text", text: "แก้ไขเสียง จ่ายกาแฟ 65 บาท" } }, "{}");

    expect(db.updateVoiceTranscript).toHaveBeenCalledWith(expect.objectContaining({ id: 77, lineUserId: "U1", transcript: "จ่ายกาแฟ 65 บาท", proposalJson: expect.stringContaining("อาหาร") }));
    expect(replyVoiceProposal).toHaveBeenCalledWith("token", expect.objectContaining({ amount: 65, category: "อาหาร" }));
    expect(db.createTransaction).not.toHaveBeenCalled();
  });

  it("offers popular category Quick Replies, then changes only the pending voice proposal", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.latestProposedVoiceTranscription).mockResolvedValue({ id: 88, transcript: "จ่ายแท็กซี่ 120 บาท", proposalJson: JSON.stringify({ transcript: "จ่ายแท็กซี่ 120 บาท", transactionType: "expense", amount: 120, category: "เดินทาง", note: "แท็กซี่" }) } as never);
    vi.mocked(db.listExpenseCategories).mockResolvedValue([] as never);
    vi.mocked(db.updateVoiceTranscript).mockResolvedValue(true);
    vi.mocked(replyVoiceCategoryChoices).mockResolvedValue(new Response());
    vi.mocked(replyVoiceProposal).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-category-menu", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "edit-menu", type: "text", text: "แก้ไขข้อความเสียง" } }, "{}");
    expect(replyVoiceCategoryChoices).toHaveBeenCalledWith("token");
    await processEvent({ type: "message", webhookEventId: "evt-category-change", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "edit-category", type: "text", text: "เปลี่ยนหมวดเสียง อาหาร" } }, "{}");
    expect(db.updateVoiceTranscript).toHaveBeenCalledWith(expect.objectContaining({ id: 88, proposalJson: expect.stringContaining("อาหาร") }));
    expect(replyVoiceProposal).toHaveBeenCalledWith("token", expect.objectContaining({ amount: 120, category: "อาหาร" }));
    expect(db.createTransaction).not.toHaveBeenCalled();
  });

  it("replies to daily, weekly, and monthly finance commands with Milo Flex report cards", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.financeReport).mockImplementation(async (_lineUserId, period) => ({ period, income: 0, expense: 615, balance: -615, categories: { อาหาร: 565, ทั่วไป: 50 } } as never));
    vi.mocked(replyFinanceReportCard).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-daily-card", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "daily-card", type: "text", text: "สรุปการเงินวันนี้" } }, "{}");
    await processEvent({ type: "message", webhookEventId: "evt-weekly-card", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "weekly-card", type: "text", text: "สรุปสัปดาห์นี้" } }, "{}");
    await processEvent({ type: "message", webhookEventId: "evt-monthly-card", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "monthly-card", type: "text", text: "สรุปเดือนนี้" } }, "{}");

    expect(replyFinanceReportCard).toHaveBeenCalledWith("token", expect.objectContaining({ period: "day", expense: 615, categories: { อาหาร: 565, ทั่วไป: 50 } }));
    expect(replyFinanceReportCard).toHaveBeenCalledWith("token", expect.objectContaining({ period: "week", expense: 615, categories: { อาหาร: 565, ทั่วไป: 50 } }));
    expect(replyFinanceReportCard).toHaveBeenCalledWith("token", expect.objectContaining({ period: "month", expense: 615, categories: { อาหาร: 565, ทั่วไป: 50 } }));
    expect(replyText).not.toHaveBeenCalled();

  });

  it("sets a category budget and compares the next natural-language expense against that budget", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    vi.mocked(db.getFinanceAccountBudgetCycleStartDay).mockResolvedValue(1 as never);

    await processEvent({ type: "message", webhookEventId: "evt-budget-set", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "budget-set", type: "text", text: "ตั้งงบ อาหาร 5000" } }, "{}");
    expect(db.upsertBudget).toHaveBeenCalledWith("U1", "อาหาร", 5000, expect.stringMatching(/^\d{4}-\d{2}$/), 7);

    vi.mocked(db.financeReport).mockResolvedValue({ period: "day", income: 0, expense: 80, balance: -80, categories: { อาหาร: 80 } } as never);
    vi.mocked(db.financeBudgetCycleReport).mockResolvedValue({ key: "2026-09", categories: { อาหาร: 3880 }, income: 0, expense: 3880, balance: -3880, rows: [] } as never);
    vi.mocked(db.listBudgets).mockResolvedValue([{ category: "อาหาร", amount: "5000" }] as never);
    vi.mocked(replyPostSaveSummary).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-budget-expense", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "budget-expense", type: "text", text: "กินกาแฟ 80" } }, "{}");

    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ financeAccountId: 7, transactionType: "expense", amount: 80, category: "อาหาร", note: "กินกาแฟ" }));
    expect(replyPostSaveSummary).toHaveBeenCalledWith("token", expect.objectContaining({ amount: 80, category: "อาหาร", budgetSpent: 3880, budgetLimit: 5000, budgetPercent: 78 }));
  });

  it("enforces the 20-item recurring transaction UAT limit in LINE", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.listRecurringTransactions).mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ id: i + 1, status: "active" })) as never);
    vi.mocked(replyText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-recurring-limit", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "rec-21", type: "text", text: "ตั้งจดอัตโนมัติ ค่าเช่า 5000 ทุกเดือนวันที่ 1 09:00" } }, "{}");

    expect(db.createRecurringTransaction).not.toHaveBeenCalled();
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("สูงสุด 20 รายการ"));
    expect(db.finishWebhookEvent).toHaveBeenCalledWith("evt-recurring-limit", "processed");
  });

  it("pushes a text summary if both Flex and reply-token fallbacks are rejected", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.financeReport).mockResolvedValue({ period: "day", income: 0, expense: 100, balance: -100, categories: { อาหาร: 100 } } as never);
    vi.mocked(replyPostSaveSummary).mockRejectedValue(new Error("invalid flex reply"));
    const line = await import("./line");
    vi.mocked(line.replyPostSaveSummary).mockRejectedValue(new Error("invalid flex reply"));
    vi.mocked(line.pushText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-save-push-fallback", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "expense-100", type: "text", text: "จ่ายค่าอาหาร 100 บาท" } }, "{}");

    expect(line.pushText).toHaveBeenCalledWith("U1", expect.stringContaining("รายจ่าย 100 บาท"));
  });

  it("continues slip/receipt analysis when permanent storage is unavailable", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("receipt-image"));
    vi.mocked(storagePut).mockRejectedValue(new Error("storage unavailable"));
    vi.mocked(db.createVaultItem).mockResolvedValue(122 as never);
    vi.mocked(analyzeImage).mockResolvedValue({
      summary: "พบสลิป ยอด 140 บาท", confidence: 0.92,
      proposals: [{ kind: "expense", documentType: "bank_slip", title: "รายการโอนเงิน", merchant: "คาเฟ่อเมซอน", dateText: "2026-09-13", timeText: "15:07", amount: 140, currency: "บาท", category: "อาหาร", paymentMethod: "โอนเงิน", receiptNumber: "R140", lineItems: [], note: "" }],
    });
    vi.mocked(replyText).mockResolvedValue(new Response());
    const line = await import("./line");
    vi.mocked(line.pushText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-image-store-fail", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "img-store-fail", type: "image" } }, "{}", { gatewayToken: "request-oidc-token" });

    expect(db.createVaultItem).toHaveBeenCalledWith(expect.objectContaining({ storageKey: undefined, storageUrl: undefined }));
    expect(analyzeImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/jpeg;base64,/), { gatewayToken: "request-oidc-token" });
    expect(db.saveImageExtraction).toHaveBeenCalledWith(122, "expense", expect.stringContaining("คาเฟ่อเมซอน"), 0.92);
    expect(line.pushTextWithQuickReplies).toHaveBeenCalledWith("U1", expect.stringContaining("อ่านรูปเรียบร้อยแล้ว"), expect.arrayContaining([{ label: "ยืนยันบันทึก", text: "ยืนยันค่าใช้จ่าย" }]));
    expect(db.finishWebhookEvent).toHaveBeenCalledWith("evt-image-store-fail", "processed");
  });

  it("never stays silent when a receipt image cannot be downloaded from LINE", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getMessageContent).mockRejectedValue(new Error("LINE content unavailable"));
    vi.mocked(replyText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-image-download-fail", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "img-fail", type: "image" } }, "{}");

    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("รับรูปแล้ว"));
    expect(db.deferWebhookEvent).toHaveBeenCalledWith("evt-image-download-fail", "LINE content unavailable");
  });

  it("continues voice transcription when permanent storage is unavailable", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("voice-bytes"));
    vi.mocked(storagePut).mockRejectedValue(new Error("storage unavailable"));
    vi.mocked(db.createVaultItem).mockResolvedValue(121 as never);
    vi.mocked(transcribeAudio).mockResolvedValue({ text: "จ่ายกาแฟ 80 บาท", language: "th" } as never);
    vi.mocked(suggestExpenseCategory).mockResolvedValue({ category: "อาหาร", confidence: 0.95, reason: "กาแฟ" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    const line = await import("./line");
    vi.mocked(line.pushText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-audio-store-fail", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "audio-fail", type: "audio" } }, "{}");

    expect(db.createVaultItem).toHaveBeenCalledWith(expect.objectContaining({ storageKey: undefined, storageUrl: undefined }));
    expect(transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ audioBuffer: Buffer.from("voice-bytes"), mimeType: "audio/m4a" }));
    expect(db.saveVoiceTranscription).toHaveBeenCalledWith(expect.objectContaining({ vaultItemId: 121, transcript: "จ่ายกาแฟ 80 บาท" }));
    expect(line.pushTextWithQuickReplies).toHaveBeenCalledWith("U1", expect.stringContaining("จ่ายกาแฟ 80 บาท"), expect.arrayContaining([{ label: "ยืนยันบันทึก", text: "ยืนยันเสียง" }]));
    expect(db.finishWebhookEvent).toHaveBeenCalledWith("evt-audio-store-fail", "processed");
  });

  it.each([
    ["image", "รูป"],
    ["audio", "ข้อความเสียง"],
  ] as const)("never stays silent when %s fails before media preparation", async (type, expectedWord) => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.isAdminLinkedLineUser).mockRejectedValueOnce(new Error("plan lookup unavailable"));
    vi.mocked(replyText).mockResolvedValue(new Response());

    await expect(processEvent({
      type: "message", webhookEventId: `evt-top-media-${type}`, timestamp: Date.now(), replyToken: "token",
      source: { type: "user", userId: "U1" }, message: { id: `media-${type}`, type },
    } as never, "{}")).resolves.toBeUndefined();

    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining(expectedWord));
    expect(db.deferWebhookEvent).toHaveBeenCalledWith(`evt-top-media-${type}`, "plan lookup unavailable");
    expect(db.finishWebhookEvent).not.toHaveBeenCalledWith(`evt-top-media-${type}`, "failed", expect.anything());
  });

  it("accepts a freshly persisted media webhook without a redundant immediate claim", async () => {
    vi.mocked(verifyLineSignature).mockReturnValue(true);
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.registerWebhookEvent).mockResolvedValueOnce(true as never);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(getMessageContent).mockRejectedValue(new Error("LINE content unavailable"));
    vi.mocked(replyText).mockResolvedValue(new Response());

    const app = express(); registerLineWebhook(app);
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    const payload = JSON.stringify({
      events: [{
        type: "message", webhookEventId: "evt-fresh-media-no-claim", timestamp: Date.now(), replyToken: "token",
        source: { type: "user", userId: "U1" }, message: { id: "img-fresh-no-claim", type: "image" },
      }],
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/line/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": "valid" },
      body: payload,
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    await new Promise<void>(resolve => server.close(() => resolve()));

    expect(response.status).toBe(200);
    expect(db.registerWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      webhookEventId: "evt-fresh-media-no-claim",
      rawPayload: payload,
      leaseAt: expect.any(Date),
    }));
    expect(db.claimWebhookEvent).not.toHaveBeenCalledWith("evt-fresh-media-no-claim");
  });

  it("returns 503 instead of acknowledging a media webhook when durable persistence fails", async () => {
    vi.mocked(verifyLineSignature).mockReturnValue(true);
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.registerWebhookEvent).mockRejectedValueOnce(new Error("database unavailable"));

    const app = express(); registerLineWebhook(app);
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    const payload = JSON.stringify({
      events: [{
        type: "message", webhookEventId: "evt-durable-persist-fail", timestamp: Date.now(), replyToken: "token",
        source: { type: "user", userId: "U1" }, message: { id: "img-durable-fail", type: "image" },
      }],
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/line/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": "valid" },
      body: payload,
    });
    await new Promise<void>(resolve => server.close(() => resolve()));

    expect(response.status).toBe(503);
    expect(db.registerWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      webhookEventId: "evt-durable-persist-fail",
      eventType: "message",
      lineChatId: "U1",
      rawPayload: payload,
    }));
  });

  it("recovers a persisted image job after restart without creating a transaction", async () => {
    const event = {
      type: "message" as const,
      webhookEventId: "evt-recover-image",
      timestamp: Date.now() - 120_000,
      replyToken: "expired-token",
      source: { type: "user" as const, userId: "U1" },
      message: { id: "img-recover", type: "image" as const },
    };
    const rawPayload = JSON.stringify({ events: [event] });
    vi.mocked(db.listRecoverableWebhookEvents).mockResolvedValue([{
      webhookEventId: event.webhookEventId,
      eventType: event.type,
      lineChatId: "U1",
      occurredAt: new Date(event.timestamp),
      rawPayload,
      processedAt: new Date(Date.now() - 120_000),
      errorMessage: "worker restarted",
    }] as never);
    vi.mocked(db.claimWebhookEvent).mockResolvedValue(true as never);
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("receipt-image"));
    vi.mocked(storagePut).mockResolvedValue({ key: "milo/U1/img-recover", url: "https://storage.example/recover.jpg" });
    vi.mocked(db.createVaultItem).mockResolvedValue(44 as never);
    vi.mocked(analyzeImage).mockResolvedValue({
      summary: "พบสลิป 716 บาท",
      confidence: 0.96,
      proposals: [{
        kind: "expense", documentType: "bank_slip", title: "ซื้อสินค้า", merchant: "EVEANDBOY",
        dateText: "2026-09-23", timeText: "15:16", amount: 716, currency: "บาท",
        category: "ช้อปปิ้ง", paymentMethod: "โอนเงิน", receiptNumber: "016266151635CQR07478",
        lineItems: [], note: "",
      }],
    });
    vi.mocked(pushTextWithQuickReplies).mockResolvedValue(new Response());

    const result = await recoverPendingMediaWebhookEvents({ limit: 5, leaseMs: 45_000 });

    expect(result).toMatchObject({ scanned: 1, recovered: 1, failed: 0 });
    expect(db.claimWebhookEvent).toHaveBeenCalledWith("evt-recover-image", expect.any(Date));
    expect(db.saveImageExtraction).toHaveBeenCalledWith(44, "expense", expect.stringContaining("716"), 0.96);
    expect(db.finishWebhookEvent).toHaveBeenCalledWith("evt-recover-image", "processed");
    expect(db.createTransaction).not.toHaveBeenCalled();
    expect(pushTextWithQuickReplies).toHaveBeenCalledWith("U1", expect.stringContaining("716"), expect.any(Array));
  });

  it("marks a media job failed only after its recovery attempt also fails", async () => {
    const event = {
      type: "message" as const,
      webhookEventId: "evt-recover-final-fail",
      timestamp: Date.now() - 120_000,
      replyToken: "expired-token",
      source: { type: "user" as const, userId: "U1" },
      message: { id: "img-recover-fail", type: "image" as const },
    };
    const rawPayload = JSON.stringify({ events: [event] });
    vi.mocked(db.listRecoverableWebhookEvents).mockResolvedValue([{
      webhookEventId: event.webhookEventId,
      eventType: event.type,
      lineChatId: "U1",
      occurredAt: new Date(event.timestamp),
      rawPayload,
      processedAt: new Date(Date.now() - 120_000),
      errorMessage: "first attempt failed",
    }] as never);
    vi.mocked(db.claimWebhookEvent).mockResolvedValue(true as never);
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.isAdminLinkedLineUser).mockRejectedValueOnce(new Error("plan lookup unavailable"));

    const result = await recoverPendingMediaWebhookEvents({ limit: 5, leaseMs: 45_000 });

    expect(result).toMatchObject({ scanned: 1, recovered: 0, failed: 1 });
    expect(db.finishWebhookEvent).toHaveBeenCalledWith("evt-recover-final-fail", "failed", "plan lookup unavailable");
    expect(db.deferWebhookEvent).not.toHaveBeenCalledWith("evt-recover-final-fail", expect.anything());
  });

  it("rejects an HTTP webhook request with a missing or invalid signature", async () => {
    vi.mocked(verifyLineSignature).mockReturnValue(false);
    const app = express(); registerLineWebhook(app);
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/line/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-line-signature": "bad" }, body: "{}" });
    await new Promise<void>(resolve => server.close(() => resolve()));
    expect(response.status).toBe(401);
  });
});

describe("rich menu webhook regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MILO_PRO_MAX_LINE_USER_IDS = "U1";
    vi.mocked(db.isAdminLinkedLineUser).mockResolvedValue(true);
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "test" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.resolveFinanceAccountForLineEvent).mockResolvedValue({ account: { id: 7 }, membership: { role: "owner" } } as never);
    vi.mocked(db.listBudgets).mockResolvedValue([]);
    vi.mocked(db.listTransactions).mockResolvedValue([]);
    vi.mocked(db.searchTransactions).mockResolvedValue([]);
    vi.mocked(db.financeReport).mockResolvedValue({period:"month",income:0,expense:0,balance:0,categories:{}} as never);
    vi.mocked(db.financeBudgetCycleReport).mockResolvedValue({key:"2026-09",period:"budget-cycle",income:0,expense:0,balance:0,categories:{},rows:[]} as never);
    vi.mocked(db.getFinanceAccountBudgetCycleStartDay).mockResolvedValue(1 as never);
    vi.mocked(db.listTransactionCategories).mockResolvedValue([]);
  });
  const event = (text: string) => ({ type: "message", webhookEventId: "richmenu-test", timestamp: Date.now(), replyToken: "token", source: { type: "user" as const, userId: "U1" }, message: { id: "menu", type: "text" as const, text } });
  it.each([["จดบันทึก","menu"],["งบประมาณ","analysis-budget"],["หมวดหมู่","analysis-budget"],["วิธีใช้งาน","settings-help"]] as const)("%s replies with the matching Milo themed Flex card", async (text, artwork) => {
    await processEvent(event(text), "{}");

    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.any(String), artwork);
    expect(db.finishWebhookEvent).toHaveBeenCalledWith("richmenu-test", "processed");
  });
  it("รายการ replies with the real transaction list", async () => {
    vi.mocked(db.listTransactions).mockResolvedValue([{ id: 12, transactionType: "expense", amount: 80, category: "อาหาร", note: "กาแฟ" }] as never);
    await processEvent(event("รายการ"), "{}");
    expect(replyTransactionList).toHaveBeenCalledWith("token", expect.arrayContaining([expect.objectContaining({ id: 12, title: expect.stringContaining("80") })]));
  });
  it("ตั้งค่า opens the Milo settings hub", async () => {
    await processEvent(event("ตั้งค่า"), "{}");
    expect(replyMiloSettings).toHaveBeenCalledWith("token");

    expect(replyText).not.toHaveBeenCalled();
  });
  it("สวัสดีไมโล greets and opens the main action shortcuts", async () => {
    vi.mocked(replyGreetingHome).mockResolvedValue(new Response());
    await processEvent(event("สวัสดีไมโล"), "{}");
    expect(replyGreetingHome).toHaveBeenCalledWith("token", expect.any(Object), expect.objectContaining({ income: 0, expense: 0, balance: 0 }));

    expect(replyText).not.toHaveBeenCalled();
    expect(db.finishWebhookEvent).toHaveBeenCalledWith("richmenu-test", "processed");
  });

  it.each(["งบประมาณ", "รายการ"])("%s denies unavailable account before reading data", async text => {
    vi.mocked(db.resolveFinanceAccountForLineEvent).mockResolvedValue(undefined);
    await processEvent(event(text), "{}");
    expect(db.listBudgets).not.toHaveBeenCalled();
    expect(db.listTransactions).not.toHaveBeenCalled();

    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("ยังไม่พบบัญชี"));
  });
  it("analysis computes actual account data and replies natively", async () => {
    vi.mocked(generateFinancialInsight).mockResolvedValue({ dataSufficiency: "limited", summary: "ข้อมูลจริง", highlights: [], suggestedActions: [] } as never);
    await processEvent(event("วิเคราะห์"), "{}");
    expect(db.financeReport).toHaveBeenCalledWith("U1", "month", expect.any(Date), 7);
    expect(generateFinancialInsight).toHaveBeenCalled();

    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("ข้อมูลจริง"), "analysis-budget");
  });
  it.each([["สรุป","year"],["สรุปวันนี้","day"],["สรุปสัปดาห์นี้","week"],["สรุปเดือนนี้","month"],["สรุปปีนี้","year"]])("%s loads the requested period", async (text,period) => {
    await processEvent(event(text), "{}");
    expect(db.financeReport).toHaveBeenCalledWith("U1", period, expect.any(Date), 7);
    expect(replyFinanceReportCard).toHaveBeenCalled();
  });
  it("budget overview includes real category spending and replies natively", async () => {
    vi.mocked(db.listBudgets).mockResolvedValue([{category:"อาหาร",amount:"5000"}] as never);
    vi.mocked(db.financeBudgetCycleReport).mockResolvedValue({key:"2026-09",period:"budget-cycle",categories:{อาหาร:125},income:0,expense:125,balance:-125,rows:[]} as never);
    await processEvent(event("งบประมาณ"), "{}");

    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("ใช้ไป 125 / งบ 5,000"), "analysis-budget");
  });
  it("falls back to useful text when artwork is rejected", async () => {
    vi.mocked(replyThemedTextCard).mockRejectedValueOnce(new Error("flex rejected"));
    await processEvent(event("จดบันทึก"), "{}");
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("จดบันทึก"));
  });

  it("handles recurring, export and custom budget-cycle commands", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    vi.mocked(db.createRecurringTransaction).mockResolvedValue(91 as never);
    vi.mocked(db.updateFinanceAccountBudgetCycleStartDay).mockResolvedValue(14 as never);
    const event = (id: string, text: string) => ({ type: "message", webhookEventId: id, timestamp: new Date("2026-09-12T14:00:00Z").getTime(), replyToken: "token", source: { type: "user" as const, userId: "U1" }, message: { id, type: "text" as const, text } });
    await processEvent(event("evt-cycle", "ตั้งวันเริ่มงบ 14"), "{}");
    expect(db.updateFinanceAccountBudgetCycleStartDay).toHaveBeenCalledWith(7, 14);
    await processEvent(event("evt-rec", "ตั้งจดอัตโนมัติ ค่าเช่า 5000 ทุกเดือนวันที่ 1 09:00"), "{}");
    expect(db.createRecurringTransaction).toHaveBeenCalledWith(expect.objectContaining({ financeAccountId: 7, amount: 5000, recurrenceType: "month" }));
    await processEvent(event("evt-export", "ส่งออก CSV"), "{}");
    expect(replyThemedTextCard).toHaveBeenCalledWith("token", expect.stringContaining("https://example.com/export"), "utility");
  });
});
