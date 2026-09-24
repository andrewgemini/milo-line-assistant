import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SignJWT, importPKCS8 } from "jose";
import { ENV } from "./_core/env";
import * as db from "./db";

export type StorageProvider = "database" | "forge" | "s3" | "google-drive";
export type StorageObject = { key: string; url: string; provider: StorageProvider };

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function forgeConfigured() {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}

function s3Configured() {
  return Boolean(process.env.MILO_S3_BUCKET?.trim() && process.env.MILO_S3_ACCESS_KEY_ID?.trim() && process.env.MILO_S3_SECRET_ACCESS_KEY?.trim());
}

function googleDriveConfigured() {
  return Boolean(process.env.MILO_GOOGLE_DRIVE_FOLDER_ID?.trim() && process.env.MILO_GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.MILO_GOOGLE_DRIVE_PRIVATE_KEY?.trim());
}

export function storageRuntimeStatus() {
  const configuredProviders: StorageProvider[] = [];
  if (databaseConfigured()) configuredProviders.push("database");
  if (forgeConfigured()) configuredProviders.push("forge");
  if (s3Configured()) configuredProviders.push("s3");
  if (googleDriveConfigured()) configuredProviders.push("google-drive");
  const requested = (process.env.MILO_STORAGE_PROVIDER || "database").trim().toLowerCase();
  const activeProvider = requested === "auto"
    ? configuredProviders[0] ?? null
    : configuredProviders.includes(requested as StorageProvider) ? requested as StorageProvider : null;
  return { requested, activeProvider, configuredProviders, configured: Boolean(activeProvider) };
}

function selectedProvider(): StorageProvider {
  const status = storageRuntimeStatus();
  if (status.activeProvider) return status.activeProvider;
  throw new Error(`Durable storage is not configured for provider ${status.requested}`);
}

async function databasePut(relKey: string, data: Buffer | Uint8Array | string, contentType: string): Promise<StorageObject> {
  if (!databaseConfigured()) throw new Error("Database storage is not configured");
  const objectKey = appendHashSuffix(normalizeKey(relKey));
  const raw = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  const limit = Number(process.env.MILO_DATABASE_STORAGE_MAX_BYTES || 15 * 1024 * 1024);
  if (!Number.isFinite(limit) || limit < 1) throw new Error("Invalid MILO_DATABASE_STORAGE_MAX_BYTES");
  if (raw.byteLength > limit) throw new Error(`Database storage object exceeds ${limit} bytes`);
  const key = `db:${objectKey}`;
  await db.saveVaultBlob({ storageKey: key, mimeType: contentType, content: raw });
  return { key, url: `/api/milo/storage/${encodeURIComponent(key)}`, provider: "database" };
}

async function forgePut(relKey: string, data: Buffer | Uint8Array | string, contentType: string): Promise<StorageObject> {
  const forgeUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;
  const objectKey = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", objectKey);
  const presignResp = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!presignResp.ok) throw new Error(`Forge storage presign failed (${presignResp.status})`);
  const { url: putUrl } = (await presignResp.json()) as { url?: string };
  if (!putUrl) throw new Error("Forge returned empty upload URL");
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const upload = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: body as BodyInit });
  if (!upload.ok) throw new Error(`Forge storage upload failed (${upload.status})`);
  const key = `forge:${objectKey}`;
  return { key, url: `/api/milo/storage/${encodeURIComponent(key)}`, provider: "forge" };
}

function s3Client() {
  return new S3Client({
    region: process.env.MILO_S3_REGION?.trim() || "auto",
    endpoint: process.env.MILO_S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: /^(1|true|yes)$/i.test(process.env.MILO_S3_FORCE_PATH_STYLE || ""),
    credentials: {
      accessKeyId: process.env.MILO_S3_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.MILO_S3_SECRET_ACCESS_KEY!.trim(),
    },
  });
}

async function s3Put(relKey: string, data: Buffer | Uint8Array | string, contentType: string): Promise<StorageObject> {
  const objectKey = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await s3Client().send(new PutObjectCommand({ Bucket: process.env.MILO_S3_BUCKET!.trim(), Key: objectKey, Body: body, ContentType: contentType }));
  const key = `s3:${objectKey}`;
  return { key, url: `/api/milo/storage/${encodeURIComponent(key)}`, provider: "s3" };
}

