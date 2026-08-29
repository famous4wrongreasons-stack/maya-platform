# CYCLE 06 BLOCKING PACKAGE 4 — CUSTOMER SUBSCRIPTION SCHEMA FOUNDATION REPORT

Status: seventh schema foundation complete; runtime not started
Source checkpoint: `c8dc0157`
Report date: 2026-08-29

## 1. Domain Decision

The accepted Package 4 remainder names the canonical customer-subscription
aggregate as the next and only schema-foundation step. The platform
`SubscriptionPlan` is MAYA tenant billing and is not reused for a salon
customer's subscription.

This foundation uses two domain-specific models:

- `CustomerSubscription` — one actually activated customer subscription term;
- `CustomerSubscriptionUsage` — one append-only claim for subscription units
  consumed by an exact visit/source identity.

The business operations remain distinct:

- issue/create before authoritative payment success grants no subscription
  value; provider dispatch and reconciliation remain in the originating
  `ActionExecution` and its `ActionAttempt` rows;
- activation creates one term with a **one-to-one**
  `activationExecutionId` binding;
- renewal creates a new term linked to its predecessor; it never extends or
  rewrites the old term;
- one predecessor term has at most one activated renewal term;
- expiry, cancellation, or revocation is one terminal mutation of the existing
  term with a separate **one-to-one** `endExecutionId` binding;
- usage sync/consume is **one-to-many** from an execution to immutable usage
  claims because one authoritative sync can discover multiple visits;
- a tenant/subscription-qualified usage identity may be claimed only once, so
  another execution cannot apply the same visit again.

Historical correlated terms and usage facts may keep null action bindings only
with a non-empty tenant-qualified `legacySourceRef`. This migration performs no
historical backfill and invents no execution identity.

## 2. Additive Schema Foundation

The migration creates only `CustomerSubscription` and
`CustomerSubscriptionUsage`.

Each subscription term stores immutable:

- tenant-qualified client and optional predecessor identities;
- deterministic term identity;
- plan code, plan snapshot hash, and service-scope hash;
- price, currency, included-unit allowance, activation time, and term bounds;
- hashed provider payment correlation, never the raw provider reference;
- optional activation and terminal lifecycle execution bindings;
- current lifecycle state and terminal timestamp.

Each usage claim stores immutable:

- tenant-qualified subscription identity;
- deterministic usage and target-reference hashes;
- target kind, units, and occurrence time;
- optional execution binding and historical source reference.

Database guarantees include:

- six composite tenant-qualified FKs for client, predecessor, term/usage
  actions, and the consumed subscription;
- unique term identity, activation execution, terminal execution, provider
  payment identity, and predecessor renewal claim;
- a renewal guard that preserves client identity and advances the term instead
  of rewriting the previous term;
- immutable plan/value/provider/term facts and established action bindings;
- terminal transitions from an active canonical term fail closed without a
  terminal execution binding;
- unique usage identity per subscription;
- parent-row locking before usage claims so concurrent claims cannot exceed
  the immutable allowance;
- rejection of usage outside the immutable term bounds;
- immutable usage identities, values, and established bindings.

Migration:
`prisma/migrations/20260829235900_customer_subscription/migration.sql`.

No generic value ledger/workflow, runtime handler, raw provider payment
reference, historical backfill, certificate, billing, loyalty, referral, or
expense schema was added or changed.

## 3. Structural Verification

All database checks ran sequentially on a disposable local PostgreSQL
database.

