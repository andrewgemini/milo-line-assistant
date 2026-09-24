import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { pushText } from "./line";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DEFAULT_PUBLIC_URL = "https://milo-line-assistant.onrender.com";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type CalendarEventInput = {
  id: number;
  title: string;
  detail?: string | null;
  startsAt: Date;
  endsAt: Date;
};

function envValue(env: NodeJS.ProcessEnv, ...keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function clientId(env = process.env) {
  return envValue(env, "MILO_GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID");
}

function clientSecret(env = process.env) {
  return envValue(env, "MILO_GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET");
}

function tokenSecret(env = process.env) {
  return envValue(env, "MILO_GOOGLE_TOKEN_ENCRYPTION_KEY", "SESSION_SECRET", "LINE_CHANNEL_SECRET");
}

function publicBaseUrl(env = process.env) {
  const configured = envValue(env, "MILO_PUBLIC_URL", "RENDER_EXTERNAL_URL");
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = envValue(env, "VERCEL_PROJECT_PRODUCTION_URL");
  if (vercel) return (vercel.startsWith("http") ? vercel : `https://${vercel}`).replace(/\/+$/, "");
  return DEFAULT_PUBLIC_URL;
}

function redirectUri(env = process.env) {
  return envValue(env, "MILO_GOOGLE_CALENDAR_REDIRECT_URI") || `${publicBaseUrl(env)}/api/milo/google/calendar/callback`;
}

export function googleCalendarRuntimeStatus(env: NodeJS.ProcessEnv = process.env) {
  const hasClientId = Boolean(clientId(env));
  const hasClientSecret = Boolean(clientSecret(env));
  const hasTokenEncryptionKey = Boolean(tokenSecret(env));
  return {
    configured: hasClientId && hasClientSecret && hasTokenEncryptionKey,
    hasClientId,
    hasClientSecret,
    hasTokenEncryptionKey,
    redirectUri: redirectUri(env),
  };
}

function signingKey(env = process.env) {
  const secret = tokenSecret(env);
  if (!secret) throw new Error("Google Calendar token encryption key is not configured");
  return createHash("sha256").update(secret).digest();
}

function sign(value: string, env = process.env) {
  return createHmac("sha256", signingKey(env)).update(value).digest("base64url");
}

function signaturesMatch(value: string, signature: string, env = process.env) {
  const expected = Buffer.from(sign(value, env));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function encrypt(value: string, env = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", signingKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decrypt(value: string, env = process.env) {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted Google token");
  const decipher = createDecipheriv("aes-256-gcm", signingKey(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function signedState(lineUserId: string, env = process.env) {
  const payload = Buffer.from(JSON.stringify({
    lineUserId,
    expiresAt: Date.now() + 10 * 60_000,
    nonce: randomBytes(12).toString("base64url"),
  })).toString("base64url");
  return `${payload}.${sign(payload, env)}`;
}

function verifyState(state: string, env = process.env) {
  const separator = state.lastIndexOf(".");
  if (separator < 1) return undefined;
  const payload = state.slice(0, separator);
  const signature = state.slice(separator + 1);
  if (!signaturesMatch(payload, signature, env)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { lineUserId?: string; expiresAt?: number };
    if (!parsed.lineUserId || !parsed.expiresAt || parsed.expiresAt < Date.now()) return undefined;
    return parsed.lineUserId;
  } catch {
    return undefined;
  }
}

export function buildGoogleCalendarConnectUrl(lineUserId: string, env: NodeJS.ProcessEnv = process.env) {
  if (!googleCalendarRuntimeStatus(env).configured) return undefined;
  const expires = Math.floor(Date.now() / 1000) + 10 * 60;
  const signature = sign(`${lineUserId}:${expires}`, env);
  const url = new URL("/api/milo/google/calendar/connect", publicBaseUrl(env));
  url.searchParams.set("lineUserId", lineUserId);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", signature);
  return url.toString();
}

function htmlPage(title: string, message: string) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#fff8f2;color:#33283b;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:540px;margin:24px;padding:32px;border-radius:24px;background:white;box-shadow:0 12px 45px #6b5b8e22;text-align:center}h1{color:#d74475}p{line-height:1.7}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

async function exchangeCode(code: string, env = process.env) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(env)!,
      client_secret: clientSecret(env)!,
      redirect_uri: redirectUri(env),
      grant_type: "authorization_code",
    }),
  });
  const json = await response.json() as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google OAuth failed (${response.status})`);
  }
  return json;
}

async function refreshAccessToken(refreshToken: string, env = process.env) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(env)!,
      client_secret: clientSecret(env)!,
      grant_type: "refresh_token",
    }),
  });
  const json = await response.json() as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google token refresh failed (${response.status})`);
  }
  return json;
}

