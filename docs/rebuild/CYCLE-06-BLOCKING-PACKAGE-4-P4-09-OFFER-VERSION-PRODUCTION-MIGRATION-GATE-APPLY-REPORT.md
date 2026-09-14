# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 OFFER VERSION PRODUCTION MIGRATION GATE/APPLY

Status: **PASS — ONE APPROVED ADDITIVE MIGRATION APPLIED; PRODUCTION RUNTIME UNCHANGED**

Date: `2026-09-02`

Source checkpoint: `e4bba766`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope

This Gate applied only:

`20260902230000_p4_09_immutable_offer_value_version`

Migration SHA-256:

`b59a235c42b65e524048b998790bf285d1730634c1d4325a3dadb9e66f0cc7f6`

The inactive schema-authority release was prepared at:

`/opt/maya-saas/releases/20260902-c06-p4-p409-offer-version-schema-e4bba766`

The production runtime symlink was not switched and `maya-saas.service` was
not restarted by this Gate. No catalog, referral policy, customer-value,
payment or provider business mutation accompanied the schema apply.

## 2. Production preflight

All checks were read-only until the exact pending set and structural clone had
passed.

| Check | Result |
| --- | --- |
| Local `HEAD` / origin | `e4bba766` / exact match |
| Local and staged migration directories | `67 / 67` |
| Approved target checksum | exact local/staged match |
| Completed production journal rows before apply | `69` |
| Unfinished migration rows | `0` |
| Target journal rows before apply | `0` |
| Pending repository migrations | exactly `1` |
| Exact pending migration | `20260902230000_p4_09_immutable_offer_value_version` |
| Active-release schema drift before apply | `NONE` |
| Competing non-idle / idle-in-transaction sessions | `0 / 0` |
| Existing TenantCatalogItem rows | `0` |
| Existing ReferralProgram rows | `0` |
| Existing subscription/certificate/referral reward rows | `0 / 0 / 0` |
| Production service | active |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |

An independent deployment changed the active runtime release during the
read-only preflight window. The Gate therefore re-read health, active release,
pending migration set and database sessions, and explicitly proved that no
deploy, rsync, dependency-install or Prisma migration process remained before
the schema write. The exact P4-09 pending set was unchanged.

No PII, secret, customer identity or raw configuration value was selected or
printed.

## 3. Structural production clone

A disposable local database was restored from the production schema-only dump
and non-business Prisma migration journal. Production business rows and PII
copied to the clone: `0`.

Before the target migration, the clone received one synthetic historical
membership offer and one synthetic historical referral program with non-zero
sentinel values. The target was then the only repository migration applied.

| Clone proof | Result |
| --- | --- |
| Target applied | exactly `1` |
| Historical offer | preserved; sentinel unchanged |
| Historical referral policy | preserved; sentinels unchanged |
| Historical current-version pointers | compatible `NULL` |
| Fake offer/referral versions | `0 / 0` |
| Immutable internal offer identity | enforced |
| `externalRef` changes identity | `NO` |
| Historical version update/delete | rejected |
| Contiguous successor versions | enforced |
| Concurrent successor creation | one winner |
| Retry/duplicate version creation | converged; no second version |
| Tenant-qualified ActionExecution binding | enforced |
| Non-owner approval | rejected |
| Cross-tenant binding | rejected |
| Frozen subscription value after version change | preserved |
| Frozen gift certificate value after version change | preserved |
| Frozen referral issuance/reward after policy change | preserved |
| Prisma migration status | up to date (`67/67`) |
| Resulting drift | `NONE` |

The production database role correctly rejected direct temporary database
creation. The clone was therefore built locally through a schema-only stream.
One preliminary local restore established that the dump expects the default
empty `public` schema; a second established the correct local proof runner.
Both stopped before production apply and were removed. The corrected third
clone passed the entire proof. All created clone databases were dropped and
verified absent.

## 4. Production apply

Immediately before apply, the inactive release repeated strict config and
migration-ledger validation with `--allow-pending`. It again reported only the
approved target, zero target rows, zero relevant business rows and no competing
database or deployment process.

The standard project mechanism applied the migration with bounded PostgreSQL
lock and statement timeouts:

`prisma migrate deploy`

No manual production DDL or business DML was issued outside the committed
migration.

## 5. Production post-apply verification

| Check | Result |
| --- | --- |
| Repository migrations | `67` |
| Completed production journal rows | `70` |
| Target completed journal rows | `1` |
| Target journal checksum | exact match |
| Pending migrations | `0` |
| Strict release preflight | PASS — database ready |
| Post-apply drift | `NONE` |
| TenantCatalogItem / ReferralProgram rows | `0 / 0` |
| Offer/referral value-version rows | `0 / 0` |
| Current-version pointers backfilled | `0 / 0` |
| Existing subscription/certificate/referral reward rows | `0 / 0 / 0` |
| Offer/referral durable triggers | `6 / 6` |
| Production service | active; not restarted by Gate |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |
| Priority error lines after apply | `0` |

## 6. Verdict

`PENDING MIGRATIONS: 0`

`POST-APPLY DRIFT: NONE`

`HISTORICAL OFFER DATA PRESERVED: YES`

`FAKE HISTORICAL VERSION BACKFILL: NO`

`IMMUTABLE OFFER IDENTITY DURABLE IN PRODUCTION: YES`

`VERSIONED OFFER VALUE DURABLE IN PRODUCTION: YES`

`PRODUCTION CONFIG/VALUE MUTATIONS: 0`

`PRODUCTION HEALTH/READINESS: PASS`

`PRODUCTION RUNTIME CUTOVER: NO`

## 7. Process hygiene

Heavy commands ran sequentially. The one remote dependency-install command
that outlived its initial tool yield was recorded, waited to normal completion
and reaped. No watcher, application server, browser, Playwright or Chrome
process was started.

`TEMP PROCESSES STARTED: 1`

`TEMP PROCESSES TERMINATED: 1`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`STRUCTURAL CLONE DATABASES CREATED: 3`

`STRUCTURAL CLONE DATABASES REMOVED: 3`

`TEMP DATABASES REMAINING: 0`

The active runtime, P4-09 Shadow/executable paths, production customer value,
P4-02 through P4-08, Package 5 and Chapter 7 remain unchanged.