| Check | Result |
|---|---|
| Targeted schema ratchet | PASS — 1 suite / 7 tests |
| Clean database migration replay | PASS — all 59 repository migrations |
| Historical term activation/end bindings | PASS — nullable with legacy source |
| Historical usage binding | PASS — nullable with legacy source |
| Cross-tenant activation execution | REJECTED by composite FK |
| Activation execution reused for another term | REJECTED by unique index |
| Term identity reused | REJECTED by unique index |
| Provider payment reused for another term | REJECTED by unique index |
| Established activation binding clear/replacement | REJECTED by DB trigger |
| Immutable price/plan/term facts changed | REJECTED by DB trigger |
| Second renewal from the same predecessor | REJECTED by unique index |
| Cross-tenant renewal predecessor | REJECTED by composite FK |
| Renewal moved to a different client | REJECTED by renewal guard |
| Active-to-terminal transition without execution | REJECTED by DB trigger |
| Terminal execution reused for another term | REJECTED by unique index |
| Established terminal binding clear/replacement | REJECTED by DB trigger |
| Terminal state changed again | REJECTED by DB trigger |
| One sync execution -> two distinct usage claims | PASS |
| Same usage claimed by another execution | REJECTED by unique index |
| Cross-tenant consumed subscription | REJECTED by composite FK |
| Cross-tenant usage execution | REJECTED by composite FK |
| Established usage binding clear/replacement | REJECTED by DB trigger |
| Immutable usage value changed | REJECTED by DB trigger |
| Usage above immutable allowance | REJECTED by locked capacity guard |
| Usage outside immutable term | REJECTED by capacity guard |
| Required tenant-qualified composite FKs | PASS — exactly 6 |
| Renewal/immutability/capacity guards | PASS — exactly 4 |
| Prisma schema validation | PASS |
| Targeted ESLint | PASS |
| Migrated database vs `schema.prisma` drift | NONE |
| `git diff --check` before report | PASS |
| Temporary structural/drift databases remaining | 0 |

Two fixture-calibration attempts stopped on existing Action Engine shape
ratchets before subscription assertions: approval requirement casing and an
unsupported synthetic source name. Only the disposable fixture was corrected;
the migration and existing kernel ratchets were not weakened. The final clean
replay and every structural assertion passed.

The full backend suite, full lint, typecheck, and build were intentionally not
run. No runtime TypeScript or scripts were changed; the added TypeScript is the
targeted structural Jest spec and compiled through the project test transform.

## 4. Safety Boundary

- The migration was applied only to disposable local databases and removed
  with them after verification.
- The migration was not applied to production or any persistent project
  database.
- No subscription bot/webhook/job, payment provider, Python database, AI tool,
  ingress, executor, scheduler, billing, certificate, or other runtime path was
  connected or modified.
- No subscription/value mutation or external side effect occurred.
- A08 payment write remains disabled.
- Package 5 and Chapter 7 were not started.

## 5. Checkpoint Verdict

`PACKAGE 4 SEVENTH SCHEMA FOUNDATION COMPLETE: YES`

`DOMAIN MODELS CREATED: CustomerSubscription, CustomerSubscriptionUsage`

`PREPAYMENT INITIATION GRANTS SUBSCRIPTION VALUE: NO`

`ACTIVATION EXECUTION TO TERM: ONE-TO-ONE`

`RENEWAL MUTATES PRIOR TERM: NO`

`PRIOR TERM TO RENEWAL TERM: ONE-TO-ZERO-OR-ONE`

`TERMINAL MUTATION EXECUTION TO TERM: ONE-TO-ONE`

`USAGE SYNC EXECUTION TO CLAIMS: ONE-TO-MANY`

`TENANT-QUALIFIED ACTION BINDINGS: YES`

`HISTORICAL NULL BINDINGS COMPATIBLE: YES`

`DUPLICATE ACTIVATION/RENEWAL: REJECTED`

`DUPLICATE USE THROUGH ANOTHER EXECUTION: REJECTED`

`ALLOWANCE OVERSPEND: REJECTED`

`ESTABLISHED BINDINGS IMMUTABLE AT DB LEVEL: YES`

`RAW PROVIDER PAYMENT REFERENCE STORED: NO`

`GENERIC VALUE WORKFLOW CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`PACKAGE 4 SCHEMA FOUNDATION STEPS REMAINING: 1`

`NEXT SCHEMA FOUNDATION: GIFT CERTIFICATE PLUS ONE-TIME REDEMPTION`

`A08 PAYMENT WRITE: DISABLED`

`EXTERNAL SUBSCRIPTION/VALUE SIDE EFFECTS: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