async function accessTokenFor(lineUserId: string, forceRefresh = false) {
  const connection = await db.getGoogleCalendarConnection(lineUserId);
  if (!connection || connection.status !== "connected" || !connection.refreshTokenEncrypted) return undefined;
  if (!forceRefresh && connection.accessTokenEncrypted && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return decrypt(connection.accessTokenEncrypted);
  }
  const refreshToken = decrypt(connection.refreshTokenEncrypted);
  const tokens = await refreshAccessToken(refreshToken);
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
  await db.upsertGoogleCalendarConnection({
    lineUserId,
    accessTokenEncrypted: encrypt(tokens.access_token!),
    refreshTokenEncrypted: connection.refreshTokenEncrypted,
    tokenExpiresAt: expiresAt,
    scope: tokens.scope || connection.scope || CALENDAR_SCOPE,
    calendarId: connection.calendarId || "primary",
  });
  return tokens.access_token;
}

async function calendarFetch(lineUserId: string, url: string, init: RequestInit) {
  let token = await accessTokenFor(lineUserId);
  if (!token) return undefined;
  let response = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    token = await accessTokenFor(lineUserId, true);
    if (!token) return undefined;
    response = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  }
  return response;
}

export async function googleCalendarConnectionStatus(lineUserId: string) {
  if (!googleCalendarRuntimeStatus().configured) return { configured: false, connected: false };
  const connection = await db.getGoogleCalendarConnection(lineUserId);
  return {
    configured: true,
    connected: connection?.status === "connected",
    calendarId: connection?.calendarId || "primary",
    updatedAt: connection?.updatedAt,
  };
}

export async function disconnectGoogleCalendar(lineUserId: string) {
  return db.disconnectGoogleCalendar(lineUserId);
}

export async function syncGoogleCalendarEventCreate(lineUserId: string, event: CalendarEventInput): Promise<{ synced: boolean; reason?: "unconfigured" | "not_connected" | "failed"; googleEventId?: string }> {
  if (!googleCalendarRuntimeStatus().configured) return { synced: false, reason: "unconfigured" };
  try {
    const existing = await db.getGoogleCalendarEventLink(event.id, lineUserId);
    if (existing?.status === "active") return { synced: true, googleEventId: existing.googleEventId };
    const connection = await db.getGoogleCalendarConnection(lineUserId);
    if (!connection || connection.status !== "connected") return { synced: false, reason: "not_connected" };
    const calendarId = connection.calendarId || "primary";
    const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
    const response = await calendarFetch(lineUserId, url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: event.title,
        description: event.detail || undefined,
        start: { dateTime: event.startsAt.toISOString(), timeZone: "Asia/Bangkok" },
        end: { dateTime: event.endsAt.toISOString(), timeZone: "Asia/Bangkok" },
        extendedProperties: { private: { miloCalendarEventId: String(event.id) } },
      }),
    });
    if (!response) return { synced: false, reason: "not_connected" };
    const json = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
    if (!response.ok || !json.id) throw new Error(json.error?.message || `Google Calendar create failed (${response.status})`);
    await db.upsertGoogleCalendarEventLink({
      calendarEventId: event.id,
      lineUserId,
      googleEventId: json.id,
      googleCalendarId: calendarId,
    });
    return { synced: true, googleEventId: json.id };
  } catch (error) {
    console.error("[Milo Google Calendar] create sync failed", { calendarEventId: event.id, message: error instanceof Error ? error.message : "unknown" });
    return { synced: false, reason: "failed" };
  }
}

