import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

export type JevConfig = {
  jevApiKey?: string;
  jevBaseUrl?: string;
  jevModel?: string;
};

export type SystemOneProvider = "openthai" | "jev";

let client: TypeSafeClient | undefined;
let clientFingerprint = "";

export function jevApiKey(env: NodeJS.ProcessEnv = process.env) {
  return (env.JEV_API_KEY || env.TYPESAFE_API_KEY || "").trim();
}

export function jevBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return (env.JEV_BASE_URL || env.TYPESAFE_BASE_URL || "https://api.typesafe.ai").trim().replace(/\/+$/, "");
}

export function jevModel(env: NodeJS.ProcessEnv = process.env) {
  return (env.JEV_MODEL || env.TYPESAFE_DEFAULT_MODEL || "jev-latest").trim() || "jev-latest";
}

export function typeSafeApiKey(env: NodeJS.ProcessEnv = process.env) {
  return jevApiKey(env);
}

export function typeSafeConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(jevApiKey(env));
}

export function openThaiSystemOneApiKey(env: NodeJS.ProcessEnv = process.env) {
  return (env.OPENTHAI_SYSTEMONE_API_KEY || env.IAPP_API_KEY || "").trim();
}

export function openThaiSystemOneUrl(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.OPENTHAI_SYSTEMONE_URL ||
    env.IAPP_SYSTEMONE_URL ||
    "https://api.iapp.co.th/v3/store/openthai/systemone"
  ).trim().replace(/\/+$/, "");
}

export function openThaiSystemOneModel(env: NodeJS.ProcessEnv = process.env) {
  return (env.OPENTHAI_SYSTEMONE_MODEL || "openthai-systemone").trim() || "openthai-systemone";
}

export function openThaiSystemOneConfigured(env: NodeJS.ProcessEnv = process.env) {
  const explicitUrl = Boolean((env.OPENTHAI_SYSTEMONE_URL || env.IAPP_SYSTEMONE_URL || "").trim());
  return explicitUrl || Boolean(openThaiSystemOneApiKey(env));
}

export function systemOneConfigured(env: NodeJS.ProcessEnv = process.env) {
  return openThaiSystemOneConfigured(env) || typeSafeConfigured(env);
}

export function systemOneProviderOrder(env: NodeJS.ProcessEnv = process.env): SystemOneProvider[] {
  const raw = (env.MILO_SYSTEMONE_PROVIDER_ORDER || "openthai,jev")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  const order = raw.filter((item): item is SystemOneProvider => item === "openthai" || item === "jev");
  const resolved: SystemOneProvider[] = order.length ? order : ["openthai", "jev"];
  return Array.from(new Set<SystemOneProvider>(resolved));
}

export function getJevConfig(env: NodeJS.ProcessEnv = process.env): Required<JevConfig> {
  return {
    jevApiKey: jevApiKey(env),
    jevBaseUrl: jevBaseUrl(env),
    jevModel: jevModel(env),
  };
}

function getClient(config: Required<JevConfig>) {
  const fingerprint = [config.jevApiKey ? "configured" : "missing", config.jevBaseUrl, config.jevModel].join("|");
  if (!client || clientFingerprint !== fingerprint) {
    client = new TypeSafeClient({
      apiKey: config.jevApiKey,
      baseURL: config.jevBaseUrl,
      defaultModel: config.jevModel,
    });
    clientFingerprint = fingerprint;
  }
  return client;
}

export class JevProvider {
  constructor(private readonly config: Required<JevConfig> = getJevConfig()) {}

  configured() {
    return Boolean(this.config.jevApiKey);
  }

  async classifyExpenseCategory(note: string, allowedCategories: string[]) {
    const categories = Array.from(new Set(allowedCategories.map(item => item.trim()).filter(Boolean)));
    if (!this.config.jevApiKey || categories.length === 0) {
      throw new Error("Jev API key is not configured");
    }

    const response = await getClient(this.config).systemOne({
      state: { expense_note: note.slice(0, 500) },
      model: this.config.jevModel,
      questions: {
        category: choice(
          "เลือกหมวดรายจ่ายที่ตรงกับข้อความมากที่สุด โดยเลือกได้เฉพาะตัวเลือกที่กำหนด หากข้อมูลไม่ชัดเจนให้เลือก ทั่วไปเมื่อมีตัวเลือกนี้",
          Object.fromEntries(categories.map(category => [category, null])),
        ),
      },
    });

    const answer = response.answers.category;
    const category = answer.choice;
    if (!categories.includes(category)) throw new Error("Jev returned an unknown expense category");

    return {
      category,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      model: response.model,
    };
  }
}

export type JevMiloIntent =
  | "transaction"
  | "finance_summary"
  | "financial_analysis"
  | "budget"
  | "reminder"
  | "calendar"
  | "vault"
  | "document"
  | "todo"
  | "settings"
  | "export"
  | "help"
  | "greeting"
  | "confirmation"
  | "general_chat"
  | "unknown";

