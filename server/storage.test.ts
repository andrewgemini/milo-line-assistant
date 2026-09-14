import { afterEach, describe, expect, it, vi } from "vitest";

async function loadStorage() {
  vi.resetModules();
  return import("./storage");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Milo durable storage provider selection", () => {
  it("selects Google Drive when explicitly configured", async () => {
    vi.stubEnv("MILO_STORAGE_PROVIDER", "google-drive");
    vi.stubEnv("MILO_GOOGLE_DRIVE_FOLDER_ID", "folder-1");
    vi.stubEnv("MILO_GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL", "milo@example.iam.gserviceaccount.com");
    vi.stubEnv("MILO_GOOGLE_DRIVE_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");
    const { storageRuntimeStatus } = await loadStorage();
    expect(storageRuntimeStatus()).toMatchObject({
      requested: "google-drive",
      activeProvider: "google-drive",
      configured: true,
      configuredProviders: ["google-drive"],
    });
  });

  it("supports S3-compatible storage such as AWS S3, Cloudflare R2 or MinIO", async () => {
    vi.stubEnv("MILO_STORAGE_PROVIDER", "s3");
    vi.stubEnv("MILO_S3_BUCKET", "milo-vault");
    vi.stubEnv("MILO_S3_ACCESS_KEY_ID", "key");
    vi.stubEnv("MILO_S3_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");
    const { storageRuntimeStatus } = await loadStorage();
    expect(storageRuntimeStatus()).toMatchObject({ requested: "s3", activeProvider: "s3", configured: true });
  });

  it("does not claim durable storage when the requested provider lacks credentials", async () => {
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
