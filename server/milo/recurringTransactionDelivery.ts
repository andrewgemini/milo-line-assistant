import * as db from "../db";

export async function deliverDueRecurringTransactions(now = new Date()) {
  const due = await db.listDueRecurringTransactions(now);
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const rule of due) {
    const periodKey = rule.nextRunAt.toISOString();
    const runId = await db.claimRecurringTransactionRun({ recurringTransactionId: rule.id, periodKey });
    if (!runId) { skipped += 1; continue; }
    try {
      const transactionId = await db.createTransaction({ lineChatId: rule.lineChatId, lineUserId: rule.lineUserId, financeAccountId: rule.financeAccountId ?? undefined, transactionType: rule.transactionType, amount: Number(rule.amount), category: rule.category, note: rule.note ?? undefined, occurredAt: rule.nextRunAt, source: "recurring" });
      const nextRunAt = db.nextRecurringRunAt(rule.nextRunAt, rule.recurrenceType, rule.recurrenceInterval);
      await db.completeRecurringTransactionRun({ runId, recurringTransactionId: rule.id, transactionId, nextRunAt });
      await db.writeAuditLog({ action: "recurring_transaction.created", entityType: "recurring_transaction", entityId: rule.id, actorLineUserId: rule.lineUserId, lineChatId: rule.lineChatId, details: { transactionId, periodKey } });
      created += 1;
    } catch (error) {
      await db.failRecurringTransactionRun(runId, error instanceof Error ? error.message : "recurring transaction failed");
      await db.writeAuditLog({ action: "recurring_transaction.failed", entityType: "recurring_transaction", entityId: rule.id, actorLineUserId: rule.lineUserId, lineChatId: rule.lineChatId, details: { periodKey } });
      failed += 1;
    }
  }
  return { created, skipped, failed };
}