export type JevMiloRoutingResult = {
  intent: JevMiloIntent;
  confidence: number;
  requiresDatabase: boolean;
  requiresLLM: boolean;
  requiresConfirmation: boolean;
  riskLevel: "low" | "medium" | "high";
  model: string;
  provider?: SystemOneProvider;
};

export function jevRouterTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.MILO_JEV_ROUTER_TIMEOUT_MS ?? env.MILO_SYSTEMONE_TIMEOUT_MS ?? "2500");
  return Number.isFinite(parsed) && parsed >= 500 && parsed <= 10_000 ? Math.round(parsed) : 2500;
}

const intentCriteria: Record<JevMiloIntent, string> = {
  transaction: "สร้าง/แก้ไข/ลบ/ค้นหารายรับรายจ่าย หรือรายการการเงินรายตัว",
  finance_summary: "ดูยอด สรุปรายรับรายจ่าย รายการ หรือภาพรวมการเงิน",
  financial_analysis: "ขอวิเคราะห์พฤติกรรม สุขภาพการเงิน หรือคำแนะนำจากข้อมูลการเงินจริง",
  budget: "ตั้งค่า ดู หรือแก้ไขงบประมาณ หมวด หรือรอบงบ",
  reminder: "ตั้ง ดู ยกเลิก หรือแก้รายการเตือนและติดตามงาน",
  calendar: "สร้าง ดู หรือยกเลิกปฏิทิน/นัดหมาย",
  vault: "เก็บ ค้นหา หรือจัดการข้อความ ลิงก์ ไฟล์ในคลัง",
  document: "งานเอกสาร ใบเสร็จ สลิป PDF รูป หรือสถานะเอกสาร",
  todo: "สร้าง ดู หรือปิดงาน todo/โน้ต",
  settings: "ตั้งค่า Milo หรือแดชบอร์ด",
  export: "ส่งออกข้อมูล CSV/XLSX",
  help: "ถามวิธีใช้ เมนู หรือคำสั่ง",
  greeting: "ทักทาย",
  confirmation: "ยืนยัน ยกเลิก หรือแก้ไขรายการที่ระบบเสนอไว้ก่อนหน้า",
  general_chat: "คำถามหรือบทสนทนาทั่วไปที่ไม่ใช่ workflow ของ Milo",
  unknown: "ไม่ชัดเจนพอที่จะเลือก workflow อื่น",
};

function systemOneState(text: string) {
  return {
    message: text.trim().slice(0, 1500),
    product: "Milo LINE personal assistant",
    routing_rule: "Choose the single primary intent. Do not invent amounts, dates, names, or actions that are not explicit in the message.",
  };
}

function rawSystemOneQuestions() {
  return {
    intent: {
      type: "choice",
      instructions: "จัดประเภทเจตนาหลักของข้อความเพื่อส่งไป workflow ที่ถูกต้อง",
      criteria: intentCriteria,
    },
    database: {
      type: "choice",
      instructions: "workflow นี้จำเป็นต้องอ่านหรือเขียนข้อมูลผู้ใช้ในฐานข้อมูลหรือไม่",
      criteria: {
        yes: "ต้องใช้ข้อมูลผู้ใช้หรือสร้าง/แก้ไขข้อมูล",
        no: "ไม่จำเป็นต้องแตะข้อมูลผู้ใช้",
      },
    },
    generation: {
      type: "choice",
      instructions: "จำเป็นต้องใช้โมเดลสร้างคำตอบเชิงภาษาเพิ่มเติมหรือไม่",
      criteria: {
        yes: "ต้องอธิบาย วิเคราะห์ หรือสนทนาที่ไม่ควรตอบด้วย rule อย่างเดียว",
        no: "workflow/rule/tool เดิมทำงานได้โดยไม่ต้องใช้ generative LLM",
      },
    },
    confirmation: {
      type: "choice",
      instructions: "ควรให้ผู้ใช้ยืนยันก่อนเกิดการเขียนข้อมูลหรือ action สำคัญหรือไม่",
      criteria: {
        yes: "การกระทำควรมี confirmation ก่อน commit",
        no: "เป็น read-only, help, chat หรือ action ที่ workflow เดิมยืนยันเพียงพอ",
      },
    },
    risk: {
      type: "choice",
      instructions: "ระดับความเสี่ยงหาก route ผิด",
      criteria: {
        low: "แสดงข้อมูล/ช่วยเหลือ/สนทนาและแก้คืนง่าย",
        medium: "มีการสร้างหรือแก้ไขข้อมูลทั่วไป",
        high: "อาจลบข้อมูล ยืนยันธุรกรรม หรือสร้างผลกระทบสำคัญ",
      },
    },
  };
}

