import { createHash } from "node:crypto";

export type DocumentWorkflowStatus =
  | "processing"
  | "stored"
  | "ready"
  | "needs_review"
  | "blurry"
  | "password_required"
  | "storage_missing"
  | "duplicate"
  | "failed";

export type DocumentKind =
  | "receipt"
  | "tax_invoice"
  | "bank_slip"
  | "bank_statement"
  | "invoice"
  | "quotation"
  | "purchase_order"
  | "contract"
  | "audio"
  | "image"
  | "pdf"
  | "file";

type AnalysisProposal = {
  kind?: string;
  documentType?: string;
  title?: string;
  merchant?: string;
  dateText?: string;
  timeText?: string;
  amount?: number;
  currency?: string;
  category?: string;
  paymentMethod?: string;
  receiptNumber?: string;
  note?: string;
  lineItems?: Array<string | { name?: string; quantity?: number; unitPrice?: number; total?: number }>;
};

export type DocumentAnalysis = {
  summary?: string;
  confidence?: number;
  proposals?: AnalysisProposal[];
};

export type VaultDocumentRow = {
  id: number;
  title: string;
  itemType: string;
  mimeType?: string | null;
  storageKey?: string | null;
  tagsText?: string | null;
  capturedAt?: Date | string | null;
};

const KIND_LABELS: Record<DocumentKind, string> = {
  receipt: "ใบเสร็จ",
  tax_invoice: "ใบกำกับภาษี",
  bank_slip: "สลิปโอนเงิน",
  bank_statement: "Statement",
  invoice: "ใบแจ้งหนี้",
  quotation: "ใบเสนอราคา",
  purchase_order: "ใบสั่งซื้อ",
  contract: "สัญญา",
  audio: "ข้อความเสียง",
  image: "รูปภาพ",
  pdf: "PDF",
  file: "ไฟล์",
};

const STATUS_LABELS: Record<DocumentWorkflowStatus, string> = {
  processing: "กำลังประมวลผล",
  stored: "จัดเก็บแล้ว",
  ready: "พร้อมใช้งาน",
  needs_review: "รอตรวจสอบ",
  blurry: "ภาพไม่ชัด",
  password_required: "ไฟล์ติดรหัส",
  storage_missing: "ต้องอัปโหลดซ้ำ",
  duplicate: "ไฟล์ซ้ำ",
  failed: "ประมวลผลไม่สำเร็จ",
};

