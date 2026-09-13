export type MiloPlan = "free" | "pro" | "pro_max";

export type MiloEntitlement =
  | "reminders"
  | "advancedCharts"
  | "customBudgetCycle"
  | "pdf"
  | "groupAccounting"
  | "multipleAccounts";

const PLAN_RANK: Record<MiloPlan, number> = { free: 0, pro: 1, pro_max: 2 };

export const MILO_ENTITLEMENT_MIN_PLAN: Record<MiloEntitlement, MiloPlan> = {
  reminders: "pro",
  advancedCharts: "pro",
  customBudgetCycle: "pro",
  pdf: "pro_max",
  groupAccounting: "pro_max",
  multipleAccounts: "pro_max",
};

export const MILO_PLAN_CAPABILITIES = {
  free: {
    label: "Free",
    included: ["categories", "budget", "monthlySummary"] as const,
  },
  pro: {
    label: "Pro",
    included: ["categories", "budget", "monthlySummary", "reminders", "advancedCharts", "customBudgetCycle"] as const,
  },
  pro_max: {
    label: "Pro Max",
    included: ["categories", "budget", "monthlySummary", "reminders", "advancedCharts", "customBudgetCycle", "pdf", "groupAccounting", "multipleAccounts"] as const,
  },
} as const;

function parseLineUserSet(value: string | undefined) {
  return new Set((value ?? "").split(",").map(item => item.trim()).filter(Boolean));
}

/**
 * Production-safe plan resolver.
 * Users are Free by default. A LINE user linked to a dashboard admin is bootstrapped as Pro Max for operations/UAT.
 * Other paid access is granted through explicit LINE User ID allowlists. MILO_PRO_MAX_LINE_USER_IDS takes precedence over MILO_PRO_LINE_USER_IDS.
 */
export function resolveMiloPlan(lineUserId: string, env: NodeJS.ProcessEnv = process.env, adminLinked = false): MiloPlan {
  if (!lineUserId) return "free";
  if (adminLinked) return "pro_max";
  if (parseLineUserSet(env.MILO_PRO_MAX_LINE_USER_IDS).has(lineUserId)) return "pro_max";
  if (parseLineUserSet(env.MILO_PRO_LINE_USER_IDS).has(lineUserId)) return "pro";
  return "free";
}

export function hasMiloEntitlement(plan: MiloPlan, entitlement: MiloEntitlement) {
  return PLAN_RANK[plan] >= PLAN_RANK[MILO_ENTITLEMENT_MIN_PLAN[entitlement]];
}

export function requiredPlanFor(entitlement: MiloEntitlement) {
  return MILO_ENTITLEMENT_MIN_PLAN[entitlement];
}

export function entitlementMessage(entitlement: MiloEntitlement) {
  const plan = requiredPlanFor(entitlement);
  const label = MILO_PLAN_CAPABILITIES[plan].label;
  return `ฟีเจอร์นี้อยู่ในแพ็กเกจ ${label} กรุณาอัปเกรดแพ็กเกจก่อนใช้งานครับ`;
}

export function assertMiloEntitlement(plan: MiloPlan, entitlement: MiloEntitlement) {
  if (!hasMiloEntitlement(plan, entitlement)) throw new Error(entitlementMessage(entitlement));
}
