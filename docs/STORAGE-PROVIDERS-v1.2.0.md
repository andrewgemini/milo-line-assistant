# Milo v1.2.0 — Durable Vault Storage Providers

Milo can store LINE images, audio and files in more than one durable-storage backend. The application keeps one provider active at a time while preserving download compatibility for objects stored by older providers.

## Supported providers

### 1. Google Drive

Set:

```env
MILO_STORAGE_PROVIDER=google-drive
MILO_GOOGLE_DRIVE_FOLDER_ID=<target-folder-id>
MILO_GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=<service-account-email>
MILO_GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Recommended setup:

1. Create a Google Cloud service account.
2. Enable the Google Drive API in that Google Cloud project.
3. Create or choose a dedicated Drive folder such as `Milo Vault`.
4. Share that folder with the service-account email as Editor.
5. Put the folder ID and service-account credentials into the deployment environment variables.
6. Redeploy and verify `/api/health` reports `activeProvider: "google-drive"`.

Milo uses the `drive.file` scope and writes only files that the service account creates in the configured folder. Files are downloaded through Milo's authenticated server-side provider proxy; Drive bearer tokens are not exposed to LINE users.

### 2. S3-compatible storage

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

For Cloudflare R2 use its S3-compatible endpoint and usually region `auto`.

### 3. Existing Forge/S3 storage

Existing Milo installations can continue to use the built-in Forge storage variables:

```env
MILO_STORAGE_PROVIDER=forge
BUILT_IN_FORGE_API_URL=<forge-url>
BUILT_IN_FORGE_API_KEY=<forge-key>
```

Legacy `/manus-storage/...` links remain supported.

### 4. Automatic selection

```env
MILO_STORAGE_PROVIDER=auto
```

Selection order is:

1. Forge
2. S3-compatible
3. Google Drive

For predictable production behavior, explicitly set the provider rather than relying on `auto`.

## Health check

`GET /api/health` reports only configuration state, never credentials:

```json
{
  "storage": {
    "requestedProvider": "google-drive",
    "activeProvider": "google-drive",
    "configuredProviders": ["google-drive"]
  },
  "readiness": {
    "durableVaultStorageConfigured": true,
    "storageProviderChoiceSupported": true,
    "googleDriveStorageSupported": true,
    "s3CompatibleStorageSupported": true
  }
}
```

## Compatibility

New storage keys contain a provider prefix (`forge:`, `s3:`, `gdrive:`). Existing unprefixed keys are treated as legacy Forge objects, so upgrading does not invalidate old Vault records.

## Security notes

- Never commit service-account private keys or S3 secrets to Git.
- Keep credentials in Vercel/production environment variables.
- Use a dedicated Google Drive folder for Milo.
- Use a dedicated service account rather than a personal Google account password.
- Milo's health endpoint exposes provider names only, not secrets.