function sdkSystemOneQuestions() {
  const questions = rawSystemOneQuestions();
  return {
    intent: choice(questions.intent.instructions, questions.intent.criteria),
    database: choice(questions.database.instructions, questions.database.criteria),
    generation: choice(questions.generation.instructions, questions.generation.criteria),
    confirmation: choice(questions.confirmation.instructions, questions.confirmation.criteria),
    risk: choice(questions.risk.instructions, questions.risk.criteria),
  };
}

type RawChoiceAnswer = {
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};

type RawSystemOneResponse = {
  model?: string;
  answers?: Record<string, RawChoiceAnswer>;
};

function parseRoutingResponse(response: RawSystemOneResponse, provider: SystemOneProvider, fallbackModel: string): JevMiloRoutingResult {
  const answers = response.answers || {};
  const intent = answers.intent?.choice as JevMiloIntent | undefined;
  const database = answers.database?.choice;
  const generation = answers.generation?.choice;
  const confirmation = answers.confirmation?.choice;
  const risk = answers.risk?.choice as "low" | "medium" | "high" | undefined;
  const confidence = Number(answers.intent?.confidence);

  if (!intent || !(intent in intentCriteria)) throw new Error(`${provider} returned an unknown intent`);
  if (database !== "yes" && database !== "no") throw new Error(`${provider} returned an invalid database decision`);
  if (generation !== "yes" && generation !== "no") throw new Error(`${provider} returned an invalid generation decision`);
  if (confirmation !== "yes" && confirmation !== "no") throw new Error(`${provider} returned an invalid confirmation decision`);
  if (!risk || !["low", "medium", "high"].includes(risk)) throw new Error(`${provider} returned an invalid risk decision`);
  if (!Number.isFinite(confidence)) throw new Error(`${provider} returned an invalid confidence`);

  return {
    intent,
    confidence,
    requiresDatabase: database === "yes",
    requiresLLM: generation === "yes",
    requiresConfirmation: confirmation === "yes",
    riskLevel: risk,
    model: response.model || fallbackModel,
    provider,
  };
}

async function classifyMiloIntentWithOpenThai(text: string, env: NodeJS.ProcessEnv): Promise<JevMiloRoutingResult> {
  if (!openThaiSystemOneConfigured(env)) throw new Error("OpenThai-SystemOne is not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), jevRouterTimeoutMs(env));
  try {
    const apiKey = openThaiSystemOneApiKey(env);
    const response = await fetch(openThaiSystemOneUrl(env), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { apikey: apiKey } : {}),
      },
      body: JSON.stringify({
        state: systemOneState(text),
        model: openThaiSystemOneModel(env),
        questions: rawSystemOneQuestions(),
        permutations: Number(env.OPENTHAI_SYSTEMONE_PERMUTATIONS || "1"),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`OpenThai-SystemOne HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const payload = await response.json() as RawSystemOneResponse;
    return parseRoutingResponse(payload, "openthai", openThaiSystemOneModel(env));
  } finally {
    clearTimeout(timer);
  }
}

async function classifyMiloIntentWithJev(text: string, env: NodeJS.ProcessEnv): Promise<JevMiloRoutingResult> {
  const config = getJevConfig(env);
  if (!config.jevApiKey) throw new Error("Jev API key is not configured");

  const response = await getClient(config).systemOne({
    state: systemOneState(text),
    model: config.jevModel,
    questions: sdkSystemOneQuestions(),
  }, {
    timeout: jevRouterTimeoutMs(env),
    retry: { maxRetries: 0 },
  });

  return {
    intent: response.answers.intent.choice as JevMiloIntent,
    confidence: response.answers.intent.confidence,
    requiresDatabase: response.answers.database.choice === "yes",
    requiresLLM: response.answers.generation.choice === "yes",
    requiresConfirmation: response.answers.confirmation.choice === "yes",
    riskLevel: response.answers.risk.choice as "low" | "medium" | "high",
    model: response.model,
    provider: "jev",
  };
}

export async function classifyMiloIntent(text: string, env: NodeJS.ProcessEnv = process.env): Promise<JevMiloRoutingResult> {
  const errors: string[] = [];
  for (const provider of systemOneProviderOrder(env)) {
    const configured = provider === "openthai" ? openThaiSystemOneConfigured(env) : typeSafeConfigured(env);
    if (!configured) continue;
    try {
      return provider === "openthai"
        ? await classifyMiloIntentWithOpenThai(text, env)
        : await classifyMiloIntentWithJev(text, env);
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.length ? `SystemOne providers failed: ${errors.join(" | ")}` : "SystemOne provider is not configured");
}

export async function classifyExpenseCategory(note: string, allowedCategories: string[]) {
  return new JevProvider().classifyExpenseCategory(note, allowedCategories);
}
