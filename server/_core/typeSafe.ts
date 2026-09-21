import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

export type JevConfig = {
  jevApiKey?: string;
  jevBaseUrl?: string;
  jevModel?: string;
};

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

export async function classifyExpenseCategory(note: string, allowedCategories: string[]) {
  return new JevProvider().classifyExpenseCategory(note, allowedCategories);
}
