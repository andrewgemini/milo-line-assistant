import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

vi.mock("../db", () => ({
  registerWebhookEvent: vi.fn(),
  upsertLineChat: vi.fn(),
  upsertLineMember: vi.fn(),
  finishWebhookEvent: vi.fn(),
  findLineMemberByName: vi.fn(),
  createReminder: vi.fn(),
  createTransaction: vi.fn(),
  linkTransactionAttachment: vi.fn(),
  createNote: vi.fn(),
  createTodo: vi.fn(),
  createVaultItem: vi.fn(),
  searchVault: vi.fn(),
  addExpenseCategory: vi.fn(),
  listExpenseCategories: vi.fn(),
  listTransactionCategories: vi.fn(),
  saveImageExtraction: vi.fn(),
  latestImageExtraction: vi.fn(),
  setImageExtractionStatus: vi.fn(),
  saveVoiceTranscription: vi.fn(),
  latestProposedVoiceTranscription: vi.fn(),
  updateVoiceTranscriptionStatus: vi.fn(),
  updateVoiceTranscript: vi.fn(),
  resolveFinanceAccountForLineEvent: vi.fn(),
  canCreateFinanceTransaction: vi.fn(() => true),
  canManageFinanceTransactions: vi.fn(() => true),
  canManageFinanceSettings: vi.fn(() => true),
  financeReport: vi.fn(),
}));
vi.mock("../storage", () => ({ storageGetSignedUrl: vi.fn(), storagePut: vi.fn() }));
vi.mock("./imageAnalysis", () => ({ analyzeImage: vi.fn() }));
vi.mock("../_core/voiceTranscription", () => ({ transcribeAudio: vi.fn() }));
vi.mock("./financialAssistant", () => ({ generateFinancialInsight: vi.fn(), suggestExpenseCategory: vi.fn() }));
vi.mock("./line", () => ({
  getMessageContent: vi.fn(), getProfile: vi.fn(), lineCredentials: vi.fn(() => ({ channelSecret: "test-secret", channelAccessToken: "test-token" })), pushText: vi.fn(), replyMention: vi.fn(), replyText: vi.fn(),
  replyVoiceProposal: vi.fn(), replyPostSaveSummary: vi.fn(), replyPostSaveSummaryFallback: vi.fn(), replyVoiceCategoryChoices: vi.fn(), postSaveSummaryText: vi.fn((summary: { amount: number }) => `รายจ่าย ${summary.amount} บาท`), replyFinanceReportCard: vi.fn(), replyFinanceReportCardFallback: vi.fn(), financeReportCardText: vi.fn(() => "สรุปการเงินวันนี้"),
  sourceIdentity: vi.fn(() => ({ lineChatId: "G1", lineUserId: "U1", scope: "group" })), verifyLineSignature: vi.fn(),
}));

import * as db from "../db";
import { getMessageContent, getProfile, replyFinanceReportCard, replyMention, replyPostSaveSummary, replyText, replyVoiceCategoryChoices, replyVoiceProposal, sourceIdentity, verifyLineSignature } from "./line";
import { storageGetSignedUrl, storagePut } from "../storage";
import { analyzeImage } from "./imageAnalysis";
import { transcribeAudio } from "../_core/voiceTranscription";
import { suggestExpenseCategory } from "./financialAssistant";
import { processEvent, registerLineWebhook } from "./routes";

