export const MAX_RECURRING_TRANSACTIONS = 20;

export type RecurringStatusLike = { status?: string | null };

export function configuredRecurringCount(items: RecurringStatusLike[]) {
  return items.filter(item => item.status !== "cancelled").length;
}

export function assertRecurringCapacity(items: RecurringStatusLike[]) {
  const count = configuredRecurringCount(items);
  if (count >= MAX_RECURRING_TRANSACTIONS) {
    throw new Error(`ตั้งรายการอัตโนมัติได้สูงสุด ${MAX_RECURRING_TRANSACTIONS} รายการต่อบัญชี กรุณาพัก/ยกเลิกรายการเดิมก่อนเพิ่มรายการใหม่`);
  }
  return { count, remaining: MAX_RECURRING_TRANSACTIONS - count };
}
