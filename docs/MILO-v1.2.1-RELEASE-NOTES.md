# Milo v1.2.1 — Database-First Vault

## Summary

Milo now stores LINE media in the primary database by default until an external durable-storage provider is configured.

## Changes

- Added `database` as a first-class Vault storage provider.
- Added `vault_blobs` table with binary content, MIME type, size and opaque storage key.
- Default provider is now `database` when `MILO_STORAGE_PROVIDER` is not set.
- Database storage keys use the `db:` prefix.
- `/api/milo/storage/:key` can stream database-backed files back to users.
- Existing Forge, S3/R2/MinIO and Google Drive support remains available for later migration.
- Existing old storage keys remain readable.
- Default database object limit is 15 MiB per file; configurable with `MILO_DATABASE_STORAGE_MAX_BYTES`.
- Health endpoint reports database Vault capability and the active provider without exposing secrets.

## Deployment note

Apply `drizzle/0017_database_vault_blobs.sql` before using database-backed media storage in Production.

No Google Drive or S3 credentials are required for the database-first mode.