export function fingerprintMedia(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function proposalText(proposal: AnalysisProposal) {
  const lineItems = (proposal.lineItems ?? []).flatMap(item => typeof item === "string" ? [clean(item)] : [clean(item.name), item.quantity, item.unitPrice, item.total]);
  return [
    proposal.documentType,
    proposal.title,
    proposal.merchant,
    proposal.dateText,
    proposal.timeText,
    proposal.amount,
    proposal.currency,
    proposal.category,
    proposal.paymentMethod,
    proposal.receiptNumber,
    proposal.note,
    ...lineItems,
  ].filter(value => value !== undefined && value !== null && String(value).trim()).join(" ");
}

export function classifyDocumentKind(input: { filename?: string; mimeType?: string; analysis?: DocumentAnalysis }): DocumentKind {
  const firstType = clean(input.analysis?.proposals?.[0]?.documentType).toLowerCase();
  const corpus = [input.filename, input.mimeType, input.analysis?.summary, firstType, ...(input.analysis?.proposals ?? []).map(proposalText)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/bank[_\s-]?slip|สลิป|พร้อมเพย์|promptpay/.test(corpus)) return "bank_slip";
  if (/bank[_\s-]?statement|statement|รายการเดินบัญชี/.test(corpus)) return "bank_statement";
  if (/tax[_\s-]?invoice|ใบกำกับภาษี/.test(corpus)) return "tax_invoice";
  if (/receipt|ใบเสร็จ|บิลเงินสด/.test(corpus)) return "receipt";
  if (/quotation|ใบเสนอราคา/.test(corpus)) return "quotation";
  if (/purchase[_\s-]?order|ใบสั่งซื้อ|\bpo\b/.test(corpus)) return "purchase_order";
  if (/invoice|ใบแจ้งหนี้|ใบวางบิล/.test(corpus)) return "invoice";
  if (/contract|สัญญา/.test(corpus)) return "contract";
  if (/audio\//.test(corpus)) return "audio";
  if (/application\/pdf|\.pdf\b/.test(corpus)) return "pdf";
  if (/image\//.test(corpus)) return "image";
  return "file";
}

export function deriveDocumentStatus(input: {
  storageReady: boolean;
  analysis?: DocumentAnalysis;
  error?: unknown;
  duplicateOf?: number;
}): DocumentWorkflowStatus {
  if (input.duplicateOf) return "duplicate";
  const errorText = input.error instanceof Error ? input.error.message : String(input.error ?? "");
  if (/password|encrypted|locked|รหัส|เข้ารหัส/i.test(errorText)) return "password_required";
  if (input.error) return /blur|blurry|ไม่ชัด|อ่าน.*ไม่ได้|ocr/i.test(errorText) ? "blurry" : "failed";
  if (!input.storageReady) return "storage_missing";
  if (!input.analysis) return "stored";
  const proposals = input.analysis.proposals ?? [];
  const confidence = Number(input.analysis.confidence ?? 0);
  if (!proposals.length || confidence < 0.45) return "needs_review";
  return "ready";
}

export function mergeVaultTags(...values: Array<string | undefined | null>) {
  return Array.from(new Set(values.flatMap(value => (value ?? "").split(/\s+/)).map(value => value.trim()).filter(Boolean))).join(" ").slice(0, 512);
}

export function buildDocumentIntelligence(input: {
  filename?: string;
  mimeType?: string;
  storageReady: boolean;
  fingerprint?: string;
  senderDisplayName?: string;
  analysis?: DocumentAnalysis;
  error?: unknown;
  duplicateOf?: number;
}) {
  const kind = classifyDocumentKind(input);
  const status = deriveDocumentStatus(input);
  const proposals = input.analysis?.proposals ?? [];
  const first = proposals[0];
  const merchant = clean(first?.merchant);
  const title = merchant ? `${KIND_LABELS[kind]} • ${merchant}` : clean(input.filename) || KIND_LABELS[kind];
  const searchableText = [
    input.filename,
    input.senderDisplayName,
    input.analysis?.summary,
    ...proposals.map(proposalText),
    KIND_LABELS[kind],
    STATUS_LABELS[status],
  ].map(clean).filter(Boolean).join(" ").slice(0, 8_000);
  const confidence = Number(input.analysis?.confidence);
  const tagsText = mergeVaultTags(
    `#doc:${status}`,
    `#kind:${kind}`,
    input.fingerprint ? `#sha256:${input.fingerprint}` : undefined,
    input.duplicateOf ? `#duplicate:${input.duplicateOf}` : undefined,
    Number.isFinite(confidence) ? `#confidence:${Math.round(confidence * 100)}` : undefined,
  );
  return { kind, status, title, searchableText, tagsText };
}

export function readDocumentStatus(tagsText?: string | null): DocumentWorkflowStatus {
  const match = tagsText?.match(/#doc:([a-z_]+)/i)?.[1] as DocumentWorkflowStatus | undefined;
  return match && match in STATUS_LABELS ? match : "stored";
}

export function readDocumentKind(tagsText?: string | null, fallback: DocumentKind = "file"): DocumentKind {
  const match = tagsText?.match(/#kind:([a-z_]+)/i)?.[1] as DocumentKind | undefined;
  return match && match in KIND_LABELS ? match : fallback;
}

export function documentStatusLabel(status: DocumentWorkflowStatus) {
  return STATUS_LABELS[status];
}

export function documentKindLabel(kind: DocumentKind) {
  return KIND_LABELS[kind];
}

export function bangkokMonthRange(reference = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" })
    .formatToParts(reference);
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value);
  const start = new Date(Date.UTC(year, month - 1, 1, -7));
  const end = new Date(Date.UTC(year, month, 1, -7));
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}`, start, end };
}

export function summarizeVaultDocuments(rows: VaultDocumentRow[]) {
  const byKind = new Map<DocumentKind, number>();
  const issues: VaultDocumentRow[] = [];
  let ready = 0;
  let duplicates = 0;
  let storageMissing = 0;
  for (const row of rows) {
    const kind = readDocumentKind(row.tagsText, row.mimeType === "application/pdf" ? "pdf" : row.itemType === "image" ? "image" : "file");
    const status = readDocumentStatus(row.tagsText);
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    if (status === "ready" || status === "stored") ready += 1;
    if (status === "duplicate") duplicates += 1;
    if (status === "storage_missing") storageMissing += 1;
    if (["needs_review", "blurry", "password_required", "storage_missing", "failed", "processing"].includes(status)) issues.push(row);
  }
  return {
    total: rows.length,
    ready,
    issues,
    duplicates,
    storageMissing,
    byKind: Array.from(byKind.entries()).sort((a, b) => b[1] - a[1]),
  };
}
