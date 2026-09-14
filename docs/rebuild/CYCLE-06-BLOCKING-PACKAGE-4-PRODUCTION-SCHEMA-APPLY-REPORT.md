# CYCLE 06 BLOCKING PACKAGE 4 — PRODUCTION SCHEMA APPLY REPORT

Status: PASS — exactly five approved Package 4 migrations applied
Source checkpoint: `21f2c81c`
Apply date: 2026-08-29
Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope And Boundary

This step applied only the five Package 4 migrations approved by
`CYCLE-06-BLOCKING-PACKAGE-4-PRODUCTION-MIGRATION-GATE.md`. The first three
Package 4 migrations already present in production were neither replayed nor
modified.

The migration ran from the immutable schema-only artifact:

`/opt/maya-saas/releases/20260829-c06-p4-schema-apply-21f2c81c`

The runtime release symlink was not switched. It remained:

`/opt/maya-saas/releases/20260829-hide-test-plan`

The service was not restarted or redeployed. Package 4 runtime implementation
was not started.

## 2. Preflight

Preflight was performed sequentially before the database write:

- local `HEAD` and `origin` were both `21f2c81c0782095e11db25286f74c029f520c785`;
- the production migration journal contained `58` successful rows and `0`
  incomplete rows;
- the first three Package 4 migrations were present with exact committed
  checksums;
- the complete local migration set contained `60` migrations;
- the only local migrations absent from production were exactly the five
  approved Package 4 migrations;
- all five pending migration SHA-256 values matched the Gate;
- production database readiness returned `1`;
- non-idle sessions: `0`;
- sessions idle in transaction: `0`;
- service state: `active`;
- health: HTTP `200`;
- readiness: HTTP `200`;
- pre-apply Prisma drift was present only because the approved five migrations
  were still pending.

The exact approved pending set was:

| Migration | SHA-256 |
|---|---|
| `20260829230000_expense_period_declaration_action_binding` | `18113754d4c8d8f7dc6c1222d3acdaef1c7585d8c9ace3f767f7232e392a97bb` |
| `20260829233000_loyalty_redemption_grant` | `66eee4b69f7a52ac52f61ac2e3edc5044169d9e5cb460b3b468278431c160c65` |
| `20260829234500_referral_reward_fulfillment` | `69076581cbf4339f866cde5778735c85b3813f8c2511b51b93c3d8ffe74a3575` |
| `20260829235900_customer_subscription` | `34a224bbd39cd4f16098e8092cbd912779026efd4ad537f5a4dd94cb2b076e40` |
| `20260830001000_gift_certificate` | `ec52588b60f652565f39f0d7022f4788d217e8b4a40efa8c6af32beb59eae04c` |

The production release preflight reported `pending_migrations: 5` and passed.
No unexpected pending migration existed.

## 3. Production Apply

The project-standard Prisma production migration mechanism applied the five
migrations once, in committed order, from `2026-08-29T19:14:03Z` through
`2026-08-29T19:14:06Z`.

Prisma reported each of the five migration names and concluded:

`All migrations have been successfully applied.`

No manual SQL mutation, migration rewrite, runtime cutover, service symlink
switch, or business action accompanied the apply.

## 4. Post-Apply Migration Integrity

| Check | Result |
|---|---|
| Production successful journal rows | `63` (`60` local plus `3` approved historical baseline rows) |
| Incomplete journal rows | `0` |
| Package 4 migrations | `8/8` |
| Local pending migrations | `0` |
| Prisma migration status | `Database schema is up to date!` |
| Release preflight | PASS, database status `ready` |
| Post-apply Prisma drift | none |
| Unexpected migration | none |

The strict post-apply preflight revalidated local migration checksums against
the production journal. No migration was replayed or modified.

## 5. Historical Data And Structural Proof

Read-only aggregate inventory was captured before and after apply. No PII,
business payload, code, credential, note, or customer identifier was selected.

| Table | Before: total / null binding / bound | After: total / null binding / bound | Result |
|---|---:|---:|---|
| `BillingPayment` | `1 / 1 / 0` | `1 / 1 / 0` | preserved |
| `LoyaltyTransaction` | `0 / 0 / 0` | `0 / 0 / 0` | preserved |
| `Expense` | `0 / 0 / 0` | `0 / 0 / 0` | preserved |
| `ExpensePeriodDeclaration` | `0 / n/a / n/a` | `0 / 0 / 0` | preserved; nullable binding added without backfill |

The ten newly created redemption, referral/reward, customer subscription, and
gift-certificate tables contained `0` rows after apply. Therefore the migration
created no grant, redemption, reward, subscription, usage, certificate, or
fulfillment fact.

Structural read-only inspection confirmed:

- tenant-qualified Package 4 `ActionExecution` foreign keys: `15`;
- Package 4 immutable/value guard triggers: `18`;
- required one-time unique protections: `4/4`;
- historical non-null action bindings invented: `0`;
- cross-tenant execution binding remains rejected by composite FKs;
- established bindings remain protected by immutable guards;
- loyalty redemption, referral reward fulfillment, subscription usage
  identity, and gift-certificate redemption retain their one-time database
  claims.

## 6. Runtime And Service Verification

After the schema apply:

- active runtime release was unchanged;
- service state was `active`;
- health returned HTTP `200`;
- readiness returned HTTP `200`;
- service error log entries in the post-apply observation window: `0`;
- Package 4 runtime implementation started: NO;
- A08 payment write was not changed or invoked;
- external financial/value side effects: `0`.

A pre-write inventory harness initially used the wrong existing `Expense`
binding column name and stopped before `migrate deploy`; production was not
modified by that attempt. After the successful single apply, the first log
collection command rejected an ISO timestamp format after the migration,
drift, structural, and health checks had already passed. The complete
post-apply audit was then rerun read-only with a supported relative log window.
The migration mechanism itself executed exactly once.

## 7. Verdict

`PACKAGE 4 PENDING MIGRATIONS APPLIED: 5/5`

`PENDING MIGRATIONS AFTER APPLY: 0`

`POST-APPLY SCHEMA DRIFT: NONE`

`HISTORICAL ROWS PRESERVED: YES`

`FAKE ACTIONEXECUTION BACKFILL: NO`

`PRODUCTION HEALTH/READINESS: PASS`

`EXTERNAL FINANCIAL/VALUE SIDE EFFECTS: 0`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`READY FOR PACKAGE 4 RUNTIME CONVERGENCE: YES`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
