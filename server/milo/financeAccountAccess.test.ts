import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", async () => {
  const actual = await vi.importActual<typeof import("../db")>("../db");
  return {
    ...actual,
    getLinkedLineUser: vi.fn(),
    getOrCreatePersonalFinanceAccount: vi.fn(),
    getFinanceAccountAccess: vi.fn(),
    listTransactions: vi.fn(),
    listTransactionAttachmentsForFinanceAccount: vi.fn(),
    createTransaction: vi.fn(),
    isEligibleGroupFinanceAccountMember: vi.fn(),
    upsertFinanceAccountMember: vi.fn(),
    writeAuditLog: vi.fn(),
  };
});

import * as db from "../db";
import { appRouter } from "../routers";

const ownerLineUserId = `U${"a".repeat(32)}`;
const memberLineUserId = `U${"b".repeat(32)}`;

const personalAccount = { id: 11, accountType: "personal" as const, name: "บัญชีส่วนตัว", ownerLineUserId, lineChatId: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
const groupAccount = { id: 22, accountType: "group" as const, name: "ค่าใช้จ่ายทีม", ownerLineUserId, lineChatId: "G-team", isActive: true, createdAt: new Date(), updatedAt: new Date() };

function caller() {
  return appRouter.createCaller({
    user: { id: 12, openId: "member", name: "ผู้ใช้", email: null, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { headers: {} }, res: {},
  } as never);
}

function access(account: typeof personalAccount | typeof groupAccount, role: "owner" | "manager" | "contributor" | "viewer") {
  return { account, membership: { id: 1, financeAccountId: account.id, lineUserId: ownerLineUserId, role, createdAt: new Date(), updatedAt: new Date() } };
}

describe("finance account access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getLinkedLineUser).mockResolvedValue(ownerLineUserId);
    vi.mocked(db.getOrCreatePersonalFinanceAccount).mockResolvedValue(personalAccount as never);
    vi.mocked(db.listTransactions).mockResolvedValue([] as never);
    vi.mocked(db.listTransactionAttachmentsForFinanceAccount).mockResolvedValue([] as never);
    vi.mocked(db.writeAuditLog).mockResolvedValue(undefined);
  });

  it("keeps the existing no-account request in the caller's personal ledger", async () => {
    await expect(caller().milo.finance.transactions()).resolves.toEqual([]);
    expect(db.getOrCreatePersonalFinanceAccount).toHaveBeenCalledWith(ownerLineUserId);
    expect(db.listTransactions).toHaveBeenCalledWith(ownerLineUserId, undefined, undefined, false, 11);
  });

  it("rejects a requested ledger when the user is not a member", async () => {
    vi.mocked(db.getFinanceAccountAccess).mockResolvedValue(undefined);
    await expect(caller().milo.finance.transactions({ financeAccountId: 22 })).rejects.toThrow("คุณไม่มีสิทธิ์เข้าถึงสมุดบัญชีนี้");
    expect(db.listTransactions).not.toHaveBeenCalled();
  });

  it("lists attachment evidence only after verifying the requested ledger membership", async () => {
    vi.mocked(db.getFinanceAccountAccess).mockResolvedValue(access(groupAccount, "viewer") as never);
    await expect(caller().milo.finance.attachments({ financeAccountId: 22, transactionIds: [71, 72] })).resolves.toEqual([]);
    expect(db.listTransactionAttachmentsForFinanceAccount).toHaveBeenCalledWith([71, 72], 22);
  });

  it("does not request attachment evidence from a ledger the user cannot access", async () => {
    vi.mocked(db.getFinanceAccountAccess).mockResolvedValue(undefined);
    await expect(caller().milo.finance.attachments({ financeAccountId: 22, transactionIds: [71] })).rejects.toThrow("คุณไม่มีสิทธิ์เข้าถึงสมุดบัญชีนี้");
    expect(db.listTransactionAttachmentsForFinanceAccount).not.toHaveBeenCalled();
  });

  it("allows a contributor to create in a group ledger but assigns that ledger explicitly", async () => {
    vi.mocked(db.getFinanceAccountAccess).mockResolvedValue(access(groupAccount, "contributor") as never);
    vi.mocked(db.createTransaction).mockResolvedValue(77);
    await expect(caller().milo.finance.create({ financeAccountId: 22, transactionType: "expense", amount: 320, category: "อาหาร", note: "มื้อทีม" })).resolves.toEqual({ id: 77 });
    expect(db.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ financeAccountId: 22, lineChatId: "G-team", lineUserId: ownerLineUserId, source: "dashboard" }));
  });

  it("prevents a viewer from creating a transaction", async () => {
    vi.mocked(db.getFinanceAccountAccess).mockResolvedValue(access(groupAccount, "viewer") as never);
    await expect(caller().milo.finance.create({ financeAccountId: 22, transactionType: "expense", amount: 320, category: "อาหาร" })).rejects.toThrow("ผู้ดู");
    expect(db.createTransaction).not.toHaveBeenCalled();
  });

  it("lets only a ledger owner grant a group member a role", async () => {
    vi.mocked(db.getFinanceAccountAccess).mockResolvedValue(access(groupAccount, "owner") as never);
    vi.mocked(db.isEligibleGroupFinanceAccountMember).mockResolvedValue(true);
    vi.mocked(db.upsertFinanceAccountMember).mockResolvedValue(undefined);
    await expect(caller().milo.financeAccounts.upsertMember({ financeAccountId: 22, lineUserId: memberLineUserId, role: "manager" })).resolves.toEqual({ success: true });
    expect(db.upsertFinanceAccountMember).toHaveBeenCalledWith({ financeAccountId: 22, lineUserId: memberLineUserId, role: "manager" });
  });

  it("prevents a manager from changing group membership", async () => {
    vi.mocked(db.getFinanceAccountAccess).mockResolvedValue(access(groupAccount, "manager") as never);
    await expect(caller().milo.financeAccounts.upsertMember({ financeAccountId: 22, lineUserId: memberLineUserId, role: "viewer" })).rejects.toThrow("เฉพาะเจ้าของ");
    expect(db.upsertFinanceAccountMember).not.toHaveBeenCalled();
  });
});
