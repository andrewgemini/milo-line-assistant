export type TransactionEvidenceReference = {
  id: number;
  transactionId: number;
  label: string | null;
  title: string;
  storageUrl: string | null;
  sourceUrl: string | null;
};

export function transactionEvidenceForRow<T extends TransactionEvidenceReference>(transactionId: number, items: T[]) {
  return items.filter(item => item.transactionId === transactionId);
}
