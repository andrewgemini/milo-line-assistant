export type FinanceSettingsRole = "owner" | "manager" | "contributor" | "viewer";

export function canManageFinanceSettings(role: FinanceSettingsRole) {
  return role === "owner" || role === "manager";
}