export async function syncGoogleCalendarEventDelete(lineUserId: string, calendarEventId: number): Promise<{ synced: boolean; reason?: "unconfigured" | "not_connected" | "not_linked" | "failed" }> {
  if (!googleCalendarRuntimeStatus().configured) return { synced: false, reason: "unconfigured" };
  try {
    const link = await db.getGoogleCalendarEventLink(calendarEventId, lineUserId);
    if (!link || link.status === "deleted") return { synced: false, reason: "not_linked" };
    const response = await calendarFetch(
      lineUserId,
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(link.googleCalendarId)}/events/${encodeURIComponent(link.googleEventId)}`,
      { method: "DELETE" },
    );
    if (!response) return { synced: false, reason: "not_connected" };
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      const body = await response.text().catch(() => "");
      throw new Error(`Google Calendar delete failed (${response.status}) ${body.slice(0, 200)}`);
    }
    await db.markGoogleCalendarEventLinkDeleted(calendarEventId, lineUserId);
    return { synced: true };
  } catch (error) {
    console.error("[Milo Google Calendar] delete sync failed", { calendarEventId, message: error instanceof Error ? error.message : "unknown" });
    return { synced: false, reason: "failed" };
  }
}

function connectHandler(req: Request, res: Response) {
  if (!googleCalendarRuntimeStatus().configured) {
    return res.status(503).type("html").send(htmlPage("ยังเชื่อมไม่ได้", "Google Calendar OAuth ยังตั้งค่าไม่ครบ กรุณาตรวจ Client ID, Client Secret และคีย์เข้ารหัสโทเคน"));
  }
  const lineUserId = typeof req.query.lineUserId === "string" ? req.query.lineUserId : "";
  const expires = typeof req.query.expires === "string" ? req.query.expires : "";
  const signature = typeof req.query.sig === "string" ? req.query.sig : "";
  const expiresAt = Number(expires);
  if (!lineUserId || !Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !signaturesMatch(`${lineUserId}:${expires}`, signature)) {
    return res.status(400).type("html").send(htmlPage("ลิงก์หมดอายุ", "กลับไปที่ LINE แล้วพิมพ์ “เชื่อม Google Calendar” เพื่อขอลิงก์ใหม่ครับ"));
  }
  const auth = new URL(GOOGLE_AUTH_URL);
  auth.searchParams.set("client_id", clientId()!);
  auth.searchParams.set("redirect_uri", redirectUri());
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", CALENDAR_SCOPE);
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("state", signedState(lineUserId));
  return res.redirect(302, auth.toString());
}

async function callbackHandler(req: Request, res: Response) {
  try {
    if (!googleCalendarRuntimeStatus().configured) throw new Error("Google Calendar OAuth is not configured");
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const lineUserId = verifyState(state);
    if (!code || !lineUserId) return res.status(400).type("html").send(htmlPage("เชื่อมไม่สำเร็จ", "คำขอไม่ถูกต้องหรือหมดอายุ กรุณากลับไปขอลิงก์ใหม่ใน LINE"));
    const tokens = await exchangeCode(code);
    const current = await db.getGoogleCalendarConnection(lineUserId);
    const refreshTokenEncrypted = tokens.refresh_token ? encrypt(tokens.refresh_token) : current?.refreshTokenEncrypted;
    if (!refreshTokenEncrypted) throw new Error("Google did not return a refresh token");
    await db.upsertGoogleCalendarConnection({
      lineUserId,
      accessTokenEncrypted: encrypt(tokens.access_token!),
      refreshTokenEncrypted,
      tokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      scope: tokens.scope || CALENDAR_SCOPE,
      calendarId: current?.calendarId || "primary",
    });
    await pushText(lineUserId, "เชื่อม Google Calendar สำเร็จแล้ว ✅\nนัดใหม่ที่สร้างกับ Milo จะซิงก์เข้าปฏิทินให้อัตโนมัติครับ").catch(error => {
      console.error("[Milo Google Calendar] LINE confirmation failed", { message: error instanceof Error ? error.message : "unknown" });
    });
    return res.status(200).type("html").send(htmlPage("เชื่อมสำเร็จ ✅", "กลับไปที่ LINE ได้เลย นัดใหม่จาก Milo จะซิงก์เข้า Google Calendar อัตโนมัติ"));
  } catch (error) {
    console.error("[Milo Google Calendar] callback failed", { message: error instanceof Error ? error.message : "unknown" });
    return res.status(500).type("html").send(htmlPage("เชื่อมไม่สำเร็จ", "กรุณากลับไปที่ LINE แล้วลองเชื่อมใหม่ หรือตรวจ Redirect URI ใน Google Cloud Console"));
  }
}

export function registerGoogleCalendarRoutes(app: Express) {
  app.get("/api/milo/google/calendar/connect", connectHandler);
  app.get("/api/milo/google/calendar/callback", callbackHandler);
}
