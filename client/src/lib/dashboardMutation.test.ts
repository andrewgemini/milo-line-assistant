import { describe, expect, it } from "vitest";
import { filterFinanceTransactions, filterVaultMetadata, isContentMutationPending, transactionPageWindow, vaultMetadataPayload } from "./dashboardMutation";

describe("dashboard mutation pending state", () => {
  it("locks content while either todo or vault mutation is pending", () => {
    expect(isContentMutationPending(false, false)).toBe(false);
    expect(isContentMutationPending(true, false)).toBe(true);
    expect(isContentMutationPending(false, true)).toBe(true);
  });

  it("preserves entered metadata and turns deliberately blank fields into null", () => {
    expect(vaultMetadataPayload(4, "  สำคัญ งาน  ", " https://example.com/doc ")).toEqual({ id: 4, tagsText: "สำคัญ งาน", sourceUrl: "https://example.com/doc" });
    expect(vaultMetadataPayload(4, "  ", "")).toEqual({ id: 4, tagsText: null, sourceUrl: null });
  });

  it("keeps transaction pagination in the valid range without adding or changing records", () => {
    expect(transactionPageWindow(41, 1, 20)).toEqual({ page: 1, pageCount: 3, start: 20, end: 40 });
    expect(transactionPageWindow(41, 99, 20)).toEqual({ page: 2, pageCount: 3, start: 40, end: 60 });
    expect(transactionPageWindow(0, 0, 20)).toEqual({ page: 0, pageCount: 1, start: 0, end: 20 });
  });

  it("filters existing transaction rows by Thai category, note, type, or amount without fabricating data", () => {
    const rows = [{ transactionType: "expense", amount: "65", category: "อาหาร", note: "กาแฟ" }, { transactionType: "income", amount: "45000", category: "เงินเดือน", note: null }];
    expect(filterFinanceTransactions(rows, "อาหาร")).toEqual([rows[0]]);
    expect(filterFinanceTransactions(rows, "45000")).toEqual([rows[1]]);
    expect(filterFinanceTransactions(rows, "  ")).toEqual(rows);
    expect(filterFinanceTransactions(rows, "เดินทาง")).toEqual([]);
  });

  it("filters vault metadata by file title, tags, or source link without creating items", () => {
    const items = [{ title: "ใบเสร็จกาแฟ", tagsText: "อาหาร สำคัญ", sourceUrl: null }, { title: "คู่มือประชุม", tagsText: null, sourceUrl: "https://example.com/meeting" }];
    expect(filterVaultMetadata(items, "อาหาร")).toEqual([items[0]]);
    expect(filterVaultMetadata(items, "meeting")).toEqual([items[1]]);
    expect(filterVaultMetadata(items, "ไม่พบ")).toEqual([]);
  });
});