let googleTokenCache: { token: string; expiresAt: number } | undefined;

function googlePrivateKey() {
  return process.env.MILO_GOOGLE_DRIVE_PRIVATE_KEY!.replace(/\\n/g, "\n").trim();
}

async function googleDriveAccessToken() {
  if (googleTokenCache && googleTokenCache.expiresAt > Date.now() + 60_000) return googleTokenCache.token;
  const email = process.env.MILO_GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL!.trim();
  const privateKey = await importPKCS8(googlePrivateKey(), "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/drive.file" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Google Drive OAuth failed (${response.status})`);
  const json = await response.json() as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Google Drive OAuth returned no access token");
  googleTokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

async function googleDrivePut(relKey: string, data: Buffer | Uint8Array | string, contentType: string): Promise<StorageObject> {
  const token = await googleDriveAccessToken();
  const filename = appendHashSuffix(normalizeKey(relKey)).replace(/[\\/]+/g, "__").slice(-220);
  const metadata = {
    name: filename,
    parents: [process.env.MILO_GOOGLE_DRIVE_FOLDER_ID!.trim()],
    appProperties: { miloPath: normalizeKey(relKey).slice(0, 120) },
  };
  const boundary = `milo_${crypto.randomUUID().replace(/-/g, "")}`;
  const raw = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    raw,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  if (!response.ok) throw new Error(`Google Drive upload failed (${response.status})`);
  const json = await response.json() as { id?: string };
  if (!json.id) throw new Error("Google Drive upload returned no file id");
  const key = `gdrive:${json.id}`;
  return { key, url: `/api/milo/storage/${encodeURIComponent(key)}`, provider: "google-drive" };
}

export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream"): Promise<StorageObject> {
  const provider = selectedProvider();
  if (provider === "database") return databasePut(relKey, data, contentType);
  if (provider === "forge") return forgePut(relKey, data, contentType);
  if (provider === "s3") return s3Put(relKey, data, contentType);
  return googleDrivePut(relKey, data, contentType);
}

function parseStoredKey(value: string): { provider: StorageProvider; objectKey: string } {
  if (value.startsWith("db:")) return { provider: "database", objectKey: value.slice(3) };
  if (value.startsWith("forge:")) return { provider: "forge", objectKey: value.slice(6) };
  if (value.startsWith("s3:")) return { provider: "s3", objectKey: value.slice(3) };
  if (value.startsWith("gdrive:")) return { provider: "google-drive", objectKey: value.slice(7) };
  return { provider: "forge", objectKey: normalizeKey(value) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { provider, objectKey } = parseStoredKey(relKey);
  if (provider === "database") throw new Error("Database objects are downloaded through the Milo storage proxy");
  if (provider === "forge") {
    if (!forgeConfigured()) throw new Error("Forge storage is not configured");
    const getUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
    getUrl.searchParams.set("path", objectKey);
    const resp = await fetch(getUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
    if (!resp.ok) throw new Error(`Forge signed URL failed (${resp.status})`);
    const { url } = await resp.json() as { url?: string };
    if (!url) throw new Error("Forge returned empty download URL");
    return url;
  }
  if (provider === "s3") {
    if (!s3Configured()) throw new Error("S3 storage is not configured");
    return getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: process.env.MILO_S3_BUCKET!.trim(), Key: objectKey }), { expiresIn: 900 });
  }
  throw new Error("Google Drive objects are downloaded through the Milo storage proxy");
}

export async function storageGetDatabaseObject(relKey: string) {
  const { provider, objectKey } = parseStoredKey(relKey);
  if (provider !== "database") return undefined;
  if (!databaseConfigured()) throw new Error("Database storage is not configured");
  const row = await db.getVaultBlob(`db:${objectKey}`);
  if (!row) return undefined;
  return { data: Buffer.from(row.content), mimeType: row.mimeType, sizeBytes: row.sizeBytes };
}

export async function storageGetGoogleDriveResponse(relKey: string) {
  const { provider, objectKey } = parseStoredKey(relKey);
  if (provider !== "google-drive") return undefined;
  if (!googleDriveConfigured()) throw new Error("Google Drive storage is not configured");
  const token = await googleDriveAccessToken();
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(objectKey)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  return { key: relKey, url: `/api/milo/storage/${encodeURIComponent(relKey)}` };
}
