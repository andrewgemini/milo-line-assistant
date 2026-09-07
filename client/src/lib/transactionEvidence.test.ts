import { describe, expect, it } from "vitest";
import { transactionEvidenceForRow } from "./transactionEvidence";

describe("transaction evidence rows", () => {
  const evidence = [
    { id: 1, transactionId: 10, label: "ใบเสร็จต้นฉบับ", title: "receipt.jpg", storageUrl: "/manus-storage/receipt", sourceUrl: null },
    { id: 2, transactionId: 20, label: "ไฟล์เสียงต้นฉบับ", title: "voice.m4a", storageUrl: "/manus-storage/voice", sourceUrl: null },
  ];

  it("maps evidence to only the transaction row that owns it", () => {
    expect(transactionEvidenceForRow(10, evidence)).toEqual([evidence[0]]);
    expect(transactionEvidenceForRow(20, evidence)).toEqual([evidence[1]]);
  });

  it("returns an empty cell state for a transaction with no linked evidence", () => {
    expect(transactionEvidenceForRow(30, evidence)).toEqual([]);
  });
});
