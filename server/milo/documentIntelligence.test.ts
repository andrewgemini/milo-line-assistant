import { describe, expect, it } from "vitest";
import {
  bangkokMonthRange,
  buildDocumentIntelligence,
  classifyDocumentKind,
  deriveDocumentStatus,
  fingerprintMedia,
  summarizeVaultDocuments,
} from "./documentIntelligence";

describe("Milo document intelligence", () => {
  it("creates a stable SHA-256 fingerprint for duplicate detection", () => {
    expect(fingerprintMedia(Buffer.from("same-file"))).toBe(fingerprintMedia(Buffer.from("same-file")));
    expect(fingerprintMedia(Buffer.from("same-file"))).not.toBe(fingerprintMedia(Buffer.from("other-file")));
  });

  it("classifies Thai accounting documents from OCR context", () => {
    expect(classifyDocumentKind({ filename: "receipt.jpg", mimeType: "image/jpeg", analysis: { summary: "ใบกำกับภาษีเต็มรูป" } })).toBe("tax_invoice");
    expect(classifyDocumentKind({ filename: "statement-kbank.pdf", mimeType: "application/pdf" })).toBe("bank_statement");
    expect(classifyDocumentKind({ filename: "slip.jpg", mimeType: "image/jpeg", analysis: { summary: "สลิปพร้อมเพย์" } })).toBe("bank_slip");
  });

  it("builds searchable OCR metadata and workflow tags", () => {
    const result = buildDocumentIntelligence({
      filename: "IMG_1001.jpg",
      mimeType: "image/jpeg",
      storageReady: true,
      fingerprint: "abc123",
      senderDisplayName: "พี่เอก",
      analysis: {
        summary: "ใบเสร็จร้านกาแฟ",
        confidence: 0.92,
        proposals: [{ documentType: "receipt", merchant: "INDI Coffee", amount: 16, dateText: "2026-09-16", category: "อาหาร" }],
      },
    });
    expect(result.status).toBe("ready");
    expect(result.kind).toBe("receipt");
    expect(result.title).toContain("INDI Coffee");
    expect(result.searchableText).toContain("พี่เอก");
    expect(result.searchableText).toContain("16");
    expect(result.tagsText).toContain("#doc:ready");
    expect(result.tagsText).toContain("#sha256:abc123");
  });

  it("detects review, password and missing-storage states", () => {
    expect(deriveDocumentStatus({ storageReady: true, analysis: { confidence: 0.2, proposals: [] } })).toBe("needs_review");
    expect(deriveDocumentStatus({ storageReady: true, error: new Error("PDF is password protected") })).toBe("password_required");
    expect(deriveDocumentStatus({ storageReady: false })).toBe("storage_missing");
  });

  it("summarizes monthly document readiness without counting issues as ready", () => {
    const packet = summarizeVaultDocuments([
      { id: 1, title: "ใบเสร็จ A", itemType: "image", storageKey: "a", tagsText: "#doc:ready #kind:receipt" },
      { id: 2, title: "Statement", itemType: "file", storageKey: "b", tagsText: "#doc:password_required #kind:bank_statement" },
      { id: 3, title: "รูปซ้ำ", itemType: "image", storageKey: "a", tagsText: "#doc:duplicate #kind:receipt" },
    ]);
    expect(packet).toMatchObject({ total: 3, ready: 1, duplicates: 1, storageMissing: 0 });
    expect(packet.issues.map(item => item.id)).toEqual([2]);
  });

  it("uses Bangkok month boundaries", () => {
    const range = bangkokMonthRange(new Date("2026-09-16T08:00:00.000Z"));
    expect(range.key).toBe("2026-09");
    expect(range.start.toISOString()).toBe("2026-08-31T17:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });
});
