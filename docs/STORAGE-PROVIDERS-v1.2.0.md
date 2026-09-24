# Milo v1.2.x — Durable Vault Storage Providers

Milo can store LINE images, audio and files in more than one durable-storage backend. The application keeps one provider active at a time while preserving download compatibility for objects stored by older providers.

## Current default: Database Vault

Until an external provider is configured, Milo now stores new media blobs in the primary database.

No extra environment variable is required as long as `DATABASE_URL` is configured. The effective default is:

```env
MILO_STORAGE_PROVIDER=database
```

Database-backed objects use keys beginning with `db:` and are downloaded through Milo's `/api/milo/storage/:key` proxy. The default maximum size per object is 15 MiB and can be changed with:

```env
MILO_DATABASE_STORAGE_MAX_BYTES=15728640
```

This is intended as the current safe default so LINE files do not disappear while Google Drive/S3 is being prepared. For larger long-term archives, switch to Google Drive or S3-compatible storage later; existing `db:` objects remain readable.

## Supported providers

### 1. Database

```env
MILO_STORAGE_PROVIDER=database
DATABASE_URL=<existing-milo-database-url>
```

No separate credentials are required beyond Milo's existing database connection.

### 2. Google Drive

```env
MILO_STORAGE_PROVIDER=google-drive
MILO_GOOGLE_DRIVE_FOLDER_ID=<target-folder-id>
MILO_GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=<service-account-email>
MILO_GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Recommended setup:

1. Create a Google Cloud service account.
2. Enable the Google Drive API.
3. In Google Workspace, create or select a **Shared Drive** and add the service-account email as Content manager.
4. Create a dedicated folder such as `Milo Vault` inside that Shared Drive and use its folder ID.
5. Add the credentials to Render Production environment variables.
6. Redeploy and verify `/api/health` reports `activeProvider: "google-drive"`.

A service account cannot own files in a regular user's My Drive. Use a Google Workspace Shared Drive for service-account storage (Milo sends `supportsAllDrives=true` for uploads and downloads). If Shared Drives are unavailable, keep `MILO_STORAGE_PROVIDER=database` or implement user OAuth instead.

### 3. S3-compatible storage

Works with AWS S3 and compatible services such as Cloudflare R2 or MinIO.

```env
MILO_STORAGE_PROVIDER=s3
MILO_S3_BUCKET=milo-vault
MILO_S3_REGION=ap-southeast-1
MILO_S3_ACCESS_KEY_ID=<access-key>
MILO_S3_SECRET_ACCESS_KEY=<secret-key>
MILO_S3_ENDPOINT=<optional-for-R2-or-MinIO>
MILO_S3_FORCE_PATH_STYLE=false
```

### 4. Existing Forge/S3 storage

```env
MILO_STORAGE_PROVIDER=forge
BUILT_IN_FORGE_API_URL=<forge-url>
BUILT_IN_FORGE_API_KEY=<forge-key>
```

Legacy `/manus-storage/...` links remain supported.

### 5. Automatic selection

```env
MILO_STORAGE_PROVIDER=auto
```

Selection order is:

1. Database
2. Forge
3. S3-compatible
4. Google Drive

For predictable production behavior, explicitly set a provider when switching away from the database.

## Health check

`GET /api/health` reports configuration state only, never credentials. With the current database-first configuration it should show approximately:

```json
{
  "storage": {
    "requestedProvider": "database",
    "activeProvider": "database",
    "configuredProviders": ["database"]
  },
  "readiness": {
    "durableVaultStorageConfigured": true,
    "databaseVaultStorageSupported": true,
    "storageProviderChoiceSupported": true,
    "googleDriveStorageSupported": true,
    "s3CompatibleStorageSupported": true
  }
}
```

## Compatibility

New storage keys contain a provider prefix (`db:`, `forge:`, `s3:`, `gdrive:`). Existing unprefixed keys are treated as legacy Forge objects, so changing provider does not invalidate old Vault records.

## Security notes

- Never commit database URLs, service-account private keys, or S3 secrets to Git.
- Keep credentials in Render/production environment variables.
- Use a dedicated folder inside a Google Workspace Shared Drive when enabling service-account Google Drive storage.
- Milo's health endpoint exposes provider names only, not secrets.
