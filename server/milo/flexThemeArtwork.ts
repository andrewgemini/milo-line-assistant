import type { MiloCommand } from "./commandParser";

export const MILO_FLEX_THEME_ARTWORK = {
  home: { file: "home.png" },
  menu: { file: "menu.png" },
  "save-complete": { file: "save-complete.png" },
  "summary-day": { file: "summary-day.png" },
  "summary-period": { file: "summary-period.png" },
  "analysis-budget": { file: "analysis-budget.png" },
  transactions: { file: "transactions.png" },
  utility: { file: "utility.png" },
  "settings-help": { file: "settings-help.png" },
} as const;

export type MiloFlexThemeArtwork = keyof typeof MILO_FLEX_THEME_ARTWORK;

const DEFAULT_BASE_URL = "https://milo-line-assistant.onrender.com";

export function miloFlexThemeImageUrl(key: MiloFlexThemeArtwork, variant: "hero" | "screen" = "hero") {
  const base = (process.env.MILO_PUBLIC_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return new URL(`/milo-flex/${variant === "hero" ? "heroes" : "screens"}/${MILO_FLEX_THEME_ARTWORK[key].file}`, base).href;
}

export function flexThemeForCommand(command: MiloCommand): MiloFlexThemeArtwork | undefined {
  switch (command.type) {
    case "greeting":
      return "home";
    case "recordGuide":
      return "menu";
    case "financeReport":
      return command.period === "day" ? "summary-day" : "summary-period";
    case "todayOverview":
    case "morningBrief":
    case "eveningSummary":
      return "summary-day";
    case "aiSummary":
    case "budgetOverview":
    case "budget":
    case "budgetCycleStart":
    case "openingBalance":
    case "categoryAdd":
    case "categoryRemove":
    case "categoryList":
      return "analysis-budget";
    case "transactionSearch":
    case "transactionList":
    case "transactionUndo":
    case "transactionDelete":
    case "transactionUpdate":
      return "transactions";
    case "expense":
    case "income":
      return "save-complete";
    case "imageConfirm":
    case "pdfConfirm":
    case "voiceConfirm":
    case "reminder":
    case "reminderList":
    case "reminderCancel":
    case "calendarCreate":
    case "calendarList":
    case "calendarCancel":
    case "calendarConnect":
    case "calendarDisconnect":
    case "calendarStatus":
    case "groupGuide":
    case "vault":
    case "vaultStatus":
    case "documentPacket":
    case "documentIssues":
    case "captureDraft":
    case "captureConfirm":
    case "captureCancel":
    case "followUp":
    case "pendingBillList":
    case "pendingBillPay":
    case "pendingBillCancel":
    case "note":
    case "todo":
    case "todoList":
    case "todoComplete":
    case "search":
    case "mention":
    case "exportFinance":
    case "recurringCreate":
    case "recurringList":
    case "recurringStatus":
    case "imageEdit":
    case "voiceEditPrompt":
    case "voiceEdit":
    case "voiceCategoryChange":
      return "utility";
    case "settingGuide":
    case "help":
    case "dashboardGuide":
    case "invalid":
      return "settings-help";
    case "unknown":
      return undefined;
  }
}