describe("LINE webhook processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.resolveFinanceAccountForLineEvent).mockResolvedValue({ account: { id: 7 }, membership: { role: "owner" } } as never);
    vi.mocked(db.canCreateFinanceTransaction).mockReturnValue(true);
    vi.mocked(db.canManageFinanceTransactions).mockReturnValue(true);
    vi.mocked(db.canManageFinanceSettings).mockReturnValue(true);
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
    expect(replyText).toHaveBeenCalledWith("token", "รูปแบบงบประมาณ: ตั้งงบ อาหาร 5000 บาท");
  });

  it("replies with a helpful validation message for an incomplete category command", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-invalid-category", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "m4", type: "text", text: "เพิ่มหมวด" } }, "{}");
    expect(replyText).toHaveBeenCalledWith("token", "กรุณาระบุชื่อหมวด เช่น เพิ่มหมวดรายจ่าย เดินทาง");
  });

  it("returns a LINE User ID only to a private chat for dashboard linking", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValueOnce({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    await processEvent({ type: "message", webhookEventId: "evt-line-id", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "m5", type: "text", text: "ไอดี" } }, "{}");
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("U1"));
  });

  it("persists and replies to the help-menu text workflows in a private chat", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(replyText).mockResolvedValue(new Response());
    vi.mocked(db.createReminder).mockResolvedValue(71 as never);
    vi.mocked(db.searchVault).mockResolvedValue([{ title: "ใบเสร็จร้านกาแฟ" }] as never);
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

    expect(db.createReminder).toHaveBeenCalledWith(expect.objectContaining({ lineChatId: "U1", createdByLineUserId: "U1" }));
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionType: "expense", amount: 65, category: "อาหาร" }));
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionType: "income", amount: 45000, category: "เงินเดือน" }));
    expect(db.createNote).toHaveBeenCalledWith("U1", "U1", "รหัส Wi‑Fi ห้องประชุม", "รหัส Wi‑Fi ห้องประชุม");
    expect(db.createTodo).toHaveBeenCalledWith("U1", "U1", "ส่งสรุปรายสัปดาห์");
    expect(db.createVaultItem).toHaveBeenCalledWith(expect.objectContaining({ itemType: "link", sourceUrl: "https://example.com/brief", tagsText: "#งาน" }));
    expect(db.searchVault).toHaveBeenCalledWith("U1", "ใบเสร็จ");
    expect(db.addExpenseCategory).toHaveBeenCalledWith("U1", "เดินทาง", "expense", 7);
    expect(db.addExpenseCategory).toHaveBeenCalledWith("U1", "โบนัส", "income", 7);
    expect(db.listTransactionCategories).toHaveBeenCalledWith("U1", 7);
    expect(replyPostSaveSummary).toHaveBeenCalledWith("token", expect.objectContaining({ transactionType: "expense", amount: 65, category: "อาหาร", dailyExpense: 65 }));
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("สวัสดีครับ ผมไมโล"));
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
    vi.mocked(db.latestImageExtraction).mockResolvedValue({ extraction: { id: 3, status: "proposed", extractedJson: JSON.stringify(receiptAnalysis) }, vault: { id: 9, storageKey: "milo/U1/img-1" } } as never);
    await processEvent({ type: "message", webhookEventId: "evt-confirm-receipt", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "txt-1", type: "text", text: "ยืนยันค่าใช้จ่าย" } }, "{}");
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ lineChatId: "U1", lineUserId: "U1", transactionType: "expense", amount: 125, category: "อาหาร", occurredAt: new Date(2026, 7, 27, 12, 0, 0, 0) }));
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ note: expect.stringContaining("ร้านค้า/คู่ค้า: ร้านกาแฟ") }));
    expect(db.linkTransactionAttachment).toHaveBeenCalledWith({ transactionId: 155, vaultItemId: 9, lineUserId: "U1", label: "ใบเสร็จต้นฉบับ" });
    expect(db.setImageExtractionStatus).toHaveBeenCalledWith(3, "accepted");
    expect(replyPostSaveSummary).toHaveBeenCalledWith("token", expect.objectContaining({ transactionType: "expense", amount: 125, category: "อาหาร", dailyExpense: 125 }));
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
    expect(replyText).toHaveBeenCalledWith("token", expect.stringContaining("จึงยังไม่บันทึก"));
  });

  it("routes an audio message to transcription and replies with the transcript without creating a transaction", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(getMessageContent).mockResolvedValue(Buffer.from("voice-bytes"));
    vi.mocked(storagePut).mockResolvedValue({ key: "milo/U1/audio-1", url: "https://storage.example/audio.m4a" });
    vi.mocked(storageGetSignedUrl).mockResolvedValue("https://signed.example/audio.m4a?signature=temporary");
    vi.mocked(db.createVaultItem).mockResolvedValue(12 as never);
    vi.mocked(transcribeAudio).mockResolvedValue({ text: "จ่ายค่าแท็กซี่ 120 บาท", language: "th" } as never);
    vi.mocked(suggestExpenseCategory).mockResolvedValue({ category: "เดินทาง", confidence: 0.94, reason: "แท็กซี่" });
    vi.mocked(replyVoiceProposal).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-audio", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "audio-1", type: "audio", duration: 1000 } }, "{}");

    expect(storageGetSignedUrl).toHaveBeenCalledWith("milo/U1/audio-1");
    expect(transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: "https://signed.example/audio.m4a?signature=temporary", language: "th" }));
    expect(db.saveVoiceTranscription).toHaveBeenCalledWith(expect.objectContaining({ vaultItemId: 12, transcript: "จ่ายค่าแท็กซี่ 120 บาท", proposalJson: expect.stringContaining("เดินทาง") }));
    expect(db.createTransaction).not.toHaveBeenCalled();
    expect(replyVoiceProposal).toHaveBeenCalledWith("token", expect.objectContaining({ transcript: "จ่ายค่าแท็กซี่ 120 บาท", category: "เดินทาง", amount: 120 }));
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
  });

  it("pushes a text summary if both Flex and reply-token fallbacks are rejected", async () => {
    vi.mocked(db.registerWebhookEvent).mockResolvedValue(true);
    vi.mocked(getProfile).mockResolvedValue({ displayName: "ผู้ส่ง" });
    vi.mocked(sourceIdentity).mockReturnValue({ lineChatId: "U1", lineUserId: "U1", scope: "user" });
    vi.mocked(db.financeReport).mockResolvedValue({ period: "day", income: 0, expense: 100, balance: -100, categories: { อาหาร: 100 } } as never);
    vi.mocked(replyPostSaveSummary).mockRejectedValue(new Error("invalid Flex"));
    const line = await import("./line");
    vi.mocked(line.replyPostSaveSummaryFallback).mockRejectedValue(new Error("invalid reply token"));
    vi.mocked(line.pushText).mockResolvedValue(new Response());

    await processEvent({ type: "message", webhookEventId: "evt-save-push-fallback", timestamp: Date.now(), replyToken: "token", source: { type: "user", userId: "U1" }, message: { id: "expense-100", type: "text", text: "จ่ายค่าอาหาร 100 บาท" } }, "{}");

    expect(line.pushText).toHaveBeenCalledWith("U1", expect.stringContaining("รายจ่าย 100 บาท"));
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
