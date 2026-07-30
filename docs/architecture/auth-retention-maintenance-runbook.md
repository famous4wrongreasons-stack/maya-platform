# Authentication Retention Maintenance Runbook

## Scope

This slice adds an explicit maintenance command for stale authentication security records in the NestJS/PostgreSQL platform backend. It does not add an HTTP endpoint, change frontend contracts, enable a scheduler, touch the Python/SQLite production runtime or deploy anything.

The command is platform maintenance rather than a tenant action. It intentionally evaluates eligible rows across all tenants, accepts no tenant selector and returns aggregate counts only. Callers cannot use it to inspect or delete one chosen tenant's authentication data.

## Retention policy

| Record                | Default eligibility                                   | Delete behavior                                            |
| --------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `AuthSession`         | `revokedAt` or `expiresAt` is more than 30 days old   | Delete a bounded set of inactive sessions                  |
| `AuthRefreshToken`    | Never selected independently                          | Delete only through the parent session foreign-key cascade |
| `PhoneAuthCode`       | `expiresAt` or `consumedAt` is more than 24 hours old | Delete a bounded set of stale challenges                   |
| `AuthFlowState`       | `expiresAt` or `consumedAt` is more than 24 hours old | Delete a bounded set of stale OAuth states                 |
| `AuthRateLimitBucket` | `windowEndsAt` is more than 24 hours old              | Delete a bounded set of closed windows                     |

Consumed refresh-token history belonging to an active session is deliberately retained, even when the token itself is old. Session rotation uses that history to detect replay and revoke the whole token family. There is no direct refresh-token purge query.

The command does not delete users, memberships, tenants, provider identities, audit records or business data.

## Safety model

- Dry-run is the default. Deletion requires the explicit `--execute` flag.
- One PostgreSQL transaction-level advisory lock prevents concurrent cleanup jobs.
- Every table is processed in a bounded batch using server-selected IDs and `FOR UPDATE SKIP LOCKED`.
- The fixed cutoff timestamps are calculated once at the start of a run.
- Any database error rolls back the entire run; cleanup does not continue partially.
- Output contains timestamps and aggregate counts, never phones, emails, OAuth states, token hashes or other record values.
- The command uses only `DATABASE_URL` and the four retention settings; it never prints or sends provider/application secrets.

One execute pass can delete up to `batchSize` rows from each parent table. Refresh-token count reports rows removed by session cascade and does not enlarge the session batch.

## Configuration

| Variable                          |         Default |     Accepted range |
| --------------------------------- | --------------: | -----------------: |
| `AUTH_RETENTION_SESSION_DAYS`     |         30 days |         7-365 days |
| `AUTH_RETENTION_CHALLENGE_HOURS`  |        24 hours |        1-168 hours |
| `AUTH_RETENTION_RATE_LIMIT_HOURS` |        24 hours |        1-720 hours |
| `AUTH_RETENTION_BATCH_SIZE`       | 1000 rows/table | 1-10000 rows/table |

Missing, non-integer or out-of-range environment values fail back to the conservative defaults. A valid `--batch-size` argument overrides only the configured batch size for that run.

## Commands

Run from `maya-saas-backend` after applying migrations:

```bash
npm run auth:cleanup
```

The default command is equivalent to an explicit dry-run:

```bash
npm run auth:cleanup -- --dry-run
```

Execute one bounded deletion pass only after reviewing the dry-run:

```bash
npm run auth:cleanup -- --execute
```

Use a smaller temporary batch during rollout when needed:

```bash
npm run auth:cleanup -- --execute --batch-size 100
```

`--execute` and `--dry-run` are mutually exclusive. Unknown options and invalid batch sizes fail before connecting to PostgreSQL.

## Result contract

Successful output is JSON with:

- `status`: `dry_run`, `completed` or `skipped_locked`;
- `now` and the three calculated cutoffs;
- `eligible`: all currently eligible rows by category;
- `deleted`: rows deleted in this pass by category;
- `batchSize`, `dryRun` and `hasMore`.

`skipped_locked` is a successful no-op because another maintenance run owns the lock. `hasMore: true` means at least one category still had eligible rows beyond this pass. Let the next scheduled run continue cleanup, or repeat manually after checking database load. Do not create an unbounded retry loop.

Failures write a stable `auth_retention_failed` JSON error to stderr, set a non-zero exit code and delete nothing from the rolled-back transaction.

## Rollout and scheduling

1. Apply migration `20260711234500_auth_retention_maintenance`.
2. Run Prisma validation and the full backend quality gate.
3. Rehearse dry-run and execute against a sanitized production-shaped snapshot.
4. Take or verify a restorable database backup before the first production execute.
5. Run dry-run in production and sanity-check counts against expected auth traffic and retention windows.
6. Start with a conservative batch and inspect duration, row locks and database load.
7. Only after the first reviewed execute, schedule one daily run with an explicit `--execute` flag.
8. Alert on non-zero exit, repeated `skipped_locked`, unexpected count spikes and a persistent `hasMore` backlog.

No scheduler, cron entry, Kubernetes job or production configuration is included in this slice. Scheduler activation is a separate infrastructure change and cutover decision.

## Migration and recovery

Migration `20260711234500_auth_retention_maintenance` adds global scan indexes for OAuth expiry/consumption, phone challenge expiry/consumption and session revocation. It does not update or delete rows.

If an index causes an operational issue, remove it with a reviewed forward migration. Do not edit an already-applied migration. Rows removed by `--execute` cannot be reconstructed by the application; restore them from backup if recovery is legally and operationally required.

## Verification checklist

```bash
cd maya-saas-backend
npm run prisma:generate
npx prisma validate
npm run typecheck
npm run typecheck:scripts
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```

Disposable PostgreSQL verification must prove:

- fresh migration and upgrade migration paths have no Prisma schema drift;
- dry-run changes no row;
- a second cleanup process returns `skipped_locked`;
- small batches report `hasMore` and eventually drain eligible rows;
- a repeated execute is idempotent;
- stale records are cleaned across multiple tenants while recent records remain isolated;
- an active session's consumed refresh-token history survives cleanup;
- refresh-token rows disappear only when their eligible parent session is deleted.

## Remaining work

- Add the production scheduler only after deployment topology, database load and alert routing are approved.
- Export privacy-safe cleanup duration/backlog metrics without record values.
- Minimize or encrypt provider profile and phone challenge PII under a separately reviewed data migration.
- Define legal retention and deletion workflows for users, audit records and tenant closure independently from this technical auth cleanup.

Production remains unchanged until a separately reviewed migration and cutover is approved.
