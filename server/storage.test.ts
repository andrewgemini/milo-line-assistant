import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  saveVaultBlob: vi.fn(),
  getVaultBlob: vi.fn(),
}));

vi.mock("./db", () => dbMock);

async function loadStorage() {
  vi.resetModules();
  return import("./storage");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Milo durable storage provider selection", () => {
  it("uses the database as the default vault while external storage is not configured", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:pass@db.example/milo");
    vi.stubEnv("MILO_STORAGE_PROVIDER", "");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");
    vi.stubEnv("MILO_S3_BUCKET", "");
    vi.stubEnv("MILO_GOOGLE_DRIVE_FOLDER_ID", "");
    const { storageRuntimeStatus } = await loadStorage();
    expect(storageRuntimeStatus()).toMatchObject({
      requested: "database",
      activeProvider: "database",
      configured: true,
      configuredProviders: ["database"],
    });
  });

  it("stores and reads a database-backed vault object through an opaque db key", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:pass@db.example/milo");
    vi.stubEnv("MILO_STORAGE_PROVIDER", "database");
    const { storagePut, storageGetDatabaseObject } = await loadStorage();
    const stored = await storagePut("milo/U1/receipt.jpg", Buffer.from("receipt"), "image/jpeg");
    expect(stored.provider).toBe("database");
    expect(stored.key).toMatch(/^db:milo\/U1\/receipt_[a-f0-9]{8}\.jpg$/);
    expect(stored.url).toContain("/api/milo/storage/");
    expect(dbMock.saveVaultBlob).toHaveBeenCalledWith(expect.objectContaining({
      storageKey: stored.key,
      mimeType: "image/jpeg",
      content: Buffer.from("receipt"),
    }));

    dbMock.getVaultBlob.mockResolvedValueOnce({ content: Buffer.from("receipt"), mimeType: "image/jpeg", sizeBytes: 7 });
    await expect(storageGetDatabaseObject(stored.key)).resolves.toEqual({ data: Buffer.from("receipt"), mimeType: "image/jpeg", sizeBytes: 7 });
    expect(dbMock.getVaultBlob).toHaveBeenCalledWith(stored.key);
  });

  it("falls back to database storage when the selected external provider upload fails", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:pass@db.example/milo");
    vi.stubEnv("MILO_STORAGE_PROVIDER", "forge");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.example");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-key");
    vi.stubEnv("MILO_S3_BUCKET", "");
    vi.stubEnv("MILO_GOOGLE_DRIVE_FOLDER_ID", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider unavailable", { status: 503 })));
    const { storagePut } = await loadStorage();

    const stored = await storagePut("milo/U1/fallback.jpg", Buffer.from("fallback"), "image/jpeg");

    expect(stored.provider).toBe("database");
    expect(stored.key).toMatch(/^db:milo\/U1\/fallback_[a-f0-9]{8}\.jpg$/);
    expect(dbMock.saveVaultBlob).toHaveBeenCalledWith(expect.objectContaining({ storageKey: stored.key, mimeType: "image/jpeg" }));
  });

  it("selects Google Drive when explicitly configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MILO_STORAGE_PROVIDER", "google-drive");
    vi.stubEnv("MILO_GOOGLE_DRIVE_FOLDER_ID", "folder-1");
    vi.stubEnv("MILO_GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL", "milo@example.iam.gserviceaccount.com");
    vi.stubEnv("MILO_GOOGLE_DRIVE_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");
    const { storageRuntimeStatus } = await loadStorage();
    expect(storageRuntimeStatus()).toMatchObject({ requested: "google-drive", activeProvider: "google-drive", configured: true, configuredProviders: ["google-drive"] });
  });

  it("supports S3-compatible storage such as AWS S3, Cloudflare R2 or MinIO", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MILO_STORAGE_PROVIDER", "s3");
    vi.stubEnv("MILO_S3_BUCKET", "milo-vault");
    vi.stubEnv("MILO_S3_ACCESS_KEY_ID", "key");
    vi.stubEnv("MILO_S3_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");
    const { storageRuntimeStatus } = await loadStorage();
    expect(storageRuntimeStatus()).toMatchObject({ requested: "s3", activeProvider: "s3", configured: true });
  });

  it("does not claim durable storage when an explicitly requested provider lacks credentials", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:pass@db.example/milo");
    vi.stubEnv("MILO_STORAGE_PROVIDER", "google-drive");
    vi.stubEnv("MILO_GOOGLE_DRIVE_FOLDER_ID", "");
    vi.stubEnv("MILO_GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL", "");
    vi.stubEnv("MILO_GOOGLE_DRIVE_PRIVATE_KEY", "");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");
    const { storageRuntimeStatus } = await loadStorage();
    expect(storageRuntimeStatus()).toMatchObject({ requested: "google-drive", activeProvider: null, configured: false });
  });
});
