import { Container, getContainer } from "@cloudflare/containers";
import { env as workerEnv } from "cloudflare:workers";

const CONTAINER_NAME = "milo-production";

const forwardedEnvironmentNames = [
  "ADMIN_PASSWORD",
  "ADMIN_USERNAME",
  "CRON_SECRET",
  "DATABASE_URL",
  "GEMINI_API_KEY",
  "JWT_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_CHANNEL_SECRET",
  "MILO_APP_BASE_URL",
  "MILO_PUBLIC_URL",
  "MILO_RICH_MENU_IMAGE_BASE_URL",
  "MILO_SAVE_RESULT_IMAGE_BASE_URL",
  "MILO_VOICE_CAT_IMAGE_URL",
  "MILO_PRO_LINE_USER_IDS",
  "MILO_PRO_MAX_LINE_USER_IDS",
  "SESSION_SECRET",
] as const;

function containerEnvironment() {
  const values = workerEnv as unknown as Record<string, unknown>;
  const forwarded = Object.fromEntries(
    forwardedEnvironmentNames.flatMap(name => {
      const value = values[name];
      return typeof value === "string" && value.length > 0 ? [[name, value]] : [];
    }),
  );

  return {
    NODE_ENV: "production",
    PORT: "3000",
    MILO_LOCAL_STT_ENABLED: "false",
    ...forwarded,
  };
}

export class MiloContainer extends Container {
  defaultPort = 3000;
  requiredPorts = [3000];
  sleepAfter = "10m";
  pingEndpoint = "localhost/health";
  enableInternet = true;
  envVars = containerEnvironment();
}

interface Env {
  MILO_CONTAINER: DurableObjectNamespace<MiloContainer>;
  CRON_SECRET: string;
}

async function runCron(env: Env, path: string) {
  const container = getContainer(env.MILO_CONTAINER, CONTAINER_NAME);
  const response = await container.fetch(
    new Request(`https://milo.internal${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
        "User-Agent": "vercel-cron/1.0",
      },
    }),
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Milo cron ${path} failed: ${response.status} ${body.slice(0, 500)}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return getContainer(env.MILO_CONTAINER, CONTAINER_NAME).fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === "0 0 * * *") {
      await runCron(env, "/api/scheduled/personal-morning");
      return;
    }
    if (controller.cron === "0 13 * * *") {
      await runCron(env, "/api/scheduled/personal-evening");
    }
  },
} satisfies ExportedHandler<Env>;
