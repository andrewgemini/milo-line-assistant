export function isContentMutationPending(todoPending: boolean, vaultPending: boolean) {
  return todoPending || vaultPending;
}

export function vaultMetadataPayload(id: number, tagsText: string, sourceUrl: string) {
  return { id, tagsText: tagsText.trim() || null, sourceUrl: sourceUrl.trim() || null };
}

export function transactionPageWindow(itemCount: number, requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  return { page, pageCount, start: page * pageSize, end: (page + 1) * pageSize };
}

export type FinanceTransactionFilter = { transactionType?: "all" | "income" | "expense"; category?: string };

export function filterFinanceTransactions<T extends { transactionType: string; amount: string | number; category: string; note: string | null }>(items: T[], query: string, filter: FinanceTransactionFilter = {}) {
  const normalized = query.trim().toLocaleLowerCase("th-TH");
  const transactionType = filter.transactionType ?? "all";
  const category = filter.category?.trim() ?? "";
  return items.filter(item => {
    if (transactionType !== "all" && item.transactionType !== transactionType) return false;
    if (category && item.category !== category) return false;
    if (!normalized) return true;
    return `${item.transactionType} ${item.amount} ${item.category} ${item.note ?? ""}`.toLocaleLowerCase("th-TH").includes(normalized);
  });
}

export function filterVaultMetadata<T extends { title: string; tagsText: string | null; sourceUrl: string | null }>(items: T[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("th-TH");
  if (!normalized) return items;
  return items.filter(item => `${item.title} ${item.tagsText ?? ""} ${item.sourceUrl ?? ""}`.toLocaleLowerCase("th-TH").includes(normalized));
}
