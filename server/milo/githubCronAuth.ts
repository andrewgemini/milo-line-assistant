import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export const GITHUB_CRON_AUDIENCE = "milo-line-assistant-cron";
export const GITHUB_CRON_REPOSITORY = "andrewgemini/milo-line-assistant";
export const GITHUB_CRON_REF = "refs/heads/main";
export const GITHUB_CRON_WORKFLOW_REF = `${GITHUB_CRON_REPOSITORY}/.github/workflows/milo-scheduler.yml@${GITHUB_CRON_REF}`;
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const githubJwks = createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`));

export function trustedGitHubCronClaims(payload: JWTPayload) {
  const eventName = typeof payload.event_name === "string" ? payload.event_name : "";
  return payload.repository === GITHUB_CRON_REPOSITORY
    && payload.ref === GITHUB_CRON_REF
    && payload.workflow_ref === GITHUB_CRON_WORKFLOW_REF
    && (eventName === "schedule" || eventName === "workflow_dispatch");
}

export async function verifyGitHubActionsCronRequest(req: Request) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;
  const token = authorization.slice(7).trim();
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, githubJwks, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: GITHUB_CRON_AUDIENCE,
    });
    return trustedGitHubCronClaims(payload);
  } catch {
    return false;
  }
}
