export type BudgetMetrics = {
  usagePercent: number;
  overPercent: number;
  remaining: number;
  isOverBudget: boolean;
};

export function getBudgetMetrics(spent: number, limit: number): BudgetMetrics {
  const safeSpent = Number.isFinite(spent) ? Math.max(0, spent) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 0;
  if (safeLimit <= 0) return { usagePercent: 0, overPercent: 0, remaining: 0, isOverBudget: false };

  const usagePercent = Math.max(0, Math.round((safeSpent / safeLimit) * 100));
  const remaining = safeLimit - safeSpent;
  const isOverBudget = safeSpent > safeLimit;
  const rawOverPercent = isOverBudget ? ((safeSpent - safeLimit) / safeLimit) * 100 : 0;
  const overPercent = isOverBudget ? Math.max(1, Math.round(rawOverPercent)) : 0;
  return { usagePercent, overPercent, remaining, isOverBudget };
}

export function budgetStatusCopy(category: string, spent: number, limit: number) {
  if (!(Number.isFinite(limit) && limit > 0)) return "";
  const metrics = getBudgetMetrics(spent, limit);
  return metrics.isOverBudget
    ? `หมวด${category}เกินงบ ${metrics.overPercent}% แล้วน่ะจ๊ะ`
    : `หมวด${category}ใช้ไป ${metrics.usagePercent}% ของงบแล้วน่ะจ๊ะ`;
}
