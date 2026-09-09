export const dashboardSectionIds = ["overview", "analysis", "budgets", "transactions", "recurring", "vault", "tasks", "groups", "export", "admin"] as const;

export type DashboardSectionId = (typeof dashboardSectionIds)[number];

type ScrollableSection = { scrollIntoView: (options: ScrollIntoViewOptions) => void };
type SectionRoot = { getElementById: (id: string) => ScrollableSection | null };

const sectionTargets: Record<DashboardSectionId, string> = {
  overview: "overview",
  analysis: "finance",
  budgets: "budgets",
  transactions: "transactions-main",
  recurring: "reminders",
  vault: "vault-management",
  tasks: "tasks",
  groups: "groups",
  export: "export",
  admin: "admin-governance",
};

export function scrollToDashboardSection(id: DashboardSectionId, root: SectionRoot = document) {
  const section = root.getElementById(sectionTargets[id]);
  if (!section) return false;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

