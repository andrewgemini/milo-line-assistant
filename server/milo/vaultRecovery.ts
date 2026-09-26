import * as db from "../db";
import { storagePut } from "../storage";
import { getMessageContent } from "./line";

function inferMimeType(item: { itemType: string; mimeType?: string | null; originalFilename?: string | null }) {
  if (item.mimeType?.trim()) return item.mimeType.trim();
  const filename = (item.originalFilename || "").toLowerCase();
  if (filename.endsWith(".pdf")) return "application/pdf";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".gif")) return "image/gif";
  if (/\.(jpe?g|jfif)$/.test(filename)) return "image/jpeg";
  if (filename.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (filename.endsWith(".csv")) return "text/csv";
  return item.itemType === "image" ? "image/jpeg" : "application/octet-stream";
}

function safeFilename(value: string | null | undefined) {
  return (value || "media").replace(/[\\/]+/g, "_").replace(/[^A-Za-z0-9\u0E00-\u0E7F._ -]+/g, "_").slice(0, 120) || "media";
}

type RecoverableVaultItem = {
  id: number;
  lineChatId: string;
  itemType: string;
  title: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  lineMessageId?: string | null;
  storageKey?: string | null;
};

export async function recoverVaultItems(items: RecoverableVaultItem[]) {
  let recovered = 0;
  let unavailable = 0;
  let failed = 0;

  for (const item of items) {
    if (item.storageKey || !item.lineMessageId) continue;
    try {
      const bytes = await getMessageContent(item.lineMessageId);
      const mimeType = inferMimeType(item);
      const filename = safeFilename(item.originalFilename || item.title);
      const stored = await storagePut(`milo-recovery/${item.lineChatId}/${item.lineMessageId}-${filename}`, bytes, mimeType);
      const attached = await db.attachVaultStorage({ id: item.id, storageKey: stored.key, storageUrl: stored.url });
      if (attached) {
        recovered += 1;
        console.info("[Milo Vault Recovery] restored missing media", {
          vaultItemId: item.id,
          itemType: item.itemType,
          provider: stored.provider,
          bytes: bytes.length,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      if (/LINE data API 4\d\d|not found|expired/i.test(message)) unavailable += 1;
      else failed += 1;
      console.warn("[Milo Vault Recovery] could not restore media", {
        vaultItemId: item.id,
        itemType: item.itemType,
        error: message,
      });
    }
  }

  return { scanned: items.length, recovered, unavailable, failed };
}

export async function recoverMissingVaultMedia(options: { limit?: number } = {}) {
  const rows = await db.listVaultMediaMissingStorage(options.limit ?? 20);
  return recoverVaultItems(rows);
}
