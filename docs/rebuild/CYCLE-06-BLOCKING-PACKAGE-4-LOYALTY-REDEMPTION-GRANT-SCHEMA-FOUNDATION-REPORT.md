# CYCLE 06 BLOCKING PACKAGE 4 — LOYALTY REDEMPTION GRANT SCHEMA FOUNDATION REPORT

Status: fifth schema foundation complete; runtime not started
Source checkpoint: `6bd6d464`
Report date: 2026-08-29

## 1. Domain Decision

The accepted Package 4 remainder names the loyalty redemption grant/code as
the next and only schema-foundation step.

This foundation uses two domain-specific models:

- `LoyaltyRedemptionGrant` — the immutable one-time right created by an issue
  action;
- `LoyaltyRedemption` — the append-only claim created by a later consume
  action.

Issuance and redemption are different business operations:

- issue execution -> grant is **one-to-one**;
- grant -> redemption is **one-to-zero-or-one**;
- redemption execution -> redemption claim is **one-to-one**.

The separate claim row is the DB-level one-time-use boundary. Its unique
tenant-qualified grant identity rejects a second redemption even when another
execution, request, process, or runtime path tries to consume the same grant.

Legacy Python rows are not backfilled. A later safe correlation may create
historical grant/claim rows with null execution bindings and a tenant-qualified
legacy source reference; this step invents no historical execution.

## 2. Additive Schema Foundation

The migration creates only `LoyaltyRedemptionGrant` and
`LoyaltyRedemption`.

The grant stores:

- tenant-qualified canonical client identity;
- a server-derived `codeHash`, never the raw bearer code;
- immutable service target, point value, issue time, and expiry;
- optional immutable issue-execution binding;
- optional tenant-qualified legacy source reference.

The redemption claim stores:

- tenant-qualified grant identity;
- redemption time;
- optional immutable redemption-execution binding;
- optional tenant-qualified legacy source reference.

DB guarantees include:

- composite tenant-qualified FKs for client, grant, issue execution, and
  redemption execution;
- unique `(tenantId, codeHash)`;
- unique issue-execution binding;
- unique `(grantId, tenantId)` one-time claim;
- unique redemption-execution binding;
- positive points, non-empty hash/target, and expiry-after-issue checks;
- immutable grant identity/value facts and established issue binding;
- immutable redemption identity/time and established redemption binding.

Migration:
`prisma/migrations/20260829233000_loyalty_redemption_grant/migration.sql`.

No generic value ledger, runtime handler, raw code storage, historical
backfill, referral, subscription, certificate, billing, or expense schema was
added or changed.

## 3. Structural Verification

All checks ran sequentially on a disposable local PostgreSQL database.

| Check | Result |
|---|---|
| Targeted schema ratchet | PASS — 1 suite / 5 tests |
| Clean database migration replay | PASS — all 57 repository migrations |
| Historical issue/redemption bindings | PASS — both nullable |
| Cross-tenant issue execution | REJECTED by composite FK |
| Cross-tenant redemption execution | REJECTED by composite FK |
| Cross-tenant grant claim | REJECTED by composite FK |
| Issue execution reused for another grant | REJECTED by unique index |
| Second redemption of the same grant | REJECTED by unique claim index |
| Redemption execution reused for another grant | REJECTED by unique index |
| Established issue binding clear/replacement | REJECTED by DB trigger |
| Established redemption binding clear/replacement | REJECTED by DB trigger |
| Immutable grant value change | REJECTED by DB trigger |
| Required tenant-qualified constraints | PASS — exactly 4 |
| Immutable guards | PASS — exactly 2 |
| Prisma schema validation | PASS |
| Targeted ESLint | PASS |
| Migrated database vs `schema.prisma` drift | NONE |
| `git diff --check` | PASS |
| Temporary structural/drift databases remaining | 0 |

The full backend suite, full lint, typecheck, and build were intentionally not
run. No runtime TypeScript or scripts were changed; the added TypeScript is the
targeted structural Jest spec and compiled through the project test transform.

## 4. Safety Boundary

- The migration was applied only to a disposable local database and removed
  with it after verification.
- The migration was not applied to production or any persistent project
  database.
- No loyalty service, code generator/consumer, Python job, AI tool, resolver,
  ingress, executor, scheduler, webhook, billing, referral, subscription,
  certificate, or other runtime path was connected or modified.
- No loyalty/value mutation or external side effect occurred.
- A08 payment write remains disabled.
- Package 5 and Chapter 7 were not started.

## 5. Checkpoint Verdict

`PACKAGE 4 FIFTH SCHEMA FOUNDATION COMPLETE: YES`

`DOMAIN MODELS CREATED: LoyaltyRedemptionGrant, LoyaltyRedemption`

`ISSUE AND REDEMPTION ARE DISTINCT OPERATIONS: YES`

`ISSUE EXECUTION TO GRANT: ONE-TO-ONE`

`GRANT TO REDEMPTION: ONE-TO-ZERO-OR-ONE`

`REDEMPTION EXECUTION TO CLAIM: ONE-TO-ONE`

`TENANT-QUALIFIED ACTION BINDINGS: YES`

`HISTORICAL NULL BINDINGS COMPATIBLE: YES`

`RAW BEARER CODE STORED: NO`

`SECOND REDEMPTION THROUGH ANOTHER EXECUTION: REJECTED`

`ESTABLISHED BINDINGS IMMUTABLE AT DB LEVEL: YES`

`GENERIC VALUE WORKFLOW CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`PACKAGE 4 SCHEMA FOUNDATION STEPS REMAINING: 3`

`NEXT SCHEMA FOUNDATION: REFERRAL PLUS REWARD/FULFILLMENT`

`A08 PAYMENT WRITE: DISABLED`

`EXTERNAL LOYALTY/VALUE SIDE EFFECTS: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
