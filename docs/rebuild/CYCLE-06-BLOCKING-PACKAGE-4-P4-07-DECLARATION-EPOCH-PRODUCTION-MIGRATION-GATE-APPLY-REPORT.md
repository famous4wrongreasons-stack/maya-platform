# CYCLE 06 BLOCKING PACKAGE 4 — P4-07 DECLARATION EPOCH PRODUCTION MIGRATION GATE/APPLY

Status: **PASS — ONE APPROVED ADDITIVE MIGRATION APPLIED; PRODUCTION EXPENSE RUNTIME UNCHANGED**

Date: `2026-09-02`

Source checkpoint: `0756cd0a`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope

This Gate applied only:

`20260902200000_expense_period_declaration_epoch`

Migration SHA-256:

`a32ea9679507deccd080af56de5ad26899a03023ade0a51f0aa4abc61942fac4`

The inactive schema-authority release was prepared at:

`/opt/maya-saas/releases/20260902-c06-p4-p407-declaration-epoch-schema-0756cd0a`

The active production runtime remained:

`/opt/maya-saas/releases/20260902-c06-p4-p406-final-cutover-7d4e06f6`

The active symlink was not switched and the service was not restarted. No
Expense, declaration, invalidation, payment, loyalty, referral, subscription,
certificate, or provider business mutation accompanied the schema apply.

## 2. Production preflight

All checks were read-only until the exact pending set and structural clone had
passed.

| Check | Result |
| --- | --- |
| Local `HEAD` / origin | `0756cd0a` / exact match |
| Approved migration checksum | exact locally and in staged release |
| Repository migrations in staged release | `66` |
| Completed production journal rows before apply | `68` |
| Unfinished migration rows | `0` |
| Target journal rows before apply | `0` |
| Pending repository migrations | exactly `1` |
| Exact pending migration | `20260902200000_expense_period_declaration_epoch` |
| Active-release schema drift before apply | `NONE` |
| Competing non-idle / idle-in-transaction sessions | `0 / 0` |
| Existing Expense rows | `0` |
| Existing ExpensePeriodDeclaration rows | `0` |
| Production service | active |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |

No PII, raw financial reason, secret, or row identity was selected or printed.

## 3. Structural production clone

A disposable clone was built from the actual production schema and the
non-business Prisma migration journal. Production business rows and PII copied
to the clone: `0`.

Before applying the target, the production-shaped clone received one synthetic
historical Expense with a non-zero sentinel and one synthetic historical
declaration with no epoch. The target was then the only repository migration
applied.

| Clone proof | Result |
| --- | --- |
| Pre-target repository journal | `65` |
| Target applied | exactly `1` |
| Historical Expense | preserved (`1`, sentinel unchanged) |
| Historical declaration | preserved (`1`) |
| Historical nullable epoch | compatible (`NULL`) |
| Fake historical invalidations | `0` |
| Initial canonical generation | epoch `0` |
| Retry / concurrent initial declaration | one identity / one winner |
| Append-only invalidation | enforced |
| Duplicate invalidation | no false generation |
| Re-assertion generations | contiguous `[1, 2, 3]` |
| Old succeeded execution masks re-declaration | `NO` |
| Forged epoch | rejected |
| Cross-tenant / period / execution binding | rejected |
| Immutable execution and invalidation binding | enforced |
| Prisma migration status | up to date (`66/66`) |
| Resulting drift | `NONE` |

Two preliminary clones stopped safely before production apply: one exposed the
production dump's already-created `public` schema, and one exposed that the
schema-filtered dump omitted the `btree_gist` extension. The corrected full
schema-only restore passed. Every disposable clone was dropped and verified
absent.

## 4. Production apply

Immediately before the schema write, the inactive release again reported one
pending repository migration, zero target journal rows, zero unfinished rows,
zero Expense/declaration rows, and no competing database session.

The normal project mechanism applied the target with bounded database lock and
statement timeouts:

`prisma migrate deploy`

No manual production DDL or business DML was issued outside the committed
migration.

## 5. Production post-apply verification

| Check | Result |
| --- | --- |
| Repository migrations | `66` |
| Completed production journal rows | `69` (`66` repository + `3` acknowledged historical) |
| Target completed journal rows | `1` |
| Target journal checksum | exact match |
| Pending migrations | `0` |
| Unfinished migrations | `0` |
| Strict release preflight | PASS — database ready |
| Post-apply drift | `NONE` |
| Expense rows | `0 -> 0` |
| ExpensePeriodDeclaration rows | `0 -> 0` |
| Non-null declaration epochs | `0` |
| Invalidation rows | `0` |
| Epoch column / invalidation table | present / present |
| Required target triggers | `6/6` present |
| Production service PID | unchanged |
| Production service state | active |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |
| Priority error lines in corrected verification window | `0` |

The first log query used a timestamp form not accepted by `journalctl`; it did
not affect migration or health. The corrected relative-window query completed
and found zero priority-error lines.

## 6. Verdict

`PENDING MIGRATIONS: 0`

`POST-APPLY DRIFT: NONE`

`HISTORICAL DECLARATIONS PRESERVED: YES`

`FAKE HISTORICAL EPOCH BACKFILL: NO`

`DECLARATION EPOCH DURABLE IN PRODUCTION: YES`

`APPEND-ONLY INVALIDATION DURABLE IN PRODUCTION: YES`

`PRODUCTION EXPENSE/VALUE MUTATIONS: 0`

`PRODUCTION HEALTH/READINESS: PASS`

`PRODUCTION RUNTIME CUTOVER: NO`

## 7. Process hygiene

All commands ran sequentially. The one remote dependency-install helper that
outlived its initial tool yield was recorded, waited to completion, and reaped.
The three disposable structural-clone databases were removed. No browser,
Playwright, watcher, or temporary application server was started.

`TEMP PROCESSES STARTED: 1`

`TEMP PROCESSES TERMINATED: 1`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`STRUCTURAL CLONE DATABASES CREATED: 3`

`STRUCTURAL CLONE DATABASES REMOVED: 3`

`TEMP DATABASES REMAINING: 0`
