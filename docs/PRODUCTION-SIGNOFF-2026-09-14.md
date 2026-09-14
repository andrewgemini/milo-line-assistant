# Milo Production Sign-off — 2026-09-14

## Decision

**GO LIVE / PRODUCTION READY**

This checkpoint closes the launch-hardening cycle for Milo LINE Assistant. It records the production checks that must remain green before a release is considered deployable.

## Production

- Application: `https://milo-line-app.vercel.app`
- Health endpoint: `/api/health`
- Release marker at sign-off: `production-hardening-v19-2026-09-14`
- Primary branch: `main`
- Recovery verifier: `pnpm recovery:verify`
- Release gate: `pnpm release:gate`

## Launch gates

### Application quality

- TypeScript check: PASS
- Full Vitest release suite: PASS
- Production build: PASS
- GitHub/Vercel deployment status: SUCCESS
- Production health: OK
- Dashboard route: HTTP 200
- Save-result renderer: HTTP 200 image/png
- Greeting image: HTTP 200 image/png

### Security / integrity

- LINE webhook signature verification: enabled
- Invalid LINE webhook signature: HTTP 401
- Export URL signature verification: enabled
- Invalid export signature: HTTP 401
- HSTS: enabled in production
- X-Content-Type-Options: `nosniff`
- Duplicate transaction protection: enabled
- Transaction undo: soft-delete + audit log
- Database TLS: TLS 1.2 minimum with certificate verification

### Runtime readiness

Production `/api/health` reports:

- LINE credentials configured: true
- Database configured: true
- Export signing configured: true
- Cron configured: true
- Duplicate protection: true
- Undo supported: true
- Webhook signature verification: true
- Vision: Vercel AI Gateway + OCR fallback
- Voice: Groq Whisper Large V3

## Recovery drill

Recovery verification was executed read-only against Production and the restored TiDB database.

Result: **PASS**

- Production tables: 25
- Recovery tables: 25
- Schema hash: MATCH
- Missing tables in recovery: none
- Schema mismatch: none
- Recovery row counts ahead of production: none
- Exact-count tables: 18
- Older-snapshot tables: `audit_logs`, `image_extractions`, `transaction_attachments`, `transactions`, `vault_items`, `voice_transcriptions`, `webhook_events`

The restored database is an older backup snapshot, which is expected. The drill proves that the backup can be restored into a readable database with a schema matching production.

Observed snapshot examples at drill time:

| Table | Production | Recovery |
| --- | ---: | ---: |
| `transactions` | 26 | 14 |
| `audit_logs` | 49 | 22 |
| `vault_items` | 37 | 9 |
| `webhook_events` | 375 | 318 |

## Recovery procedure

1. Restore the selected TiDB backup into a separate recovery database/cluster. Never restore over production for a drill.
2. Put the restored connection string in local `.env` as `RECOVERY_DATABASE_URL`.
3. Keep `DATABASE_URL` pointed to production.
4. Run `pnpm recovery:verify`.
5. Require `RECOVERY_DRILL=PASS` before closing the drill.
6. Remove the temporary recovery cluster after evidence is retained if it is no longer needed.

The recovery verifier performs read-only comparisons and does not write to either database.

## Release procedure

Before each production release:

1. Run `pnpm release:gate`.
2. Require TypeScript, release tests, and production build to pass.
3. Commit only intended tracked files; do not stage user-owned local assets or scratch files.
4. Push `main`.
5. Wait for deployment status to report success.
6. Verify `/api/health` and the production release marker.
7. Perform smoke checks for webhook rejection, signed exports, dashboard, and image renderer as appropriate.

## Rollback / incident rule

If a release causes a material production regression:

- stop further changes;
- identify the last known-good commit/deployment;
- roll back application deployment first when the issue is application-only;
- do not mutate or replace the production database merely to roll back application code;
- use the recovery database only for verification/recovery workflows;
- preserve audit evidence and incident timestamps.

## Data-safety notes

- `RECOVERY_DATABASE_URL` is a local secret and must not be committed.
- User-owned untracked images and local helper files remain outside the release commit unless explicitly approved.
- Backup/restore evidence should contain counts/status only, never credentials.

## Non-blocking post-launch backlog

The historical `todo.md` contains UX refinements, older duplicated checklist entries, browser-only QA evidence requests, and unrelated reminder/event tasks. These are not launch blockers for this sign-off. New product work should be handled as post-launch backlog rather than reopening the production-readiness gate unless it affects security, data integrity, recovery, billing, or core transaction correctness.

## Sign-off status

**Milo v1 production launch gate: PASS**
