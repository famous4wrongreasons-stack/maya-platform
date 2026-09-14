# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 CONTRACT-TO-VALUE PRODUCTION MIGRATION GATE/APPLY

Status: **PASS — ONE APPROVED ADDITIVE MIGRATION APPLIED; RUNTIME UNCHANGED**

Date: `2026-09-01`

Source checkpoint: `e2b74ebc`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope and release boundary

This step applied only:

`20260901130000_p4_04_contract_to_value`

Migration SHA-256:

`2d49506d8acf125f5e64ecbfea2ba3933c9c3136d159d931a3f7624e35c1386c`

The checksum matched locally, in the inactive schema-authority release, and in
the completed production Prisma journal row.

The migration was staged in the inactive release:

`/opt/maya-saas/releases/20260901-c06-p4-p404-contract-value-schema-e2b74ebc`

The active runtime symlink remained unchanged at:

`/opt/maya-saas/releases/20260831-c06-p4-p403-final-cutover-da0a9fdf`

No P4-04 runtime code, ALL-4 executable proof, runtime cutover, P4-02/P4-03
baseline, A08 payment path, Package 5, or Chapter 7 work was changed or started.

## 2. Production preflight

The source checkpoint and origin were identical before the gate. The active
63-migration release passed strict release preflight and had no schema drift.
The staged 64-migration release passed Prisma validation and the approved
allow-pending preflight.

| Preflight fact | Result |
|---|---|
| Local migration directories | `64` |
| Production completed journal rows | `66` |
| Acknowledged historical baseline rows | `3` |
| Unfinished journal rows | `0` |
| Target journal rows before apply | `0` |
| Pending repository migrations | `1` |
| Exact pending migration | `20260901130000_p4_04_contract_to_value` |
| Existing schema drift before apply | `NONE` |
| `maya-saas.service` | active |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |

No PII was selected or printed. Aggregate production inventory immediately
before apply was:

| Table | Rows before |
|---|---:|
| `ReferralProgram` | `0` |
| `CustomerReferral` | `0` |
| `ReferralRewardIssuance` | `0` |
| `ReferralReward` | `0` |
| `ReferralRewardFulfillment` | `0` |

## 3. Migration safety and structural production clone

The migration is additive. It adds nullable historical-compatibility columns,
checks, tenant-qualified target integrity, indexes, and insert/immutability
guards. It contains no `INSERT`, `UPDATE`, `DELETE`, backfill, reward issuance,
fulfillment, ledger write, balance write, or provider dispatch.

The `ALTER TABLE` and index statements can take brief DDL locks. Risk was
bounded by the empty affected referral/reward tables, production-clone proof,
and production `lock_timeout=5s` / `statement_timeout=60s` during the standard
Prisma deployment.

The structural clone was built from the current production schema plus the
non-business Prisma migration journal only. No business rows or PII were
copied. The three acknowledged historical-only journal rows were excluded from
the clone's local-repository replay authority, leaving exactly `63` applied
repository migrations before the target apply.

On the clone, the target migration was the only migration applied. Verification
proved:

- a pre-migration historical program, reward, and fulfillment survived;
- every newly added historical field remained `NULL` (no fake backfill);
- fixed-money and percentage reward contracts are mutually exact and capped;
- issued reward liability and presentation key version are immutable;
- later policy changes cannot alter an issued reward;
- exact fulfillment target, tenant, Client, provider identity, currency, time,
  and applied value are checked;
- cross-tenant, wrong-recipient, unresolved-hold, wrong-value, and duplicate
  exact-target claims are rejected;
- concurrent target claims produce exactly one commit and one unique rejection;
- deterministic batch identity and aggregate caps remain durably bound;
- raw bearer material is not introduced;
- Prisma migration status is current and resulting drift is `NONE`.

The final clone applied `64/64` repository migrations and was deleted after the
proof.

## 4. Production apply

Immediately before the write, the staged release again reported exactly one
pending migration, target journal rows `0`, unfinished journal rows `0`, and
all five referral/reward counts still `0`.

The standard production mechanism applied the target with bounded database
timeouts:

`prisma migrate deploy`

No manual SQL schema change was performed outside the approved migration.
The service was not stopped or restarted, and the active runtime release was
not switched.

## 5. Post-apply verification

| Post-apply fact | Result |
|---|---|
| Repository migrations | `64` |
| Production completed journal rows | `67` (`64` repository + `3` historical) |
| Target completed journal rows | `1` |
| Target journal checksum | exact match |
| Pending migrations | `0` |
| Prisma migration status | up to date |
| Schema drift | `NONE` |
| New durable columns | `12/12` |
| Target checks/FK | `5/5` |
| New insert guards | `2/2` |
| Target indexes | `3/3` |
| Raw secret columns introduced | `0` |
| `maya-saas.service` | active, same PID |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |
| Service warnings/errors in the corrected migration window query | `0` |

All production business-row counts remained `0 -> 0`. Therefore historical
production rows were preserved, no fake contract/value facts were backfilled,
and no referral, reward, loyalty, payment, or provider-side business mutation
occurred.

## 6. Safety notes

Two preliminary disposable-clone fixtures stopped safely before final proof:
one restore expected the standard `public` schema, and one strict structural
fixture counted a deliberately inserted synthetic historical reward. A later
connection attempt also timed out before restoring a schema. Each disposable
database was dropped by its lifecycle trap. The final production-schema clone
then passed the full combined proof without changing migration semantics.

An initial inactive-release archive handoff was rejected before it could create
the target release. Verification showed no target directory, no helper process,
no DB session, and no runtime change. The release was then created and populated
with two explicit, bounded transfer steps.

## 7. Verdict

`PENDING MIGRATIONS: 0`

`POST-APPLY DRIFT: NONE`

`HISTORICAL REFERRAL/REWARD ROWS PRESERVED: YES`

`FAKE CONTRACT-TO-VALUE BACKFILL: NO`

`FROZEN REWARD VALUE DURABLE IN PRODUCTION: YES`

`EXACT FULFILLMENT TARGET DURABLE IN PRODUCTION: YES`

`PRESENTATION STATE DURABLE IN PRODUCTION: YES`

`SCHEDULER ENVELOPE/CAP DURABLE IN PRODUCTION: YES`

`PRODUCTION REFERRAL/REWARD/VALUE MUTATIONS: 0`

`PRODUCTION HEALTH/READINESS: PASS`

`READY FOR P4-04 RUNTIME CONTRACT ALIGNMENT: YES`

`P4-04 RUNTIME MODIFIED: NO`

`P4-04 ALL-4 EXECUTABLE PROOF RESUMED: NO`

`P4-04 PRODUCTION CUTOVER: NO`

`A08 PAYMENT WRITE: DISABLED`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 8. Permanent process hygiene

All local and remote helpers ran sequentially in the foreground with bounded
connection/database waits. Four explicitly named disposable PostgreSQL clone
databases were created across the safe fixture iterations; all four were
dropped and absence was verified. No watcher, application server, browser,
Chrome, Playwright process, or background SSH session was started or left.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 4`

`TEMP DATABASES TERMINATED: 4`

`TEMP DATABASES REMAINING: 0`
