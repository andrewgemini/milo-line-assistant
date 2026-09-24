import { classifyMiloIntent, jevModel, type JevMiloIntent, type JevMiloRoutingResult, systemOneConfigured } from "../_core/typeSafe";
import { parseMiloCommand, type MiloCommand } from "./commandParser";

export type MiloIntentDecision = JevMiloRoutingResult & {
  source: "openthai" | "jev" | "deterministic";
  fallbackReason?: "systemone_unavailable" | "systemone_error" | "low_confidence";
};

type RouterOptions = {
  env?: NodeJS.ProcessEnv;
  classify?: (text: string, env?: NodeJS.ProcessEnv) => Promise<JevMiloRoutingResult>;
};

export function jevRouterMinConfidence(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.MILO_JEV_ROUTER_MIN_CONFIDENCE ?? "0.72");
  return Number.isFinite(parsed) && parsed >= 0.5 && parsed <= 0.99 ? parsed : 0.72;
}

function flagsForIntent(intent: JevMiloIntent): Pick<MiloIntentDecision, "requiresDatabase" | "requiresLLM" | "requiresConfirmation" | "riskLevel"> {
  switch (intent) {
    case "transaction":
      return { requiresDatabase: true, requiresLLM: false, requiresConfirmation: true, riskLevel: "medium" };
    case "finance_summary":
    case "budget":
      return { requiresDatabase: true, requiresLLM: false, requiresConfirmation: false, riskLevel: "low" };
    case "financial_analysis":
      return { requiresDatabase: true, requiresLLM: true, requiresConfirmation: false, riskLevel: "low" };
    case "reminder":
    case "calendar":
    case "todo":
    case "vault":
    case "document":
      return { requiresDatabase: true, requiresLLM: false, requiresConfirmation: true, riskLevel: "medium" };
    case "confirmation":
      return { requiresDatabase: true, requiresLLM: false, requiresConfirmation: true, riskLevel: "high" };
    case "settings":
    case "export":
      return { requiresDatabase: true, requiresLLM: false, requiresConfirmation: false, riskLevel: "medium" };
    case "general_chat":
      return { requiresDatabase: false, requiresLLM: true, requiresConfirmation: false, riskLevel: "low" };
    case "help":
    case "greeting":
    case "unknown":
      return { requiresDatabase: false, requiresLLM: false, requiresConfirmation: false, riskLevel: "low" };
  }
}

export function intentForCommand(command: MiloCommand): JevMiloIntent {
  switch (command.type) {
    case "expense":
    case "income":
    case "transactionSearch":
    case "transactionUndo":
    case "transactionDelete":
    case "transactionUpdate":
    case "openingBalance":
    case "recurringCreate":
    case "recurringList":
    case "recurringStatus":
    case "pendingBillList":
    case "pendingBillPay":
    case "pendingBillCancel":
      return "transaction";
    case "financeReport":
    case "transactionList":
    case "todayOverview":
    case "morningBrief":
    case "eveningSummary":
      return "finance_summary";
    case "aiSummary":
      return "financial_analysis";
    case "budget":
    case "budgetCycleStart":
    case "budgetOverview":
    case "categoryAdd":
    case "categoryRemove":
    case "categoryList":
      return "budget";
    case "reminder":
    case "reminderList":
    case "reminderCancel":
    case "followUp":
      return "reminder";
    case "calendarCreate":
    case "calendarList":
    case "calendarCancel":
    case "calendarConnect":
    case "calendarDisconnect":
    case "calendarStatus":
      return "calendar";
    case "vault":
    case "vaultStatus":
    case "search":
      return "vault";
    case "documentPacket":
    case "documentIssues":
    case "imageConfirm":
    case "imageEdit":
    case "pdfConfirm":
    case "voiceConfirm":
    case "voiceEdit":
    case "voiceEditPrompt":
    case "voiceCategoryChange":
      return "document";
    case "note":
    case "todo":
    case "todoList":
    case "todoComplete":
    case "mention":
      return "todo";
    case "settingGuide":
    case "dashboardGuide":
    case "groupGuide":
      return "settings";
    case "exportFinance":
      return "export";
    case "captureConfirm":
    case "captureCancel":
      return "confirmation";
    case "captureDraft":
      return "document";
    case "help":
    case "recordGuide":
      return "help";
    case "greeting":
      return "greeting";
    case "invalid":
    case "unknown":
      return "unknown";
  }
}

export function deterministicIntentDecision(text: string, env: NodeJS.ProcessEnv = process.env): MiloIntentDecision {
  const command = parseMiloCommand(text);
  const intent = intentForCommand(command);
  return {
    intent,
    confidence: command.type === "unknown" ? 0.35 : command.type === "invalid" ? 0.7 : 1,
    ...flagsForIntent(intent),
    model: jevModel(env),
    source: "deterministic",
  };
}

export async function routeMiloIntent(text: string, options: RouterOptions = {}): Promise<MiloIntentDecision> {
  const env = options.env ?? process.env;
  const classify = options.classify ?? classifyMiloIntent;
  const deterministic = () => deterministicIntentDecision(text, env);

  if (!systemOneConfigured(env)) {
    return { ...deterministic(), fallbackReason: "systemone_unavailable" };
  }

  try {
    const decision = await classify(text, env);
    if (decision.confidence >= jevRouterMinConfidence(env)) {
      return { ...decision, source: decision.provider ?? "jev" };
    }
    return { ...deterministic(), fallbackReason: "low_confidence" };
  } catch {
    return { ...deterministic(), fallbackReason: "systemone_error" };
  }
}

export function routingLog(decision: MiloIntentDecision) {
  return {
    intent: decision.intent,
    confidence: Number(decision.confidence.toFixed(3)),
    source: decision.source,
    fallbackReason: decision.fallbackReason,
    requiresDatabase: decision.requiresDatabase,
    requiresLLM: decision.requiresLLM,
    requiresConfirmation: decision.requiresConfirmation,
    riskLevel: decision.riskLevel,
    model: decision.model,
  };
}
